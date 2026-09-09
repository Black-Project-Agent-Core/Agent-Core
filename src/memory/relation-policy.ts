import type { MemoryRelation } from './types.js';

export type MemoryRelationDirection = 'directed' | 'symmetric';

export interface MemoryRelationPolicy {
  relation: MemoryRelation;
  direction: MemoryRelationDirection;
  defaultWeight: number;
  recursiveHistory: boolean;
}

const POLICY: Record<MemoryRelation, MemoryRelationPolicy> = {
  same_key: { relation: 'same_key', direction: 'symmetric', defaultWeight: 1.00, recursiveHistory: false },
  supersedes: { relation: 'supersedes', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  explicit_relation: { relation: 'explicit_relation', direction: 'symmetric', defaultWeight: 1.00, recursiveHistory: false },
  same_anchor: { relation: 'same_anchor', direction: 'symmetric', defaultWeight: 0.95, recursiveHistory: false },
  same_artifact: { relation: 'same_artifact', direction: 'symmetric', defaultWeight: 0.90, recursiveHistory: false },
  same_route_or_task: { relation: 'same_route_or_task', direction: 'symmetric', defaultWeight: 0.80, recursiveHistory: false },
  cooccurs_in_event: { relation: 'cooccurs_in_event', direction: 'symmetric', defaultWeight: 0.60, recursiveHistory: false },
  token_overlap: { relation: 'token_overlap', direction: 'symmetric', defaultWeight: 0.20, recursiveHistory: false },
  temporal_neighbor: { relation: 'temporal_neighbor', direction: 'symmetric', defaultWeight: 0.15, recursiveHistory: false },
  continues: { relation: 'continues', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  branch_of: { relation: 'branch_of', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  derived_from: { relation: 'derived_from', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  learned_from: { relation: 'learned_from', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  caused_by: { relation: 'caused_by', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  failed_because: { relation: 'failed_because', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  resolved_by: { relation: 'resolved_by', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  validated_by: { relation: 'validated_by', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  blocked_by: { relation: 'blocked_by', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  depends_on: { relation: 'depends_on', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  produced: { relation: 'produced', direction: 'directed', defaultWeight: 1.00, recursiveHistory: true },
  contradicts: { relation: 'contradicts', direction: 'symmetric', defaultWeight: 1.00, recursiveHistory: true },
  same_task_family: { relation: 'same_task_family', direction: 'symmetric', defaultWeight: 0.80, recursiveHistory: false },
};

export const RELATION_WEIGHTS: Record<MemoryRelation, number> = Object.fromEntries(
  Object.entries(POLICY).map(([relation, policy]) => [relation, policy.defaultWeight]),
) as Record<MemoryRelation, number>;

export function memoryRelationPolicy(relation: MemoryRelation): MemoryRelationPolicy {
  return POLICY[relation];
}

export function shouldMirrorMemoryRelation(relation: MemoryRelation): boolean {
  return POLICY[relation].direction === 'symmetric';
}
