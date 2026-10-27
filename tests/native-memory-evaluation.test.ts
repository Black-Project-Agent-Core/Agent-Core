import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { MemoryService } from '../src/memory/service.js';
import { LearningService } from '../src/learning/service.js';
import { memoryFeedbackContentDigest } from '../src/memory/feedback-target.js';
import { normalizeMemoryUse } from '../src/agent-memory-use.js';
import { nativeMemoryEvaluationSchema } from '../src/agent-memory-evaluation.js';
import { MemoryRetrievalLedger } from '../src/memory/retrieval-ledger.js';
import { resolveMemoryPaths } from '../src/memory/paths.js';

const roots: string[] = [];
const digest = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-memory-evaluation-'));
  roots.push(root);
  const memoryRoot = path.join(root, 'runtime', 'memory');
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(memoryRoot, '00-agent-core-memory.md'), '# Agent Core Memory Foundation\n\nIsolated evaluation fixture.\n');
  const memory = await MemoryService.initialize(root, memoryRoot);
  await memory.registerWorkspaceAliases([{ name: 'fixture', repos: [{ path: root }] }]);
  const learning = await LearningService.initialize({ enabled: true, stateDir: path.join(root, 'runtime', 'learning'),
    reviewInterval: 10, curatorIntervalHours: 168 }, memory);
  const runtime = await AgentRuntimeService.initialize(root, learning, undefined, memory);
  const lesson = await memory.remember({ title: 'Evaluation needle lesson', content: 'Evaluation needle: add two to the input.',
    provenance: { workspace: 'fixture', files: [] } });
  const session = await runtime.startSession();
  const task = await runtime.beginTask({ sessionId: session.id, workspace: 'fixture', goal: 'Evaluation needle follow-up' });
  const caseRoot = path.join(root, 'runtime', 'tmp', 'native-memory-reuse', 'case');
  await mkdir(caseRoot, { recursive: true });
  const test = JSON.stringify({ domain: 'engineering', tests: [{ input: 3, expected: 5 }, { input: -1, expected: 1 }] });
  const casePath = path.join(caseRoot, 'oracle.json');
  const answerPath = path.join(caseRoot, 'answer.txt');
  const inputPath = path.join(caseRoot, 'document.txt');
  await writeFile(casePath, test);
  await writeFile(inputPath, 'Evaluation needle: add two to the input.');
  await writeFile(answerPath, 'n => n + 2');
  const evaluation = { pairId: 'fixture-pair', arm: 'reuse' as const, inputPath,
    lessonMemoryId: lesson.id, lessonContentDigest: memoryFeedbackContentDigest(lesson),
    oracle: { casePath, caseDigest: digest(test), answerPath } };
  return { root, memory, learning, runtime, task, lesson, evaluation };
}

