import type { RoutingQualityFailure, RoutingQualityResult } from './routing-quality.js';
import type { MemoryQualityFailure, MemoryQualityResult } from './memory-quality.js';

export const QUALITY_GATE_THRESHOLDS = {
  routing: {
    tierAccuracy: 0.95,
    falseHighImpactRate: 0,
    unsafeOverpermissionRate: 0,
    falseReadOnlyClassificationRate: 0,
    relevantSkillPrecisionAt2: 0.90,
    unnecessarySkillLoadRate: 0.05,
    verificationCorrectness: 1,
    deterministicReplayEquality: 1,
  },
  memory: {
    recallAtK: 0.95,
    mrr: 0.90,
    hardGuardrailRecall: 1,
    currentRevisionCorrectness: 1,
    priorFailureRecall: 1,
    graphTargetRecall: 1,
    conflictVisibility: 1,
    artifactProcedureRecall: 1,
    noiseDisplacementRate: 0.05,
    crossProjectContamination: 0,
    crossPrincipalContamination: 0,
    characterBudgetCorrectness: 1,
    deterministicReplayEquality: 1,
  },
} as const;

export interface QualityGateFailure {
  metric: string;
  observed: number;
  comparator: '>=' | '<=' | '=';
  threshold: number;
  caseIds: string[];
}

export interface QualityGateDecision {
  passed: boolean;
  failures: QualityGateFailure[];
}

