import { createHash } from 'node:crypto';
import { MemoryCognitionLedger } from './cognition-ledger.js';
import { memoryRelationPolicy } from './relation-policy.js';
import {
  MEMORY_RELATIONS,
  MEMORY_REMEMBER_MORE_DEFAULTS,
  MEMORY_REMEMBER_MORE_LIMITS,
  MEMORY_REMEMBER_MORE_REASONS,
  type MemoryKind,
  type MemoryRelation,
  type MemoryRememberMoreEntry,
  type MemoryRememberMoreReason,
  type MemoryRememberMoreRequest,
  type MemoryRememberMoreResult,
  type MemoryState,
} from './types.js';
import { MemoryWorkerClient } from './worker-client.js';

interface AuthorizedSeedRow extends Record<string, unknown> {
  memory_id: string;
  canonical_key: string;
  kind: string;
  state: string;
  current_revision_id: string;
  current_revision_no: number;
}

interface CurrentMemoryRow extends Record<string, unknown> {
  memory_id: string;
  canonical_key: string;
  kind: string;
  state: string;
  revision_id: string;
  revision_no: number;
  value_text: string;
}

interface RevisionRow extends Record<string, unknown> {
  revision_id: string;
  revision_no: number;
  value_text: string;
}

interface EdgeRow extends Record<string, unknown> {
  from_memory_id: string;
  to_memory_id: string;
  relation: string;
}

interface ConflictRow extends Record<string, unknown> {
  id: string;
  left_memory_id: string;
  right_memory_id: string;
}

interface BranchMetadataRow extends Record<string, unknown> {
  memory_id: string;
  branch_parent_memory_id: string;
}

interface NormalizedRequest {
  scope: MemoryRememberMoreRequest['scope'];
  contextId: string;
  seedMemoryIds: string[];
  reason: MemoryRememberMoreReason;
  maxHops: number;
  maxItems: number;
  characterBudget: number;
}

const HISTORY_PRIORITY = {
  revision_predecessor: { priority: 1, score: 1.00 },
  failure_cause: { priority: 2, score: 0.95 },
  resolved_by: { priority: 3, score: 0.90 },
  validated_by: { priority: 4, score: 0.85 },
  branch_parent: { priority: 5, score: 0.80 },
  conflict: { priority: 6, score: 0.75 },
  dependency: { priority: 7, score: 0.70 },
  other_recursive: { priority: 8, score: 0.65 },
} as const;

type HistoryReasonCode = keyof typeof HISTORY_PRIORITY;

interface ExpansionCandidate {
  entry: MemoryRememberMoreEntry;
  priority: number;
}

interface TraversalState {
  sourceSeedMemoryId: string;
  memoryId: string;
  depth: number;
  relationPath: MemoryRelation[];
  memoryPath: string[];
}

interface RawTransition {
  state: TraversalState;
  targetMemoryId: string;
  relation: MemoryRelation;
  reasonCode: HistoryReasonCode;
}

interface ResolvedTransition extends RawTransition {
  target: CurrentMemoryRow;
  priority: number;
  score: number;
}

const REASONS = new Set<string>(MEMORY_REMEMBER_MORE_REASONS);
const RELATIONS = new Set<string>(MEMORY_RELATIONS);
const RECURSIVE_RELATIONS = MEMORY_RELATIONS.filter((relation) => memoryRelationPolicy(relation).recursiveHistory);
const OUTGOING_ONLY = new Set<MemoryRelation>([
  'supersedes',
  'failed_because',
  'caused_by',
  'branch_of',
  'derived_from',
  'learned_from',
  'depends_on',
  'blocked_by',
]);
const BIDIRECTIONAL = new Set<MemoryRelation>([
  'resolved_by',
  'validated_by',
  'produced',
  'continues',
  'contradicts',
]);
const MAX_EDGE_ROWS_PER_HOP = 512;
const MAX_CONFLICT_ROWS_PER_HOP = 256;
const MAX_TRANSITIONS_PER_HOP = 4096;
const MAX_FRONTIER_STATES = 256;

