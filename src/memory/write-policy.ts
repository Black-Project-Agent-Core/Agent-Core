import type {
  MemoryKind,
  MemoryPersistenceDecisionType,
  MemoryPostflightRelationProposal,
  MemoryRelation,
  MemoryWriteReasonCode,
} from './types.js';

export const MEMORY_NODE_CREATION_RELATIONS = [
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
] as const satisfies readonly MemoryRelation[];

const NODE_CREATION_RELATION_SET = new Set<MemoryRelation>(MEMORY_NODE_CREATION_RELATIONS);

export function isNodeCreationRelation(relation: MemoryRelation): boolean {
  return NODE_CREATION_RELATION_SET.has(relation);
}

function hasEvidence(relation: MemoryPostflightRelationProposal): boolean {
  return relation.evidenceRefs.some((value) => value.trim().length > 0);
}

export function validatePostflightRelationPlan(input: {
  decision: MemoryPersistenceDecisionType;
  candidatePresent: boolean;
  branchParentMemoryId?: string;
  conflictWithMemoryId?: string;
  proposedRelations: MemoryPostflightRelationProposal[];
}): void {
  if (input.decision === 'WRITE_BRANCH') {
    if (!input.candidatePresent || !input.branchParentMemoryId?.trim()) {
      throw new Error('MEMORY_WRITE_POLICY_BRANCH_RELATION_REQUIRED');
    }
    const parentRelations = input.proposedRelations.filter((relation) => (
      relation.targetMemoryId === input.branchParentMemoryId
      && (relation.relation === 'branch_of' || relation.relation === 'derived_from')
    ));
    if (parentRelations.length === 0) throw new Error('MEMORY_WRITE_POLICY_BRANCH_RELATION_REQUIRED');
    if (!parentRelations.some(hasEvidence)) throw new Error('MEMORY_WRITE_POLICY_EVIDENCE_REQUIRED');
    if (!parentRelations.some((relation) => isNodeCreationRelation(relation.relation))) {
      throw new Error('MEMORY_WRITE_POLICY_BRANCH_RELATION_REQUIRED');
    }
  }

  if (input.decision === 'OPEN_CONFLICT') {
    if (!input.candidatePresent || !input.conflictWithMemoryId?.trim()) {
      throw new Error('MEMORY_WRITE_POLICY_CONFLICT_RELATION_REQUIRED');
    }
    const conflictRelations = input.proposedRelations.filter((relation) => (
      relation.targetMemoryId === input.conflictWithMemoryId && relation.relation === 'contradicts'
    ));
    if (conflictRelations.length === 0) throw new Error('MEMORY_WRITE_POLICY_CONFLICT_RELATION_REQUIRED');
    if (!conflictRelations.some(hasEvidence)) throw new Error('MEMORY_WRITE_POLICY_EVIDENCE_REQUIRED');
  }
}

export function deriveMutableChangeReason(kind: MemoryKind): MemoryWriteReasonCode {
  if (kind === 'guardrail') return 'GUARDRAIL_CHANGED';
  if (kind === 'procedure') return 'PROCEDURE_CHANGED';
  if (kind === 'task' || kind === 'goal' || kind === 'artifact' || kind === 'tool_state' || kind === 'project_state') {
    return 'CURRENT_STATE_CHANGED';
  }
  return 'BELIEF_CHANGED';
}
