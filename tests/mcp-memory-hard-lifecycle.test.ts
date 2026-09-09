import { randomUUID } from 'node:crypto';
import { access, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { loadConfig, type MemoryHardLifecycleMode } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import type { RuntimeServices } from '../src/runtime/services.js';
import { workflowScope } from '../src/mcp/workflow-guard.js';
import {
  createIsolatedRuntimeServices as createRuntimeServices,
  MEMORY_STATE, strictMemoryConfig, memoryRoot, memoryStateRecords, patchMemoryStateRecord,
} from './helpers/memory-fixture.js';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const loggers: FileAuditLogger[] = [];

function plan(allowedTools: string[]): RoutePlan {
  return {
    tier: 'task_scoped', mode: 'atomic_direct', domain: 'general', confidence: 1, risk: 'low',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools,
    verification: { required: false, suggestedTools: [] }, reasonCodes: ['hard_lifecycle_test'],
  };
}

async function setup(mode: MemoryHardLifecycleMode, memoryEnabled = true, executionEnabled = false) {
  const root = await memoryRoot(`mcp-hard-lifecycle-${mode}`);
  roots.push(root);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const principal = await keyStore.create(`principal-${mode}`);
  const defaults = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: mode }, root);
  const memory = await strictMemoryConfig(root, { AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: mode });
  const runtime = createRuntimeServices(
    [root], path.join(root, 'capabilities'), undefined,
    { ...memory, enabled: memoryEnabled },
    { ...defaults.execution, enabled: executionEnabled },
    defaults.github,
  );
  runtimes.push(runtime);
  const logger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(logger);
  const server = createServer(createHttpHandler({
    keyStore,
    auditLogger: logger,
    mcpHandler: createMcpHttpHandler(runtime),
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return {
    root,
    vaultRoot: memory.fileNative.vaultRoot,
    runtime,
    principal,
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
  allowedTools: string[],
  options: { preflight?: boolean; expiresAt?: number } = {},
) {
  const reservation = runtime.routes.reserve();
  let memorySnapshot;
  if (options.preflight) {
    const preflight = await runtime.memory.preflight({
      scope: { principalId, projectId: root },
      routeContextId: reservation.routeContextId,
      task: 'Perform hard lifecycle integration fixture work',
      context: 'Exact project-scoped preflight',
      expiresAt: options.expiresAt ?? Date.parse(reservation.expiresAt),
    });
    memorySnapshot = {
      memoryContextId: preflight.contextId,
      memorySnapshotHash: preflight.snapshotHash,
      blockingGuardrailMemoryIds: [],
      blockingGuardrails: [],
      enforceHardGuardrails: false,
    };
  }
  const turn=runtime.memory.config.enabled?await runtime.memory.beginContinuityTurn({principalId,projectId:root},reservation.routeContextId,'Perform one atomic fixture operation',undefined,{},Date.parse(reservation.expiresAt)):undefined;
  if(turn&&memorySnapshot)await runtime.memory.bindLifecycleTask({principalId,projectId:root},memorySnapshot.memoryContextId,turn.taskId);
  const workflow = await runtime.workflow.bind(workflowScope(runtime, principalId, root, turn?.taskId??reservation.routeContextId), { brief: 'Perform one atomic fixture operation' });
  return runtime.routes.create(principalId, plan(allowedTools), {
    reservation,
    projectId: root,
    workflow: { taskId: workflow.taskId, version: workflow.version, craftRequired: workflow.craftRequired, dagRequired: workflow.dagRequired },
    ...(memorySnapshot ? { memorySnapshot } : {}),
  });
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

describe('Agent Core hard memory lifecycle mutation guard', () => {
  it('enforce mode rejects meaningful mutation without persisted preflight before filesystem work', async () => {
    const f = await setup('enforce');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['write_file']);
    const target = path.join(f.root, 'must-not-write.txt');
    const spy = vi.spyOn(f.runtime.filesystem, 'writeFile');

    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: target, content: 'blocked', routeContextId: route.routeContextId,
    });

    expect(result.result.isError).toBe(true);
    expect(errorCode(result)).toBe('MEMORY_PREFLIGHT_REQUIRED');
    expect(spy).not.toHaveBeenCalled();
    await expect(access(target)).rejects.toThrow();
  });

  it('valid OPEN preflight allows a successful mutation and transitions it to POSTFLIGHT_PENDING', async () => {
    const f = await setup('enforce');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['write_file'], { preflight: true });
    const contextId = route.memorySnapshot!.memoryContextId;

    const first = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'first.txt'), content: 'one', routeContextId: route.routeContextId,
    });
    expect(first.result.isError).not.toBe(true);
    expect(await f.runtime.memory.getLifecycleContext({ principalId: f.principal.metadata.id, projectId: f.root }, contextId))
      .toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1, lastToolName: 'write_file' });

    const second = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'second.txt'), content: 'two', routeContextId: route.routeContextId,
    });
    expect(second.result.isError).not.toBe(true);
    expect(await f.runtime.memory.getLifecycleContext({ principalId: f.principal.metadata.id, projectId: f.root }, contextId))
      .toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 2 });
  });

  it('expired persisted preflight is predictably rejected', async () => {
    const f = await setup('enforce');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['write_file'], {
      preflight: true,
    });
    // The lifecycle record is a JSON file in the vault; expiring it means rewriting that file.
    await patchMemoryStateRecord(f.vaultRoot, MEMORY_STATE.lifecycles, route.memorySnapshot!.memoryContextId, {
      expiresAt: Date.now() - 1,
    });
    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'expired.txt'), content: 'blocked', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).toBe(true);
    expect(errorCode(result)).toBe('MEMORY_PREFLIGHT_REQUIRED');
  });

  it('a failed underlying mutation does not fabricate successful meaningful work', async () => {
    const f = await setup('enforce');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['write_file'], { preflight: true });
    const contextId = route.memorySnapshot!.memoryContextId;
    vi.spyOn(f.runtime.filesystem, 'writeFile').mockRejectedValueOnce(new Error('fixture write failure'));

    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'fails.txt'), content: 'x', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).toBe(true);
    expect(await f.runtime.memory.getLifecycleContext({ principalId: f.principal.metadata.id, projectId: f.root }, contextId))
      .toMatchObject({ postflightState: 'OPEN', meaningfulWorkCount: 0 });
  });

  it('advisory mode allows a would-block mutation while disabled mode preserves pre-Phase-6 behavior', async () => {
    const advisory = await setup('advisory');
    const advisoryRoute = await createRoute(advisory.runtime, advisory.principal.metadata.id, advisory.root, ['write_file']);
    const advisoryTarget = path.join(advisory.root, 'advisory.txt');
    const advisoryResult = await call(advisory.baseUrl, advisory.principal.key, 'write_file', {
      path: advisoryTarget, content: 'allowed', routeContextId: advisoryRoute.routeContextId,
    });
    expect(advisoryResult.result.isError).not.toBe(true);
    await expect(access(advisoryTarget)).resolves.toBeUndefined();
    const advisoryEvents = await memoryStateRecords<{ eventType: string; createdAt?: number }>(advisory.vaultRoot, MEMORY_STATE.events);
    expect(advisoryEvents.filter((event) => event.eventType === 'memory.lifecycle_advisory')).toHaveLength(1);

    const disabled = await setup('disabled', false);
    const disabledRoute = await createRoute(disabled.runtime, disabled.principal.metadata.id, disabled.root, ['write_file']);
    const disabledTarget = path.join(disabled.root, 'disabled.txt');
    const disabledResult = await call(disabled.baseUrl, disabled.principal.key, 'write_file', {
      path: disabledTarget, content: 'allowed', routeContextId: disabledRoute.routeContextId,
    });
    expect(disabledResult.result.isError).not.toBe(true);
    await expect(access(disabledTarget)).resolves.toBeUndefined();
  });

  it('does not fabricate compliance when a formerly valid MemoryService is no longer available', async () => {
    const f = await setup('enforce');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['write_file'], { preflight: true });
    const spy = vi.spyOn(f.runtime.filesystem, 'writeFile');
    await f.runtime.memory.close();

    const result = await call(f.baseUrl, f.principal.key, 'write_file', {
      path: path.join(f.root, 'closed-memory.txt'), content: 'blocked', routeContextId: route.routeContextId,
    });
    expect(result.result.isError).toBe(true);
    expect(errorCode(result)).toBe('MEMORY_PREFLIGHT_REQUIRED');
    expect(spy).not.toHaveBeenCalled();
  });

  it('applies the same preflight enforcement before execution mutations', async () => {
    const f = await setup('enforce', true, true);
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['execution_create']);
    const createSpy = vi.spyOn(f.runtime.execution, 'create');

    const result = await call(f.baseUrl, f.principal.key, 'execution_create', {
      routeContextId: route.routeContextId,
      objective: 'must be blocked before execution state mutates',
      nodes: [{ id: 'n1', purpose: 'fixture', command: 'echo fixture', cwd: f.root }],
    });
    expect(result.result.isError).toBe(true);
    expect(errorCode(result)).toBe('MEMORY_PREFLIGHT_REQUIRED');
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('requires preflight for GitHub mutations and substantive reads', async () => {
    const f = await setup('enforce');
    const mutationRoute = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['github_repo']);
    const repoSpy = vi.spyOn(f.runtime.github, 'repo');
    const mutation = await call(f.baseUrl, f.principal.key, 'github_repo', {
      operation: 'create', repo: 'must-not-run', routeContextId: mutationRoute.routeContextId,
    });
    expect(mutation.result.isError).toBe(true);
    expect(errorCode(mutation)).toBe('MEMORY_PREFLIGHT_REQUIRED');
    expect(repoSpy).not.toHaveBeenCalled();

    const readRoute = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['github_repo']);
    const read = await call(f.baseUrl, f.principal.key, 'github_repo', {
      operation: 'get', owner: 'octo', repo: 'demo', routeContextId: readRoute.routeContextId,
    });
    expect(read.result.isError).toBe(true);
    expect(errorCode(read)).toBe('MEMORY_PREFLIGHT_REQUIRED');
    expect(repoSpy).not.toHaveBeenCalled();
  });

  it('requires preflight before reading workspace content in enforce mode', async () => {
    const f = await setup('enforce');
    const target = path.join(f.root, 'readable.txt');
    await writeFile(target, 'read-only remains available', 'utf8');
    const route = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['read_file']);
    const result = await call(f.baseUrl, f.principal.key, 'read_file', {
      path: target, routeContextId: route.routeContextId,
    });
    expect(result.result.isError).toBe(true);
    expect(errorCode(result)).toBe('MEMORY_PREFLIGHT_REQUIRED');
    expect(JSON.stringify(result)).not.toContain('read-only remains available');
    const recalledRoute = await createRoute(f.runtime, f.principal.metadata.id, f.root, ['read_file'], { preflight: true });
    const permitted = await call(f.baseUrl, f.principal.key, 'read_file', { path: target, routeContextId: recalledRoute.routeContextId });
    expect(permitted.result.isError).not.toBe(true);
    expect(JSON.stringify(permitted)).toContain('read-only remains available');
    expect(await f.runtime.memory.getLifecycleContext(
      { principalId: f.principal.metadata.id, projectId: f.root }, recalledRoute.memorySnapshot!.memoryContextId,
    )).toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1 });
  });
});
