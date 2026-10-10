import { memorySemanticRevision } from './disclosure.js';
import { tokenizeMemoryText } from './semantic-document.js';
import type { SourceRef } from './experience-types.js';
import type { MemoryRecord } from './types.js';

/** Half-open offsets into Array.from(record.content), without normalization. */
export interface ContentSpan {
  field: 'content'; unit: 'unicode-codepoint'; start: number; end: number;
}
export interface MemoryExcerpt {
  text: string; source: SourceRef; span: ContentSpan;
  selection: 'query-match' | 'head-fallback'; selectorVersion: 1;
}

/** Deterministic disclosure only: never changes retrieval, trust or applicability. */
export function selectMemoryExcerpt(record: MemoryRecord, query: string, maxCodePoints = 240): MemoryExcerpt {
  if (!Number.isInteger(maxCodePoints) || maxCodePoints < 1 || maxCodePoints > 240) throw new RangeError('maxCodePoints must be an integer from 1 to 240');
  const points = Array.from(record.content);
  const length = Math.min(maxCodePoints, points.length);
  const tokens = [...new Set(tokenizeMemoryText(query))];
  // Regex indices belong to the original string. Lowercasing the whole content
  // would move offsets after characters such as İ (whose lowercase expands).
  const offset = new Map<number, number>();
  let utf16 = 0;
  points.forEach((point, index) => { offset.set(utf16, index); utf16 += point.length; });
  offset.set(utf16, points.length);
  const matchers = tokens.map(token => new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu'));
  const starts = new Set<number>();
  for (const matcher of matchers) {
    for (const match of record.content.matchAll(matcher)) {
      const at = offset.get(match.index)!;
      starts.add(Math.min(Math.max(0, at - Math.min(80, maxCodePoints - 1)), points.length - length));
    }
  }
  let start = 0, best = -1;
  for (const candidate of [...starts].sort((a, b) => a - b)) {
    const text = points.slice(candidate, candidate + length).join('');
    const score = matchers.reduce((count, matcher) => { matcher.lastIndex = 0; return count + Number(matcher.test(text)); }, 0);
    if (score > best) { best = score; start = candidate; }
  }
  const end = start + length;
  return { text: points.slice(start, end).join(''), source: { kind: 'memory', id: record.id, revision: memorySemanticRevision(record) },
    span: { field: 'content', unit: 'unicode-codepoint', start, end },
    selection: starts.size ? 'query-match' : 'head-fallback', selectorVersion: 1 };
}

/** Proves exact source text/revision. A valid quote does not prove its claims. */
export function verifyMemoryExcerpt(record: MemoryRecord, excerpt: MemoryExcerpt): boolean {
  if (!excerpt || !excerpt.span || !excerpt.source) return false;
  const { span, source } = excerpt;
  const points = Array.from(record.content);
  return span.field === 'content' && span.unit === 'unicode-codepoint'
    && Number.isInteger(span.start) && Number.isInteger(span.end)
    && span.start >= 0 && span.end >= span.start && span.end <= points.length
    && source.kind === 'memory' && source.id === record.id && source.revision === memorySemanticRevision(record)
    && excerpt.text === points.slice(span.start, span.end).join('');
}
