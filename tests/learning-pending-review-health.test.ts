import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
import { memoryTaskFixture } from './memory/memory-task-test-utils.js';
import { installInvocationContext } from '../src/mcp/external-controller-tool-support.js';
import { registerLearningTools } from '../src/mcp/learning-tools.js';
import { createMemoryScopeResolver } from '../src/memory/mcp/scope.js';

// The Learning loop must stay honest about its own backlog: a checkpoint keeps the text that explains
// it, a review that nobody can still make does not keep every later checkpoint "due", an abandoned
// checkpoint has one sanctioned way to be closed, and a status call is cheap enough to read.

const DAY = 24 * 60 * 60 * 1000;
const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function service() {
  const f = await memoryTaskFixture(); roots.push(f.root);
  return f;
}

/** Runs `action` with the wall clock set to `when`; only Date is faked, so file I/O is unaffected. */
async function at<T>(when: number, action: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(when);
  try { return await action(); } finally { vi.useRealTimers(); }
}

async function external(transport = 'transport') {
  const f = await service();
  const task = await f.start('owner-a', transport, 'health-regression');
  const handlers = new Map<string, (args: any, ctx: any) => Promise<any>>();
  const server = { registerTool(name: string, _config: unknown, callback: any) { handlers.set(name, callback); } };
  installInvocationContext(server as any, { external: f.external, sessionId: transport, ownerId: 'owner-a', checkpointGranted: false });
  const resolver = createMemoryScopeResolver({ memoryOwner: 'owner-a', externalControllerLearning: f.external });
  registerLearningTools(server as any, f.learning, undefined, f.external, transport, resolver, false, true);
  const invoke = async (args: any) => {
    const result = await handlers.get('learning')!(args, { mcpReq: {} });
    const text = result.content?.[0]?.text ?? '';
    return { isError: result.isError === true, text, json: result.isError ? undefined : JSON.parse(text) };
  };
  return { ...f, task, invoke };
}

describe('checkpoint summary', () => {
  it('keeps the summary on the pending review so a later reader can still judge it', async () => {
    const f = await service();
    await f.learning.checkpoint({ idempotencyKey: 'summary-kept', workspace: 'agent-core', summary: 'Closed the loop on X; evidence in Y.' });
    const status: any = await f.learning.status();
    expect(status.state.pendingReviews[0]).toMatchObject({ idempotencyKey: 'summary-kept', summary: 'Closed the loop on X; evidence in Y.' });
  });

  it('drops a credential-shaped summary, says so, and still records the checkpoint', async () => {
    const f = await service();
    const result: any = await f.learning.checkpoint({ idempotencyKey: 'summary-unsafe', summary: 'password=correcthorse12345' });
    expect(result).toMatchObject({ advanced: true, summaryDropped: true });
    const status: any = await f.learning.status();
    expect(status.state.pendingReviews[0].summary).toBeUndefined();
  });
});

describe('stale-aware reviewDue', () => {
  it('stops reporting a review as due when every pending review is older than a week', async () => {
    const f = await service();
    await f.learning.checkpoint({ idempotencyKey: 'old-one' });
    const week = await f.learning.status({ now: new Date(Date.now() + 8 * DAY) }) as any;
    expect(week).toMatchObject({ pendingReviewCount: 1, freshReviewCount: 0, staleReviewCount: 1, reviewDue: false, reviewReason: null });
    expect(typeof week.oldestPendingAt).toBe('string');
    const now = await f.learning.status({ now: new Date() }) as any;
    expect(now).toMatchObject({ pendingReviewCount: 1, freshReviewCount: 1, staleReviewCount: 0, reviewDue: true });
  });

  it('keeps the total count, and takes the due reason from the fresh reviews only', async () => {
    const f = await service();
    const start = Date.parse('2026-10-01T00:00:00Z');
    await at(start, () => f.learning.checkpoint({ idempotencyKey: 'stale-recovery', reason: 'verified-recovery' }));
    await at(start + 8 * DAY, () => f.learning.checkpoint({ idempotencyKey: 'fresh-task', reason: 'task-complete' }));
    const status = await f.learning.status({ now: new Date(start + 8 * DAY) }) as any;
    expect(status).toMatchObject({ pendingReviewCount: 2, freshReviewCount: 1, staleReviewCount: 1, reviewDue: true, reviewReason: 'task-complete' });
    expect(status.oldestPendingAt).toBe('2026-10-01T00:00:00.000Z');
  });
});

