import { expect, it } from 'vitest';
import { projectDecisionEvidence } from '../src/learning/decision-projection.js';
import type { DecisionRecord } from '../src/learning/decision-review.js';

const record = (taskId = 'task-a', workspace = 'workspace-a'): DecisionRecord => ({ taskId, workspace,
  declaredAt: '2026-10-29T00:00:00Z', assessments: [], declaration: { id: 'decision-a', strategyId: 'inspect', goal: 'Find cause',
    context: [], predictions: [], authority: 'authorized', risk: 'low', control: 'inspect',
    inquiry: { schemaVersion: 1, question: 'Where was the callback lost?', assumptions: [], alternatives: [
      { id: 'factory', claim: 'Factory omitted callback', distinguishingObservation: 'Direct passes; HTTP fails',
        falsifier: 'HTTP forwards callback', evidenceRefs: ['source:src/mcp/handler.ts'] }] } } });

it('projects only the exact task/workspace and never presents a declaration as verified', () => {
  const result = projectDecisionEvidence([record(), record('foreign'), record('task-a', 'foreign')], { taskId: 'task-a', workspace: 'workspace-a' });
  expect(result.records).toHaveLength(1);
  expect(result).toMatchObject({ status: 'available', attribution: 'controller-declared', goalVerification: 'not-established' });
  expect(result.records[0]!.alternatives[0]!.status).toBe('unresolved');
  expect(result.records[0]!.evidenceRefs).toEqual(['source:src/mcp/handler.ts']);
  expect(projectDecisionEvidence([], { taskId: 'task-a', workspace: 'workspace-a' }).status).toBe('unavailable');
});

it('bounds UTF-8 output and reports omitted records without mutating historical data', () => {
  const rows = Array.from({ length: 5 }, () => record());
  for (const row of rows) row.declaration.inquiry!.question = '😀'.repeat(500);
  const before = JSON.stringify(rows);
  const result = projectDecisionEvidence(rows, { taskId: 'task-a', workspace: 'workspace-a' });
  expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(4096);
  expect(result.truncated).toBe(true);
  expect(JSON.stringify(rows)).toBe(before);
});

it('marks omitted source references explicitly', () => {
  const row = record();
  row.declaration.context = Array.from({ length: 2 }, (_, index) => ({ attribute: 'a' + index, current: 'current',
    compatibility: 'unknown', basis: 'inferred', evidenceRefs: Array.from({ length: 8 }, (_, i) => 'source:file-' + index + '-' + i) }));
  const result = projectDecisionEvidence([row], { taskId: 'task-a', workspace: 'workspace-a' });
  expect(result.truncated).toBe(true);
  expect(result.records[0]!.evidenceRefs).toHaveLength(8);
});

it('projects appended findings as declared results while preserving the original discriminator', () => {
  const row = record();
  row.assessments.push({ id: 'decision-a', assessedAt: '2026-10-29T01:00:00Z', actionRefs: [], observationRefs: [],
    attribution: 'unknown', sideEffects: 'unknown', summary: 'HTTP factory check reproduced the omission.',
    inquiryFindings: [{ alternativeId: 'factory', status: 'supported', evidenceRefs: ['verification:http-fixture'] }] });
  const result = projectDecisionEvidence([row], { taskId: 'task-a', workspace: 'workspace-a' });
  expect(result.records[0]!.alternatives[0]).toMatchObject({ status: 'supported', check: 'Direct passes; HTTP fails' });
  expect(result.records[0]!.evidenceRefs).toContain('verification:http-fixture');
  expect(result.goalVerification).toBe('not-established');
});
