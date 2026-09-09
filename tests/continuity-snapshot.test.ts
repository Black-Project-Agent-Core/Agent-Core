import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTINUITY_SNAPSHOT_LIMITS, attachExecutionContinuity, type ContinuitySnapshot } from '../src/continuity/snapshot.js';
import type { MemoryScope } from '../src/memory/types.js';
import { memoryFixture } from './helpers/memory-fixture.js';

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];

async function fixture(label: string) {
  const f = await memoryFixture(`continuity-snapshot-${label}`);
  roots.push(f.root);
  closers.push(() => f.service.close());
  const scope: MemoryScope = { principalId: 'principal-snapshot', projectId: 'project-snapshot' };
  return { ...f, scope };
}

/** A task in a terminal or waiting status, produced only through the public continuity API. */
async function seedTask(
  f: Awaited<ReturnType<typeof fixture>>,
  input: { route: string; title: string; objective?: string; status: 'completed' | 'failed' | 'blocked' | 'deferred' },
) {
  const started = await f.service.beginContinuityTurn(
    f.scope, input.route, input.title, undefined,
    { ...(input.objective === undefined ? {} : { objective: input.objective }) }, Date.now() + 60_000,
  );
  await f.service.checkpointContinuity(f.scope, started.taskId, started.turnId, {
    routeContextId: input.route, status: input.status, summary: 'seeded',
    ...(['completed', 'failed'].includes(input.status) ? { projectTerminal: true } : {}),
  });
  return started.taskId;
}

