import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { initializeMemoryRoot, MemoryService as ExperienceMemoryService } from '../dist/memory/facade.js';
import { memorySemanticRevision } from '../dist/memory/disclosure.js';
import { createLearningConsolidationHost } from '../src/memory/learning-sink.js';
import { LearningService } from '../src/learning/service.js';
import type { CurationDelta, LearningCandidate } from '../src/learning/types.js';
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(startEpisode = true) {
 const root = await mkdtemp(path.join(os.tmpdir(), 'learning-promotion-')); roots.push(root);
 const host = createLearningConsolidationHost(root);
 const memory = await initializeMemoryRoot({ baseDir: root, memoryRoot: path.join(root, 'memory'), experience: { enabled: true },
  consolidation: host.policy });
 host.bind(memory);
 const config = { enabled: true, stateDir: path.join(root, 'learning'), reviewInterval: 10, curatorIntervalHours: 168 };
 const learning = await LearningService.initialize(config, memory as any);
 const binding = { taskId: 'task-correction', workspace: 'agent-core' };
 const session = memory.controller({ taskId: binding.taskId, workspaceKey: binding.workspace, controllerId: 'fixture-controller' });
 if (startEpisode) await session.startEpisode({ startKey: 'start-correction', goal: 'Correct observed retry limit', sourceRefs: [] });
 const source = path.join(root, 'observed.txt'), bytes = 'Observed retry limit is 3 for local files.';
 await writeFile(source, bytes); const evidence = 'source:' + source + '#sha256:' + createHash('sha256').update(bytes).digest('hex');
 const target = await memory.remember({ title: 'Retry limit', content: 'Retry limit is always 5.', category: 'learned-fact',
  context: 'Local file operations', tags: ['preserve-me'], source: { type: 'file', ref: path.join(root, 'origin.txt') }, provenance: { workspace: 'agent-core', files: [] } });
 const candidate: LearningCandidate = { kind: 'durable-fact', purpose: 'task-fact', content: 'Retry limit is 3 for local files.', verified: true, evidenceRefs: [evidence] };
 const delta: CurationDelta = { ...binding, operationId: 'correct-retry', checkpointKey: 'checkpoint-correction',
  entries: [{ kind: 'add-lesson', refinement: true, target: { id: target.id, revision: memorySemanticRevision(target) }, candidate }] };
 await learning.checkpoint({ ...binding, idempotencyKey: delta.checkpointKey, reason: 'user-correction', evidenceRefs: [evidence] });
 return { root, memory, learning, config, binding, session, source, evidence, target, candidate, delta };
}
test('verified refinement amends the exact target through existing promotion and preserves metadata', async () => {
 const { memory, learning, binding, target, delta } = await fixture();
 const result = await learning.reviewDelta(delta, true, binding);
 expect(result.outcomes[0].status).toBe('captured');
 const corrected = await memory.read(target.id, false);
 expect(corrected).toMatchObject({ content: delta.entries[0].candidate.content, title: target.title, category: target.category, context: target.context, tags: target.tags });
 expect(memorySemanticRevision(corrected!)).not.toBe(delta.entries[0].target!.revision);
 expect(result.summary.complete).toBe(true);
 expect((await memory.list()).filter(record => !record.pinned)).toHaveLength(1);
});

test('counterexample retains the original and records a sourced contradiction', async () => {
 const { memory, learning, binding, target, delta } = await fixture();
 delta.entries[0] = { kind: 'add-counterexample', target: delta.entries[0].target, candidate: delta.entries[0].candidate };
 const result = await learning.reviewDelta(delta, true, binding);
 expect(result.outcomes[0].status).toBe('captured');
 expect(await memory.read(target.id, false)).toEqual(target);
 const counterexample: any = await memory.read(result.outcomes[0].id!, false);
 expect(counterexample.links).toContainEqual(expect.objectContaining({ targetId: target.id, type: 'contradicts' }));
 expect(counterexample.experience.verification.status).toBe('supported');
 expect(counterexample.experience.sourceRefs).toContainEqual({ kind: 'memory', ...delta.entries[0].target });
 expect((await learning.status()).pendingReviewCount).toBe(0);
});

