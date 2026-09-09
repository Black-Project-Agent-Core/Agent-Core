import { describe, expect, it } from 'vitest';
import {
  QUALITY_GATE_THRESHOLDS,
  buildQualityScorecard,
  evaluateQualityGate,
  stableQualityJson,
  qualityExitCode,
} from '../src/evaluation/quality-gate.js';
import type { RoutingQualityResult } from '../src/evaluation/routing-quality.js';
import type { MemoryQualityResult } from '../src/evaluation/memory-quality.js';

function routing(overrides: Partial<RoutingQualityResult['metrics']> = {}): RoutingQualityResult {
  return {
    metrics: {
      caseCount: 40,
      tierAccuracy: 1,
      riskCorrectness: 1,
      domainCorrectness: 1,
      falseHighImpactRate: 0,
      unsafeOverpermissionRate: 0,
      falseReadOnlyClassificationRate: 0,
      relevantSkillPrecisionAt2: 1,
      unnecessarySkillLoadRate: 0,
      requiredSkillLoadCorrectness: 1,
      verificationCorrectness: 1,
      deterministicReplayEquality: 1,
      ...overrides,
    },
    cases: [],
    failures: [],
  };
}

function memory(overrides: Partial<MemoryQualityResult['metrics']> = {}): MemoryQualityResult {
  return {
    metrics: {
      caseCount: 12,
      recallAtK: 1,
      mrr: 1,
      hardGuardrailRecall: 1,
      currentRevisionCorrectness: 1,
      priorFailureRecall: 1,
      graphTargetRecall: 1,
      conflictVisibility: 1,
      artifactProcedureRecall: 1,
      noiseDisplacementRate: 0,
      crossProjectContamination: 0,
      crossPrincipalContamination: 0,
      characterBudgetCorrectness: 1,
      deterministicReplayEquality: 1,
      ...overrides,
    },
    cases: [],
    failures: [],
  };
}

describe('Wave E unified quality gate', () => {
  it('passes exactly at every certified threshold', () => {
    const decision = evaluateQualityGate(
      routing({
        tierAccuracy: QUALITY_GATE_THRESHOLDS.routing.tierAccuracy,
        relevantSkillPrecisionAt2: QUALITY_GATE_THRESHOLDS.routing.relevantSkillPrecisionAt2,
        unnecessarySkillLoadRate: QUALITY_GATE_THRESHOLDS.routing.unnecessarySkillLoadRate,
      }),
      memory({
        recallAtK: QUALITY_GATE_THRESHOLDS.memory.recallAtK,
        mrr: QUALITY_GATE_THRESHOLDS.memory.mrr,
        noiseDisplacementRate: QUALITY_GATE_THRESHOLDS.memory.noiseDisplacementRate,
      }),
    );
    expect(decision).toEqual({ passed: true, failures: [] });
  });

  it('fails zero-tolerance safety/isolation metrics and reports observed values plus case ids', () => {
    const routingResult = routing({ unsafeOverpermissionRate: 0.025 });
    routingResult.failures.push({ caseId: 'r13', metric: 'unsafe_overpermission', details: {} });
    const memoryResult = memory({ crossProjectContamination: 1, hardGuardrailRecall: 0.5 });
    memoryResult.failures.push(
      { caseId: 'm08', metric: 'cross_project_contamination', details: {} },
      { caseId: 'm01', metric: 'hard_guardrail_recall', details: {} },
    );

    const decision = evaluateQualityGate(routingResult, memoryResult);
    expect(decision.passed).toBe(false);
    expect(decision.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'routing.unsafeOverpermissionRate', observed: 0.025, threshold: 0, caseIds: ['r13'] }),
      expect.objectContaining({ metric: 'memory.crossProjectContamination', observed: 1, threshold: 0, caseIds: ['m08'] }),
      expect.objectContaining({ metric: 'memory.hardGuardrailRecall', observed: 0.5, threshold: 1, caseIds: ['m01'] }),
    ]));
  });

  it('builds byte-stable scorecards without timestamps or random ids', () => {
    const first = buildQualityScorecard('abc123', routing(), memory());
    const second = buildQualityScorecard('abc123', routing(), memory());
    expect(stableQualityJson(first)).toBe(stableQualityJson(second));
    expect(stableQualityJson(first)).not.toContain('createdAt');
    expect(first).toMatchObject({ schemaVersion: 1, evaluatorVersion: 'wave-e-v1', sourceCommit: 'abc123', gate: { passed: true } });
  });

  it('keeps report mode informational and makes gate mode fail only on quality failure', () => {
    const passing = buildQualityScorecard('abc123', routing(), memory());
    const failing = buildQualityScorecard('abc123', routing({ tierAccuracy: 0.5 }), memory());
    expect(qualityExitCode(passing, false)).toBe(0);
    expect(qualityExitCode(failing, false)).toBe(0);
    expect(qualityExitCode(passing, true)).toBe(0);
    expect(qualityExitCode(failing, true)).toBe(1);
  });
});
