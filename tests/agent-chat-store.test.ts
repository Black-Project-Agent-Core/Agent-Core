import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentChatStore } from '../src/agent-chat-store.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-chat-store-'));
  roots.push(root);
  return path.join(root, 'chat.sqlite');
}

function createConversation(store: AgentChatStore, id = 'conversation-1') {
  return store.createConversation({
    conversationId: id,
    runtimeSessionId: 'session-' + id,
    workspace: 'agent-core',
    title: 'New Chat',
    createdAtMs: 1_000,
  });
}
describe('AgentChatStore', () => {
  it('persists a conversation and committed transcript across reconstruction', async () => {
    const dbPath = await fixture();
    const store = new AgentChatStore(dbPath);
    createConversation(store);
    const begun = store.beginTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      clientRequestId: 'request-1',
      runtimeTaskId: 'task-1',
      userMessageId: 'message-user-1',
      prompt: 'Remember this turn.',
      startedAtMs: 2_000,
    });
    expect(begun.created).toBe(true);
    store.finalizeTurn({
      turnId: 'turn-1',
      assistantMessageId: 'message-assistant-1',
      response: 'Turn completed.',
      providerId: 'atria',
      model: 'fixture-model',
      iterations: 2,
      retrievalCount: 1,
      completedAtMs: 3_000,
    });

    const reopened = new AgentChatStore(dbPath);
    const detail = reopened.detail('conversation-1');
    expect(detail?.conversation).toEqual(expect.objectContaining({
      id: 'conversation-1',
      runtimeSessionId: 'session-conversation-1',
      preferredProviderId: 'atria',
      preferredModel: 'fixture-model',
    }));
    expect(detail?.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'Remember this turn.'],
      ['assistant', 'Turn completed.'],
    ]);
  });
  it('makes clientRequestId idempotent and enforces one running turn', async () => {
    const dbPath = await fixture();
    const store = new AgentChatStore(dbPath);
    createConversation(store);
    const input = {
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      clientRequestId: 'request-1',
      runtimeTaskId: 'task-1',
      userMessageId: 'message-user-1',
      prompt: 'Do this once.',
      startedAtMs: 2_000,
    };
    expect(store.beginTurn(input).created).toBe(true);
    const replay = store.beginTurn({
      ...input,
      turnId: 'turn-retry',
      runtimeTaskId: 'task-retry',
      userMessageId: 'message-retry',
    });
    expect(replay.created).toBe(false);
    expect(replay.turn.id).toBe('turn-1');

    expect(() => store.beginTurn({
      ...input,
      turnId: 'turn-2',
      clientRequestId: 'request-2',
      runtimeTaskId: 'task-2',
      userMessageId: 'message-user-2',
    })).toThrow('AGENT_CHAT_CONVERSATION_BUSY');
  });

  it('builds bounded prior-turn context without the current turn', async () => {
    const dbPath = await fixture();
    const store = new AgentChatStore(dbPath);
    createConversation(store);
    for (let index = 1; index <= 3; index += 1) {
      store.beginTurn({
        conversationId: 'conversation-1',
        turnId: 'turn-' + index,
        clientRequestId: 'request-' + index,
        runtimeTaskId: 'task-' + index,
        userMessageId: 'user-' + index,
        prompt: 'user turn ' + index,
        startedAtMs: 1_000 + index * 10,
      });
      store.finalizeTurn({
        turnId: 'turn-' + index,
        assistantMessageId: 'assistant-' + index,
        response: 'assistant turn ' + index,
        iterations: 1,
        retrievalCount: 0,
        completedAtMs: 1_005 + index * 10,
      });
    }
    const history = store.boundedContextMessages({
      conversationId: 'conversation-1',
      excludeTurnId: 'turn-3',
      maxMessages: 3,
      maxChars: 10_000,
    });
    expect(history).toEqual([
      { role: 'assistant', content: 'assistant turn 1' },
      { role: 'user', content: 'user turn 2' },
      { role: 'assistant', content: 'assistant turn 2' },
    ]);
    expect(JSON.stringify(history)).not.toContain('turn 3');
  });
  it('keeps bounded context isolated between conversations', async () => {
    const dbPath = await fixture();
    const store = new AgentChatStore(dbPath);
    createConversation(store, 'conversation-a');
    createConversation(store, 'conversation-b');

    for (const [conversationId, label] of [
      ['conversation-a', 'alpha'],
      ['conversation-b', 'beta'],
    ] as const) {
      store.beginTurn({
        conversationId,
        turnId: 'turn-' + label,
        clientRequestId: 'request-' + label,
        runtimeTaskId: 'task-' + label,
        userMessageId: 'user-' + label,
        prompt: label + ' user fact',
        startedAtMs: 2_000,
      });
      store.finalizeTurn({
        turnId: 'turn-' + label,
        assistantMessageId: 'assistant-' + label,
        response: label + ' assistant fact',
        iterations: 1,
        retrievalCount: 0,
        completedAtMs: 2_100,
      });
    }

    const alpha = store.boundedContextMessages({
      conversationId: 'conversation-a',
    });
    expect(JSON.stringify(alpha)).toContain('alpha');
    expect(JSON.stringify(alpha)).not.toContain('beta');
  });

  it('marks previously running turns interrupted on reconstruction recovery', async () => {
    const dbPath = await fixture();
    const store = new AgentChatStore(dbPath);
    createConversation(store);
    store.beginTurn({
      conversationId: 'conversation-1',
      turnId: 'turn-running',
      clientRequestId: 'request-running',
      runtimeTaskId: 'task-running',
      userMessageId: 'user-running',
      prompt: 'This was interrupted.',
      startedAtMs: 4_000,
    });

    const reopened = new AgentChatStore(dbPath);
    const interrupted = reopened.markRunningTurnsInterrupted(5_000);
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0]).toEqual(expect.objectContaining({
      id: 'turn-running',
      status: 'interrupted',
      errorCode: 'AGENT_CHAT_TURN_INTERRUPTED',
      completedAtMs: 5_000,
    }));
    expect(reopened.getTurn('turn-running')?.status).toBe('interrupted');
  });
});
