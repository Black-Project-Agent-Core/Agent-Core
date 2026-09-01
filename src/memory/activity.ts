import type { MemoryPersistenceDecisionType, MemoryRelation } from './types.js';

export type MemoryActivityEventType =
  | 'memory.preflight_started'
  | 'memory.preflight_completed'
  | 'memory.recalled'
  | 'memory.remember_more_started'
  | 'memory.remember_more_expanded'
  | 'memory.write_decision'
  | 'memory.node_created'
  | 'memory.revision_created'
  | 'memory.edge_created'
  | 'memory.edge_retracted'
  | 'memory.conflict_opened'
  | 'memory.conflict_resolved'
  | 'memory.postflight_completed'
  | 'memory.remote_pending'
  | 'memory.remote_synced'
  | 'memory.hydration_started'
  | 'memory.hydration_completed'
  | 'memory.hydration_failed';

export interface MemoryActivityEvent {
  type: MemoryActivityEventType;
  timestamp: string;
  memoryIds?: string[];
  contextId?: string;
  relation?: MemoryRelation;
  decisionType?: MemoryPersistenceDecisionType;
  reasonCodes?: string[];
  state?: 'started' | 'completed' | 'failed' | 'pending';
  statusCode?: string;
  durationMs?: number;
}

export interface MemoryActivitySink {
  emit(event: MemoryActivityEvent): void;
}

export const NOOP_MEMORY_ACTIVITY_SINK: MemoryActivitySink = {
  emit: () => {},
};
