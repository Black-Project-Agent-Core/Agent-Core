import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type AgentChatConversationStatus = 'active' | 'archived';
export type AgentChatTurnStatus =
  | 'running'
  | 'resumable'
  | 'finalized'
  | 'failed'
  | 'interrupted'
  | 'stopped';
export type AgentChatMessageRole = 'user' | 'assistant';

export interface AgentChatConversation {
  id: string;
  runtimeSessionId: string;
  workspace: string;
  title: string;
  status: AgentChatConversationStatus;
  preferredProviderId?: string;
  preferredModel?: string;
  createdAtMs: number;
  updatedAtMs: number;
  lastTurnId?: string;
}
export interface AgentChatTurn {
  id: string;
  conversationId: string;
  clientRequestId: string;
  runtimeTaskId: string;
  status: AgentChatTurnStatus;
  providerId?: string;
  model?: string;
  iterations?: number;
  retrievalCount?: number;
  errorCode?: string;
  createdAtMs: number;
  startedAtMs: number;
  completedAtMs?: number;
}

export interface AgentChatMessage {
  id: string;
  conversationId: string;
  turnId: string;
  role: AgentChatMessageRole;
  content: string;
  createdAtMs: number;
}

export interface AgentChatConversationDetail {
  conversation: AgentChatConversation;
  turns: AgentChatTurn[];
  messages: AgentChatMessage[];
}

export interface AgentChatExecutionClaim {
  executorToken: string;
  executionEpoch: number;
}

export interface AgentChatCheckpointRecord {
  turnId: string;
  schemaVersion: number;
  revision: number;
  phase: string;
  payloadJson: string;
  payloadDigest: string;
  createdAtMs: number;
  updatedAtMs: number;
}
const MAX_WORKSPACE = 200;
const MAX_TITLE = 160;
const MAX_MESSAGE = 200_000;
const MAX_ERROR_CODE = 200;

function cleanText(value: string, max: number): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function mapConversation(row: Record<string, unknown>): AgentChatConversation {
  return {
    id: String(row.conversation_id),
    runtimeSessionId: String(row.runtime_session_id),
    workspace: String(row.workspace),
    title: String(row.title),
    status: String(row.status) as AgentChatConversationStatus,
    ...(row.preferred_provider_id ? { preferredProviderId: String(row.preferred_provider_id) } : {}),
    ...(row.preferred_model ? { preferredModel: String(row.preferred_model) } : {}),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    ...(row.last_turn_id ? { lastTurnId: String(row.last_turn_id) } : {}),
  };
}
function mapTurn(row: Record<string, unknown>): AgentChatTurn {
  return {
    id: String(row.turn_id),
    conversationId: String(row.conversation_id),
    clientRequestId: String(row.client_request_id),
    runtimeTaskId: String(row.runtime_task_id),
    status: String(row.status) as AgentChatTurnStatus,
    ...(row.provider_id ? { providerId: String(row.provider_id) } : {}),
    ...(row.model ? { model: String(row.model) } : {}),
    ...(row.iterations !== null && row.iterations !== undefined ? { iterations: Number(row.iterations) } : {}),
    ...(row.retrieval_count !== null && row.retrieval_count !== undefined
      ? { retrievalCount: Number(row.retrieval_count) } : {}),
    ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
    createdAtMs: Number(row.created_at_ms),
    startedAtMs: Number(row.started_at_ms),
    ...(row.completed_at_ms ? { completedAtMs: Number(row.completed_at_ms) } : {}),
  };
}

