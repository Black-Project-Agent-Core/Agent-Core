import { createHash } from 'node:crypto';
import type { ContinuityFrontierRecord, ContinuityTaskRecord } from './store.js';

export const CONTINUITY_SNAPSHOT_LIMITS = {
  active: 10,
  completed: 10,
  blocked: 10,
  deferred: 10,
  unfinished: 10,
  frontier: 5,
  interrupted: 5,
  characterBudget: 20_000,
} as const;

export interface ContinuityInterruptedTurnRecord {
  turnId: string;
  taskId: string;
  routeContextId: string;
  createdAt: number;
  closedAt?: number;
}

export interface ExecutionContinuityRunRecord {
  runId: string;
  continuityTaskId?: string;
  objective: string;
  state: 'planned' | 'running' | 'interrupted';
  lastEventSequence: number;
  updatedAt: number;
}

export interface ExecutionContinuityCheckpoint {
  runId: string;
  continuityTaskId?: string;
  state: 'completed' | 'failed' | 'blocked' | 'interrupted' | 'cancelled';
  lastEventSequence: number;
  finishedAt?: number;
  updatedAt: number;
}

export interface ExecutionContinuitySummary {
  activeRuns: ExecutionContinuityRunRecord[];
  interruptedRuns: ExecutionContinuityRunRecord[];
  lastExecutionCheckpoint: ExecutionContinuityCheckpoint | null;
}

export interface ContinuitySnapshot {
  currentObjective: string | null;
  activeTasks: ContinuityTaskRecord[];
  recentCompleted: ContinuityTaskRecord[];
  blockedTasks: ContinuityTaskRecord[];
  deferredTasks: ContinuityTaskRecord[];
  unfinishedPlans: ContinuityTaskRecord[];
  frontier: ContinuityFrontierRecord[];
  interruptedTurns: ContinuityInterruptedTurnRecord[];
  activeRuns?: ExecutionContinuityRunRecord[];
  interruptedRuns?: ExecutionContinuityRunRecord[];
  lastExecutionCheckpoint?: ExecutionContinuityCheckpoint | null;
  snapshotHash: string;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function attachExecutionContinuity(
  snapshot: ContinuitySnapshot,
  summary: ExecutionContinuitySummary,
): ContinuitySnapshot {
  const { snapshotHash: _priorHash, ...base } = snapshot;
  const activeRuns = [...summary.activeRuns]
    .sort((left, right) => right.updatedAt - left.updatedAt || left.runId.localeCompare(right.runId))
    .slice(0, 10);
  const interruptedRuns = [...summary.interruptedRuns]
    .sort((left, right) => right.updatedAt - left.updatedAt || left.runId.localeCompare(right.runId))
    .slice(0, 10);
  const payload = {
    ...base,
    activeRuns,
    interruptedRuns,
    lastExecutionCheckpoint: summary.lastExecutionCheckpoint,
  };
  while (JSON.stringify(payload).length > CONTINUITY_SNAPSHOT_LIMITS.characterBudget) {
    if (interruptedRuns.length > 0) interruptedRuns.pop();
    else if (activeRuns.length > 0) activeRuns.pop();
    else break;
  }
  return { ...payload, snapshotHash: hash(payload) };
}
