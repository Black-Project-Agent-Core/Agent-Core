import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
import { externalImprovement, type ExternalImprovementScope } from '../src/learning/external-improvements.js';
import { LearningStateStore, defaultLearningState } from '../src/learning/state.js';
import { createProposalDocuments } from '../src/learning/proposal-documents.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve('runtime/tmp') || !path.basename(root).startsWith('external-improvements-')) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
const hash = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');

async function fixture() {
  const parent = path.resolve('runtime/tmp'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'external-improvements-')); roots.push(root);
  const documentPath = 'docs/proposals/improve-review.md', file = path.join(root, documentPath);
  await mkdir(path.dirname(file), { recursive: true });
  const text = '# Improve review\n\nStatus: PROPOSED\n\nRevision: 1\n\nReview the exact task evidence.\n';
  await writeFile(file, text);
  const store = new LearningStateStore({ root: path.join(root, 'learning'), state: path.join(root, 'learning/state.json') });
  await store.save(defaultLearningState());
  const documents = createProposalDocuments(root, { listSkills: async () => [] });
  const scope: ExternalImprovementScope = { ownerId: 'fixture-owner', workspace: 'agent-core', workspaceIdentity: 'registered-fixture', taskId: 'origin-task', sessionId: 'origin-chat' };
  const current = vi.fn(async () => {});
  const call = (input: unknown, override: Partial<ExternalImprovementScope> = {}): Promise<any> => externalImprovement(store, documents, { ...scope, ...override }, input, current);
  const register = { operation: 'register', id: 'review-evidence', operationId: 'register-review', expectedRevision: null,
    documentPath, documentDigest: hash(text), evidenceRefs: ['source:task-review-v1'],
    decisionNeeded: 'Decide whether this exact revision should be pursued.', nextAction: 'Review the proposed scope.',
    question: { decision: 'Choose the review scope.', missingEvidence: 'A held-out comparison is unavailable.' } };
  const inspect = async () => (await call({ operation: 'inspect', id: register.id })).items[0];
  const update = async (operation: string, operationId: string, fields: Record<string, unknown> = {}, override: Partial<ExternalImprovementScope> = {}) => {
    const latest = await inspect();
    return call({ operation, id: register.id, operationId, expectedRevision: latest.revision, ...fields }, override);
  };
  const feedback = (decision: string, operationId = 'feedback-' + decision, fields: Record<string, unknown> = {}) => update('feedback', operationId,
    { decision, reason: 'Controller-reported response to this exact proposal.', evidenceRefs: ['source:explicit-response'], ...fields });
  const bytes = () => readFile(store.paths.state, 'utf8');
  const revise = async () => {
    const revised = text + '\nRevision 2: retain the same underlying task evidence.\n'; await writeFile(file, revised);
    return hash(revised);
  };
  return { root, store, documents, scope, current, call, register, inspect, update, feedback, bytes, revise };
}

