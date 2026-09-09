import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { MemoryScope } from '../src/memory/types.js';
import { memoryFixture } from './helpers/memory-fixture.js';

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];

function expectStoreCode(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ name: 'ContinuityStoreError', code });
}

async function fixture(label: string) {
  const f = await memoryFixture(`continuity-${label}`);
  roots.push(f.root);
  closers.push(() => f.service.close());
  const scope: MemoryScope = { principalId: 'principal-a', projectId: 'project-a' };
  return { ...f, scope };
}

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) { try { await close(); } catch {} }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('file-native continuity ledger', () => {
  it('begins a redacted running task/turn and isolates reads by principal and project', async () => {
    const f = await fixture('scope');
    const started = await f.service.beginContinuityTurn(
      f.scope,
      'route-scope-1',
      'Implement continuity password=plain-secret',
      'context token=plain-token',
      { objective: 'Durable continuity token=plain-token', acceptanceCriteria: ['Survives restart'], constraints: ['F: only'] },
      Date.now() + 60_000,
    );

    const task = await f.service.getContinuityTask(f.scope, started.taskId);
    expect(task).toMatchObject({
      taskId: started.taskId,
      principalId: 'principal-a',
      projectId: 'project-a',
      acceptanceCriteria: ['Survives restart'],
      constraints: ['F: only'],
      status: 'running',
    });
    expect(task?.objective).toContain('[REDACTED:TOKEN]');
    expect(`${task?.title} ${task?.objective}`).not.toContain('plain-token');

    expect(await f.service.getContinuityTask({ principalId: 'principal-b', projectId: 'project-a' }, started.taskId)).toBeNull();
    expect(await f.service.getContinuityTask({ principalId: 'principal-a', projectId: 'project-b' }, started.taskId)).toBeNull();
  });

  it('supports explicit scoped resume without duplicating the task and records the state transition', async () => {
    const f = await fixture('resume');
    const first = await f.service.beginContinuityTurn(f.scope, 'route-resume-1', 'Build continuity', undefined, {}, Date.now() + 60_000);
    await f.service.closeContinuityTurn(f.scope, first.turnId, 'interrupted');
    expect((await f.service.getContinuityTask(f.scope, first.taskId))?.status).toBe('interrupted');

    const second = await f.service.beginContinuityTurn(
      f.scope, 'route-resume-2', 'Continue continuity', undefined, { resumeTaskId: first.taskId }, Date.now() + 60_000,
    );
    expect(second.taskId).toBe(first.taskId);
    expect(second.turnId).not.toBe(first.turnId);
    expect((await f.service.getContinuityTask(f.scope, first.taskId))?.status).toBe('running');

    const snapshot = await f.service.getContinuitySnapshot(f.scope);
    expect([...snapshot.activeTasks, ...snapshot.unfinishedPlans].filter((t) => t.taskId === first.taskId)).toHaveLength(1);

    await expectStoreCode(
      f.service.beginContinuityTurn(
        { principalId: 'principal-b', projectId: 'project-a' },
        'route-resume-cross-principal', 'Continue', undefined, { resumeTaskId: first.taskId }, Date.now() + 60_000,
      ),
      'CONTINUITY_TASK_NOT_FOUND',
    );
  });

  it('creates deterministic checkpoint hashes, validates state transitions, and records frontier candidates', async () => {
    const f = await fixture('checkpoint');
    const started = await f.service.beginContinuityTurn(f.scope, 'route-checkpoint-1', 'Implement task', undefined, {}, Date.now() + 60_000);

    const runningInput = {
      routeContextId: 'route-checkpoint-1',
      status: 'running' as const,
      summary: 'Tests are running',
      evidence: [{ type: 'test' as const, ref: 'tests/example.test.ts', result: 'green' }],
    };
    const first = await f.service.checkpointContinuity(f.scope, started.taskId, started.turnId, runningInput);
    const second = await f.service.checkpointContinuity(f.scope, started.taskId, started.turnId, runningInput);
    expect(first.snapshotHash).toBe(second.snapshotHash);
    expect(first.snapshotHash).toMatch(/^[0-9a-f]{64}$/);

    const completed = await f.service.checkpointContinuity(f.scope, started.taskId, started.turnId, {
      routeContextId: 'route-checkpoint-1',
      status: 'completed',
      summary: 'Task verified complete',
      evidence: [{ type: 'test', ref: 'tests/example.test.ts', result: 'pass' }],
      blockers: [],
      nextCandidates: [
        { title: 'Lower priority', rationale: 'Follow-up', priority: 1 },
        { title: 'Higher priority', rationale: 'Next critical path', priority: 5 },
      ],
    });
    expect(completed.taskStatus).toBe('completed');
    expect((await f.service.getContinuityTask(f.scope, started.taskId))?.status).toBe('completed');

    expect((await f.service.listContinuityFrontier(f.scope, 5)).map((row) => [row.title, row.priority])).toEqual([
      ['Higher priority', 5],
      ['Lower priority', 1],
    ]);

    const frontierBefore = await f.service.listContinuityFrontier(f.scope, 5);
    await expectStoreCode(
      f.service.checkpointContinuity(f.scope, started.taskId, started.turnId, {
        routeContextId: 'route-checkpoint-1', status: 'running', summary: 'Illegal reopen after completion',
      }),
      'CONTINUITY_TRANSITION_INVALID',
    );
    expect(await f.service.listContinuityFrontier(f.scope, 5)).toEqual(frontierBefore);
    expect((await f.service.getContinuityTask(f.scope, started.taskId))?.status).toBe('completed');
  });

  it('keeps frontier scoped and deterministically ordered with a bounded limit', async () => {
    const f = await fixture('frontier');
    const started = await f.service.beginContinuityTurn(f.scope, 'route-frontier-1', 'Complete parent', undefined, {}, Date.now() + 60_000);
    await f.service.checkpointContinuity(f.scope, started.taskId, started.turnId, {
      routeContextId: 'route-frontier-1',
      status: 'completed',
      summary: 'done',
      nextCandidates: [
        { title: 'B', rationale: 'same priority', priority: 2 },
        { title: 'A', rationale: 'same priority', priority: 2 },
        { title: 'C', rationale: 'highest', priority: 3 },
      ],
    });

    expect((await f.service.listContinuityFrontier(f.scope, 2)).map((row) => row.title)).toEqual(['C', 'B']);
    expect(await f.service.listContinuityFrontier({ principalId: 'principal-b', projectId: 'project-a' }, 5)).toEqual([]);
    expect(await f.service.listContinuityFrontier({ principalId: 'principal-a', projectId: 'project-b' }, 5)).toEqual([]);
    await expectStoreCode(f.service.listContinuityFrontier(f.scope, 0), 'CONTINUITY_LIMIT_INVALID');
  });

  it('requires a terminal task before a turn can close cleanly; interrupted close marks unfinished work resumable', async () => {
    const f = await fixture('close');
    const interrupted = await f.service.beginContinuityTurn(f.scope, 'route-close-1', 'Interrupted work', undefined, {}, Date.now() + 60_000);
    await expectStoreCode(f.service.closeContinuityTurn(f.scope, interrupted.turnId, 'closed'), 'CONTINUITY_TASK_NOT_TERMINAL');
    await f.service.closeContinuityTurn(f.scope, interrupted.turnId, 'interrupted');
    expect((await f.service.getContinuityTask(f.scope, interrupted.taskId))?.status).toBe('interrupted');
    expect((await f.service.getContinuitySnapshot(f.scope)).interruptedTurns.map((t) => t.turnId)).toContain(interrupted.turnId);

    const completed = await f.service.beginContinuityTurn(f.scope, 'route-close-2', 'Terminal work', undefined, {}, Date.now() + 60_000);
    await f.service.checkpointContinuity(f.scope, completed.taskId, completed.turnId, {
      routeContextId: 'route-close-2', status: 'completed', summary: 'project done', projectTerminal: true,
    });
    await f.service.closeContinuityTurn(f.scope, completed.turnId, 'closed');
    expect((await f.service.getContinuityTask(f.scope, completed.taskId))?.status).toBe('completed');
  });

  it.each(['blocked', 'deferred', 'failed'] as const)('preserves a saved %s task when its turn is interrupted or reconciled', async (status) => {
    const f = await fixture(`preserve-${status}`);
    const blockers = [{ code: 'WAITING', detail: 'Saved external condition.' }];
    const taskIds: string[] = [];
    for (const method of ['close', 'reconcile'] as const) {
      const routeContextId = `route-${status}-${method}`;
      const started = await f.service.beginContinuityTurn(f.scope, routeContextId, 'Saved task state', undefined, {}, Date.now() + 60_000);
      taskIds.push(started.taskId);
      await f.service.checkpointContinuity(f.scope, started.taskId, started.turnId, {
        routeContextId, status, summary: 'Saved semantic state', blockers, projectTerminal: status === 'failed',
      });
      const before = await f.service.getContinuityTask(f.scope, started.taskId);
      if (method === 'close') {
        await f.service.closeContinuityTurn(f.scope, started.turnId, 'interrupted');
      } else {
        expect(await f.service.reconcileContinuity(f.scope, [])).toEqual({
          interruptedTurnIds: [started.turnId], interruptedTaskIds: [],
        });
      }
      expect(await f.service.getContinuityTask(f.scope, started.taskId)).toEqual(before);
      expect((await f.service.getContinuitySnapshot(f.scope)).interruptedTurns.map((turn) => turn.turnId)).toContain(started.turnId);
    }
    expect(await f.service.reconcileContinuity(f.scope, [])).toEqual({ interruptedTurnIds: [], interruptedTaskIds: [] });
    for (const taskId of taskIds) expect(await f.service.getContinuityTask(f.scope, taskId)).toMatchObject({ status, blockers });
  });

  it('reconciles turns abandoned by a crashed route context and survives a service restart', async () => {
    const f = await fixture('recovery');
    const abandoned = await f.service.beginContinuityTurn(f.scope, 'route-gone', 'Work in progress', undefined, {}, Date.now() + 60_000);
    const alive = await f.service.beginContinuityTurn(f.scope, 'route-alive', 'Other work', undefined, {}, Date.now() + 60_000);
    await f.service.close();

    const restarted = new (await import('../src/memory/service.js')).MemoryService(f.config);
    closers.push(() => restarted.close());
    const reconciled = await restarted.reconcileContinuity(f.scope, ['route-alive']);
    expect(reconciled.interruptedTurnIds).toEqual([abandoned.turnId]);
    expect(reconciled.interruptedTaskIds).toEqual([abandoned.taskId]);
    expect((await restarted.getContinuityTask(f.scope, abandoned.taskId))?.status).toBe('interrupted');
    expect((await restarted.getContinuityTask(f.scope, alive.taskId))?.status).toBe('running');
  });
});
