import type { MemoryAnchorType } from './anchors.js';

export const MEMORY_KINDS = [
  'fact',
  'preference',
  'guardrail',
  'decision',
  'goal',
  'task',
  'artifact',
  'procedure',
  'tool_state',
  'project_state',
  'failure',
  'observation',
  'relationship',
] as const;

export const MEMORY_STATES = [
  'active',
  'superseded',
  'completed',
  'archived',
  'tombstoned',
  'conflicted',
] as const;

export const MEMORY_RELATIONS = [
  'same_key',
  'supersedes',
  'explicit_relation',
  'same_anchor',
  'same_artifact',
  'same_route_or_task',
  'cooccurs_in_event',
  'token_overlap',
  'temporal_neighbor',
  'continues',
  'branch_of',
  'derived_from',
  'learned_from',
  'caused_by',
  'failed_because',
  'resolved_by',
  'validated_by',
  'blocked_by',
  'depends_on',
  'produced',
  'contradicts',
  'same_task_family',
] as const;

export const MEMORY_PERSISTENCE_DECISIONS = [
  'NO_DURABLE_MEMORY',
  'REVISE_EXISTING',
  'LINK_EXISTING',
  'WRITE_BRANCH',
  'WRITE_NEW_ROOT',
  'OPEN_CONFLICT',
] as const;

export const MEMORY_EDGE_EVENT_TYPES = ['edge.created', 'edge.reweighted', 'edge.retracted'] as const;

export const MEMORY_WRITE_REASON_CODES = [
  'DUPLICATE_CANONICAL',
  'DUPLICATE_VALUE',
  'SAME_BELIEF_NEW_EVIDENCE',
  'BELIEF_CHANGED',
  'PROCEDURE_CHANGED',
  'CURRENT_STATE_CHANGED',
  'DISTINCT_BRANCH',
  'FRESH_DURABLE_CONTEXT',
  'FAILURE_OBSERVED',
  'SOLUTION_VERIFIED',
  'CONFLICT_DETECTED',
  'RELATED_EXISTING_ONLY',
  'TRANSIENT_OPERATION',
  'INSUFFICIENT_EVIDENCE',
  'NO_FUTURE_RELEVANCE',
  'USER_EXPLICITLY_REQUESTED_MEMORY',
  'GUARDRAIL_CREATED',
  'GUARDRAIL_CHANGED',
  'ARTIFACT_VERIFIED',
] as const;

export const MEMORY_REMOTE_DURABILITY_STATES = [
  'LOCAL_COMMITTED',
  'REMOTE_PENDING',
  'REMOTE_SYNCED',
  'REMOTE_CONFLICT',
  'REMOTE_UNAVAILABLE',
] as const;

export const MEMORY_HYDRATION_STATES = [
  'REMOTE_EMPTY_CONFIRMED',
  'REMOTE_HYDRATED',
  'REMOTE_UNAVAILABLE',
  'REMOTE_AUTH_FAILED',
  'REMOTE_DECRYPT_FAILED',
  'REMOTE_INTEGRITY_FAILED',
  'REMOTE_REPLAY_FAILED',
] as const;

export const MEMORY_REMEMBER_MORE_REASONS = [
  'causal_history',
  'revision_history',
  'failure_history',
  'branch_history',
  'conflict_history',
  'user_requested',
] as const;

export const MEMORY_REMEMBER_MORE_DEFAULTS = {
  maxHops: 2,
  maxItems: 4,
  characterBudget: 6000,
} as const;

export const MEMORY_REMEMBER_MORE_LIMITS = {
  seedMemoryIds: 16,
  maxHops: 4,
  maxItems: 16,
  characterBudget: 20_000,
} as const;

export const MEMORY_ENFORCEMENTS = ['none', 'soft', 'hard'] as const;

