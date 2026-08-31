import { createHash, randomUUID } from 'node:crypto';
import { redactMemoryText } from './redaction.js';
import {
  MEMORY_HYDRATION_STATES,
  MEMORY_PERSISTENCE_DECISIONS,
  MEMORY_REMOTE_DURABILITY_STATES,
  MEMORY_WRITE_REASON_CODES,
} from './types.js';
import type {
  MemoryHydrationState,
  MemoryNodeMetadataRecord,
  MemoryPersistenceDecisionType,
  MemoryRecallExpansionRecord,
  MemoryRelation,
  MemoryRemoteDurabilityState,
  MemoryRemoteStateRecord,
  MemoryScope,
  MemoryWriteDecisionRecord,
  MemoryWriteReasonCode,
} from './types.js';
import { MemoryWorkerClient } from './worker-client.js';

export interface MemoryWriteDecisionInput {
  scope: MemoryScope;
  routeContextId: string;
  continuityTaskId?: string;
  contextId?: string;
  decisionType: MemoryPersistenceDecisionType;
  candidateCanonicalKey?: string;
  candidateHash: string;
  targetMemoryId?: string;
  existingMemoryIds: string[];
  reasonCodes: MemoryWriteReasonCode[];
  evidenceRefs: string[];
  relationPlan: Array<Record<string, unknown>>;
  rootReason?: string;
  createdAt?: number;
}

export interface MemoryRecallExpansionInput {
  scope: MemoryScope;
  contextId: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  depth: number;
  relationPath: MemoryRelation[];
  reasonCode: string;
  score: number;
  createdAt?: number;
}

export interface MemoryNodeMetadataInput {
  scope: MemoryScope;
  memoryId: string;
  title?: string;
  rootReason?: string;
  noveltyClass?: string;
  createdFromDecisionId?: string;
  branchParentMemoryId?: string;
  semanticProfile?: Record<string, unknown>;
  updatedAt?: number;
}

export interface MemoryRemoteStateInput {
  scope: MemoryScope;
  durabilityState: MemoryRemoteDurabilityState;
  hydrationState?: MemoryHydrationState;
  remoteGeneration?: string;
  remoteHead?: string;
  logicalStateHash?: string;
  lastErrorCode?: string;
  updatedAt?: number;
}

const DECISIONS = new Set<string>(MEMORY_PERSISTENCE_DECISIONS);
const REASON_CODES = new Set<string>(MEMORY_WRITE_REASON_CODES);
const DURABILITY_STATES = new Set<string>(MEMORY_REMOTE_DURABILITY_STATES);
const HYDRATION_STATES = new Set<string>(MEMORY_HYDRATION_STATES);

function project(scope: MemoryScope): string {
  return scope.projectId ?? '';
}

function assertScope(scope: MemoryScope): void {
  if (!scope.principalId?.trim()) throw new Error('MEMORY_SCOPE_REQUIRED');
}

function sanitizedString(value: string): string {
  return redactMemoryText(value).text.trim();
}