test('unverified or unavailable evidence stays pending and never authorizes arbitrary consolidation', async () => {
 const { memory, learning, binding, session, target, delta } = await fixture();
 delta.entries[0].candidate.verified = false;
 expect((await learning.reviewDelta(delta, true, binding)).outcomes[0].status).toBe('proposal');
 expect(await memory.read(target.id, false)).toEqual(target);
 const source = (await session.captureEvidence({ operationId: 'arbitrary-source', source: { kind: 'controller-text', text: 'Unreviewed assertion' } })).source;
 const context: any = await session.getTaskContext();
 const plan = await session.prepareConsolidation({ episodeId: context.data.episode.id, expectedRevision: context.data.episode.revision,
  operationId: 'unreviewed-prepare', proposal: { actions: [{ kind: 'create', actionId: 'unreviewed-write', inputRefs: [source], reason: 'No Learning review',
   value: { content: 'This must not be promoted', experience: { schemaVersion: 1, kind: 'lesson', retention: 'durable', epistemic: 'unknown', temporal: 'unknown', validity: { state: 'unknown' }, verification: { status: 'unverified', evidence: [] }, sourceRefs: [source] } } }] } });
 await expect(session.applyConsolidation({ planId: plan.id, expectedPlanDigest: plan.digest, operationId: 'unreviewed-apply' })).rejects.toThrow('MEMORY_CONSOLIDATION_REVIEW_REQUIRED');
 expect((await memory.list()).filter(record => !record.pinned)).toHaveLength(1);
});

test('rejects stale counterexample target even when its historical revision remains readable', async () => {
 const { memory, learning, binding, target, delta } = await fixture();
 delta.entries[0] = { kind: 'add-counterexample', target: delta.entries[0].target, candidate: delta.entries[0].candidate };
 await memory.update(target.id, { content: 'A concurrent newer correction' });
 const result = await learning.reviewDelta(delta, true, binding);
 expect(result.summary.complete).toBe(false);
 expect((await memory.list()).filter(record => !record.pinned)).toHaveLength(1);
});

test('retry after Memory commit but failed Learning publication reuses the exact promotion receipt', async () => {
 const { root, memory, learning, config, binding, target, delta } = await fixture();
 const stateFile = path.join(config.stateDir, 'state.json'), checkpointState = await readFile(stateFile, 'utf8');
 const first = await learning.reviewDelta(delta, true, binding);
 expect(first.summary.complete).toBe(true);
 await writeFile(stateFile, checkpointState); // Simulate loss of the Learning publication after durable Memory commit.
 const nextHost = createLearningConsolidationHost(root);
 const nextMemory = await ExperienceMemoryService.initialize(root, path.join(root, 'memory'), undefined, { experience: { enabled: true }, consolidation: nextHost.policy });
 nextHost.bind(nextMemory);
 const reopened = await LearningService.initialize(config, nextMemory as any);
 const replay = await reopened.reviewDelta(delta, true, binding);
 expect(replay.outcomes[0]).toMatchObject({ status: 'captured', id: target.id });
 expect(replay.summary.complete).toBe(true);
 expect((await memory.revisions(target.id, 8)).revisions).toHaveLength(1);
 expect((await memory.list()).filter(record => !record.pinned)).toHaveLength(1);
});