export const MUTABLE_MEMORY_KINDS = [
  'fact',
  'preference',
  'guardrail',
  'decision',
  'goal',
  'task',
  'artifact',
  'procedure',
  'tool_state',
  'project_state',
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemoryState = (typeof MEMORY_STATES)[number];
export type MemoryRelation = (typeof MEMORY_RELATIONS)[number];
export type MemoryPersistenceDecisionType = (typeof MEMORY_PERSISTENCE_DECISIONS)[number];
export type MemoryEdgeEventType = (typeof MEMORY_EDGE_EVENT_TYPES)[number];
export type MemoryWriteReasonCode = (typeof MEMORY_WRITE_REASON_CODES)[number];
export type MemoryRemoteDurabilityState = (typeof MEMORY_REMOTE_DURABILITY_STATES)[number];
export type MemoryHydrationState = (typeof MEMORY_HYDRATION_STATES)[number];
export type MemoryRememberMoreReason = (typeof MEMORY_REMEMBER_MORE_REASONS)[number];
export type MemoryEnforcement = (typeof MEMORY_ENFORCEMENTS)[number];

export type MemoryId = string;
export type MemoryRevisionId = string;
export type MemoryEventId = string;
export type MemoryContextId = string;

export interface MemoryScope {
  principalId: string;
  projectId?: string;
  threadId?: string;
  resourceId?: string;
}

export interface MemorySemanticProfile {
  title?: string;
  summary?: string;
  intent?: string;
  concepts?: string[];
  entities?: string[];
  constraints?: string[];
  artifacts?: string[];
  outcome?: string;
  failureMode?: string;
  solution?: string;
  futureRelevance?: string[];
}

export interface MemoryExplicitAnchor {
  type: MemoryAnchorType;
  value: string;
}

export interface MemoryExplicitRelation {
  targetMemoryId: MemoryId;
  relation: MemoryRelation;
  weight?: number;
}

export interface MemoryCommitRequest {
  scope: MemoryScope;
  canonicalKey: string;
  kind: MemoryKind;
  value: string | number | boolean | null | Record<string, unknown> | unknown[];
  importance?: number;
  pinned?: boolean;
  enforcement?: MemoryEnforcement;
  sourceType?: string;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
  explicitAnchors?: MemoryExplicitAnchor[];
  explicitRelations?: MemoryExplicitRelation[];
  revisionAuthority?: 'structured_state';
}

export interface MemoryCommitResult {
  memoryId: MemoryId;
  revisionId: MemoryRevisionId;
  eventId: MemoryEventId;
  revisionNo: number;
  deduplicated: boolean;
  state: MemoryState;
}

export interface MemoryWriteDecisionRecord {
  id: string;
  principalId: string;
  projectId?: string;
  routeContextId: string;
  continuityTaskId?: string;
  contextId?: string;
  decisionType: MemoryPersistenceDecisionType;
  candidateCanonicalKey?: string;
  candidateHash: string;
  targetMemoryId?: MemoryId;
  existingMemoryIds: MemoryId[];
  reasonCodes: MemoryWriteReasonCode[];
  evidenceRefs: string[];
  relationPlan: Array<Record<string, unknown>>;
  rootReason?: string;
  createdAt: number;
  appliedAt?: number;
  applyResult?: Record<string, unknown>;
}

export interface MemoryRecallExpansionRecord {
  id: string;
  principalId: string;
  projectId?: string;
  contextId: string;
  sourceMemoryId: MemoryId;
  targetMemoryId: MemoryId;
  depth: number;
  relationPath: MemoryRelation[];
  reasonCode: string;
  score: number;
  createdAt: number;
}

export interface MemoryNodeMetadataRecord {
  memoryId: MemoryId;
  title?: string;
  rootReason?: string;
  noveltyClass?: string;
  createdFromDecisionId?: string;
  branchParentMemoryId?: MemoryId;
  semanticProfile?: Record<string, unknown>;
  semanticProfileHash?: string;
  updatedAt: number;
}

export interface MemoryEdgeEventRecord {
  id: string;
  principalId: string;
  projectId?: string;
  eventType: MemoryEdgeEventType;
  fromMemoryId: MemoryId;
  toMemoryId: MemoryId;
  relation: MemoryRelation;
  oldWeight?: number;
  newWeight?: number;
  evidenceEventId?: MemoryEventId;
  reasonCode: string;
  createdAt: number;
}

export interface MemoryRemoteStateRecord {
  principalId: string;
  projectId?: string;
  durabilityState: MemoryRemoteDurabilityState;
  hydrationState?: MemoryHydrationState;
  remoteGeneration?: string;
  remoteHead?: string;
  logicalStateHash?: string;
  lastErrorCode?: string;
  updatedAt: number;
}

export interface MemoryReviseRequest {
  scope: MemoryScope;
  memoryId: MemoryId;
  value: MemoryCommitRequest['value'];
  sourceType?: string;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryReviseResult extends MemoryCommitResult {
  supersededRevisionId?: MemoryRevisionId;
}

export interface MemoryRememberMoreRequest {
  scope: MemoryScope;
  contextId: MemoryContextId;
  seedMemoryIds: MemoryId[];
  reason: MemoryRememberMoreReason;
  maxHops?: number;
  maxItems?: number;
  characterBudget?: number;
}

export interface MemoryRememberMoreEntry {
  memoryId: MemoryId;
  revisionId: MemoryRevisionId;
  revisionNo: number;
  canonicalKey: string;
  kind: MemoryKind;
  state: MemoryState;
  valueText: string;
  sourceSeedMemoryId: MemoryId;
  depth: number;
  relationPath: MemoryRelation[];
  memoryPath: MemoryId[];
  reasonCode: string;
  score: number;
  historicalRevision: boolean;
  characterCount: number;
}

export interface MemoryRememberMoreResult {
  contextId: MemoryContextId;
  reason: MemoryRememberMoreReason;
  seedMemoryIds: MemoryId[];
  expansions: MemoryRememberMoreEntry[];
  characterBudgetConsumed: number;
  truncated: boolean;
  snapshotHash: string;
}

export interface MemorySearchRequest {
  scope: MemoryScope;
  query: string;
  includeHistory?: boolean;
  limit?: number;
  characterBudget?: number;
}

export interface MemoryScoreExplanation {
  lexical: number;
  exact: number;
  graph: number;
  state: number;
  importance: number;
  recency: number;
  finalScore: number;
  lexicalTerms?: string[];
  matchedAnchors: string[];
  graphPath?: MemoryId[];
}

export interface MemorySearchHit {
  memoryId: MemoryId;
  revisionId: MemoryRevisionId;
  revisionNo: number;
  canonicalKey: string;
  kind: MemoryKind;
  state: MemoryState;
  enforcement: MemoryEnforcement;
  importance: number;
  pinned: boolean;
  valueText: string;
  sourceEventId?: MemoryEventId;
  createdAt: number;
  updatedAt: number;
  whyMatched: MemoryScoreExplanation;
}

export interface MemorySearchResult {
  query: string;
  hits: MemorySearchHit[];
  graphTruncated: boolean;
  snapshotHash: string;
}

export interface MemoryPreflightRequest {
  scope: MemoryScope;
  routeContextId: string;
  task: string;
  context?: string;
  routeMetadata?: Record<string, unknown>;
  expiresAt: number;
}

export interface MemoryGuardrailDecision {
  blocked: boolean;
  guardrailMemoryIds: MemoryId[];
  reasons: string[];
}

export interface MemoryPreflightResult {
  contextId: MemoryContextId;
  queryText: string;
  snapshotHash: string;
  recalled: MemorySearchHit[];
  blocking: MemoryGuardrailDecision;
  blockingGuardrails: MemorySearchHit[];
  openConflicts: Array<Record<string, unknown>>;
  priorFailures: MemorySearchHit[];
  relatedDecisions: MemorySearchHit[];
  expiresAt: number;
}

export interface MemoryExplainRequest {
  scope: MemoryScope;
  memoryId: MemoryId;
  contextId?: MemoryContextId;
}

export interface MemoryExplainResult {
  memoryId: MemoryId;
  revisions: Array<{
    revisionId: MemoryRevisionId;
    revisionNo: number;
    valueText: string;
    sourceEventId?: MemoryEventId;
    validFrom: number;
    validTo?: number;
  }>;
  anchors: string[];
  edges: Array<{
    fromMemoryId: MemoryId;
    toMemoryId: MemoryId;
    relation: MemoryRelation;
    weight: number;
    evidenceEventId?: MemoryEventId;
  }>;
  accessReasons: MemoryScoreExplanation[];
}

export interface MemoryStatus {
  enabled: boolean;
  healthy: boolean;
  schemaVersion: number;
  dbPath: string;
  counts: Record<string, number>;
  integrity: string;
  lastIntegrityCheckAt?: number;
  lastSuccessfulIntegrityCheckAt?: number;
  lastBackupPath?: string;
  lastBackupAt?: number;
}
