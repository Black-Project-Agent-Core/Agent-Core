import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentChatStore } from './agent-chat-store.js';
import type { AgentTurnEvent } from './agent-turn-events.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture(turnCount = 1) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'chat-steps-'));
  dirs.push(dir);
  const dbPath = path.join(dir, 'chat.sqlite');
  const store = new AgentChatStore(dbPath);
  const db = new DatabaseSync(dbPath);
  db.prepare(`INSERT INTO chat_conversations (conversation_id, runtime_session_id, workspace, title, status, created_at_ms, updated_at_ms)
    VALUES ('c1', 's1', 'w', 't', 'active', 1, 1)`).run();
  for (let i = 1; i <= turnCount; i++) {
    db.prepare(`INSERT INTO chat_turns (turn_id, conversation_id, client_request_id, runtime_task_id, status, created_at_ms, started_at_ms)
      VALUES (?, 'c1', ?, ?, 'running', ?, ?)`).run('t' + i, 'r' + i, 'task' + i, i, i);
  }
  db.close();
  return { dbPath, store };
}

const started = (toolName: string, atMs: number, extra: Partial<AgentTurnEvent> = {}): AgentTurnEvent => ({
  type: 'tool.started', at: new Date(atMs).toISOString(), toolName, iteration: 1, maxIterations: 24,
  argsSummary: 'a=1', inputText: '{\n  "a": 1\n}', inputTruncated: false, ...extra,
});
const completed = (toolName: string, atMs: number, extra: Partial<AgentTurnEvent> = {}): AgentTurnEvent => ({
  type: 'tool.completed', at: new Date(atMs).toISOString(), toolName, success: true, iteration: 1, maxIterations: 24,
  durationMs: 42, argsSummary: 'a=1', resultSummary: '3 matches', outputText: 'full output', outputTruncated: false, ...extra,
});

describe('chat_turn_steps persistence', () => {
  it('records start then completion with ordered metadata and full text on demand', () => {
    const { store } = fixture();
    const now = Date.now();
    store.startStep('t1', started('start_search', now));
    store.startStep('t1', started('read_file', now + 1, { iteration: 2 }));
    expect(store.listStepMeta('t1', 200).map(step => [step.seq, step.toolName, step.status])).toEqual([
      [1, 'start_search', 'running'], [2, 'read_file', 'running'],
    ]);
    expect(store.completeStep('t1', completed('start_search', now + 50))).toBe(true);
    expect(store.completeStep('t1', completed('read_file', now + 60, { success: false, resultSummary: 'error: x', outputText: 'boom', outputTruncated: true }))).toBe(true);
    const meta = store.listStepMeta('t1', 200);
    expect(meta[0]).toMatchObject({ turnId: 't1', seq: 1, iteration: 1, toolName: 'start_search', status: 'ok', durationMs: 42, argsSummary: 'a=1', resultSummary: '3 matches' });
    expect(meta[1]).toMatchObject({ seq: 2, iteration: 2, status: 'error', resultSummary: 'error: x' });
    expect(meta[0]).not.toHaveProperty('inputText');
    expect(meta[0]).not.toHaveProperty('outputText');
    expect(store.getStepDetail('t1', 1)).toEqual({ inputText: '{\n  "a": 1\n}', outputText: 'full output', inputTruncated: false, outputTruncated: false });
    expect(store.getStepDetail('t1', 2)).toMatchObject({ outputText: 'boom', outputTruncated: true });
    expect(store.getStepDetail('t1', 99)).toBeNull();
    expect(store.getStepDetail('nope', 1)).toBeNull();
  });

  it('matches the latest running step with the same tool name and reports no match otherwise', () => {
    const { store } = fixture();
    const now = Date.now();
    store.startStep('t1', started('read_file', now));
    store.startStep('t1', started('read_file', now + 1));
    expect(store.completeStep('t1', completed('read_file', now + 5))).toBe(true);
    expect(store.listStepMeta('t1', 200).map(step => step.status)).toEqual(['running', 'ok']);
    expect(store.completeStep('t1', completed('write_file', now + 6))).toBe(false);
  });

  it('exposes steps in detail() as metadata only, capped per turn and to the 10 newest turns', () => {
    const { dbPath, store } = fixture(12);
    const now = Date.now();
    const db = new DatabaseSync(dbPath);
    db.exec('BEGIN');
    const insert = db.prepare(`INSERT INTO chat_turn_steps (turn_id, seq, tool_name, status, started_at_ms, input_text)
      VALUES ('t12', ?, 'read_file', 'ok', ?, 'SECRET-BODY-INPUT')`);
    for (let i = 1; i <= 250; i++) insert.run(i, now + i);
    db.exec('COMMIT');
    db.close();
    store.startStep('t1', started('read_file', now));
    store.startStep('t3', started('read_file', now));
    const detail = store.detail('c1')!;
    const steps = detail.steps!;
    expect(steps.filter(step => step.turnId === 't12')).toHaveLength(200);
    expect(steps.some(step => step.turnId === 't1')).toBe(false);
    expect(steps.some(step => step.turnId === 't3')).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('SECRET-BODY-INPUT');
  });

  it('returns an empty steps array when a turn has no steps', () => {
    const { store } = fixture();
    expect(store.detail('c1')!.steps).toEqual([]);
  });

  it('prunes steps older than the retention age and keeps recent ones', () => {
    const { store } = fixture();
    const day = 86_400_000;
    const now = Date.now();
    store.startStep('t1', started('old_tool', now - 31 * day));
    store.startStep('t1', started('new_tool', now - 1 * day));
    expect(store.pruneStepsOlderThan(30 * day, now)).toBe(1);
    expect(store.listStepMeta('t1', 200).map(step => step.toolName)).toEqual(['new_tool']);
  });

  it('prunes once when the store is opened (30 day retention)', () => {
    const { dbPath, store } = fixture();
    store.startStep('t1', started('old_tool', Date.now() - 40 * 86_400_000));
    store.startStep('t1', started('new_tool', Date.now()));
    const reopened = new AgentChatStore(dbPath);
    expect(reopened.listStepMeta('t1', 200).map(step => step.toolName)).toEqual(['new_tool']);
  });

  it('cascades when the turn is deleted', () => {
    const { dbPath, store } = fixture();
    store.startStep('t1', started('read_file', Date.now()));
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys=ON');
    db.prepare("DELETE FROM chat_turns WHERE turn_id='t1'").run();
    db.close();
    expect(store.listStepMeta('t1', 200)).toEqual([]);
  });
});

