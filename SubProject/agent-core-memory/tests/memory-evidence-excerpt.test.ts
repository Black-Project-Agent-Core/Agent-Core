import { describe, expect, it } from 'vitest';
import { memorySemanticRevision } from '../src/memory/disclosure.js';
import { projectMemoryHit } from '../src/memory/search-projection.js';
import { selectMemoryExcerpt, verifyMemoryExcerpt } from '../src/memory/evidence-excerpt.js';
import type { MemoryExcerpt } from '../src/memory/evidence-excerpt.js';
import type { MemoryRecord } from '../src/memory/types.js';

function record(content: string): MemoryRecord {
  return { version: 1, id: 'excerpt-fixture', title: 'Synthetic excerpt', content,
    keywords: [], context: 'General', tags: [], category: 'Uncategorized', links: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    lastAccessedAt: null, retrievalCount: 0, evolutionHistory: [], pinned: false };
}

// Replacing query-aware selection with first-240 preview must fail this oracle.
describe('query-focused canonical evidence excerpts', () => {
  it('middle_match_replaces_head', () => {
    const saved = record('x '.repeat(750) + 'distinctneedle ' + 'y '.repeat(743));
    const hit = projectMemoryHit(saved, { revision: memorySemanticRevision(saved), view: 'abstract',
      query: 'distinctneedle', applicability: 'unknown', freshness: 'unknown',
      retrievalEvidence: { attemptId: 'synthetic', contentDigest: memorySemanticRevision(saved), recordFingerprint: memorySemanticRevision(saved) } });
    expect(hit.abstract).toContain('distinctneedle');
    expect(Array.from(hit.abstract!).length).toBeLessThanOrEqual(240);
    expect(hit.excerpt!.span.start).toBe(1420);
    expect(hit.abstract).toBe(hit.excerpt!.text);
    expect(verifyMemoryExcerpt(saved, hit.excerpt!)).toBe(true);
  });

  it('unicode_crlf_exact preserves original offsets despite Turkish case expansion', () => {
    const saved = record('İ🚀\r\né'.repeat(150) + 'Needle\r\né🚀 END' + 'x '.repeat(200));
    const excerpt = selectMemoryExcerpt(saved, 'NEEDLE');
    expect(excerpt.span).toEqual({ field: 'content', unit: 'unicode-codepoint', start: 820, end: 1060 });
    expect(excerpt.text).toBe(Array.from(saved.content).slice(820, 1060).join(''));
    expect(excerpt.text).toContain('Needle\r\né🚀');
    expect(verifyMemoryExcerpt(saved, excerpt)).toBe(true);
    const turkish = selectMemoryExcerpt(record('İSTANBUL followed by original text'), 'İSTANBUL', 17);
    expect(turkish.selection).toBe('query-match');
    expect(turkish.text).toBe('İSTANBUL followed');
  });

  it('duplicate_tokens_tie_first and distinct-token coverage choose deterministically', () => {
    const saved = record('x '.repeat(300) + 'alpha ' + 'x '.repeat(300) + 'alpha ');
    const once = selectMemoryExcerpt(saved, 'alpha');
    expect(once.span.start).toBe(520);
    expect(selectMemoryExcerpt(saved, 'alpha ALPHA alpha')).toEqual(once);
    const richer = record('alpha ' + 'x '.repeat(300) + 'alpha beta ' + 'x '.repeat(300));
    expect(selectMemoryExcerpt(richer, 'alpha beta').span.start).toBe(526);
  });

  it.each(['absenttoken', '', '🚀 !', 'x'])('no_match_labeled_fallback: %s', query => {
    const saved = record('  Canonical\r\nhead é 🚀  ');
    const excerpt = selectMemoryExcerpt(saved, query);
    expect(excerpt).toMatchObject({ text: saved.content, selection: 'head-fallback', selectorVersion: 1,
      source: { kind: 'memory', id: saved.id, revision: memorySemanticRevision(saved) },
      span: { field: 'content', unit: 'unicode-codepoint', start: 0, end: 24 } });
    expect(verifyMemoryExcerpt(saved, excerpt)).toBe(true);
  });

  it('empty_content has a valid empty source interval', () => {
    const saved = record('');
    const excerpt = selectMemoryExcerpt(saved, 'needle');
    expect(excerpt).toMatchObject({ text: '', selection: 'head-fallback', span: { start: 0, end: 0 } });
    expect(verifyMemoryExcerpt(saved, excerpt)).toBe(true);
  });

  it.each([1, 17])('max_1_and_17_respected for matches and fallback: %s', max => {
    const saved = record('x '.repeat(500) + 'needle ' + 'z '.repeat(500));
    const match = selectMemoryExcerpt(saved, 'needle', max);
    expect(match.selection).toBe('query-match');
    expect(match.span.start).toBe(1000 - (max - 1));
    expect(match.span.end).toBe(1001);
    expect(match.text.endsWith('n')).toBe(true);
    for (const excerpt of [match, selectMemoryExcerpt(saved, 'absent', max)]) {
      expect(Array.from(excerpt.text)).toHaveLength(max);
      expect(excerpt.span.end - excerpt.span.start).toBe(max);
      expect(verifyMemoryExcerpt(saved, excerpt)).toBe(true);
    }
  });

  it.each([0, -1, 241, 1.5, NaN, Infinity])('invalid_max rejects %s', max => {
    expect(() => selectMemoryExcerpt(record('needle'), 'needle', max)).toThrow(RangeError);
  });

  it('tampered_span_rejected including non-integer bounds and wrong source units', () => {
    const saved = record('  needle\r\né🚀  ');
    const excerpt = selectMemoryExcerpt(saved, 'needle');
    for (const patch of [{ start: -1 }, { start: 0.5 }, { end: 1000 }, { end: -1 },
      { start: 5, end: 2 }, { field: 'context' }, { unit: 'utf16' }]) {
      expect(verifyMemoryExcerpt(saved, { ...excerpt, span: { ...excerpt.span, ...patch } } as MemoryExcerpt)).toBe(false);
    }
    expect(verifyMemoryExcerpt(saved, { ...excerpt, text: excerpt.text.trim() })).toBe(false);
    expect(verifyMemoryExcerpt(saved, { ...excerpt, source: { ...excerpt.source, id: 'other-id' } })).toBe(false);
    expect(verifyMemoryExcerpt(saved, { ...excerpt, source: { ...excerpt.source, kind: 'artifact' } })).toBe(false);
    // Selection is descriptive, never an authority or a rerun of the query.
    expect(verifyMemoryExcerpt(saved, { ...excerpt, selection: 'head-fallback' })).toBe(true);
  });

  it('same_text_other_revision_rejected', () => {
    const saved = record('needle exact unchanged text');
    const excerpt = selectMemoryExcerpt(saved, 'needle');
    expect(verifyMemoryExcerpt({ ...saved, title: 'New canonical meaning' }, excerpt)).toBe(false);
    expect(verifyMemoryExcerpt({ ...saved, updatedAt: '2026-02-01T00:00:00.000Z', retrievalCount: 3 }, excerpt)).toBe(true);
  });

  it('malformed_proof_is_false_instead_of_throwing', () => {
    const saved = record('needle');
    for (const excerpt of [null, {}, { span: null, source: {} }, { span: {}, source: null }]) {
      expect(verifyMemoryExcerpt(saved, excerpt as MemoryExcerpt)).toBe(false);
    }
  });

  it('map_has_no_excerpt and omitted_query keeps head fallback', () => {
    const saved = record('head ' + 'x '.repeat(200) + 'needle');
    const input = { revision: memorySemanticRevision(saved), view: 'abstract' as const,
      applicability: 'unknown' as const, freshness: 'unknown' as const,
      retrievalEvidence: { attemptId: 'synthetic', contentDigest: memorySemanticRevision(saved), recordFingerprint: memorySemanticRevision(saved) } };
    const fallback = projectMemoryHit(saved, input);
    expect(fallback.excerpt!.selection).toBe('head-fallback');
    expect(fallback.abstract).toBe(Array.from(saved.content).slice(0, 240).join(''));
    const map = projectMemoryHit(saved, { ...input, view: 'map', query: 'needle' });
    expect(map.abstract).toBeUndefined();
    expect(map.excerpt).toBeUndefined();
  });

  it.each([
    { name: 'head', content: 'needle ' + 'x '.repeat(300), query: 'needle', start: 0, end: 240 },
    { name: 'middle', content: 'x '.repeat(750) + 'needle ' + 'z '.repeat(750), query: 'needle', start: 1420, end: 1660 },
    { name: 'tail', content: 'x '.repeat(300) + 'needle', query: 'needle', start: 366, end: 606 },
    { name: 'absent', content: 'x '.repeat(300), query: 'absent', start: 0, end: 240 },
  ])('frozen_$name_oracle proves exact bounded location against first-240 baseline', ({ content, query, start, end, name }) => {
    const saved = record(content);
    const before = Array.from(content).slice(0, 240).join('');
    const after = selectMemoryExcerpt(saved, query);
    expect(after.span.start).toBe(start);
    expect(after.span.end).toBe(end);
    expect(after.text).toBe(Array.from(content).slice(start, end).join(''));
    expect(verifyMemoryExcerpt(saved, after)).toBe(true);
    if (name === 'absent') expect(after.selection).toBe('head-fallback');
    else expect(after.text).toContain('needle');
    if (name === 'middle' || name === 'tail') expect(before).not.toContain('needle');
    expect(saved.content).toBe(content);
  });
});
