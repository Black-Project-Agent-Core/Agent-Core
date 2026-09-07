import type { DatabaseSync } from 'node:sqlite';

export const OPERATOR_DIRECTIVE_SCHEMA_VERSION = 1 as const;

export const OPERATOR_DIRECTIVE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS operator_directives (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  directive_key TEXT NOT NULL,
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  verbatim_text TEXT NOT NULL,
  verbatim_sha256 TEXT NOT NULL,
  scope TEXT NOT NULL,
  trust_class TEXT NOT NULL,
  effect_version INTEGER NOT NULL CHECK (effect_version >= 1),
  projection_sha256 TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_by_key_id TEXT NOT NULL,
  created_authentication TEXT NOT NULL,
  UNIQUE(principal_id, directive_key)
);

CREATE INDEX IF NOT EXISTS idx_operator_directives_principal_active
  ON operator_directives(principal_id, active, directive_key);

CREATE TABLE IF NOT EXISTS operator_directive_events (
  id TEXT PRIMARY KEY,
  directive_id TEXT NOT NULL REFERENCES operator_directives(id) ON DELETE RESTRICT,
  principal_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('granted', 'revised', 'revoked')),
  revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
  verbatim_sha256 TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  actor_key_id TEXT NOT NULL,
  authentication_mode TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operator_directive_events_principal_created
  ON operator_directive_events(principal_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_operator_directive_events_directive_revision
  ON operator_directive_events(directive_id, revision_no, created_at, id);

CREATE TRIGGER IF NOT EXISTS trg_operator_directive_events_append_only_update
BEFORE UPDATE ON operator_directive_events
BEGIN
  SELECT RAISE(ABORT, 'operator_directive_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_operator_directive_events_append_only_delete
BEFORE DELETE ON operator_directive_events
BEGIN
  SELECT RAISE(ABORT, 'operator_directive_events is append-only');
END;
`;

export function initializeOperatorDirectiveSchema(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  const version = Number((db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)?.user_version ?? 0);
  if (!Number.isInteger(version) || version < 0) throw new Error('OPERATOR_DIRECTIVE_SCHEMA_INVALID');
  if (version > OPERATOR_DIRECTIVE_SCHEMA_VERSION) throw new Error('OPERATOR_DIRECTIVE_SCHEMA_NEWER_THAN_RUNTIME');
  if (version === OPERATOR_DIRECTIVE_SCHEMA_VERSION) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(OPERATOR_DIRECTIVE_SCHEMA_SQL);
    db.exec(`PRAGMA user_version = ${OPERATOR_DIRECTIVE_SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
