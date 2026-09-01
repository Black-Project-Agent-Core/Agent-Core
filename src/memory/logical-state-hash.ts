import { createHash } from 'node:crypto';
import type { SqlPrimitive } from './db-worker.js';
import type { MemoryScope } from './types.js';
import { MemoryWorkerClient } from './worker-client.js';

export interface MemoryLogicalStateProjectionV1 {
  formatVersion: 1;
  scope: { principalId: string; projectId: string };
  events: unknown[];
  items: unknown[];
  revisions: unknown[];
  anchors: unknown[];
  edges: unknown[];
  conflicts: unknown[];
  nodeMetadata: unknown[];
  writeDecisions: unknown[];
  edgeEvents: unknown[];
  continuityTasks: unknown[];
  continuityDependencies: unknown[];
  continuityCheckpoints: unknown[];
  continuityFrontier: unknown[];
}

export interface MemoryLogicalStateProjectionV2 extends Omit<MemoryLogicalStateProjectionV1, 'formatVersion'> {
  formatVersion: 2;
  contextLifecycles: unknown[];
}

export type MemoryLogicalStateProjection = MemoryLogicalStateProjectionV1 | MemoryLogicalStateProjectionV2;

const CORE_TABLE_KEYS = [
  'events',
  'items',
  'revisions',
  'anchors',
  'edges',
  'conflicts',
  'nodeMetadata',
  'writeDecisions',
  'edgeEvents',
  'continuityTasks',
  'continuityDependencies',
  'continuityCheckpoints',
  'continuityFrontier',
] as const;

function scopeProject(scope: MemoryScope): string {
  return scope.projectId ?? '';
}

function assertScope(scope: MemoryScope): void {
  if (!scope.principalId?.trim()) throw new Error('MEMORY_LOGICAL_STATE_SCOPE_REQUIRED');
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('MEMORY_LOGICAL_STATE_NON_FINITE_NUMBER');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  throw new Error('MEMORY_LOGICAL_STATE_UNSUPPORTED_VALUE');
}

function normalizeJsonColumn(key: string, value: unknown): unknown {
  if (!key.endsWith('_json') || value === null) return value;
  if (typeof value !== 'string') throw new Error('MEMORY_LOGICAL_STATE_JSON_INVALID');
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`MEMORY_LOGICAL_STATE_JSON_INVALID:${key}`);
  }
}

function normalizeRows(rows: Array<Record<string, unknown>>): unknown[] {
  return rows
    .map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, normalizeJsonColumn(key, value)]),
    ))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}

function canonicalProjection(projection: MemoryLogicalStateProjection): Record<string, unknown> {
  if (projection.formatVersion !== 1 && projection.formatVersion !== 2) {
    throw new Error('MEMORY_LOGICAL_STATE_FORMAT_UNSUPPORTED');
  }
  if (!projection.scope?.principalId || typeof projection.scope.projectId !== 'string') {
    throw new Error('MEMORY_LOGICAL_STATE_SCOPE_REQUIRED');
  }
  const output: Record<string, unknown> = {
    formatVersion: projection.formatVersion,
    scope: {
      principalId: projection.scope.principalId,
      projectId: projection.scope.projectId,
    },
  };
  for (const key of CORE_TABLE_KEYS) {
    const rows = projection[key];
    if (!Array.isArray(rows)) throw new Error(`MEMORY_LOGICAL_STATE_TABLE_INVALID:${String(key)}`);
    output[key] = [...rows].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  }
  if (projection.formatVersion === 2) {
    if (!Array.isArray(projection.contextLifecycles)) throw new Error('MEMORY_LOGICAL_STATE_TABLE_INVALID:contextLifecycles');
    output.contextLifecycles = [...projection.contextLifecycles]
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  }
  return output;
}

export function hashMemoryLogicalState(projection: MemoryLogicalStateProjection): string {
  return createHash('sha256')
    .update(canonicalJson(canonicalProjection(projection)), 'utf8')
    .digest('hex');
}

export function serializeMemoryLogicalState(projection: MemoryLogicalStateProjection): string {
  return canonicalJson(canonicalProjection(projection));
}

async function queryRows(
  client: MemoryWorkerClient,
  sql: string,
  params: SqlPrimitive[],
): Promise<unknown[]> {
  return normalizeRows(await client.query<Record<string, unknown>>(sql, params));
}

