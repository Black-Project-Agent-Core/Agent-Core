export type LearningCandidateKind =
  | 'durable-fact'
  | 'operational-reflection'
  | 'architecture'
  | 'code-pattern';

export type LearningTriggerReason =
  | 'task-complete'
  | 'user-correction'
  | 'verified-recovery'
  | 'explicit-learn'
  | 'status';

export interface LearningConfig {
  enabled: boolean;
  stateDir: string;
  reviewInterval: number;
  curatorIntervalHours: number;
}

export type LearningEffectClaimType = 'behavioral-outcome' | 'source-state' | 'metric-evaluated';
export type LearningEffectStatus = 'observed' | 'not-exercised' | 'unavailable';
export interface LearningEffectEvidence {
  claimType: LearningEffectClaimType;
  status: LearningEffectStatus;
  evidenceRefs: string[];
  expected: string;
  observed?: string;
  environment?: string;
}

export interface LearningCandidate {
  checkpointKey?: string;
  kind: LearningCandidateKind;
  title?: string;
  content: string;
  evidenceRefs: string[];
  verified: boolean;
  evaluation?: LearningEvaluation;
  effectEvidence?: LearningEffectEvidence;
  candidateId?: string;
  auditRef?: string;
  corrections?: LearningCorrection[];
  reuseCondition?: string;
  workspace?: string;
  tags?: string[];
  steps?: string[];
  exemplars?: string[];
}

export interface LearningRejectionFingerprint {
  fingerprint: string;
  evidenceDigest: string;
  workspaceKey: string;
  status: 'proposal' | 'rejected';
  reasonCode: string;
  at: string;
}

export interface PendingLearningReview {
  idempotencyKey: string;
  reason: Exclude<LearningTriggerReason, 'status'>;
  evidenceRefs: string[];
  workspace?: string;
  createdAt: string;
  taskId?: string;
}

export interface LearningReviewOptions {
  workspace?: string;
  checkpointKeys?: string[];
  taskId?: string;
  disposition?: 'no-new-knowledge' | 'rejected' | 'awaiting-verification';
}
export interface LearningCheckpointDecision {
  status: LearningReviewSummary['status'] | 'rejected';
  complete: boolean;
  reviewedAt: string;
  taskId?: string;
  candidateResults: Record<string, LearningReviewOutcome>;
}

export interface LearningState {
  version: 1;
  skillProposals?: import('./skill-proposal-types.js').SkillProposalRecord[];
  workflowVersion?: 2;
  verificationManifests?: import('./workflow-verifier.js').WorkflowVerificationManifest[];
  checkpointCount: number;
  sinceReview: number;
  lastCheckpointAt: string | null;
  lastReviewAt: string | null;
  lastCuratorAt: string | null;
  recentIdempotency: Array<{ key: string; at: string }>;
  recentRejections: LearningRejectionFingerprint[];
  pendingReviews?: PendingLearningReview[];
  reviewDecisions?: Record<string, LearningCheckpointDecision>;
  procedures?: import('../agent-learning-loop.js').AgentProcedureCandidate[];
}

export interface LearningCheckpointInput {
  taskId?: string;
  idempotencyKey: string;
  meaningful?: boolean;
  reason?: LearningTriggerReason;
  evidenceRefs?: string[];
  workspace?: string;
}

export interface LearningCheckpointResult {
  duplicate: boolean;
  advanced: boolean;
  reviewDue: boolean;
  reviewReason: LearningTriggerReason | 'periodic' | null;
  checkpointCount: number;
  sinceReview: number;
  curatorDue: boolean;
  pendingReviewCount?: number;
  pendingReview?: PendingLearningReview;
}