describe('compact status', () => {
  it('answers the questions a reviewer asks without shipping the whole history', async () => {
    const f = await service();
    for (let index = 0; index < 40; index += 1) {
      await f.learning.checkpoint({ idempotencyKey: `closed-${index}` });
      await f.learning.review([], false, { checkpointKeys: [`closed-${index}`], disposition: 'no-new-knowledge' });
    }
    await f.learning.checkpoint({ idempotencyKey: 'open-one', reason: 'verified-recovery', summary: 'Recovered the worker.', evidenceRefs: ['source:one'] });
    const full = JSON.stringify(await f.learning.status());
    const compact: any = await f.learning.status({ view: 'compact' });
    expect(compact).not.toHaveProperty('state');
    expect(compact).toMatchObject({ pendingReviewCount: 1, reviewDue: true, reviewReason: 'verified-recovery', curatorDue: false });
    expect(compact.pending).toHaveLength(1);
    expect(compact.pending[0]).toMatchObject({ idempotencyKey: 'open-one', reason: 'verified-recovery', evidenceRefCount: 1, hasTask: false, summary: 'Recovered the worker.' });
    expect(compact.pending[0].ageDays).toBeGreaterThanOrEqual(0);
    expect(compact.decisions).toMatchObject({ total: 40, byStatus: { 'no-new-knowledge': 40 } });
    expect(compact.decisions.recent.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(compact).length).toBeLessThan(full.length * 0.5);
  });

  it('is opt-in: the default stays the full state', async () => {
    const f = await service();
    expect(await f.learning.status()).toHaveProperty('state');
  });

  it('is its own action on the tool, with the summary the controller wrote, while status stays full', async () => {
    const f = await external();
    const checkpoint = await f.invoke({ action: 'checkpoint', taskId: f.task!.id, workspace: 'agent-core',
      idempotencyKey: 'backlog-1', reason: 'task-complete', summary: 'Backlog check summary.' });
    expect(checkpoint.isError, checkpoint.text).toBe(false);
    const compact = await f.invoke({ action: 'backlog' });
    expect(compact.isError, compact.text).toBe(false);
    expect(compact.json).toMatchObject({ view: 'compact', pendingReviewCount: 1, reviewDue: true });
    expect(compact.json).not.toHaveProperty('state');
    expect(compact.json.pending[0]).toMatchObject({ idempotencyKey: 'backlog-1', hasTask: true, summary: 'Backlog check summary.' });
    expect((await f.invoke({ action: 'status' })).json).toHaveProperty('state');
  });
});

