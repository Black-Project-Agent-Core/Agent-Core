import type { ContinuityTaskStatus, FrontierStatus } from './types.js';

/** Continuity record shapes. The file-native memory backend is the only store that writes them. */

export class ContinuityStoreError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ContinuityStoreError';
  }
}

export interface ContinuityTaskRecord {
  taskId: string;
  principalId: string;
  projectId?: string;
  parentTaskId?: string;
  title: string;
  objective?: string;
  acceptanceCriteria: string[];
  constraints: string[];
  status: ContinuityTaskStatus;
  priority: number;
  blockers: Array<Record<string, unknown>>;
  lastCheckpointId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ContinuityFrontierRecord {
  frontierId: string;
  sourceTaskId: string;
  title: string;
  rationale: string;
  status: FrontierStatus;
  dependencyTaskIds: string[];
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface ContinuityBeginTurnResult {
  turnId: string;
  taskId: string;
}

export interface ContinuityCheckpointResult {
  checkpointId: string;
  taskStatus: ContinuityTaskStatus;
  snapshotHash: string;
}

export interface ContinuityReconcileResult {
  interruptedTurnIds: string[];
  interruptedTaskIds: string[];
}

const TRANSITIONS: Record<ContinuityTaskStatus, ReadonlySet<ContinuityTaskStatus>> = {
  planned: new Set(['planned', 'ready', 'running', 'cancelled']),
  ready: new Set(['ready', 'running', 'blocked', 'deferred', 'cancelled']),
  running: new Set(['running', 'blocked', 'deferred', 'completed', 'failed', 'cancelled', 'interrupted']),
  blocked: new Set(['blocked', 'ready', 'running', 'deferred', 'failed', 'cancelled', 'interrupted']),
  deferred: new Set(['deferred', 'ready', 'running', 'cancelled', 'interrupted']),
  completed: new Set(['completed']),
  failed: new Set(['failed', 'ready', 'running', 'cancelled']),
  cancelled: new Set(['cancelled']),
  interrupted: new Set(['interrupted', 'ready', 'running', 'cancelled']),
};

export function assertContinuityTransition(from: ContinuityTaskStatus, to: ContinuityTaskStatus): void {
  if (!TRANSITIONS[from]?.has(to)) {
    throw new ContinuityStoreError('CONTINUITY_TRANSITION_INVALID', `Task transition ${from} -> ${to} is not allowed`);
  }
}
