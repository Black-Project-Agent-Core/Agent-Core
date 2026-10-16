import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { initializeMemoryRoot, MemoryService } from '../../../src/memory/facade.js';
import { legacyExperience } from '../../../src/memory/experience-types.js';
import { buildProjectSynthesisAction, decodeProjectSynthesis } from '../../../src/memory/project-synthesis.js';
import { expandAll } from './helpers/memory-capsule.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

test('Replay retains scoped exceptions and hypothetical status across synthesis, restart and source correction', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-replay-integrity-'));
  roots.push(root);
  const service = await initializeMemoryRoot({ baseDir: root, memoryRoot: root, experience: { enabled: true },
    consolidation: { review: async plan => ({ digest: plan.digest, reviewer: 'fixture-host', reason: 'Synthetic contract review' }) } });
  const scope = { workspaceKey: 'agent-core', taskId: 'replay-integrity', controllerId: 'controller-A' };
  const session = service.controller(scope);
  const header = await session.startEpisode({ startKey: 'replay-start', goal: 'Preserve evidence scope during synthesis', sourceRefs: [] });
  const observed = 'Alpha dependency v4 compiler reported PASS; functional execution was not checked. ';
  const exception = 'Exception: Beta dependency v5 has a different runtime contract; Alpha compiler PASS does not prove Beta compatibility.';
  const original = observed.repeat(6) + exception;
  const evidence = (await session.captureEvidence({ operationId: 'capture-observation', source: { kind: 'controller-text', text: original } })).source;
  const sourcePlan = await session.prepareConsolidation({ episodeId: header.id, expectedRevision: header.revision,
    operationId: 'prepare-hypothesis', proposal: { actions: [{ actionId: 'retain-scoped-hypothesis', kind: 'create',
      inputRefs: [evidence], reason: 'Keep the conditional interpretation and unresolved runtime scope',
      value: { content: original, context: 'Alpha v4 compiler-only observation; cross-repository applicability unknown',
        experience: { ...legacyExperience(), kind: 'lesson', epistemic: 'hypothesis', sourceRefs: [evidence] } } }] } });
  const sourceReceipt = await session.applyConsolidation({ planId: sourcePlan.id, expectedPlanDigest: sourcePlan.digest, operationId: 'apply-hypothesis' });
  const source = sourceReceipt.canonicalRefs[0]!;
  const synthesis = { schemaVersion: 1 as const, projectKey: 'agent-core',
    claims: [{ text: 'Alpha v4 compiler PASS is a historical observation, not functional verification.', refs: [source] },
      { text: exception, refs: [source] }], gaps: ['Beta v5 applicability and functional goal remain unverified.'] };
  const action = buildProjectSynthesisAction({ actionId: 'summarize-scoped-hypothesis', value: synthesis,
    experience: { ...legacyExperience(), epistemic: 'hypothesis' } });
  const plan = await session.prepareConsolidation({ episodeId: header.id, expectedRevision: sourceReceipt.episodeRevision,
    operationId: 'prepare-synthesis', proposal: { actions: [action] } });
  const receipt = await session.applyConsolidation({ planId: plan.id, expectedPlanDigest: plan.digest, operationId: 'apply-synthesis' });
  const summary = receipt.canonicalRefs[0]!;

  // A new controller reads persisted state, without the previous conversation.
  const restarted = await MemoryService.initialize(root, root);
  const reader = restarted.controller({ ...scope, controllerId: 'controller-B' });
  const recalled = await reader.recall({ query: 'Alpha compiler', view: 'abstract', limit: 20, budget: { maxBytes: 65536 } });
  expect(recalled.status).not.toBe('insufficient-budget');
  if (recalled.status === 'insufficient-budget') throw new Error('Fixture disclosure budget');
  const hit = recalled.data.hits.find(item => item.id === source.id)!;
  expect(hit).toMatchObject({ epistemic: 'hypothesis', verification: 'unverified', applicability: 'unknown' });
  expect(hit.abstract).not.toContain(exception);
  expect(recalled.warnings).toContain('abstract-is-preview');
  expect(recalled.data.hits.some(item => item.id === summary.id)).toBe(true);
  const expanded = JSON.parse((await expandAll(reader, source, 'record')).text);
  expect(expanded.content).toBe(original);
  expect(expanded.experience).toMatchObject({ epistemic: 'hypothesis', verification: { status: 'unverified' } });
  const savedSummary = JSON.parse((await expandAll(reader, summary, 'record')).text);
  expect(decodeProjectSynthesis(savedSummary.content)).toEqual(synthesis);
  expect(savedSummary.experience.sourceRefs).toContainEqual(source);

  await restarted.update(source.id, { content: original + '\nLater audit: the Alpha fixture was misconfigured; the observed compiler log remains historical.' });
  const after = await reader.recall({ view: 'map', limit: 20, budget: { maxBytes: 65536 } });
  expect(after.status).not.toBe('insufficient-budget');
  if (after.status === 'insufficient-budget') throw new Error('Fixture disclosure budget');
  expect(after.data.hits.some(item => item.id === summary.id)).toBe(false);
  expect(after.data.hits.some(item => item.id === source.id)).toBe(true);
  expect(after.warnings).toContain('synthesis-stale-or-unknown-omitted');
  expect(JSON.parse((await expandAll(reader, source, 'record')).text).content).toBe(original);
  expect((await expandAll(reader, evidence, 'evidence')).text).toBe(original);
  expect(JSON.parse((await expandAll(reader, summary, 'record')).text).experience.verification.status).toBe('unverified');
});
