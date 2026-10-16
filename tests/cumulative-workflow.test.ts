import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
import { LearningStateStore, defaultLearningState } from '../src/learning/state.js';
import { applyCheckpoint } from '../src/learning/triggers.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { LearningService } from '../src/learning/service.js';
import { MemoryService } from '../src/memory/service.js';
import { rankKnowledge, buildKnowledgeSynthesisPacket } from '../src/agent-knowledge-synthesis.js';
import { resolveWorkflowEvidence, validateWorkflowUse } from '../src/learning/workflow-evidence.js';
import { verifyWorkflowAnswer, WORKFLOW_VERIFIER_REVISION, registerWorkflowVerification, recheckWorkflowReport } from '../src/memory/workflow-verifier.js';
import * as atomicFile from '../src/persistence/atomic-file.js';
import { SkillService } from '../src/skills/service.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const parent = fileURLToPath(new URL('../runtime/tmp/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'workflow-'));
  roots.push(root);
  return root;
}
async function hostObservation<T>(action: () => Promise<T>): Promise<T> {
  // Exercise attribution independently of disk latency and the observational deadline.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  try { return await action(); }
  finally { clock.mockRestore(); vi.useRealTimers(); }
}
const config = { enabled: true, stateDir: '', reviewInterval: 10, curatorIntervalHours: 168 };
async function learningFixture() {
  const root = await fixture();
  await mkdir(path.join(root, 'runtime/memory'), { recursive: true });
  await writeFile(path.join(root, 'runtime/memory/00-agent-core-memory.md'), '# Agent Core Foundational Memory\n\nTest foundation.');
  const memory = await MemoryService.initialize(root);
  const learning = await LearningService.initialize({ ...config, stateDir: path.join(root, 'runtime/learning') }, memory);
  return { root, memory, learning };
}

async function verifiedReport(root: string, taskId: string, pass = true) {
  const digest = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
  const test = JSON.stringify({ domain: 'engineering', tests: [{ input: 2, expected: 4 }] });
  const answer = pass ? 'n => n * 2' : 'n => n * 3';
  const testPath = path.join(root, taskId + '-case.json'), answerPath = path.join(root, taskId + '-answer.js');
  await writeFile(testPath, test); await writeFile(answerPath, answer);
  const report = JSON.stringify({ verifierRevision: WORKFLOW_VERIFIER_REVISION, taskId,
    case: { path: testPath, digest: digest(test) }, answer: { path: answerPath, digest: digest(answer) } });
  const reportPath = path.join(root, taskId + '-report.json'); await writeFile(reportPath, report);
  registerWorkflowVerification({ taskId, case: { path: testPath, digest: digest(test) }, answerPath });
  return { ref: 'verification:' + reportPath + '#' + digest(report), action: 'file:' + answerPath + '#' + digest(answer), answerPath };
}