const narration = (text: unknown, atMs: number, iteration = 1): AgentTurnEvent => ({
  type: 'assistant.progress', at: new Date(atMs).toISOString(), iteration, maxIterations: 24, text,
} as AgentTurnEvent);

describe('assistant narration persisted as ordered note steps (WP-B3a)', () => {
  it('interleaves narration and tool steps in original order with kind note on narration rows', () => {
    const { store } = fixture();
    const now = Date.now();
    store.recordNarration('t1', narration('Saya akan membaca berkas.', now, 1));
    store.startStep('t1', started('read_file', now + 1));
    expect(store.completeStep('t1', completed('read_file', now + 2))).toBe(true);
    store.recordNarration('t1', narration('Berkas sudah dibaca.', now + 3, 2));
    const meta = store.listStepMeta('t1', 200);
    expect(meta.map(step => step.seq)).toEqual([1, 2, 3]);
    expect(meta[0]).toMatchObject({ seq: 1, kind: 'note', toolName: '', status: 'ok', iteration: 1, startedAtMs: now, resultSummary: 'Saya akan membaca berkas.' });
    expect(meta[1]).toMatchObject({ seq: 2, toolName: 'read_file', status: 'ok' });
    expect(meta[1]).not.toHaveProperty('kind');
    expect(meta[2]).toMatchObject({ seq: 3, kind: 'note', toolName: '', status: 'ok', iteration: 2, resultSummary: 'Berkas sudah dibaca.' });
    expect(store.getStepDetail('t1', 1)).toEqual({ inputText: '', outputText: '', inputTruncated: false, outputTruncated: false });
  });

  it('completeStep never touches narration rows and still completes the right running tool step', () => {
    const { store } = fixture();
    const now = Date.now();
    store.startStep('t1', started('read_file', now));
    store.recordNarration('t1', narration('Lanjut.', now + 1));
    expect(store.completeStep('t1', completed('', now + 2, { resultSummary: 'HIJACK' }))).toBe(false);
    expect(store.completeStep('t1', completed('read_file', now + 3))).toBe(true);
    const meta = store.listStepMeta('t1', 200);
    expect(meta[0]).toMatchObject({ seq: 1, toolName: 'read_file', status: 'ok', resultSummary: '3 matches' });
    expect(meta[1]).toMatchObject({ seq: 2, kind: 'note', status: 'ok', resultSummary: 'Lanjut.' });
    expect(meta[1]).not.toHaveProperty('durationMs');
  });

  it('writes nothing for empty, whitespace-only or non-string text', () => {
    const { store } = fixture();
    const now = Date.now();
    store.recordNarration('t1', narration('', now));
    store.recordNarration('t1', narration('   \n\t ', now + 1));
    store.recordNarration('t1', narration(undefined, now + 2));
    store.recordNarration('t1', narration(42, now + 3));
    expect(store.listStepMeta('t1', 200)).toEqual([]);
  });

  it('includes narration rows in detail().steps', () => {
    const { store } = fixture();
    const now = Date.now();
    store.recordNarration('t1', narration('Catatan untuk UI.', now));
    store.startStep('t1', started('read_file', now + 1));
    const steps = store.detail('c1')!.steps!;
    expect(steps.map(step => [step.seq, step.kind ?? null, step.toolName])).toEqual([[1, 'note', ''], [2, null, 'read_file']]);
    expect(steps[0].resultSummary).toBe('Catatan untuk UI.');
  });
});
