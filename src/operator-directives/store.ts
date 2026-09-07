import { createHash, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AuthenticationMode } from '../auth/key-types.js';
import type { OperatorDirectiveConfig } from '../config.js';
import {
  isOperatorDirectiveKey,
  operatorDirectiveCatalogEntry,
  type OperatorDirectiveKey,
} from './catalog.js';
import { initializeOperatorDirectiveSchema } from './schema.js';
import type { OperatorDirectiveEventType } from './types.js';

export interface StoredOperatorDirective {
  id: string;
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  revisionNo: number;
  verbatimText: string;
  verbatimSha256: string;
  scope: 'principal_global';
  trustClass: 'authenticated_user_explicit';
  effectVersion: number;
  projectionSha256: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  revokedAt?: number;
  createdByKeyId: string;
  createdAuthentication: AuthenticationMode;
}

export interface StoredOperatorDirectiveEvent {
  id: string;
  directiveId: string;
  principalId: string;
  eventType: OperatorDirectiveEventType;
  revisionNo: number;
  verbatimSha256: string;
  snapshotSha256: string;
  actorKeyId: string;
  authenticationMode: AuthenticationMode;
  reason: string;
  createdAt: number;
}

export interface OperatorDirectiveMutationInput {
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  verbatimText: string;
  actorKeyId: string;
  authenticationMode: AuthenticationMode;
  reason: string;
  now?: number;
}

export interface OperatorDirectiveRevokeInput {
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  actorKeyId: string;
  authenticationMode: AuthenticationMode;
  reason: string;
  now?: number;
}

