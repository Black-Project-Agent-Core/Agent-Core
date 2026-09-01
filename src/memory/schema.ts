import type { DatabaseSync } from 'node:sqlite';

export const MEMORY_SCHEMA_VERSION = 4;
export const INITIAL_MEMORY_MIGRATION = '001_initial_memory';
export const CONTINUITY_MEMORY_MIGRATION = '002_continuity_ledger';
export const MEMORY_COGNITION_MIGRATION = '003_memory_cognition_ledgers';
export const HARD_MEMORY_LIFECYCLE_MIGRATION = '004_hard_memory_lifecycle';

export const MEMORY_SCHEMA_V1_SQL = `
CREATE TABLE IF NOT EXISTS memory_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  thread_id TEXT,
  resource_id TEXT,
  event_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  raw_text TEXT,
  redacted_text TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  canonical_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  enforcement TEXT NOT NULL DEFAULT 'none' CHECK (enforcement IN ('none', 'soft', 'hard')),
  current_revision_id TEXT REFERENCES memory_revisions(id) DEFERRABLE INITIALLY DEFERRED,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0 CHECK (access_count >= 0)
);

CREATE TABLE IF NOT EXISTS memory_revisions (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  value_text TEXT NOT NULL,
  value_json TEXT,
  value_hash TEXT NOT NULL,
  source_event_id TEXT REFERENCES memory_events(id),
  valid_from INTEGER NOT NULL,
  valid_to INTEGER,
  supersedes_revision_id TEXT REFERENCES memory_revisions(id),
  created_at INTEGER NOT NULL,
  UNIQUE(memory_id, revision_no)
);

CREATE TABLE IF NOT EXISTS memory_anchors (
  memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  anchor TEXT NOT NULL,
  anchor_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(memory_id, anchor, anchor_type)
);

CREATE TABLE IF NOT EXISTS memory_edges (
  from_memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  to_memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight REAL NOT NULL CHECK (weight >= 0 AND weight <= 1),
  evidence_event_id TEXT REFERENCES memory_events(id),
  created_at INTEGER NOT NULL,
  CHECK (from_memory_id <> to_memory_id)
);

CREATE TABLE IF NOT EXISTS memory_conflicts (
  id TEXT PRIMARY KEY,
  left_memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  right_memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  conflict_type TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE IF NOT EXISTS memory_contexts (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  route_context_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  blocking_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_access_log (
  memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  context_id TEXT NOT NULL REFERENCES memory_contexts(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  score REAL NOT NULL,
  reason_json TEXT NOT NULL,
  accessed_at INTEGER NOT NULL,
  PRIMARY KEY(memory_id, context_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_items_scope_key
  ON memory_items(principal_id, IFNULL(project_id, ''), canonical_key);
CREATE INDEX IF NOT EXISTS idx_memory_items_scope_state
  ON memory_items(principal_id, project_id, state, kind);
CREATE INDEX IF NOT EXISTS idx_memory_revisions_memory_valid
  ON memory_revisions(memory_id, valid_to, revision_no DESC);
CREATE INDEX IF NOT EXISTS idx_memory_events_scope_created
  ON memory_events(principal_id, project_id, thread_id, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_anchors_anchor
  ON memory_anchors(anchor, anchor_type, memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_from
  ON memory_edges(from_memory_id, weight DESC, to_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to
  ON memory_edges(to_memory_id, weight DESC, from_memory_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_edges_identity
  ON memory_edges(from_memory_id, to_memory_id, relation, IFNULL(evidence_event_id, ''));
CREATE INDEX IF NOT EXISTS idx_memory_contexts_route
  ON memory_contexts(principal_id, route_context_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_access_recent
  ON memory_access_log(memory_id, accessed_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_memory_events_append_only_update
BEFORE UPDATE ON memory_events
BEGIN
  SELECT RAISE(ABORT, 'memory_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_memory_events_append_only_delete
BEFORE DELETE ON memory_events
BEGIN
  SELECT RAISE(ABORT, 'memory_events is append-only');
END;

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  memory_id UNINDEXED,
  principal_id UNINDEXED,
  project_id UNINDEXED,
  canonical_key,
  anchors,
  value_text,
  state UNINDEXED,
  kind UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
`;