export interface LearningReviewOutcome {
  kind: LearningCandidateKind;
  status: 'captured' | 'proposal' | 'duplicate' | 'rejected' | 'sink-unavailable' | 'sink-failed';
  sink?: string;
  id?: string;
  reason?: string;
  reasonCode?: LearningEvidenceReason;
  evaluation?: LearningEvaluation;
  evidenceValidation?: 'declared';
  verificationValidation?: 'controller-attested-recomputation';
  decision?: LearningDecisionEvidence;
  /** Declaration on a newly captured claim; target existence is not verified or mutated. */
  declaredCorrections?: LearningCorrection[];
}

export type LearningCuratorRecommendation =
  | 'review-merge'
  | 'review-overlap'
  | 'review-stale'
  | 'review-contradiction'
  | 'review-pattern-refine'
  | 'review-feature-outcome';

export interface LearningCuratorProposal {
  recommendation: LearningCuratorRecommendation;
  memoryIds?: string[];
  patternId?: string;
  featureId?: string;
  evidenceRefs?: string[];
  support?: { positive: number; negative: number; score: number };
  reason: string;
}

export interface LearningJourneyNode {
  id: string;
  type: 'memory' | 'pattern';
  label: string;
  category?: string;
  workspace?: string;
  retrievalCount?: number;
}

export interface LearningJourneyEdge {
  from: string;
  to: string;
  type: string;
  strength?: number;
}

export interface LearningJourney {
  nodes: LearningJourneyNode[];
  edges: LearningJourneyEdge[];
  stats: {
    memoryNodes: number;
    patternNodes: number;
    edges: number;
    patternsAvailable: boolean;
    patternsSampled: boolean;
  };
}

export interface LearningHealth {
  status: 'available' | 'degraded' | 'disabled';
  enabled: boolean;
  issueCount: number;
  issue?: string;
  reviewInterval: number;
  curatorIntervalHours: number;
  sinkStatus: Array<{ name: string; available: boolean; issue?: string }>;
}

export interface LearningReviewSummary {
  status: 'no-new-knowledge' | 'partial' | 'incomplete' | 'captured' | 'awaiting-verification' | 'duplicates-only' | 'rejected';
  /** Validation rejection or sink failure makes the batch incomplete. Proposals remain explicit. */
  complete: boolean;
  counts: Record<LearningReviewOutcome['status'], number>;
}

/** Controller-declared evidence only; syntax validation does not authenticate artifacts. */
export interface EvaluatedEvidence {
  ref: string;
  digest: string;
  observedAt: string;
}
export interface LearningVerification {
  method: 'recomputed';
  verdict: 'pass' | 'fail' | 'unavailable';
  verifierRevision: string;
  evaluatorRevision: string;
  inputsDigest: string;
  resultEvidence: EvaluatedEvidence;
}
export interface LearningEvaluation {
  schemaVersion: 1;
  mode: 'rank' | 'discover';
  evaluatorRevision: string;
  inputsDigest?: string;
  verification?: LearningVerification;
  correct: boolean;
  objective?: number | null;
  evidence: EvaluatedEvidence[];
  metrics?: Record<string, number>;
  baselineRef?: string;
  attributionComplete?: boolean;
  samples?: { candidate: number; baseline: number; minimum: number };
}
export type LearningEvidenceReason = 'correctness-failed' | 'objective-invalid'
  | 'attribution-incomplete' | 'evidence-invalid' | 'candidate-invalid'
  | 'verifier-failed' | 'verifier-unavailable' | 'verification-input-mismatch' | 'verification-evaluator-mismatch';

export interface LearningCorrection {
  kind: 'invalidates' | 'supersedes';
  targetCandidateId: string;
  reasonRef: string;
}
export interface LearningDecisionEvidence {
  reviewId: string;
  candidateId: string;
  candidateKey: string;
  workspaceKey: string;
  fingerprint: string;
  fingerprintBasis: 'normalized-claim' | 'rejected-input';
  index: number;
  evidenceCount: number;
  evidenceDigest: string;
  correctionCount: number;
  correctionsDigest: string;
  effectClaimType?: LearningEffectClaimType;
  effectStatus?: LearningEffectStatus;
  effectEvidenceDigest?: string;
}
