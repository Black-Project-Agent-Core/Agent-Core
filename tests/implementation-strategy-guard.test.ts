import { randomUUID } from 'node:crypto';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { loadConfig, type MemoryHardLifecycleMode } from '../src/config.js';
import { classifyImplementationWork } from '../src/implementation/meaningful-work.js';
import type { RouteImplementationStrategyProjection } from '../src/runtime/route-context-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const loggers: FileAuditLogger[] = [];

function plan(allowedTools: string[]): RoutePlan {
  return {
    tier: 'structured', mode: 'capability_guided', domain: 'implementation', confidence: 1, risk: 'medium',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools,
    verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['strategy_guard_test'],
  };
}
async function setup(
  mode: 'disabled' | 'advisory' | 'enforce',
  memoryMode: MemoryHardLifecycleMode = 'disabled',
) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-strategy-${mode}-`));
  roots.push(root);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const principal = await keyStore.create(`principal-${mode}`);
  const defaults = loadConfig({
    AGENT_CORE_MEMORY_ENABLED: memoryMode === 'disabled' ? 'false' : 'true',
    AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: memoryMode,
  }, root);
  const logger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(logger);
  const runtime = createRuntimeServices(
    [root], path.join(root, 'capabilities'), logger,
    { ...defaults.memory, enabled: memoryMode !== 'disabled', dbPath: path.join(root, 'memory.sqlite') },
    { ...defaults.execution, enabled: false },
    defaults.github, undefined, defaults.observability, 'test', defaults.maintenance,
    { mode, leaseTtlMs: 5 * 60_000 },
  );
  runtimes.push(runtime);
  const server = createServer(createHttpHandler({
    keyStore,
    auditLogger: logger,
    mcpHandler: createMcpHttpHandler(runtime),
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return {
    root, runtime, logger, principal,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}
async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args } }),
  });
  return await response.json() as Record<string, any>;
}

function body(result: Record<string, any>): Record<string, any> {
  return JSON.parse(result.result.content[0].text);
}

function errorCode(result: Record<string, any>): string | undefined {
  return body(result).error?.code;
}

async function createRoute(
  runtime: RuntimeServices,
  principalId: string,
  root: string,
  withStrategy = false,
  withLease = false,
) {
  const projection: RouteImplementationStrategyProjection | undefined = withStrategy ? {
    strategyId: 'strategy:' + 'a'.repeat(32), mode: 'GREENFIELD',
    planFingerprint: 'b'.repeat(64), referenceSetFingerprint: 'c'.repeat(64), state: 'ready',
  } : undefined;
  let route = runtime.routes.create(principalId, plan(['read_file', 'write_file']), {
    projectId: root,
    ...(projection ? { implementationStrategy: projection } : {}),
  });  if (projection && withLease) {
    const lease = runtime.implementationStrategy.issueLease({
      principalId,
      projectId: root,
      routeContextId: route.routeContextId,
      strategy: projection,
      routeExpiresAt: Date.parse(route.expiresAt),
    });
    route = runtime.routes.updateImplementationStrategy(route.routeContextId, principalId, {
      leaseId: lease.leaseId,
    });
  }
  return route;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(loggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

describe('implementation-bearing work classification', () => {
  it('distinguishes source mutation, verification commands, docs, and reads structurally', () => {
    expect(classifyImplementationWork('write_file', { path: 'src/a.ts' }).required).toBe(true);
    expect(classifyImplementationWork('write_file', { path: 'docs/a.md' }).required).toBe(false);
    expect(classifyImplementationWork('execute_command', { command: 'npm test' }).mutationClass).toBe('verification_command');
    expect(classifyImplementationWork('read_file', { path: 'src/a.ts' }).required).toBe(false);
  });
});
describe('Agent Core implementation strategy mutation guard', () => {
  it('disabled mode preserves existing mutation behavior without strategy metadata', async () => {
    const f = await setup('disabled');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root);
    const target = path.join(f.root, 'src', 'disabled.ts');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: target, content: 'export const ok = true;\n', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).not.toBe(true);
    await expect(access(target)).resolves.toBeUndefined();
  });

  it('advisory mode allows would-block mutation and emits bounded audit evidence', async () => {
    const f = await setup('advisory');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root);
    const target = path.join(f.root, 'src', 'advisory.ts');
    const auditSpy = vi.spyOn(f.logger, 'logRuntime');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: target, content: 'export const ok = true;\n', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).not.toBe(true);
    expect(auditSpy).toHaveBeenCalledWith('implementation', 'strategy_advisory', expect.objectContaining({
      routeContextId: route.routeContextId,
      toolName: 'write_file',
      advisoryCode: 'IMPLEMENTATION_STRATEGY_REQUIRED',
    }));
  });
  it('enforce mode rejects source mutation before filesystem side effects without a valid lease', async () => {
    const f = await setup('enforce');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root);
    const target = path.join(f.root, 'src', 'blocked.ts');
    const spy = vi.spyOn(f.runtime.filesystem, 'writeFile');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: target, content: 'blocked\n', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).toBe(true);
    expect(errorCode(result)).toBe('IMPLEMENTATION_STRATEGY_REQUIRED');
    expect(spy).not.toHaveBeenCalled();
    await expect(access(target)).rejects.toThrow();
  });

  it('enforce mode accepts a ready scoped lease and marks source mutation started', async () => {
    const f = await setup('enforce');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root, true, true);
    const target = path.join(f.root, 'src', 'allowed.ts');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: target, content: 'export const allowed = true;\n', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).not.toBe(true);
    expect(f.runtime.routes.get(route.routeContextId)?.implementationStrategy?.state).toBe('mutation_started');
  });

  it('does not require strategy for a read-only operation even in enforce mode', async () => {
    const f = await setup('enforce');
    const source = path.join(f.root, 'existing.ts');
    await writeFile(source, 'export const value = 1;\n', 'utf8');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root);
    const result = await call(f.baseUrl, f.principal.key, 'read_file', {
      path: source, routeContextId: route.routeContextId,
    });
    expect(result.result.isError).not.toBe(true);
  });
  it('preserves memory hard-lifecycle as the first rejection authority', async () => {
    const f = await setup('enforce', 'enforce');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root);
    const target = path.join(f.root, 'src', 'memory-first.ts');
    const strategySpy = vi.spyOn(f.runtime.implementationStrategy, 'validateLease');
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: target, content: 'blocked\n', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).toBe(true);
    expect(errorCode(result)).toBe('MEMORY_PREFLIGHT_REQUIRED');
    expect(strategySpy).not.toHaveBeenCalled();
    await expect(access(target)).rejects.toThrow();
  });
});