import { createHash } from 'node:crypto';
import type { MemoryWorkerSqlOperation } from './db-worker.js';
import type { MemoryScope } from './types.js';
import type { MemoryWorkerClient } from './worker-client.js';

export const MEMORY_POSTFLIGHT_STATES = ['OPEN', 'POSTFLIGHT_PENDING', 'CLOSED'] as const;
export type MemoryPostflightState = (typeof MEMORY_POSTFLIGHT_STATES)[number];

export interface MemoryContextLifecycleRecord {
  contextId: string;
  principalId: string;
  projectId: string;
  routeContextId: string;
  continuityTaskId?: string;
  objectiveHash: string;
  postflightState: MemoryPostflightState;
  meaningfulWorkCount: number;
  firstMeaningfulAt?: number;
  lastMeaningfulAt?: number;
  lastToolName?: string;
  lastReasonCode?: string;
  postflightAppliedAt?: number;
  closedAt?: number;
  localDurableGeneration?: string;
  localDurableHash?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export class MemoryHardLifecycleError extends Error {
  constructor(
    readonly code: 'MEMORY_PREFLIGHT_REQUIRED' | 'MEMORY_POSTFLIGHT_REQUIRED' | 'MEMORY_LIFECYCLE_CONFLICT',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MemoryHardLifecycleError';
  }
}

function normalizedObjectiveText(task: string, context?: string): string {
  return [task, context]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' '))
    .join('\n');
}

export function memoryObjectiveHash(task: string, context?: string): string {
  const normalized = normalizedObjectiveText(task, context);
  if (!normalized) throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Memory preflight objective is required');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function scopeProject(scope: MemoryScope): string {
  return scope.projectId ?? '';
}