function binaryCompare(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function scopeProject(scope: MemoryRememberMoreRequest['scope']): string {
  return scope.projectId ?? '';
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(binaryCompare)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function snapshotHash(value: Omit<MemoryRememberMoreResult, 'snapshotHash'>): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
  }
  return resolved;
}

function normalizeRequest(request: MemoryRememberMoreRequest): NormalizedRequest {
  if (
    !request
    || !request.scope?.principalId?.trim()
    || !request.contextId?.trim()
    || !REASONS.has(request.reason)
    || !Array.isArray(request.seedMemoryIds)
    || request.seedMemoryIds.length < 1
    || request.seedMemoryIds.length > MEMORY_REMEMBER_MORE_LIMITS.seedMemoryIds
    || request.seedMemoryIds.some((memoryId) => typeof memoryId !== 'string' || !memoryId.trim())
  ) {
    throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
  }

  const seedMemoryIds = [...new Set(request.seedMemoryIds.map((memoryId) => memoryId.trim()))].sort(binaryCompare);
  if (seedMemoryIds.length < 1 || seedMemoryIds.length > MEMORY_REMEMBER_MORE_LIMITS.seedMemoryIds) {
    throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
  }

  return {
    scope: request.scope,
    contextId: request.contextId.trim(),
    seedMemoryIds,
    reason: request.reason,
    maxHops: boundedInteger(request.maxHops, MEMORY_REMEMBER_MORE_DEFAULTS.maxHops, MEMORY_REMEMBER_MORE_LIMITS.maxHops),
    maxItems: boundedInteger(request.maxItems, MEMORY_REMEMBER_MORE_DEFAULTS.maxItems, MEMORY_REMEMBER_MORE_LIMITS.maxItems),
    characterBudget: boundedInteger(
      request.characterBudget,
      MEMORY_REMEMBER_MORE_DEFAULTS.characterBudget,
      MEMORY_REMEMBER_MORE_LIMITS.characterBudget,
    ),
  };
}

function reasonForRelation(relation: MemoryRelation): HistoryReasonCode {
  switch (relation) {
    case 'supersedes':
      return 'revision_predecessor';
    case 'failed_because':
    case 'caused_by':
      return 'failure_cause';
    case 'resolved_by':
      return 'resolved_by';
    case 'validated_by':
      return 'validated_by';
    case 'branch_of':
    case 'derived_from':
      return 'branch_parent';
    case 'contradicts':
      return 'conflict';
    case 'depends_on':
    case 'blocked_by':
      return 'dependency';
    default:
      return 'other_recursive';
  }
}

function scoreFor(reasonCode: HistoryReasonCode, depth: number): number {
  return Number(Math.max(0, Math.min(1, HISTORY_PRIORITY[reasonCode].score - (0.05 * (depth - 1)))).toFixed(6));
}

function revisionCandidate(seed: AuthorizedSeedRow, revision: RevisionRow, depth: number): ExpansionCandidate {
  const valueText = String(revision.value_text);
  return {
    priority: HISTORY_PRIORITY.revision_predecessor.priority,
    entry: {
      memoryId: seed.memory_id,
      revisionId: String(revision.revision_id),
      revisionNo: Number(revision.revision_no),
      canonicalKey: seed.canonical_key,
      kind: seed.kind as MemoryKind,
      state: seed.state as MemoryState,
      valueText,
      sourceSeedMemoryId: seed.memory_id,
      depth,
      relationPath: Array.from({ length: depth }, () => 'supersedes' as MemoryRelation),
      memoryPath: [seed.memory_id],
      reasonCode: 'revision_predecessor',
      score: scoreFor('revision_predecessor', depth),
      historicalRevision: true,
      characterCount: valueText.length,
    },
  };
}

function graphCandidate(transition: ResolvedTransition): ExpansionCandidate {
  const depth = transition.state.depth + 1;
  const valueText = String(transition.target.value_text);
  return {
    priority: transition.priority,
    entry: {
      memoryId: transition.target.memory_id,
      revisionId: transition.target.revision_id,
      revisionNo: Number(transition.target.revision_no),
      canonicalKey: transition.target.canonical_key,
      kind: transition.target.kind as MemoryKind,
      state: transition.target.state as MemoryState,
      valueText,
      sourceSeedMemoryId: transition.state.sourceSeedMemoryId,
      depth,
      relationPath: [...transition.state.relationPath, transition.relation],
      memoryPath: [...transition.state.memoryPath, transition.target.memory_id],
      reasonCode: transition.reasonCode,
      score: transition.score,
      historicalRevision: false,
      characterCount: valueText.length,
    },
  };
}

