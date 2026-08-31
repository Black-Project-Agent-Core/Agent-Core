import { describe, expect, it } from 'vitest';
import {
  RELATION_WEIGHTS,
  memoryRelationPolicy,
  shouldMirrorMemoryRelation,
} from '../src/memory/relation-policy.js';

describe('memory relation policy', () => {
  it('preserves legacy weights while defining safe directionality for semantic relations', () => {
    expect(RELATION_WEIGHTS).toMatchObject({
      same_key: 1,
      supersedes: 1,
      explicit_relation: 1,
      same_anchor: 0.95,
      same_artifact: 0.90,
      same_route_or_task: 0.80,
      cooccurs_in_event: 0.60,
      token_overlap: 0.20,
      temporal_neighbor: 0.15,
      same_task_family: 0.80,
      branch_of: 1,
      failed_because: 1,
      resolved_by: 1,
      validated_by: 1,
    });

    expect(shouldMirrorMemoryRelation('same_anchor')).toBe(true);
    expect(shouldMirrorMemoryRelation('same_task_family')).toBe(true);
    expect(shouldMirrorMemoryRelation('contradicts')).toBe(true);
    expect(shouldMirrorMemoryRelation('supersedes')).toBe(false);
    expect(shouldMirrorMemoryRelation('branch_of')).toBe(false);
    expect(shouldMirrorMemoryRelation('failed_because')).toBe(false);
    expect(shouldMirrorMemoryRelation('resolved_by')).toBe(false);
    expect(shouldMirrorMemoryRelation('validated_by')).toBe(false);
  });

  it('allows recursive history only for explicit evolution, causal, conflict, and dependency relations', () => {
    for (const relation of [
      'supersedes', 'continues', 'branch_of', 'derived_from', 'learned_from',
      'caused_by', 'failed_because', 'resolved_by', 'validated_by',
      'blocked_by', 'depends_on', 'produced', 'contradicts',
    ] as const) {
      expect(memoryRelationPolicy(relation).recursiveHistory).toBe(true);
    }

    for (const relation of [
      'same_key', 'explicit_relation', 'same_anchor', 'same_artifact',
      'same_route_or_task', 'cooccurs_in_event', 'same_task_family',
      'token_overlap', 'temporal_neighbor',
    ] as const) {
      expect(memoryRelationPolicy(relation).recursiveHistory).toBe(false);
    }
  });
});
