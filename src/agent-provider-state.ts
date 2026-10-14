import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  AgentProviderFailureDecision,
  AgentProviderFailureClass,
  AgentProviderResponseObservation,
} from './agent-provider-errors.js';

export type ProviderCredentialOperationalState =
  | 'active'
  | 'cooldown'
  | 'quota_blocked'
  | 'invalid'
  | 'disabled';

export type ProviderBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderCredentialDescriptor {
  id: string;
  ordinal: number;
  secretRevisionDigest: string;
}

export interface ProviderSelectionRecord {
  providerId: string;
  credentialId: string;
  ordinal: number;
  stateRevision: number;
  startedAtMs: number;
}
export interface ProviderSelectionResult {
  selection: ProviderSelectionRecord | null;
  nextAvailableAtMs: number | null;
  reason: 'selected' | 'provider-open' | 'no-eligible-credential';
}

export interface ProviderOperationalHealth {
  available: boolean;
  issue: string | null;
  providerId: string;
  credentialCount: number;
  activeCount: number;
  cooldownCount: number;
  quotaBlockedCount: number;
  invalidCount: number;
  breakerState: ProviderBreakerState;
  nextAvailableAtMs: number | null;
}

type CredentialRow = {
  credential_id: string;
  configured_ordinal: number;
  last_used_at_ms: number | null;
  consecutive_use_count: number;
  state_revision: number;
  state: ProviderCredentialOperationalState;
  cooldown_until_ms: number | null;
  backoff_level: number;
  last_error_at_ms: number | null;
};

type BreakerRow = {
  state: ProviderBreakerState;
  failure_count: number;
  last_failure_at_ms: number | null;
  retry_at_ms: number | null;
  half_open_probe_count: number;
  open_cycle_count: number;
  state_revision: number;
};
const BREAKER_THRESHOLD = 3;
const BREAKER_BASE_MS = 30_000;
const BREAKER_MAX_MS = 10 * 60_000;
const RATE_LIMIT_BASE_MS = 90_000;
const RATE_LIMIT_MAX_MS = 30 * 60_000;

export function secretRevisionDigest(secret: string): string {
  return createHash('sha256')
    .update('agent-core-provider-secret-revision\0', 'utf8')
    .update(secret, 'utf8')
    .digest('hex');
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase().slice(0, 120);
}

function finiteMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
}

function minFuture(values: Array<number | null | undefined>, now: number): number | null {
  const future = values.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > now);
  return future.length ? Math.min(...future) : null;
}

export class ProviderStateStore {
  private issue: string | null = null;

  constructor(readonly dbPath: string) {
    try {
      mkdirSync(path.dirname(dbPath), { recursive: true });
      this.initializeSchema();
    } catch (error) {
      this.issue = this.safeIssue(error);
    }
  }
  private safeIssue(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `AGENT_RUNTIME_PROVIDER_STATE_UNAVAILABLE: ${message.slice(0, 300)}`;
  }

  private open(): DatabaseSync {
    const db = new DatabaseSync(this.dbPath);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    return db;
  }

  private withDb<T>(fn: (db: DatabaseSync) => T): T {
    if (this.issue) {
      const priorIssue = this.issue;
      try {
        const probe = this.open();
        probe.close();
        this.issue = null;
      } catch {
        throw new Error(priorIssue);
      }
    }
    const db = this.open();
    try {
      const value = fn(db);
      this.issue = null;
      return value;
    } catch (error) {
      this.issue = this.safeIssue(error);
      throw error;
    } finally {
      db.close();
    }
  }

