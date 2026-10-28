import { describe, expect, it } from 'vitest';
import { neutralizeUntrustedText, oneLineLabel } from '../src/security/untrusted-text.js';

describe('oneLineLabel removes what cannot be seen', () => {
  it.each([
    ['right-to-left override U+202E', 'safe‮txt.exe', 'safetxt.exe'],
    ['zero-width space U+200B', 'ig​nore', 'ignore'],
    ['soft hyphen U+00AD', 'ig­nore', 'ignore'],
    ['byte order mark U+FEFF', '﻿name', 'name'],
    ['bidi isolate U+2066', 'a⁦b⁩c', 'abc'],
    ['variation selector U+FE00', 'a︀b', 'ab'],
    ['supplementary variation selector', 'a\u{E0100}b', 'ab'],
    ['tag character U+E0041', 'a\u{E0041}b', 'ab'],
    ['blank letter U+3164', 'aㅤb', 'ab'],
    ['control characters', 'a\u0000b\u001Bc\u007F', 'abc'],
  ])('%s', (_name, input, expected) => {
    expect(oneLineLabel(input)).toBe(expected);
  });

  it('folds every kind of whitespace into single spaces and trims', () => {
    expect(oneLineLabel('  a \n\t b  c  ')).toBe('a b c');
  });

  it('limits a run of stacked combining marks', () => {
    const zalgo = 'e' + '́'.repeat(300);
    expect(Array.from(oneLineLabel(zalgo))).toHaveLength(4);
  });

  it('cuts by code point with a marker and never inside a surrogate pair', () => {
    const cutAfterEmoji = oneLineLabel('a'.repeat(9) + '😀' + 'tail', 10);
    expect(cutAfterEmoji).toBe('a'.repeat(9) + '😀 [+4 chars]');
    const cutBeforeEmoji = oneLineLabel('a'.repeat(9) + '😀' + 'tail', 9);
    expect(cutBeforeEmoji).toBe('a'.repeat(9) + ' [+5 chars]');
    expect(cutAfterEmoji.isWellFormed() && cutBeforeEmoji.isWellFormed()).toBe(true);
  });

  it('returns an empty string for anything that is not text', () => {
    expect(oneLineLabel(undefined)).toBe('');
    expect(oneLineLabel(42)).toBe('');
    expect(neutralizeUntrustedText(null)).toBe('');
  });
});

describe('joiners and emoji presentation stay where they carry meaning', () => {
  it('keeps the Persian half-space and the emoji joiner', () => {
    expect(oneLineLabel('می‌خواهم')).toBe('می‌خواهم');
    expect(oneLineLabel('👨‍👩‍👧')).toBe('👨‍👩‍👧');
  });

  it('keeps emoji presentation but drops a variation selector after a plain letter', () => {
    expect(oneLineLabel('❤️')).toBe('❤️');
    expect(oneLineLabel('a️')).toBe('a');
  });

  it('drops a joiner that only hides a Latin keyword', () => {
    expect(oneLineLabel('ig‌nore')).toBe('ignore');
    expect(oneLineLabel('ig‍nore')).toBe('ignore');
  });
});

describe('neutralizeUntrustedText keeps line structure', () => {
  it('keeps single and blank-line breaks but not longer runs', () => {
    expect(neutralizeUntrustedText('a\r\nb\n\n\n\n\nc \t d')).toBe('a\nb\n\nc d');
  });

  it('still removes invisible characters on every line', () => {
    expect(neutralizeUntrustedText('first​\nsecond‮')).toBe('first\nsecond');
  });
});