function payloadChars(snapshot: ContinuitySnapshot): number {
  const { snapshotHash: _hash, ...payload } = snapshot;
  return JSON.stringify(payload).length;
}

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) { try { await close(); } catch {} }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('deterministic continuity snapshot', () => {
  it('rehydrates bounded state categories in stable order with an identical hash for unchanged vault state', async () => {
    const f = await fixture('categories');

    const active = await f.service.beginContinuityTurn(
      f.scope, 'route-active', 'Active task', undefined, { objective: 'Current active objective' }, Date.now() + 60_000,
    );
    const blocked = await seedTask(f, { route: 'route-blocked', title: 'Blocked task', status: 'blocked' });
    const deferred = await seedTask(f, { route: 'route-deferred', title: 'Deferred task', status: 'deferred' });
    const planned = await seedTask(f, { route: 'route-failed', title: 'Failed task', objective: 'Future objective', status: 'failed' });

    const completed = await f.service.beginContinuityTurn(f.scope, 'route-completed', 'Completed task', undefined, {}, Date.now() + 60_000);
    await f.service.checkpointContinuity(f.scope, completed.taskId, completed.turnId, {
      routeContextId: 'route-completed', status: 'completed', summary: 'done',
      nextCandidates: [
        { title: 'Frontier high', rationale: 'critical', priority: 9 },
        { title: 'Frontier low', rationale: 'optional', priority: 1 },
      ],
    });
    await f.service.closeContinuityTurn(f.scope, completed.turnId, 'closed');
    const interrupted = await f.service.beginContinuityTurn(f.scope, 'route-interrupted', 'Interrupted task', undefined, {}, Date.now() + 60_000);
    await f.service.closeContinuityTurn(f.scope, interrupted.turnId, 'interrupted');

    const first = await f.service.getContinuitySnapshot(f.scope);
    const second = await f.service.getContinuitySnapshot(f.scope);
    expect(second).toEqual(first);
    expect(first.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.currentObjective).toBe('Current active objective');
    expect(first.activeTasks.map((task) => task.taskId)).toContain(active.taskId);
    expect(first.blockedTasks.map((task) => task.taskId)).toContain(blocked);
    expect(first.deferredTasks.map((task) => task.taskId)).toContain(deferred);
    expect(first.recentCompleted.map((task) => task.taskId)).toContain(completed.taskId);
    expect(first.unfinishedPlans.map((task) => task.taskId)).toEqual(expect.arrayContaining([planned, interrupted.taskId]));
    expect(first.frontier.map((item) => item.title)).toEqual(['Frontier high', 'Frontier low']);
    expect(first.interruptedTurns.map((turn) => turn.turnId)).toContain(interrupted.turnId);

    expect(first.activeTasks.length).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.active);
    expect(first.recentCompleted.length).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.completed);
    expect(first.blockedTasks.length).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.blocked);
    expect(first.deferredTasks.length).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.deferred);
    expect(first.unfinishedPlans.length).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.unfinished);
    expect(first.frontier.length).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.frontier);
    expect(first.interruptedTurns.length).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.interrupted);
    expect(payloadChars(first)).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.characterBudget);

    const other = await f.service.getContinuitySnapshot({ principalId: 'principal-other', projectId: 'project-snapshot' });
    expect(other.currentObjective).toBeNull();
    expect(other.activeTasks).toEqual([]);
    expect(other.frontier).toEqual([]);
  });

  it('does not let large completed history displace current active/deferred/frontier state under the character budget', async () => {
    const f = await fixture('history-pressure');
    const active = await f.service.beginContinuityTurn(
      f.scope, 'route-current-active', 'Current active', undefined, { objective: 'Do the current critical work' }, Date.now() + 60_000,
    );
    const deferred = await seedTask(f, { route: 'route-current-deferred', title: 'Current deferred', status: 'deferred' });
    const source = await f.service.beginContinuityTurn(f.scope, 'route-current-frontier', 'Frontier source', undefined, {}, Date.now() + 60_000);
    await f.service.checkpointContinuity(f.scope, source.taskId, source.turnId, {
      routeContextId: 'route-current-frontier', status: 'completed', summary: 'source done',
      nextCandidates: [
        { title: 'Immediate next', rationale: 'important', priority: 10 },
        { title: 'Secondary next', rationale: 'useful', priority: 5 },
      ],
    });

    for (let index = 0; index < 30; index += 1) {
      await seedTask(f, {
        route: `route-old-${index}`,
        title: `old-${index}-${'x'.repeat(2_500)}`,
        objective: `historical-${index}-${'y'.repeat(2_500)}`,
        status: 'completed',
      });
    }

    const snapshot = await f.service.getContinuitySnapshot(f.scope);
    expect(snapshot.currentObjective).toBe('Do the current critical work');
    expect(snapshot.activeTasks.map((task) => task.taskId)).toContain(active.taskId);
    expect(snapshot.deferredTasks.map((task) => task.taskId)).toContain(deferred);
    expect(snapshot.frontier.map((item) => item.title)).toEqual(['Immediate next', 'Secondary next']);
    expect(snapshot.recentCompleted.length).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.completed);
    expect(payloadChars(snapshot)).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.characterBudget);
  });

  it('attaches execution continuity without breaking the snapshot hash contract', async () => {
    const f = await fixture('execution');
    await f.service.beginContinuityTurn(f.scope, 'route-exec', 'Task', undefined, { objective: 'Service snapshot objective' }, Date.now() + 60_000);
    const snapshot = await f.service.getContinuitySnapshot(f.scope);
    expect(snapshot.currentObjective).toBe('Service snapshot objective');
    expect(snapshot.activeTasks).toHaveLength(1);

    const attached = attachExecutionContinuity(snapshot, {
      activeRuns: [{ runId: 'run-1', objective: 'ship it', state: 'running', lastEventSequence: 4, updatedAt: 2 }],
      interruptedRuns: [{ runId: 'run-0', objective: 'earlier', state: 'interrupted', lastEventSequence: 2, updatedAt: 1 }],
      lastExecutionCheckpoint: null,
    });
    expect(attached.activeRuns?.map((run) => run.runId)).toEqual(['run-1']);
    expect(attached.snapshotHash).not.toBe(snapshot.snapshotHash);
    expect(payloadChars(attached)).toBeLessThanOrEqual(CONTINUITY_SNAPSHOT_LIMITS.characterBudget);
    expect((await f.service.status(f.scope)).integrity.startsWith('file-native:ok')).toBe(true);
  });
});