  private inTransaction<T>(db: DatabaseSync, fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
  private initializeSchema(): void {
    const db = this.open();
    try {
      db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_state_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO provider_state_meta(key, value) VALUES ('schema_version', '1');

        CREATE TABLE IF NOT EXISTS provider_rotation_state (
          provider_id TEXT PRIMARY KEY,
          last_credential_id TEXT,
          rotation_sequence INTEGER NOT NULL DEFAULT 0,
          updated_at_ms INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_credential_state (
          provider_id TEXT NOT NULL,
          credential_id TEXT NOT NULL,
          configured_ordinal INTEGER NOT NULL,
          secret_revision_digest TEXT NOT NULL,
          last_used_at_ms INTEGER,
          consecutive_use_count INTEGER NOT NULL DEFAULT 0,
          state_revision INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL DEFAULT 'active',
          cooldown_until_ms INTEGER,
          cooldown_reason TEXT,
          backoff_level INTEGER NOT NULL DEFAULT 0,
          last_success_at_ms INTEGER,
          last_error_at_ms INTEGER,
          last_error_class TEXT,
          last_http_status INTEGER,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY (provider_id, credential_id)
        );
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_scope_blocks (
          provider_id TEXT NOT NULL,
          credential_id TEXT NOT NULL DEFAULT '',
          model TEXT NOT NULL DEFAULT '',
          scope_kind TEXT NOT NULL,
          scope_key TEXT NOT NULL,
          reason TEXT NOT NULL,
          expires_at_ms INTEGER,
          state_revision INTEGER NOT NULL DEFAULT 0,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY (provider_id, credential_id, model, scope_kind, scope_key)
        );

        CREATE TABLE IF NOT EXISTS provider_quota_state (
          provider_id TEXT NOT NULL,
          credential_id TEXT NOT NULL,
          quota_scope_key TEXT NOT NULL,
          metric TEXT NOT NULL,
          limit_value REAL,
          remaining_value REAL,
          reset_at_ms INTEGER,
          retry_after_ms INTEGER,
          source TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 0,
          observed_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          PRIMARY KEY (provider_id, credential_id, quota_scope_key, metric)
        );
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS provider_breaker_state (
          provider_id TEXT PRIMARY KEY,
          state TEXT NOT NULL DEFAULT 'CLOSED',
          failure_count INTEGER NOT NULL DEFAULT 0,
          last_failure_at_ms INTEGER,
          last_failure_class TEXT,
          opened_at_ms INTEGER,
          retry_at_ms INTEGER,
          half_open_probe_count INTEGER NOT NULL DEFAULT 0,
          open_cycle_count INTEGER NOT NULL DEFAULT 0,
          state_revision INTEGER NOT NULL DEFAULT 0,
          updated_at_ms INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_provider_credential_state_until
          ON provider_credential_state(provider_id, cooldown_until_ms);
        CREATE INDEX IF NOT EXISTS idx_provider_scope_blocks_expiry
          ON provider_scope_blocks(provider_id, expires_at_ms);
        CREATE INDEX IF NOT EXISTS idx_provider_quota_state_reset
          ON provider_quota_state(provider_id, credential_id, reset_at_ms);
      `);
      const version = db.prepare(
        "SELECT value FROM provider_state_meta WHERE key = 'schema_version'"
      ).get() as { value?: string } | undefined;
      if (version?.value !== '1') throw new Error('AGENT_RUNTIME_PROVIDER_STATE_SCHEMA_UNSUPPORTED');
      this.issue = null;
    } finally {
      db.close();
    }
  }

  healthIssue(): string | null {
    return this.issue;
  }

  assertAvailable(): void {
    if (this.issue) throw new Error(this.issue);
  }
  private reconcileCredentials(
    db: DatabaseSync,
    providerId: string,
    credentials: ProviderCredentialDescriptor[],
    now: number,
  ): void {
    const select = db.prepare(`
      SELECT secret_revision_digest, state
      FROM provider_credential_state
      WHERE provider_id = ? AND credential_id = ?
    `);
    const insert = db.prepare(`
      INSERT INTO provider_credential_state (
        provider_id, credential_id, configured_ordinal, secret_revision_digest,
        state, updated_at_ms
      ) VALUES (?, ?, ?, ?, 'active', ?)
    `);
    const updateOrdinal = db.prepare(`
      UPDATE provider_credential_state
      SET configured_ordinal = ?, updated_at_ms = ?
      WHERE provider_id = ? AND credential_id = ?
    `);
    const resetRevision = db.prepare(`
      UPDATE provider_credential_state
      SET configured_ordinal = ?, secret_revision_digest = ?, state = 'active',
          cooldown_until_ms = NULL, cooldown_reason = NULL, backoff_level = 0,
          last_error_at_ms = NULL, last_error_class = NULL, last_http_status = NULL,
          state_revision = state_revision + 1, updated_at_ms = ?
      WHERE provider_id = ? AND credential_id = ?
    `);

    for (const credential of credentials) {
      const row = select.get(providerId, credential.id) as
        | { secret_revision_digest: string; state: string }
        | undefined;
      if (!row) {
        insert.run(providerId, credential.id, credential.ordinal, credential.secretRevisionDigest, now);
      } else if (row.secret_revision_digest !== credential.secretRevisionDigest) {
        resetRevision.run(
          credential.ordinal, credential.secretRevisionDigest, now, providerId, credential.id,
        );
      } else {
        updateOrdinal.run(credential.ordinal, now, providerId, credential.id);
      }
    }
  }
  private cleanupExpired(db: DatabaseSync, providerId: string, now: number): void {
    db.prepare(`
      UPDATE provider_credential_state
      SET state = 'active', cooldown_until_ms = NULL, cooldown_reason = NULL,
          backoff_level = 0, state_revision = state_revision + 1, updated_at_ms = ?
      WHERE provider_id = ?
        AND state IN ('cooldown', 'quota_blocked')
        AND cooldown_until_ms IS NOT NULL
        AND cooldown_until_ms <= ?
    `).run(now, providerId, now);
    db.prepare(`
      DELETE FROM provider_scope_blocks
      WHERE provider_id = ? AND expires_at_ms IS NOT NULL AND expires_at_ms <= ?
    `).run(providerId, now);
    db.prepare(`
      DELETE FROM provider_quota_state
      WHERE provider_id = ? AND reset_at_ms IS NOT NULL AND reset_at_ms <= ?
    `).run(providerId, now);
  }

  private breakerRow(db: DatabaseSync, providerId: string): BreakerRow {
    const row = db.prepare(`
      SELECT state, failure_count, last_failure_at_ms, retry_at_ms,
             half_open_probe_count, open_cycle_count, state_revision
      FROM provider_breaker_state WHERE provider_id = ?
    `).get(providerId) as BreakerRow | undefined;
    return row ?? {
      state: 'CLOSED', failure_count: 0, last_failure_at_ms: null,
      retry_at_ms: null, half_open_probe_count: 0, open_cycle_count: 0,
      state_revision: 0,
    };
  }
  private refreshBreaker(db: DatabaseSync, providerId: string, now: number): BreakerRow {
    let row = this.breakerRow(db, providerId);
    if (row.state === 'OPEN' && row.retry_at_ms !== null && row.retry_at_ms <= now) {
      db.prepare(`
        INSERT INTO provider_breaker_state (
          provider_id, state, failure_count, last_failure_at_ms, retry_at_ms,
          half_open_probe_count, open_cycle_count, state_revision, updated_at_ms
        ) VALUES (?, 'HALF_OPEN', ?, ?, NULL, 0, ?, ?, ?)
        ON CONFLICT(provider_id) DO UPDATE SET
          state = 'HALF_OPEN', retry_at_ms = NULL, half_open_probe_count = 0,
          state_revision = state_revision + 1, updated_at_ms = excluded.updated_at_ms
      `).run(
        providerId, row.failure_count, row.last_failure_at_ms,
        row.open_cycle_count, row.state_revision + 1, now,
      );
      row = this.breakerRow(db, providerId);
    }
    return row;
  }

  selectCredential(input: {
    providerId: string;
    credentials: ProviderCredentialDescriptor[];
    model: string | null;
    excludedCredentialIds?: Set<string>;
    now?: number;
  }): ProviderSelectionResult {
    const providerId = normalizeProviderId(input.providerId);
    const now = input.now ?? Date.now();
    const excluded = input.excludedCredentialIds ?? new Set<string>();
    return this.withDb(db => this.inTransaction(db, () => {
      this.reconcileCredentials(db, providerId, input.credentials, now);
      this.cleanupExpired(db, providerId, now);
      const breaker = this.refreshBreaker(db, providerId, now);
      if (breaker.state === 'OPEN'
        || (breaker.state === 'HALF_OPEN' && breaker.half_open_probe_count >= 1)) {
        return {
          selection: null,
          nextAvailableAtMs: breaker.retry_at_ms,
          reason: 'provider-open' as const,
        };
      }
      const rows = db.prepare(`
        SELECT credential_id, configured_ordinal, last_used_at_ms, consecutive_use_count,
               state_revision, state, cooldown_until_ms, backoff_level, last_error_at_ms
        FROM provider_credential_state WHERE provider_id = ?
      `).all(providerId) as unknown as CredentialRow[];
      const byId = new Map(rows.map(row => [row.credential_id, row]));
      const configured = [...input.credentials].sort((a, b) =>
        a.ordinal - b.ordinal || a.id.localeCompare(b.id));
      const rotation = db.prepare(`
        SELECT last_credential_id FROM provider_rotation_state WHERE provider_id = ?
      `).get(providerId) as { last_credential_id: string | null } | undefined;
      const lastId = rotation?.last_credential_id ?? null;

      const blocks = db.prepare(`
        SELECT credential_id, model, scope_kind, scope_key, expires_at_ms
        FROM provider_scope_blocks WHERE provider_id = ?
      `).all(providerId) as unknown as Array<{
        credential_id: string; model: string; scope_kind: string;
        scope_key: string; expires_at_ms: number | null;
      }>;
      const quotas = db.prepare(`
        SELECT credential_id, quota_scope_key, remaining_value, reset_at_ms
        FROM provider_quota_state
        WHERE provider_id = ? AND metric = 'requests'
      `).all(providerId) as unknown as Array<{
        credential_id: string; quota_scope_key: string;
        remaining_value: number | null; reset_at_ms: number | null;
      }>;
      const eligible = (credential: ProviderCredentialDescriptor): boolean => {
        if (excluded.has(credential.id)) return false;
        const row = byId.get(credential.id);
        if (!row || row.state === 'invalid' || row.state === 'disabled') return false;
        if ((row.state === 'cooldown' || row.state === 'quota_blocked')
          && row.cooldown_until_ms !== null && row.cooldown_until_ms > now) return false;
        const blocked = blocks.some(block =>
          (block.expires_at_ms === null || block.expires_at_ms > now)
          && (!block.credential_id || block.credential_id === credential.id)
          && (!block.model || block.model === (input.model ?? '')));
        if (blocked) return false;
        const exhausted = quotas.some(quota =>
          quota.credential_id === credential.id
          && quota.remaining_value !== null && quota.remaining_value <= 0
          && quota.reset_at_ms !== null && quota.reset_at_ms > now
          && (quota.quota_scope_key === '*' || quota.quota_scope_key === (input.model ?? '*')));
        return !exhausted;
      };

      const lastIndex = lastId ? configured.findIndex(item => item.id === lastId) : -1;
      const ring = lastIndex >= 0
        ? [...configured.slice(lastIndex + 1), ...configured.slice(0, lastIndex + 1)]
        : [...configured].sort((a, b) => {
            const ar = byId.get(a.id);
            const br = byId.get(b.id);
            const au = ar?.last_used_at_ms ?? Number.NEGATIVE_INFINITY;
            const bu = br?.last_used_at_ms ?? Number.NEGATIVE_INFINITY;
            return au - bu || a.ordinal - b.ordinal || a.id.localeCompare(b.id);
          });
      const chosen = ring.find(eligible);
      if (!chosen) {
        const nextCredential = minFuture(
          rows.map(row => row.cooldown_until_ms),
          now,
        );
        const nextBlock = minFuture(blocks.map(block => block.expires_at_ms), now);
        const nextQuota = minFuture(quotas.map(quota => quota.reset_at_ms), now);
        return {
          selection: null,
          nextAvailableAtMs: minFuture([nextCredential, nextBlock, nextQuota, breaker.retry_at_ms], now),
          reason: 'no-eligible-credential' as const,
        };
      }

      const row = byId.get(chosen.id)!;
      const consecutive = lastId === chosen.id ? row.consecutive_use_count + 1 : 1;
      db.prepare(`
        INSERT INTO provider_rotation_state (
          provider_id, last_credential_id, rotation_sequence, updated_at_ms
        ) VALUES (?, ?, 1, ?)
        ON CONFLICT(provider_id) DO UPDATE SET
          last_credential_id = excluded.last_credential_id,
          rotation_sequence = provider_rotation_state.rotation_sequence + 1,
          updated_at_ms = excluded.updated_at_ms
      `).run(providerId, chosen.id, now);
      db.prepare(`
        UPDATE provider_credential_state
        SET last_used_at_ms = ?, consecutive_use_count = ?, updated_at_ms = ?
        WHERE provider_id = ? AND credential_id = ?
      `).run(now, consecutive, now, providerId, chosen.id);
      if (breaker.state === 'HALF_OPEN') {
        db.prepare(`
          UPDATE provider_breaker_state
          SET half_open_probe_count = 1, updated_at_ms = ?
          WHERE provider_id = ?
        `).run(now, providerId);
      }
      return {
        selection: {
          providerId,
          credentialId: chosen.id,
          ordinal: chosen.ordinal,
          stateRevision: row.state_revision,
          startedAtMs: now,
        },
        nextAvailableAtMs: null,
        reason: 'selected' as const,
      };
    }));
  }

  recordSuccess(selection: ProviderSelectionRecord, completedAtMs = Date.now()): void {
    this.withDb(db => this.inTransaction(db, () => {
      db.prepare(`
        UPDATE provider_credential_state
        SET last_success_at_ms = ?,
            state = CASE
              WHEN last_error_at_ms IS NULL OR last_error_at_ms <= ? THEN 'active'
              ELSE state
            END,
            cooldown_until_ms = CASE
              WHEN last_error_at_ms IS NULL OR last_error_at_ms <= ? THEN NULL
              ELSE cooldown_until_ms
            END,
            cooldown_reason = CASE
              WHEN last_error_at_ms IS NULL OR last_error_at_ms <= ? THEN NULL
              ELSE cooldown_reason
            END,
            backoff_level = CASE
              WHEN last_error_at_ms IS NULL OR last_error_at_ms <= ? THEN 0
              ELSE backoff_level
            END,
            updated_at_ms = ?
        WHERE provider_id = ? AND credential_id = ?
      `).run(
        completedAtMs, selection.startedAtMs, selection.startedAtMs,
        selection.startedAtMs, selection.startedAtMs, completedAtMs,
        selection.providerId, selection.credentialId,
      );
      this.recordProviderSuccessInDb(db, selection.providerId, completedAtMs);
    }));
  }
  private scopeKey(
    decision: AgentProviderFailureDecision,
    model: string | null,
  ): { credential: boolean; model: string; scopeKey: string } | null {
    if (decision.scope === 'model-credential') {
      return { credential: true, model: model ?? '', scopeKey: model ?? '*' };
    }
    if (decision.scope === 'model-provider') {
      return { credential: false, model: model ?? '', scopeKey: model ?? '*' };
    }
    return null;
  }

  recordFailure(input: {
    selection: ProviderSelectionRecord;
    decision: AgentProviderFailureDecision;
    model: string | null;
    httpStatus?: number | null;
    completedAtMs?: number;
  }): number | null {
    const completedAtMs = input.completedAtMs ?? Date.now();
    const { selection, decision } = input;
    if (decision.scope === 'request') {
      if (decision.failureClass === 'REQUEST_INVALID') {
        this.withDb(db => this.inTransaction(db, () => {
          this.recordProviderSuccessInDb(db, selection.providerId, completedAtMs);
        }));
      }
      return null;
    }

    return this.withDb(db => this.inTransaction(db, () => {
      const current = db.prepare(`
        SELECT backoff_level FROM provider_credential_state
        WHERE provider_id = ? AND credential_id = ?
      `).get(selection.providerId, selection.credentialId) as { backoff_level: number } | undefined;
      const priorBackoff = Math.max(0, current?.backoff_level ?? 0);
      const escalatedRateLimit = decision.failureClass === 'RATE_LIMIT'
        ? completedAtMs + Math.min(RATE_LIMIT_MAX_MS, RATE_LIMIT_BASE_MS * (2 ** Math.min(priorBackoff, 5)))
        : null;
      const effectiveRetryAt = decision.retryAtMs === null
        ? escalatedRateLimit
        : Math.max(decision.retryAtMs, escalatedRateLimit ?? 0);
      const nextBackoff = decision.failureClass === 'RATE_LIMIT' ? 1 : 0;

      if (decision.scope === 'credential') {
        const state: ProviderCredentialOperationalState = decision.terminalCredential
          ? 'invalid'
          : decision.failureClass === 'QUOTA_EXHAUSTED' || decision.failureClass === 'CREDIT_EXHAUSTED'
            ? 'quota_blocked' : 'cooldown';
        db.prepare(`
          UPDATE provider_credential_state
          SET state = ?, cooldown_until_ms = ?, cooldown_reason = ?,
              backoff_level = CASE WHEN ? = 1 THEN backoff_level + 1 ELSE backoff_level END,
              last_error_at_ms = ?, last_error_class = ?, last_http_status = ?,
              state_revision = state_revision + 1, updated_at_ms = ?
          WHERE provider_id = ? AND credential_id = ?
        `).run(
          state, effectiveRetryAt, decision.failureClass, nextBackoff,
          completedAtMs, decision.failureClass, input.httpStatus ?? null,
          completedAtMs, selection.providerId, selection.credentialId,
        );
      } else {
        db.prepare(`
          UPDATE provider_credential_state
          SET last_error_at_ms = ?, last_error_class = ?, last_http_status = ?,
              backoff_level = CASE WHEN ? = 1 THEN backoff_level + 1 ELSE backoff_level END,
              state_revision = state_revision + 1, updated_at_ms = ?
          WHERE provider_id = ? AND credential_id = ?
        `).run(
          completedAtMs, decision.failureClass, input.httpStatus ?? null, nextBackoff,
          completedAtMs, selection.providerId, selection.credentialId,
        );
      }

      const scope = this.scopeKey(decision, input.model);
      if (scope && effectiveRetryAt !== null) {
        db.prepare(`
          INSERT INTO provider_scope_blocks (
            provider_id, credential_id, model, scope_kind, scope_key,
            reason, expires_at_ms, state_revision, updated_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(provider_id, credential_id, model, scope_kind, scope_key)
          DO UPDATE SET
            reason = excluded.reason, expires_at_ms = excluded.expires_at_ms,
            state_revision = provider_scope_blocks.state_revision + 1,
            updated_at_ms = excluded.updated_at_ms
        `).run(
          selection.providerId,
          scope.credential ? selection.credentialId : '',
          scope.model,
          decision.scope,
          scope.scopeKey,
          decision.failureClass,
          effectiveRetryAt,
          completedAtMs,
        );
      }

      if (decision.affectsProviderBreaker) {
        this.recordProviderFailureInDb(
          db, selection.providerId, decision.failureClass, completedAtMs,
        );
      } else {
        this.recordProviderSuccessInDb(db, selection.providerId, completedAtMs);
      }
      return effectiveRetryAt;
    }));
  }
  private recordProviderSuccessInDb(db: DatabaseSync, providerId: string, now: number): void {
    const row = this.breakerRow(db, providerId);
    if (row.state === 'CLOSED' && row.failure_count === 0) return;
    db.prepare(`
      INSERT INTO provider_breaker_state (
        provider_id, state, failure_count, last_failure_at_ms, last_failure_class,
        opened_at_ms, retry_at_ms, half_open_probe_count, open_cycle_count,
        state_revision, updated_at_ms
      ) VALUES (?, 'CLOSED', 0, NULL, NULL, NULL, NULL, 0, 0, 1, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        state = 'CLOSED', failure_count = 0, last_failure_at_ms = NULL,
        last_failure_class = NULL, opened_at_ms = NULL, retry_at_ms = NULL,
        half_open_probe_count = 0, open_cycle_count = 0,
        state_revision = state_revision + 1, updated_at_ms = excluded.updated_at_ms
    `).run(providerId, now);
  }

  private recordProviderFailureInDb(
    db: DatabaseSync,
    providerId: string,
    failureClass: AgentProviderFailureClass,
    now: number,
  ): void {
    const row = this.breakerRow(db, providerId);
    const nextFailures = row.failure_count + 1;
    const reopening = row.state === 'HALF_OPEN';
    const shouldOpen = reopening || nextFailures >= BREAKER_THRESHOLD;
    const nextCycle = reopening ? row.open_cycle_count + 1 : row.open_cycle_count;
    const delay = Math.min(
      BREAKER_MAX_MS,
      BREAKER_BASE_MS * Math.max(1, 2 ** Math.max(0, nextCycle - 1)),
    );
    const nextState: ProviderBreakerState = shouldOpen ? 'OPEN' : 'CLOSED';
    const retryAt = shouldOpen ? now + delay : null;
    db.prepare(`
      INSERT INTO provider_breaker_state (
        provider_id, state, failure_count, last_failure_at_ms, last_failure_class,
        opened_at_ms, retry_at_ms, half_open_probe_count, open_cycle_count,
        state_revision, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        state = excluded.state, failure_count = excluded.failure_count,
        last_failure_at_ms = excluded.last_failure_at_ms,
        last_failure_class = excluded.last_failure_class,
        opened_at_ms = excluded.opened_at_ms, retry_at_ms = excluded.retry_at_ms,
        half_open_probe_count = 0, open_cycle_count = excluded.open_cycle_count,
        state_revision = provider_breaker_state.state_revision + 1,
        updated_at_ms = excluded.updated_at_ms
    `).run(
      providerId, nextState, nextFailures, now, failureClass,
      shouldOpen ? now : null, retryAt, nextCycle, now,
    );
  }
  recordQuotaObservation(input: {
    providerId: string;
    credentialId: string;
    model: string | null;
    observation: AgentProviderResponseObservation;
    observedAtMs?: number;
  }): void {
    const observedAtMs = input.observedAtMs ?? Date.now();
    const observation = input.observation;
    if (observation.requestLimit === null
      && observation.requestRemaining === null
      && observation.resetAtMs === null
      && observation.retryAfterMs === null) return;
    this.withDb(db => {
      db.prepare(`
        INSERT INTO provider_quota_state (
          provider_id, credential_id, quota_scope_key, metric,
          limit_value, remaining_value, reset_at_ms, retry_after_ms,
          source, confidence, observed_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, 'requests', ?, ?, ?, ?, 'provider-response', 1, ?, ?)
        ON CONFLICT(provider_id, credential_id, quota_scope_key, metric)
        DO UPDATE SET
          limit_value = COALESCE(excluded.limit_value, provider_quota_state.limit_value),
          remaining_value = COALESCE(excluded.remaining_value, provider_quota_state.remaining_value),
          reset_at_ms = COALESCE(excluded.reset_at_ms, provider_quota_state.reset_at_ms),
          retry_after_ms = COALESCE(excluded.retry_after_ms, provider_quota_state.retry_after_ms),
          source = excluded.source, confidence = excluded.confidence,
          observed_at_ms = excluded.observed_at_ms, updated_at_ms = excluded.updated_at_ms
      `).run(
        normalizeProviderId(input.providerId), input.credentialId, input.model ?? '*',
        observation.requestLimit, observation.requestRemaining,
        observation.resetAtMs, observation.retryAfterMs, observedAtMs, observedAtMs,
      );
    });
  }
  providerHealth(
    providerIdInput: string,
    credentials: ProviderCredentialDescriptor[],
    now = Date.now(),
  ): ProviderOperationalHealth {
    const providerId = normalizeProviderId(providerIdInput);
    if (this.issue) {
      return {
        available: false, issue: this.issue, providerId,
        credentialCount: credentials.length, activeCount: 0, cooldownCount: 0,
        quotaBlockedCount: 0, invalidCount: 0, breakerState: 'CLOSED',
        nextAvailableAtMs: null,
      };
    }
    try {
      return this.withDb(db => this.inTransaction(db, () => {
        this.reconcileCredentials(db, providerId, credentials, now);
        this.cleanupExpired(db, providerId, now);
        const configuredIds = new Set(credentials.map(item => item.id));
        const rows = (db.prepare(`
          SELECT credential_id, state, cooldown_until_ms
          FROM provider_credential_state WHERE provider_id = ?
        `).all(providerId) as unknown as Array<{
          credential_id: string;
          state: ProviderCredentialOperationalState;
          cooldown_until_ms: number | null;
        }>).filter(row => configuredIds.has(row.credential_id));
        const breaker = this.refreshBreaker(db, providerId, now);
        const nextCredential = minFuture(rows.map(row => row.cooldown_until_ms), now);
        return {
          available: true,
          issue: null,
          providerId,
          credentialCount: credentials.length,
          activeCount: rows.filter(row => row.state === 'active').length,
          cooldownCount: rows.filter(row => row.state === 'cooldown').length,
          quotaBlockedCount: rows.filter(row => row.state === 'quota_blocked').length,
          invalidCount: rows.filter(row => row.state === 'invalid').length,
          breakerState: breaker.state,
          nextAvailableAtMs: minFuture([nextCredential, breaker.retry_at_ms], now),
        };
      }));
    } catch (error) {
      return {
        available: false, issue: this.safeIssue(error), providerId,
        credentialCount: credentials.length, activeCount: 0, cooldownCount: 0,
        quotaBlockedCount: 0, invalidCount: 0, breakerState: 'CLOSED',
        nextAvailableAtMs: null,
      };
    }
  }

  resetCredential(providerIdInput: string, credentialId: string, now = Date.now()): boolean {
    const providerId = normalizeProviderId(providerIdInput);
    return this.withDb(db => {
      const result = db.prepare(`
        UPDATE provider_credential_state
        SET state = 'active', cooldown_until_ms = NULL, cooldown_reason = NULL,
            backoff_level = 0, last_error_at_ms = NULL, last_error_class = NULL,
            last_http_status = NULL, state_revision = state_revision + 1,
            updated_at_ms = ?
        WHERE provider_id = ? AND credential_id = ?
      `).run(now, providerId, credentialId);
      return Number(result.changes) > 0;
    });
  }
}
