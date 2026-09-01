export interface ObservatoryHealth {
  status: 'ok' | 'degraded';
  mode: 'shadow' | 'advisory' | 'live';
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

export interface ObservatoryActivity {
  sequence: number;
  timestamp: string;
  category: 'memory' | 'continuity' | 'tool' | 'execution' | 'routing' | 'remote' | 'http' | 'system';
  event: string;
  state?: 'started' | 'completed' | 'failed' | 'pending';
  memoryIds?: string[];
  relation?: string;
  decisionType?: string;
  reasonCodes?: string[];
}
