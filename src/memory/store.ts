import { createHash, randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { MEMORY_ANCHOR_TYPES, extractMemoryAnchors } from './anchors.js';
import { createMemoryBackup, type MemoryBackupRecord } from './backup.js';
import { auditedEdgeInsertOperations } from './cognition-ledger.js';
import { normalizeCanonicalKey, normalizeMemoryText } from './normalizer.js';
import { containsRedactionMarker, redactMemoryText } from './redaction.js';
import { RELATION_WEIGHTS, shouldMirrorMemoryRelation } from './relation-policy.js';
import type { MemoryLogicalStateProjection } from './logical-state-hash.js';
import {
  MEMORY_MIGRATIONS,
  MEMORY_FTS_REBUILD_SQL,

  MEMORY_SCHEMA_VERSION,
} from './schema.js';
import { MUTABLE_MEMORY_KINDS } from './types.js';
import type {
  MemoryCommitRequest,
  MemoryCommitResult,
  MemoryEnforcement,
  MemoryKind,
  MemoryEventId,
  MemoryId,
  MemoryRelation,
  MemoryReviseRequest,
  MemoryReviseResult,
  MemoryScope,
  MemoryState,
} from './types.js';
import { MemoryWorkerClient, type MemoryWorkerClientOptions } from './worker-client.js';
import type { MemoryWorkerSqlOperation, SqlPrimitive } from './db-worker.js';

export class MemoryStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MemoryStoreError';
    this.code = code;
  }
}

export interface MemoryStoreOpenOptions {
  dbPath: string;
  busyTimeoutMs?: number;
}

export interface MemoryStoreOpenResult {
  priorUserVersion: number;
  schemaVersion: number;
  quickCheck: string;
  integrity: string;
  integrityCheckedAt: number;
  migrationBackup?: MemoryBackupRecord;
}