describe('closing an abandoned review', () => {
  const NOTE = 'Abandoned in an earlier session; its content was not kept.';
  const review = (task: { id: string }, keys: string[], extra: Record<string, unknown> = {}) =>
    ({ action: 'review', taskId: task.id, workspace: 'agent-core', checkpointKeys: keys, disposition: 'awaiting-verification', summary: NOTE, ...extra });

  it('keeps refusing a recent checkpoint that belongs to no episode of this session', async () => {
    const f = await external();
    await f.learning.checkpoint({ idempotencyKey: 'recent-orphan', workspace: 'agent-core' });
    const result = await f.invoke(review(f.task!, ['recent-orphan']));
    expect(result.isError).toBe(true);
    expect(result.text).toContain('LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND');
  });

  it('closes a checkpoint older than a week that no episode owns, and records who and why', async () => {
    const f = await external();
    await at(Date.now() - 8 * DAY, () => f.learning.checkpoint({ idempotencyKey: 'old-orphan', workspace: 'agent-core' }));
    const result = await f.invoke(review(f.task!, ['old-orphan']));
    expect(result.isError, result.text).toBe(false);
    const status: any = await f.learning.status();
    expect(status.state.pendingReviews.map((item: any) => item.idempotencyKey)).not.toContain('old-orphan');
    expect(status.state.reviewDecisions['old-orphan']).toMatchObject({
      status: 'awaiting-verification', complete: true,
      resolution: { kind: 'stale-orphan', resolvedByTaskId: f.task!.id, note: NOTE },
    });
  });

  it('needs a written reason, and never takes candidates on this path', async () => {
    const f = await external();
    await at(Date.now() - 8 * DAY, () => f.learning.checkpoint({ idempotencyKey: 'old-orphan', workspace: 'agent-core' }));
    const silent = await f.invoke(review(f.task!, ['old-orphan'], { summary: undefined }));
    expect(silent.isError).toBe(true);
    expect(silent.text).toContain('LEARNING_ORPHAN_RESOLUTION_NOTE_REQUIRED');
    const withCandidate = await f.invoke(review(f.task!, ['old-orphan'], { candidates: [{ kind: 'durable-fact', content: 'x', verified: false }] }));
    expect(withCandidate.isError).toBe(true);
    expect(withCandidate.text).toContain('LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND');
    expect(((await f.learning.status()) as any).pendingReviewCount).toBe(1);
  });

  it('closes an old checkpoint of an untouched episode and clears that episode too', async () => {
    const f = await external();
    const other = await at(Date.now() - 8 * DAY, async () => {
      const episode = await f.start('owner-a', 'other-transport', 'abandoned-task');
      await f.learning.checkpoint({ idempotencyKey: 'foreign-old', taskId: episode.id, workspace: 'agent-core' });
      await f.external.recordLearningCheckpoint('other-transport', 'agent-core', 'foreign-old', episode.id);
      return episode;
    });
    const result = await f.invoke(review(f.task!, ['foreign-old']));
    expect(result.isError, result.text).toBe(false);
    const decision = ((await f.learning.status()) as any).state.reviewDecisions['foreign-old'];
    expect(decision).toMatchObject({ complete: true, taskId: other.id, resolution: { kind: 'stale-orphan', resolvedByTaskId: f.task!.id } });
    const episodes = (await (f.external as any).load()).episodes;
    const owner = episodes.find((item: any) => item.id === other.id);
    expect(owner.checkpointKeys ?? []).not.toContain('foreign-old');
    expect(owner.pendingLearning).toBe(false);
  });

  it('never treats a task id that is not an external episode as abandoned: Native entries stay with Native', async () => {
    const f = await external();
    const key = 'agent-runtime:native-task-1:finalization';
    await at(Date.now() - 8 * DAY, () => f.learning.checkpoint({ idempotencyKey: key, taskId: 'native-task-1', workspace: 'agent-core' }));
    const result = await f.invoke(review(f.task!, [key]));
    expect(result.isError).toBe(true);
    expect(result.text).toContain('LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND');
    expect(((await f.learning.status()) as any).pendingReviewCount).toBe(1);
  });

  it('refuses an old checkpoint whose episode was touched recently', async () => {
    const f = await external();
    const other = await f.start('owner-a', 'other-transport', 'live-task');
    await at(Date.now() - 8 * DAY, () => f.learning.checkpoint({ idempotencyKey: 'foreign-live', taskId: other.id, workspace: 'agent-core' }));
    await f.external.recordLearningCheckpoint('other-transport', 'agent-core', 'foreign-live', other.id);
    const result = await f.invoke(review(f.task!, ['foreign-live']));
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND|LEARNING_EXTERNAL_SCOPE_MISMATCH/);
  });
});

describe('procedure scaffold on a verified recovery', () => {
  it('hands the controller the questions that make a procedure candidate admissible', async () => {
    const f = await external();
    const result = await f.invoke({ action: 'checkpoint', taskId: f.task!.id, workspace: 'agent-core', idempotencyKey: 'recovered-1', reason: 'verified-recovery', evidenceRefs: ['source:recovery'] });
    expect(result.isError, result.text).toBe(false);
    const scaffold = result.json.procedureScaffold;
    expect(scaffold.executionAuthority).toBe(false);
    expect(scaffold.questions).toHaveLength(5);
    expect(scaffold.questions.join(' ')).toMatch(/action/i);
    expect(scaffold.questions.join(' ')).toMatch(/independent/i);
    expect(scaffold.questions.join(' ')).toMatch(/reuse/i);
    expect(scaffold.propose).toMatchObject({ tool: 'controller_learning', action: 'procedure', procedureOperation: 'propose' });
    expect(scaffold.payloadFields).toContain('rollback');
  });

  it('stays out of the way for an ordinary task-complete checkpoint', async () => {
    const f = await external();
    const result = await f.invoke({ action: 'checkpoint', taskId: f.task!.id, workspace: 'agent-core', idempotencyKey: 'plain-1', reason: 'task-complete' });
    expect(result.isError, result.text).toBe(false);
    expect(result.json).not.toHaveProperty('procedureScaffold');
  });
});
