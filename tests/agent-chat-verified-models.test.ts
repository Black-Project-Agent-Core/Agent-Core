import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { AgentChatStore } from '../src/agent-chat-store.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('lists only provider models that finished a turn without an error', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'chat-verified-models-'));
  dirs.push(dir);
  const dbPath = path.join(dir, 'chat.sqlite');
  const store = new AgentChatStore(dbPath);
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO chat_conversations (conversation_id, runtime_session_id, workspace, title, status, created_at_ms, updated_at_ms)
    VALUES ('c1', 's1', 'w', 't', 'active', 1, 1)`).run();
  const rows: Array<[string, string | null, string | null, string | null, number | null]> = [
    ['finalized', 'gonka', 'minimax', null, 100],
    ['finalized', 'gonka', 'minimax', null, 300],
    ['finalized', 'anthropic', 'sonnet', null, 200],
    ['failed', 'atria', 'never-worked', 'AGENT_PROVIDER_FAILED', 400],
    ['finalized', 'atria', 'finished-with-error', 'SOME_ERROR', 500],
    ['stopped', 'atria', 'stopped-model', null, 600],
    ['finalized', null, null, null, 700],
  ];
  rows.forEach(([status, provider, model, error, completed], i) => {
    db.prepare(`INSERT INTO chat_turns (turn_id, conversation_id, client_request_id, runtime_task_id, status, provider_id, model, error_code, created_at_ms, started_at_ms, completed_at_ms)
      VALUES (?, 'c1', ?, ?, ?, ?, ?, ?, 1, 1, ?)`).run(`t${i}`, `r${i}`, `task${i}`, status, provider, model, error, completed);
  });
  db.close();

  expect(store.listVerifiedModels()).toEqual([
    { providerId: 'anthropic', model: 'sonnet', successfulTurns: 1, lastSuccessAtMs: 200 },
    { providerId: 'gonka', model: 'minimax', successfulTurns: 2, lastSuccessAtMs: 300 },
  ]);
});
