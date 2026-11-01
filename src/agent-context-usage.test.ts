import { describe, expect, it } from 'vitest';
import { contextTokensFromUsage, contextUsagePercent, estimateContextBreakdown, estimatePromptChars } from './agent-context-usage.js';

describe('contextTokensFromUsage', () => {
  it('uses the last call input as the full prompt and never adds cache tokens again', () => {
    expect(contextTokensFromUsage({ inputTokens: 135_000, cacheReadInputTokens: 100_000, cacheWriteInputTokens: 5_000,
      outputTokens: 900 } as any)).toBe(135_000);
  });
  it('is undefined when the provider reported no usable input count', () => {
    expect(contextTokensFromUsage(undefined)).toBeUndefined();
    expect(contextTokensFromUsage({})).toBeUndefined();
    expect(contextTokensFromUsage({ inputTokens: -1 })).toBeUndefined();
    expect(contextTokensFromUsage({ inputTokens: 1.5 })).toBeUndefined();
    expect(contextTokensFromUsage({ inputTokens: 0 })).toBe(0);
  });
});

describe('contextUsagePercent', () => {
  it('computes the share of a known window', () => {
    expect(contextUsagePercent(135_000, 1_000_000)).toBeCloseTo(13.5);
    expect(contextUsagePercent(700_000, 1_000_000)).toBeCloseTo(70);
  });
  it('is null (never a guessed window) when capacity is unknown or invalid', () => {
    expect(contextUsagePercent(135_000, undefined)).toBeNull();
    expect(contextUsagePercent(135_000, null)).toBeNull();
    expect(contextUsagePercent(135_000, 0)).toBeNull();
  });
});

describe('estimateContextBreakdown', () => {
  it('is all zeros for an empty prompt and undefined tools', () => {
    expect(estimateContextBreakdown([], undefined)).toEqual({ system: 0, tools: 0, conversation: 0, memory: 0 });
  });
  it('counts a lone system message as system only', () => {
    expect(estimateContextBreakdown([{ role: 'system', content: 'abcde' }] as any, [])).toEqual({ system: 2, tools: 0, conversation: 0, memory: 0 });
  });
  it('splits system / memory / conversation / tools with ceil(chars / 4)', () => {
    const messages = [
      { role: 'system', content: 'abcde' },                                            // 5 chars -> 2
      { role: 'system', content: 'x'.repeat(9) },                                      // index 1 system = memory, 9 -> 3
      { role: 'user', content: 'hello world' },                                        // 11
      { role: 'assistant', content: null, tool_calls: [{ id: 'a' }] },                 // '""' (2) + '[{"id":"a"}]' (12)
    ] as any;
    const tools = [{ name: 't' }];                                                     // '[{"name":"t"}]' = 14 -> 4
    expect(estimateContextBreakdown(messages, tools)).toEqual({ system: 2, memory: 3, conversation: 7, tools: 4 });
  });
  it('measures non-string content by its JSON length', () => {
    const content = [{ type: 'text', text: 'hi' }];
    const expected = Math.ceil(JSON.stringify(content).length / 4);
    expect(estimateContextBreakdown([{ role: 'user', content }] as any, undefined))
      .toEqual({ system: 0, tools: 0, conversation: expected, memory: 0 });
  });
  it('treats a later system message as conversation, not memory', () => {
    const out = estimateContextBreakdown([
      { role: 'system', content: 'ab' }, { role: 'user', content: 'cd' }, { role: 'system', content: 'efgh' },
    ] as any, undefined);
    expect(out).toEqual({ system: 1, tools: 0, conversation: 2, memory: 0 });
  });
  it('splits a skills tool message and other tool messages into their own categories', () => {
    const out = estimateContextBreakdown([
      { role: 'system', content: 'abcd' },
      { role: 'tool', name: 'skills', content: 'x'.repeat(8) },
      { role: 'tool', name: 'read_file', content: 'y'.repeat(4) },
    ] as any, undefined);
    expect(out).toEqual({ system: 1, tools: 0, conversation: 0, memory: 0, skills: 2, toolResults: 1 });
  });
  it('moves skillGuidanceChars out of system and into skills', () => {
    const out = estimateContextBreakdown([{ role: 'system', content: 'a'.repeat(20) }] as any, undefined, { skillGuidanceChars: 8 });
    expect(out).toEqual({ system: 3, tools: 0, conversation: 0, memory: 0, skills: 2 });
  });
  it('never lets system go negative when the guidance estimate exceeds it', () => {
    const out = estimateContextBreakdown([{ role: 'system', content: 'ab' }] as any, undefined, { skillGuidanceChars: 100 });
    expect(out).toEqual({ system: 0, tools: 0, conversation: 0, memory: 0, skills: 25 });
  });
  it('sizes an assistant message with anthropicContent by that JSON, not content+tool_calls', () => {
    const anthropicContent = [{ type: 'text', text: 'hi' }, { type: 'thinking', thinking: '', signature: 'sig' }];
    const expected = Math.ceil(JSON.stringify(anthropicContent).length / 4);
    const out = estimateContextBreakdown([
      { role: 'assistant', content: 'ignored', tool_calls: [{ id: 'a' }], anthropicContent } as any,
    ], undefined);
    expect(out).toEqual({ system: 0, tools: 0, conversation: expected, memory: 0 });
  });
});

describe('estimatePromptChars', () => {
  it('sums every message plus the serialized tools, ungrouped', () => {
    const messages = [{ role: 'system', content: 'abcd' }, { role: 'user', content: 'ef' }] as any;
    const tools = [{ name: 't' }];
    expect(estimatePromptChars(messages, tools)).toBe(4 + 2 + JSON.stringify(tools).length);
  });
  it('is zero for no messages and no tools', () => {
    expect(estimatePromptChars([], undefined)).toBe(0);
  });
});
