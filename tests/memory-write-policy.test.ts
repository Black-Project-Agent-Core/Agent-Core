import { describe, expect, it } from 'vitest';
import {
  MEMORY_NODE_CREATION_RELATIONS,
  deriveMutableChangeReason,
  isNodeCreationRelation,
  validatePostflightRelationPlan,
} from '../src/memory/write-policy.js';

describe('deterministic memory write policy', () => {
  it('allows only strong semantic relations to justify new non-root nodes', () => {
    expect(MEMORY_NODE_CREATION_RELATIONS).toEqual([
      'continues', 'branch_of', 'derived_from', 'learned_from',
      'caused_by', 'failed_because', 'resolved_by', 'validated_by',
      'blocked_by', 'depends_on', 'produced', 'contradicts',
    ]);
    for (const relation of MEMORY_NODE_CREATION_RELATIONS) expect(isNodeCreationRelation(relation)).toBe(true);
    for (const relation of ['same_key', 'explicit_relation', 'same_anchor', 'same_artifact', 'same_route_or_task', 'cooccurs_in_event', 'token_overlap', 'temporal_neighbor', 'same_task_family'] as const) {
      expect(isNodeCreationRelation(relation)).toBe(false);
    }
  });

  it('requires an evidence-backed child-to-parent branch relation for WRITE_BRANCH', () => {
    expect(() => validatePostflightRelationPlan({
      decision: 'WRITE_BRANCH',
      candidatePresent: true,
      branchParentMemoryId: 'parent-memory',
      proposedRelations: [{ targetMemoryId: 'parent-memory', relation: 'branch_of', evidenceRefs: ['event:1'] }],
    })).not.toThrow();

    expect(() => validatePostflightRelationPlan({
      decision: 'WRITE_BRANCH',
      candidatePresent: true,
      branchParentMemoryId: 'parent-memory',
      proposedRelations: [{ targetMemoryId: 'parent-memory', relation: 'same_anchor', evidenceRefs: ['event:1'] }],
    })).toThrow('MEMORY_WRITE_POLICY_BRANCH_RELATION_REQUIRED');
    expect(() => validatePostflightRelationPlan({
      decision: 'WRITE_BRANCH',
      candidatePresent: true,
      branchParentMemoryId: 'parent-memory',
      proposedRelations: [{ targetMemoryId: 'parent-memory', relation: 'derived_from', evidenceRefs: [] }],
    })).toThrow('MEMORY_WRITE_POLICY_EVIDENCE_REQUIRED');
  });

  it('requires an evidence-backed contradicts relation for OPEN_CONFLICT', () => {
    expect(() => validatePostflightRelationPlan({
      decision: 'OPEN_CONFLICT',
      candidatePresent: true,
      conflictWithMemoryId: 'current-memory',
      proposedRelations: [{ targetMemoryId: 'current-memory', relation: 'contradicts', evidenceRefs: ['evidence:conflict'] }],
    })).not.toThrow();
    expect(() => validatePostflightRelationPlan({
      decision: 'OPEN_CONFLICT',
      candidatePresent: true,
      conflictWithMemoryId: 'current-memory',
      proposedRelations: [{ targetMemoryId: 'current-memory', relation: 'depends_on', evidenceRefs: ['evidence:conflict'] }],
    })).toThrow('MEMORY_WRITE_POLICY_CONFLICT_RELATION_REQUIRED');
  });

  it('maps mutable change kinds to deterministic reason codes without similarity scores', () => {
    expect(deriveMutableChangeReason('decision')).toBe('BELIEF_CHANGED');
    expect(deriveMutableChangeReason('procedure')).toBe('PROCEDURE_CHANGED');
    expect(deriveMutableChangeReason('project_state')).toBe('CURRENT_STATE_CHANGED');
    expect(deriveMutableChangeReason('guardrail')).toBe('GUARDRAIL_CHANGED');
  });
});