function compareCandidates(left: ExpansionCandidate, right: ExpansionCandidate): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  if (left.entry.depth !== right.entry.depth) return left.entry.depth - right.entry.depth;
  if (left.entry.score !== right.entry.score) return right.entry.score - left.entry.score;
  const seedOrder = binaryCompare(left.entry.sourceSeedMemoryId, right.entry.sourceSeedMemoryId);
  if (seedOrder !== 0) return seedOrder;
  const memoryOrder = binaryCompare(left.entry.memoryId, right.entry.memoryId);
  if (memoryOrder !== 0) return memoryOrder;
  if (left.entry.revisionNo !== right.entry.revisionNo) return right.entry.revisionNo - left.entry.revisionNo;
  return binaryCompare(left.entry.revisionId, right.entry.revisionId);
}

function compareTransitions(left: ResolvedTransition, right: ResolvedTransition): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  if (left.score !== right.score) return right.score - left.score;
  const seedOrder = binaryCompare(left.state.sourceSeedMemoryId, right.state.sourceSeedMemoryId);
  if (seedOrder !== 0) return seedOrder;
  const targetOrder = binaryCompare(left.targetMemoryId, right.targetMemoryId);
  if (targetOrder !== 0) return targetOrder;
  const relationOrder = binaryCompare(left.relation, right.relation);
  if (relationOrder !== 0) return relationOrder;
  return binaryCompare(stableJson(left.state.memoryPath), stableJson(right.state.memoryPath));
}

function relationFromRow(value: string): MemoryRelation | null {
  return RELATIONS.has(value) ? value as MemoryRelation : null;
}

function orientedTarget(edge: EdgeRow, frontierMemoryId: string): string | null {
  const relation = relationFromRow(edge.relation);
  if (!relation || !memoryRelationPolicy(relation).recursiveHistory) return null;
  if (edge.from_memory_id === frontierMemoryId && (OUTGOING_ONLY.has(relation) || BIDIRECTIONAL.has(relation))) {
    return edge.to_memory_id;
  }
  if (edge.to_memory_id === frontierMemoryId && BIDIRECTIONAL.has(relation)) {
    return edge.from_memory_id;
  }
  return null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort(binaryCompare);
}

export class MemoryRememberMore {
  constructor(
    readonly client: MemoryWorkerClient,
    readonly cognition: MemoryCognitionLedger,
  ) {}