export const CONTINUITY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS continuity_tasks (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  parent_task_id TEXT REFERENCES continuity_tasks(id),
  title TEXT NOT NULL,
  objective TEXT,
  acceptance_json TEXT NOT NULL DEFAULT '[]',
  constraints_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN (
    'planned', 'ready', 'running', 'blocked', 'deferred',
    'completed', 'failed', 'cancelled', 'interrupted'
  )),
  priority REAL NOT NULL DEFAULT 0,
  blocker_json TEXT NOT NULL DEFAULT '[]',
  last_checkpoint_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS continuity_turns (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  route_context_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES continuity_tasks(id) ON DELETE CASCADE,
  input_text TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  context_text TEXT,
  state TEXT NOT NULL CHECK (state IN ('open', 'closed', 'interrupted')),
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS continuity_task_dependencies (
  task_id TEXT NOT NULL REFERENCES continuity_tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES continuity_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(task_id, depends_on_task_id, dependency_type),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS continuity_checkpoints (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT NOT NULL REFERENCES continuity_tasks(id) ON DELETE CASCADE,
  route_context_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  state_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS continuity_frontier (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  source_task_id TEXT NOT NULL REFERENCES continuity_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'approved', 'deferred', 'dismissed', 'completed')),
  dependency_task_ids_json TEXT NOT NULL DEFAULT '[]',
  priority REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_continuity_tasks_scope_status
  ON continuity_tasks(principal_id, project_id, status, priority DESC, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_continuity_tasks_parent
  ON continuity_tasks(parent_task_id, updated_at DESC, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_continuity_turns_scope_route
  ON continuity_turns(principal_id, IFNULL(project_id, ''), route_context_id);
CREATE INDEX IF NOT EXISTS idx_continuity_turns_scope_state
  ON continuity_turns(principal_id, project_id, state, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_continuity_task_dependencies_depends
  ON continuity_task_dependencies(depends_on_task_id, task_id);
CREATE INDEX IF NOT EXISTS idx_continuity_checkpoints_task_created
  ON continuity_checkpoints(principal_id, project_id, task_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_continuity_checkpoints_route
  ON continuity_checkpoints(principal_id, route_context_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_continuity_frontier_scope_status
  ON continuity_frontier(principal_id, project_id, status, priority DESC, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_continuity_frontier_source_task
  ON continuity_frontier(source_task_id, status, priority DESC, id);
`;

export const MEMORY_COGNITION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memory_write_decisions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  route_context_id TEXT NOT NULL,
  continuity_task_id TEXT,
  context_id TEXT,
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'NO_DURABLE_MEMORY','REVISE_EXISTING','LINK_EXISTING',
    'WRITE_BRANCH','WRITE_NEW_ROOT','OPEN_CONFLICT'
  )),
  candidate_canonical_key TEXT,
  candidate_hash TEXT NOT NULL,
  target_memory_id TEXT,
  existing_memory_ids_json TEXT NOT NULL DEFAULT '[]',
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  relation_plan_json TEXT NOT NULL DEFAULT '[]',
  root_reason TEXT,
  created_at INTEGER NOT NULL,
  applied_at INTEGER,
  apply_result_json TEXT
);

CREATE TABLE IF NOT EXISTS memory_recall_expansions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  context_id TEXT NOT NULL,
  source_memory_id TEXT NOT NULL,
  target_memory_id TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 1),
  relation_path_json TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  score REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_edge_events (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('edge.created','edge.reweighted','edge.retracted')),
  from_memory_id TEXT NOT NULL,
  to_memory_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  old_weight REAL,
  new_weight REAL,
  evidence_event_id TEXT,
  reason_code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (from_memory_id <> to_memory_id)
);

CREATE TABLE IF NOT EXISTS memory_node_metadata (
  memory_id TEXT PRIMARY KEY REFERENCES memory_items(id) ON DELETE CASCADE,
  title TEXT,
  root_reason TEXT,
  novelty_class TEXT,
  created_from_decision_id TEXT,
  branch_parent_memory_id TEXT REFERENCES memory_items(id),
  semantic_profile_json TEXT,
  semantic_profile_hash TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_remote_state (
  principal_id TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  durability_state TEXT NOT NULL CHECK (durability_state IN (
    'LOCAL_COMMITTED','REMOTE_PENDING','REMOTE_SYNCED','REMOTE_CONFLICT','REMOTE_UNAVAILABLE'
  )),
  hydration_state TEXT CHECK (hydration_state IS NULL OR hydration_state IN (
    'REMOTE_EMPTY_CONFIRMED','REMOTE_HYDRATED','REMOTE_UNAVAILABLE','REMOTE_AUTH_FAILED',
    'REMOTE_DECRYPT_FAILED','REMOTE_INTEGRITY_FAILED','REMOTE_REPLAY_FAILED'
  )),
  remote_generation TEXT,
  remote_head TEXT,
  logical_state_hash TEXT,
  last_error_code TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(principal_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_write_decisions_scope_created
  ON memory_write_decisions(principal_id, IFNULL(project_id, ''), created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_memory_recall_expansions_scope_context
  ON memory_recall_expansions(principal_id, IFNULL(project_id, ''), context_id, created_at ASC, id);
CREATE INDEX IF NOT EXISTS idx_memory_edge_events_scope_created
  ON memory_edge_events(principal_id, IFNULL(project_id, ''), created_at ASC, id);
CREATE INDEX IF NOT EXISTS idx_memory_edge_events_from
  ON memory_edge_events(from_memory_id, created_at ASC, id);

CREATE TRIGGER IF NOT EXISTS trg_memory_edge_events_append_only_update
BEFORE UPDATE ON memory_edge_events
BEGIN
  SELECT RAISE(ABORT, 'memory_edge_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_memory_edge_events_append_only_delete
BEFORE DELETE ON memory_edge_events
BEGIN
  SELECT RAISE(ABORT, 'memory_edge_events is append-only');
END;
`;



export const HARD_MEMORY_LIFECYCLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memory_context_lifecycle (
  context_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  route_context_id TEXT NOT NULL,
  continuity_task_id TEXT,
  objective_hash TEXT NOT NULL,
  postflight_state TEXT NOT NULL CHECK (postflight_state IN ('OPEN','POSTFLIGHT_PENDING','CLOSED')),
  meaningful_work_count INTEGER NOT NULL DEFAULT 0 CHECK (meaningful_work_count >= 0),
  first_meaningful_at INTEGER,
  last_meaningful_at INTEGER,
  last_tool_name TEXT,
  last_reason_code TEXT,
  postflight_applied_at INTEGER,
  closed_at INTEGER,
  local_durable_generation TEXT,
  local_durable_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_context_lifecycle_scope_state
  ON memory_context_lifecycle(principal_id, project_id, postflight_state, updated_at DESC, context_id);
CREATE INDEX IF NOT EXISTS idx_memory_context_lifecycle_scope_objective
  ON memory_context_lifecycle(principal_id, project_id, objective_hash, postflight_state, updated_at DESC, context_id);
CREATE INDEX IF NOT EXISTS idx_memory_context_lifecycle_scope_task
  ON memory_context_lifecycle(principal_id, project_id, continuity_task_id, postflight_state, updated_at DESC, context_id);
CREATE INDEX IF NOT EXISTS idx_memory_context_lifecycle_route
  ON memory_context_lifecycle(principal_id, project_id, route_context_id, expires_at);
`;

export interface MemoryMigration {
  version: number;
  name: string;
  sql: string;
}

export const MEMORY_MIGRATIONS: readonly MemoryMigration[] = [
  { version: 1, name: INITIAL_MEMORY_MIGRATION, sql: MEMORY_SCHEMA_V1_SQL },
  { version: 2, name: CONTINUITY_MEMORY_MIGRATION, sql: CONTINUITY_SCHEMA_SQL },
  { version: 3, name: MEMORY_COGNITION_MIGRATION, sql: MEMORY_COGNITION_SCHEMA_SQL },
  { version: 4, name: HARD_MEMORY_LIFECYCLE_MIGRATION, sql: HARD_MEMORY_LIFECYCLE_SCHEMA_SQL },
] as const;

export const MEMORY_SCHEMA_SQL = `${MEMORY_SCHEMA_V1_SQL}\n${CONTINUITY_SCHEMA_SQL}\n${MEMORY_COGNITION_SCHEMA_SQL}\n${HARD_MEMORY_LIFECYCLE_SCHEMA_SQL}`;

export function initializeMemorySchema(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  const versionRow = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const priorUserVersion = Number(versionRow?.user_version ?? 0);
  if (!Number.isInteger(priorUserVersion) || priorUserVersion < 0) {
    throw new Error('Memory schema user_version is invalid');
  }
  if (priorUserVersion > MEMORY_SCHEMA_VERSION) {
    throw new Error(`Memory schema version ${priorUserVersion} is newer than runtime ${MEMORY_SCHEMA_VERSION}`);
  }
  if (priorUserVersion === MEMORY_SCHEMA_VERSION) return;

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const migration of MEMORY_MIGRATIONS) {
      if (migration.version <= priorUserVersion) continue;
      db.exec(migration.sql);
      db.prepare('INSERT OR IGNORE INTO memory_schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, Date.now());
    }
    db.exec(`PRAGMA user_version = ${MEMORY_SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const MEMORY_FTS_REBUILD_SQL = `
DELETE FROM memory_fts;
INSERT INTO memory_fts(memory_id, principal_id, project_id, canonical_key, anchors, value_text, state, kind)
SELECT
  item.id,
  item.principal_id,
  COALESCE(item.project_id, ''),
  item.canonical_key,
  COALESCE((
    SELECT group_concat(anchor, ' ')
    FROM (
      SELECT anchor
      FROM memory_anchors
      WHERE memory_id = item.id
      ORDER BY anchor COLLATE BINARY
    )
  ), ''),
  revision.value_text,
  item.state,
  item.kind
FROM memory_items AS item
JOIN memory_revisions AS revision ON revision.id = item.current_revision_id
WHERE item.state <> 'tombstoned'
ORDER BY item.id COLLATE BINARY;
`;

export function rebuildMemoryFts(db: DatabaseSync): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(MEMORY_FTS_REBUILD_SQL);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
