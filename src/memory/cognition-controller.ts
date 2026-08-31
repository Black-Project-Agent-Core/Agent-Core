import { createHash } from 'node:crypto';
import type { MemoryCognitionLedger } from './cognition-ledger.js';
import type { MemoryLifecycle } from './lifecycle.js';
import type { MemoryLinker } from './linker.js';
import { normalizeCanonicalKey } from './normalizer.js';
import { normalizeMemorySemanticProfile } from './semantic-profile.js';
import { normalizeMemoryValue, type MemoryStore, type StoredMemoryRecord } from './store.js';
import {
  MUTABLE_MEMORY_KINDS,
  type MemoryId,
  type MemoryPersistenceDecisionType,
  type MemoryPostflightEvaluation,
  type MemoryPostflightRelationProposal,
  type MemoryPostflightRequest,
  type MemoryScope,
  type MemoryWriteReasonCode,
} from './types.js';
import { deriveMutableChangeReason, validatePostflightRelationPlan } from './write-policy.js';

const MAX_POSTFLIGHT_IDS = 32;
const MAX_POSTFLIGHT_RELATIONS = 32;
const MAX_EVIDENCE_REFS = 64;

const NEW_NODE_BLOCKERS = new Set<MemoryWriteReasonCode>([
  'TRANSIENT_OPERATION',
  'INSUFFICIENT_EVIDENCE',
  'NO_FUTURE_RELEVANCE',
]);

function binaryCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => binaryCompare(left, right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(binaryCompare) as T[];
}

function hasEvidence(values: readonly string[]): boolean {
  return values.some((value) => value.trim().length > 0);
}

function hasNewNodeBlocker(reasonCodes: readonly MemoryWriteReasonCode[]): boolean {
  return reasonCodes.some((reason) => NEW_NODE_BLOCKERS.has(reason));
}

function relationPlanRecords(relations: readonly MemoryPostflightRelationProposal[]): Array<Record<string, unknown>> {
  return relations.map((relation) => ({
    targetMemoryId: relation.targetMemoryId,
    relation: relation.relation,
    evidenceRefs: uniqueSorted(relation.evidenceRefs.filter((value) => value.trim().length > 0)),
  }));
}

export class MemoryCognitionController {
  constructor(
    readonly store: MemoryStore,
    readonly linker: MemoryLinker,
    readonly lifecycle: MemoryLifecycle,
    readonly cognition: MemoryCognitionLedger,
  ) {}