test('partial retry retains successful correction when an unrelated sibling needs new evidence', async () => {
 const { memory, learning, config, binding, target, delta, candidate } = await fixture();
 delta.entries.push({ kind: 'add-counterexample', target: delta.entries[0].target, candidate: { ...candidate, content: 'Separate counterexample remains pending', evidenceRefs: ['source:unresolved'] } });
 const result = await learning.reviewDelta(delta, true, binding);
 expect(result.outcomes.map(outcome => outcome.status)).toEqual(['captured', 'proposal']);
 expect(result.summary.complete).toBe(false);
 expect(await memory.read(target.id, false)).toMatchObject({ content: candidate.content });
 const reopened = await LearningService.initialize(config, memory as any);
 expect((await reopened.reviewDelta(delta, true, binding)).outcomes[0]).toMatchObject({ status: 'captured', id: target.id });
 expect((await memory.revisions(target.id, 8)).revisions).toHaveLength(1);
});

test('changed evidence and foreign workspace paths cannot promote a verified declaration', async () => {
 for (const mode of ['changed', 'foreign']) {
  const { memory, learning, binding, target, delta, source } = await fixture();
  if (mode === 'changed') await writeFile(source, 'Changed source bytes');
  else {
   const outside = await mkdtemp(path.join(os.tmpdir(), 'foreign-correction-')); roots.push(outside);
   const file = path.join(outside, 'observation.txt'), text = 'Evidence from another workspace';
   await writeFile(file, text);
   delta.entries[0].candidate.evidenceRefs = ['source:' + file + '#sha256:' + createHash('sha256').update(text).digest('hex')];
  }
  const result = await learning.reviewDelta(delta, true, binding);
  expect(result.summary.complete).toBe(false);
  expect(await memory.read(target.id, false)).toEqual(target);
 }
});

test('refinement preserves full existing provenance and source pointers across interruption replay', async () => {
 const { root, memory, learning, config, binding, target, delta } = await fixture();
 const existing = await memory.update(target.id, { provenance: { workspace: 'agent-core', files: [], repo: root } });
 delta.entries[0].target!.revision = memorySemanticRevision(existing);
 const stateFile = path.join(config.stateDir, 'state.json'), checkpointState = await readFile(stateFile, 'utf8');
 const result = await learning.reviewDelta(delta, true, binding);
 expect(result.outcomes[0].status).toBe('captured');
 expect(await memory.read(target.id, false)).toMatchObject({ source: existing.source, provenance: existing.provenance });
 await writeFile(stateFile, checkpointState);
 const retry = await (await LearningService.initialize(config, memory as any)).reviewDelta(delta, true, binding);
 expect(retry.outcomes[0]).toMatchObject({ status: 'captured', id: target.id });
});

test('a transient apply failure remains pending and retries the same delta without duplicate publication', async () => {
 const { memory, learning, config, binding, target, delta } = await fixture();
 const controller = memory.controller.bind(memory); let fail = true;
 vi.spyOn(memory, 'controller').mockImplementation((...args) => {
  const session = controller(...args), apply = session.applyConsolidation.bind(session);
  session.applyConsolidation = async input => { if (fail) { fail = false; throw new Error('synthetic transient commit failure'); } return apply(input); };
  return session;
 });
 const first = await learning.reviewDelta(delta, true, binding);
 expect(first.outcomes[0].status).toBe('sink-failed'); expect(first.summary.complete).toBe(false);
 expect(await memory.read(target.id, false)).toEqual(target);
 const retry = await (await LearningService.initialize(config, memory as any)).reviewDelta(delta, true, binding);
 expect(retry.outcomes[0]).toMatchObject({ status: 'captured', id: target.id });
 expect((await memory.revisions(target.id, 8)).revisions).toHaveLength(1);
});

test('evidence changed between preview and apply aborts without altering the target', async () => {
 const { memory, learning, binding, target, delta, source } = await fixture();
 const controller = memory.controller.bind(memory);
 vi.spyOn(memory, 'controller').mockImplementation((...args) => {
  const session = controller(...args), prepare = session.prepareConsolidation.bind(session);
  session.prepareConsolidation = async input => { const plan = await prepare(input); await writeFile(source, 'Modified evidence during review'); return plan; };
  return session;
 });
 const result = await learning.reviewDelta(delta, true, binding);
 expect(result.summary.complete).toBe(false); expect(result.outcomes[0].status).toBe('sink-failed');
 expect(await memory.read(target.id, false)).toEqual(target);
});

