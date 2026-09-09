import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { attachExecutionContinuity, type ContinuitySnapshot } from '../src/continuity/snapshot.js';
import { validateExecutionDag } from '../src/execution/dag.js';
import { ExecutionLogStore, type ExecutionResultMarker } from '../src/execution/log-store.js';
import { ExecutionRecovery } from '../src/execution/recovery.js';
import { beginExecutionProvenance, finishExecutionProvenance } from '../src/execution/provenance.js';
import { ExecutionService } from '../src/execution/service.js';
import { executionWorkflowPending, ExecutionStore } from '../src/execution/store.js';
import type { ExecutionScope } from '../src/execution/types.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { printCommand } from './helpers/platform-command.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(label: string) {
  const base = process.env.TEMP || process.env.TMP || os.tmpdir();
  const root = await mkdtemp(path.join(base, `agent-core-execution-recovery-${label}-`));
  roots.push(root);
  const work = path.join(root, 'work');
  await mkdir(work, { recursive: true });
  const baseConfig = loadConfig({}, root).execution;
  const config = {
    ...baseConfig,
    enabled: true,
    logRoot: path.join(root, 'runtime', 'execution', 'runs'),
  };
  const scope = { principalId: 'principal-recovery', projectId: root } satisfies ExecutionScope;
  const workspace = new WorkspacePolicy([root]);
  return { root, work, config, scope, workspace };
}

async function seedRunningAttempt(f: Awaited<ReturnType<typeof fixture>>, nodeId = 'A', sourceBound = false) {
  const store = new ExecutionStore();
  await store.open({ stateRoot: f.config.stateRoot });
  const graph = await validateExecutionDag([{
    id: nodeId,
    purpose: `recover ${nodeId}`,
    command: printCommand(`${nodeId}-retry-ok\n`),
    cwd: f.work,
    timeoutMs: 5000,
    ...(sourceBound ? { inputs: [] } : {}),
  }], { workspace: f.workspace });
  const run = await store.createRun(f.scope, {
    objective: 'recovery fixture',
    continuityTaskId: 'task-recovery',
    maxConcurrency: 1,
  });
  await store.persistGraph(f.scope, run.runId, graph.nodes);
  await store.setRunState(f.scope, run.runId, 'running');
  const logs = new ExecutionLogStore(f.config.logRoot);
  const paths = await logs.prepareAttempt(run.runId, nodeId, 1);
  const attemptId = 'attempt-recovery-1';
  await store.createAttempt(f.scope, run.runId, nodeId, attemptId, 1, paths);
  await store.setAttemptPid(f.scope, run.runId, nodeId, 1, 999999);
  return { store, logs, runId: run.runId, nodeId, attemptId, paths, node: graph.nodes[0]! };
}

function marker(runId: string, nodeId: string, attemptId: string): ExecutionResultMarker {
  const now = Date.now();
  return {
    version: 1,
    runId,
    nodeId,
    attemptId,
    attemptNo: 1,
    state: 'succeeded',
    startedAt: now - 20,
    finishedAt: now,
    exitCode: 0,
    signal: null,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutSha256: '0'.repeat(64),
    stderrSha256: '0'.repeat(64),
  };
}

