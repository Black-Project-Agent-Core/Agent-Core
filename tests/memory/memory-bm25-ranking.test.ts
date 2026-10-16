import { describe, expect, it } from 'vitest';
import { buildBm25Profile } from '../../src/memory/bm25.js';
import { searchMemories } from '../../src/memory/retrieval.js';
import type { MemoryRecord } from '../../src/memory/types.js';

const stamp = '2026-09-25T00:00:00.000Z';

function record(id: string, content: string, extra: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    version: 1,
    id,
    content,
    keywords: [],
    context: 'General',
    tags: [],
    category: 'Uncategorized',
    links: [],
    createdAt: stamp,
    updatedAt: stamp,
    lastAccessedAt: null,
    retrievalCount: 0,
    evolutionHistory: [],
    pinned: false,
    ...extra,
  };
}

describe('Memori-inspired BM25 ranking profile', () => {
  it('keeps legacy ordering unchanged unless bm25 is explicitly selected', () => {
    const records = [
      record('a-thin', 'quasar filler filler filler filler filler filler filler'),
      record('z-rich', 'quasar quasar quasar'),
    ];

    const legacy = searchMemories(records, 'quasar', { limit: 2, maxNeighbors: 0 });
    const bm25 = searchMemories(records, 'quasar', {
      limit: 2,
      maxNeighbors: 0,
      rankingProfile: 'bm25',
    });

    expect(legacy.map((item) => item.record.id)).toEqual(['a-thin', 'z-rich']);
    expect(legacy.every((item) => item.components.bm25Lexical === 0)).toBe(true);
    expect(legacy.every((item) => item.components.bm25Weight === 0)).toBe(true);

    expect(bm25[0]?.record.id).toBe('z-rich');
    expect(bm25[0]?.components.tokenOverlap).toBe(bm25[1]?.components.tokenOverlap);
    expect(bm25[0]?.components.bm25Lexical).toBeGreaterThan(bm25[1]?.components.bm25Lexical ?? 0);
    expect(bm25[0]?.components.bm25Weight).toBe(0.9);
  });

  it('uses stronger bounded weighting only for short meaningful queries', () => {
    const records = [record('one', 'alpha beta gamma delta')];
    expect(buildBm25Profile(records, 'alpha').weight).toBe(0.9);
    expect(buildBm25Profile(records, 'alpha beta').weight).toBe(0.9);
    expect(buildBm25Profile(records, 'alpha beta gamma').weight).toBe(0.45);
    expect(buildBm25Profile(records, 'the and').weight).toBe(0);
  });

  it('preserves source-file boost and linked-neighbor expansion under bm25', () => {
    const linked = record('linked', 'unrelated neighbor');
    const alpha = record('alpha', 'quasar memory', {
      provenance: { files: ['src/alpha.ts'] },
      links: [{
        targetId: linked.id,
        type: 'related',
        strength: 0.8,
        createdAt: stamp,
      }],
    });
    const beta = record('beta', 'quasar memory', {
      provenance: { files: ['src/beta.ts'] },
    });

    const results = searchMemories([beta, linked, alpha], 'quasar', {
      limit: 2,
      maxNeighbors: 1,
      sourceFiles: ['src/alpha.ts'],
      rankingProfile: 'bm25',
    });

    expect(results[0]?.record.id).toBe(alpha.id);
    expect(results[0]?.components.sourceFileMatch).toBeGreaterThan(0);
    const expanded = results.find((item) => item.record.id === linked.id);
    expect(expanded?.matchType).toBe('linked');
    expect(expanded?.components.bm25Lexical).toBe(0);
    expect(expanded?.components.linkBoost).toBeGreaterThan(0);
  });

  it('keeps limit and character-budget semantics unchanged', () => {
    const records = [
      record('one', 'quasar one'),
      record('two', 'quasar two'),
      record('three', 'quasar three'),
    ];
    const limited = searchMemories(records, 'quasar', {
      limit: 1,
      maxNeighbors: 0,
      rankingProfile: 'bm25',
    });
    expect(limited).toHaveLength(1);

    const budgeted = searchMemories(
      [record('oversize', 'quasar ' + 'x'.repeat(2_000)), record('small', 'quasar short')],
      'quasar',
      { limit: 2, maxNeighbors: 0, budgetChars: 500, rankingProfile: 'bm25' },
    );
    expect(budgeted.every((item) => item.record.content.length < 500)).toBe(true);
  });
});
