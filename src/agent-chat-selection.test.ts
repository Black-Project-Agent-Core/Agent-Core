import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentChatStore } from './agent-chat-store.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function dbFile() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'chat-selection-'));
  dirs.push(dir);
  return path.join(dir, 'chat.sqlite');
}

describe('durable last chat selection (provider, model, effort)', () => {
  it('is absent until a selection is recorded', () => {
    expect(new AgentChatStore(dbFile()).getLastSelection()).toBeUndefined();
  });

  it('survives a store reopen (simulated restart) with identical values', () => {
    const file = dbFile();
    new AgentChatStore(file).recordLastSelection({ providerId: 'anthropic', model: 'claude-x', reasoningEffort: 'high' }, 1000);
    expect(new AgentChatStore(file).getLastSelection())
      .toEqual({ providerId: 'anthropic', model: 'claude-x', reasoningEffort: 'high', updatedAtMs: 1000 });
  });

  it('records a concrete provider without model/effort as empty model and Auto effort', () => {
    const store = new AgentChatStore(dbFile());
    store.recordLastSelection({ providerId: 'atria' }, 5);
    expect(store.getLastSelection()).toEqual({ providerId: 'atria', model: '', reasoningEffort: 'auto', updatedAtMs: 5 });
  });

  it('automatic rotation keeps the previously chosen model and effort instead of erasing them', () => {
    const store = new AgentChatStore(dbFile());
    store.recordLastSelection({ providerId: 'anthropic', model: 'claude-x', reasoningEffort: 'low' }, 1);
    store.recordLastSelection({}, 2);
    expect(store.getLastSelection()).toEqual({ providerId: 'auto', model: 'claude-x', reasoningEffort: 'low', updatedAtMs: 2 });
  });

  it('treats a corrupt stored value as absent rather than inventing a selection', () => {
    const file = dbFile();
    new AgentChatStore(file);
    const db = new DatabaseSync(file);
    db.prepare("INSERT OR REPLACE INTO chat_meta(key,value) VALUES ('last_selection','{broken')").run();
    db.close();
    expect(new AgentChatStore(file).getLastSelection()).toBeUndefined();
  });
});