export interface RecordMemoryEventRequest {
  scope: MemoryScope;
  eventType: string;
  sourceType: string;
  sourceRef?: string;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryEventRecord {
  eventId: string;
  redactedText: string;
  createdAt: number;
}

export interface StoredMemoryRecord {
  memoryId: string;
  revisionId: string;
  revisionNo: number;
  principalId: string;
  projectId?: string;
  canonicalKey: string;
  kind: MemoryKind;
  state: MemoryState;
  importance: number;
  pinned: boolean;
  enforcement: MemoryEnforcement;
  valueText: string;
  valueJson?: string;
  valueHash: string;
  sourceEventId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredMemoryRevision {
  revisionId: string;
  memoryId: string;
  revisionNo: number;
  valueText: string;
  valueJson?: string;
  valueHash: string;
  sourceEventId?: string;
  validFrom: number;
  validTo?: number;
  supersedesRevisionId?: string;
  createdAt: number;
}

interface MemoryStoreCommitResult extends MemoryCommitResult {
  createdExplicitEdges: number;
}

type ExistingMemoryRow = {
  id: string;
  canonical_key: string;
  kind: MemoryKind;
  state: MemoryState;
  importance: number;
  pinned: number;
  enforcement: MemoryEnforcement;
  current_revision_id: string;
  created_at: number;
  updated_at: number;
  revision_no: number;
  value_hash: string;
};

function scopeProject(scope: MemoryScope): string {
  return scope.projectId ?? '';
}

function assertScope(scope: MemoryScope): void {
  if (!scope.principalId?.trim()) throw new MemoryStoreError('MEMORY_SCOPE_REQUIRED', 'principalId is required');
}

const MEMORY_ANCHOR_TYPE_SET = new Set<string>(MEMORY_ANCHOR_TYPES);

function validatedExplicitAnchors(request: MemoryCommitRequest): Array<{ type: string; value: string }> {
  return (request.explicitAnchors ?? []).map((anchor) => {
    const type = String(anchor.type ?? '');
    const value = String(anchor.value ?? '').trim();
    const redacted = value ? redactMemoryText(value).text : '';
    if (
      !MEMORY_ANCHOR_TYPE_SET.has(type)
      || !value
      || containsRedactionMarker(value)
      || /REDACTED/i.test(value)
      || redacted !== value
    ) {
      throw new MemoryStoreError(
        'MEMORY_EXPLICIT_ANCHOR_INVALID',
        'explicit anchors require a valid type and a non-secret value',
      );
    }
    return { type, value };
  });
}

function sanitizeStructured(value: unknown, keyName = ''): unknown {
  const secretKey = /^(?:authorization|api[_-]?key|client[_-]?secret|access[_-]?key|password|passwd|pwd|token|refresh[_-]?token|access[_-]?token)$/i;
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

export function normalizeMemoryValue(value: MemoryCommitRequest['value']): { valueText: string; valueJson?: string; valueHash: string } {
  const sanitized = sanitizeStructured(value);
  let valueText: string;
  let valueJson: string | undefined;

  if (typeof sanitized === 'string') {
    valueText = normalizeMemoryText(sanitized).canonical;
  } else {
    valueJson = stableJson(sanitized);
    valueText = normalizeMemoryText(valueJson).canonical;
  }

  return {
    valueText,
    valueJson,
    valueHash: createHash('sha256').update(valueText, 'utf8').digest('hex'),
  };
}

function metadataJson(metadata: Record<string, unknown> | undefined): string {
  return stableJson(sanitizeStructured(metadata ?? {}));
}

async function databaseFileExists(dbPath: string): Promise<boolean> {
  if (dbPath === ':memory:') return false;
  try {
    const info = await stat(dbPath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function eventInsertOperation(
  eventId: string,
  request: RecordMemoryEventRequest,
  redactedText: string,
  createdAt: number,
): MemoryWorkerSqlOperation {
  return {
    kind: 'run',
    sql: `INSERT INTO memory_events(
      id, principal_id, project_id, thread_id, resource_id, event_type, source_type, source_ref,
      raw_text, redacted_text, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    params: [
      eventId,
      request.scope.principalId,
      request.scope.projectId ?? null,
      request.scope.threadId ?? null,
      request.scope.resourceId ?? null,
      request.eventType,
      request.sourceType,
      request.sourceRef ? redactMemoryText(request.sourceRef).text : null,
      redactedText,
      metadataJson(request.metadata),
      createdAt,
    ],
  };
}

const MAX_LOGICAL_REPLAY_ROWS = 1_500_000;

function replayRows(value: unknown[], label: string): Array<Record<string, unknown>> {
  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', `${label} contains a non-object row`);
    }
    return row as Record<string, unknown>;
  });
}

function replayString(row: Record<string, unknown>, key: string, nullable = false): string | null {
  const value = row[key];
  if (value == null && nullable) return null;
  if (typeof value !== 'string') throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', `${key} must be a string`);
  return value;
}

function replayNumber(row: Record<string, unknown>, key: string, nullable = false): number | null {
  const value = row[key];
  if (value == null && nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', `${key} must be a finite number`);
  }
  return value;
}

function replayJson(value: unknown): string | null {
  if (value == null) return null;
  return stableJson(value);
}

function replayProject(value: unknown): string {
  return value == null ? '' : String(value);
}

function assertReplayScope(row: Record<string, unknown>, principalId: string, projectId: string): void {
  if (row.principal_id !== principalId || replayProject(row.project_id) !== projectId) {
    throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_SCOPE_MISMATCH', 'Logical replay row escaped the authenticated scope');
  }
}

async function runReplayOperations(client: MemoryWorkerClient, operations: MemoryWorkerSqlOperation[]): Promise<void> {
  for (let offset = 0; offset < operations.length; offset += 900) {
    const chunk = operations.slice(offset, offset + 900);
    if (chunk.length) await client.transaction(chunk);
  }
}

export class MemoryStore {
  private opened = false;
  private closed = false;

  constructor(readonly client: MemoryWorkerClient = new MemoryWorkerClient()) {}

  static withWorkerOptions(options: MemoryWorkerClientOptions): MemoryStore {
    return new MemoryStore(new MemoryWorkerClient(options));
  }

  async open(options: MemoryStoreOpenOptions): Promise<MemoryStoreOpenResult> {
    if (this.opened) {
      const integrity = await this.client.integrity();
      return {
        priorUserVersion: MEMORY_SCHEMA_VERSION,
        schemaVersion: MEMORY_SCHEMA_VERSION,
        quickCheck: 'ok',
        integrity: integrity.result,
        integrityCheckedAt: Date.now(),
      };
    }
    if (this.closed) throw new MemoryStoreError('MEMORY_STORE_CLOSED', 'Memory store is closed');
    const existedBeforeOpen = await databaseFileExists(options.dbPath);
    const opened = await this.client.open({ dbPath: options.dbPath, busyTimeoutMs: options.busyTimeoutMs });
    const versionRows = await this.client.query<Record<string, unknown>>('PRAGMA user_version');
    const priorUserVersion = Number(versionRows[0]?.user_version ?? 0);
    if (!Number.isInteger(priorUserVersion) || priorUserVersion < 0) {
      throw new MemoryStoreError('MEMORY_SCHEMA_VERSION_INVALID', 'SQLite user_version is invalid');
    }
    if (priorUserVersion > MEMORY_SCHEMA_VERSION) {
      throw new MemoryStoreError(
        'MEMORY_SCHEMA_NEWER_THAN_RUNTIME',
        `Memory schema version ${priorUserVersion} is newer than runtime ${MEMORY_SCHEMA_VERSION}`,
      );
    }

    let migrationBackup: MemoryBackupRecord | undefined;
    if (existedBeforeOpen && priorUserVersion < MEMORY_SCHEMA_VERSION) {
      migrationBackup = await createMemoryBackup(
        this.client,
        options.dbPath,
        `pre-migration-v${priorUserVersion}-to-v${MEMORY_SCHEMA_VERSION}`,
      );
    }

    const migrationOperations: MemoryWorkerSqlOperation[] = [];
    for (const migration of MEMORY_MIGRATIONS) {
      if (migration.version <= priorUserVersion) continue;
      migrationOperations.push({ kind: 'exec', sql: migration.sql });
      migrationOperations.push({
        kind: 'run',
        sql: 'INSERT OR IGNORE INTO memory_schema_migrations(version, name, applied_at) VALUES (?, ?, ?)',
        params: [migration.version, migration.name, Date.now()],
      });
    }
    migrationOperations.push({ kind: 'exec', sql: `PRAGMA user_version = ${MEMORY_SCHEMA_VERSION}` });
    await this.client.transaction(migrationOperations);
    const integrity = await this.client.integrity();
    const integrityCheckedAt = Date.now();
    if (!integrity.ok) {
      throw new MemoryStoreError('MEMORY_INTEGRITY_FAILED', `SQLite integrity_check failed: ${integrity.result}`);
    }
    this.opened = true;
    return {
      priorUserVersion,
      schemaVersion: MEMORY_SCHEMA_VERSION,
      quickCheck: opened.quickCheck,
      integrity: integrity.result,
      integrityCheckedAt,
      ...(migrationBackup ? { migrationBackup } : {}),
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.opened) await this.client.checkpoint();
    } finally {
      await this.client.close();
    }
  }

  async recordEvent(request: RecordMemoryEventRequest): Promise<MemoryEventRecord> {
    this.assertReady();
    assertScope(request.scope);
    if (!request.eventType?.trim() || !request.sourceType?.trim()) {
      throw new MemoryStoreError('MEMORY_EVENT_INVALID', 'eventType and sourceType are required');
    }
    const eventId = randomUUID();
    const createdAt = Date.now();
    const redactedText = normalizeMemoryText(redactMemoryText(request.text ?? '').text).canonical;
    await this.client.transaction([eventInsertOperation(eventId, request, redactedText, createdAt)]);
    return { eventId, redactedText, createdAt };
  }

  async commitMemory(request: MemoryCommitRequest): Promise<MemoryStoreCommitResult> {
    this.assertReady();
    assertScope(request.scope);
    const canonicalKey = normalizeCanonicalKey(request.canonicalKey ?? '');
    if (!canonicalKey) throw new MemoryStoreError('MEMORY_CANONICAL_KEY_REQUIRED', 'canonicalKey is required');
    const importance = request.importance ?? 0.5;
    if (!Number.isFinite(importance) || importance < 0 || importance > 1) {
      throw new MemoryStoreError('MEMORY_IMPORTANCE_INVALID', 'importance must be between 0 and 1');
    }

    const normalized = normalizeMemoryValue(request.value);
    const existing = await this.findByCanonicalKey(request.scope, canonicalKey);
    if (existing && existing.kind !== request.kind) {
      throw new MemoryStoreError('MEMORY_KIND_MISMATCH', 'canonicalKey already exists with a different memory kind');
    }
    if (existing && existing.value_hash !== normalized.valueHash && request.revisionAuthority !== 'structured_state') {
      throw new MemoryStoreError(
        'MEMORY_REVISION_REQUIRED',
        'Changing an existing canonical memory requires memory_revise or structured revision authority',
      );
    }

    return this.writeRevision({
      request,
      canonicalKey,
      normalized,
      existing,
      eventType: existing && existing.value_hash !== normalized.valueHash ? 'memory.revised' : 'memory.committed',
    });
  }

  async reviseMemory(request: MemoryReviseRequest): Promise<MemoryReviseResult> {
    this.assertReady();
    assertScope(request.scope);
    const current = await this.findById(request.scope, request.memoryId);
    if (!current) throw new MemoryStoreError('MEMORY_NOT_FOUND', 'Memory not found in authenticated scope');
    if (!MUTABLE_MEMORY_KINDS.includes(current.kind as (typeof MUTABLE_MEMORY_KINDS)[number])) {
      throw new MemoryStoreError('MEMORY_KIND_IMMUTABLE', `Memory kind "${current.kind}" cannot be revised in place`);
    }
    const normalized = normalizeMemoryValue(request.value);
    const stored = await this.writeRevision({
      request: {
        scope: request.scope,
        canonicalKey: current.canonical_key,
        kind: current.kind,
        value: request.value,
        importance: current.importance,
        pinned: current.pinned === 1,
        enforcement: current.enforcement,
        sourceType: request.sourceType,
        sourceRef: request.sourceRef,
        metadata: request.metadata,
      },
      canonicalKey: current.canonical_key,
      normalized,
      existing: current,
      eventType: 'memory.revised',
    });
    const { createdExplicitEdges: _createdExplicitEdges, ...result } = stored;
    return {
      ...result,
      supersededRevisionId: result.revisionId === current.current_revision_id ? undefined : current.current_revision_id,
    };
  }

  async getMemory(scope: MemoryScope, memoryId: string): Promise<StoredMemoryRecord | null> {
    this.assertReady();
    assertScope(scope);
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT
        item.id AS memory_id, item.principal_id, item.project_id, item.canonical_key, item.kind, item.state,
        item.importance, item.pinned, item.enforcement, item.created_at, item.updated_at,
        revision.id AS revision_id, revision.revision_no, revision.value_text, revision.value_json,
        revision.value_hash, revision.source_event_id
       FROM memory_items AS item
       JOIN memory_revisions AS revision ON revision.id = item.current_revision_id
       WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ? AND item.id = ?
       LIMIT 1`,
      [scope.principalId, scopeProject(scope), memoryId],
    );
    const row = rows[0];
    return row ? mapStoredMemory(row) : null;
  }

  async getMemoryByCanonicalKey(scope: MemoryScope, canonicalKey: string): Promise<StoredMemoryRecord | null> {
    this.assertReady();
    assertScope(scope);
    const normalizedKey = normalizeCanonicalKey(canonicalKey ?? '');
    if (!normalizedKey) return null;
    const existing = await this.findByCanonicalKey(scope, normalizedKey);
    return existing ? this.getMemory(scope, existing.id) : null;
  }

  async addExplicitRelation(input: {
    scope: MemoryScope;
    fromMemoryId: MemoryId;
    toMemoryId: MemoryId;
    relation: MemoryRelation;
    weight?: number;
    evidenceEventId?: MemoryEventId;
    reasonCode: string;
  }): Promise<{ createdEdges: number }> {
    this.assertReady();
    assertScope(input.scope);
    if (!input.fromMemoryId || !input.toMemoryId || input.fromMemoryId === input.toMemoryId) {
      throw new MemoryStoreError('MEMORY_RELATION_INVALID', 'Explicit relation requires two distinct memory IDs');
    }
    if (!input.reasonCode?.trim()) throw new MemoryStoreError('MEMORY_RELATION_REASON_REQUIRED', 'Explicit relation reasonCode is required');
    const source = await this.findById(input.scope, input.fromMemoryId);
    if (!source || source.state === 'tombstoned') {
      throw new MemoryStoreError('MEMORY_RELATION_SOURCE_NOT_FOUND', 'Explicit relation source was not found in authenticated scope');
    }
    const target = await this.findById(input.scope, input.toMemoryId);
    if (!target || target.state === 'tombstoned') {
      throw new MemoryStoreError('MEMORY_RELATION_TARGET_NOT_FOUND', 'Explicit relation target was not found in authenticated scope');
    }
    const weight = input.weight ?? RELATION_WEIGHTS[input.relation];
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new MemoryStoreError('MEMORY_RELATION_WEIGHT_INVALID', 'explicit relation weight must be between 0 and 1');
    }
    const now = Date.now();
    const operations = auditedEdgeInsertOperations({
      eventId: randomUUID(),
      scope: input.scope,
      fromMemoryId: input.fromMemoryId,
      toMemoryId: input.toMemoryId,
      relation: input.relation,
      weight,
      evidenceEventId: input.evidenceEventId,
      reasonCode: input.reasonCode,
      createdAt: now,
    });
    if (shouldMirrorMemoryRelation(input.relation)) {
      operations.push(...auditedEdgeInsertOperations({
        eventId: randomUUID(),
        scope: input.scope,
        fromMemoryId: input.toMemoryId,
        toMemoryId: input.fromMemoryId,
        relation: input.relation,
        weight,
        evidenceEventId: input.evidenceEventId,
        reasonCode: `${input.reasonCode}_MIRROR`,
        createdAt: now,
      }));
    }
    const results = await this.client.transaction(operations);
    let createdEdges = 0;
    for (let index = 0; index < results.length; index += 2) {
      const result = results[index];
      if (result && typeof result === 'object' && 'changes' in result) createdEdges += Number((result as { changes: number }).changes);
    }
    return { createdEdges };
  }

  async listRevisions(scope: MemoryScope, memoryId: string): Promise<StoredMemoryRevision[]> {
    this.assertReady();
    assertScope(scope);
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT revision.id AS revision_id, revision.memory_id, revision.revision_no, revision.value_text,
              revision.value_json, revision.value_hash, revision.source_event_id, revision.valid_from,
              revision.valid_to, revision.supersedes_revision_id, revision.created_at
         FROM memory_revisions AS revision
         JOIN memory_items AS item ON item.id = revision.memory_id
        WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ? AND item.id = ?
        ORDER BY revision.revision_no ASC`,
      [scope.principalId, scopeProject(scope), memoryId],
    );
    return rows.map(mapRevision);
  }

  async materializeLogicalProjection(projection: MemoryLogicalStateProjection): Promise<void> {
    this.assertReady();
    if ((projection.formatVersion !== 1 && projection.formatVersion !== 2) || !projection.scope?.principalId || typeof projection.scope.projectId !== 'string') {
      throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Logical replay projection format/scope is invalid');
    }
    const principalId = projection.scope.principalId;
    const projectId = projection.scope.projectId;
    const tables = {
      events: replayRows(projection.events, 'events'),
      items: replayRows(projection.items, 'items'),
      revisions: replayRows(projection.revisions, 'revisions'),
      anchors: replayRows(projection.anchors, 'anchors'),
      edges: replayRows(projection.edges, 'edges'),
      conflicts: replayRows(projection.conflicts, 'conflicts'),
      nodeMetadata: replayRows(projection.nodeMetadata, 'nodeMetadata'),
      writeDecisions: replayRows(projection.writeDecisions, 'writeDecisions'),
      edgeEvents: replayRows(projection.edgeEvents, 'edgeEvents'),
      continuityTasks: replayRows(projection.continuityTasks, 'continuityTasks'),
      continuityDependencies: replayRows(projection.continuityDependencies, 'continuityDependencies'),
      continuityCheckpoints: replayRows(projection.continuityCheckpoints, 'continuityCheckpoints'),
      continuityFrontier: replayRows(projection.continuityFrontier, 'continuityFrontier'),
      contextLifecycles: projection.formatVersion === 2
        ? replayRows(projection.contextLifecycles, 'contextLifecycles')
        : [],
    };
    const totalRows = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);
    if (totalRows > MAX_LOGICAL_REPLAY_ROWS) {
      throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_TOO_LARGE', 'Logical replay exceeds the bounded row count');
    }
    for (const rows of [
      tables.events, tables.items, tables.writeDecisions, tables.edgeEvents,
      tables.continuityTasks, tables.continuityCheckpoints, tables.continuityFrontier, tables.contextLifecycles,
    ]) {
      for (const row of rows) assertReplayScope(row, principalId, projectId);
    }

    const existing = await this.client.query<{ count: number }>(
      `SELECT (
        (SELECT count(*) FROM memory_events WHERE principal_id = ? AND IFNULL(project_id, '') = ?) +
        (SELECT count(*) FROM memory_items WHERE principal_id = ? AND IFNULL(project_id, '') = ?) +
        (SELECT count(*) FROM memory_write_decisions WHERE principal_id = ? AND IFNULL(project_id, '') = ?) +
        (SELECT count(*) FROM continuity_tasks WHERE principal_id = ? AND IFNULL(project_id, '') = ?) +
        (SELECT count(*) FROM memory_context_lifecycle WHERE principal_id = ? AND project_id = ?)
      ) AS count`,
      [principalId, projectId, principalId, projectId, principalId, projectId, principalId, projectId, principalId, projectId],
    );
    if (Number(existing[0]?.count ?? 0) !== 0) {
      throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_DESTINATION_NOT_EMPTY', 'Logical replay requires an empty destination scope');
    }

    const itemIds = new Set(tables.items.map((row) => replayString(row, 'id')!));
    const eventIds = new Set(tables.events.map((row) => replayString(row, 'id')!));
    const revisionIds = new Set(tables.revisions.map((row) => replayString(row, 'id')!));
    const decisionIds = new Set(tables.writeDecisions.map((row) => replayString(row, 'id')!));
    const taskIds = new Set(tables.continuityTasks.map((row) => replayString(row, 'id')!));
    const revisionById = new Map(tables.revisions.map((row) => [replayString(row, 'id')!, row]));

    for (const row of tables.items) {
      const currentRevisionId = replayString(row, 'current_revision_id');
      if (!revisionIds.has(currentRevisionId!)) throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Memory item current revision is missing');
      const revision = revisionById.get(currentRevisionId!);
      if (!revision || replayString(revision, 'memory_id') !== replayString(row, 'id')) {
        throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Memory item current revision belongs to another node');
      }
    }
    for (const row of tables.revisions) {
      const memoryId = replayString(row, 'memory_id')!;
      if (!itemIds.has(memoryId)) throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Revision references a missing memory item');
      const sourceEventId = replayString(row, 'source_event_id', true);
      if (sourceEventId && !eventIds.has(sourceEventId)) throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Revision references a missing event');
      const supersedes = replayString(row, 'supersedes_revision_id', true);
      if (supersedes) {
        const prior = revisionById.get(supersedes);
        if (!prior || replayString(prior, 'memory_id') !== memoryId || Number(prior.revision_no) >= Number(row.revision_no)) {
          throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Revision supersession chain is invalid');
        }
      }
    }
    for (const row of tables.anchors) if (!itemIds.has(replayString(row, 'memory_id')!)) {
      throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Anchor references a missing memory item');
    }
    for (const row of tables.edges) {
      if (!itemIds.has(replayString(row, 'from_memory_id')!) || !itemIds.has(replayString(row, 'to_memory_id')!)) {
        throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Edge references a missing memory item');
      }
      const evidence = replayString(row, 'evidence_event_id', true);
      if (evidence && !eventIds.has(evidence)) throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Edge references a missing event');
    }
    for (const row of tables.conflicts) {
      if (!itemIds.has(replayString(row, 'left_memory_id')!) || !itemIds.has(replayString(row, 'right_memory_id')!)) {
        throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Conflict references a missing memory item');
      }
    }
    for (const row of tables.nodeMetadata) {
      if (!itemIds.has(replayString(row, 'memory_id')!)) throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Node metadata references a missing memory item');
      const parent = replayString(row, 'branch_parent_memory_id', true);
      if (parent && !itemIds.has(parent)) throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Node metadata branch parent is missing');
      const decision = replayString(row, 'created_from_decision_id', true);
      if (decision && !decisionIds.has(decision)) throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Node metadata write decision is missing');
    }
    for (const row of tables.edgeEvents) {
      if (!itemIds.has(replayString(row, 'from_memory_id')!) || !itemIds.has(replayString(row, 'to_memory_id')!)) {
        throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Edge event references a missing memory item');
      }
    }
    for (const row of tables.continuityTasks) {
      const parent = replayString(row, 'parent_task_id', true);
      if (parent && !taskIds.has(parent)) throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Continuity parent task is missing');
    }
    for (const row of tables.continuityDependencies) {
      if (!taskIds.has(replayString(row, 'task_id')!) || !taskIds.has(replayString(row, 'depends_on_task_id')!)) {
        throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Continuity dependency references a missing task');
      }
    }
    for (const row of tables.continuityCheckpoints) if (!taskIds.has(replayString(row, 'task_id')!)) {
      throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Continuity checkpoint references a missing task');
    }
    for (const row of tables.continuityFrontier) if (!taskIds.has(replayString(row, 'source_task_id')!)) {
      throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Continuity frontier references a missing task');
    }
    for (const row of tables.contextLifecycles) {
      const taskId = replayString(row, 'continuity_task_id', true);
      if (taskId && !taskIds.has(taskId)) {
        throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Memory context lifecycle references a missing continuity task');
      }
      const state = replayString(row, 'postflight_state');
      if (!['OPEN', 'POSTFLIGHT_PENDING', 'CLOSED'].includes(state!)) {
        throw new MemoryStoreError('MEMORY_LOGICAL_REPLAY_INVALID', 'Memory context lifecycle state is invalid');
      }
    }

    await runReplayOperations(this.client, tables.events.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO memory_events(id, principal_id, project_id, thread_id, resource_id, event_type, source_type, source_ref, raw_text, redacted_text, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      params: [
        replayString(row, 'id')!, principalId, projectId || null,
        replayString(row, 'thread_id', true), replayString(row, 'resource_id', true),
        replayString(row, 'event_type')!, replayString(row, 'source_type')!, replayString(row, 'source_ref', true),
        replayString(row, 'redacted_text')!, replayJson(row.metadata_json)!, replayNumber(row, 'created_at')!,
      ],
    })));
    await runReplayOperations(this.client, tables.items.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO memory_items(id, principal_id, project_id, canonical_key, kind, state, importance, pinned, enforcement,
             current_revision_id, created_at, updated_at, last_accessed_at, access_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)`,
      params: [
        replayString(row, 'id')!, principalId, projectId || null, replayString(row, 'canonical_key')!, replayString(row, 'kind')!,
        replayString(row, 'state')!, replayNumber(row, 'importance')!, replayNumber(row, 'pinned')!, replayString(row, 'enforcement')!,
        replayNumber(row, 'created_at')!, replayNumber(row, 'updated_at')!, replayNumber(row, 'updated_at')!,
      ],
    })));
    const orderedRevisions = [...tables.revisions].sort((left, right) =>
      String(left.memory_id).localeCompare(String(right.memory_id)) || Number(left.revision_no) - Number(right.revision_no));
    await runReplayOperations(this.client, orderedRevisions.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO memory_revisions(id, memory_id, revision_no, value_text, value_json, value_hash, source_event_id,
             valid_from, valid_to, supersedes_revision_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        replayString(row, 'id')!, replayString(row, 'memory_id')!, replayNumber(row, 'revision_no')!, replayString(row, 'value_text')!,
        replayJson(row.value_json), replayString(row, 'value_hash')!, replayString(row, 'source_event_id', true), replayNumber(row, 'valid_from')!,
        replayNumber(row, 'valid_to', true), replayString(row, 'supersedes_revision_id', true), replayNumber(row, 'created_at')!,
      ],
    })));
    await runReplayOperations(this.client, tables.items.map((row) => ({
      kind: 'run' as const,
      sql: 'UPDATE memory_items SET current_revision_id = ? WHERE id = ? AND principal_id = ? AND IFNULL(project_id, \'\') = ?',
      params: [replayString(row, 'current_revision_id')!, replayString(row, 'id')!, principalId, projectId],
    })));
    await runReplayOperations(this.client, tables.anchors.map((row) => ({
      kind: 'run' as const,
      sql: 'INSERT INTO memory_anchors(memory_id, anchor, anchor_type, created_at) VALUES (?, ?, ?, ?)',
      params: [replayString(row, 'memory_id')!, replayString(row, 'anchor')!, replayString(row, 'anchor_type')!, replayNumber(row, 'created_at')!],
    })));
    await runReplayOperations(this.client, tables.edges.map((row) => ({
      kind: 'run' as const,
      sql: 'INSERT INTO memory_edges(from_memory_id, to_memory_id, relation, weight, evidence_event_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [replayString(row, 'from_memory_id')!, replayString(row, 'to_memory_id')!, replayString(row, 'relation')!, replayNumber(row, 'weight')!, replayString(row, 'evidence_event_id', true), replayNumber(row, 'created_at')!],
    })));
    await runReplayOperations(this.client, tables.conflicts.map((row) => ({
      kind: 'run' as const,
      sql: 'INSERT INTO memory_conflicts(id, left_memory_id, right_memory_id, conflict_type, status, evidence_json, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [replayString(row, 'id')!, replayString(row, 'left_memory_id')!, replayString(row, 'right_memory_id')!, replayString(row, 'conflict_type')!, replayString(row, 'status')!, replayJson(row.evidence_json)!, replayNumber(row, 'created_at')!, replayNumber(row, 'resolved_at', true)],
    })));
    await runReplayOperations(this.client, tables.writeDecisions.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO memory_write_decisions(id, principal_id, project_id, route_context_id, continuity_task_id, context_id,
             decision_type, candidate_canonical_key, candidate_hash, target_memory_id, existing_memory_ids_json, reason_codes_json,
             evidence_refs_json, relation_plan_json, root_reason, created_at, applied_at, apply_result_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        replayString(row, 'id')!, principalId, projectId || null, replayString(row, 'route_context_id')!,
        replayString(row, 'continuity_task_id', true), replayString(row, 'context_id', true), replayString(row, 'decision_type')!,
        replayString(row, 'candidate_canonical_key', true), replayString(row, 'candidate_hash')!, replayString(row, 'target_memory_id', true),
        replayJson(row.existing_memory_ids_json)!, replayJson(row.reason_codes_json)!, replayJson(row.evidence_refs_json)!,
        replayJson(row.relation_plan_json)!, replayString(row, 'root_reason', true), replayNumber(row, 'created_at')!,
        replayNumber(row, 'applied_at', true), replayJson(row.apply_result_json),
      ],
    })));
    await runReplayOperations(this.client, tables.nodeMetadata.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO memory_node_metadata(memory_id, title, root_reason, novelty_class, created_from_decision_id,
             branch_parent_memory_id, semantic_profile_json, semantic_profile_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        replayString(row, 'memory_id')!, replayString(row, 'title', true), replayString(row, 'root_reason', true), replayString(row, 'novelty_class', true),
        replayString(row, 'created_from_decision_id', true), replayString(row, 'branch_parent_memory_id', true), replayJson(row.semantic_profile_json),
        replayString(row, 'semantic_profile_hash', true), replayNumber(row, 'updated_at')!,
      ],
    })));
    await runReplayOperations(this.client, tables.edgeEvents.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO memory_edge_events(id, principal_id, project_id, event_type, from_memory_id, to_memory_id, relation,
             old_weight, new_weight, evidence_event_id, reason_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        replayString(row, 'id')!, principalId, projectId || null, replayString(row, 'event_type')!, replayString(row, 'from_memory_id')!,
        replayString(row, 'to_memory_id')!, replayString(row, 'relation')!, replayNumber(row, 'old_weight', true), replayNumber(row, 'new_weight', true),
        replayString(row, 'evidence_event_id', true), replayString(row, 'reason_code')!, replayNumber(row, 'created_at')!,
      ],
    })));
    await runReplayOperations(this.client, tables.continuityTasks.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO continuity_tasks(id, principal_id, project_id, parent_task_id, title, objective, acceptance_json,
             constraints_json, status, priority, blocker_json, last_checkpoint_id, created_at, updated_at, completed_at)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        replayString(row, 'id')!, principalId, projectId || null, replayString(row, 'title')!, replayString(row, 'objective', true),
        replayJson(row.acceptance_json)!, replayJson(row.constraints_json)!, replayString(row, 'status')!, replayNumber(row, 'priority')!,
        replayJson(row.blocker_json)!, replayString(row, 'last_checkpoint_id', true), replayNumber(row, 'created_at')!,
        replayNumber(row, 'updated_at')!, replayNumber(row, 'completed_at', true),
      ],
    })));
    await runReplayOperations(this.client, tables.continuityTasks
      .filter((row) => row.parent_task_id != null)
      .map((row) => ({
        kind: 'run' as const,
        sql: 'UPDATE continuity_tasks SET parent_task_id = ? WHERE id = ? AND principal_id = ? AND IFNULL(project_id, \'\') = ?',
        params: [replayString(row, 'parent_task_id')!, replayString(row, 'id')!, principalId, projectId],
      })));
    await runReplayOperations(this.client, tables.continuityDependencies.map((row) => ({
      kind: 'run' as const,
      sql: 'INSERT INTO continuity_task_dependencies(task_id, depends_on_task_id, dependency_type, created_at) VALUES (?, ?, ?, ?)',
      params: [replayString(row, 'task_id')!, replayString(row, 'depends_on_task_id')!, replayString(row, 'dependency_type')!, replayNumber(row, 'created_at')!],
    })));
    await runReplayOperations(this.client, tables.continuityCheckpoints.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO continuity_checkpoints(id, principal_id, project_id, task_id, route_context_id, phase, summary_json,
             evidence_json, state_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        replayString(row, 'id')!, principalId, projectId || null, replayString(row, 'task_id')!, replayString(row, 'route_context_id')!,
        replayString(row, 'phase')!, replayJson(row.summary_json)!, replayJson(row.evidence_json)!, replayString(row, 'state_hash')!, replayNumber(row, 'created_at')!,
      ],
    })));
    await runReplayOperations(this.client, tables.continuityFrontier.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO continuity_frontier(id, principal_id, project_id, source_task_id, title, rationale, status,
             dependency_task_ids_json, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        replayString(row, 'id')!, principalId, projectId || null, replayString(row, 'source_task_id')!, replayString(row, 'title')!,
        replayString(row, 'rationale')!, replayString(row, 'status')!, replayJson(row.dependency_task_ids_json)!, replayNumber(row, 'priority')!,
        replayNumber(row, 'created_at')!, replayNumber(row, 'updated_at')!,
      ],
    })));
    await runReplayOperations(this.client, tables.contextLifecycles.map((row) => ({
      kind: 'run' as const,
      sql: `INSERT INTO memory_context_lifecycle(
             context_id, principal_id, project_id, route_context_id, continuity_task_id, objective_hash, postflight_state,
             meaningful_work_count, first_meaningful_at, last_meaningful_at, last_tool_name, last_reason_code,
             postflight_applied_at, closed_at, local_durable_generation, local_durable_hash, created_at, updated_at, expires_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      params: [
        replayString(row, 'context_id')!, principalId, projectId, replayString(row, 'route_context_id')!,
        replayString(row, 'continuity_task_id', true), replayString(row, 'objective_hash')!, replayString(row, 'postflight_state')!,
        replayNumber(row, 'meaningful_work_count')!, replayNumber(row, 'first_meaningful_at', true),
        replayNumber(row, 'last_meaningful_at', true), replayString(row, 'last_tool_name', true),
        replayString(row, 'last_reason_code', true), replayNumber(row, 'postflight_applied_at', true),
        replayNumber(row, 'closed_at', true), replayNumber(row, 'created_at')!, replayNumber(row, 'updated_at')!,
        replayNumber(row, 'expires_at')!,
      ],
    })));
    await this.client.transaction([{ kind: 'exec', sql: MEMORY_FTS_REBUILD_SQL }]);
  }

  async tombstoneMemory(scope: MemoryScope, memoryId: string, reason: string): Promise<void> {
    this.assertReady();
    assertScope(scope);
    const current = await this.findById(scope, memoryId);
    if (!current) throw new MemoryStoreError('MEMORY_NOT_FOUND', 'Memory not found in authenticated scope');
    const eventId = randomUUID();
    const now = Date.now();
    const eventRequest: RecordMemoryEventRequest = {
      scope,
      eventType: 'memory.tombstoned',
      sourceType: 'memory_forget',
      sourceRef: memoryId,
      text: reason,
      metadata: { memoryId },
    };
    const redacted = normalizeMemoryText(redactMemoryText(reason).text).canonical;
    await this.client.transaction([
      eventInsertOperation(eventId, eventRequest, redacted, now),
      {
        kind: 'run',
        sql: `UPDATE memory_items SET state = 'tombstoned', updated_at = ?
              WHERE id = ? AND principal_id = ? AND IFNULL(project_id, '') = ?`,
        params: [now, memoryId, scope.principalId, scopeProject(scope)],
      },
      { kind: 'exec', sql: MEMORY_FTS_REBUILD_SQL },
    ]);
  }

  private async writeRevision(input: {
    request: MemoryCommitRequest;
    canonicalKey: string;
    normalized: { valueText: string; valueJson?: string; valueHash: string };
    existing: ExistingMemoryRow | null;
    eventType: string;
  }): Promise<MemoryStoreCommitResult> {
    const { request, canonicalKey, normalized, existing } = input;
    for (const relation of request.explicitRelations ?? []) {
      if (!await this.findById(request.scope, relation.targetMemoryId)) {
        throw new MemoryStoreError(
          'MEMORY_RELATION_TARGET_NOT_FOUND',
          'Explicit relation target was not found in the authenticated principal/project scope',
        );
      }
    }
    const now = Date.now();
    const eventId = randomUUID();
    const memoryId = existing?.id ?? randomUUID();
    const eventRequest: RecordMemoryEventRequest = {
      scope: request.scope,
      eventType: input.eventType,
      sourceType: request.sourceType ?? 'primary_ai',
      sourceRef: request.sourceRef,
      text: normalized.valueText,
      metadata: {
        ...(request.metadata ?? {}),
        canonicalKey,
        kind: request.kind,
        memoryId,
      },
    };

    if (existing?.value_hash === normalized.valueHash) {
      await this.client.transaction([
        eventInsertOperation(eventId, eventRequest, normalized.valueText, now),
        {
          kind: 'run',
          sql: 'UPDATE memory_items SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ? AND principal_id = ?',
          params: [now, memoryId, request.scope.principalId],
        },
      ]);
      return {
        memoryId,
        revisionId: existing.current_revision_id,
        eventId,
        revisionNo: existing.revision_no,
        deduplicated: true,
        state: existing.state,
        createdExplicitEdges: 0,
      };
    }

    const revisionId = randomUUID();
    const revisionNo = (existing?.revision_no ?? 0) + 1;
    const operations: MemoryWorkerSqlOperation[] = [eventInsertOperation(eventId, eventRequest, normalized.valueText, now)];
    const explicitEdgeOperationIndexes: number[] = [];

    if (!existing) {
      operations.push({
        kind: 'run',
        sql: `INSERT INTO memory_items(
          id, principal_id, project_id, canonical_key, kind, state, importance, pinned, enforcement,
          current_revision_id, created_at, updated_at, last_accessed_at, access_count
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, ?, ?, ?, 0)`,
        params: [
          memoryId,
          request.scope.principalId,
          request.scope.projectId ?? null,
          canonicalKey,
          request.kind,
          request.importance ?? 0.5,
          request.pinned ? 1 : 0,
          request.enforcement ?? 'none',
          now,
          now,
          now,
        ],
      });
    } else {
      operations.push({
        kind: 'run',
        sql: 'UPDATE memory_revisions SET valid_to = ? WHERE id = ? AND valid_to IS NULL',
        params: [now, existing.current_revision_id],
      });
    }

    operations.push({
      kind: 'run',
      sql: `INSERT INTO memory_revisions(
        id, memory_id, revision_no, value_text, value_json, value_hash, source_event_id,
        valid_from, valid_to, supersedes_revision_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      params: [
        revisionId,
        memoryId,
        revisionNo,
        normalized.valueText,
        normalized.valueJson ?? null,
        normalized.valueHash,
        eventId,
        now,
        existing?.current_revision_id ?? null,
        now,
      ],
    });
    operations.push({
      kind: 'run',
      sql: `UPDATE memory_items
               SET current_revision_id = ?, state = 'active', importance = ?, pinned = ?, enforcement = ?,
                   updated_at = ?, last_accessed_at = ?
             WHERE id = ? AND principal_id = ?`,
      params: [
        revisionId,
        request.importance ?? existing?.importance ?? 0.5,
        request.pinned === undefined ? (existing?.pinned ?? 0) : (request.pinned ? 1 : 0),
        request.enforcement ?? existing?.enforcement ?? 'none',
        now,
        now,
        memoryId,
        request.scope.principalId,
      ],
    });
    operations.push({ kind: 'run', sql: 'DELETE FROM memory_anchors WHERE memory_id = ?', params: [memoryId] });

    const anchorMap = new Map<string, { type: string; value: string }>();
    const addAnchor = (type: string, value: string): void => {
      if (anchorMap.size >= 128) return;
      anchorMap.set(`${type}\0${value}`, { type, value });
    };
    addAnchor('canonical_key', canonicalKey);
    for (const anchor of extractMemoryAnchors(`${canonicalKey} ${normalized.valueText}`)) {
      addAnchor(anchor.type, anchor.value);
    }
    for (const anchor of validatedExplicitAnchors(request)) {
      addAnchor(anchor.type, anchor.value);
    }
    for (const anchor of anchorMap.values()) {
      operations.push({
        kind: 'run',
        sql: 'INSERT OR IGNORE INTO memory_anchors(memory_id, anchor, anchor_type, created_at) VALUES (?, ?, ?, ?)',
        params: [memoryId, anchor.value, anchor.type, now],
      });
    }

    for (const relation of request.explicitRelations ?? []) {
      const weight = relation.weight ?? RELATION_WEIGHTS[relation.relation];
      if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
        throw new MemoryStoreError('MEMORY_RELATION_WEIGHT_INVALID', 'explicit relation weight must be between 0 and 1');
      }
      explicitEdgeOperationIndexes.push(operations.length);
      operations.push(...auditedEdgeInsertOperations({
        eventId: randomUUID(),
        scope: request.scope,
        fromMemoryId: memoryId,
        toMemoryId: relation.targetMemoryId,
        relation: relation.relation,
        weight,
        evidenceEventId: eventId,
        reasonCode: 'EXPLICIT_MEMORY_RELATION',
        createdAt: now,
      }));
      if (shouldMirrorMemoryRelation(relation.relation)) {
        explicitEdgeOperationIndexes.push(operations.length);
        operations.push(...auditedEdgeInsertOperations({
          eventId: randomUUID(),
          scope: request.scope,
          fromMemoryId: relation.targetMemoryId,
          toMemoryId: memoryId,
          relation: relation.relation,
          weight,
          evidenceEventId: eventId,
          reasonCode: 'EXPLICIT_MEMORY_RELATION_MIRROR',
          createdAt: now,
        }));
      }
    }

    operations.push({ kind: 'exec', sql: MEMORY_FTS_REBUILD_SQL });
    const results = await this.client.transaction(operations);
    const createdExplicitEdges = explicitEdgeOperationIndexes.reduce((total, index) => {
      const result = results[index];
      return total + (result && typeof result === 'object' && 'changes' in result
        ? Number((result as { changes: number }).changes)
        : 0);
    }, 0);

    return {
      memoryId,
      revisionId,
      eventId,
      revisionNo,
      deduplicated: false,
      state: 'active',
      createdExplicitEdges,
    };
  }

  private async findByCanonicalKey(scope: MemoryScope, canonicalKey: string): Promise<ExistingMemoryRow | null> {
    const rows = await this.client.query<ExistingMemoryRow>(
      `SELECT item.id, item.canonical_key, item.kind, item.state, item.importance, item.pinned,
              item.enforcement, item.current_revision_id, item.created_at, item.updated_at,
              revision.revision_no, revision.value_hash
         FROM memory_items AS item
         JOIN memory_revisions AS revision ON revision.id = item.current_revision_id
        WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ? AND item.canonical_key = ?
        LIMIT 1`,
      [scope.principalId, scopeProject(scope), canonicalKey],
    );
    return rows[0] ?? null;
  }

  private async findById(scope: MemoryScope, memoryId: string): Promise<ExistingMemoryRow | null> {
    const rows = await this.client.query<ExistingMemoryRow>(
      `SELECT item.id, item.canonical_key, item.kind, item.state, item.importance, item.pinned,
              item.enforcement, item.current_revision_id, item.created_at, item.updated_at,
              revision.revision_no, revision.value_hash
         FROM memory_items AS item
         JOIN memory_revisions AS revision ON revision.id = item.current_revision_id
        WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ? AND item.id = ?
        LIMIT 1`,
      [scope.principalId, scopeProject(scope), memoryId],
    );
    return rows[0] ?? null;
  }

  private assertReady(): void {
    if (!this.opened || this.closed) throw new MemoryStoreError('MEMORY_STORE_NOT_OPEN', 'Memory store is not open');
  }
}

