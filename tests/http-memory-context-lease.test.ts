import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { createMemoryContextLeaseHttpHandler } from '../src/http/memory-context-lease.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import type { RuntimeServices } from '../src/runtime/services.js';
import { workflowScope } from '../src/mcp/workflow-guard.js';
import { createIsolatedRuntimeServices as createRuntimeServices, memoryAppConfig, memoryRoot, strictMemoryConfig } from './helpers/memory-fixture.js';

const roots: string[] = [];
const runtimes: RuntimeServices[] = [];
const servers: Server[] = [];
const loggers: FileAuditLogger[] = [];

async function fixture(label: string, mode: 'advisory' | 'enforce' = 'enforce', trustProxy = true) {
  const root = await memoryRoot(`http-context-lease-${label}`);
  roots.push(root);
  const config = await memoryAppConfig(root, {
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: mode,
    AGENT_CORE_TRUST_PROXY: trustProxy ? 'true' : 'false',
  });
  const runtime = createRuntimeServices(
    [root], path.join(root, 'capabilities'), undefined,
    { ...await strictMemoryConfig(root, { AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: mode }), enabled: true },
    { ...config.execution, enabled: false },
    config.github,
  );
  runtimes.push(runtime);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const logger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(logger);
  const server = createServer(createHttpHandler({
    keyStore,
    auditLogger: logger,
    security: new HttpSecurityPolicy(config.httpSecurity),
    mcpHandler: async (_request, response) => { response.writeHead(501).end(); },
    memoryContextLeaseHandler: createMemoryContextLeaseHttpHandler(runtime),
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { root, runtime, baseUrl, scope: { principalId: `principal-${label}`, projectId: root } };
}

async function post(baseUrl: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}/internal/memory-context-lease`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(loggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })));
});

describe('loopback Memory Context Lease control endpoint', () => {
  it('rejects proxied/public identity before lease processing', async () => {
    const f = await fixture('proxy');
    const result = await post(f.baseUrl, {
      action: 'before', toolName: 'write_file', workspaceRoot: f.root, lease: 'secret-token-must-not-echo', input: {},
    }, {
      'x-forwarded-for': '203.0.113.50',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'agent-core.example.test',
    });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: 'memory_context_lease_local_only' });
    expect(JSON.stringify(result.body)).not.toContain('secret-token-must-not-echo');
  });

  it('requires a lease for shell inspection of project state', async () => {
    const f = await fixture('read-only');
    const result = await post(f.baseUrl, {
      action: 'before', toolName: 'execute_command', workspaceRoot: f.root, input: { command: 'git status --short' },
    });
    expect(result.status).toBe(428);
    expect(JSON.stringify(result.body)).toContain('MEMORY_PREFLIGHT_REQUIRED');
  });

  it('rejects meaningful work without a lease in enforce mode and never echoes supplied tokens', async () => {
    const f = await fixture('missing');
    const missing = await post(f.baseUrl, {
      action: 'before', toolName: 'write_file', workspaceRoot: f.root, input: {},
    });
    expect(missing.status).toBe(428);
    expect(missing.body.error).toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });

    const invalid = await post(f.baseUrl, {
      action: 'before', toolName: 'write_file', workspaceRoot: f.root, lease: 'mcl1.invalid.invalid.invalid', input: {},
    });
    expect(invalid.status).toBe(428);
    expect(invalid.body.error).toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    expect(JSON.stringify(invalid.body)).not.toContain('mcl1.invalid.invalid.invalid');
  });

  it('permits a valid lease before mutation and marks POSTFLIGHT_PENDING only after successful completion', async () => {
    const f = await fixture('complete');
    const routeContextId = 'route-http-lease';
    const preflight = await f.runtime.memory.preflight({
      scope: f.scope,
      routeContextId,
      task: 'Direct bridge mutation with opaque lease',
      expiresAt: Date.now() + 60_000,
    });
    const turn=await f.runtime.memory.beginContinuityTurn(f.scope,routeContextId,'One atomic text operation',undefined,{},Date.now()+60000);
    await f.runtime.memory.bindLifecycleTask(f.scope,preflight.contextId,turn.taskId);
    await f.runtime.workflow.bind(workflowScope(f.runtime,f.scope.principalId,f.root,turn.taskId),{brief:'One atomic text operation'});
    const issued = await f.runtime.memory.issueContextLease({ scope: f.scope, contextId: preflight.contextId, routeContextId });

    const before = await post(f.baseUrl, {
      action: 'before', toolName: 'write_file', workspaceRoot: f.root, lease: issued.token, input: {},
    });
    expect(before.status).toBe(200);
    expect(before.body).toEqual({
      ok: true,
      mode: 'enforce',
      required: true,
      valid: true,
      mutationClass: 'agent_core_mutation',
    });
    expect(JSON.stringify(before.body)).not.toContain(issued.token);
    expect(await f.runtime.memory.getLifecycleContext(f.scope, preflight.contextId))
      .toMatchObject({ postflightState: 'OPEN', meaningfulWorkCount: 0 });

    const after = await post(f.baseUrl, {
      action: 'after', toolName: 'write_file', workspaceRoot: f.root, lease: issued.token, input: {},
    });
    expect(after.status).toBe(200);
    expect(after.body).toEqual({
      ok: true,
      mode: 'enforce',
      required: true,
      valid: true,
      mutationClass: 'agent_core_mutation',
      postflightState: 'POSTFLIGHT_PENDING',
    });
    expect(await f.runtime.memory.getLifecycleContext(f.scope, preflight.contextId))
      .toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1, lastToolName: 'write_file' });

    const secondAfter = await post(f.baseUrl, {
      action: 'after', toolName: 'edit_file', workspaceRoot: f.root, lease: issued.token, input: {},
    });
    expect(secondAfter.status).toBe(200);
    expect(secondAfter.body).toMatchObject({ valid: true, postflightState: 'POSTFLIGHT_PENDING' });
    expect(await f.runtime.memory.getLifecycleContext(f.scope, preflight.contextId))
      .toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 2, lastToolName: 'edit_file' });
  });

  it('does not let advisory memory mode bypass workflow authority', async () => {
    const f = await fixture('advisory', 'advisory');
    const result = await post(f.baseUrl, {
      action: 'before', toolName: 'write_file', workspaceRoot: f.root, input: {},
    });
    expect(result.status).toBe(428);
    expect(result.body.error.code).toBe('MEMORY_PREFLIGHT_REQUIRED');
  });
});