function optionalText(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function optionalNumber(value: unknown): number | undefined {
  return value == null ? undefined : Number(value);
}

function mapRecord(row: Record<string, unknown>): MemoryContextLifecycleRecord {
  return {
    contextId: String(row.context_id),
    principalId: String(row.principal_id),
    projectId: String(row.project_id ?? ''),
    routeContextId: String(row.route_context_id),
    ...(row.continuity_task_id == null ? {} : { continuityTaskId: String(row.continuity_task_id) }),
    objectiveHash: String(row.objective_hash),
    postflightState: String(row.postflight_state) as MemoryPostflightState,
    meaningfulWorkCount: Number(row.meaningful_work_count),
    ...(row.first_meaningful_at == null ? {} : { firstMeaningfulAt: Number(row.first_meaningful_at) }),
    ...(row.last_meaningful_at == null ? {} : { lastMeaningfulAt: Number(row.last_meaningful_at) }),
    ...(row.last_tool_name == null ? {} : { lastToolName: String(row.last_tool_name) }),
    ...(row.last_reason_code == null ? {} : { lastReasonCode: String(row.last_reason_code) }),
    ...(row.postflight_applied_at == null ? {} : { postflightAppliedAt: Number(row.postflight_applied_at) }),
    ...(row.closed_at == null ? {} : { closedAt: Number(row.closed_at) }),
    ...(row.local_durable_generation == null ? {} : { localDurableGeneration: String(row.local_durable_generation) }),
    ...(row.local_durable_hash == null ? {} : { localDurableHash: String(row.local_durable_hash) }),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    expiresAt: Number(row.expires_at),
  };
}

const SELECT_COLUMNS = `context_id, principal_id, project_id, route_context_id, continuity_task_id,
  objective_hash, postflight_state, meaningful_work_count, first_meaningful_at, last_meaningful_at,
  last_tool_name, last_reason_code, postflight_applied_at, closed_at, local_durable_generation,
  local_durable_hash, created_at, updated_at, expires_at`;

export function lifecycleOpenOperation(input: {
  scope: MemoryScope;
  contextId: string;
  routeContextId: string;
  task: string;
  context?: string;
  expiresAt: number;
  now: number;
}): MemoryWorkerSqlOperation {
  return {
    kind: 'run',
    sql: `INSERT INTO memory_context_lifecycle(
      context_id, principal_id, project_id, route_context_id, objective_hash, postflight_state,
      meaningful_work_count, created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, 'OPEN', 0, ?, ?, ?)`,
    params: [
      input.contextId,
      input.scope.principalId,
      scopeProject(input.scope),
      input.routeContextId,
      memoryObjectiveHash(input.task, input.context),
      input.now,
      input.now,
      input.expiresAt,
    ],
  };
}

export class MemoryHardLifecycle {
  constructor(readonly client: MemoryWorkerClient) {}

  async get(scope: MemoryScope, contextId: string): Promise<MemoryContextLifecycleRecord | null> {
    if (!scope.principalId?.trim() || !contextId?.trim()) return null;
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT ${SELECT_COLUMNS}
         FROM memory_context_lifecycle
        WHERE context_id = ? AND principal_id = ? AND project_id = ?
        LIMIT 1`,
      [contextId, scope.principalId, scopeProject(scope)],
    );
    return rows[0] ? mapRecord(rows[0]) : null;
  }

  async bindContinuityTask(scope: MemoryScope, contextId: string, continuityTaskId: string): Promise<MemoryContextLifecycleRecord> {
    if (!continuityTaskId?.trim()) throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT', 'Continuity task id is required');
    const current = await this.get(scope, contextId);
    if (!current) throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Persisted memory preflight context was not found');
    if (current.continuityTaskId && current.continuityTaskId !== continuityTaskId) {
      throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT', 'Memory context is already bound to another continuity task');
    }
    if (!current.continuityTaskId) {
      const now = Date.now();
      await this.client.transaction([{
        kind: 'run',
        sql: `UPDATE memory_context_lifecycle
                 SET continuity_task_id = ?, updated_at = ?
               WHERE context_id = ? AND principal_id = ? AND project_id = ? AND continuity_task_id IS NULL`,
        params: [continuityTaskId, now, contextId, scope.principalId, scopeProject(scope)],
      }]);
    }
    return (await this.get(scope, contextId))!;
  }

  async validateCurrentContext(input: {
    scope: MemoryScope;
    contextId: string;
    routeContextId: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    const current = await this.get(input.scope, input.contextId);
    const now = input.now ?? Date.now();
    if (!current
      || current.routeContextId !== input.routeContextId
      || current.expiresAt <= now
      || current.postflightState === 'CLOSED') {
      throw new MemoryHardLifecycleError(
        'MEMORY_PREFLIGHT_REQUIRED',
        'A valid persisted memory preflight context is required for this actionable route',
      );
    }
    return current;
  }

  async markMeaningfulWork(input: {
    scope: MemoryScope;
    contextId: string;
    routeContextId: string;
    toolName: string;
    reasonCode: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    const current = await this.validateCurrentContext(input);
    const now = input.now ?? Date.now();
    await this.client.transaction([{
      kind: 'run',
      sql: `UPDATE memory_context_lifecycle
               SET postflight_state = 'POSTFLIGHT_PENDING',
                   meaningful_work_count = meaningful_work_count + 1,
                   first_meaningful_at = COALESCE(first_meaningful_at, ?),
                   last_meaningful_at = ?, last_tool_name = ?, last_reason_code = ?, updated_at = ?,
                   local_durable_generation = NULL, local_durable_hash = NULL
             WHERE context_id = ? AND principal_id = ? AND project_id = ?
               AND route_context_id = ? AND postflight_state IN ('OPEN','POSTFLIGHT_PENDING')`,
      params: [now, now, input.toolName.slice(0, 200), input.reasonCode.slice(0, 200), now,
        input.contextId, input.scope.principalId, scopeProject(input.scope), input.routeContextId],
    }]);
    return (await this.get(input.scope, input.contextId)) ?? current;
  }

  async findPendingForObjectiveOrTask(input: {
    scope: MemoryScope;
    objectiveHash?: string;
    continuityTaskId?: string;
    excludeContextId?: string;
    includeClosedWithoutDurability?: boolean;
  }): Promise<MemoryContextLifecycleRecord[]> {
    if (!input.objectiveHash && !input.continuityTaskId) return [];
    const params: Array<string | number> = [input.scope.principalId, scopeProject(input.scope)];
    const selectors: string[] = [];
    if (input.objectiveHash) { selectors.push('objective_hash = ?'); params.push(input.objectiveHash); }
    if (input.continuityTaskId) { selectors.push('continuity_task_id = ?'); params.push(input.continuityTaskId); }
    let exclude = '';
    if (input.excludeContextId) { exclude = 'AND context_id <> ?'; params.push(input.excludeContextId); }
    const rows = await this.client.query<Record<string, unknown>>(
      `SELECT ${SELECT_COLUMNS}
         FROM memory_context_lifecycle
        WHERE principal_id = ? AND project_id = ?
          AND (postflight_state = 'POSTFLIGHT_PENDING'
            ${input.includeClosedWithoutDurability ? "OR (postflight_state = 'CLOSED' AND local_durable_generation IS NULL AND local_durable_hash IS NULL)" : ''})
          AND (${selectors.join(' OR ')})
          ${exclude}
        ORDER BY updated_at ASC, context_id COLLATE BINARY ASC
        LIMIT 32`,
      params,
    );
    return rows.map(mapRecord);
  }

  async markClosedDurableForScope(input: {
    scope: MemoryScope;
    generationId: string;
    logicalStateHash: string;
  }): Promise<number> {
    const results = await this.client.transaction([{
      kind: 'run',
      sql: `UPDATE memory_context_lifecycle
               SET local_durable_generation = ?, local_durable_hash = ?
             WHERE principal_id = ? AND project_id = ? AND postflight_state = 'CLOSED'
               AND local_durable_generation IS NULL AND local_durable_hash IS NULL`,
      params: [input.generationId, input.logicalStateHash, input.scope.principalId, scopeProject(input.scope)],
    }]);
    return Number((results[0] as { changes?: number } | undefined)?.changes ?? 0);
  }

  async prepareClosure(input: {
    scope: MemoryScope;
    contextId: string;
    routeContextId: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    const current = await this.get(input.scope, input.contextId);
    if (!current || current.routeContextId !== input.routeContextId) {
      throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Persisted memory preflight context was not found');
    }
    if (current.postflightState === 'CLOSED') return current;
    const now = input.now ?? Date.now();
    await this.client.transaction([{
      kind: 'run',
      sql: `UPDATE memory_context_lifecycle
               SET postflight_state = 'CLOSED', postflight_applied_at = ?, closed_at = ?, updated_at = ?,
                   local_durable_generation = NULL, local_durable_hash = NULL
             WHERE context_id = ? AND principal_id = ? AND project_id = ? AND route_context_id = ?
               AND postflight_state IN ('OPEN','POSTFLIGHT_PENDING')`,
      params: [now, now, now, input.contextId, input.scope.principalId, scopeProject(input.scope), input.routeContextId],
    }]);
    return (await this.get(input.scope, input.contextId))!;
  }

  async markDurableClosure(input: {
    scope: MemoryScope;
    contextId: string;
    generationId: string;
    logicalStateHash: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    const current = await this.get(input.scope, input.contextId);
    if (!current || current.postflightState !== 'CLOSED') {
      throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED', 'Local postflight must be closed before durability can be certified');
    }
    await this.client.transaction([{
      kind: 'run',
      sql: `UPDATE memory_context_lifecycle
               SET local_durable_generation = ?, local_durable_hash = ?
             WHERE context_id = ? AND principal_id = ? AND project_id = ? AND postflight_state = 'CLOSED'`,
      params: [input.generationId, input.logicalStateHash, input.contextId, input.scope.principalId, scopeProject(input.scope)],
    }]);
    return (await this.get(input.scope, input.contextId))!;
  }
}
