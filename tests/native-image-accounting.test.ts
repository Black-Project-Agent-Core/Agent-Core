import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountContext, completionCap, contextBytesBySource, IMAGE_TOKEN_ESTIMATE } from '../src/agent-context-accounting.js';
import { estimatePromptChars } from '../src/agent-context-usage.js';
import type { AgentModelImage, AgentModelMessage } from '../src/agent-provider.js';
import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';

// A picture counts as a fixed token estimate, never as its base64 text; AGENT_CORE_NATIVE_VISION=off keeps tool pictures from the model.
const BIG: AgentModelImage = { mediaType: 'image/png', dataBase64: 'A'.repeat(1_400_000) };
const TINY: AgentModelImage = { mediaType: 'image/png', dataBase64: 'A'.repeat(10) };
const user: AgentModelMessage = { role: 'user', content: 'look at it' };
const bare: AgentModelMessage = { role: 'tool', name: 'image_inspect', tool_call_id: 'call-1', content: 'ok' };
const toolWith = (...images: AgentModelImage[]): AgentModelMessage => ({ ...bare, images });

describe('picture accounting', () => {
  it('leaves a request without pictures byte-identical', () => {
    const messages = [user, bare];
    const accounting = accountContext(messages, []);
    expect(accounting.bytes).toBe(Buffer.byteLength(JSON.stringify({ messages, tools: [] })));
    expect(accounting.upperBoundTokens).toBe(accounting.bytes);
  });

  it('counts two pictures as a fixed estimate on top of the same text bytes', () => {
    const text = accountContext([user, bare], []);
    const pictured = accountContext([user, toolWith(BIG, BIG)], []);
    expect(pictured.bytes).toBe(text.bytes);
    expect(pictured.upperBoundTokens).toBe(text.upperBoundTokens + 2 * IMAGE_TOKEN_ESTIMATE);
    expect(pictured.estimatedTokens).toBe(text.estimatedTokens + 2 * IMAGE_TOKEN_ESTIMATE);
  });

  it('does not depend on the size of the picture', () => {
    expect(accountContext([user, toolWith(TINY)], [])).toEqual(accountContext([user, toolWith(BIG)], []));
  });

  it('adds the same fixed amount to the per-source split and to the prompt size estimate', () => {
    const extra = 2 * IMAGE_TOKEN_ESTIMATE * 4;
    const before = contextBytesBySource([user, bare], []);
    const after = contextBytesBySource([user, toolWith(BIG, BIG)], []);
    expect(after.tool).toBe(before.tool + extra);
    expect(after.user).toBe(before.user);
    expect(estimatePromptChars([user, toolWith(BIG, BIG)], [])).toBe(estimatePromptChars([user, bare], []) + extra);
  });

  it('caps the completion by the bound that includes the pictures', () => {
    const capacity = { contextWindowTokens: 10_000, maxOutputTokens: 8_192 };
    const accounting = accountContext([user, toolWith(BIG, BIG)], [], { maxOutputTokens: capacity.maxOutputTokens });
    const cap = completionCap(accounting, capacity);
    expect(cap).toBe(Math.min(capacity.maxOutputTokens, capacity.contextWindowTokens - accounting.upperBoundTokens));
    expect(cap).toBe(capacity.contextWindowTokens - accountContext([user, bare], []).bytes - 2 * IMAGE_TOKEN_ESTIMATE);
    expect(cap).toBeLessThan(capacity.maxOutputTokens);
  });
});

describe('AGENT_CORE_NATIVE_VISION', () => {
  const saved = process.env.AGENT_CORE_NATIVE_VISION;
  afterEach(() => {
    if (saved === undefined) delete process.env.AGENT_CORE_NATIVE_VISION;
    else process.env.AGENT_CORE_NATIVE_VISION = saved;
  });
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString('base64');
  const raw = { content: [{ type: 'text', text: 'meta' }, { type: 'image', data: PNG, mimeType: 'image/png' }] };

  // Same smallest harness as agent-tool-session.test.ts: a real session whose registry call is stubbed.
  async function callWithVision(value: string | undefined) {
    if (value === undefined) delete process.env.AGENT_CORE_NATIVE_VISION;
    else process.env.AGENT_CORE_NATIVE_VISION = value;
    const session = await AgentRuntimeToolSession.open('fixture-vision', ['get_config'],
      { nativeTaskId: 'fixture-native-task', nativeWorkspace: 'agent-core' });
    const dispatch = vi.spyOn((session as any).port.host, 'callTool').mockResolvedValue(raw);
    try {
      return await session.call('get_config', {});
    } finally {
      dispatch.mockRestore();
      await session.close();
    }
  }

  it('leaves the picture out and says so when switched off', async () => {
    const result = await callWithVision('OFF');
    expect(result.images).toBeUndefined();
    expect(result.text).toContain('picture viewing is switched off');
  });

  it('keeps the picture when the variable is not set', async () => {
    const result = await callWithVision(undefined);
    expect(result.images).toEqual([{ mediaType: 'image/png', dataBase64: PNG }]);
    expect(result.text).toBe('meta');
  });
});