test('counterexample retry after lost Learning publication returns the single existing contradiction', async () => {
 const { memory, learning, config, binding, target, delta } = await fixture();
 delta.entries[0] = { kind: 'add-counterexample', target: delta.entries[0].target, candidate: delta.entries[0].candidate };
 const stateFile = path.join(config.stateDir, 'state.json'), checkpointState = await readFile(stateFile, 'utf8');
 const first = await learning.reviewDelta(delta, true, binding);
 expect(first.outcomes[0].status).toBe('captured');
 await writeFile(stateFile, checkpointState);
 const retry = await (await LearningService.initialize(config, memory as any)).reviewDelta(delta, true, binding);
 expect(retry.outcomes[0]).toMatchObject({ status: 'captured', id: first.outcomes[0].id });
 expect((await memory.list()).filter(record => !record.pinned)).toHaveLength(2);
 expect(await memory.read(target.id, false)).toEqual(target);
});

test('missing Memory episode stays pending with a precise task-binding next action', async () => {
 const { memory, learning, binding, target, delta } = await fixture(false);
 const result = await learning.reviewDelta(delta, true, binding);
 expect(result.summary.complete).toBe(false);
 expect(result.outcomes[0].reason).toContain('CURATION_EPISODE_REQUIRED');
 expect(await memory.read(target.id, false)).toEqual(target);
});

test('committed correction reconciles lost Learning publication after source deletion and episode completion', async () => {
 const { root, memory, learning, config, binding, session, target, delta, source } = await fixture();
 const stateFile = path.join(config.stateDir, 'state.json'), checkpointState = await readFile(stateFile, 'utf8');
 const first = await learning.reviewDelta(delta, true, binding);
 expect(first.outcomes[0].status).toBe('captured');
 const context: any = await session.getTaskContext();
 await session.setEpisodeStatus({ episodeId: context.data.episode.id, expectedRevision: context.data.episode.revision,
  operationId: 'complete-after-correction', status: 'completed', reason: 'Task complete', sourceRefs: [] });
 await rm(source); await writeFile(stateFile, checkpointState);
 const nextHost = createLearningConsolidationHost(root);
 const nextMemory = await ExperienceMemoryService.initialize(root, path.join(root, 'memory'), undefined, { experience: { enabled: true }, consolidation: nextHost.policy });
 nextHost.bind(nextMemory);
 const result = await (await LearningService.initialize(config, nextMemory as any)).reviewDelta(delta, true, binding);
 expect(result.outcomes[0]).toMatchObject({ status: 'captured', id: target.id });
 expect(result.summary.complete).toBe(true);
 expect((await memory.revisions(target.id, 8)).revisions).toHaveLength(1);
});

test('refinement preserves unrelated link resource metadata exactly', async () => {
 const { memory, learning, binding, target, delta } = await fixture();
 const related = await memory.remember({ content: 'Unrelated supporting context', provenance: { workspace: 'agent-core', files: [] } });
 const linked = await memory.update(target.id, { links: [{ targetId: related.id, type: 'related', strength: 0.7,
  reason: 'Historical related context', createdAt: '2025-01-01T00:00:00.000Z', validFrom: '2025-01-01T00:00:00.000Z',
  referenceTime: '2025-01-01T00:00:00.000Z', evidenceRefs: ['source:original-link'] }] });
 delta.entries[0].target!.revision = memorySemanticRevision(linked);
 const result = await learning.reviewDelta(delta, true, binding);
 expect(result.outcomes[0].status).toBe('captured');
 expect((await memory.read(target.id, false))!.links).toEqual(linked.links);
 expect(await memory.read(related.id, false)).toEqual(related);
});