describe('cumulative workflow persistence and task identity', () => {
  it('refuses to replace unreadable Learning, external, and Native state', async () => {
    const root = await fixture();
    const learningPath = path.join(root, 'state.json');
    const store = new LearningStateStore({ root, state: learningPath });
    await store.save(defaultLearningState());
    const external = await ExternalControllerLearningService.initialize({ stateDir: root, memory: {} as any, learning: {} as any });
    await external.touchSession('transport');
    const native = await AgentRuntimeService.initialize(root, {} as any);
    await native.startSession({ sessionId: 'native', provider: 'replacement-provider', model: 'replacement-model' });
    const externalPath = path.join(root, 'external-controller.json');
    const nativePath = path.join(root, 'runtime/agent-runtime/state.json');
    for (const file of [learningPath, externalPath, nativePath]) await writeFile(file, '{broken');
    await expect(store.mutate('checkpoint', state => ({ state, result: null }))).rejects.toThrow(/DEGRADED/);
    await expect(external.touchSession('another')).rejects.toThrow(/DEGRADED/);
    await expect(native.startSession({ sessionId: 'another' })).rejects.toThrow(/DEGRADED/);
    for (const file of [learningPath, externalPath, nativePath]) expect(await readFile(file, 'utf8')).toBe('{broken');
    expect(await external.status()).toMatchObject({ status: 'degraded' });
  });

  it('preserves history after a failed write and refuses a missing previously persisted state', async () => {
    const root = await fixture(); const file = path.join(root, 'state.json');
    const store = new LearningStateStore({ root, state: file });
    await store.save(defaultLearningState());
    const before = await readFile(file, 'utf8');
    const write = vi.spyOn(atomicFile, 'writeOwnedFileAtomic').mockRejectedValueOnce(new Error('EIO'));
    await expect(store.mutate('checkpoint', state => ({ state: { ...state, checkpointCount: 1 }, result: null }))).rejects.toThrow('EIO');
    write.mockRestore();
    expect(await readFile(file, 'utf8')).toBe(before);
    await rm(file);
    await expect(store.mutate('checkpoint', state => ({ state, result: null }))).rejects.toThrow(/DEGRADED/);
    expect(await readFile(file + '.last-good', 'utf8')).toBe(before);
  });

  it('retains pending checkpoints beyond the old 64-item window', () => {
    let state = defaultLearningState();
    for (let index = 0; index < 70; index++) state = applyCheckpoint(state, { idempotencyKey: `task-${index}` }, config).state;
    expect(state.pendingReviews).toHaveLength(70);
    expect(applyCheckpoint(state, { idempotencyKey: 'task-0' }, config).result.duplicate).toBe(true);
  });

  it('starts idempotent explicit tasks and freezes closed metrics on a reused transport', async () => {
    const root = await fixture();
    const memory = await MemoryService.initialize(root);
    const service = await ExternalControllerLearningService.initialize({ stateDir: root, memory, learning: {} as any });
    const binding = { ownerId: 'fixture-owner', workspaceIdentityKey: memory.registeredWorkspaceIdentity('agent-core').key };
    const start = (taskKey: string) => service.startEpisode('transport', { taskKey, workspace: 'agent-core' }, binding);
    const first = await start('first');
    const invocation = await hostObservation(() => service.captureToolInvocationContext({ invocationId: 'first-read', processSessionId: 'fixture-process', sessionId: 'transport', ownerId: binding.ownerId }));
    expect(invocation.binding).toBe('bound');
    await hostObservation(() => service.recordToolOutcome({ sessionId: 'transport', tool: 'read_file', argumentKeys: [], outcome: 'success', readOnly: true, invocationContext: invocation }));
    const duplicate = await start('first');
    expect(duplicate.id).toBe(first.id);
    await service.verifyEpisode('transport', { outcome: 'verified', verificationRef: 'verification:first' }, invocation);
    await service.recordLearningCheckpoint('transport', undefined, 'first', first.id);
    await service.recordLearningReview('transport', 'no-new-knowledge', { first: { complete: true, status: 'no-new-knowledge' } });
    const terminal = await service.getEpisode('transport');
    expect(terminal?.closedAt).toBeTruthy();
    expect(terminal?.metrics.toolCalls).toBe(1);
    const late = await hostObservation(() => service.captureToolInvocationContext({ invocationId: 'late-learning', processSessionId: 'fixture-process', sessionId: 'transport', ownerId: binding.ownerId }));
    await hostObservation(() => service.recordToolOutcome({ sessionId: 'transport', tool: 'learning', argumentKeys: [], outcome: 'success', readOnly: true, invocationContext: late }));
    expect((await service.getEpisode('transport'))?.metrics).toEqual(terminal?.metrics);
    const second = await start('second');
    expect(second.id).not.toBe(first.id);
    expect(second.metrics.toolCalls).toBe(0);
  });

  it('recovers valid historical episodes without replacing current records or resolving pending work', async () => {
    const root = await fixture();
    const memory = await MemoryService.initialize(root);
    const service = await ExternalControllerLearningService.initialize({ stateDir: root, memory, learning: {} as any });
    const old = await service.startEpisode('old', { taskKey: 'historical' } as any);
    const file = path.join(root, 'external-controller.json');
    const backup = file + '.corrupt.fixture';
    await writeFile(backup, await readFile(file));
    await writeFile(file, JSON.stringify({ version: 1, episodes: [], procedures: [], sessionHeads: {} }));
    const current = await service.startEpisode('current', { taskKey: 'current', workspace: 'agent-core' },
      { ownerId: 'fixture-owner', workspaceIdentityKey: memory.registeredWorkspaceIdentity('agent-core').key });
    const invocation = await hostObservation(() => service.captureToolInvocationContext({ invocationId: 'current-edit',
      processSessionId: 'fixture-process', sessionId: 'current', ownerId: 'fixture-owner' }));
    expect(invocation.binding).toBe('bound');
    expect(await hostObservation(() => service.recordToolOutcome({ sessionId: 'current', tool: 'edit_block',
      argumentKeys: [], outcome: 'success', readOnly: false, invocationContext: invocation }))).toBe('attributed');
    expect(await (service as any).recoverHistory(backup, false)).toMatchObject({ addedEpisodes: 1, applied: false });
    expect(await (service as any).recoverHistory(backup, true)).toMatchObject({ addedEpisodes: 1, applied: true });
    expect((await service.recentEpisodes({ limit: 10 })).map(row => row.id)).toEqual(expect.arrayContaining([old.id, current.id]));
    expect((await service.getEpisode('current'))?.pendingLearning).toBe(true);
    expect(await (service as any).recoverHistory(backup, true)).toMatchObject({ addedEpisodes: 0 });
  });
});

