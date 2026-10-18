import { expect, it, vi } from 'vitest';
import { OwnedConversationReader } from '../src/rdc/browser-control/owned-conversation-reader.js';

const scope = { url: 'https://chatgpt.com/c/synthetic', document: 'document-a', order: 'order-a' };
const message = { key: 'source-a', role: 'assistant', version: 'full-tail-sha256', length: 16004, readable: true, identity: 'message-id' };
const coverage = { completeHistory: false, loadedMessages: 21, scanLimited: false };
const index = (extra: Record<string, any> = {}) => ({ kind: 'index', status: 'ready', ...scope,
  messages: [message], offset: 0, nextOffset: 20, coverage, ...extra });

it('issues local opaque refs and scope-bound continuation cursors from a bounded index', async () => {
  const evaluate = vi.fn().mockResolvedValueOnce(index()).mockResolvedValueOnce(index({ offset: 20, nextOffset: null, messages: [{ ...message, key: 'source-b' }] }));
  const reader = new OwnedConversationReader(evaluate);
  const first = await reader.read();
  expect(first.messages[0].messageRef).toMatch(/^msg:/);
  expect(first.messages[0].key).toBeUndefined();
  expect(first.nextCursor).toMatch(/^idx:/);
  expect(first.coverage.completeHistory).toBe(false);
  expect((await reader.read({ kind: 'index', cursor: first.nextCursor })).nextCursor).toBeNull();
  expect(evaluate.mock.calls.every(call => call[1] === true)).toBe(true);
});

it('rejects foreign refs and cursors before any document evaluation', async () => {
  const evaluate = vi.fn(); const reader = new OwnedConversationReader(evaluate);
  await expect(reader.read({ kind: 'message', messageRef: 'foreign' })).rejects.toThrow(/REF|INVALID/);
  await expect(reader.read({ kind: 'index', cursor: 'foreign' })).rejects.toThrow(/CURSOR|INVALID/);
  expect(evaluate).not.toHaveBeenCalled();
});

it('checks the whole-message version and document again before delivering a body chunk', async () => {
  const evaluate = vi.fn().mockResolvedValueOnce(index({ nextOffset: null }))
    .mockResolvedValueOnce({ kind: 'message', ...scope, ...message, version: 'changed-tail', offset: 12000, nextOffset: 16004, eof: true, text: 'tail' });
  const reader = new OwnedConversationReader(evaluate);
  const first = await reader.read();
  await expect(reader.read({ kind: 'message', messageRef: first.messages[0].messageRef, offset: 12000 })).rejects.toThrow(/STALE|CHANGED/);
});

it('returns bounded body chunks and refuses a changed branch on index continuation', async () => {
  const evaluate = vi.fn().mockResolvedValueOnce(index())
    .mockResolvedValueOnce({ kind: 'message', ...scope, ...message, offset: 16000, nextOffset: 16004, eof: true, text: 'tail' })
    .mockResolvedValueOnce(index({ order: 'branch-b', offset: 20, nextOffset: null }));
  const reader = new OwnedConversationReader(evaluate); const first = await reader.read();
  const body = await reader.read({ kind: 'message', messageRef: first.messages[0].messageRef, offset: 16000 });
  expect(body.text).toBe('tail'); expect(body.eof).toBe(true); expect(body.format).toBe('rendered-text');
  await expect(reader.read({ kind: 'index', cursor: first.nextCursor })).rejects.toThrow(/STALE|CHANGED/);
});

it('reports no-conversation without issuing refs and rejects oversized or malformed results', async () => {
  const evaluate = vi.fn().mockResolvedValueOnce({ kind: 'index', status: 'no-conversation', url: 'https://chatgpt.com/', messages: [], nextOffset: null, coverage: { completeHistory: false } })
    .mockResolvedValueOnce(index({ messages: Array.from({ length: 21 }, () => message) }));
  const reader = new OwnedConversationReader(evaluate);
  expect((await reader.read()).status).toBe('no-conversation');
  await expect(reader.read()).rejects.toThrow(/INVALID|BOUNDED/);
});

it('allows explicitly unassigned app-turn text without accepting invented or unsupported roles', async () => {
  const unknown = { ...message, role: 'unknown', identity: 'document-local', authority: 'unassigned-app-turn' };
  const evaluate = vi.fn().mockResolvedValueOnce(index({ messages: [unknown], nextOffset: null }))
    .mockResolvedValueOnce(index({ messages: [{ ...unknown, authority: 'guessed-assistant' }], nextOffset: null }))
    .mockResolvedValueOnce(index({ messages: [{ ...message, role: 'system' }], nextOffset: null }));
  const reader = new OwnedConversationReader(evaluate);
  const first = await reader.read();
  expect(first.messages[0].role).toBe('unknown'); expect(first.messages[0].authorKnown).toBe(false);
  expect(first.messages[0].messageRef).toMatch(/^msg:/);
  await expect(reader.read()).rejects.toThrow(/INVALID/);
  await expect(reader.read()).rejects.toThrow(/INVALID/);
});
