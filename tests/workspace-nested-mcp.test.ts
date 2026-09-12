import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { workflowScope } from '../src/mcp/workflow-guard.js';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';
import type { MemoryContextLifecycleRecord } from '../src/memory/hard-lifecycle.js';
import type { RuntimeServices } from '../src/runtime/services.js';
import { createIsolatedRuntimeServices, isolatedMemoryDependencies, MEMORY_STATE, memoryStateRecords, scopedMemoryStateRecords, strictMemoryConfig } from './helpers/memory-fixture.js';

const fixtures: Array<{ container: string; runtime: RuntimeServices; server: Server; audit: FileAuditLogger }> = [];

async function fixture() {
  const container = await mkdtemp(path.join(tmpdir(), 'ac-nested-project-mcp-'));
  const root = path.join(container, 'agent-core');
  const child = path.join(root, 'reports', 'engineering', 'controller-fixture');
  const sibling = path.join(root, 'reports', 'engineering', 'sibling-fixture');
  const outside = path.join(container, 'outside');
  const target = path.join(child, 'src', 'counter.ts');
  const parentSource = path.join(root, 'src', 'parent.ts');
  const siblingSource = path.join(sibling, 'sibling.ts');
  const childReport = path.join(child, 'reports', 'prior.json');
  await Promise.all([
    mkdir(path.dirname(target), { recursive: true }),
    mkdir(path.dirname(parentSource), { recursive: true }),
    mkdir(path.dirname(childReport), { recursive: true }),
    mkdir(sibling, { recursive: true }),
    mkdir(outside, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(target, 'export function scopedCounter(value: number) { return value + 1; }\n'),
    writeFile(parentSource, 'export const scopedCounterParent = "parent-only";\n'),
    writeFile(siblingSource, 'export const scopedCounterSibling = "sibling-only";\n'),
    writeFile(childReport, '{"scopedCounterReport":"report-only"}\n'),
    writeFile(path.join(child, 'package.json'), '{"name":"nested-fixture","type":"module"}\n'),
  ]);
  const memory = await strictMemoryConfig(root, { AGENT_CORE_MEMORY_PRINCIPAL_ID: 'nested-project-test' });
  const defaults = loadConfig({}, root);
  const dependencies = isolatedMemoryDependencies(memory);
  const createRuntime = () => createIsolatedRuntimeServices(
    [root], path.join(root, 'capabilities'), undefined, memory,
    { ...defaults.execution, enabled: true, resourceGovernance: { ...defaults.execution.resourceGovernance, enabled: false } },
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, dependencies,
  );
  let runtime = createRuntime();
  await runtime.execution.open();
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const principal = await keyStore.create('nested-project-mcp');
  const stranger = await keyStore.create('nested-project-stranger');
  const audit = new FileAuditLogger(path.join(root, 'logs'));
  const createHttpServer = () => createServer(createHttpHandler({ keyStore, auditLogger: audit, mcpHandler: createMcpHttpHandler(runtime) }));
  let server = createHttpServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const tracked = { container, runtime, server, audit };
  fixtures.push(tracked);
  async function restart() {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await runtime.execution.close();
    await runtime.memory.close();
    runtime = createRuntime();
    await runtime.execution.open();
    server = createHttpServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    tracked.runtime = runtime;
    tracked.server = server;
  }
  async function call(name: string, args: Record<string, unknown>, apiKey = principal.key) {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    const raw = await response.json() as any;
    const text = raw.result?.content?.[0]?.text;
    const value = typeof text === 'string' ? JSON.parse(text) : raw;
    return { value, error: raw.result?.isError === true || Boolean(raw.error) };
  }
  return { root, child, sibling, outside, target, parentSource, siblingSource, childReport, get runtime() { return runtime; }, principal, stranger, memory, dependencies, call, restart };
}

function ok(result: { error: boolean; value: any }) {
  expect(result.error, JSON.stringify(result.value)).toBe(false);
  return result.value;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    f.server.closeAllConnections();
    await new Promise<void>(resolve => f.server.close(() => resolve()));
    await f.runtime.execution.close();
    await f.runtime.memory.close();
    await f.audit.close();
    // Only this test's mkdtemp container is owned by this fixture.
    await rm(f.container, { recursive: true, force: true });
  }
});

