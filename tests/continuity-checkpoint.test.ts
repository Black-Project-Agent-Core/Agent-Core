import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import type { RuntimeServices } from '../src/runtime/services.js';
import type { FileNativeMemoryBackend } from '../src/memory/file-native/backend.js';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';
import {
  createIsolatedRuntimeServices as createRuntimeServices, MEMORY_STATE, memoryConfig, strictMemoryConfig, isolatedMemoryDependencies, memoryRoot, scopedMemoryStateRecords,
} from './helpers/memory-fixture.js';
import { nodeShellCommand, printCommand } from './helpers/platform-command.js';

interface TurnRecord { turnId: string; state: string }
interface CheckpointRecord { checkpointId: string; input: Record<string, unknown> & { evidence?: unknown[] } }
interface WriteDecisionRecord { id: string; decisionType: string; targetMemoryId?: string; appliedAt?: number; reasonCodes: string[] }

const auditLoggers: FileAuditLogger[] = [];
function createAuditLogger(logDir: string): FileAuditLogger {
  const logger = new FileAuditLogger(logDir);
  auditLoggers.push(logger);
  return logger;
}

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];

async function fixture(label: string, logicalPrincipal?: string) {
  const root = await memoryRoot(`continuity-checkpoint-${label}`);
  roots.push(root);
  const memory = logicalPrincipal
    ? await strictMemoryConfig(root, { AGENT_CORE_MEMORY_PRINCIPAL_ID: logicalPrincipal })
    : await memoryConfig(root);
  const dependencies = isolatedMemoryDependencies(memory);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const principalA = await keyStore.create(`checkpoint-a-${label}`);
  const principalB = await keyStore.create(`checkpoint-b-${label}`);
  const start = async () => {
    const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, memory,
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, dependencies);
    runtimes.push(runtime);
    const server = createServer(createHttpHandler({ keyStore,
      auditLogger: createAuditLogger(path.join(root, 'logs')),
      mcpHandler: createMcpHttpHandler(runtime),
    }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    return { runtime, backend: (runtime.memory as unknown as { fileNative: FileNativeMemoryBackend }).fileNative,
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  };
  return { ...await start(), root, memory, dependencies, start, principalA, principalB,
    scopeA: { principalId: logicalPrincipal ?? principalA.metadata.id, projectId: root } };
}

async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 81, method: 'tools/call', params: { name, arguments: args } }),
  });
  const raw = await response.json() as Record<string, any>;
  const text = String(raw.result.content[0].text);
  let result: Record<string, any>;
  try {
    result = JSON.parse(text) as Record<string, any>;
  } catch {
    result = { error: { code: 'MCP_ERROR', message: text } };
  }
  return { raw, result };
}

async function listTools(baseUrl: string, key: string) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 82, method: 'tools/list', params: {} }),
  });
  return await response.json() as Record<string, any>;
}