function mapStoredMemory(row: Record<string, unknown>): StoredMemoryRecord {
  return {
    memoryId: String(row.memory_id),
    revisionId: String(row.revision_id),
    revisionNo: Number(row.revision_no),
    principalId: String(row.principal_id),
    projectId: row.project_id == null ? undefined : String(row.project_id),
    canonicalKey: String(row.canonical_key),
    kind: String(row.kind) as MemoryKind,
    state: String(row.state) as MemoryState,
    importance: Number(row.importance),
    pinned: Number(row.pinned) === 1,
    enforcement: String(row.enforcement) as MemoryEnforcement,
    valueText: String(row.value_text),
    valueJson: row.value_json == null ? undefined : String(row.value_json),
    valueHash: String(row.value_hash),
    sourceEventId: row.source_event_id == null ? undefined : String(row.source_event_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapRevision(row: Record<string, unknown>): StoredMemoryRevision {
  return {
    revisionId: String(row.revision_id),
    memoryId: String(row.memory_id),
    revisionNo: Number(row.revision_no),
    valueText: String(row.value_text),
    valueJson: row.value_json == null ? undefined : String(row.value_json),
    valueHash: String(row.value_hash),
    sourceEventId: row.source_event_id == null ? undefined : String(row.source_event_id),
    validFrom: Number(row.valid_from),
    validTo: row.valid_to == null ? undefined : Number(row.valid_to),
    supersedesRevisionId: row.supersedes_revision_id == null ? undefined : String(row.supersedes_revision_id),
    createdAt: Number(row.created_at),
  };
}
