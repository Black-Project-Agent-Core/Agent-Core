import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentChatStore } from '../src/agent-chat-store.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'limit-report-')); roots.push(root);
  const store = new AgentChatStore(path.join(root, 'chat.sqlite'));
  store.createConversation({ conversationId: 'chat', runtimeSessionId: 'session', workspace: 'fixture', title: 'Report' });
  const begun = store.beginTurn({ conversationId: 'chat', turnId: 'turn', runtimeTaskId: 'task',
    clientRequestId: 'request', userMessageId: 'user', prompt: 'Investigate', messageOrigin: 'external-controller', startedAtMs: 100 });
  return { store, claim: begun.claim! };
}
it('atomically keeps one bounded failed report, origin and next-turn context after reopening', async () => {
  const { store, claim } = await fixture();
  const input = { turnId: 'turn', claim, status: 'failed' as const,
    errorCode: 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED', failureResponse: 'Observed: ' + 'x'.repeat(10_000), completedAtMs: 200 };
  store.failTurn(input); store.failTurn(input);
  const reopened = new AgentChatStore(store.dbPath), detail = reopened.detail('chat')!;
  expect(detail.turns[0]).toMatchObject({ status: 'failed', messageOrigin: 'external-controller' });
  expect(detail.messages.filter(message => message.role === 'assistant')).toHaveLength(1);
  const context = reopened.boundedContextMessages({ conversationId: 'chat' });
  expect(context[1]?.content).toContain('task remains failed');
  expect(context[1]!.content.length).toBeLessThanOrEqual(4000);
});
it.each(['stopped', 'interrupted', 'other-error'])('rejects a report for %s without a partial transaction', async mode => {
  const { store, claim } = await fixture();
  expect(() => store.failTurn({ turnId: 'turn', claim,
    status: mode === 'other-error' ? 'failed' : mode as 'stopped' | 'interrupted',
    errorCode: mode === 'other-error' ? 'OTHER_ERROR' : 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED', failureResponse: 'Report' }))
    .toThrow('AGENT_CHAT_FAILURE_REPORT_NOT_ALLOWED');
  expect(store.getTurn('turn')?.status).toBe('running');
  expect(store.detail('chat')?.messages).toHaveLength(1);
});
it('refuses a stale executor after cancellation without writing a report', async () => {
  const { store, claim } = await fixture(); store.cancelTurn('turn');
  expect(() => store.failTurn({ turnId: 'turn', claim, status: 'failed',
    errorCode: 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED', failureResponse: 'Late report' })).toThrow('AGENT_CHAT_EXECUTOR_STALE');
  expect(store.getTurn('turn')?.status).toBe('stopped');
  expect(store.detail('chat')?.messages).toHaveLength(1);
});
it('includes the incomplete label in the persisted 250-word budget', async () => {
  const { store, claim } = await fixture();
  store.failTurn({ turnId: 'turn', claim, status: 'failed',
    errorCode: 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED', failureResponse: 'observed '.repeat(500) });
  const report = store.detail('chat')!.messages.find(message => message.role === 'assistant')!.content;
  expect(report).toContain('task remains failed and unverified');
  expect(report.trim().split(/\s+/)).toHaveLength(250);
  expect(report.length).toBeLessThanOrEqual(4000);
  expect(store.getTurn('turn')?.status).toBe('failed');
});