describe('execution restart recovery', () => {
  it('exposes a recovery coordinator', () => {
    expect(typeof ExecutionRecovery).toBe('function');
  });

  it('lets a durable terminal result marker win after restart even when the persisted attempt still says running', async () => {
    const f = await fixture('marker');
    const seeded = await seedRunningAttempt(f);
    await seeded.logs.writeResultAtomic(marker(seeded.runId, seeded.nodeId, seeded.attemptId));
    await seeded.store.close();

    const service = new ExecutionService(f.config, f.workspace);
    await service.open();
    try {
      const view = await service.status(f.scope, seeded.runId);
      expect(view?.state).toBe('completed');
      expect(view?.nodes[0]).toMatchObject({ state: 'succeeded', attemptCount: 1 });
      const attempts = await service.store.listAttempts(f.scope, seeded.runId, seeded.nodeId);
      expect(attempts[0]).toMatchObject({ state: 'succeeded', exitCode: 0 });
    } finally {
      await service.close();
    }
  });

  it('marks a persisted running attempt interrupted when no terminal result marker exists and never infers success from PID absence', async () => {
    const f = await fixture('missing-marker');
    const seeded = await seedRunningAttempt(f);
    await seeded.store.close();

    const service = new ExecutionService(f.config, f.workspace);
    await service.open();
    try {
      const view = await service.status(f.scope, seeded.runId);
      expect(view?.state).toBe('interrupted');
      expect(view?.nodes[0]?.state).toBe('interrupted');
      const attempts = await service.store.listAttempts(f.scope, seeded.runId, seeded.nodeId);
      expect(attempts[0]?.state).toBe('interrupted');
      expect(attempts[0]?.exitCode).toBeUndefined();

      await service.retry(f.scope, seeded.runId, seeded.nodeId);
      const finished = await service.wait(f.scope, seeded.runId, view!.lastEventSequence, { eventTypes: ['run.completed'] }, 5000);
      expect(finished.state.state).toBe('completed');
      const after = await service.store.listAttempts(f.scope, seeded.runId, seeded.nodeId);
      expect(after.map((attempt) => attempt.attemptNo)).toEqual([1, 2]);
      expect(after[0]?.state).toBe('interrupted');
      expect(after[1]?.state).toBe('succeeded');
    } finally {
      await service.close();
    }
  }, 10_000);

  it('repairs a run interrupted between committing the final attempt and updating run state', async () => {
    const f = await fixture('terminal-run-gap');
    const seeded = await seedRunningAttempt(f);
    const result = marker(seeded.runId, seeded.nodeId, seeded.attemptId);
    await seeded.logs.writeResultAtomic(result);
    await seeded.store.completeAttempt(f.scope, result);
    expect((await seeded.store.getRun(f.scope, seeded.runId))?.state).toBe('running');
    await seeded.store.close();
    const service = new ExecutionService(f.config, f.workspace);
    await service.open();
    try { expect((await service.status(f.scope, seeded.runId))?.state).toBe('completed'); }
    finally { await service.close(); }
  });

  it.each(['marker_only', 'attempt_committed', 'previously_completed'] as const)(
    'keeps successful workflow work blocked after restart until its pending receipt is reconciled: %s', async (crashPoint) => {
      const f = await fixture(`pending-${crashPoint}`);
      const seeded = await seedRunningAttempt(f, 'A', true);
      const result = marker(seeded.runId, seeded.nodeId, seeded.attemptId);
      result.provenance = await finishExecutionProvenance(f.workspace, seeded.node,
        await beginExecutionProvenance(f.workspace, seeded.node, {
          runId: seeded.runId, attemptId: seeded.attemptId, attemptNo: 1,
        }));
      await seeded.logs.writeResultAtomic(result);
      if (crashPoint !== 'marker_only') await seeded.store.completeAttempt(f.scope, result, { workflowPending: true });
      if (crashPoint === 'previously_completed') await seeded.store.setRunState(f.scope, seeded.runId, 'completed');
      await seeded.store.close();

      let callbacks = 0;
      const service = new ExecutionService(f.config, f.workspace, { workflowAfterAttempt: async () => { callbacks += 1; } });
      await service.open();
      try {
        const view = await service.status(f.scope, seeded.runId);
        expect(view?.state).toBe('blocked');
        expect(view?.nodes[0]).toMatchObject({ state: 'succeeded', attemptCount: 1 });
        expect(executionWorkflowPending((await service.store.getRun(f.scope, seeded.runId))!))
          .toEqual([{ nodeId: 'A', attemptId: seeded.attemptId, attemptNo: 1 }]);
        expect(callbacks).toBe(0);
        expect((await service.store.listAttempts(f.scope, seeded.runId, 'A'))).toHaveLength(1);
      } finally { await service.close(); }
    });

  it('returns compact scoped active/interrupted runs and attaches them deterministically to continuity snapshots', async () => {
    const f = await fixture('summary');
    const service = new ExecutionService(f.config, f.workspace);
    await service.open();
    try {
      const active = await service.create(f.scope, {
        objective: 'active run', continuityTaskId: 'task-active',
        nodes: [{ id: 'A', purpose: 'A', command: "Write-Output 'A'", cwd: f.work }],
      });
      const interrupted = await service.create(f.scope, {
        objective: 'interrupted run', continuityTaskId: 'task-interrupted',
        nodes: [{ id: 'B', purpose: 'B', command: "Write-Output 'B'", cwd: f.work }],
      });
      await service.store.setRunState(f.scope, interrupted.runId, 'interrupted');
      const summary = await service.continuitySummary(f.scope);
      expect(summary.activeRuns.map((run) => run.runId)).toContain(active.runId);
      expect(summary.interruptedRuns.map((run) => run.runId)).toContain(interrupted.runId);

      const base: ContinuitySnapshot = {
        currentObjective: null,
        activeTasks: [], recentCompleted: [], blockedTasks: [], deferredTasks: [], unfinishedPlans: [],
        frontier: [], interruptedTurns: [], activeRuns: [], interruptedRuns: [], lastExecutionCheckpoint: null,
        snapshotHash: 'old',
      };
      const first = attachExecutionContinuity(base, summary);
      const second = attachExecutionContinuity(base, summary);
      expect(first).toEqual(second);
      expect(first.snapshotHash).not.toBe('old');
      expect(JSON.stringify(first).length).toBeLessThanOrEqual(20_000);
    } finally {
      await service.close();
    }
  });
});