describe('Native Memory receipt projection and isolated evaluation contracts', () => {
  it('recalls a reusable lesson for a new Native task path while preserving scope, supersession, and pre-disclosure omission', async () => {
    const fx = await fixture();
    const old = await fx.memory.remember({ title: 'Evaluation needle old offset', content: 'Evaluation needle obsolete offset adds one.',
      provenance: { workspace: 'fixture', files: [] } });
    await fx.memory.update(fx.lesson.id, { links: [{ targetId: old.id, type: 'supersedes', strength: 1 }] });
    const general = await fx.memory.remember({ title: 'Evaluation needle general principle', category: 'general',
      content: 'Evaluation needle: independently verify an offset function.' });
    const foreign = await fx.memory.remember({ content: 'Evaluation needle foreign workspace detail.',
      provenance: { workspace: 'foreign-project', files: [] } });
    const unscoped = await fx.memory.remember({ content: 'Evaluation needle unclassified private detail.' });
    const unrelated = await fx.memory.remember({ content: 'Cobalt mountains preserve glacier photographs.',
      provenance: { workspace: 'fixture', files: [] } });
    const query = 'Evaluation needle: write the offset function to E:/new-task/held-out-answer.js';
    const search = vi.spyOn(fx.memory, 'search');
    const context = await fx.runtime.assembleMemoryContext(query, 'fixture', fx.task.id);
    expect(search.mock.calls.map(call => call[1]?.rankingProfile)).toEqual(['fusion', 'bm25']);
    expect(search.mock.calls.every(call => call[0] === query && call[1]?.workspace === 'fixture' && call[1]?.taskId === fx.task.id)).toBe(true);
    expect(context.items.map(item => item.id)).toEqual(expect.arrayContaining([fx.lesson.id, general.id]));
    expect(context.items.map(item => item.id)).not.toEqual(expect.arrayContaining([old.id]));
    for (const denied of [old, foreign, unscoped, unrelated]) expect(context.items.some(item => item.id === denied.id)).toBe(false);
    expect(context.items.length).toBeLessThanOrEqual(5);
    expect(new Set(context.items.map(item => item.id)).size).toBe(context.items.length);
    expect(JSON.stringify(context.items).length).toBeLessThanOrEqual(12_000);
    expect(context.retrievalAttemptIds).toHaveLength(2);
    expect(context.items.find(item => item.id === fx.lesson.id)?.retrievalEvidence).toMatchObject({
      attemptId: expect.any(String), contentDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    search.mockClear();
    await fx.runtime.assembleMemoryContext('Evaluation needle', 'fixture', fx.task.id);
    expect(search.mock.calls.map(call => call[1]?.rankingProfile)).toEqual(['fusion']);
    const omittedTask = await fx.runtime.beginTask({ sessionId: (await fx.runtime.startSession()).id,
      workspace: 'fixture', goal: 'Held-out omission with the same new output path' });
    search.mockClear();
    const omitted = await fx.runtime.assembleMemoryContext(query, 'fixture', omittedTask.id, { excludeMemoryIds: [fx.lesson.id] });
    expect(search.mock.calls.map(call => call[1]?.rankingProfile)).toEqual(['fusion', 'bm25']);
    expect(search.mock.calls.every(call => call[0] === query && call[1]?.excludeMemoryIds?.[0] === fx.lesson.id)).toBe(true);
    expect(omitted.items.some(item => item.id === fx.lesson.id || item.id === old.id)).toBe(false);
    const ledger = new MemoryRetrievalLedger(resolveMemoryPaths(fx.root, path.join(fx.root, 'runtime', 'memory')));
    const attempts = ledger.list().filter(attempt => attempt.taskId === omittedTask.id);
    expect(attempts).toHaveLength(2);
    for (const attempt of attempts) expect(attempt.exposures.some(item => item.memoryId === fx.lesson.id || item.memoryId === old.id)).toBe(false);
  }, 60_000);

  it('projects only a committed current-digest receipt with independently checked effect evidence', async () => {
    const fx = await fixture();
    const context = await fx.runtime.assembleMemoryContext('Evaluation needle', 'fixture', fx.task.id);
    const delivered = context.items.find(item => item.id === fx.lesson.id)!;
    await fx.runtime.recordKnowledgeUse(fx.task.id, { memoryId: fx.lesson.id, applicability: 'adapted',
      retrievalAttemptId: delivered.retrievalEvidence!.attemptId, contentDigest: delivered.retrievalEvidence!.contentDigest,
      reasonCode: 'fixture-rule-adapted' });
    expect(await fx.runtime.memoryUse(fx.task.id)).toEqual([]);
    const bound = await fx.runtime.prepareMemoryEvaluation(fx.task.id, 'fixture', fx.evaluation);
    const checked = await fx.runtime.verifyMemoryEvaluation(fx.task.id, bound);
    await fx.runtime.recordEpisode(fx.task.id, { kind: 'action', summary: 'Fixture wrote the independently checked answer.',
      evidenceRefs: [checked.actionRef] });
    expect(await fx.runtime.commitKnowledgeUseOutcomes({ taskId: fx.task.id, outcome: 'verified',
      verificationRef: checked.verificationRef, evidenceRefs: [checked.actionRef] })).toEqual({ attempted: 1, recorded: 1, failed: 0 });
    expect(await fx.runtime.memoryUse(fx.task.id)).toEqual([{ memoryId: fx.lesson.id, title: fx.lesson.title,
      applicability: 'adapted', evidenceRefs: [checked.actionRef, checked.verificationRef], verification: 'pass' }]);
    const reopened = await AgentRuntimeService.initialize(fx.root, fx.learning, undefined, fx.memory);
    expect(await reopened.memoryUse(fx.task.id)).toEqual(await fx.runtime.memoryUse(fx.task.id));
  }, 30_000);

  it('retains unavailable verification and refuses a changed delivered body', async () => {
    const fx = await fixture();
    const context = await fx.runtime.assembleMemoryContext('Evaluation needle', 'fixture', fx.task.id);
    const delivered = context.items.find(item => item.id === fx.lesson.id)!;
    await fx.runtime.recordKnowledgeUse(fx.task.id, { memoryId: fx.lesson.id, applicability: 'applied',
      retrievalAttemptId: delivered.retrievalEvidence!.attemptId, contentDigest: delivered.retrievalEvidence!.contentDigest,
      reasonCode: 'fixture-declaration' });
    await fx.runtime.commitKnowledgeUseOutcomes({ taskId: fx.task.id, outcome: 'verified', verificationRef: 'verification:unresolved-fixture' });
    expect((await fx.runtime.memoryUse(fx.task.id))[0]!.verification).toBe('unavailable');
    await fx.memory.update(fx.lesson.id, { content: 'Evaluation needle: changed lesson revision.' });
    await expect(fx.runtime.prepareMemoryEvaluation(fx.task.id, 'fixture', fx.evaluation)).rejects.toThrow('AGENT_RUNTIME_EVALUATION_LESSON_DRIFT');
  }, 30_000);

  it('binds one lesson before disclosure and excludes only that lesson on the omit arm', async () => {
    const fx = await fixture();
    const bound = await fx.runtime.prepareMemoryEvaluation(fx.task.id, 'fixture', { ...fx.evaluation, arm: 'omit' });
    const omitted = await fx.runtime.assembleMemoryContext('Evaluation needle', 'fixture', fx.task.id,
      { excludeMemoryIds: [bound.lessonMemoryId!] });
    expect(omitted.items.some(item => item.id === fx.lesson.id)).toBe(false);
    expect(await fx.memory.read(fx.lesson.id, false)).toMatchObject({ content: fx.lesson.content, retrievalCount: 0 });
    await expect(fx.runtime.prepareMemoryEvaluation(fx.task.id, 'other-workspace', fx.evaluation))
      .rejects.toThrow('WORKSPACE_IDENTITY_UNVERIFIED');
    await expect(fx.runtime.prepareMemoryEvaluation(fx.task.id, 'fixture', { ...fx.evaluation,
      oracle: { ...fx.evaluation.oracle, casePath: path.join(fx.root, 'runtime', 'memory', '00-agent-core-memory.md') } }))
      .rejects.toThrow('AGENT_RUNTIME_EVALUATION_FIXTURE_SCOPE');
  }, 30_000);

  it('bounds presentation metadata and rejects evaluation scope overrides', () => {
    const raw = Array.from({ length: 20 }, (_, index) => ({ memoryId: 'lesson-' + index,
      title: 'x'.repeat(300), applicability: 'rejected', verification: 'model-says-pass',
      evidenceRefs: Array(20).fill('verification:fixture') }));
    const projected = normalizeMemoryUse(raw);
    expect(projected).toHaveLength(12);
    expect(projected.every(item => item.title.length === 200 && item.verification === 'unavailable' && item.evidenceRefs.length === 1)).toBe(true);
    expect(nativeMemoryEvaluationSchema.safeParse({ pairId: 'pair', arm: 'omit', taskId: 'foreign-task' }).success).toBe(false);
  });
});