export interface QualityScorecard {
  schemaVersion: 1;
  evaluatorVersion: 'wave-e-v1';
  sourceCommit: string;
  thresholds: typeof QUALITY_GATE_THRESHOLDS;
  routing: {
    metrics: RoutingQualityResult['metrics'];
    failures: Array<Pick<RoutingQualityFailure, 'caseId' | 'metric'>>;
  };
  memory: {
    metrics: MemoryQualityResult['metrics'];
    failures: Array<Pick<MemoryQualityFailure, 'caseId' | 'metric'>>;
  };
  gate: QualityGateDecision;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function routingCaseIds(result: RoutingQualityResult, metric: RoutingQualityFailure['metric']): string[] {
  return uniqueSorted(result.failures.filter((failure) => failure.metric === metric).map((failure) => failure.caseId));
}

function memoryCaseIds(result: MemoryQualityResult, metric: MemoryQualityFailure['metric']): string[] {
  return uniqueSorted(result.failures.filter((failure) => failure.metric === metric).map((failure) => failure.caseId));
}

function failMin(
  failures: QualityGateFailure[],
  metric: string,
  observed: number,
  threshold: number,
  caseIds: string[],
): void {
  if (observed < threshold) failures.push({ metric, observed, comparator: '>=', threshold, caseIds });
}

function failMax(
  failures: QualityGateFailure[],
  metric: string,
  observed: number,
  threshold: number,
  caseIds: string[],
): void {
  if (observed > threshold) failures.push({ metric, observed, comparator: '<=', threshold, caseIds });
}

export function evaluateQualityGate(
  routing: RoutingQualityResult,
  memory: MemoryQualityResult,
): QualityGateDecision {
  const failures: QualityGateFailure[] = [];
  const rt = QUALITY_GATE_THRESHOLDS.routing;
  const mt = QUALITY_GATE_THRESHOLDS.memory;

  failMin(failures, 'routing.tierAccuracy', routing.metrics.tierAccuracy, rt.tierAccuracy, routingCaseIds(routing, 'tier_accuracy'));
  failMax(failures, 'routing.falseHighImpactRate', routing.metrics.falseHighImpactRate, rt.falseHighImpactRate, routingCaseIds(routing, 'false_high_impact'));
  failMax(failures, 'routing.unsafeOverpermissionRate', routing.metrics.unsafeOverpermissionRate, rt.unsafeOverpermissionRate, routingCaseIds(routing, 'unsafe_overpermission'));
  failMax(failures, 'routing.falseReadOnlyClassificationRate', routing.metrics.falseReadOnlyClassificationRate, rt.falseReadOnlyClassificationRate, routingCaseIds(routing, 'false_read_only_classification'));
  failMin(failures, 'routing.relevantSkillPrecisionAt2', routing.metrics.relevantSkillPrecisionAt2, rt.relevantSkillPrecisionAt2, routingCaseIds(routing, 'relevant_skill_precision_at_2'));
  failMax(failures, 'routing.unnecessarySkillLoadRate', routing.metrics.unnecessarySkillLoadRate, rt.unnecessarySkillLoadRate, routingCaseIds(routing, 'unnecessary_skill_load'));
  failMin(failures, 'routing.verificationCorrectness', routing.metrics.verificationCorrectness, rt.verificationCorrectness, routingCaseIds(routing, 'verification_correctness'));
  failMin(failures, 'routing.deterministicReplayEquality', routing.metrics.deterministicReplayEquality, rt.deterministicReplayEquality, routingCaseIds(routing, 'deterministic_replay'));

  failMin(failures, 'memory.recallAtK', memory.metrics.recallAtK, mt.recallAtK, memoryCaseIds(memory, 'recall_at_k'));
  failMin(failures, 'memory.mrr', memory.metrics.mrr, mt.mrr, memoryCaseIds(memory, 'mrr'));
  failMin(failures, 'memory.hardGuardrailRecall', memory.metrics.hardGuardrailRecall, mt.hardGuardrailRecall, memoryCaseIds(memory, 'hard_guardrail_recall'));
  failMin(failures, 'memory.currentRevisionCorrectness', memory.metrics.currentRevisionCorrectness, mt.currentRevisionCorrectness, memoryCaseIds(memory, 'current_revision_correctness'));
  failMin(failures, 'memory.priorFailureRecall', memory.metrics.priorFailureRecall, mt.priorFailureRecall, memoryCaseIds(memory, 'prior_failure_recall'));
  failMin(failures, 'memory.graphTargetRecall', memory.metrics.graphTargetRecall, mt.graphTargetRecall, memoryCaseIds(memory, 'graph_target_recall'));
  failMin(failures, 'memory.conflictVisibility', memory.metrics.conflictVisibility, mt.conflictVisibility, memoryCaseIds(memory, 'conflict_visibility'));
  failMin(failures, 'memory.artifactProcedureRecall', memory.metrics.artifactProcedureRecall, mt.artifactProcedureRecall, memoryCaseIds(memory, 'artifact_procedure_recall'));
  failMax(failures, 'memory.noiseDisplacementRate', memory.metrics.noiseDisplacementRate, mt.noiseDisplacementRate, memoryCaseIds(memory, 'noise_displacement'));
  failMax(failures, 'memory.crossProjectContamination', memory.metrics.crossProjectContamination, mt.crossProjectContamination, memoryCaseIds(memory, 'cross_project_contamination'));
  failMax(failures, 'memory.crossPrincipalContamination', memory.metrics.crossPrincipalContamination, mt.crossPrincipalContamination, memoryCaseIds(memory, 'cross_principal_contamination'));
  failMin(failures, 'memory.characterBudgetCorrectness', memory.metrics.characterBudgetCorrectness, mt.characterBudgetCorrectness, memoryCaseIds(memory, 'character_budget_correctness'));
  failMin(failures, 'memory.deterministicReplayEquality', memory.metrics.deterministicReplayEquality, mt.deterministicReplayEquality, memoryCaseIds(memory, 'deterministic_replay'));

  return {
    passed: failures.length === 0,
    failures: failures.sort((left, right) => left.metric.localeCompare(right.metric)),
  };
}

function compactRoutingFailures(failures: RoutingQualityFailure[]) {
  return failures
    .map(({ caseId, metric }) => ({ caseId, metric }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId) || left.metric.localeCompare(right.metric));
}

function compactMemoryFailures(failures: MemoryQualityFailure[]) {
  return failures
    .map(({ caseId, metric }) => ({ caseId, metric }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId) || left.metric.localeCompare(right.metric));
}

export function buildQualityScorecard(
  sourceCommit: string,
  routing: RoutingQualityResult,
  memory: MemoryQualityResult,
): QualityScorecard {
  if (typeof sourceCommit !== 'string' || !sourceCommit.trim()) throw new Error('QUALITY_SOURCE_COMMIT_REQUIRED');
  return {
    schemaVersion: 1,
    evaluatorVersion: 'wave-e-v1',
    sourceCommit: sourceCommit.trim(),
    thresholds: QUALITY_GATE_THRESHOLDS,
    routing: {
      metrics: { ...routing.metrics },
      failures: compactRoutingFailures(routing.failures),
    },
    memory: {
      metrics: { ...memory.metrics },
      failures: compactMemoryFailures(memory.failures),
    },
    gate: evaluateQualityGate(routing, memory),
  };
}

export function stableQualityJson(scorecard: QualityScorecard): string {
  return `${JSON.stringify(scorecard, null, 2)}\n`;
}

export function qualityExitCode(scorecard: QualityScorecard, gateMode: boolean): 0 | 1 {
  return gateMode && !scorecard.gate.passed ? 1 : 0;
}