  async expand(request: MemoryRememberMoreRequest): Promise<MemoryRememberMoreResult> {
    const normalized = normalizeRequest(request);
    const now = Date.now();

    const contexts = await this.client.query<{ id: string }>(
      `SELECT id
         FROM memory_contexts
        WHERE id = ? AND principal_id = ? AND expires_at > ?
        LIMIT 1`,
      [normalized.contextId, normalized.scope.principalId, now],
    );
    if (contexts.length !== 1) throw new Error('MEMORY_REMEMBER_MORE_CONTEXT_INVALID');

    const authorizedRows = await this.authorizedSeeds(normalized, now);
    const authorizedIds = authorizedRows.map((row) => row.memory_id).sort(binaryCompare);
    if (
      authorizedIds.length !== normalized.seedMemoryIds.length
      || authorizedIds.some((memoryId, index) => memoryId !== normalized.seedMemoryIds[index])
    ) {
      throw new Error('MEMORY_REMEMBER_MORE_SEED_NOT_RECALLED');
    }

    const candidates: ExpansionCandidate[] = [];
    let truncated = false;

    for (const seed of authorizedRows) {
      const revisions = await this.client.query<RevisionRow>(
        `SELECT revision.id AS revision_id,
                revision.revision_no,
                revision.value_text
           FROM memory_revisions AS revision
           JOIN memory_items AS item ON item.id = revision.memory_id
          WHERE revision.memory_id = ?
            AND revision.revision_no < ?
            AND item.principal_id = ?
            AND IFNULL(item.project_id, '') = ?
            AND item.state <> 'tombstoned'
          ORDER BY revision.revision_no DESC
          LIMIT ?`,
        [
          seed.memory_id,
          seed.current_revision_no,
          normalized.scope.principalId,
          scopeProject(normalized.scope),
          normalized.maxHops + 1,
        ],
      );
      if (revisions.length > normalized.maxHops) truncated = true;
      revisions.slice(0, normalized.maxHops).forEach((revision, index) => {
        candidates.push(revisionCandidate(seed, revision, index + 1));
      });
    }

    const graph = await this.traverseGraph(normalized, authorizedRows);
    candidates.push(...graph.candidates);
    truncated ||= graph.truncated;

    candidates.sort(compareCandidates);
    const seedCurrentRevisionIds = new Set(authorizedRows.map((row) => row.current_revision_id));
    const seen = new Set<string>();
    const uniqueCandidates: ExpansionCandidate[] = [];
    for (const candidate of candidates) {
      if (seedCurrentRevisionIds.has(candidate.entry.revisionId)) continue;
      const identity = `${candidate.entry.memoryId}\0${candidate.entry.revisionId}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      uniqueCandidates.push(candidate);
    }

    const expansions: MemoryRememberMoreEntry[] = [];
    let characterBudgetConsumed = 0;
    for (const candidate of uniqueCandidates) {
      if (expansions.length >= normalized.maxItems) {
        truncated = true;
        break;
      }
      if (characterBudgetConsumed + candidate.entry.characterCount > normalized.characterBudget) {
        truncated = true;
        continue;
      }
      expansions.push(candidate.entry);
      characterBudgetConsumed += candidate.entry.characterCount;
    }

    const resultWithoutHash: Omit<MemoryRememberMoreResult, 'snapshotHash'> = {
      contextId: normalized.contextId,
      reason: normalized.reason,
      seedMemoryIds: normalized.seedMemoryIds,
      expansions,
      characterBudgetConsumed,
      truncated,
    };
    return {
      ...resultWithoutHash,
      snapshotHash: snapshotHash(resultWithoutHash),
    };
  }

  private async authorizedSeeds(normalized: NormalizedRequest, now: number): Promise<AuthorizedSeedRow[]> {
    const placeholders = normalized.seedMemoryIds.map(() => '?').join(', ');
    return this.client.query<AuthorizedSeedRow>(
      `SELECT item.id AS memory_id,
              item.canonical_key,
              item.kind,
              item.state,
              item.current_revision_id,
              revision.revision_no AS current_revision_no
         FROM memory_access_log AS access
         JOIN memory_contexts AS context ON context.id = access.context_id
         JOIN memory_items AS item ON item.id = access.memory_id
         JOIN memory_revisions AS revision ON revision.id = item.current_revision_id
        WHERE context.id = ?
          AND context.principal_id = ?
          AND context.expires_at > ?
          AND item.principal_id = ?
          AND IFNULL(item.project_id, '') = ?
          AND item.state <> 'tombstoned'
          AND item.id IN (${placeholders})
        ORDER BY item.id COLLATE BINARY ASC`,
      [
        normalized.contextId,
        normalized.scope.principalId,
        now,
        normalized.scope.principalId,
        scopeProject(normalized.scope),
        ...normalized.seedMemoryIds,
      ],
    );
  }

  private async traverseGraph(
    normalized: NormalizedRequest,
    seeds: AuthorizedSeedRow[],
  ): Promise<{ candidates: ExpansionCandidate[]; truncated: boolean }> {
    const candidates: ExpansionCandidate[] = [];
    let truncated = false;
    let frontier: TraversalState[] = seeds.map((seed) => ({
      sourceSeedMemoryId: seed.memory_id,
      memoryId: seed.memory_id,
      depth: 0,
      relationPath: [],
      memoryPath: [seed.memory_id],
    }));
    const visited = new Map<string, Set<string>>();
    for (const seed of seeds) visited.set(seed.memory_id, new Set(normalized.seedMemoryIds));

    for (let hop = 1; hop <= normalized.maxHops + 1 && frontier.length > 0; hop += 1) {
      const transitionResult = await this.transitionsForFrontier(normalized, frontier);
      truncated ||= transitionResult.truncated;
      const targetRows = await this.loadScopedCurrentMemories(normalized, transitionResult.transitions.map((item) => item.targetMemoryId));
      const targetMap = new Map(targetRows.map((row) => [row.memory_id, row]));
      let resolved: ResolvedTransition[] = [];
      for (const transition of transitionResult.transitions) {
        const target = targetMap.get(transition.targetMemoryId);
        if (!target) continue;
        const depth = transition.state.depth + 1;
        resolved.push({
          ...transition,
          target,
          priority: HISTORY_PRIORITY[transition.reasonCode].priority,
          score: scoreFor(transition.reasonCode, depth),
        });
      }
      resolved.sort(compareTransitions);
      if (resolved.length > MAX_TRANSITIONS_PER_HOP) {
        resolved = resolved.slice(0, MAX_TRANSITIONS_PER_HOP);
        truncated = true;
      }

      const nextFrontier: TraversalState[] = [];
      for (const transition of resolved) {
        const seenForSeed = visited.get(transition.state.sourceSeedMemoryId)!;
        if (seenForSeed.has(transition.targetMemoryId)) continue;
        if (hop > normalized.maxHops) {
          truncated = true;
          continue;
        }
        seenForSeed.add(transition.targetMemoryId);
        const candidate = graphCandidate(transition);
        candidates.push(candidate);
        nextFrontier.push({
          sourceSeedMemoryId: transition.state.sourceSeedMemoryId,
          memoryId: transition.targetMemoryId,
          depth: hop,
          relationPath: candidate.entry.relationPath,
          memoryPath: candidate.entry.memoryPath,
        });
      }

      if (hop <= normalized.maxHops && nextFrontier.length > MAX_FRONTIER_STATES) {
        nextFrontier.splice(MAX_FRONTIER_STATES);
        truncated = true;
      }
      frontier = nextFrontier;
    }

    return { candidates, truncated };
  }

  private async transitionsForFrontier(
    normalized: NormalizedRequest,
    frontier: TraversalState[],
  ): Promise<{ transitions: RawTransition[]; truncated: boolean }> {
    const frontierIds = uniqueStrings(frontier.map((state) => state.memoryId));
    if (frontierIds.length === 0) return { transitions: [], truncated: false };
    const statesByMemoryId = new Map<string, TraversalState[]>();
    for (const state of frontier) {
      const states = statesByMemoryId.get(state.memoryId) ?? [];
      states.push(state);
      statesByMemoryId.set(state.memoryId, states);
    }

    const frontierPlaceholders = frontierIds.map(() => '?').join(', ');
    const relationPlaceholders = RECURSIVE_RELATIONS.map(() => '?').join(', ');
    const edgeRows = await this.client.query<EdgeRow>(
      `SELECT from_memory_id, to_memory_id, relation
         FROM memory_edges
        WHERE relation IN (${relationPlaceholders})
          AND (from_memory_id IN (${frontierPlaceholders}) OR to_memory_id IN (${frontierPlaceholders}))
        ORDER BY
          CASE relation
            WHEN 'supersedes' THEN 1
            WHEN 'failed_because' THEN 2
            WHEN 'caused_by' THEN 2
            WHEN 'resolved_by' THEN 3
            WHEN 'validated_by' THEN 4
            WHEN 'branch_of' THEN 5
            WHEN 'derived_from' THEN 5
            WHEN 'contradicts' THEN 6
            WHEN 'depends_on' THEN 7
            WHEN 'blocked_by' THEN 7
            ELSE 8
          END ASC,
          from_memory_id COLLATE BINARY ASC,
          to_memory_id COLLATE BINARY ASC,
          relation COLLATE BINARY ASC
        LIMIT ?`,
      [
        ...RECURSIVE_RELATIONS,
        ...frontierIds,
        ...frontierIds,
        MAX_EDGE_ROWS_PER_HOP + 1,
      ],
    );
    let truncated = edgeRows.length > MAX_EDGE_ROWS_PER_HOP;
    const transitions: RawTransition[] = [];
    const graphBranchKeys = new Set<string>();
    for (const edge of edgeRows.slice(0, MAX_EDGE_ROWS_PER_HOP)) {
      const relation = relationFromRow(edge.relation);
      if (!relation) continue;
      for (const endpoint of uniqueStrings([edge.from_memory_id, edge.to_memory_id])) {
        for (const state of statesByMemoryId.get(endpoint) ?? []) {
          const targetMemoryId = orientedTarget(edge, state.memoryId);
          if (!targetMemoryId || targetMemoryId === state.memoryId) continue;
          transitions.push({ state, targetMemoryId, relation, reasonCode: reasonForRelation(relation) });
          if (relation === 'branch_of' || relation === 'derived_from') {
            graphBranchKeys.add(`${state.sourceSeedMemoryId}\0${state.memoryId}\0${targetMemoryId}`);
          }
        }
      }
    }

    const conflictRows = await this.client.query<ConflictRow>(
      `SELECT id, left_memory_id, right_memory_id
         FROM memory_conflicts
        WHERE left_memory_id IN (${frontierPlaceholders}) OR right_memory_id IN (${frontierPlaceholders})
        ORDER BY created_at ASC, id COLLATE BINARY ASC
        LIMIT ?`,
      [...frontierIds, ...frontierIds, MAX_CONFLICT_ROWS_PER_HOP + 1],
    );
    if (conflictRows.length > MAX_CONFLICT_ROWS_PER_HOP) truncated = true;
    for (const conflict of conflictRows.slice(0, MAX_CONFLICT_ROWS_PER_HOP)) {
      for (const state of statesByMemoryId.get(conflict.left_memory_id) ?? []) {
        if (conflict.right_memory_id !== state.memoryId) {
          transitions.push({ state, targetMemoryId: conflict.right_memory_id, relation: 'contradicts', reasonCode: 'conflict' });
        }
      }
      for (const state of statesByMemoryId.get(conflict.right_memory_id) ?? []) {
        if (conflict.left_memory_id !== state.memoryId) {
          transitions.push({ state, targetMemoryId: conflict.left_memory_id, relation: 'contradicts', reasonCode: 'conflict' });
        }
      }
    }

    const metadataRows = await this.client.query<BranchMetadataRow>(
      `SELECT memory_id, branch_parent_memory_id
         FROM memory_node_metadata
        WHERE memory_id IN (${frontierPlaceholders})
          AND branch_parent_memory_id IS NOT NULL
        ORDER BY memory_id COLLATE BINARY ASC, branch_parent_memory_id COLLATE BINARY ASC`,
      frontierIds,
    );
    for (const metadata of metadataRows) {
      for (const state of statesByMemoryId.get(metadata.memory_id) ?? []) {
        const key = `${state.sourceSeedMemoryId}\0${state.memoryId}\0${metadata.branch_parent_memory_id}`;
        if (graphBranchKeys.has(key) || metadata.branch_parent_memory_id === state.memoryId) continue;
        transitions.push({
          state,
          targetMemoryId: metadata.branch_parent_memory_id,
          relation: 'branch_of',
          reasonCode: 'branch_parent',
        });
      }
    }

    return { transitions, truncated };
  }

  private async loadScopedCurrentMemories(
    normalized: NormalizedRequest,
    memoryIds: string[],
  ): Promise<CurrentMemoryRow[]> {
    const ids = uniqueStrings(memoryIds);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    return this.client.query<CurrentMemoryRow>(
      `SELECT item.id AS memory_id,
              item.canonical_key,
              item.kind,
              item.state,
              revision.id AS revision_id,
              revision.revision_no,
              revision.value_text
         FROM memory_items AS item
         JOIN memory_revisions AS revision ON revision.id = item.current_revision_id
        WHERE item.principal_id = ?
          AND IFNULL(item.project_id, '') = ?
          AND item.state <> 'tombstoned'
          AND item.id IN (${placeholders})
        ORDER BY item.id COLLATE BINARY ASC`,
      [normalized.scope.principalId, scopeProject(normalized.scope), ...ids],
    );
  }
}
