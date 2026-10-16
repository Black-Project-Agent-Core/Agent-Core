import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
vi.mock('../src/tracker/activity-tracker.js', () => ({
  activityTracker: { record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [] },
}));
import { applyCheckpoint, markReviewed } from '../src/learning/triggers.js';
import { LearningStateStore, defaultLearningState } from '../src/learning/state.js';
import { LearningService } from '../src/learning/service.js';
import { memoryRememberLearningFinalizationAdvisory } from '../src/memory/mcp/tools.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';

const config = { enabled: true, stateDir: 'fixture', reviewInterval: 10, curatorIntervalHours: 168 };

describe('natural learning finalization continuity', () => {
  it('persists a meaningful checkpoint as pending semantic review evidence', () => {
    const now = new Date('2026-09-30T10:00:00Z');
    const first = applyCheckpoint(defaultLearningState(), {
      idempotencyKey: 'task-1', reason: 'verified-recovery', workspace: 'fixture',
      evidenceRefs: ['verification:fixture-pass', 'source:src/fix.ts'],
    }, config, now);
    expect(first.result.reviewDue).toBe(true);
    expect(first.result.reviewReason).toBe('verified-recovery');
    expect(first.result.pendingReviewCount).toBe(1);
    expect(first.state.pendingReviews).toEqual([expect.objectContaining({
      idempotencyKey: 'task-1', reason: 'verified-recovery', workspace: 'fixture',
      evidenceRefs: ['verification:fixture-pass', 'source:src/fix.ts'], createdAt: now.toISOString(),
    })]);
  });
  it('keeps duplicate checkpoint idempotent without duplicating pending evidence', () => {
    const first = applyCheckpoint(defaultLearningState(), {
      idempotencyKey: 'task-dup', reason: 'verified-recovery', evidenceRefs: ['verification:pass'],
    }, config, new Date('2026-09-30T10:00:00Z'));
    const second = applyCheckpoint(first.state, {
      idempotencyKey: 'task-dup', reason: 'task-complete', evidenceRefs: ['verification:other'],
    }, config, new Date('2026-09-30T10:01:00Z'));
    expect(second.result.duplicate).toBe(true);
    expect(second.result.reviewDue).toBe(true);
    expect(second.result.reviewReason).toBe('verified-recovery');
    expect(second.state.pendingReviews).toHaveLength(1);
    expect(second.result.pendingReview?.evidenceRefs).toEqual(['verification:pass']);
  });

  it('clears pending evidence only when semantic review completes', () => {
    const first = applyCheckpoint(defaultLearningState(), {
      idempotencyKey: 'task-review', evidenceRefs: ['source:fixture'],
    }, config, new Date('2026-09-30T10:00:00Z'));
    expect(first.state.pendingReviews).toHaveLength(1);
    const reviewed = markReviewed(first.state, new Date('2026-09-30T10:02:00Z'), ['task-review']);
    expect(reviewed.pendingReviews).toEqual([]);
    expect(reviewed.sinceReview).toBe(0);
  });
  it('loads legacy version-1 state without pendingReviews and persists the additive field', async () => {
    const fixtureParent = fileURLToPath(new URL('../runtime/tmp', import.meta.url));
    await mkdir(fixtureParent, { recursive: true });
    const root = await mkdtemp(path.join(fixtureParent, 'learning-finalization-'));
    const statePath = path.join(root, 'state.json');
    try {
      await writeFile(statePath, JSON.stringify({
        version: 1, checkpointCount: 3, sinceReview: 2, lastCheckpointAt: null,
        lastReviewAt: null, lastCuratorAt: null, recentIdempotency: [], recentRejections: [],
      }));
      const store = new LearningStateStore({ root, state: statePath });
      const loaded = await store.load();
      expect(loaded.pendingReviews).toEqual([]);
      loaded.pendingReviews = [{ idempotencyKey: 'persisted', reason: 'task-complete',
        evidenceRefs: ['source:fixture'], workspace: 'fixture', createdAt: '2026-09-30T10:00:00.000Z' }];
      await store.save(loaded);
      expect((await store.load()).pendingReviews).toEqual(loaded.pendingReviews);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('status surfaces pending immediate review after a session boundary', async () => {
    const state = applyCheckpoint(defaultLearningState(), {
      idempotencyKey: 'status-task', reason: 'verified-recovery', evidenceRefs: ['verification:pass'],
    }, config, new Date('2026-09-30T10:00:00Z')).state;
    const self = {
      config,
      stateStore: { load: async () => state },
      health: async () => ({ status: 'available', enabled: true, issueCount: 0,
        reviewInterval: 10, curatorIntervalHours: 168, sinkStatus: [] }),
    };
    const result: any = await LearningService.prototype.status.call(self as any);
    expect(result.pendingReviewCount).toBe(1);
    expect(result.reviewDue).toBe(true);
    expect(result.reviewReason).toBe('verified-recovery');
  });

  it('advises verified-recovery Memory promotion that Learning finalization is still required', () => {
    expect(memoryRememberLearningFinalizationAdvisory({
      category: 'operational-reflection', source: { type: 'local-task' }, tags: ['verified-recovery'],
    })).toEqual(expect.objectContaining({
      kind: 'learning-finalization-required', required: true,
      checkpointReason: 'verified-recovery', directMemoryCaptureCompletesFinalization: false,
    }));
  });

  it('does not attach finalization advisory to ordinary durable facts', () => {
    expect(memoryRememberLearningFinalizationAdvisory({
      category: 'durable-fact', source: { type: 'local-task' }, tags: ['verified'],
    })).toBeUndefined();
  });
});

describe('native agent runtime finalization lifecycle', () => {
  async function runtimeFixture(learning: any) {
    const fixtureParent = fileURLToPath(new URL('../runtime/tmp', import.meta.url));
    await mkdir(fixtureParent, { recursive: true });
    const root = await mkdtemp(path.join(fixtureParent, 'agent-runtime-'));
    return { root, runtime: await AgentRuntimeService.initialize(root, learning as any) };
  }

  it('requires verification evidence and persists a terminal task across reopen', async () => {
    const learning = { checkpoint: vi.fn(), review: vi.fn() };
    const { root, runtime } = await runtimeFixture(learning);
    try {
      await runtime.startSession({ sessionId: 'session-a' });
      const task = await runtime.beginTask({ sessionId: 'session-a', taskId: 'task-a', workspace: 'fixture' });
      await expect(runtime.markTerminal({ taskId: task.id, outcome: 'verified' }))
        .rejects.toThrow('AGENT_RUNTIME_VERIFICATION_EVIDENCE_REQUIRED');
      await expect(runtime.markTerminal({ taskId: task.id, outcome: 'verified', verificationRef: 'not-an-evidence-ref' }))
        .rejects.toThrow('AGENT_RUNTIME_VERIFICATION_EVIDENCE_REQUIRED');
      await runtime.markTerminal({ taskId: task.id, outcome: 'verified', reason: 'verified-recovery', verificationRef: 'verification:fixture-pass' });
      const reopened = await AgentRuntimeService.initialize(root, learning as any);
      expect(await reopened.getTask(task.id)).toEqual(expect.objectContaining({
        status: 'verified', terminalOutcome: 'verified', verificationRef: 'verification:fixture-pass',
        finalization: expect.objectContaining({ status: 'not-started', reason: 'verified-recovery' }),
      }));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps verified recovery awaiting semantic review until an explicit review disposition exists', async () => {
    const learning = {
      checkpoint: vi.fn(async () => ({ reviewDue: true, reviewReason: 'verified-recovery' })),
      review: vi.fn(async () => ({ summary: { status: 'no-new-knowledge', complete: true } })),
    };
    const { root, runtime } = await runtimeFixture(learning);
    try {
      await runtime.startSession({ sessionId: 'session-b' });
      await runtime.beginTask({ sessionId: 'session-b', taskId: 'task-b', workspace: 'fixture' });
      await runtime.markTerminal({
        taskId: 'task-b', outcome: 'verified', reason: 'verified-recovery',
        evidenceRefs: ['source:fixture'], verificationRef: 'verification:fixture-pass',
      });
      const pending = await runtime.finalizeTask({ taskId: 'task-b' });
      expect(pending.reviewRequired).toBe(true);
      expect(pending.task.status).toBe('awaiting-review');
      expect(learning.review).not.toHaveBeenCalled();
      const finalized = await runtime.finalizeTask({ taskId: 'task-b', nothingWorthSaving: true });
      expect(finalized.task.status).toBe('finalized');
      expect(finalized.task.finalization.status).toBe('complete');
      expect(learning.checkpoint).toHaveBeenCalledTimes(2);
      expect(learning.review).toHaveBeenCalledWith([], false, { checkpointKeys: ['agent-runtime:task-b:finalization'], taskId: 'task-b', disposition: 'no-new-knowledge' });
      expect((await runtime.health()).pendingFinalizationCount).toBe(0);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('assembles Memory-first context with retrieval identity preserved', async () => {
    const memory = { search: vi.fn(async () => [{
      record: {
        id: 'memory-1', title: 'Prior repair', content: 'Use bounded staging before commit.',
        category: 'operational-reflection', pinned: false, context: 'fixture', keywords: ['staging'], tags: ['verified'],
        provenance: { files: [], workspace: 'fixture' },
      },
      score: 1, matchType: 'direct', components: {},
      delivery: { detail: 'full', content: 'Use bounded staging before commit.', truncated: false, originalContentChars: 34, omittedContentChars: 0 },
      retrievalEvidence: { attemptId: 'attempt-1', contentDigest: 'sha256:a', recordFingerprint: 'sha256:b' },
    }]) };
    const learning = { checkpoint: vi.fn(), review: vi.fn() };
    const fixtureParent = fileURLToPath(new URL('../runtime/tmp', import.meta.url));
    await mkdir(fixtureParent, { recursive: true });
    const root = await mkdtemp(path.join(fixtureParent, 'agent-runtime-memory-'));
    try {
      const runtime = await AgentRuntimeService.initialize(root, learning as any, undefined, memory as any);
      const context = await runtime.assembleMemoryContext('repair commit bug', 'fixture');
      expect(context.retrievalAttemptIds).toEqual(['attempt-1']);
      expect(context.promptText).toContain('historical evidence only');
      expect(context.promptText).toContain('Use bounded staging before commit.');
      expect(memory.search).toHaveBeenCalledWith('repair commit bug', expect.objectContaining({ workspace: 'fixture', rankingProfile: 'fusion' }));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps failed finalization visible and allows a later retry without changing task identity', async () => {
    const failingLearning = { checkpoint: vi.fn(async () => { throw new Error('LEARNING_TEMPORARY_FAILURE'); }), review: vi.fn() };
    const { root, runtime } = await runtimeFixture(failingLearning);
    try {
      await runtime.startSession({ sessionId: 'session-c' });
      await runtime.beginTask({ sessionId: 'session-c', taskId: 'task-c' });
      await runtime.markTerminal({ taskId: 'task-c', outcome: 'verified', reason: 'verified-recovery', verificationRef: 'verification:pass' });
      const failed = await runtime.finalizeTask({ taskId: 'task-c', nothingWorthSaving: true });
      expect(failed.task.status).toBe('finalization-failed');
      expect(failed.task.finalization.issue).toContain('LEARNING_TEMPORARY_FAILURE');

      const healthyLearning = {
        checkpoint: vi.fn(async () => ({ reviewDue: true, reviewReason: 'verified-recovery' })),
        review: vi.fn(async () => ({ summary: { status: 'no-new-knowledge', complete: true } })),
      };
      const reopened = await AgentRuntimeService.initialize(root, healthyLearning as any);
      const retried = await reopened.finalizeTask({ taskId: 'task-c', nothingWorthSaving: true });
      expect(retried.task.id).toBe('task-c');
      expect(retried.task.status).toBe('finalized');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