describe('explicit nested projects through authenticated MCP', () => {
  it('keeps workflow, discovery and memory on the requested child while the parent has its own open route', async () => {
    const f = await fixture();
    const parent = ok(await f.call('capability_route', { task: 'Inspect the parent project status', projectRoot: f.root }));
    const preflight = vi.spyOn(f.runtime.memory, 'preflight');
    const route = ok(await f.call('capability_route', {
      task: 'Fix the counter function in the nested fixture',
      context: `Use only ${f.child}; ${f.root} is its workspace ancestor, not the change target.`,
      projectRoot: f.child,
      workflow: 'dag',
    }));
    expect(route.projectId).toBe(f.child);
    expect(route.workflowContext).toMatchObject({ targetRoot: f.child, engineering: { policyVersion: 'engineering-v1', required: true } });
    expect(f.runtime.routes.get(route.routeContextId)?.projectId).toBe(f.child);
    expect(preflight).toHaveBeenCalledOnce();
    expect(preflight.mock.calls[0]![0].scope.projectId).toBe(f.child);

    const principalId = f.memory.principalId!;
    const childScope = { principalId, projectId: f.child };
    const parentScope = { principalId, projectId: f.root };
    expect(await f.runtime.memory.getContext(childScope, route.memoryContextId)).toMatchObject({ projectId: f.child });
    expect(await f.runtime.memory.getContext(parentScope, route.memoryContextId)).toBeNull();
    expect(await f.runtime.memory.getContext(parentScope, parent.memoryContextId)).toMatchObject({ projectId: 'agent-core://self' });
    expect(await f.runtime.memory.getContext(childScope, parent.memoryContextId)).toBeNull();
    expect(await f.runtime.memory.getContinuityTask(childScope, route.continuityTaskId)).toMatchObject({ projectId: f.child });
    expect(await f.runtime.memory.getContinuityTask(parentScope, route.continuityTaskId)).toBeNull();
    expect(await f.runtime.workflow.store.read(workflowScope(f.runtime, principalId, f.root, route.continuityTaskId))).toBeNull();

    const discovery = ok(await f.call('craft_source', { routeContextId: route.routeContextId, operation: 'discover', query: 'scopedCounter' }));
    expect(discovery.receipt.kind).toBe('discovery');
    const data = discovery.receipt.data;
    expect(data.inventory.root).toBe(f.child);
    expect(data.coverage).toMatchObject({ complete: true, truncated: false, gaps: [] });
    expect(data.matches.map((match: { path: string }) => match.path)).toEqual([f.target]);
    expect(data.coverage.exclusions).toContain('reports');
    expect(data.inventory.entries.map((entry: { path: string }) => entry.path)).toEqual(expect.arrayContaining([f.target, path.join(f.child, 'package.json')]));
    for (const excludedPath of [f.parentSource, f.siblingSource, f.childReport]) {
      expect(data.inventory.entries.map((entry: { path: string }) => entry.path)).not.toContain(excludedPath);
    }
    const read = ok(await f.call('craft_source', { routeContextId: route.routeContextId, operation: 'read', role: 'target', path: f.target }));
    expect(read).toMatchObject({ source: f.child, path: f.target, content: expect.stringContaining('export function scopedCounter'), receipt: { complete: true } });
    for (const deniedPath of [f.parentSource, f.siblingSource]) {
      const denied = await f.call('craft_source', { routeContextId: route.routeContextId, operation: 'read', role: 'target', path: deniedPath });
      expect(denied.error).toBe(true);
      expect(denied.value.error.code).toBe('WORKFLOW_SOURCE_PATH_ESCAPE');
      const readDenied = await f.call('read_file', { routeContextId: route.routeContextId, path: deniedPath });
      expect(readDenied.error).toBe(true);
      expect(readDenied.value.error.code).toBe('ROUTE_PROJECT_MISMATCH');
    }
    const childStatus = ok(await f.call('workflow_status', { taskId: route.continuityTaskId, projectRoot: f.child }));
    expect(childStatus).toMatchObject({ projectId: f.child, targetRoot: f.child, taskId: route.continuityTaskId });
    expect(ok(await f.call('workflow_status', { taskId: route.continuityTaskId, projectRoot: f.root }))).toBeNull();
  }, 30_000);

  it('rejects invalid nested roots before reserving routes or creating memory and continuity state', async () => {
    const f = await fixture();
    const escape = path.join(f.child, 'linked-outside');
    await symlink(f.outside, escape, process.platform === 'win32' ? 'junction' : 'dir');
    const reserve = vi.spyOn(f.runtime.routes, 'reserve');
    const preflight = vi.spyOn(f.runtime.memory, 'preflight');
    const reconcile = vi.spyOn(f.runtime.memory, 'reconcileContinuity');
    const beginTurn = vi.spyOn(f.runtime.memory, 'beginContinuityTurn');
    const bind = vi.spyOn(f.runtime.workflow, 'bind');
    for (const invalidRoot of [f.target, path.join(f.child, 'missing'), f.outside, escape]) {
      const response = await f.call('capability_route', { task: 'Fix the nested counter function', projectRoot: invalidRoot });
      expect(response.error, JSON.stringify(response.value)).toBe(true);
      expect(response.value.error.code).toBe('WORKSPACE_PROJECT_NOT_ALLOWED');
      expect(reserve).not.toHaveBeenCalled();
      expect(preflight).not.toHaveBeenCalled();
      expect(reconcile).not.toHaveBeenCalled();
      expect(beginTurn).not.toHaveBeenCalled();
      expect(bind).not.toHaveBeenCalled();
    }
    for (const category of [MEMORY_STATE.contexts, MEMORY_STATE.lifecycles, MEMORY_STATE.tasks, MEMORY_STATE.turns]) {
      expect(await memoryStateRecords(f.memory.fileNative.vaultRoot, category)).toEqual([]);
    }
  });

  it.each([
    ['task_checkpoint', 'restart'], ['task_checkpoint', 'expired-route'],
    ['memory_turn_finalize', 'restart'], ['memory_turn_finalize', 'expired-route'],
  ] as const)('recovers only the child %s receipt after %s without granting a replacement route', async (tool, recovery) => {
    const f = await fixture();
    const route = ok(await f.call('capability_route', {
      task: tool === 'task_checkpoint' ? 'Fix the nested counter function' : 'Inspect the nested project status',
      projectRoot: f.child,
    }));
    const scope = { principalId: f.memory.principalId!, projectId: f.child };
    const args = tool === 'task_checkpoint'
      ? { routeContextId: route.routeContextId, status: 'interrupted',
        summary: 'Only preflight was performed; source work remains pending.',
        memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'No implementation or lasting knowledge was produced.' } }
      : { routeContextId: route.routeContextId, reasonCodes: ['TRANSIENT_OPERATION'], evidenceRefs: [] };
    expect(await f.runtime.memory.getLifecycleContext(scope, route.memoryContextId)).toMatchObject({
      projectId: f.child, principalId: f.memory.principalId, authorityPrincipalId: f.principal.metadata.id,
    });
    f.dependencies.supabaseDirectTransport.offline = true;
    const failed = await f.call(tool, args);
    expect(failed.error, JSON.stringify(failed.value)).toBe(true);
    expect(failed.value.error.code).toBe('MEMORY_POSTFLIGHT_REQUIRED');
    const priorDecisions = await scopedMemoryStateRecords<{ id: string }>(f.memory.fileNative, MEMORY_STATE.writeDecisions, scope);
    expect(priorDecisions).toHaveLength(1);
    const aux = new FileNativeAuxStore(f.memory.fileNative);
    const persisted = (await aux.get<MemoryContextLifecycleRecord>(MEMORY_STATE.lifecycles, route.memoryContextId))!;
    await aux.put(MEMORY_STATE.lifecycles, route.memoryContextId, { ...persisted, expiresAt: Date.now() - 1 });
    if (recovery === 'restart') await f.restart();
    else vi.spyOn(f.runtime.routes as any, 'now').mockReturnValue(Date.now() + 2 * 60 * 60_000);
    const reserve = vi.spyOn(f.runtime.routes, 'reserve');
    const preflight = vi.spyOn(f.runtime.memory, 'preflight');
    const beginTurn = vi.spyOn(f.runtime.memory, 'beginContinuityTurn');
    for (const attemptedTool of ['task_checkpoint', 'memory_turn_finalize']) {
      const strangerArgs = attemptedTool === 'task_checkpoint'
        ? { routeContextId: route.routeContextId, status: 'interrupted', summary: 'Not the original authority', memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'No knowledge' } }
        : { routeContextId: route.routeContextId, reasonCodes: ['TRANSIENT_OPERATION'], evidenceRefs: [] };
      const stranger = await f.call(attemptedTool, strangerArgs, f.stranger.key);
      expect(stranger.error).toBe(true);
      expect(stranger.value.error.code).toBe('ROUTE_NOT_FOUND');
    }
    const pending = await f.call(tool, args);
    expect(pending.error).toBe(true);
    expect(pending.value.error.code).toBe('MEMORY_POSTFLIGHT_REQUIRED');
    f.dependencies.supabaseDirectTransport.offline = false;
    const closed = ok(await f.call(tool, args));
    expect(closed.memoryLifecycle.postflightState).toBe('CLOSED');
    expect(closed.remoteDurability).toMatchObject({ required: true, state: 'REMOTE_SYNCED' });
    const repeated = ok(await f.call(tool, args));
    if (tool === 'task_checkpoint') {
      expect(closed.memoryLifecycle.durabilityState).toBe('DURABLY_CLOSED');
      expect(repeated.checkpointId).toBe(closed.checkpointId);
      expect(closed.writeDecisionIds).toEqual([priorDecisions[0]!.id]);
      expect(await f.runtime.memory.getContinuityTask(scope, route.continuityTaskId)).toMatchObject({ status: 'interrupted', projectId: f.child });
      expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.checkpoints, scope)).toHaveLength(1);
    } else {
      expect(repeated.decisionRecordId).toBe(priorDecisions[0]!.id);
      expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.checkpoints, scope)).toHaveLength(0);
    }
    expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.writeDecisions, scope)).toHaveLength(1);
    expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.writeDecisions, { ...scope, projectId: f.root })).toHaveLength(0);
    expect(await f.runtime.memory.getLifecycleContext(scope, route.memoryContextId)).toMatchObject({ projectId: f.child, postflightState: 'CLOSED' });
    expect(f.runtime.routes.get(route.routeContextId)).toBeNull();
    expect(reserve).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
    expect(beginTurn).not.toHaveBeenCalled();
    const denied = await f.call('read_file', { routeContextId: route.routeContextId, path: f.target });
    expect(denied.error).toBe(true);
    expect(denied.value.error.code).toBe('ROUTE_NOT_FOUND');
    const workflow = await f.runtime.workflow.status(workflowScope(f.runtime, scope.principalId, f.child, route.continuityTaskId));
    expect(workflow).toMatchObject({ targetRoot: f.child, projectId: f.child });
    expect(workflow?.phase).not.toBe('CLOSED');
  }, 30_000);

  it('keeps lifecycle lookup exact by default and limits opted-in descendants to authenticated filesystem scopes', async () => {
    const f = await fixture();
    const route = ok(await f.call('capability_route', { task: 'Inspect nested project status', projectRoot: f.child }));
    const query = { principalId: f.memory.principalId!, authorityPrincipalId: f.principal.metadata.id,
      projectIds: [f.root], routeContextId: route.routeContextId };
    expect(await f.runtime.memory.findLifecycleByRoute(query)).toBeNull();
    const recovered = await f.runtime.memory.findLifecycleByRoute({ ...query, includeDescendantProjects: true });
    expect(recovered).toMatchObject({ projectId: f.child, contextId: route.memoryContextId });
    expect(await f.runtime.memory.findLifecycleByRoute({ ...query, projectIds: [f.child] })).toMatchObject({ projectId: f.child });
    expect(await f.runtime.memory.findLifecycleByRoute({ ...query, includeDescendantProjects: true, authorityPrincipalId: f.stranger.metadata.id })).toBeNull();
    expect(await f.runtime.memory.findLifecycleByRoute({ ...query, includeDescendantProjects: true, principalId: 'different-memory-principal' })).toBeNull();
    expect(await f.runtime.memory.findLifecycleByRoute({ ...query, includeDescendantProjects: true, projectIds: [f.sibling] })).toBeNull();
    expect(await f.runtime.memory.findLifecycleByRoute({ ...query, includeDescendantProjects: true, projectIds: ['agent-core://self'] })).toBeNull();
    const aux = new FileNativeAuxStore(f.memory.fileNative);
    for (const projectId of [`${f.root}-outside`, f.outside, 'tenant/project', 'agent-core://self/child', `https://example.test/${f.root}`]) {
      const record = { ...recovered!, projectId, contextId: randomUUID(), routeContextId: randomUUID() };
      await aux.put(MEMORY_STATE.lifecycles, record.contextId, record);
      expect(await f.runtime.memory.findLifecycleByRoute({ ...query, routeContextId: record.routeContextId, includeDescendantProjects: true })).toBeNull();
    }
    const logical = { ...recovered!, projectId: 'tenant/project', contextId: randomUUID(), routeContextId: randomUUID() };
    await aux.put(MEMORY_STATE.lifecycles, logical.contextId, logical);
    expect(await f.runtime.memory.findLifecycleByRoute({ ...query, routeContextId: logical.routeContextId, projectIds: ['tenant/project'] })).toMatchObject({ projectId: 'tenant/project' });
    expect(await f.runtime.memory.findLifecycleByRoute({ ...query, routeContextId: logical.routeContextId, projectIds: ['tenant'], includeDescendantProjects: true })).toBeNull();
  });
});
