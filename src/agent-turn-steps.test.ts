import { describe, expect, it } from 'vitest';
import { boundedMaskedText, toolInputText, toolOutputText } from './agent-turn-events.js';

describe('boundedMaskedText', () => {
  it('returns short text unchanged and not truncated', () => {
    expect(boundedMaskedText('hello\nworld')).toEqual({ text: 'hello\nworld', truncated: false });
  });

  it('handles empty and non-string input', () => {
    expect(boundedMaskedText('')).toEqual({ text: '', truncated: false });
    expect(boundedMaskedText(undefined as unknown as string)).toEqual({ text: '', truncated: false });
  });

  it('keeps exactly the limit untruncated and flags one char more', () => {
    expect(boundedMaskedText('a'.repeat(16384))).toEqual({ text: 'a'.repeat(16384), truncated: false });
    const over = boundedMaskedText('a'.repeat(16385));
    expect(over.truncated).toBe(true);
    expect(over.text).toBe('a'.repeat(16384));
  });

  it('honours a custom limit and preserves line breaks', () => {
    const result = boundedMaskedText('line1\nline2\nline3', 8);
    expect(result).toEqual({ text: 'line1\nli', truncated: true });
  });

  it('masks secrets: assignments, quoted JSON keys, Bearer and sk- tokens', () => {
    const raw = [
      'password=hunter2',
      '{"apiKey": "abc123secret", "name": "ok"}',
      'Authorization: Bearer abcdef123456',
      'token sk-ABCDEFGHIJKLMNOP end',
    ].join('\n');
    const { text } = boundedMaskedText(raw);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('abc123secret');
    expect(text).not.toContain('abcdef123456');
    expect(text).not.toContain('ABCDEFGHIJKLMNOP');
    expect(text).toContain('"name": "ok"');
  });

  it('masks before truncating so a secret cut by the limit never leaks', () => {
    const { text, truncated } = boundedMaskedText('x'.repeat(10) + ' password=supersecretvalue', 20);
    expect(truncated).toBe(true);
    expect(text).not.toContain('supersecret');
  });
});

describe('toolInputText / toolOutputText', () => {
  it('pretty-prints parsed args and masks secret-keyed values', () => {
    const result = toolInputText({ command: 'ls -la', apiToken: 'tok-123456789' }, '{"command":"ls -la"}');
    expect(result.inputText).toContain('"command": "ls -la"');
    expect(result.inputText).not.toContain('tok-123456789');
    expect(result.inputTruncated).toBe(false);
  });

  it('falls back to the raw argument string when parsed args are empty', () => {
    expect(toolInputText({}, 'not json at all')).toEqual({ inputText: 'not json at all', inputTruncated: false });
    expect(toolInputText(undefined, '')).toEqual({ inputText: '', inputTruncated: false });
  });

  it('flags truncation of oversize input and output', () => {
    expect(toolInputText({ blob: 'z'.repeat(20000) }, '').inputTruncated).toBe(true);
    const out = toolOutputText('y'.repeat(20000));
    expect(out.outputTruncated).toBe(true);
    expect(out.outputText.length).toBe(16384);
    expect(toolOutputText(undefined)).toEqual({ outputText: '', outputTruncated: false });
  });
});