function sanitizeStructured(value: unknown, keyName = ''): unknown {
  const secretKey = /^(?:authorization|api[_-]?key|client[_-]?secret|access[_-]?key|password|passwd|pwd|token|refresh[_-]?token|access[_-]?token|credential)$/i;
  if (secretKey.test(keyName)) return '[REDACTED:SECRET]';
  if (typeof value === 'string') return redactMemoryText(value).text;
  if (Array.isArray(value)) return value.map((item) => sanitizeStructured(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sanitizeStructured(item, key)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function parseJsonArray<T>(value: unknown): T[] {
  if (typeof value !== 'string' || !value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed as T[] : [];
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined;
}

function decisionFromRow(row: Record<string, unknown>): MemoryWriteDecisionRecord {
  return {
    id: String(row.id),
    principalId: String(row.principal_id),
    projectId: row.project_id == null ? undefined : String(row.project_id),
    routeContextId: String(row.route_context_id),
    continuityTaskId: row.continuity_task_id == null ? undefined : String(row.continuity_task_id),
    contextId: row.context_id == null ? undefined : String(row.context_id),
    decisionType: String(row.decision_type) as MemoryPersistenceDecisionType,
    candidateCanonicalKey: row.candidate_canonical_key == null ? undefined : String(row.candidate_canonical_key),
    candidateHash: String(row.candidate_hash),
    targetMemoryId: row.target_memory_id == null ? undefined : String(row.target_memory_id),
    existingMemoryIds: parseJsonArray<string>(row.existing_memory_ids_json),
    reasonCodes: parseJsonArray<MemoryWriteReasonCode>(row.reason_codes_json),
    evidenceRefs: parseJsonArray<string>(row.evidence_refs_json),
    relationPlan: parseJsonArray<Record<string, unknown>>(row.relation_plan_json),
    rootReason: row.root_reason == null ? undefined : String(row.root_reason),
    createdAt: Number(row.created_at),
    appliedAt: row.applied_at == null ? undefined : Number(row.applied_at),
    applyResult: parseJsonObject(row.apply_result_json),
  };
}

function expansionFromRow(row: Record<string, unknown>): MemoryRecallExpansionRecord {
  return {
    id: String(row.id),
    principalId: String(row.principal_id),
    projectId: row.project_id == null ? undefined : String(row.project_id),
    contextId: String(row.context_id),
    sourceMemoryId: String(row.source_memory_id),
    targetMemoryId: String(row.target_memory_id),
    depth: Number(row.depth),
    relationPath: parseJsonArray<MemoryRelation>(row.relation_path_json),
    reasonCode: String(row.reason_code),
    score: Number(row.score),
    createdAt: Number(row.created_at),
  };
}

function metadataFromRow(row: Record<string, unknown>): MemoryNodeMetadataRecord {
  return {
    memoryId: String(row.memory_id),
    title: row.title == null ? undefined : String(row.title),
    rootReason: row.root_reason == null ? undefined : String(row.root_reason),
    noveltyClass: row.novelty_class == null ? undefined : String(row.novelty_class),
    createdFromDecisionId: row.created_from_decision_id == null ? undefined : String(row.created_from_decision_id),
    branchParentMemoryId: row.branch_parent_memory_id == null ? undefined : String(row.branch_parent_memory_id),
    semanticProfile: parseJsonObject(row.semantic_profile_json),
    semanticProfileHash: row.semantic_profile_hash == null ? undefined : String(row.semantic_profile_hash),
    updatedAt: Number(row.updated_at),
  };
}

function remoteFromRow(row: Record<string, unknown>): MemoryRemoteStateRecord {
  return {
    principalId: String(row.principal_id),
    projectId: String(row.project_id) || undefined,
    durabilityState: String(row.durability_state) as MemoryRemoteDurabilityState,
    hydrationState: row.hydration_state == null ? undefined : String(row.hydration_state) as MemoryHydrationState,
    remoteGeneration: row.remote_generation == null ? undefined : String(row.remote_generation),
    remoteHead: row.remote_head == null ? undefined : String(row.remote_head),
    logicalStateHash: row.logical_state_hash == null ? undefined : String(row.logical_state_hash),
    lastErrorCode: row.last_error_code == null ? undefined : String(row.last_error_code),
    updatedAt: Number(row.updated_at),
  };
}

export class MemoryCognitionLedger {
  constructor(readonly client: MemoryWorkerClient) {}

  async recordWriteDecision(input: MemoryWriteDecisionInput): Promise<MemoryWriteDecisionRecord> {
    assertScope(input.scope);
    if (!DECISIONS.has(input.decisionType) || !input.routeContextId?.trim() || !input.candidateHash?.trim()) {
      throw new Error('MEMORY_WRITE_DECISION_INVALID');
    }
    if (input.reasonCodes.some((code) => !REASON_CODES.has(code))) throw new Error('MEMORY_WRITE_DECISION_INVALID');

    const id = randomUUID();
    const createdAt = input.createdAt ?? Date.now();
    const existingMemoryIds = uniqueSorted(input.existingMemoryIds);
    const reasonCodes = uniqueSorted(input.reasonCodes) as MemoryWriteReasonCode[];
    const evidenceRefs = uniqueSorted(input.evidenceRefs.map(sanitizedString));
    const relationPlan = [...input.relationPlan]
      .map((item) => sanitizeStructured(item) as Record<string, unknown>)
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
    await this.client.transaction([{
      kind: 'run',
      sql: `INSERT INTO memory_write_decisions(
        id, principal_id, project_id, route_context_id, continuity_task_id, context_id,
        decision_type, candidate_canonical_key, candidate_hash, target_memory_id,
        existing_memory_ids_json, reason_codes_json, evidence_refs_json, relation_plan_json,
        root_reason, created_at, applied_at, apply_result_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      params: [
        id,
        input.scope.principalId,
        input.scope.projectId ?? null,
        input.routeContextId,
        input.continuityTaskId ?? null,
        input.contextId ?? null,
        input.decisionType,
        input.candidateCanonicalKey ? sanitizedString(input.candidateCanonicalKey) : null,
        input.candidateHash,
        input.targetMemoryId ?? null,
        stableJson(existingMemoryIds),
        stableJson(reasonCodes),
        stableJson(evidenceRefs),
        stableJson(relationPlan),
        input.rootReason ? sanitizedString(input.rootReason) : null,
        createdAt,
      ],
    }]);
    return (await this.getWriteDecision(input.scope, id))!;
  }

  async markWriteDecisionApplied(
    scope: MemoryScope,
    decisionId: string,
    result: Record<string, unknown>,
  ): Promise<MemoryWriteDecisionRecord> {
    assertScope(scope);
    const appliedAt = Date.now();
    const safeResult = sanitizeStructured(result) as Record<string, unknown>;
    const updates = await this.client.transaction([{
      kind: 'run',
      sql: `UPDATE memory_write_decisions
               SET applied_at = ?, apply_result_json = ?
             WHERE id = ? AND principal_id = ? AND IFNULL(project_id, '') = ?`,
      params: [appliedAt, stableJson(safeResult), decisionId, scope.principalId, project(scope)],
    }]);
    const changes = Number((updates[0] as { changes?: number } | undefined)?.changes ?? 0);
    if (changes !== 1) throw new Error('MEMORY_WRITE_DECISION_NOT_FOUND');
    return (await this.getWriteDecision(scope, decisionId))!;
  }

  async getWriteDecision(scope: MemoryScope, decisionId: string): Promise<MemoryWriteDecisionRecord | null> {
    assertScope(scope);
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT * FROM memory_write_decisions
        WHERE id = ? AND principal_id = ? AND IFNULL(project_id, '') = ?
        LIMIT 1`,
      [decisionId, scope.principalId, project(scope)],
    );
    return rows[0] ? decisionFromRow(rows[0]) : null;
  }

  async recordRecallExpansion(input: MemoryRecallExpansionInput): Promise<MemoryRecallExpansionRecord> {
    assertScope(input.scope);
    if (
      !input.contextId?.trim()
      || !input.sourceMemoryId?.trim()
      || !input.targetMemoryId?.trim()
      || !Number.isInteger(input.depth)
      || input.depth < 1
      || !Number.isFinite(input.score)
    ) throw new Error('MEMORY_RECALL_EXPANSION_INVALID');
    const id = randomUUID();
    const createdAt = input.createdAt ?? Date.now();
    await this.client.transaction([{
      kind: 'run',
      sql: `INSERT INTO memory_recall_expansions(
        id, principal_id, project_id, context_id, source_memory_id, target_memory_id,
        depth, relation_path_json, reason_code, score, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        input.scope.principalId,
        input.scope.projectId ?? null,
        input.contextId,
        input.sourceMemoryId,
        input.targetMemoryId,
        input.depth,
        stableJson(input.relationPath),
        sanitizedString(input.reasonCode),
        input.score,
        createdAt,
      ],
    }]);
    const rows = await this.client.query<Record<string, unknown>>(
      'SELECT * FROM memory_recall_expansions WHERE id = ? AND principal_id = ? AND IFNULL(project_id, \'\') = ?',
      [id, input.scope.principalId, project(input.scope)],
    );
    return expansionFromRow(rows[0]!);
  }

  async listRecallExpansions(scope: MemoryScope, contextId: string): Promise<MemoryRecallExpansionRecord[]> {
    assertScope(scope);
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT * FROM memory_recall_expansions
        WHERE principal_id = ? AND IFNULL(project_id, '') = ? AND context_id = ?
        ORDER BY created_at ASC, depth ASC, target_memory_id COLLATE BINARY ASC, id COLLATE BINARY ASC`,
      [scope.principalId, project(scope), contextId],
    );
    return rows.map(expansionFromRow);
  }

  async upsertNodeMetadata(input: MemoryNodeMetadataInput): Promise<MemoryNodeMetadataRecord> {
    assertScope(input.scope);
    const item = await this.scopedMemoryExists(input.scope, input.memoryId);
    if (!item) throw new Error('MEMORY_NODE_METADATA_NOT_FOUND');
    if (input.branchParentMemoryId && !await this.scopedMemoryExists(input.scope, input.branchParentMemoryId)) {
      throw new Error('MEMORY_NODE_METADATA_PARENT_NOT_FOUND');
    }
    if (input.createdFromDecisionId && !await this.getWriteDecision(input.scope, input.createdFromDecisionId)) {
      throw new Error('MEMORY_NODE_METADATA_DECISION_NOT_FOUND');
    }
    const semanticProfile = input.semanticProfile
      ? sanitizeStructured(input.semanticProfile) as Record<string, unknown>
      : undefined;
    const semanticProfileJson = semanticProfile ? stableJson(semanticProfile) : null;
    const semanticProfileHash = semanticProfileJson
      ? createHash('sha256').update(semanticProfileJson, 'utf8').digest('hex')
      : null;
    const updatedAt = input.updatedAt ?? Date.now();
    await this.client.transaction([{
      kind: 'run',
      sql: `INSERT INTO memory_node_metadata(
        memory_id, title, root_reason, novelty_class, created_from_decision_id,
        branch_parent_memory_id, semantic_profile_json, semantic_profile_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_id) DO UPDATE SET
        title = excluded.title,
        root_reason = excluded.root_reason,
        novelty_class = excluded.novelty_class,
        created_from_decision_id = excluded.created_from_decision_id,
        branch_parent_memory_id = excluded.branch_parent_memory_id,
        semantic_profile_json = excluded.semantic_profile_json,
        semantic_profile_hash = excluded.semantic_profile_hash,
        updated_at = excluded.updated_at`,
      params: [
        input.memoryId,
        input.title ? sanitizedString(input.title) : null,
        input.rootReason ? sanitizedString(input.rootReason) : null,
        input.noveltyClass ? sanitizedString(input.noveltyClass) : null,
        input.createdFromDecisionId ?? null,
        input.branchParentMemoryId ?? null,
        semanticProfileJson,
        semanticProfileHash,
        updatedAt,
      ],
    }]);
    return (await this.getNodeMetadata(input.scope, input.memoryId))!;
  }

  async getNodeMetadata(scope: MemoryScope, memoryId: string): Promise<MemoryNodeMetadataRecord | null> {
    assertScope(scope);
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT metadata.*
         FROM memory_node_metadata AS metadata
         JOIN memory_items AS item ON item.id = metadata.memory_id
        WHERE metadata.memory_id = ? AND item.principal_id = ? AND IFNULL(item.project_id, '') = ?
        LIMIT 1`,
      [memoryId, scope.principalId, project(scope)],
    );
    return rows[0] ? metadataFromRow(rows[0]) : null;
  }

  async setRemoteState(input: MemoryRemoteStateInput): Promise<MemoryRemoteStateRecord> {
    assertScope(input.scope);
    if (!DURABILITY_STATES.has(input.durabilityState)) throw new Error('MEMORY_REMOTE_STATE_INVALID');
    if (input.hydrationState && !HYDRATION_STATES.has(input.hydrationState)) throw new Error('MEMORY_REMOTE_STATE_INVALID');
    const updatedAt = input.updatedAt ?? Date.now();
    await this.client.transaction([{
      kind: 'run',
      sql: `INSERT INTO memory_remote_state(
        principal_id, project_id, durability_state, hydration_state,
        remote_generation, remote_head, logical_state_hash, last_error_code, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(principal_id, project_id) DO UPDATE SET
        durability_state = excluded.durability_state,
        hydration_state = excluded.hydration_state,
        remote_generation = excluded.remote_generation,
        remote_head = excluded.remote_head,
        logical_state_hash = excluded.logical_state_hash,
        last_error_code = excluded.last_error_code,
        updated_at = excluded.updated_at`,
      params: [
        input.scope.principalId,
        project(input.scope),
        input.durabilityState,
        input.hydrationState ?? null,
        input.remoteGeneration ?? null,
        input.remoteHead ?? null,
        input.logicalStateHash ?? null,
        input.lastErrorCode ? sanitizedString(input.lastErrorCode) : null,
        updatedAt,
      ],
    }]);
    return (await this.getRemoteState(input.scope))!;
  }

  async getRemoteState(scope: MemoryScope): Promise<MemoryRemoteStateRecord | null> {
    assertScope(scope);
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT * FROM memory_remote_state
        WHERE principal_id = ? AND project_id = ?
        LIMIT 1`,
      [scope.principalId, project(scope)],
    );
    return rows[0] ? remoteFromRow(rows[0]) : null;
  }

  private async scopedMemoryExists(scope: MemoryScope, memoryId: string): Promise<boolean> {
    const rows = await this.client.query<{ count: number }>(
      `SELECT count(*) AS count FROM memory_items
        WHERE id = ? AND principal_id = ? AND IFNULL(project_id, '') = ?`,
      [memoryId, scope.principalId, project(scope)],
    );
    return Number(rows[0]?.count ?? 0) === 1;
  }
}
