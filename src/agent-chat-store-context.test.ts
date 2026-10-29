import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentChatStore } from './agent-chat-store.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'chat-context-'));
  dirs.push(dir);
  const dbPath = path.join(dir, 'chat.sqlite');
  const store = new AgentChatStore(dbPath);
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO chat_conversations (conversation_id, runtime_session_id, workspace, title, status, created_at_ms, updated_at_ms)
    VALUES ('c1', 's1', 'w', 't', 'active', 1, 1)`).run();
  db.prepare(`INSERT INTO chat_turns (turn_id, conversation_id, client_request_id, runtime_task_id, status, created_at_ms, started_at_ms)
    VALUES ('t1', 'c1', 'r1', 'task1', 'running', 1, 1)`).run();
  db.close();
  return { dbPath, store };
}

describe('chat turn context usage persistence', () => {
  it('migrates additive nullable columns and is idempotent on reopen', () => {
    const { dbPath } = fixture();
    new AgentChatStore(dbPath);
    const db = new DatabaseSync(dbPath);
    const columns = (db.prepare('PRAGMA table_info(chat_turns)').all() as Array<{ name: string; notnull: number }>)
      .filter(column => column.name.startsWith('context_'));
    db.close();
    expect(columns.map(column => column.name).sort()).toEqual(['context_breakdown', 'context_tokens', 'context_window']);
    expect(columns.every(column => column.notnull === 0)).toBe(true);
  });

  it('round-trips the last value and leaves legacy turns without data', () => {
    const { store } = fixture();
    expect(store.getTurn('t1')?.contextTokens).toBeUndefined();
    store.recordContextUsage('t1', 135_000, 1_000_000);
    expect(store.getTurn('t1')).toMatchObject({ contextTokens: 135_000, contextWindow: 1_000_000 });
    store.recordContextUsage('t1', 150_000, null);
    const turn = store.getTurn('t1')!;
    expect(turn.contextTokens).toBe(150_000);
    expect(turn.contextWindow).toBeUndefined();
  });

  it('adds a nullable max_iterations column and exposes live progress while the turn is still running', () => {
    const { dbPath, store } = fixture();
    const db = new DatabaseSync(dbPath);
    const column = (db.prepare('PRAGMA table_info(chat_turns)').all() as Array<{ name: string; notnull: number }>)
      .find(item => item.name === 'max_iterations');
    db.close();
    expect(column?.notnull).toBe(0);
    expect(store.getTurn('t1')).toMatchObject({ status: 'running' });
    expect(store.getTurn('t1')?.iterations).toBeUndefined();
    store.recordContextUsage('t1', 10_000, 100_000, { iteration: 2, maxIterations: 24 });
    store.recordContextUsage('t1', 12_000, 100_000, { iteration: 3, maxIterations: 24 });
    store.recordRecallCount('t1', 4);
    expect(store.getTurn('t1')).toMatchObject({ status: 'running', iterations: 3, maxIterations: 24, retrievalCount: 4, contextTokens: 12_000 });
  });

  it('never moves live progress backwards and ignores invalid progress', () => {
    const { store } = fixture();
    store.recordContextUsage('t1', 10, 100, { iteration: 5, maxIterations: 24 });
    store.recordContextUsage('t1', 10, 100, { iteration: 2, maxIterations: 24 });
    store.recordRecallCount('t1', 7);
    store.recordRecallCount('t1', 3);
    store.recordRecallCount('t1', -1);
    store.recordContextUsage('t1', 10, 100, { iteration: -1, maxIterations: 1.5 });
    expect(store.getTurn('t1')).toMatchObject({ iterations: 5, maxIterations: 24, retrievalCount: 7 });
  });

  it('ignores invalid values and unknown turns without throwing', () => {
    const { store } = fixture();
    store.recordContextUsage('t1', -5, 10);
    store.recordContextUsage('t1', 1.5, 10);
    store.recordContextUsage('missing', 10, 100);
    expect(store.getTurn('t1')?.contextTokens).toBeUndefined();
  });

  it('stores the estimated breakdown with the usage and omits it when none was given', () => {
    const { store } = fixture();
    const breakdown = { system: 1200, tools: 3400, conversation: 560, memory: 78 };
    store.recordContextUsage('t1', 5_238, 200_000, undefined, breakdown);
    expect(store.getTurn('t1')?.contextBreakdown).toEqual(breakdown);
    store.recordContextUsage('t1', 6_000, 200_000);
    expect(store.getTurn('t1')?.contextTokens).toBe(6_000);
    expect(store.getTurn('t1')).not.toHaveProperty('contextBreakdown');
  });

  it('rejects a breakdown with non-integer or negative parts', () => {
    const { store } = fixture();
    store.recordContextUsage('t1', 10, 100, undefined, { system: 1.5, tools: 0, conversation: 0, memory: 0 });
    store.recordContextUsage('t1', 10, 100, undefined, { system: 1, tools: -1, conversation: 0, memory: 0 });
    store.recordContextUsage('t1', 10, 100, undefined, { system: 1, tools: 0, conversation: 0 } as any);
    expect(store.getTurn('t1')?.contextTokens).toBe(10);
    expect(store.getTurn('t1')).not.toHaveProperty('contextBreakdown');
  });

  it('omits the breakdown without throwing when the stored JSON is broken or incomplete', () => {
    const { dbPath, store } = fixture();
    const db = new DatabaseSync(dbPath);
    db.prepare(`UPDATE chat_turns SET context_breakdown = '{not json' WHERE turn_id = 't1'`).run();
    expect(() => store.getTurn('t1')).not.toThrow();
    expect(store.getTurn('t1')).not.toHaveProperty('contextBreakdown');
    db.prepare(`UPDATE chat_turns SET context_breakdown = '{"system":1,"tools":"2","conversation":3,"memory":4}' WHERE turn_id = 't1'`).run();
    expect(store.getTurn('t1')).not.toHaveProperty('contextBreakdown');
    db.close();
  });
});
