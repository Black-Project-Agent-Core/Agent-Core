export type ObservatoryMode = 'shadow' | 'advisory' | 'live';

export interface ObservatoryHealth {
  status: 'ok' | 'degraded';
  mode: ObservatoryMode;
  auditSequence: number;
}

export interface ObservatoryNode {
  memoryId: string;
  title: string;
  canonicalKey: string;
  kind: string;
  state: string;
  revisionNo: number;
  valuePreview: string;
  importance: number;
  pinned: boolean;
  rootReason?: string;
  branchParentMemoryId?: string;
  createdFromDecisionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ObservatoryEdge {
  edgeId: string;
  fromMemoryId: string;
  toMemoryId: string;
  relation: string;
  weight: number;
  evidenceEventId?: string;
}

export interface ObservatoryConflict {
  conflictId: string;
  leftMemoryId: string;
  rightMemoryId: string;
  conflictType: string;
  status: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface ObservatoryContinuitySummary {
  currentObjective?: string;
  active: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  completed: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  blocked: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  deferred: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  unfinished: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  frontier: Array<{ frontierId: string; title: string; status: string; updatedAt: number }>;
  interruptedTurnIds: string[];
}

export interface ObservatorySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  auditSequence: number;
  project: { projectId: string; workspaceLabel: string };
  status: {
    memoryHealthy: boolean;
    lifecycleMode: 'disabled' | 'advisory' | 'enforce';
    remoteEnabled: boolean;
    remoteDurabilityState: string;
    hydrationState?: string;
    generationId?: string;
    logicalStateHash?: string;
  };
  nodes: ObservatoryNode[];
  edges: ObservatoryEdge[];
  conflicts: ObservatoryConflict[];
  continuity: ObservatoryContinuitySummary;
  truncated: { nodes: boolean; edges: boolean };
}

export interface ObservatoryRevision {
  revisionId: string;
  revisionNo: number;
  valuePreview: string;
  validFrom: number;
  validTo?: number;
}

export interface ObservatoryNodeDetail extends ObservatoryNode {
  revisions: ObservatoryRevision[];
  edges: ObservatoryEdge[];
  conflicts: ObservatoryConflict[];
}

export interface ObservatoryActivity {
  sequence: number;
  timestamp: string;
  category: 'memory' | 'continuity' | 'tool' | 'execution' | 'routing' | 'remote' | 'http' | 'system';
  event: string;
  state?: 'started' | 'completed' | 'failed' | 'pending';
  requestId?: string;
  traceId?: string;
  routeContextId?: string;
  toolName?: string;
  runId?: string;
  executionNodeId?: string;
  memoryIds?: string[];
  relation?: string;
  decisionType?: string;
  reasonCodes?: string[];
  statusCode?: string;
  durationMs?: number;
}

export interface ObservatoryActivityReplay {
  records: ObservatoryActivity[];
  earliestSequence: number;
  latestSequence: number;
}