export interface OperatorDirectiveMutationResult {
  directive: StoredOperatorDirective;
  event: StoredOperatorDirectiveEvent;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableProjection(input: {
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  revisionNo: number;
  verbatimSha256: string;
  active: boolean;
}): string {
  const catalog = operatorDirectiveCatalogEntry(input.directiveKey);
  return JSON.stringify({
    active: input.active,
    directiveKey: input.directiveKey,
    effectVersion: catalog.effectVersion,
    principalId: input.principalId,
    revisionNo: input.revisionNo,
    scope: catalog.scope,
    trustClass: catalog.trustClass,
    verbatimSha256: input.verbatimSha256,
  });
}

function projectionHash(input: Parameters<typeof stableProjection>[0]): string {
  return sha256(stableProjection(input));
}

function mapDirective(row: Record<string, unknown>): StoredOperatorDirective {
  const directiveKey = String(row.directive_key);
  if (!isOperatorDirectiveKey(directiveKey)) throw new Error('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
  return {
    id: String(row.id),
    principalId: String(row.principal_id),
    directiveKey,
    revisionNo: Number(row.revision_no),
    verbatimText: String(row.verbatim_text),
    verbatimSha256: String(row.verbatim_sha256),
    scope: String(row.scope) as 'principal_global',
    trustClass: String(row.trust_class) as 'authenticated_user_explicit',
    effectVersion: Number(row.effect_version),
    projectionSha256: String(row.projection_sha256),
    active: Number(row.active) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    ...(row.revoked_at == null ? {} : { revokedAt: Number(row.revoked_at) }),
    createdByKeyId: String(row.created_by_key_id),
    createdAuthentication: String(row.created_authentication) as AuthenticationMode,
  };
}

function mapEvent(row: Record<string, unknown>): StoredOperatorDirectiveEvent {
  return {
    id: String(row.id),
    directiveId: String(row.directive_id),
    principalId: String(row.principal_id),
    eventType: String(row.event_type) as OperatorDirectiveEventType,
    revisionNo: Number(row.revision_no),
    verbatimSha256: String(row.verbatim_sha256),
    snapshotSha256: String(row.snapshot_sha256),
    actorKeyId: String(row.actor_key_id),
    authenticationMode: String(row.authentication_mode) as AuthenticationMode,
    reason: String(row.reason),
    createdAt: Number(row.created_at),
  };
}

export class OperatorDirectiveStore {
  private db?: DatabaseSync;

  constructor(readonly config: OperatorDirectiveConfig) {}

  async open(): Promise<void> {
    if (this.db) return;
    if (!this.config.enabled) return;
    await mkdir(path.dirname(this.config.dbPath), { recursive: true });
    const db = new DatabaseSync(this.config.dbPath);
    db.exec(`PRAGMA busy_timeout = ${Math.max(1, Math.floor(this.config.busyTimeoutMs))}`);
    initializeOperatorDirectiveSchema(db);
    this.db = db;
  }

  async grantOrRevise(input: OperatorDirectiveMutationInput): Promise<OperatorDirectiveMutationResult> {
    const db = await this.requireDb();
    if (!input.principalId.trim()) throw new Error('OPERATOR_DIRECTIVE_PRINCIPAL_REQUIRED');
    if (!isOperatorDirectiveKey(String(input.directiveKey))) throw new Error('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
    if (!input.verbatimText) throw new Error('OPERATOR_DIRECTIVE_VERBATIM_REQUIRED');
    if (!input.actorKeyId.trim()) throw new Error('OPERATOR_DIRECTIVE_ACTOR_REQUIRED');
    if (!input.reason.trim()) throw new Error('OPERATOR_DIRECTIVE_REASON_REQUIRED');

    const now = input.now ?? Date.now();
    const catalog = operatorDirectiveCatalogEntry(input.directiveKey);
    const existingRow = db.prepare(`SELECT * FROM operator_directives
      WHERE principal_id = ? AND directive_key = ? LIMIT 1`)
      .get(input.principalId, input.directiveKey) as Record<string, unknown> | undefined;
    const existing = existingRow ? mapDirective(existingRow) : null;
    const revisionNo = (existing?.revisionNo ?? 0) + 1;
    const verbatimSha256 = sha256(input.verbatimText);
    const projectionSha256 = projectionHash({
      principalId: input.principalId,
      directiveKey: input.directiveKey,
      revisionNo,
      verbatimSha256,
      active: true,
    });
    const directiveId = existing?.id ?? randomUUID();
    const eventType: OperatorDirectiveEventType = existing ? 'revised' : 'granted';
    const eventId = randomUUID();

    db.exec('BEGIN IMMEDIATE');
    try {
      if (existing) {
        db.prepare(`UPDATE operator_directives SET
          revision_no = ?, verbatim_text = ?, verbatim_sha256 = ?, scope = ?, trust_class = ?,
          effect_version = ?, projection_sha256 = ?, active = 1, updated_at = ?, revoked_at = NULL
          WHERE id = ? AND principal_id = ? AND directive_key = ?`)
          .run(
            revisionNo, input.verbatimText, verbatimSha256, catalog.scope, catalog.trustClass,
            catalog.effectVersion, projectionSha256, now,
            directiveId, input.principalId, input.directiveKey,
          );
      } else {
        db.prepare(`INSERT INTO operator_directives(
          id, principal_id, directive_key, revision_no, verbatim_text, verbatim_sha256,
          scope, trust_class, effect_version, projection_sha256, active,
          created_at, updated_at, revoked_at, created_by_key_id, created_authentication
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, ?, ?)`)
          .run(
            directiveId, input.principalId, input.directiveKey, revisionNo,
            input.verbatimText, verbatimSha256, catalog.scope, catalog.trustClass,
            catalog.effectVersion, projectionSha256, now, now, input.actorKeyId,
            input.authenticationMode,
          );
      }
      db.prepare(`INSERT INTO operator_directive_events(
        id, directive_id, principal_id, event_type, revision_no, verbatim_sha256,
        snapshot_sha256, actor_key_id, authentication_mode, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          eventId, directiveId, input.principalId, eventType, revisionNo, verbatimSha256,
          projectionSha256, input.actorKeyId, input.authenticationMode, input.reason, now,
        );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const directive = await this.getOwned(input.principalId, input.directiveKey, true);
    if (!directive) throw new Error('OPERATOR_DIRECTIVE_WRITE_FAILED');
    const event = db.prepare('SELECT * FROM operator_directive_events WHERE id = ? LIMIT 1')
      .get(eventId) as Record<string, unknown> | undefined;
    if (!event) throw new Error('OPERATOR_DIRECTIVE_EVENT_WRITE_FAILED');
    return { directive, event: mapEvent(event) };
  }

  async revoke(input: OperatorDirectiveRevokeInput): Promise<OperatorDirectiveMutationResult> {
    const db = await this.requireDb();
    if (!isOperatorDirectiveKey(String(input.directiveKey))) throw new Error('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
    if (!input.reason.trim()) throw new Error('OPERATOR_DIRECTIVE_REASON_REQUIRED');
    const existing = await this.getOwned(input.principalId, input.directiveKey, true);
    if (!existing) throw new Error('OPERATOR_DIRECTIVE_NOT_FOUND');
    if (!existing.active) throw new Error('OPERATOR_DIRECTIVE_NOT_ACTIVE');
    const now = input.now ?? Date.now();
    const revisionNo = existing.revisionNo + 1;
    const projectionSha256 = projectionHash({
      principalId: existing.principalId,
      directiveKey: existing.directiveKey,
      revisionNo,
      verbatimSha256: existing.verbatimSha256,
      active: false,
    });
    const eventId = randomUUID();

    db.exec('BEGIN IMMEDIATE');
    try {
      const result = db.prepare(`UPDATE operator_directives SET
        revision_no = ?, projection_sha256 = ?, active = 0, updated_at = ?, revoked_at = ?
        WHERE id = ? AND principal_id = ? AND directive_key = ? AND active = 1`)
        .run(revisionNo, projectionSha256, now, now, existing.id, input.principalId, input.directiveKey);
      if (Number(result.changes) !== 1) throw new Error('OPERATOR_DIRECTIVE_NOT_ACTIVE');
      db.prepare(`INSERT INTO operator_directive_events(
        id, directive_id, principal_id, event_type, revision_no, verbatim_sha256,
        snapshot_sha256, actor_key_id, authentication_mode, reason, created_at
      ) VALUES (?, ?, ?, 'revoked', ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          eventId, existing.id, input.principalId, revisionNo, existing.verbatimSha256,
          projectionSha256, input.actorKeyId, input.authenticationMode, input.reason, now,
        );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const directive = await this.getOwned(input.principalId, input.directiveKey, true);
    if (!directive) throw new Error('OPERATOR_DIRECTIVE_WRITE_FAILED');
    const event = db.prepare('SELECT * FROM operator_directive_events WHERE id = ? LIMIT 1')
      .get(eventId) as Record<string, unknown> | undefined;
    if (!event) throw new Error('OPERATOR_DIRECTIVE_EVENT_WRITE_FAILED');
    return { directive, event: mapEvent(event) };
  }

  async listCurrent(principalId: string, options: { includeRevoked?: boolean } = {}): Promise<StoredOperatorDirective[]> {
    const db = await this.requireDb();
    const rows = db.prepare(`SELECT * FROM operator_directives
      WHERE principal_id = ? ${options.includeRevoked ? '' : 'AND active = 1'}
      ORDER BY directive_key COLLATE BINARY`)
      .all(principalId) as Record<string, unknown>[];
    const directives = rows.map(mapDirective);
    for (const directive of directives) this.assertDirectiveIntegrity(directive);
    return directives;
  }

  async listEvents(principalId: string): Promise<StoredOperatorDirectiveEvent[]> {
    const db = await this.requireDb();
    const rows = db.prepare(`SELECT * FROM operator_directive_events
      WHERE principal_id = ? ORDER BY created_at ASC, id COLLATE BINARY`)
      .all(principalId) as Record<string, unknown>[];
    return rows.map(mapEvent);
  }

  async integrity(): Promise<{ ok: boolean; result: string }> {
    const db = await this.requireDb();
    const quick = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
    if (String(quick?.quick_check ?? '') !== 'ok') return { ok: false, result: String(quick?.quick_check ?? 'sqlite_quick_check_failed') };
    const rows = db.prepare('SELECT * FROM operator_directives ORDER BY principal_id, directive_key')
      .all() as Record<string, unknown>[];
    try {
      for (const row of rows) this.assertDirectiveIntegrity(mapDirective(row));
      return { ok: true, result: 'ok' };
    } catch (error) {
      return { ok: false, result: error instanceof Error ? error.message : String(error) };
    }
  }

  async close(): Promise<void> {
    const db = this.db;
    this.db = undefined;
    db?.close();
  }

  private async getOwned(
    principalId: string,
    directiveKey: OperatorDirectiveKey,
    includeRevoked: boolean,
  ): Promise<StoredOperatorDirective | null> {
    const db = await this.requireDb();
    const row = db.prepare(`SELECT * FROM operator_directives
      WHERE principal_id = ? AND directive_key = ? ${includeRevoked ? '' : 'AND active = 1'} LIMIT 1`)
      .get(principalId, directiveKey) as Record<string, unknown> | undefined;
    if (!row) return null;
    const directive = mapDirective(row);
    this.assertDirectiveIntegrity(directive);
    return directive;
  }

  private assertDirectiveIntegrity(directive: StoredOperatorDirective): void {
    const catalog = operatorDirectiveCatalogEntry(directive.directiveKey);
    const expectedVerbatimSha = sha256(directive.verbatimText);
    const expectedProjectionSha = projectionHash({
      principalId: directive.principalId,
      directiveKey: directive.directiveKey,
      revisionNo: directive.revisionNo,
      verbatimSha256: directive.verbatimSha256,
      active: directive.active,
    });
    if (
      directive.verbatimSha256 !== expectedVerbatimSha
      || directive.projectionSha256 !== expectedProjectionSha
      || directive.scope !== catalog.scope
      || directive.trustClass !== catalog.trustClass
      || directive.effectVersion !== catalog.effectVersion
    ) {
      throw new Error('OPERATOR_DIRECTIVE_INTEGRITY_FAILED');
    }
  }

  private async requireDb(): Promise<DatabaseSync> {
    if (!this.config.enabled) throw new Error('OPERATOR_DIRECTIVES_DISABLED');
    if (!this.db) await this.open();
    if (!this.db) throw new Error('OPERATOR_DIRECTIVE_DB_UNAVAILABLE');
    return this.db;
  }
}