async function route(f: Awaited<ReturnType<typeof fixture>>, objective: string) {
  const routed = await call(f.baseUrl, f.principalA.key, 'capability_route', {
    task: objective,
    continuity: { objective },
  });
  expect(routed.raw.result.isError).not.toBe(true);
  expect(routed.result.continuityStatus).toBe('healthy');
  return routed.result;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(auditLoggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('continuity checkpoint MCP tools', () => {
  it.each(['restart', 'expired-route'] as const)('recovers only the authenticated checkpoint after %s with a separate logical memory principal', async (recovery) => {
    const f = await fixture(`scoped-${recovery}`, 'shared-logical-memory');
    const routed = await route(f, 'Close already verified work after an interruption');
    const args = { routeContextId: routed.routeContextId, status: 'completed', projectTerminal: true,
      summary: 'The isolated repair succeeded before the remote interruption.',
      decisions: [{ key: 'checkpoint-recovery', value: 'Replay the persisted receipt.', reason: 'Previously successful work must not execute again.' }],
      evidence: [{ type: 'test', ref: 'test:isolated-checkpoint-recovery', result: 'passed' }],
    };
    const initialLifecycle = await f.runtime.memory.getLifecycleContext(f.scopeA, routed.memoryContextId);
    expect(initialLifecycle).toMatchObject({ principalId: 'shared-logical-memory', authorityPrincipalId: f.principalA.metadata.id });
    f.dependencies.supabaseDirectTransport.offline = true;
    const failed = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', args);
    expect(failed.raw.result.isError).toBe(true);
    expect(failed.result.error.code).toBe('MEMORY_POSTFLIGHT_REQUIRED');
    const prior = await scopedMemoryStateRecords<WriteDecisionRecord>(f.memory.fileNative, MEMORY_STATE.writeDecisions, f.scopeA);
    expect(prior).toHaveLength(1);
    const aux = new FileNativeAuxStore(f.memory.fileNative);
    const persisted = await aux.get<any>('lifecycles', routed.memoryContextId);
    await aux.put('lifecycles', routed.memoryContextId, { ...persisted, expiresAt: Date.now() - 1 });
    let current = { runtime: f.runtime, baseUrl: f.baseUrl };
    if (recovery === 'restart') {
      await f.runtime.execution.close(); await f.runtime.memory.close();
      current = await f.start();
    } else {
      vi.spyOn(f.runtime.routes as any, 'now').mockReturnValue(Date.now() + 2 * 60 * 60_000);
    }
    const stranger = await call(current.baseUrl, f.principalB.key, 'task_checkpoint', args);
    expect(stranger.raw.result.isError).toBe(true);
    expect(stranger.result.error.code).toBe('ROUTE_NOT_FOUND');
    const strangerFinalize = await call(current.baseUrl, f.principalB.key, 'memory_turn_finalize', {
      routeContextId: routed.routeContextId, reasonCodes: ['TRANSIENT_OPERATION'], evidenceRefs: [],
    });
    expect(strangerFinalize.raw.result.isError).toBe(true);
    expect(strangerFinalize.result.error.code).toBe('ROUTE_NOT_FOUND');
    const unknown = await call(current.baseUrl, f.principalA.key, 'task_checkpoint', { ...args, routeContextId: randomUUID() });
    expect(unknown.result.error.code).toBe('ROUTE_NOT_FOUND');
    const stillPending = await call(current.baseUrl, f.principalA.key, 'task_checkpoint', args);
    expect(stillPending.result.error.code).toBe('MEMORY_POSTFLIGHT_REQUIRED');
    f.dependencies.supabaseDirectTransport.offline = false;
    const completed = await call(current.baseUrl, f.principalA.key, 'task_checkpoint', args);
    expect(completed.raw.result.isError).not.toBe(true);
    expect(completed.result.memoryLifecycle).toMatchObject({ postflightState: 'CLOSED', durabilityState: 'DURABLY_CLOSED' });
    expect(completed.result.writeDecisionIds).toEqual([prior[0]!.id]);
    expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.checkpoints, f.scopeA)).toHaveLength(1);
    expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.writeDecisions, f.scopeA)).toHaveLength(1);
    const repeated = await call(current.baseUrl, f.principalA.key, 'task_checkpoint', args);
    expect(repeated.result.checkpointId).toBe(completed.result.checkpointId);
    expect(current.runtime.routes.get(routed.routeContextId)).toBeNull();
    await expect(current.runtime.memory.validateLifecycleContext({ scope: f.scopeA, contextId: routed.memoryContextId, routeContextId: routed.routeContextId }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
  });

  it('checks active execution under the authenticated key when memory has a different logical principal', async () => {
    const f = await fixture('logical-principal-execution', 'shared-logical-memory');
    const routed = await route(f, 'Keep active execution distinct from durable memory ownership');
    const executionScope = { principalId: f.principalA.metadata.id, projectId: f.root };
    await f.runtime.execution.open();
    const active = await f.runtime.execution.create(executionScope, { objective: 'Planned work remains active',
      continuityTaskId: routed.continuityTaskId, originRouteContextId: routed.routeContextId,
      nodes: [{ id: 'A', purpose: 'pending work', command: printCommand('pending'), cwd: f.root, inputs: [] }],
    });
    const denied = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId, status: 'completed', summary: 'Active work cannot be declared complete.',
      evidence: [{ type: 'tool', ref: `execution:${active.runId}`, result: 'verified' }], projectTerminal: true,
    });
    expect(denied.raw.result.isError).toBe(true);
    expect(denied.result.error.code).toBe('CONTINUITY_EXECUTION_ACTIVE');
    expect((await f.runtime.memory.getContinuityTask(f.scopeA, routed.continuityTaskId))?.status).toBe('running');
    expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.checkpoints, f.scopeA)).toEqual([]);
  });

  it('registers four first-class continuity tools inside the 72-tool surface with execution fabric', async () => {
    const f = await fixture('surface');
    const listed = await listTools(f.baseUrl, f.principalA.key);
    const names = listed.result.tools.map((tool: any) => tool.name);
    expect(names).toHaveLength(72);
    for (const name of ['task_checkpoint', 'continuity_status', 'continuity_get_task', 'continuity_frontier']) {
      expect(names).toContain(name);
    }
  });

  it('rejects terminal checkpoint without required frontier and leaves the task + turn unchanged', async () => {
    const f = await fixture('invalid-terminal');
    const routed = await route(f, 'Checkpoint validation task');

    const invalid = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId,
      status: 'completed',
      summary: 'Completed but missing frontier.',
    });
    expect(invalid.raw.result.isError).toBe(true);
    expect(invalid.result.error.code).toBe('CONTINUITY_FRONTIER_REQUIRED');

    const task = await f.runtime.memory.getContinuityTask(f.scopeA, routed.continuityTaskId);
    expect(task?.status).toBe('running');
    const turns = await scopedMemoryStateRecords<TurnRecord>(f.memory.fileNative, MEMORY_STATE.turns, f.scopeA);
    expect(turns.find((turn) => turn.turnId === routed.continuityTurnId)?.state).toBe('open');
    expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.checkpoints, f.scopeA)).toHaveLength(0);
    expect(await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.frontier, f.scopeA)).toHaveLength(0);
  });

  it('persists terminal evidence/frontier, promotes decision+artifact memories, and closes the turn only after checkpoint success', async () => {
    const f = await fixture('complete');
    const routed = await route(f, 'Complete checkpoint task');

    const completed = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId,
      status: 'completed',
      summary: 'Task completed with verified evidence.',
      evidence: [
        { type: 'test', ref: 'tests/example.test.ts', result: 'PASS' },
        { type: 'hash', ref: 'artifact.sha256', result: 'abc123' },
      ],
      decisions: [{ key: 'execution.mode', value: 'deterministic', reason: 'Evidence must be reproducible.' }],
      artifacts: [{ path: 'F:\\Projects\\Agent-Core\\docs\\result.md', role: 'result', hash: 'abc123' }],
      outcomes: [{
        key: 'build.result',
        value: 'Build verified locally with factual evidence.',
        evidenceRefs: ['tests/example.test.ts', 'artifact.sha256'],
      }],
      constraints: [{
        key: 'release.ci',
        value: 'Never use GitHub Actions or CI for this project.',
        reason: 'Local verification is authoritative.',
        enforcement: 'hard',
      }],
      deferred: [{ title: 'Later enhancement', reason: 'Outside current task.' }],
      nextCandidates: [
        { title: 'Candidate A', rationale: 'Next independent step.', priority: 2 },
        { title: 'Candidate B', rationale: 'Alternative next step.', priority: 1 },
      ],
    });
    expect(completed.raw.result.isError).not.toBe(true);
    expect(completed.result.taskStatus).toBe('completed');
    expect(completed.result.turnState).toBe('closed');
    expect(completed.result.remoteDurability).toEqual({
      required: false, state: 'NOT_REQUIRED', reason: 'continuity_terminal',
    });
    expect(completed.result.memoryLifecycle).toMatchObject({
      mode: 'advisory', postflightState: 'CLOSED', durabilityState: 'NOT_REQUIRED',
    });
    expect(completed.result.promoted).toMatchObject({
      decisions: 1, artifacts: 1, outcomes: 1, constraints: 1, failures: 0,
    });

    const task = await f.runtime.memory.getContinuityTask(f.scopeA, routed.continuityTaskId);
    expect(task?.status).toBe('completed');
    const frontierTool = await call(f.baseUrl, f.principalA.key, 'continuity_frontier', { limit: 5 });
    expect(frontierTool.result.map((item: any) => item.title)).toEqual(['Candidate A', 'Candidate B']);
    const getTask = await call(f.baseUrl, f.principalA.key, 'continuity_get_task', { taskId: routed.continuityTaskId });
    expect(getTask.result.taskId).toBe(routed.continuityTaskId);
    expect(getTask.result.status).toBe('completed');

    const turns = await scopedMemoryStateRecords<TurnRecord>(f.memory.fileNative, MEMORY_STATE.turns, f.scopeA);
    expect(turns.find((turn) => turn.turnId === routed.continuityTurnId)?.state).toBe('closed');
    const exported = await f.runtime.memory.export(f.scopeA, 100);
    const kinds = exported.items.map((item) => item.kind);
    expect(kinds).toContain('decision');
    expect(kinds).toContain('artifact');
    expect(kinds).toContain('project_state');
    expect(kinds).toContain('guardrail');
    const checkpoints = await scopedMemoryStateRecords<CheckpointRecord>(f.memory.fileNative, MEMORY_STATE.checkpoints, f.scopeA);
    const checkpoint = checkpoints.find((record) => record.checkpointId === completed.result.checkpointId)!;
    expect(JSON.stringify(checkpoint.input)).toContain('Later enhancement');
    expect(JSON.stringify(checkpoint.input.evidence)).toContain('tests/example.test.ts');
    const decisions = await scopedMemoryStateRecords<WriteDecisionRecord>(f.memory.fileNative, MEMORY_STATE.writeDecisions, f.scopeA);
    expect(decisions).toHaveLength(4);
    expect(decisions.every((record) => record.appliedAt != null)).toBe(true);
    const nodeMetadata = await Promise.all(exported.items.map((item) => f.runtime.memory.getNodeMetadata(f.scopeA, item.memoryId)));
    expect(nodeMetadata).toHaveLength(4);
    expect(nodeMetadata.every((record) => typeof record?.createdFromDecisionId === 'string' && record.createdFromDecisionId.length > 0)).toBe(true);
  });

  it('does not promote generic successful summary prose without explicit structured outcome facts', async () => {
    const f = await fixture('no-summary-spam');
    const routed = await route(f, 'Generic summary should stay in continuity only');
    const completed = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId,
      status: 'completed',
      summary: 'This prose is useful for continuity but is not an explicit durable memory fact.',
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'This checkpoint reports operational progress and adds no reusable project knowledge.' },
      projectTerminal: true,
    });
    expect(completed.raw.result.isError).not.toBe(true);
    expect(completed.result.promoted).toMatchObject({
      decisions: 0, artifacts: 0, outcomes: 0, constraints: 0, failures: 0,
    });

    expect((await f.runtime.memory.export(f.scopeA, 100)).items).toHaveLength(0);
    const decisions = await scopedMemoryStateRecords<WriteDecisionRecord>(f.memory.fileNative, MEMORY_STATE.writeDecisions, f.scopeA);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ decisionType: 'NO_DURABLE_MEMORY' });
    expect(decisions[0]!.appliedAt).toBeTypeOf('number');
  });

  it('routes repeated failed checkpoint promotion through cognition without revising immutable failure history', async () => {
    const f = await fixture('failure-immutability');
    const base = {
      routeContextId: 'route-failure-immutability',
      status: 'failed' as const,
      summary: 'First verified failure.',
      blockers: [{ code: 'BUILD_FAILED', detail: 'Compiler returned exit 1.' }],
      evidence: [{ type: 'log' as const, ref: 'build.stderr.log', result: 'exit=1' }],
      nextCandidates: [{ title: 'Repair compiler failure', rationale: 'Fix before retry.' }],
    };

    const first = await f.runtime.memory.promoteContinuityCheckpoint(
      f.scopeA, 'task-failure-immutability', 'checkpoint-failure-1', base,
    );
    const second = await f.runtime.memory.promoteContinuityCheckpoint(
      f.scopeA, 'task-failure-immutability', 'checkpoint-failure-2', {
        ...base,
        summary: 'Second observation must not rewrite the first failure.',
      },
    );
    expect(first.failures).toBe(1);
    expect(second.failures).toBe(1);

    const failure = (await f.runtime.memory.export(f.scopeA, 100)).items.find((item) => item.kind === 'failure');
    expect(failure).toBeTruthy();
    expect(await f.runtime.memory.listRevisions(f.scopeA, failure!.memoryId)).toHaveLength(1);
    const decisions = await scopedMemoryStateRecords<WriteDecisionRecord>(f.memory.fileNative, MEMORY_STATE.writeDecisions, f.scopeA);
    expect(decisions).toHaveLength(2);
    expect(decisions[0]!.decisionType).toBe('WRITE_NEW_ROOT');
    expect(decisions[1]!.decisionType).toBe('NO_DURABLE_MEMORY');
    expect(decisions.every((record) => record.appliedAt != null)).toBe(true);
    expect((await f.runtime.memory.getNodeMetadata(f.scopeA, failure!.memoryId))?.createdFromDecisionId).toBeTruthy();
  });

  it('runs one grouped durability boundary only after terminal checkpoint promotion and local turn close', async () => {
    const f = await fixture('remote-boundary-order');
    const routed = await route(f, 'Grouped remote durability boundary');
    const calls: Array<{ reason: string; turnState: string; decisionCount: number; lifecycleState: string }> = [];
    const original = f.backend.syncDurableBoundary.bind(f.runtime.memory);
    f.backend.syncDurableBoundary = (async (_scope: any, reason: any) => {
      const turns = await scopedMemoryStateRecords<TurnRecord>(f.memory.fileNative, MEMORY_STATE.turns, f.scopeA);
      const decisions = await scopedMemoryStateRecords(f.memory.fileNative, MEMORY_STATE.writeDecisions, f.scopeA);
      const lifecycle = await f.runtime.memory.getLifecycleContext(f.scopeA, routed.memoryContextId);
      calls.push({
        reason,
        turnState: String(turns.find((turn) => turn.turnId === routed.continuityTurnId)?.state),
        decisionCount: decisions.length,
        lifecycleState: String(lifecycle?.postflightState),
      });
      return {
        required: true, state: 'REMOTE_SYNCED', reason,
        generationId: 'a'.repeat(64), remoteHead: 'b'.repeat(40), logicalStateHash: 'c'.repeat(64),
      } as any;
    }) as any;
    try {
      const completed = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
        routeContextId: routed.routeContextId,
        status: 'completed',
        summary: 'Grouped boundary includes postflight and close evidence.',
        decisions: [{ key: 'phase5.boundary', value: 'verified', reason: 'remote proof required' }],
        projectTerminal: true,
      });
      expect(completed.raw.result.isError).not.toBe(true);
      expect(calls).toEqual([{ reason: 'continuity_terminal', turnState: 'closed', decisionCount: 1, lifecycleState: 'CLOSED' }]);
      expect(completed.result.remoteDurability).toMatchObject({
        required: true, state: 'REMOTE_SYNCED', reason: 'continuity_terminal',
        generationId: 'a'.repeat(64),
      });
      expect(completed.result.memoryLifecycle).toMatchObject({
        postflightState: 'CLOSED', durabilityState: 'DURABLY_CLOSED',
        generationId: 'a'.repeat(64), logicalStateHash: 'c'.repeat(64),
      });
    } finally {
      f.backend.syncDurableBoundary = original as any;
    }
  });

  it('rejects checkpoint success when the required grouped remote boundary fails while preserving factual local state', async () => {
    const f = await fixture('remote-boundary-failure');
    const routed = await route(f, 'Remote boundary failure remains truthful');
    let observedClosed = false;
    const original = f.backend.syncDurableBoundary.bind(f.runtime.memory);
    f.backend.syncDurableBoundary = (async () => {
      const turns = await scopedMemoryStateRecords<TurnRecord>(f.memory.fileNative, MEMORY_STATE.turns, f.scopeA);
      observedClosed = turns.find((turn) => turn.turnId === routed.continuityTurnId)?.state === 'closed';
      throw new Error('MEMORY_REMOTE_UNAVAILABLE: synthetic readback failure');
    }) as any;
    try {
      const failed = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
        routeContextId: routed.routeContextId,
        status: 'completed',
        summary: 'Local truth exists but remote durability is unavailable.',
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'This checkpoint reports operational progress and adds no reusable project knowledge.' },
        projectTerminal: true,
      });
      expect(failed.raw.result.isError).toBe(true);
      expect(failed.result.error.code).toBe('MEMORY_POSTFLIGHT_REQUIRED');
      expect(observedClosed).toBe(true);
      const failedLifecycle = await f.runtime.memory.getLifecycleContext(f.scopeA, routed.memoryContextId);
      expect(failedLifecycle).toMatchObject({ postflightState: 'POSTFLIGHT_PENDING' });
      expect(failedLifecycle).not.toHaveProperty('localDurableGeneration');
      expect(failedLifecycle).not.toHaveProperty('localDurableHash');
      const task = await f.runtime.memory.getContinuityTask(f.scopeA, routed.continuityTaskId);
      expect(task?.status).toBe('completed');
      const decisions = await scopedMemoryStateRecords<WriteDecisionRecord>(f.memory.fileNative, MEMORY_STATE.writeDecisions, f.scopeA);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]!.decisionType).toBe('NO_DURABLE_MEMORY');
    } finally {
      f.backend.syncDurableBoundary = original as any;
    }
  });

  it('requires explicit verified execution evidence before completing an execution-backed continuity task', async () => {
    const f = await fixture('execution-completion-gate');
    const routed = await route(f, 'Execution-backed completion gate task');
    await f.runtime.execution.open();

    const artifactPath = path.join(f.root, 'verified-output.json');
    const verifiedRun = await f.runtime.execution.create(f.scopeA, {
      objective: 'Produce verified completion evidence',
      continuityTaskId: routed.continuityTaskId,
      originRouteContextId: routed.routeContextId,
      nodes: [{
        id: 'A',
        purpose: 'produce verified artifact',
        command: nodeShellCommand(`require('node:fs').writeFileSync(${JSON.stringify(artifactPath)}, '{"ok":true}')`),
        cwd: f.root,
        inputs: [],
        resources: { writes: [artifactPath] },
        expectedArtifacts: [{ path: artifactPath, kind: 'file', hash: 'sha256', required: true }],
      }],
    });
    await f.runtime.execution.start(f.scopeA, verifiedRun.runId);
    const verifiedDone = await f.runtime.execution.wait(
      f.scopeA, verifiedRun.runId, verifiedRun.lastEventSequence, { eventTypes: ['run.completed'] }, 5_000,
    );
    expect(verifiedDone.state.evidence.verification).toBe('verified');

    const missingRef = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId,
      status: 'completed',
      summary: 'Must not complete without an explicit execution evidence reference.',
      projectTerminal: true,
    });
    expect(missingRef.raw.result.isError).toBe(true);
    expect(missingRef.result.error.code).toBe('CONTINUITY_EXECUTION_EVIDENCE_REQUIRED');
    expect((await f.runtime.memory.getContinuityTask(f.scopeA, routed.continuityTaskId))?.status).toBe('running');

    const completed = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId,
      status: 'completed',
      summary: 'Completion is backed by the exact verified execution run.',
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'This checkpoint reports operational progress and adds no reusable project knowledge.' },
      evidence: [{ type: 'tool', ref: `execution:${verifiedRun.runId}`, result: 'verified' }],
      projectTerminal: true,
    });
    expect(completed.raw.result.isError).not.toBe(true);
    expect(completed.result.taskStatus).toBe('completed');
  }, 10_000);

  it('rejects execution-backed completion when an explicitly referenced run failed required artifact evidence', async () => {
    const f = await fixture('execution-completion-failed-evidence');
    const routed = await route(f, 'Failed execution evidence completion gate');
    await f.runtime.execution.open();
    const failedRun = await f.runtime.execution.create(f.scopeA, {
      objective: 'Exit zero but fail required artifact evidence',
      continuityTaskId: routed.continuityTaskId,
      originRouteContextId: routed.routeContextId,
      nodes: [{
        id: 'A', purpose: 'omit required artifact', command: printCommand('process-success'), cwd: f.root, inputs: [],
        expectedArtifacts: [{ path: path.join(f.root, 'missing-required.txt'), kind: 'file', required: true }],
      }],
    });
    await f.runtime.execution.start(f.scopeA, failedRun.runId);
    const failedDone = await f.runtime.execution.wait(
      f.scopeA, failedRun.runId, failedRun.lastEventSequence, { eventTypes: ['run.failed'] }, 5_000,
    );
    expect(failedDone.state.state).toBe('failed');
    expect(failedDone.state.evidence.verification).toBe('failed');

    const denied = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId,
      status: 'completed',
      summary: 'Must not contradict failed required execution evidence.',
      evidence: [{ type: 'tool', ref: `execution:${failedRun.runId}`, result: 'verified' }],
      projectTerminal: true,
    });
    expect(denied.raw.result.isError).toBe(true);
    expect(denied.result.error.code).toBe('CONTINUITY_EXECUTION_EVIDENCE_INVALID');
    expect((await f.runtime.memory.getContinuityTask(f.scopeA, routed.continuityTaskId))?.status).toBe('running');
  }, 10_000);

  it('blocks semantic completion while a linked execution run is still planned or running', async () => {
    const f = await fixture('execution-completion-active');
    const routed = await route(f, 'Active execution completion gate');
    await f.runtime.execution.open();
    const activeRun = await f.runtime.execution.create(f.scopeA, {
      objective: 'Still planned',
      continuityTaskId: routed.continuityTaskId,
      originRouteContextId: routed.routeContextId,
      nodes: [{ id: 'A', purpose: 'planned work', command: printCommand('A'), cwd: f.root, inputs: [] }],
    });
    const denied = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId,
      status: 'completed',
      summary: 'Cannot complete while execution remains active.',
      evidence: [{ type: 'tool', ref: `execution:${activeRun.runId}`, result: 'verified' }],
      projectTerminal: true,
    });
    expect(denied.raw.result.isError).toBe(true);
    expect(denied.result.error.code).toBe('CONTINUITY_EXECUTION_ACTIVE');
  });

  it('promotes a failed terminal checkpoint into failure memory and preserves next frontier', async () => {
    const f = await fixture('failed');
    const routed = await route(f, 'Failure promotion task');
    const failed = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: routed.routeContextId,
      status: 'failed',
      summary: 'Build failed due to deterministic fixture error.',
      blockers: [{ code: 'BUILD_FAILED', detail: 'Compiler returned exit 1.' }],
      evidence: [{ type: 'log', ref: 'build.stderr.log', result: 'exit=1' }],
      nextCandidates: [
        { title: 'Inspect compiler error', rationale: 'Root-cause the failure.' },
        { title: 'Retry after repair', rationale: 'Run only after diagnosis.' },
      ],
    });
    expect(failed.raw.result.isError).not.toBe(true);
    expect(failed.result.promoted.failures).toBe(1);
    expect(failed.result.turnState).toBe('closed');

    const failures = (await f.runtime.memory.export(f.scopeA, 100)).items.filter((item) => item.kind === 'failure');
    expect(failures).toHaveLength(1);
  });

  it.each(['blocked', 'deferred'] as const)('preserves a %s checkpoint when a fresh route interrupts the prior turn after restart', async (status) => {
    const f = await fixture(`preserve-${status}`, 'checkpoint-logical-principal');
    const original = await route(f, `Original ${status} objective`);
    const blockers = [{ code: 'EXTERNAL_DEPENDENCY', detail: 'Operator action is required before this task can continue.' }];
    const checkpoint = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: original.routeContextId,
      status,
      summary: 'The current work is safely saved while the objective awaits an external condition.',
      blockers,
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'This operational waiting state contains no additional reusable knowledge.' },
    });
    expect(checkpoint.raw.result.isError).not.toBe(true);
    expect(checkpoint.result).toMatchObject({ taskStatus: status, turnState: 'open',
      memoryLifecycle: { postflightState: 'CLOSED', durabilityState: 'DURABLY_CLOSED' } });
    const savedLifecycle = await f.runtime.memory.getLifecycleContext(f.scopeA, original.memoryContextId);

    await f.runtime.execution.close();
    await f.runtime.memory.close();
    const restarted = await f.start();
    const next = await route({ ...f, ...restarted }, 'Verify a separate saved objective');
    const category = status === 'blocked' ? 'blockedTasks' : 'deferredTasks';
    expect(next.continuitySnapshot[category]).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: original.continuityTaskId, status, blockers }),
    ]));
    expect(next.continuitySnapshot.unfinishedPlans.map((task: any) => task.taskId)).not.toContain(original.continuityTaskId);
    expect(next.continuitySnapshot.interruptedTurns).toEqual(expect.arrayContaining([
      expect.objectContaining({ turnId: original.continuityTurnId, taskId: original.continuityTaskId }),
    ]));
    expect(await restarted.runtime.memory.getLifecycleContext(f.scopeA, original.memoryContextId))
      .toEqual(savedLifecycle);
  });

  it('keeps non-terminal turns open, marks an interrupted checkpoint resumable, and blocks cross-principal finalization', async () => {
    const f = await fixture('nonterminal');
    const runningRoute = await route(f, 'Non-terminal checkpoint task');
    const running = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: runningRoute.routeContextId,
      status: 'running',
      summary: 'Work is still in progress.',
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'This checkpoint reports operational progress and adds no reusable project knowledge.' },
      evidence: [{ type: 'test', ref: 'partial.test.ts', result: 'PASS' }],
    });
    expect(running.raw.result.isError).not.toBe(true);
    expect(running.result.turnState).toBe('open');

    const denied = await call(f.baseUrl, f.principalB.key, 'task_checkpoint', {
      routeContextId: runningRoute.routeContextId,
      status: 'completed',
      summary: 'Principal B must not finalize this.',
      projectTerminal: true,
    });
    expect(denied.raw.result.isError).toBe(true);
    expect(denied.result.error.code).toBe('ROUTE_PRINCIPAL_MISMATCH');

    const interruptedRoute = await route(f, 'Interruptible checkpoint task');
    const interrupted = await call(f.baseUrl, f.principalA.key, 'task_checkpoint', {
      routeContextId: interruptedRoute.routeContextId,
      status: 'interrupted',
      summary: 'Session is ending before completion.',
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'This checkpoint reports operational progress and adds no reusable project knowledge.' },
    });
    expect(interrupted.raw.result.isError).not.toBe(true);
    expect(interrupted.result.turnState).toBe('interrupted');
    const status = await call(f.baseUrl, f.principalA.key, 'continuity_status');
    expect(status.result.snapshot.unfinishedPlans.map((item: any) => item.taskId))
      .toContain(interruptedRoute.continuityTaskId);
    expect(status.result.snapshot.interruptedTurns.map((item: any) => item.turnId))
      .toContain(interruptedRoute.continuityTurnId);
  });
});