export async function projectMemoryLogicalState(
  client: MemoryWorkerClient,
  scope: MemoryScope,
  options: { formatVersion?: 1 | 2 } = {},
): Promise<MemoryLogicalStateProjection> {
  assertScope(scope);
  const formatVersion = options.formatVersion ?? 2;
  const principal = scope.principalId;
  const project = scopeProject(scope);
  const scopeParams = [principal, project];

  const events = await queryRows(client, `
    SELECT id, principal_id, project_id, thread_id, resource_id, event_type, source_type,
           source_ref, redacted_text, metadata_json, created_at
      FROM memory_events
     WHERE principal_id = ? AND IFNULL(project_id, '') = ?`, scopeParams);

  const items = await queryRows(client, `
    SELECT id, principal_id, project_id, canonical_key, kind, state, importance, pinned,
           enforcement, current_revision_id, created_at, updated_at
      FROM memory_items
     WHERE principal_id = ? AND IFNULL(project_id, '') = ?`, scopeParams);

  const revisions = await queryRows(client, `
    SELECT revision.id, revision.memory_id, revision.revision_no, revision.value_text,
           revision.value_json, revision.value_hash, revision.source_event_id, revision.valid_from,
           revision.valid_to, revision.supersedes_revision_id, revision.created_at
      FROM memory_revisions AS revision
      JOIN memory_items AS item ON item.id = revision.memory_id
     WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ?`, scopeParams);

  const anchors = await queryRows(client, `
    SELECT anchor.memory_id, anchor.anchor, anchor.anchor_type, anchor.created_at
      FROM memory_anchors AS anchor
      JOIN memory_items AS item ON item.id = anchor.memory_id
     WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ?`, scopeParams);

  const edges = await queryRows(client, `
    SELECT edge.from_memory_id, edge.to_memory_id, edge.relation, edge.weight,
           edge.evidence_event_id, edge.created_at
      FROM memory_edges AS edge
      JOIN memory_items AS source ON source.id = edge.from_memory_id
      JOIN memory_items AS target ON target.id = edge.to_memory_id
     WHERE source.principal_id = ? AND IFNULL(source.project_id, '') = ?
       AND target.principal_id = ? AND IFNULL(target.project_id, '') = ?`, [principal, project, principal, project]);

  const conflicts = await queryRows(client, `
    SELECT conflict.id, conflict.left_memory_id, conflict.right_memory_id, conflict.conflict_type,
           conflict.status, conflict.evidence_json, conflict.created_at, conflict.resolved_at
      FROM memory_conflicts AS conflict
      JOIN memory_items AS left_item ON left_item.id = conflict.left_memory_id
      JOIN memory_items AS right_item ON right_item.id = conflict.right_memory_id
     WHERE left_item.principal_id = ? AND IFNULL(left_item.project_id, '') = ?
       AND right_item.principal_id = ? AND IFNULL(right_item.project_id, '') = ?`, [principal, project, principal, project]);

  const nodeMetadata = await queryRows(client, `
    SELECT metadata.memory_id, metadata.title, metadata.root_reason, metadata.novelty_class,
           metadata.created_from_decision_id, metadata.branch_parent_memory_id,
           metadata.semantic_profile_json, metadata.semantic_profile_hash, metadata.updated_at
      FROM memory_node_metadata AS metadata
      JOIN memory_items AS item ON item.id = metadata.memory_id
     WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ?`, scopeParams);

  const writeDecisions = await queryRows(client, `
    SELECT id, principal_id, project_id, route_context_id, continuity_task_id, context_id,
           decision_type, candidate_canonical_key, candidate_hash, target_memory_id,
           existing_memory_ids_json, reason_codes_json, evidence_refs_json, relation_plan_json,
           root_reason, created_at, applied_at, apply_result_json
      FROM memory_write_decisions
     WHERE principal_id = ? AND IFNULL(project_id, '') = ?`, scopeParams);

  const edgeEvents = await queryRows(client, `
    SELECT id, principal_id, project_id, event_type, from_memory_id, to_memory_id, relation,
           old_weight, new_weight, evidence_event_id, reason_code, created_at
      FROM memory_edge_events
     WHERE principal_id = ? AND IFNULL(project_id, '') = ?`, scopeParams);

  const continuityTasks = await queryRows(client, `
    SELECT id, principal_id, project_id, parent_task_id, title, objective, acceptance_json,
           constraints_json, status, priority, blocker_json, last_checkpoint_id,
           created_at, updated_at, completed_at
      FROM continuity_tasks
     WHERE principal_id = ? AND IFNULL(project_id, '') = ?`, scopeParams);

  const continuityDependencies = await queryRows(client, `
    SELECT dependency.task_id, dependency.depends_on_task_id, dependency.dependency_type,
           dependency.created_at
      FROM continuity_task_dependencies AS dependency
      JOIN continuity_tasks AS task ON task.id = dependency.task_id
      JOIN continuity_tasks AS required ON required.id = dependency.depends_on_task_id
     WHERE task.principal_id = ? AND IFNULL(task.project_id, '') = ?
       AND required.principal_id = ? AND IFNULL(required.project_id, '') = ?`, [principal, project, principal, project]);

  const continuityCheckpoints = await queryRows(client, `
    SELECT id, principal_id, project_id, task_id, route_context_id, phase,
           summary_json, evidence_json, state_hash, created_at
      FROM continuity_checkpoints
     WHERE principal_id = ? AND IFNULL(project_id, '') = ?`, scopeParams);

  const continuityFrontier = await queryRows(client, `
    SELECT id, principal_id, project_id, source_task_id, title, rationale, status,
           dependency_task_ids_json, priority, created_at, updated_at
      FROM continuity_frontier
     WHERE principal_id = ? AND IFNULL(project_id, '') = ?`, scopeParams);

  if (formatVersion === 1) {
    return {
      formatVersion: 1,
      scope: { principalId: principal, projectId: project },
      events, items, revisions, anchors, edges, conflicts, nodeMetadata, writeDecisions, edgeEvents,
      continuityTasks, continuityDependencies, continuityCheckpoints, continuityFrontier,
    };
  }

  const contextLifecycles = await queryRows(client, `
    SELECT context_id, principal_id, project_id, route_context_id, continuity_task_id, objective_hash,
           postflight_state, meaningful_work_count, first_meaningful_at, last_meaningful_at,
           last_tool_name, last_reason_code, postflight_applied_at, closed_at, created_at, updated_at, expires_at
      FROM memory_context_lifecycle
     WHERE principal_id = ? AND project_id = ?`, scopeParams);

  return {
    formatVersion: 2,
    scope: { principalId: principal, projectId: project },
    events,
    items,
    revisions,
    anchors,
    edges,
    conflicts,
    nodeMetadata,
    writeDecisions,
    edgeEvents,
    continuityTasks,
    continuityDependencies,
    continuityCheckpoints,
    continuityFrontier,
    contextLifecycles,
  };
}