describe('task-scoped Learning decisions', () => {
  it('preserves partial capture and retries only failed candidates while a new checkpoint arrives', async () => {
    const { learning } = await learningFixture();
    await learning.checkpoint({ idempotencyKey: 'partial' });
    const capture = vi.spyOn((learning as any).reviewer, 'review')
      .mockResolvedValueOnce([{ kind: 'durable-fact', status: 'captured', id: 'saved' }])
      .mockResolvedValueOnce([{ kind: 'durable-fact', status: 'sink-failed' }])
      .mockResolvedValueOnce([{ kind: 'durable-fact', status: 'captured', id: 'retried' }]);
    const candidates = ['first', 'second'].map(content => ({ kind: 'durable-fact' as const, content, verified: true, evidenceRefs: [] }));
    expect((await learning.review(candidates, false, { checkpointKeys: ['partial'] })).summary.complete).toBe(false);
    const [review] = await Promise.all([
      learning.review(candidates, false, { checkpointKeys: ['partial'] }),
      learning.checkpoint({ idempotencyKey: 'new-during-review' }),
    ]);
    expect(review.summary.complete).toBe(true);
    expect(capture).toHaveBeenCalledTimes(3);
    expect((await learning.status() as any).state.pendingReviews.map((item: any) => item.idempotencyKey)).toEqual(['new-during-review']);
  });

  it('binds direct Learning receipts to the task that received recall, including after restart', async () => {
    const { root, memory, learning } = await learningFixture();
    const note = await memory.remember({ content: 'Atomic persistence uses readback after a verified write', category: 'lesson', provenance: { workspace: 'agent-core' } });
    const hit = (await memory.search('atomic persistence readback', { workspace: root, taskId: 'task-a', limit: 5 })).find(item => item.record.id === note.id)!;
    expect(hit).toBeDefined();
    const proof = await verifiedReport(root, 'task-b');
    const receipt = { taskId: 'task-b', useId: 'binding-check', memoryId: note.id, contentDigest: hit.retrievalEvidence.contentDigest,
      retrievalAttemptId: hit.retrievalEvidence.attemptId, workspace: root, applicability: 'applied' as const, result: 'success' as const,
      reasonCode: 'task-test', actionRefs: [proof.action], verificationRef: proof.ref };
    const reopenedMemory = await MemoryService.initialize(root);
    const reopened = await LearningService.initialize({ ...config, stateDir: path.join(root, 'runtime/learning') }, reopenedMemory);
    await expect(reopened.receipt(receipt)).rejects.toThrow(/TASK_MISMATCH/);
    await learning.checkpoint({ idempotencyKey: 'alias', workspace: root, taskId: 'task-a' });
    expect((await learning.status() as any).state.pendingReviews[0].workspace).toBe('agent-core');
  });

  it('requires exact evidence revisions and independently recomputes results', async () => {
    const root = await fixture(); const report = await verifiedReport(root, 't');
    expect(verifyWorkflowAnswer({ domain: 'engineering', tests: [{ input: 2, expected: 4 }] }, 'n => n * 2;').verdict).toBe('pass');
    expect(await validateWorkflowUse({ taskId: 't', actionRefs: [report.action], verificationRef: report.ref })).toMatchObject({ status: 'resolved', verification: 'pass' });
    expect(await validateWorkflowUse({ taskId: 'other', actionRefs: [report.action], verificationRef: report.ref })).toMatchObject({ verification: 'unavailable' });
    expect(await resolveWorkflowEvidence('verification:invented')).toMatchObject({ status: 'unavailable' });
    const forged = JSON.parse(await readFile(path.join(root, 't-report.json'), 'utf8'));
    forged.taskId = 'forged-task';
    const forgedBytes = JSON.stringify(forged), forgedPath = path.join(root, 'forged.json');
    await writeFile(forgedPath, forgedBytes);
    expect(await recheckWorkflowReport('verification:' + forgedPath + '#sha256:' + createHash('sha256').update(forgedBytes).digest('hex'), 'forged-task')).toBe('unavailable');
    await writeFile(report.answerPath, 'n => 99');
    expect(await validateWorkflowUse({ taskId: 't', actionRefs: [report.action], verificationRef: report.ref })).toMatchObject({ status: 'unavailable', verification: 'unavailable' });
    expect(verifyWorkflowAnswer({ domain: 'research', facts: [{ key: 'v', value: '2', source: 'new', supersedes: ['old'] }] },
      JSON.stringify([{ key: 'v', value: '2', source: 'new', contradictions: [] }])).verdict).toBe('fail');
  });

  it('shares procedure support in both directions across restart without replay promotion; failures stop promotion', async () => {
    const { root, memory, learning } = await learningFixture();
    const skills = await SkillService.initialize(root, async file => file); learning.attachSkills(skills);
    const input = { name: 'multiply-safely', description: 'Verify multiplication with independent cases', steps: ['Read input', 'Multiply by two', 'Verify'], workspace: 'agent-core' };
    const one = await verifiedReport(root, 'one'), two = await verifiedReport(root, 'two');
    await learning.supportProcedure({ ...input, taskId: 'one', origin: 'external', outcome: 'verified', evidenceRefs: [one.ref] });
    await learning.supportProcedure({ ...input, taskId: 'one', origin: 'external', outcome: 'verified', evidenceRefs: [one.ref] });
    await learning.supportProcedure({ ...input, taskId: 'one', origin: 'native', outcome: 'verified', evidenceRefs: [one.ref] });
    expect(await skills.list()).toHaveLength(0);
    const reopened = await LearningService.initialize({ ...config, stateDir: path.join(root, 'runtime/learning') }, memory);
    reopened.attachSkills(skills);
    expect((await reopened.procedures('agent-core'))[0]?.supportTaskIds).toHaveLength(1);
    const native = await AgentRuntimeService.initialize(root, reopened); await native.startSession({ sessionId: 'native' });
    await native.beginTask({ sessionId: 'native', taskId: 'two', workspace: root });
    await native.markTerminal({ taskId: 'two', outcome: 'verified', verificationRef: two.ref });
    await native.supportProcedure({ ...input, taskId: 'two', outcome: 'verified', evidenceRefs: [two.ref] });
    expect(await skills.list()).toHaveLength(0);
    expect((await reopened.skillProposals('agent-core'))[0]).toMatchObject({ qualification: 'qualified', supportTaskIds: ['one', 'two'] });
    const external = await ExternalControllerLearningService.initialize({ stateDir: path.join(root, 'runtime/learning'), memory, learning: reopened, skills });
    const shared = await external.procedure('external', { operation: 'list', workspace: root });
    expect((shared as any[])[0].origins).toEqual(['external', 'native']);
    const fail = await verifiedReport(root, 'bad', false);
    const candidate = await reopened.supportProcedure({ ...input, name: 'another-procedure', taskId: 'bad', origin: 'native', outcome: 'failed', evidenceRefs: [fail.ref] });
    expect(candidate.needsReview).toBe(true);
    expect(candidate.failureTaskIds).toHaveLength(1);
  });
  it('delivers whole procedure steps within budget and revisions only for visible artifacts', async () => {
    const step = 'atomic ' + 'x'.repeat(900);
    const procedure = { fingerprint: 'sha256:' + 'a'.repeat(64), name: 'atomic', description: 'atomic persistence', steps: Array(30).fill(step), supportTaskIds: [], failureTaskIds: [], evidenceRefs: [], allowedTools: [], status: 'candidate' as const, updatedAt: new Date().toISOString() };
    const packet = await buildKnowledgeSynthesisPacket({ runtime: { learningService: { journey: async () => ({ nodes: [{ id: 'pattern:p', type: 'pattern', label: 'Atomic procedure' }], edges: [], stats: { patternsAvailable: true } }) } } as any,
      memoryItems: [], procedures: [procedure], workspace: 'agent-core', task: { goal: 'atomic', episodes: [] } });
    expect(packet.text.length).toBeLessThanOrEqual(16000);
    expect(packet.artifactRevisions['procedure:' + procedure.fingerprint]).toBeUndefined();
    expect(packet.artifactRevisions['pattern:p']).toMatch(/^sha256:/);
    expect(packet.text).toContain(packet.artifactRevisions['pattern:p']);
  });

  it('resolves registered workspace aliases without matching unrelated folder names and ranks knowledge by relevance', async () => {
    const { root, memory } = await learningFixture();
    expect(memory.resolveWorkspace(root)).toBe('agent-core');
    const other = await fixture();
    await memory.registerWorkspaceAliases([{ name: 'another-project', repos: [{ path: other }] }]);
    expect(memory.resolveWorkspace(other)).toBe('another-project');
    expect(memory.resolveWorkspace(path.join(other, 'Agent-Core'))).not.toBe('agent-core');
    const knowledge = Array.from({ length: 20 }, (_, i) => ({ name: `aaa-${i}`, description: 'cooking bread' }));
    knowledge.push({ name: 'zzz-workflow', description: 'atomic persistence recovery' });
    expect(rankKnowledge(knowledge, 'atomic persistence', item => item.description).map(item => item.name)).toEqual(['zzz-workflow']);
  });
  it('scoped recall tolerates unscoped historical notes without leaking them across workspaces', async () => {
    const { memory } = await learningFixture();
    const unscoped = await memory.remember({ content: 'Atomic persistence historical note', category: 'lesson' });
    const scoped = await memory.remember({ content: 'Atomic persistence project note', category: 'lesson', provenance: { workspace: 'project-a' } });
    const results = await memory.search('atomic persistence', { workspace: 'project-a' });
    expect(results.map(item => item.record.id)).toContain(scoped.id);
    expect(results.map(item => item.record.id)).not.toContain(unscoped.id);
  });
  it('learning capture inherits its checkpoint workspace and legacy capture uses an explicit review workspace', async () => {
    const { root, memory, learning } = await learningFixture();
    const proof = await verifiedReport(root, 'workspace-task');
    const candidate = { kind: 'durable-fact' as const, content: 'Atomic workspace inheritance preserves scoped recall', verified: true, evidenceRefs: [proof.ref] };
    await learning.checkpoint({ idempotencyKey: 'workspace-key', taskId: 'workspace-task', workspace: root });
    await learning.review([candidate], false, { taskId: 'workspace-task', checkpointKeys: ['workspace-key'] });
    expect((await memory.search('Atomic workspace inheritance', { workspace: root })).some(item => item.record.content.includes(candidate.content))).toBe(true);
    await learning.review([{ ...candidate, content: 'Legacy workspace inheritance preserves scoped recall' }], false, { workspace: 'project-b' } as any);
    expect((await memory.search('Legacy workspace inheritance', { workspace: 'project-b' })).some(item => item.record.content.includes('Legacy workspace inheritance'))).toBe(true);
  });
  it('reviews each meaningful task and clears only its named checkpoint', async () => {
    const { learning } = await learningFixture();
    expect(await learning.checkpoint({ idempotencyKey: 'a', meaningful: true })).toMatchObject({ reviewDue: true });
    await learning.checkpoint({ idempotencyKey: 'b' });
    await learning.review([], false, { checkpointKeys: ['a'], disposition: 'no-new-knowledge' } as any);
    const status: any = await learning.status();
    expect(status.state.pendingReviews.map((item: any) => item.idempotencyKey)).toEqual(['b']);
    expect(status.state.reviewDecisions.a.status).toBe('no-new-knowledge');
  });

  it('legacy review never clears a different controller pending checkpoint', async () => {
    const { learning } = await learningFixture();
    await learning.checkpoint({ idempotencyKey: 'pending' });
    await learning.review([]);
    expect((await learning.status() as any).pendingReviewCount).toBe(1);
  });

  it('requires an explicit disposition and keeps rejected candidates visibly unresolved', async () => {
    const { learning } = await learningFixture();
    await learning.checkpoint({ idempotencyKey: 'task' });
    await expect(learning.review([], false, { checkpointKeys: ['task'] } as any)).rejects.toThrow(/DISPOSITION/);
    const result = await learning.review([{ kind: 'durable-fact', content: 'No evidence', verified: true, evidenceRefs: [] }], false,
      { checkpointKeys: ['task'] } as any);
    expect(result.summary.complete).toBe(false);
    expect((await learning.status() as any).pendingReviewCount).toBe(1);
  });

  it('Native preserves the verified task outcome when its learning candidate is rejected', async () => {
    const root = await fixture();
    const learning = { checkpoint: async () => ({ reviewDue: true }), review: async () => ({ summary: { complete: false, status: 'incomplete' } }) };
    const runtime = await AgentRuntimeService.initialize(root, learning as any);
    await runtime.startSession({ sessionId: 's' });
    await runtime.beginTask({ sessionId: 's', taskId: 't' });
    await runtime.markTerminal({ taskId: 't', outcome: 'verified', verificationRef: 'verification:test' });
    const result = await runtime.finalizeTask({ taskId: 't', candidates: [{ kind: 'durable-fact', content: 'candidate', verified: true, evidenceRefs: [] }] });
    expect(result.task.status).toBe('finalization-failed');
    expect(result.task.terminalOutcome).toBe('verified');
  });

  it('recovers Native finalization through public scoped Learning review before the next turn', async () => {
    const { root, learning } = await learningFixture();
    const runtime = await AgentRuntimeService.initialize(root, learning);
    await runtime.startSession({ sessionId: 'recovery-session' });
    await runtime.beginTask({ sessionId: 'recovery-session', taskId: 'recovery-task' });
    await runtime.markTerminal({ taskId: 'recovery-task', outcome: 'failed' });
    await runtime.finalizeTask({ taskId: 'recovery-task', candidates: [{ kind: 'durable-fact', content: 'invalid', verified: true, evidenceRefs: [] }] });
    await expect(runtime.ensureActiveSession('recovery-session')).rejects.toThrow(/FINALIZATION_PENDING/);
    await learning.review([], false, { taskId: 'recovery-task', checkpointKeys: ['agent-runtime:recovery-task:finalization'], disposition: 'rejected' });
    expect((await runtime.ensureActiveSession('recovery-session')).id).toBe('recovery-session');
    expect((await runtime.getTask('recovery-task'))?.finalization).toMatchObject({ status: 'complete', decision: 'rejected' });
    const before = (await runtime.getTask('recovery-task'))!.metrics;
    await runtime.bumpMetrics('recovery-task', { toolCalls: 10 });
    expect((await runtime.getTask('recovery-task'))!.metrics).toEqual(before);
    await runtime.beginTask({ sessionId: 'recovery-session', taskId: 'new-task' });
  });

  it('retries persisted procedure storage after public review and only discards it on explicit rejection', async () => {
    const { root, learning } = await learningFixture();
    let runtime = await AgentRuntimeService.initialize(root, learning);
    await runtime.startSession({ sessionId: 'procedure-recovery' });
    const procedure = { name: 'persist-procedure', description: 'Keep pending storage until retry succeeds', steps: ['Verify', 'Fix', 'Verify'], allowedTools: [] };
    const support = vi.spyOn(learning, 'supportProcedure')
      .mockRejectedValueOnce(new Error('SKILL_STORAGE_FAILED'))
      .mockRejectedValueOnce(new Error('SKILL_STORAGE_FAILED'));
    const proof = await verifiedReport(root, 'procedure-retry');
    await runtime.beginTask({ sessionId: 'procedure-recovery', taskId: 'procedure-retry' });
    await runtime.markTerminal({ taskId: 'procedure-retry', outcome: 'verified', verificationRef: proof.ref });
    await runtime.finalizeTask({ taskId: 'procedure-retry', procedure, disposition: 'no-new-knowledge' });
    await learning.review([], false, { taskId: 'procedure-retry', checkpointKeys: ['agent-runtime:procedure-retry:finalization'], disposition: 'no-new-knowledge' });
    runtime = await AgentRuntimeService.initialize(root, learning);
    await expect(runtime.ensureActiveSession('procedure-recovery')).rejects.toThrow(/FINALIZATION_PENDING/);
    expect((await runtime.getTask('procedure-retry'))?.finalization).toMatchObject({ status: 'failed', issue: 'SKILL_STORAGE_FAILED', pendingProcedure: procedure });
    await runtime.ensureActiveSession('procedure-recovery');
    expect(support).toHaveBeenCalledTimes(3);
    expect((await runtime.getTask('procedure-retry'))?.finalization).toMatchObject({ status: 'complete' });
    expect((await runtime.getTask('procedure-retry'))?.finalization.pendingProcedure).toBeUndefined();
    expect((await learning.procedures())[0]?.supportTaskIds).toEqual(['procedure-retry']);
    expect((await learning.procedures())[0]?.steps).toEqual(procedure.steps);

    support.mockRejectedValueOnce(new Error('SKILL_STORAGE_FAILED'));
    await runtime.beginTask({ sessionId: 'procedure-recovery', taskId: 'procedure-reject' });
    await runtime.markTerminal({ taskId: 'procedure-reject', outcome: 'verified', verificationRef: proof.ref });
    await runtime.finalizeTask({ taskId: 'procedure-reject', procedure, disposition: 'no-new-knowledge' });
    await learning.review([], false, { taskId: 'procedure-reject', checkpointKeys: ['agent-runtime:procedure-reject:finalization'], disposition: 'rejected' });
    await runtime.ensureActiveSession('procedure-recovery');
    expect(support).toHaveBeenCalledTimes(4);
    expect((await runtime.getTask('procedure-reject'))?.finalization).toMatchObject({ status: 'complete', decision: 'rejected' });
    expect((await runtime.getTask('procedure-reject'))?.finalization.pendingProcedure).toBeUndefined();
  });

  it('retains Native pending tasks and can retrieve archived closed tasks', async () => {
    const root = await fixture();
    const runtime = await AgentRuntimeService.initialize(root, {} as any);
    await runtime.startSession({ sessionId: 's' });
    await runtime.beginTask({ sessionId: 's', taskId: 'seed' });
    const file = path.join(root, 'runtime/agent-runtime/state.json');
    const state = JSON.parse(await readFile(file, 'utf8'));
    state.tasks = Array.from({ length: 2002 }, (_, index) => ({ ...state.tasks[0], id: `t-${index}` }));
    state.tasks[0].status = 'finalized'; state.tasks[0].finalization.status = 'complete';
    await writeFile(file, JSON.stringify(state));
    await runtime.startSession({ sessionId: 's2' });
    expect(await runtime.getTask('t-0')).not.toBeNull();
    expect(await runtime.getTask('t-1')).not.toBeNull();
    await expect(runtime.beginTask({ sessionId: 's2', taskId: 't-0' })).rejects.toThrow(/TASK_EXISTS/);
  });
});
