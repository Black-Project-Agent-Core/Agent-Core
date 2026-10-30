import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSlashSelection } from '../src/agent-slash-commands.js';
import { AgentChatStore } from '../src/agent-chat-store.js';
import { AgentChatService, userSelectedSkillDirective } from '../src/agent-chat-service.js';

const ACTIVE = ['code-review', 'Mind-Control', 'test-driven-development'];

describe('parseSlashSelection', () => {
  it('matches an active Skill with no rest text', () => {
    expect(parseSlashSelection('/code-review', ACTIVE)).toEqual({ skill: 'code-review', rest: '' });
  });
  it('matches case-insensitively and returns the exact catalog name', () => {
    expect(parseSlashSelection('/MIND-control', ACTIVE)).toEqual({ skill: 'Mind-Control', rest: '' });
    expect(parseSlashSelection('/CODE-REVIEW please', ACTIVE)?.skill).toBe('code-review');
  });
  it('returns the trimmed rest text after whitespace', () => {
    expect(parseSlashSelection('/code-review   review src/app.ts \n', ACTIVE))
      .toEqual({ skill: 'code-review', rest: 'review src/app.ts' });
    expect(parseSlashSelection('  /code-review\tfix it', ACTIVE)?.rest).toBe('fix it');
  });
  it('returns null for unknown names', () => {
    expect(parseSlashSelection('/nope', ACTIVE)).toBeNull();
    expect(parseSlashSelection('/code-reviews', ACTIVE)).toBeNull();
    expect(parseSlashSelection('/code-review', [])).toBeNull();
  });
  it('returns null for compact, which is UI-only', () => {
    expect(parseSlashSelection('/compact', [...ACTIVE, 'compact'])).toBeNull();
    expect(parseSlashSelection('/Compact now', ACTIVE)).toBeNull();
  });
  it('returns null for paths, an empty slash and non-slash prompts', () => {
    expect(parseSlashSelection('/usr/bin', [...ACTIVE, 'usr'])).toBeNull();
    expect(parseSlashSelection('/code-review/extra', ACTIVE)).toBeNull();
    expect(parseSlashSelection('/', ACTIVE)).toBeNull();
    expect(parseSlashSelection('/ code-review', ACTIVE)).toBeNull();
    expect(parseSlashSelection('', ACTIVE)).toBeNull();
    expect(parseSlashSelection('code-review', ACTIVE)).toBeNull();
    expect(parseSlashSelection('/-bad', ['-bad'])).toBeNull();
  });
});

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function chatFixture(catalog: { list: () => Promise<Array<{ name: string }>> } | undefined) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-slash-commands-'));
  roots.push(root);
  await mkdir(path.join(root, 'runtime', 'agent-runtime'), { recursive: true });
  const store = new AgentChatStore(path.join(root, 'runtime', 'agent-runtime', 'chat.sqlite'));
  store.createConversation({ conversationId: 'chat', runtimeSessionId: 'session', workspace: 'fixture', title: 'Slash fixture' });
  const runtime = { ensureActiveSession: vi.fn(), setProviderAffinity: vi.fn(),
    getTask: vi.fn(async () => ({ id: 'fixture-task', status: 'running' })),
    markTerminal: vi.fn(async () => undefined), finalizeTask: vi.fn(async () => undefined) };
  const controller = { runConversationTurn: vi.fn(async (input: any) => ({ sessionId: input.sessionId,
    taskId: input.taskId, response: 'ok', status: 'finalized', iterations: 1, retrievalAttemptIds: [] })) };
  const chat = new (AgentChatService as any)(store, runtime, controller, root, undefined, catalog) as AgentChatService;
  return { store, controller, chat };
}

describe('AgentChatService slash Skill directive', () => {
  it('adds the per-turn directive for a chosen active Skill and keeps the user message verbatim', async () => {
    const list = vi.fn(async () => [{ name: 'code-review' }, { name: 'mind-control' }]);
    const f = await chatFixture({ list });
    const prompt = '/Code-Review  look at src/app.ts';
    await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'slash-1', prompt });
    const input = f.controller.runConversationTurn.mock.calls[0]![0];
    expect(input.prompt).toBe(prompt);
    expect(input.userSelectedSkillDirective).toBe(userSelectedSkillDirective('code-review'));
    expect(input.userSelectedSkillDirective).toContain('USER-SELECTED SKILL: the user explicitly chose the Skill code-review');
    expect(f.store.detail('chat')!.messages.find(message => message.role === 'user')?.content).toBe(prompt);
    expect(list).toHaveBeenCalledTimes(1);
  });
  it('adds no directive for unknown names, compact, plain prompts or a failing catalog', async () => {
    const f = await chatFixture({ list: async () => [{ name: 'code-review' }] });
    for (const [id, prompt] of [['u', '/unknown task'], ['c', '/compact'], ['p', 'review this']] as const) {
      await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'slash-' + id, prompt });
    }
    const broken = await chatFixture({ list: async () => { throw new Error('SKILL_CATALOG_UNAVAILABLE'); } });
    const result = await broken.chat.runTurn({ conversationId: 'chat', clientRequestId: 'slash-broken', prompt: '/code-review go' });
    expect(result.status).toBe('finalized');
    for (const call of [...f.controller.runConversationTurn.mock.calls, ...broken.controller.runConversationTurn.mock.calls]) {
      expect(call[0]).not.toHaveProperty('userSelectedSkillDirective');
    }
  });
});
