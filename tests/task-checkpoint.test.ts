import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeSecondMemoryTransport, strictMemoryConfig, isolatedMemoryDependencies, secondMemoryEnv } from './helpers/memory-fixture.js';
import { TaskCheckpointService, type TaskCheckpointInput } from '../src/memory/task-checkpoint.js';
import { MemoryService } from '../src/memory/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';

const roots: string[] = [];
const memories: MemoryService[] = [];

async function fixture(label: string, options: { remote?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-task-checkpoint-${label}-`));
  roots.push(root);
  const remote = options.remote ?? false;
  const config = await strictMemoryConfig(root, {
    AGENT_CORE_ALLOWED_ROOTS: root,
    AGENT_CORE_MEMORY_PRINCIPAL_ID: 'principal-stable',
    ...(remote ? await secondMemoryEnv(root) : {}),
  });
  const transport = new FakeSecondMemoryTransport();
  const dependencies = {...isolatedMemoryDependencies(config),...(remote ? { fileSecondTransport: transport } : {})};
  const memory = new MemoryService(config, undefined, dependencies);
  memories.push(memory);
  const service = new TaskCheckpointService(memory, new WorkspacePolicy([root]));
  const scope = { principalId: 'principal-stable', projectId: root };
  const openContext = async (input: { workspaceRoot: string; task: string; context?: string }) => {
    const routeContextId = randomUUID();
    const expiresAt = Date.now() + 60_000;
    const recalled = await memory.preflight({ scope, routeContextId, task: input.task, context: input.context, expiresAt });
    const turn = await memory.beginContinuityTurn(scope, routeContextId, input.task, input.context, {}, expiresAt);
    await memory.bindLifecycleTask(scope, recalled.contextId, turn.taskId);
    const lease = await memory.issueContextLease({ scope, routeContextId, contextId: recalled.contextId });
    return { routeContextId, memoryContextId: recalled.contextId, memoryContextLease: lease.token,
      continuityTaskId: turn.taskId, continuityTurnId: turn.turnId, memorySummary: recalled.recalled };
  };
  return { root, memory, service, transport, config, dependencies, scope, openContext, aux: new FileNativeAuxStore(config.fileNative) };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(memories.splice(0).map((memory) => memory.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('task checkpoint closure', () => {
  it('opens a real recalled context, issues an opaque lease, and reaches CLOSED + REMOTE_SYNCED after terminal checkpoint', async () => {
    const f = await fixture('local');
    const seed = await f.memory.commit({
      scope: { principalId: 'principal-stable', projectId: f.root },
      canonicalKey: 'decision.shared.memory.seed',
      kind: 'decision',
      value: 'Use the verified shared memory workflow for task work.',
      sourceType: 'test',
    });

    const opened = await f.openContext({
      workspaceRoot: f.root,
      task: 'Continue the verified shared memory workflow',
      context: 'Recall the prior task decision.',
    });
    expect(opened.memorySummary.map((item) => item.memoryId)).toContain(seed.memoryId);
    expect(opened.memoryContextLease).toMatch(/^mcl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(opened.memoryContextLease).not.toContain('principal-stable');
    expect(opened.continuityTaskId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(opened.continuityTurnId).toMatch(/^[0-9a-f-]{36}$/i);

    await f.memory.completeContextLeaseMeaningfulWork({
      lease: opened.memoryContextLease!,
      workspaceRoot: f.root,
      toolName: 'write_file',
      reasonCode: 'explicit_mutation_tool',
    });
    expect(await f.memory.getLifecycleContext({ principalId: 'principal-stable', projectId: f.root }, opened.memoryContextId))
      .toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1 });

    const checkpoint = await f.service.checkpointForScope(f.scope, {
      workspaceRoot: f.root,
      routeContextId: opened.routeContextId,
      memoryContextId: opened.memoryContextId,
      continuityTaskId: opened.continuityTaskId,
      continuityTurnId: opened.continuityTurnId,
      status: 'completed',
      summary: 'Shared-memory mutation verified and complete.',
      evidence: [{ type: 'file', ref: 'artifact/shared-memory.txt', result: 'verified' }],
      decisions: [{ key: 'shared-memory-mode', value: 'verified', reason: 'The mutation and checkpoint were verified.' }],
      projectTerminal: true,
    });
    expect(checkpoint.remoteDurability).toMatchObject({ required: true, state: 'REMOTE_SYNCED', reason: 'continuity_terminal' });
    expect(checkpoint.memoryLifecycle).toMatchObject({ postflightState: 'CLOSED', durabilityState: 'DURABLY_CLOSED' });
    expect((await f.memory.getContinuityTask({ principalId: 'principal-stable', projectId: f.root }, opened.continuityTaskId))?.status)
      .toBe('completed');
  });

  it('crosses verified remote durability and records the exact local receipt', async () => {
    const f = await fixture('remote', { remote: true });
    const opened = await f.openContext({ workspaceRoot: f.root, task: 'Durably close shared memory' });
    await f.memory.completeContextLeaseMeaningfulWork({
      lease: opened.memoryContextLease!, workspaceRoot: f.root, toolName: 'write_file', reasonCode: 'explicit_mutation_tool',
    });
    const checkpoint = await f.service.checkpointForScope(f.scope, {
      workspaceRoot: f.root,
      routeContextId: opened.routeContextId,
      memoryContextId: opened.memoryContextId,
      continuityTaskId: opened.continuityTaskId,
      continuityTurnId: opened.continuityTurnId,
      status: 'completed',
      summary: 'Remote shared-memory closure verified.',
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'This checkpoint only verifies transport durability; it adds no reusable project knowledge.' },
      evidence: [{ type: 'hash', ref: 'sha256:shared-memory', result: 'verified' }],
      projectTerminal: true,
    });
    expect(checkpoint.remoteDurability).toMatchObject({ required: true, state: 'REMOTE_SYNCED' });
    const lifecycle = await f.memory.getLifecycleContext(
      { principalId: 'principal-stable', projectId: f.root }, opened.memoryContextId,
    );
    expect(lifecycle).toMatchObject({
      postflightState: 'CLOSED',
      localDurableGeneration: (checkpoint.remoteDurability as any).generationId,
      localDurableHash: (checkpoint.remoteDurability as any).logicalStateHash,
    });
    for (const version of f.transport.versions.values()) {
      expect(JSON.stringify(version)).not.toContain(opened.memoryContextLease!);
    }
  });

  it.each(['direct', 'graph', 'checkpoint-intent'] as const)('replays one scoped checkpoint after %s failure and process restart', async (failure) => {
    const f = await fixture(`retry-${failure}`);
    const opened = await f.openContext({ workspaceRoot: f.root, task: 'Verify durable closure without repeating completed work' });
    await f.memory.completeContextLeaseMeaningfulWork({ lease: opened.memoryContextLease!, workspaceRoot: f.root, toolName: 'write_file', reasonCode: 'explicit_mutation_tool' });
    const input: TaskCheckpointInput = {
      workspaceRoot: f.root, routeContextId: opened.routeContextId, memoryContextId: opened.memoryContextId,
      continuityTaskId: opened.continuityTaskId, continuityTurnId: opened.continuityTurnId,
      status: 'completed', summary: 'Verified implementation and acceptance evidence are ready.',
      decisions: [{ key: 'retry', value: 'Reuse the existing completion receipt.', reason: 'The work already succeeded before synchronization failed.' }],
      outcomes: [{ key: 'acceptance', value: 'Isolated acceptance checks passed.', evidenceRefs: ['test:acceptance'] }],
      evidence: [{ type: 'test', ref: 'test:acceptance', result: 'passed' }],
      nextCandidates: [{ title: 'Follow up on monitoring', rationale: 'Observe the verified change later.' }],
      projectTerminal: true,
    };
    if (failure === 'direct') f.dependencies.supabaseDirectTransport.offline = true;
    else if (failure === 'graph') vi.spyOn(f.dependencies.graphify!, 'update').mockRejectedValueOnce(new Error('isolated graph outage'));
    else {
      const put = FileNativeAuxStore.prototype.put;
      let interrupted = false;
      vi.spyOn(FileNativeAuxStore.prototype, 'put').mockImplementation(async function (category, id, value) {
        if (!interrupted && category === 'continuity-tasks' && (value as any).lastCheckpointId) {
          interrupted = true;
          throw new Error('interruption after durable checkpoint intent');
        }
        return put.call(this, category, id, value);
      });
    }
    await expect(f.service.checkpointForScope(f.scope, input)).rejects.toThrow();
    const before = await f.aux.list<any>('write-decisions');
    expect(await f.aux.list('continuity-checkpoints')).toHaveLength(1);
    expect(await f.memory.getLifecycleContext({ principalId: 'principal-stable', projectId: f.root }, opened.memoryContextId))
      .toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1 });
    vi.restoreAllMocks();
    f.dependencies.supabaseDirectTransport.offline = false;
    await f.memory.close();
    const lifecycle = await f.aux.get<any>('lifecycles', opened.memoryContextId);
    await f.aux.put('lifecycles', opened.memoryContextId, { ...lifecycle, expiresAt: Date.now() - 1 });
    const restartedMemory = new MemoryService(f.config, undefined, f.dependencies);
    memories.push(restartedMemory);
    const restarted = new TaskCheckpointService(restartedMemory, new WorkspacePolicy([f.root]));
    await restartedMemory.reconcileContinuity({ principalId: 'principal-stable', projectId: f.root }, []);
    const result = await restarted.checkpointForScope(f.scope, input);
    const repeated = await restarted.checkpointForScope(f.scope, input);
    expect(result.memoryLifecycle).toMatchObject({ postflightState: 'CLOSED', durabilityState: 'DURABLY_CLOSED' });
    expect(result.promoted).toMatchObject({ decisions: 1, outcomes: 1 });
    expect(repeated.checkpointId).toBe(result.checkpointId);
    expect(repeated.writeDecisionIds).toEqual(result.writeDecisionIds);
    expect(await f.aux.list('continuity-checkpoints')).toHaveLength(1);
    expect(await f.aux.list('continuity-frontier')).toHaveLength(1);
    const after = await f.aux.list<any>('write-decisions');
    expect(after).toHaveLength(2);
    expect(after.every((decision) => decision.contextId === opened.memoryContextId && decision.coveredMeaningfulWorkCount === 1)).toBe(true);
    for (const prior of before) expect(after.find((decision) => decision.id === prior.id)?.decisionType).toBe(prior.decisionType);
    expect((await restartedMemory.search({ scope: { principalId: 'principal-stable', projectId: f.root }, query: 'completion receipt acceptance checks' })).hits).toHaveLength(2);
    await expect(restartedMemory.validateLifecycleContext({ scope: { principalId: 'principal-stable', projectId: f.root }, contextId: opened.memoryContextId, routeContextId: opened.routeContextId }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    await expect(restarted.checkpointForScope(f.scope, { ...input, summary: 'Changed completion claims' })).rejects.toMatchObject({ code: 'MEMORY_LIFECYCLE_CONFLICT' });
    await expect(restarted.checkpointForScope(f.scope, { ...input, continuityTurnId: 'unknown-turn' })).rejects.toMatchObject({ code: 'CONTINUITY_CHECKPOINT_INVALID' });
    const otherMemory = new MemoryService({ ...f.config, principalId: 'another-principal' }, undefined, f.dependencies);
    memories.push(otherMemory);
    const other = new TaskCheckpointService(otherMemory, new WorkspacePolicy([f.root]));
    await expect(other.checkpointForScope({ ...f.scope, principalId: 'another-principal' }, input)).rejects.toMatchObject({ code: 'MEMORY_LIFECYCLE_CONFLICT' });
  });

  it('requires an explicit reason for an analysis-only no-write decision and persists that explanation', async () => {
    const f = await fixture('analysis-decision');
    const opened = await f.openContext({ workspaceRoot: f.root, task: 'Read-only confirmation of current state' });
    const input: TaskCheckpointInput = {
      workspaceRoot: f.root, routeContextId: opened.routeContextId, memoryContextId: opened.memoryContextId,
      continuityTaskId: opened.continuityTaskId, continuityTurnId: opened.continuityTurnId,
      status: 'completed', summary: 'Analysis confirmed the documented state without discovering reusable knowledge.',
      projectTerminal: true,
    };
    await expect(f.service.checkpointForScope(f.scope, input)).rejects.toMatchObject({ code: 'TASK_MEMORY_DECISION_REQUIRED' });
    expect(await f.aux.list('continuity-checkpoints')).toEqual([]);
    const memoryDecision = { reasonCode: 'NO_FUTURE_RELEVANCE' as const, explanation: 'This read-only confirmation adds no new fact, decision, or guardrail beyond existing memory.' };
    await expect(f.service.checkpointForScope(f.scope, { ...input, memoryDecision, decisions: [{ key: 'new', value: 'New durable fact', reason: 'Verified' }] }))
      .rejects.toMatchObject({ code: 'TASK_MEMORY_DECISION_REQUIRED' });
    const [first, retry] = await Promise.all([f.service.checkpointForScope(f.scope, { ...input, memoryDecision }), f.service.checkpointForScope(f.scope, { ...input, memoryDecision })]);
    expect(retry.checkpointId).toBe(first.checkpointId);
    expect(first.noDurableMemoryDecisions).toBe(1);
    expect((await f.aux.list<any>('continuity-checkpoints'))[0].memoryDecision).toEqual(memoryDecision);
    const decisions = await f.aux.list<any>('write-decisions');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ decisionType: 'NO_DURABLE_MEMORY', reasonCodes: ['NO_FUTURE_RELEVANCE'], contextId: opened.memoryContextId, coveredMeaningfulWorkCount: 0 });
  });

  it.each(['direct', 'file-mirror'] as const)('keeps closure pending when %s fails while synchronizing the final receipt', async (failure) => {
    const f = await fixture(`last-receipt-${failure}`, { remote: failure === 'file-mirror' });
    const opened = await f.openContext({ workspaceRoot: f.root, task: 'Verify an existing transport receipt' });
    const input: TaskCheckpointInput = {
      workspaceRoot: f.root, routeContextId: opened.routeContextId, memoryContextId: opened.memoryContextId,
      continuityTaskId: opened.continuityTaskId, continuityTurnId: opened.continuityTurnId,
      status: 'completed', summary: 'Transport receipt verification complete.', projectTerminal: true,
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'Receipt verification adds no reusable knowledge.' },
    };
    const put = FileNativeAuxStore.prototype.put;
    vi.spyOn(FileNativeAuxStore.prototype, 'put').mockImplementation(async function (category, id, value) {
      const saved = await put.call(this, category, id, value);
      if (category === 'lifecycles' && (value as any).localDurableGeneration) {
        if (failure === 'direct') f.dependencies.supabaseDirectTransport.offline = true;
        else f.transport.readError = new Error('isolated final manifest outage');
      }
      return saved;
    });
    await expect(f.service.checkpointForScope(f.scope, input)).rejects.toMatchObject({ code: 'MEMORY_POSTFLIGHT_REQUIRED' });
    expect(await f.aux.get('lifecycles', opened.memoryContextId)).toMatchObject({ postflightState: 'POSTFLIGHT_PENDING' });
    expect((await f.aux.get<any>('lifecycles', opened.memoryContextId)).localDurableGeneration).toBeUndefined();
    vi.restoreAllMocks(); f.dependencies.supabaseDirectTransport.offline = false; f.transport.readError = undefined;
    expect((await f.service.checkpointForScope(f.scope, input)).memoryLifecycle).toMatchObject({ postflightState: 'CLOSED', durabilityState: 'DURABLY_CLOSED' });
    expect(await f.aux.list('write-decisions')).toHaveLength(1);
    expect(await f.aux.list('continuity-checkpoints')).toHaveLength(1);
  });

});