describe('external improvement lifecycle', () => {
  it('persists one exact document and its decision question without inventing delivery or consent', async () => {
    const f = await fixture(); const result = await f.call(f.register);
    expect(result.record).toMatchObject({ documentPath: f.register.documentPath, documentDigest: f.register.documentDigest,
      evidenceRefs: f.register.evidenceRefs, status: 'observed', question: f.register.question, sourceTaskId: f.scope.taskId, originSession: f.scope.sessionId });
    expect(result).toMatchObject({ delivery: 'not-declared', response: 'unknown', executionAuthority: false });
    const reopened = new LearningStateStore(f.store.paths);
    expect((await reopened.load()).externalImprovements).toEqual([result.record]);
  });

  it('supports exact idempotent replay, refuses operation conflicts and preserves unrelated Learning fields', async () => {
    const f = await fixture(); const first = await f.call(f.register), before = await f.bytes();
    expect(await f.call(f.register)).toMatchObject({ duplicate: true, revision: first.revision, notice: null });
    expect(await f.bytes()).toBe(before);
    await expect(f.call({ ...f.register, nextAction: 'A different action under the same operation ID.' })).rejects.toThrow('IMPROVEMENT_OPERATION_CONFLICT');
    expect(await f.bytes()).toBe(before);
    const state = await f.store.load(); expect(state.checkpointCount).toBe(0); expect(state.pendingReviews).toEqual([]); expect(state.skillProposals).toEqual([]);
  });

  it('uses compare-and-swap for every new mutation', async () => {
    const f = await fixture(); await f.call(f.register); const before = await f.bytes();
    await expect(f.call({ operation: 'notice', id: f.register.id, operationId: 'stale-notice', expectedRevision: null })).rejects.toThrow('IMPROVEMENT_REVISION_CONFLICT');
    expect(await f.bytes()).toBe(before);
  });

  it('allows at most one new suggestion/question for a source task', async () => {
    const f = await fixture(); await f.call(f.register); const before = await f.bytes();
    await expect(f.call({ ...f.register, id: 'another-proposal', operationId: 'another-register' })).rejects.toThrow('IMPROVEMENT_ONE_PER_TASK');
    expect(await f.bytes()).toBe(before);
  });

  it('serializes concurrent proposals so one source task cannot gain two opportunities', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([f.call(f.register), f.call({ ...f.register, id: 'another-proposal', operationId: 'another-register' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ message: 'IMPROVEMENT_ONE_PER_TASK' }) });
    expect((await f.store.load()).externalImprovements).toHaveLength(1);
  });

  it.each(['wrong-digest', 'drift', 'outside-path', 'missing-document'])('refuses %s without writing state', async mode => {
    const f = await fixture(); const before = await f.bytes();
    if (mode === 'drift') await f.revise();
    const input = { ...f.register, ...(mode === 'wrong-digest' ? { documentDigest: 'sha256:' + 'a'.repeat(64) }
      : mode === 'outside-path' ? { documentPath: '../private.md' }
        : mode === 'missing-document' ? { documentPath: 'docs/proposals/missing.md' } : {}) };
    await expect(f.call(input)).rejects.toThrow(mode === 'outside-path' ? 'IMPROVEMENT_DOCUMENT_PATH_INVALID'
      : mode === 'missing-document' ? 'IMPROVEMENT_DOCUMENT_UNAVAILABLE' : 'IMPROVEMENT_DOCUMENT_DRIFT');
    expect(await f.bytes()).toBe(before);
  });

  it('checks current task again after document I/O and refuses stale writes', async () => {
    const f = await fixture(); const before = await f.bytes();
    const read = f.documents.read.bind(f.documents);
    vi.spyOn(f.documents, 'read').mockImplementation(async input => {
      const result = await read(input); f.current.mockRejectedValue(new Error('TEST_TASK_ROTATED')); return result;
    });
    await expect(f.call(f.register)).rejects.toThrow('TEST_TASK_ROTATED'); expect(await f.bytes()).toBe(before);
  });

  it('keeps busy suppression and silence distinct from delivery and response', async () => {
    const f = await fixture(); await f.call(f.register);
    const busy = await f.update('notice', 'busy-notice', { busy: true });
    expect(busy).toMatchObject({ suppression: 'user-busy', notice: null, delivery: 'not-declared', response: 'unknown', executionAuthority: false });
    const visible = await f.update('notice', 'visible-notice');
    expect(visible.notice).toMatchObject({ documentDigest: f.register.documentDigest, delivery: 'unconfirmed', question: f.register.question });
    expect(visible).toMatchObject({ delivery: 'unconfirmed', response: 'unknown', executionAuthority: false });
    const repeated = await f.update('notice', 'repeated-notice');
    expect(repeated).toMatchObject({ suppression: 'already-exposed', notice: null, response: 'unknown' });
  });

  it.each([{ taskId: 'another-task' }, { sessionId: 'another-chat' }])('suppresses notices outside their origin %j', async override => {
    const f = await fixture(); await f.call(f.register);
    expect(await f.update('notice', 'foreign-origin-notice', {}, override)).toMatchObject({ suppression: 'origin-task-required', notice: null, executionAuthority: false });
  });

  it.each(['deferred', 'rejected'])('keeps %s quiet for unchanged evidence even after a prose revision', async decision => {
    const f = await fixture(); await f.call(f.register); await f.feedback(decision);
    const digest = await f.revise();
    await f.update('register', 'register-revised-prose', { ...f.register, operation: 'register', operationId: 'register-revised-prose', documentDigest: digest,
      expectedRevision: (await f.inspect()).revision });
    const notice = await f.update('notice', 'quiet-after-prose-revision');
    expect(notice.notice).toBeNull(); expect(notice.suppression).toBe(decision === 'deferred' ? 'deferred' : 'rejected-unchanged-evidence');
  });

  it('reconsiders rejected evidence only when the task evidence changes', async () => {
    const f = await fixture(); await f.call(f.register); await f.feedback('rejected');
    await f.update('register', 'register-new-evidence', { ...f.register, operation: 'register', operationId: 'register-new-evidence',
      expectedRevision: (await f.inspect()).revision, evidenceRefs: ['source:task-review-v2'] });
    const result = await f.update('notice', 'notice-new-evidence');
    expect(result.notice).not.toBeNull(); expect(result.executionAuthority).toBe(false);
  });

  it('respects an explicit deferred review time without scheduling or advancing it', async () => {
    const f = await fixture(); await f.call(f.register);
    const future = new Date(Date.now() + 60_000).toISOString(); await f.feedback('deferred', 'defer-timed', { reviewAt: future });
    expect(await f.update('notice', 'before-review-time')).toMatchObject({ suppression: 'deferred', notice: null });
    const realNow = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(realNow + 120_000);
    expect((await f.update('notice', 'after-review-time')).notice).not.toBeNull();
    expect((await f.inspect()).record.feedback.at(-1).reviewAt).toBe(future);
  });

  it('records explicit feedback and progress as controller reports without granting authority', async () => {
    const f = await fixture(); await f.call(f.register);
    await expect(f.update('progress', 'progress-without-response', { status: 'in-progress', evidenceRefs: ['source:work-plan'] })).rejects.toThrow('IMPROVEMENT_FEEDBACK_REQUIRED');
    const accepted = await f.feedback('accepted'); expect(accepted).toMatchObject({ response: 'controller-reported', executionAuthority: false });
    const inProgress = await f.update('progress', 'work-started', { status: 'in-progress', evidenceRefs: ['source:work-plan'] }, { taskId: 'followup-task', sessionId: 'followup-chat' });
    expect(inProgress.record).toMatchObject({ status: 'in-progress', sourceTaskId: f.scope.taskId, originSession: f.scope.sessionId });
    expect(inProgress.record.progress[0].taskId).toBe('followup-task'); expect(inProgress.executionAuthority).toBe(false);
    expect(await f.update('notice', 'notice-during-work')).toMatchObject({ suppression: 'in-progress', notice: null });
    const completed = await f.update('progress', 'work-completed', { status: 'completed', evidenceRefs: ['verification:fixture-work'] });
    expect(completed.record.status).toBe('completed'); expect(completed.executionAuthority).toBe(false);
    expect(await f.update('notice', 'notice-after-work')).toMatchObject({ suppression: 'completed', notice: null });
  });

  it.each(['document', 'evidence'])('requires fresh exact feedback when accepted %s changes', async change => {
    const f = await fixture(); await f.call(f.register); const accepted = await f.feedback('accepted');
    const documentDigest = change === 'document' ? await f.revise() : f.register.documentDigest;
    const latest = await f.inspect();
    const revised = await f.call({ ...f.register, expectedRevision: latest.revision, operationId: 'revise-accepted', documentDigest,
      ...(change === 'evidence' ? { evidenceRefs: ['source:task-review-v2'] } : {}) });
    expect(revised.record.status).toBe('observed'); expect(revised.record.feedback).toEqual(accepted.record.feedback);
    await expect(f.update('progress', 'stale-accepted-progress', { status: 'in-progress', evidenceRefs: ['source:work-plan'] })).rejects.toThrow('IMPROVEMENT_FEEDBACK_REQUIRED');
    expect((await f.update('notice', 'changed-acceptance-notice')).notice).not.toBeNull();
    await f.feedback('accepted', 'accept-revised');
    expect((await f.update('progress', 'revised-work-started', { status: 'in-progress', evidenceRefs: ['source:work-plan'] })).record.status).toBe('in-progress');
  });

  it('isolates owner/workspace records and cannot turn foreign inspect into feedback authority', async () => {
    const f = await fixture(); await f.call(f.register); const before = await f.bytes();
    const foreign = await f.call({ operation: 'inspect', id: f.register.id }, { ownerId: 'another-owner' });
    expect(foreign.items).toEqual([]); expect(foreign.executionAuthority).toBe(false);
    const current = await f.inspect();
    await expect(f.call({ operation: 'feedback', id: f.register.id, operationId: 'foreign-feedback', expectedRevision: current.revision,
      decision: 'accepted', reason: 'Controller response.', evidenceRefs: ['source:response'] }, { ownerId: 'another-owner' })).rejects.toThrow('IMPROVEMENT_REVISION_CONFLICT');
    expect(await f.bytes()).toBe(before);
  });
});