  async evaluate(request: MemoryPostflightRequest): Promise<MemoryPostflightEvaluation> {
    if (!request.scope.principalId?.trim()) throw new Error('MEMORY_SCOPE_REQUIRED');
    if (!request.routeContextId?.trim()) throw new Error('MEMORY_POSTFLIGHT_ROUTE_REQUIRED');
    if (request.evidenceRefs.length > MAX_EVIDENCE_REFS) throw new Error('MEMORY_POSTFLIGHT_REQUEST_TOO_LARGE');
    if ((request.relatedMemoryIds?.length ?? 0) > MAX_POSTFLIGHT_IDS) throw new Error('MEMORY_POSTFLIGHT_REQUEST_TOO_LARGE');
    if ((request.proposedRelations?.length ?? 0) > MAX_POSTFLIGHT_RELATIONS) throw new Error('MEMORY_POSTFLIGHT_REQUEST_TOO_LARGE');

    const proposedRelations = request.proposedRelations ?? [];
    const inputReasons = uniqueSorted(request.reasonCodes);
    const reasonSet = new Set<MemoryWriteReasonCode>(inputReasons);
    const evidenceRefs = uniqueSorted(request.evidenceRefs.filter((value) => value.trim().length > 0));
    const existingIds = new Set<MemoryId>();

    const candidate = request.candidate;
    let canonicalKey: string | undefined;
    let candidateValue: ReturnType<typeof normalizeMemoryValue> | undefined;
    let semanticProfileHash: string | undefined;
    let semanticProfile: ReturnType<typeof normalizeMemorySemanticProfile> | undefined;

    if (candidate) {
      canonicalKey = normalizeCanonicalKey(candidate.canonicalKey ?? '');
      if (!canonicalKey) throw new Error('MEMORY_CANONICAL_KEY_REQUIRED');
      candidateValue = normalizeMemoryValue(candidate.value);
      semanticProfile = candidate.semanticProfile
        ? normalizeMemorySemanticProfile(candidate.semanticProfile)
        : undefined;
      if (semanticProfile && Object.keys(semanticProfile.profile).length > 0) semanticProfileHash = semanticProfile.hash;
    }

    const candidateHash = createHash('sha256').update(stableJson(candidate ? {
      canonicalKey,
      kind: candidate.kind,
      valueText: candidateValue!.valueText,
      valueJson: candidateValue!.valueJson ?? null,
      semanticProfile: semanticProfile?.profile ?? null,
    } : { candidate: null }), 'utf8').digest('hex');

    const exact = candidate && canonicalKey
      ? await this.store.getMemoryByCanonicalKey(request.scope, canonicalKey)
      : null;
    if (exact && exact.state !== 'tombstoned') existingIds.add(exact.memoryId);

    let profileMatches: Awaited<ReturnType<MemoryCognitionLedger['findNodeMetadataBySemanticProfileHash']>> = [];
    if (!exact && semanticProfileHash) {
      profileMatches = await this.cognition.findNodeMetadataBySemanticProfileHash(request.scope, semanticProfileHash);
      for (const match of profileMatches) existingIds.add(match.memoryId);
    }

    const explicitIds = uniqueSorted([
      ...(request.relatedMemoryIds ?? []),
      ...(request.targetMemoryId ? [request.targetMemoryId] : []),
      ...(request.branchParentMemoryId ? [request.branchParentMemoryId] : []),
      ...(request.conflictWithMemoryId ? [request.conflictWithMemoryId] : []),
      ...proposedRelations.map((relation) => relation.targetMemoryId),
    ]);
    if (explicitIds.length > MAX_POSTFLIGHT_IDS) throw new Error('MEMORY_POSTFLIGHT_REQUEST_TOO_LARGE');
    const scopedExplicit = new Map<MemoryId, StoredMemoryRecord>();
    for (const memoryId of explicitIds) {
      const memory = await this.store.getMemory(request.scope, memoryId);
      if (!memory || memory.state === 'tombstoned') throw new Error('MEMORY_POSTFLIGHT_RELATED_NOT_FOUND');
      scopedExplicit.set(memoryId, memory);
      existingIds.add(memoryId);
    }

    let decision: MemoryPersistenceDecisionType = 'NO_DURABLE_MEMORY';
    let targetMemoryId: MemoryId | undefined;

    if (exact && exact.state !== 'tombstoned' && candidateValue) {
      targetMemoryId = exact.memoryId;
      reasonSet.add('DUPLICATE_CANONICAL');
      if (exact.kind !== candidate!.kind) {
        reasonSet.add('INSUFFICIENT_EVIDENCE');
      } else if (exact.valueHash === candidateValue.valueHash) {
        reasonSet.add('DUPLICATE_VALUE');
        if (reasonSet.has('SAME_BELIEF_NEW_EVIDENCE') && evidenceRefs.length > 0) decision = 'LINK_EXISTING';
      } else if (
        !hasNewNodeBlocker([...reasonSet])
        && MUTABLE_MEMORY_KINDS.includes(exact.kind as (typeof MUTABLE_MEMORY_KINDS)[number])
      ) {
        decision = 'REVISE_EXISTING';
        reasonSet.add(deriveMutableChangeReason(exact.kind));
      } else {
        reasonSet.add('INSUFFICIENT_EVIDENCE');
      }
    } else if (profileMatches.length > 0) {
      targetMemoryId = profileMatches[0]!.memoryId;
      decision = 'LINK_EXISTING';
      reasonSet.add('RELATED_EXISTING_ONLY');
    } else if (candidate && request.conflictWithMemoryId) {
      targetMemoryId = request.conflictWithMemoryId;
      const validConflict = reasonSet.has('CONFLICT_DETECTED')
        && evidenceRefs.length > 0
        && Boolean(request.conflictType?.trim())
        && this.relationPlanValid({
          decision: 'OPEN_CONFLICT',
          candidatePresent: true,
          conflictWithMemoryId: request.conflictWithMemoryId,
          proposedRelations,
        });
      if (validConflict) decision = 'OPEN_CONFLICT';
      else reasonSet.add('INSUFFICIENT_EVIDENCE');
    } else if (candidate && request.branchParentMemoryId) {
      targetMemoryId = request.branchParentMemoryId;
      const validBranch = reasonSet.has('DISTINCT_BRANCH')
        && evidenceRefs.length > 0
        && !hasNewNodeBlocker([...reasonSet])
        && this.relationPlanValid({
          decision: 'WRITE_BRANCH',
          candidatePresent: true,
          branchParentMemoryId: request.branchParentMemoryId,
          proposedRelations,
        });
      if (validBranch) decision = 'WRITE_BRANCH';
      else reasonSet.add('INSUFFICIENT_EVIDENCE');
    } else if (
      candidate
      && request.rootReason?.trim()
      && reasonSet.has('FRESH_DURABLE_CONTEXT')
      && evidenceRefs.length > 0
      && !hasNewNodeBlocker([...reasonSet])
      && explicitIds.length === 0
    ) {
      decision = 'WRITE_NEW_ROOT';
    } else {
      if (evidenceRefs.length === 0 && !reasonSet.has('TRANSIENT_OPERATION')) reasonSet.add('INSUFFICIENT_EVIDENCE');
      else if (reasonSet.size === 0) reasonSet.add('NO_FUTURE_RELEVANCE');
    }

    const finalReasons = uniqueSorted([...reasonSet]);
    const existingMemoryIds = uniqueSorted([...existingIds]);
    const decisionRecord = await this.cognition.recordWriteDecision({
      scope: request.scope,
      routeContextId: request.routeContextId,
      continuityTaskId: request.continuityTaskId,
      contextId: request.contextId,
      decisionType: decision,
      candidateCanonicalKey: canonicalKey,
      candidateHash,
      targetMemoryId,
      existingMemoryIds,
      reasonCodes: finalReasons,
      evidenceRefs,
      relationPlan: relationPlanRecords(proposedRelations),
      rootReason: decision === 'WRITE_NEW_ROOT' ? request.rootReason?.trim() : undefined,
    });

    return {
      decisionRecord,
      decision,
      targetMemoryId,
      existingMemoryIds,
      reasonCodes: decisionRecord.reasonCodes,
      candidateHash,
      semanticProfileHash,
      advisory: true,
    };
  }

  private relationPlanValid(input: {
    decision: MemoryPersistenceDecisionType;
    candidatePresent: boolean;
    branchParentMemoryId?: string;
    conflictWithMemoryId?: string;
    proposedRelations: MemoryPostflightRelationProposal[];
  }): boolean {
    try {
      validatePostflightRelationPlan(input);
      return true;
    } catch {
      return false;
    }
  }
}
