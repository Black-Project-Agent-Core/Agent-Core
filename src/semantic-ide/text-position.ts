import type { LspPosition, LspRange } from './types.js';

/** Native UTF-16 mapping; newline discipline adapted from MIT SolidLSP TextStepper.
 * Original mechanism: Copyright (c) 2025 Oraios AI. See THIRD_PARTY_NOTICES.md. */
export function isTextPosition(value: unknown): value is LspPosition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const p = value as LspPosition;
  return Number.isSafeInteger(p.line) && p.line >= 0 && Number.isSafeInteger(p.character) && p.character >= 0;
}

export interface PositionPolicy { allowEndOfFileLine: boolean }
export function offsetForPosition(text: string, position: LspPosition, policy: PositionPolicy): number {
  if (!isTextPosition(position)) throw new Error('SEMANTIC_TEXT_POSITION_INVALID');
  let line = 0;
  let start = 0;
  for (;;) {
    let end = start;
    while (end < text.length && text[end] !== '\r' && text[end] !== '\n') end += 1;
    if (line === position.line) {
      if (position.character > end - start) throw new Error('SEMANTIC_TEXT_POSITION_OUT_OF_RANGE');
      return start + position.character;
    }
    if (end === text.length) {
      if (policy.allowEndOfFileLine && position.line === line + 1 && position.character === 0) return text.length;
      throw new Error('SEMANTIC_TEXT_POSITION_OUT_OF_RANGE');
    }
    start = end + (text[end] === '\r' && text[end + 1] === '\n' ? 2 : 1);
    line += 1;
  }
}

export function validateTextRange(text: string, range: LspRange, policy: PositionPolicy): { start: number; end: number } {
  const start = offsetForPosition(text, range.start, policy);
  const end = offsetForPosition(text, range.end, policy);
  if (end < start) throw new Error('SEMANTIC_TEXT_RANGE_INVALID');
  return { start, end };
}

export function preferredLineEnding(text: string): string {
  return /\r\n|\r|\n/.exec(text)?.[0] ?? '\n';
}
