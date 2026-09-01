import { createHash } from 'node:crypto';
import path from 'node:path';
import type { MemoryConfig } from '../config.js';
import type { ContinuitySnapshotBuilder } from '../continuity/snapshot.js';
import { redactMemoryText } from './redaction.js';
import type { MemoryKind, MemoryRelation, MemoryScope, MemoryState } from './types.js';
import type { MemoryWorkerClient } from './worker-client.js';

export interface MemoryObservatoryProjectionRequest {
  scope: MemoryScope;
  maxNodes: number;
  maxEdges: number;
}

export interface MemoryObservatoryNode {
  memoryId: string;
  title: string;
  canonicalKey: string;
  kind: MemoryKind;
  state: MemoryState;
  revisionNo: number;
  valuePreview: string;
  importance: number;
  pinned: boolean;
  rootReason?: string;
  branchParentMemoryId?: string;
  createdFromDecisionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryObservatoryEdge {
  edgeId: string;
  fromMemoryId: string;
  toMemoryId: string;
  relation: MemoryRelation;
  weight: number;
  evidenceEventId?: string;
}

export interface MemoryObservatoryConflict {
  conflictId: string;
  leftMemoryId: string;
  rightMemoryId: string;
  conflictType: string;
  status: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface MemoryObservatoryContinuitySummary {
  currentObjective?: string;
  active: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  completed: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  blocked: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  deferred: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  unfinished: Array<{ taskId: string; title: string; status: string; updatedAt: number }>;
  frontier: Array<{ frontierId: string; title: string; status: string; updatedAt: number }>;
  interruptedTurnIds: string[];
}

export interface MemoryObservatorySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  auditSequence: number;
  project: { projectId: string; workspaceLabel: string };
  status: {
    memoryHealthy: boolean;
    lifecycleMode: 'disabled' | 'advisory' | 'enforce';
    remoteEnabled: boolean;
    remoteDurabilityState: string;
    hydrationState?: string;
    generationId?: string;
    logicalStateHash?: string;
  };
  nodes: MemoryObservatoryNode[];
  edges: MemoryObservatoryEdge[];
  conflicts: MemoryObservatoryConflict[];
  continuity: MemoryObservatoryContinuitySummary;
  truncated: { nodes: boolean; edges: boolean };
}

export interface MemoryObservatoryNodeDetail extends MemoryObservatoryNode {
  revisions: Array<{ revisionId: string; revisionNo: number; valuePreview: string; validFrom: number; validTo?: number }>;
  edges: MemoryObservatoryEdge[];
  conflicts: MemoryObservatoryConflict[];
}

type NodeRow = {
  memory_id: string;
  canonical_key: string;
  kind: string;
  state: string;
  importance: number;
  pinned: number;
  created_at: number;
  updated_at: number;
  revision_no: number;
  value_text: string;
  title: string | null;
  root_reason: string | null;
  branch_parent_memory_id: string | null;
  created_from_decision_id: string | null;
};

type EdgeRow = {
  from_memory_id: string;
  to_memory_id: string;
  relation: string;
  weight: number;
  evidence_event_id: string | null;
};

type ConflictRow = {
  id: string;
  left_memory_id: string;
  right_memory_id: string;
  conflict_type: string;
  status: string;
  created_at: number;
  resolved_at: number | null;
};

const MAX_NODES = 1_000;
const MAX_EDGES = 5_000;
const VALUE_PREVIEW_CHARS = 320;
const TITLE_CHARS = 180;
const DETAIL_REVISION_LIMIT = 50;

function projectId(scope: MemoryScope): string {
  return scope.projectId ?? '';
}

function safeText(value: string, maxChars: number): string {
  let redacted = redactMemoryText(value).text;
  redacted = redacted
    .replace(/\bagent_core_live_[A-Za-z0-9_-]{12,}\b/g, '[REDACTED:AGENT_CORE_KEY]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED:GITHUB_TOKEN]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED:GITHUB_TOKEN]')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, '[REDACTED:API_KEY]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim();
  return redacted.length <= maxChars ? redacted : `${redacted.slice(0, Math.max(0, maxChars - 1))}…`;
}

function safeNode(row: NodeRow): MemoryObservatoryNode {
  return {
    memoryId: row.memory_id,
    title: safeText(row.title || row.canonical_key, TITLE_CHARS),
    canonicalKey: safeText(row.canonical_key, TITLE_CHARS),
    kind: row.kind as MemoryKind,
    state: row.state as MemoryState,
    revisionNo: Number(row.revision_no),
    valuePreview: safeText(row.value_text, VALUE_PREVIEW_CHARS),
    importance: Number(row.importance),
    pinned: Number(row.pinned) === 1,
    ...(row.root_reason ? { rootReason: safeText(row.root_reason, VALUE_PREVIEW_CHARS) } : {}),
    ...(row.branch_parent_memory_id ? { branchParentMemoryId: row.branch_parent_memory_id } : {}),
    ...(row.created_from_decision_id ? { createdFromDecisionId: row.created_from_decision_id } : {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function edgeId(row: Pick<EdgeRow, 'from_memory_id' | 'to_memory_id' | 'relation'>): string {
  return createHash('sha256')
    .update(`${row.from_memory_id}\0${row.relation}\0${row.to_memory_id}`, 'utf8')
    .digest('hex');
}

function safeEdge(row: EdgeRow): MemoryObservatoryEdge {
  return {
    edgeId: edgeId(row),
    fromMemoryId: row.from_memory_id,
    toMemoryId: row.to_memory_id,
    relation: row.relation as MemoryRelation,
    weight: Number(row.weight),
    ...(row.evidence_event_id ? { evidenceEventId: row.evidence_event_id } : {}),
  };
}

function safeConflict(row: ConflictRow): MemoryObservatoryConflict {
  return {
    conflictId: row.id,
    leftMemoryId: row.left_memory_id,
    rightMemoryId: row.right_memory_id,
    conflictType: safeText(row.conflict_type, TITLE_CHARS),
    status: safeText(row.status, 64),
    createdAt: Number(row.created_at),
    ...(row.resolved_at == null ? {} : { resolvedAt: Number(row.resolved_at) }),
  };
}

function validateBounds(maxNodes: number, maxEdges: number): void {
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_NODES) throw new Error('MEMORY_OBSERVATORY_MAX_NODES_INVALID');
  if (!Number.isSafeInteger(maxEdges) || maxEdges < 1 || maxEdges > MAX_EDGES) throw new Error('MEMORY_OBSERVATORY_MAX_EDGES_INVALID');
}

export class MemoryObservatoryProjection {
  constructor(
    private readonly client: MemoryWorkerClient,
    private readonly config: MemoryConfig,
    private readonly continuity: ContinuitySnapshotBuilder,
    private readonly memoryHealthy: () => boolean,
  ) {}

  async snapshot(request: MemoryObservatoryProjectionRequest): Promise<MemoryObservatorySnapshot> {
    if (!request.scope.principalId?.trim()) throw new Error('MEMORY_SCOPE_REQUIRED');
    validateBounds(request.maxNodes, request.maxEdges);
    const project = projectId(request.scope);
    const rows = await this.nodeRows(request.scope, request.maxNodes + 1);
    const truncatedNodes = rows.length > request.maxNodes;
    const selectedRows = rows.slice(0, request.maxNodes);
    const nodes = selectedRows.map(safeNode);
    const nodeIds = nodes.map((node) => node.memoryId);
    const edgeRows = await this.edgeRows(request.scope, nodeIds, request.maxEdges + 1);
    const truncatedEdges = edgeRows.length > request.maxEdges;
    const edges = edgeRows.slice(0, request.maxEdges).map(safeEdge);
    const conflicts = await this.conflictRows(request.scope, nodeIds).then((items) => items.map(safeConflict));
    const [remoteRows, continuity] = await Promise.all([
      this.client.query<Record<string, unknown>>(
        `SELECT durability_state, hydration_state, remote_generation, logical_state_hash
           FROM memory_remote_state
          WHERE principal_id = ? AND project_id = ?
          LIMIT 1`,
        [request.scope.principalId, project],
      ),
      this.continuity.build(request.scope),
    ]);
    const remote = remoteRows[0];
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      auditSequence: 0,
      project: {
        projectId: project,
        workspaceLabel: project ? path.basename(project) || project : 'unscoped',
      },
      status: {
        memoryHealthy: this.memoryHealthy(),
        lifecycleMode: this.config.hardLifecycleMode,
        remoteEnabled: this.config.remote.enabled,
        remoteDurabilityState: remote ? String(remote.durability_state) : (this.config.remote.enabled ? 'UNKNOWN' : 'NOT_CONFIGURED'),
        ...(remote?.hydration_state ? { hydrationState: String(remote.hydration_state) } : {}),
        ...(remote?.remote_generation ? { generationId: String(remote.remote_generation) } : {}),
        ...(remote?.logical_state_hash ? { logicalStateHash: String(remote.logical_state_hash) } : {}),
      },
      nodes,
      edges,
      conflicts,
      continuity: this.safeContinuity(continuity),
      truncated: { nodes: truncatedNodes, edges: truncatedEdges },
    };
  }

  async node(scope: MemoryScope, memoryId: string): Promise<MemoryObservatoryNodeDetail | null> {
    if (!scope.principalId?.trim()) throw new Error('MEMORY_SCOPE_REQUIRED');
    if (!memoryId?.trim()) throw new Error('MEMORY_ID_REQUIRED');
    const rows = await this.nodeRows(scope, 1, memoryId);
    const row = rows[0];
    if (!row) return null;
    const [revisionRows, edgeRows, conflictRows] = await Promise.all([
      this.client.query<Record<string, unknown>>(
        `SELECT revision.id, revision.revision_no, revision.value_text, revision.valid_from, revision.valid_to
           FROM memory_revisions AS revision
           JOIN memory_items AS item ON item.id = revision.memory_id
          WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ? AND item.id = ?
          ORDER BY revision.revision_no DESC
          LIMIT ?`,
        [scope.principalId, projectId(scope), memoryId, DETAIL_REVISION_LIMIT],
      ),
      this.edgeRows(scope, [memoryId], MAX_EDGES, true),
      this.conflictRows(scope, [memoryId], true),
    ]);
    return {
      ...safeNode(row),
      revisions: revisionRows.map((revision) => ({
        revisionId: String(revision.id),
        revisionNo: Number(revision.revision_no),
        valuePreview: safeText(String(revision.value_text), VALUE_PREVIEW_CHARS),
        validFrom: Number(revision.valid_from),
        ...(revision.valid_to == null ? {} : { validTo: Number(revision.valid_to) }),
      })),
      edges: edgeRows.map(safeEdge),
      conflicts: conflictRows.map(safeConflict),
    };
  }

  private nodeRows(scope: MemoryScope, limit: number, memoryId?: string): Promise<NodeRow[]> {
    return this.client.query<NodeRow>(
      `SELECT item.id AS memory_id, item.canonical_key, item.kind, item.state, item.importance, item.pinned,
              item.created_at, item.updated_at, revision.revision_no, revision.value_text,
              metadata.title, metadata.root_reason, metadata.branch_parent_memory_id, metadata.created_from_decision_id
         FROM memory_items AS item
         JOIN memory_revisions AS revision ON revision.id = item.current_revision_id
         LEFT JOIN memory_node_metadata AS metadata ON metadata.memory_id = item.id
        WHERE item.principal_id = ? AND IFNULL(item.project_id, '') = ?
          AND item.state <> 'tombstoned'
          ${memoryId ? 'AND item.id = ?' : ''}
        ORDER BY item.updated_at DESC, item.id COLLATE BINARY ASC
        LIMIT ?`,
      memoryId
        ? [scope.principalId, projectId(scope), memoryId, limit]
        : [scope.principalId, projectId(scope), limit],
    );
  }

  private async edgeRows(scope: MemoryScope, nodeIds: string[], limit: number, includeTouching = false): Promise<EdgeRow[]> {
    if (nodeIds.length === 0) return [];
    const placeholders = nodeIds.map(() => '?').join(',');
    const edgePredicate = includeTouching
      ? `(edge.from_memory_id IN (${placeholders}) OR edge.to_memory_id IN (${placeholders}))`
      : `edge.from_memory_id IN (${placeholders}) AND edge.to_memory_id IN (${placeholders})`;
    const idParams = includeTouching ? [...nodeIds, ...nodeIds] : [...nodeIds, ...nodeIds];
    return this.client.query<EdgeRow>(
      `SELECT edge.from_memory_id, edge.to_memory_id, edge.relation,
              MAX(edge.weight) AS weight, MIN(edge.evidence_event_id) AS evidence_event_id
         FROM memory_edges AS edge
         JOIN memory_items AS source ON source.id = edge.from_memory_id
         JOIN memory_items AS target ON target.id = edge.to_memory_id
        WHERE source.principal_id = ? AND IFNULL(source.project_id, '') = ? AND source.state <> 'tombstoned'
          AND target.principal_id = ? AND IFNULL(target.project_id, '') = ? AND target.state <> 'tombstoned'
          AND ${edgePredicate}
        GROUP BY edge.from_memory_id, edge.to_memory_id, edge.relation
        ORDER BY edge.from_memory_id COLLATE BINARY ASC, edge.relation COLLATE BINARY ASC, edge.to_memory_id COLLATE BINARY ASC
        LIMIT ?`,
      [scope.principalId, projectId(scope), scope.principalId, projectId(scope), ...idParams, limit],
    );
  }

  private async conflictRows(scope: MemoryScope, nodeIds: string[], includeTouching = false): Promise<ConflictRow[]> {
    if (nodeIds.length === 0) return [];
    const placeholders = nodeIds.map(() => '?').join(',');
    const predicate = includeTouching
      ? `(conflict.left_memory_id IN (${placeholders}) OR conflict.right_memory_id IN (${placeholders}))`
      : `conflict.left_memory_id IN (${placeholders}) AND conflict.right_memory_id IN (${placeholders})`;
    const idParams = [...nodeIds, ...nodeIds];
    return this.client.query<ConflictRow>(
      `SELECT conflict.id, conflict.left_memory_id, conflict.right_memory_id,
              conflict.conflict_type, conflict.status, conflict.created_at, conflict.resolved_at
         FROM memory_conflicts AS conflict
         JOIN memory_items AS left_item ON left_item.id = conflict.left_memory_id
         JOIN memory_items AS right_item ON right_item.id = conflict.right_memory_id
        WHERE left_item.principal_id = ? AND IFNULL(left_item.project_id, '') = ?
          AND right_item.principal_id = ? AND IFNULL(right_item.project_id, '') = ?
          AND ${predicate}
        ORDER BY conflict.created_at DESC, conflict.id COLLATE BINARY ASC`,
      [scope.principalId, projectId(scope), scope.principalId, projectId(scope), ...idParams],
    );
  }

  private safeContinuity(snapshot: Awaited<ReturnType<ContinuitySnapshotBuilder['build']>>): MemoryObservatoryContinuitySummary {
    const task = (item: { taskId: string; title: string; status: string; updatedAt: number }) => ({
      taskId: item.taskId,
      title: safeText(item.title, TITLE_CHARS),
      status: item.status,
      updatedAt: item.updatedAt,
    });
    return {
      ...(snapshot.currentObjective ? { currentObjective: safeText(snapshot.currentObjective, VALUE_PREVIEW_CHARS) } : {}),
      active: snapshot.activeTasks.map(task),
      completed: snapshot.recentCompleted.map(task),
      blocked: snapshot.blockedTasks.map(task),
      deferred: snapshot.deferredTasks.map(task),
      unfinished: snapshot.unfinishedPlans.map(task),
      frontier: snapshot.frontier.map((item) => ({
        frontierId: item.frontierId,
        title: safeText(item.title, TITLE_CHARS),
        status: item.status,
        updatedAt: item.updatedAt,
      })),
      interruptedTurnIds: snapshot.interruptedTurns.map((turn) => turn.turnId),
    };
  }
}