function mapMessage(row: Record<string, unknown>): AgentChatMessage {
  return {
    id: String(row.message_id),
    conversationId: String(row.conversation_id),
    turnId: String(row.turn_id),
    role: String(row.role) as AgentChatMessageRole,
    content: String(row.content),
    createdAtMs: Number(row.created_at_ms),
  };
}
export class AgentChatStore {
  constructor(readonly dbPath: string) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.initialize();
  }

  private open(): DatabaseSync {
    const db = new DatabaseSync(this.dbPath);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    return db;
  }

  private withDb<T>(fn: (db: DatabaseSync) => T): T {
    const db = this.open();
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  private transaction<T>(db: DatabaseSync, fn: () => T): T {
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
  private initialize(): void {
    const db = this.open();
    try {
      db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO chat_meta(key, value)
          VALUES ('schema_version', '2');

        CREATE TABLE IF NOT EXISTS chat_conversations (
          conversation_id TEXT PRIMARY KEY,
          runtime_session_id TEXT NOT NULL UNIQUE,
          workspace TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          preferred_provider_id TEXT,
          preferred_model TEXT,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          last_turn_id TEXT
        );
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_turns (
          turn_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          client_request_id TEXT NOT NULL UNIQUE,
          runtime_task_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL,
          provider_id TEXT,
          model TEXT,
          iterations INTEGER,
          retrieval_count INTEGER,
          error_code TEXT,
          created_at_ms INTEGER NOT NULL,
          started_at_ms INTEGER NOT NULL,
          completed_at_ms INTEGER,
          FOREIGN KEY(conversation_id)
            REFERENCES chat_conversations(conversation_id)
            ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
          message_id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          FOREIGN KEY(conversation_id)
            REFERENCES chat_conversations(conversation_id)
            ON DELETE CASCADE,
          FOREIGN KEY(turn_id)
            REFERENCES chat_turns(turn_id)
            ON DELETE CASCADE
        );
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_turn_execution (
          turn_id TEXT PRIMARY KEY,
          execution_epoch INTEGER NOT NULL,
          executor_token TEXT,
          cancel_requested_at_ms INTEGER,
          FOREIGN KEY(turn_id) REFERENCES chat_turns(turn_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_turn_checkpoints (
          turn_id TEXT PRIMARY KEY,
          schema_version INTEGER NOT NULL,
          revision INTEGER NOT NULL,
          phase TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          payload_digest TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          FOREIGN KEY(turn_id) REFERENCES chat_turns(turn_id) ON DELETE CASCADE
        );
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
          ON chat_conversations(status, updated_at_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_chat_turns_conversation
          ON chat_turns(conversation_id, created_at_ms);
        CREATE INDEX IF NOT EXISTS idx_chat_turns_status
          ON chat_turns(status, started_at_ms);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
          ON chat_messages(conversation_id, created_at_ms);
      `);
      const version = db.prepare(
        "SELECT value FROM chat_meta WHERE key='schema_version'",
      ).get() as { value?: string } | undefined;
      if (version?.value === '1') {
        db.prepare("UPDATE chat_meta SET value='2' WHERE key='schema_version'").run();
      } else if (version?.value !== '2') {
        throw new Error('AGENT_CHAT_SCHEMA_UNSUPPORTED');
      }
    } finally {
      db.close();
    }
  }
  createConversation(input: {
    conversationId: string;
    runtimeSessionId: string;
    workspace: string;
    title: string;
    createdAtMs?: number;
  }): AgentChatConversation {
    const createdAtMs = input.createdAtMs ?? Date.now();
    const workspace = cleanText(input.workspace || 'agent-core', MAX_WORKSPACE) || 'agent-core';
    const title = cleanText(input.title || 'New Chat', MAX_TITLE) || 'New Chat';
    return this.withDb(db => {
      db.prepare(`
        INSERT INTO chat_conversations (
          conversation_id, runtime_session_id, workspace, title,
          status, created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, 'active', ?, ?)
      `).run(
        input.conversationId,
        input.runtimeSessionId,
        workspace,
        title,
        createdAtMs,
        createdAtMs,
      );
      return this.getConversationWithDb(db, input.conversationId)!;
    });
  }

  private getConversationWithDb(
    db: DatabaseSync,
    conversationId: string,
  ): AgentChatConversation | null {
    const row = db.prepare(
      'SELECT * FROM chat_conversations WHERE conversation_id = ?',
    ).get(conversationId) as Record<string, unknown> | undefined;
    return row ? mapConversation(row) : null;
  }
  getConversation(conversationId: string): AgentChatConversation | null {
    return this.withDb(db => this.getConversationWithDb(db, conversationId));
  }

  listConversations(includeArchived = false): AgentChatConversation[] {
    return this.withDb(db => {
      const rows = db.prepare(includeArchived
        ? 'SELECT * FROM chat_conversations ORDER BY updated_at_ms DESC LIMIT 500'
        : "SELECT * FROM chat_conversations WHERE status='active' ORDER BY updated_at_ms DESC LIMIT 500")
        .all() as unknown as Record<string, unknown>[];
      return rows.map(mapConversation);
    });
  }

  getTurn(turnId: string): AgentChatTurn | null {
    return this.withDb(db => {
      const row = db.prepare(
        'SELECT * FROM chat_turns WHERE turn_id = ?',
      ).get(turnId) as Record<string, unknown> | undefined;
      return row ? mapTurn(row) : null;
    });
  }

  getTurnByClientRequestId(clientRequestId: string): AgentChatTurn | null {
    return this.withDb(db => {
      const row = db.prepare(
        'SELECT * FROM chat_turns WHERE client_request_id = ?',
      ).get(clientRequestId) as Record<string, unknown> | undefined;
      return row ? mapTurn(row) : null;
    });
  }
  beginTurn(input: {
    conversationId: string;
    turnId: string;
    clientRequestId: string;
    runtimeTaskId: string;
    userMessageId: string;
    prompt: string;
    executorToken?: string;
    startedAtMs?: number;
  }): { turn: AgentChatTurn; created: boolean; claim?: AgentChatExecutionClaim } {
    const startedAtMs = input.startedAtMs ?? Date.now();
    const prompt = cleanText(input.prompt, MAX_MESSAGE);
    const executorToken = cleanText(
      input.executorToken ?? ('initial:' + input.turnId),
      200,
    );
    if (!prompt) throw new Error('AGENT_CHAT_PROMPT_REQUIRED');
    return this.withDb(db => this.transaction(db, () => {
      const existing = db.prepare(
        'SELECT * FROM chat_turns WHERE client_request_id = ?',
      ).get(input.clientRequestId) as Record<string, unknown> | undefined;
      if (existing) return { turn: mapTurn(existing), created: false };

      const conversation = this.getConversationWithDb(db, input.conversationId);
      if (!conversation || conversation.status !== 'active') {
        throw new Error('AGENT_CHAT_CONVERSATION_NOT_ACTIVE');
      }
      const active = db.prepare(`
        SELECT turn_id FROM chat_turns
        WHERE conversation_id = ? AND status IN ('running','resumable')
        LIMIT 1
      `).get(input.conversationId);
      if (active) throw new Error('AGENT_CHAT_CONVERSATION_BUSY');
      db.prepare(`
        INSERT INTO chat_turns (
          turn_id, conversation_id, client_request_id, runtime_task_id,
          status, created_at_ms, started_at_ms
        ) VALUES (?, ?, ?, ?, 'running', ?, ?)
      `).run(
        input.turnId,
        input.conversationId,
        input.clientRequestId,
        input.runtimeTaskId,
        startedAtMs,
        startedAtMs,
      );
      db.prepare(`
        INSERT INTO chat_turn_execution (
          turn_id, execution_epoch, executor_token, cancel_requested_at_ms
        ) VALUES (?, 1, ?, NULL)
      `).run(input.turnId, executorToken);
      db.prepare(`
        INSERT INTO chat_messages (
          message_id, conversation_id, turn_id, role, content, created_at_ms
        ) VALUES (?, ?, ?, 'user', ?, ?)
      `).run(
        input.userMessageId,
        input.conversationId,
        input.turnId,
        prompt,
        startedAtMs,
      );
      db.prepare(`
        UPDATE chat_conversations
        SET last_turn_id = ?, updated_at_ms = ?
        WHERE conversation_id = ?
      `).run(input.turnId, startedAtMs, input.conversationId);
      const row = db.prepare(
        'SELECT * FROM chat_turns WHERE turn_id = ?',
      ).get(input.turnId) as Record<string, unknown>;
      return {
        turn: mapTurn(row),
        created: true,
        claim: { executorToken, executionEpoch: 1 },
      };
    }));
  }

  private assertExecutionWithDb(
    db: DatabaseSync,
    turnId: string,
    claim?: AgentChatExecutionClaim,
  ): void {
    if (!claim) return;
    const execution = db.prepare(`
      SELECT execution_epoch, executor_token, cancel_requested_at_ms
      FROM chat_turn_execution WHERE turn_id=?
    `).get(turnId) as Record<string, unknown> | undefined;
    if (!execution
      || Number(execution.execution_epoch) !== claim.executionEpoch
      || String(execution.executor_token ?? '') !== claim.executorToken) {
      throw new Error('AGENT_CHAT_EXECUTOR_STALE');
    }
    if (execution.cancel_requested_at_ms !== null
      && execution.cancel_requested_at_ms !== undefined) {
      throw new Error('AGENT_CHAT_TURN_CANCELLED');
    }
  }

  getCheckpoint(turnId: string): AgentChatCheckpointRecord | null {
    return this.withDb(db => {
      const row = db.prepare(
        'SELECT * FROM chat_turn_checkpoints WHERE turn_id=?',
      ).get(turnId) as Record<string, unknown> | undefined;
      return row ? {
        turnId: String(row.turn_id),
        schemaVersion: Number(row.schema_version),
        revision: Number(row.revision),
        phase: String(row.phase),
        payloadJson: String(row.payload_json),
        payloadDigest: String(row.payload_digest),
        createdAtMs: Number(row.created_at_ms),
        updatedAtMs: Number(row.updated_at_ms),
      } : null;
    });
  }

  saveCheckpoint(input: {
    turnId: string;
    claim: AgentChatExecutionClaim;
    expectedRevision: number;
    schemaVersion: number;
    phase: string;
    payloadJson: string;
    payloadDigest: string;
    updatedAtMs?: number;
  }): AgentChatCheckpointRecord {
    const updatedAtMs = input.updatedAtMs ?? Date.now();
    return this.withDb(db => this.transaction(db, () => {
      this.assertExecutionWithDb(db, input.turnId, input.claim);
      const turn = db.prepare(
        'SELECT status FROM chat_turns WHERE turn_id=?',
      ).get(input.turnId) as { status?: string } | undefined;
      if (turn?.status !== 'running') throw new Error('AGENT_CHAT_TURN_NOT_RUNNING');
      const existing = db.prepare(
        'SELECT * FROM chat_turn_checkpoints WHERE turn_id=?',
      ).get(input.turnId) as Record<string, unknown> | undefined;
      const revision = existing ? Number(existing.revision) : 0;
      if (revision !== input.expectedRevision) {
        throw new Error('AGENT_CHAT_CHECKPOINT_REVISION_CONFLICT');
      }
      const nextRevision = revision + 1;
      if (existing) {
        db.prepare(`
          UPDATE chat_turn_checkpoints
          SET schema_version=?, revision=?, phase=?, payload_json=?,
              payload_digest=?, updated_at_ms=?
          WHERE turn_id=?
        `).run(
          input.schemaVersion, nextRevision, input.phase, input.payloadJson,
          input.payloadDigest, updatedAtMs, input.turnId,
        );
      } else {
        db.prepare(`
          INSERT INTO chat_turn_checkpoints (
            turn_id, schema_version, revision, phase, payload_json,
            payload_digest, created_at_ms, updated_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.turnId, input.schemaVersion, nextRevision, input.phase,
          input.payloadJson, input.payloadDigest, updatedAtMs, updatedAtMs,
        );
      }
      return this.getCheckpointWithDb(db, input.turnId)!;
    }));
  }

  private getCheckpointWithDb(
    db: DatabaseSync,
    turnId: string,
  ): AgentChatCheckpointRecord | null {
    const row = db.prepare(
      'SELECT * FROM chat_turn_checkpoints WHERE turn_id=?',
    ).get(turnId) as Record<string, unknown> | undefined;
    return row ? {
      turnId: String(row.turn_id),
      schemaVersion: Number(row.schema_version),
      revision: Number(row.revision),
      phase: String(row.phase),
      payloadJson: String(row.payload_json),
      payloadDigest: String(row.payload_digest),
      createdAtMs: Number(row.created_at_ms),
      updatedAtMs: Number(row.updated_at_ms),
    } : null;
  }

  claimResumableTurn(input: {
    turnId: string;
    expectedRevision: number;
    executorToken: string;
  }): AgentChatExecutionClaim {
    return this.withDb(db => this.transaction(db, () => {
      const turn = db.prepare(
        'SELECT status FROM chat_turns WHERE turn_id=?',
      ).get(input.turnId) as { status?: string } | undefined;
      if (turn?.status !== 'resumable') throw new Error('AGENT_CHAT_TURN_NOT_RESUMABLE');
      const checkpoint = this.getCheckpointWithDb(db, input.turnId);
      if (!checkpoint || checkpoint.revision !== input.expectedRevision) {
        throw new Error('AGENT_CHAT_CHECKPOINT_REVISION_CONFLICT');
      }
      const execution = db.prepare(`
        SELECT execution_epoch, cancel_requested_at_ms
        FROM chat_turn_execution WHERE turn_id=?
      `).get(input.turnId) as Record<string, unknown> | undefined;
      if (!execution) throw new Error('AGENT_CHAT_EXECUTION_STATE_MISSING');
      if (execution.cancel_requested_at_ms !== null
        && execution.cancel_requested_at_ms !== undefined) {
        throw new Error('AGENT_CHAT_TURN_CANCELLED');
      }
      const executionEpoch = Number(execution.execution_epoch) + 1;
      db.prepare(`
        UPDATE chat_turn_execution
        SET execution_epoch=?, executor_token=?
        WHERE turn_id=?
      `).run(executionEpoch, input.executorToken, input.turnId);
      db.prepare(`
        UPDATE chat_turns
        SET status='running', error_code=NULL, completed_at_ms=NULL
        WHERE turn_id=?
      `).run(input.turnId);
      return { executorToken: input.executorToken, executionEpoch };
    }));
  }

  recoverRunningTurns(completedAtMs = Date.now()): {
    resumable: AgentChatTurn[];
    interrupted: AgentChatTurn[];
  } {
    return this.withDb(db => this.transaction(db, () => {
      const rows = db.prepare(
        "SELECT * FROM chat_turns WHERE status='running'",
      ).all() as unknown as Record<string, unknown>[];
      const resumable: AgentChatTurn[] = [];
      const interrupted: AgentChatTurn[] = [];
      for (const row of rows) {
        const turn = mapTurn(row);
        const checkpoint = this.getCheckpointWithDb(db, turn.id);
        db.prepare(`
          UPDATE chat_turn_execution
          SET execution_epoch=execution_epoch+1, executor_token=NULL
          WHERE turn_id=?
        `).run(turn.id);
        if (checkpoint) {
          db.prepare(`
            UPDATE chat_turns
            SET status='resumable', error_code='AGENT_CHAT_TURN_RESUMABLE',
                completed_at_ms=NULL
            WHERE turn_id=?
          `).run(turn.id);
          resumable.push({ ...turn, status: 'resumable', errorCode: 'AGENT_CHAT_TURN_RESUMABLE' });
        } else {
          db.prepare(`
            UPDATE chat_turns
            SET status='interrupted', error_code='AGENT_CHAT_TURN_INTERRUPTED',
                completed_at_ms=?
            WHERE turn_id=?
          `).run(completedAtMs, turn.id);
          interrupted.push({
            ...turn,
            status: 'interrupted',
            errorCode: 'AGENT_CHAT_TURN_INTERRUPTED',
            completedAtMs,
          });
        }
      }
      return { resumable, interrupted };
    }));
  }

  releaseResumeClaim(
    turnId: string,
    claim: AgentChatExecutionClaim,
    errorCode: string,
  ): AgentChatTurn {
    return this.withDb(db => this.transaction(db, () => {
      this.assertExecutionWithDb(db, turnId, claim);
      db.prepare(`
        UPDATE chat_turn_execution
        SET execution_epoch=execution_epoch+1, executor_token=NULL
        WHERE turn_id=?
      `).run(turnId);
      db.prepare(`
        UPDATE chat_turns
        SET status='resumable', error_code=?, completed_at_ms=NULL
        WHERE turn_id=?
      `).run(cleanText(errorCode, MAX_ERROR_CODE), turnId);
      const row = db.prepare(
        'SELECT * FROM chat_turns WHERE turn_id=?',
      ).get(turnId) as Record<string, unknown> | undefined;
      if (!row) throw new Error('AGENT_CHAT_TURN_NOT_FOUND');
      return mapTurn(row);
    }));
  }

  cancelTurn(turnId: string, completedAtMs = Date.now()): AgentChatTurn | null {
    return this.withDb(db => this.transaction(db, () => {
      const row = db.prepare(
        'SELECT * FROM chat_turns WHERE turn_id=?',
      ).get(turnId) as Record<string, unknown> | undefined;
      if (!row) return null;
      const turn = mapTurn(row);
      if (['finalized', 'failed', 'interrupted', 'stopped'].includes(turn.status)) return turn;
      db.prepare(`
        UPDATE chat_turn_execution
        SET execution_epoch=execution_epoch+1, executor_token=NULL,
            cancel_requested_at_ms=?
        WHERE turn_id=?
      `).run(completedAtMs, turnId);
      db.prepare(`
        UPDATE chat_turns
        SET status='stopped', error_code='AGENT_RUNTIME_TURN_STOPPED',
            completed_at_ms=?
        WHERE turn_id=?
      `).run(completedAtMs, turnId);
      return {
        ...turn,
        status: 'stopped',
        errorCode: 'AGENT_RUNTIME_TURN_STOPPED',
        completedAtMs,
      };
    }));
  }

  finalizeTurn(input: {
    turnId: string;
    assistantMessageId: string;
    response: string;
    providerId?: string;
    model?: string;
    iterations: number;
    retrievalCount: number;
    claim?: AgentChatExecutionClaim;
    completedAtMs?: number;
  }): AgentChatTurn {
    const completedAtMs = input.completedAtMs ?? Date.now();
    const response = cleanText(input.response, MAX_MESSAGE);
    return this.withDb(db => this.transaction(db, () => {
      const existing = db.prepare(
        'SELECT * FROM chat_turns WHERE turn_id = ?',
      ).get(input.turnId) as Record<string, unknown> | undefined;
      if (!existing) throw new Error('AGENT_CHAT_TURN_NOT_FOUND');
      this.assertExecutionWithDb(db, input.turnId, input.claim);
      const turn = mapTurn(existing);
      if (turn.status === 'finalized') return turn;
      db.prepare(`
        UPDATE chat_turns
        SET status='finalized', provider_id=?, model=?,
            iterations=?, retrieval_count=?, error_code=NULL,
            completed_at_ms=?
        WHERE turn_id=?
      `).run(
        input.providerId ?? null,
        input.model ?? null,
        input.iterations,
        input.retrievalCount,
        completedAtMs,
        input.turnId,
      );
      db.prepare(`
        INSERT OR IGNORE INTO chat_messages (
          message_id, conversation_id, turn_id, role, content, created_at_ms
        ) VALUES (?, ?, ?, 'assistant', ?, ?)
      `).run(
        input.assistantMessageId,
        turn.conversationId,
        turn.id,
        response,
        completedAtMs,
      );
      db.prepare(`
        UPDATE chat_conversations
        SET preferred_provider_id = COALESCE(?, preferred_provider_id),
            preferred_model = COALESCE(?, preferred_model),
            updated_at_ms = ?
        WHERE conversation_id = ?
      `).run(
        input.providerId ?? null,
        input.model ?? null,
        completedAtMs,
        turn.conversationId,
      );
      const checkpoint = this.getCheckpointWithDb(db, input.turnId);
      if (checkpoint) {
        const terminalJson = JSON.stringify({
          schemaVersion: checkpoint.schemaVersion,
          turnId: input.turnId,
          runtimeTaskId: turn.runtimeTaskId,
          terminal: true,
          providerId: input.providerId ?? null,
          model: input.model ?? null,
          iterations: input.iterations,
          retrievalCount: input.retrievalCount,
          responseDigest: 'sha256:' + createHash('sha256')
            .update(response, 'utf8').digest('hex'),
          completedAtMs,
        });
        const terminalDigest = 'sha256:' + createHash('sha256')
          .update(terminalJson, 'utf8').digest('hex');
        db.prepare(`
          UPDATE chat_turn_checkpoints
          SET revision=revision+1, phase='terminal', payload_json=?,
              payload_digest=?, updated_at_ms=?
          WHERE turn_id=?
        `).run(terminalJson, terminalDigest, completedAtMs, input.turnId);
      }
      db.prepare(`
        UPDATE chat_turn_execution SET executor_token=NULL WHERE turn_id=?
      `).run(input.turnId);
      const updated = db.prepare(
        'SELECT * FROM chat_turns WHERE turn_id = ?',
      ).get(input.turnId) as Record<string, unknown>;
      return mapTurn(updated);
    }));
  }

  failTurn(input: {
    turnId: string;
    status: Extract<AgentChatTurnStatus, 'failed' | 'interrupted' | 'stopped'>;
    errorCode?: string;
    claim?: AgentChatExecutionClaim;
    completedAtMs?: number;
  }): AgentChatTurn {
    const completedAtMs = input.completedAtMs ?? Date.now();
    return this.withDb(db => this.transaction(db, () => {
      const existing = db.prepare(
        'SELECT * FROM chat_turns WHERE turn_id = ?',
      ).get(input.turnId) as Record<string, unknown> | undefined;
      if (!existing) throw new Error('AGENT_CHAT_TURN_NOT_FOUND');
      this.assertExecutionWithDb(db, input.turnId, input.claim);
      const turn = mapTurn(existing);
      if (turn.status === 'finalized') return turn;
      db.prepare(`
        UPDATE chat_turns
        SET status=?, error_code=?, completed_at_ms=?
        WHERE turn_id=?
      `).run(
        input.status,
        input.errorCode ? cleanText(input.errorCode, MAX_ERROR_CODE) : null,
        completedAtMs,
        input.turnId,
      );
      db.prepare(`
        UPDATE chat_conversations
        SET updated_at_ms=?
        WHERE conversation_id=?
      `).run(completedAtMs, turn.conversationId);
      const updated = db.prepare(
        'SELECT * FROM chat_turns WHERE turn_id = ?',
      ).get(input.turnId) as Record<string, unknown>;
      return mapTurn(updated);
    }));
  }

  setTitleFromPrompt(
    conversationId: string,
    prompt: string,
    updatedAtMs = Date.now(),
  ): void {
    const compact = cleanText(prompt.replace(/\s+/g, ' '), MAX_TITLE);
    if (!compact) return;
    this.withDb(db => {
      db.prepare(`
        UPDATE chat_conversations
        SET title = CASE WHEN title='New Chat' THEN ? ELSE title END,
            updated_at_ms = ?
        WHERE conversation_id = ?
      `).run(compact, updatedAtMs, conversationId);
    });
  }

  updatePreferredRoute(
    conversationId: string,
    providerId?: string,
    model?: string,
    updatedAtMs = Date.now(),
  ): void {
    this.withDb(db => {
      db.prepare(`
        UPDATE chat_conversations
        SET preferred_provider_id=COALESCE(?, preferred_provider_id),
            preferred_model=COALESCE(?, preferred_model),
            updated_at_ms=?
        WHERE conversation_id=?
      `).run(providerId ?? null, model ?? null, updatedAtMs, conversationId);
    });
  }

  archiveConversation(conversationId: string, updatedAtMs = Date.now()): void {
    this.withDb(db => {
      db.prepare(`
        UPDATE chat_conversations
        SET status='archived', updated_at_ms=?
        WHERE conversation_id=?
      `).run(updatedAtMs, conversationId);
    });
  }
  messagesForConversation(conversationId: string): AgentChatMessage[] {
    return this.withDb(db => {
      const rows = db.prepare(`
        SELECT m.*
        FROM chat_messages m
        JOIN chat_turns t ON t.turn_id=m.turn_id
        WHERE m.conversation_id=?
          AND (
            m.role='user'
            OR (m.role='assistant' AND t.status='finalized')
          )
        ORDER BY m.created_at_ms ASC, m.message_id ASC
      `).all(conversationId) as unknown as Record<string, unknown>[];
      return rows.map(mapMessage);
    });
  }

  boundedContextMessages(input: {
    conversationId: string;
    excludeTurnId?: string;
    maxMessages?: number;
    maxChars?: number;
  }): Array<{ role: AgentChatMessageRole; content: string }> {
    const maxMessages = Math.max(1, Math.min(48, input.maxMessages ?? 24));
    const maxChars = Math.max(1_000, Math.min(80_000, input.maxChars ?? 48_000));
    const messages = this.messagesForConversation(input.conversationId)
      .filter(message => !input.excludeTurnId || message.turnId !== input.excludeTurnId);
    const selected: AgentChatMessage[] = [];
    let chars = 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      if (selected.length >= maxMessages) break;
      const remaining = maxChars - chars;
      if (remaining <= 0) break;
      const content = message.content.slice(Math.max(0, message.content.length - remaining));
      selected.push({ ...message, content });
      chars += content.length;
    }
    return selected.reverse().map(message => ({
      role: message.role,
      content: message.content,
    }));
  }

  detail(conversationId: string): AgentChatConversationDetail | null {
    return this.withDb(db => {
      const conversation = this.getConversationWithDb(db, conversationId);
      if (!conversation) return null;
      const turns = (db.prepare(`
        SELECT * FROM chat_turns
        WHERE conversation_id=?
        ORDER BY created_at_ms ASC, turn_id ASC
      `).all(conversationId) as unknown as Record<string, unknown>[]).map(mapTurn);
      const messages = (db.prepare(`
        SELECT * FROM chat_messages
        WHERE conversation_id=?
        ORDER BY created_at_ms ASC, message_id ASC
      `).all(conversationId) as unknown as Record<string, unknown>[]).map(mapMessage);
      return { conversation, turns, messages };
    });
  }
  /** Backward-compatible view for legacy callers. New recovery keeps checkpointed turns resumable. */
  markRunningTurnsInterrupted(completedAtMs = Date.now()): AgentChatTurn[] {
    return this.recoverRunningTurns(completedAtMs).interrupted;
  }
}
