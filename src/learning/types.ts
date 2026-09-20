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

export interface LearningCandidate {
  kind: LearningCandidateKind;
  title?: string;
  content: string;
  evidenceRefs: string[];
  verified: boolean;
  reuseCondition?: string;
  workspace?: string;
  tags?: string[];
  steps?: string[];
  exemplars?: string[];
}

export interface LearningState {
  version: 1;
  checkpointCount: number;
  sinceReview: number;
  lastCheckpointAt: string | null;
  lastReviewAt: string | null;
  lastCuratorAt: string | null;
  recentIdempotency: Array<{ key: string; at: string }>;
}

export interface LearningCheckpointInput {
  idempotencyKey: string;
  meaningful?: boolean;
  reason?: LearningTriggerReason;
  evidenceRefs?: string[];
}

export interface LearningCheckpointResult {
  duplicate: boolean;
  advanced: boolean;
  reviewDue: boolean;
  reviewReason: LearningTriggerReason | 'periodic' | null;
  checkpointCount: number;
  sinceReview: number;
  curatorDue: boolean;
}

export interface LearningReviewOutcome {
  kind: LearningCandidateKind;
  status: 'captured' | 'proposal' | 'duplicate' | 'rejected' | 'sink-unavailable' | 'sink-failed';
  sink?: string;
  id?: string;
  reason?: string;
}

export type LearningCuratorRecommendation =
  | 'review-merge'
  | 'review-overlap'
  | 'review-stale'
  | 'review-contradiction'
  | 'review-pattern-refine';

export interface LearningCuratorProposal {
  recommendation: LearningCuratorRecommendation;
  memoryIds?: string[];
  patternId?: string;
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
