import { afterEach, describe, expect, it } from 'vitest';
import { traverseRelations } from '../../src/memory/graph-traversal.js';
import { classifyMemoryTier, partitionByTier, searchByTier } from '../../src/memory/memory-tiers.js';
import { classifyQueryIntent, normalizeFusionWeights, NEUTRAL_FUSION_WEIGHTS } from '../../src/memory/query-intent.js';
import { searchMemories, type MemorySearchOptions, type MemorySearchResult } from '../../src/memory/retrieval.js';
import { legacyExperience } from '../../src/memory/experience-types.js';
import type { MemoryRecord } from '../../src/memory/types.js';
import { createCognitiveFixtures, link, NOW, record } from './memory-cognitive-test-utils.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const view = (results: MemorySearchResult[]) =>
  results.map(({ tier: _tier, ...rest }) => ({ ...rest, record: rest.record.id }));
/** Fixed ranking time: the recency term otherwise drifts between two calls. */
const rank = (records: MemoryRecord[], query: string, options: MemorySearchOptions) =>
  searchMemories(records, query, options, undefined, 50, NOW);

describe('query intent', () => {
  it.each([
    ['find "exact phrase here" please', 'exact'],
    ['src/memory/service.ts', 'source'],
    ['retrieval.ts', 'source'],
    ['ext-9cf6661f239a4ec0afb71623435940c7', 'identifier'],
    ['bagaimana cara kerja konsolidasi memori', 'conceptual'],
    ['why does the index become stale after restart in this setup', 'conceptual'],
    ['deploy rollback', 'keyword'],
    ['deploy rollback procedure checklist', 'balanced'],
  ])('classifies %j as %s', (query, intent) => {
    expect(classifyQueryIntent(query).intent).toBe(intent);
  });

  it('treats an explicit source-file hint as a source query and clamps custom weights', () => {
    expect(classifyQueryIntent('anything here please', { sourceFiles: ['a.ts'] }).intent).toBe('source');
    expect(classifyQueryIntent('').signals).toEqual(['no-dominant-signal']);
    expect(normalizeFusionWeights({ lexical: 99, semantic: -5, source: Number.NaN }))
      .toEqual({ lexical: 2, metadata: 1, semantic: 0.25, source: 1 });
    expect(normalizeFusionWeights()).toEqual(NEUTRAL_FUSION_WEIGHTS);
  });
});

describe('adaptive fusion weighting', () => {
  const records = [
    record('lex', { content: 'zebra crossing safety notes' }),
    record('other', { content: 'unrelated gardening notes' }),
  ];
  const run = (channelWeights?: MemorySearchOptions['channelWeights']) =>
    rank(records, 'zebra', { rankingProfile: 'fusion', limit: 3, maxNeighbors: 0, channelWeights });

  it('is exactly the previous behavior when weights are omitted or neutral', () => {
    expect(view(run({ ...NEUTRAL_FUSION_WEIGHTS }))).toEqual(view(run()));
  });

  it('scales the reciprocal-rank contribution of the weighted channel', () => {
    const neutral = run()[0]!.selection!.rrfScore;
    const boosted = run({ lexical: 1.5 })[0]!.selection!.rrfScore;
    expect(boosted / neutral).toBeCloseTo(1.5, 10);
    expect(run({ lexical: 0.5 })[0]!.record.id).toBe('lex');
  });

  it('never lets a weight silence a channel entirely', () => {
    expect(run({ lexical: 0 })[0]!.selection!.rrfScore).toBeGreaterThan(0);
  });

  it('does not rank worse on a small labeled relevance fixture', () => {
    const corpus = [
      record('doc-a', { content: 'runbook for database failover procedure', keywords: ['failover'], tags: ['database'] }),
      record('doc-b', { content: 'incident review of the payments outage', keywords: ['payments'], tags: ['incident'] }),
      record('doc-c', { content: 'configuration file src/memory/service.ts explained', provenance: { files: ['src/memory/service.ts'] } }),
      record('doc-d', { content: 'weekly meeting notes about hiring', keywords: ['hiring'] }),
      record('doc-e', { content: 'failover drill checklist for databases', keywords: ['drill'] }),
    ];
    const labeled: Array<[string, string]> = [
      ['failover', 'doc-a'], ['payments', 'doc-b'], ['src/memory/service.ts', 'doc-c'], ['hiring', 'doc-d'],
    ];
    const mrr = (adaptive: boolean) => labeled.reduce((sum, [query, relevant]) => {
      const weights = adaptive ? classifyQueryIntent(query).weights : undefined;
      const ids = searchMemories(corpus, query, { rankingProfile: 'fusion', limit: 5, maxNeighbors: 0, channelWeights: weights })
        .map((result) => result.record.id);
      const rank = ids.indexOf(relevant);
      return sum + (rank >= 0 ? 1 / (rank + 1) : 0);
    }, 0) / labeled.length;
    expect(mrr(true)).toBeGreaterThanOrEqual(mrr(false));
    expect(mrr(true)).toBeGreaterThan(0.9);
  });

  it('adds a bounded epistemic influence only when supplied', () => {
    const base = rank(records, 'zebra', { rankingProfile: 'fusion', limit: 3, maxNeighbors: 0 });
    expect(base[0]!.components.epistemicInfluence).toBeUndefined();
    const boosted = rank(records, 'zebra', {
      rankingProfile: 'fusion', limit: 3, maxNeighbors: 0, epistemicInfluence: new Map([['lex', 0.04]]),
    });
    expect(boosted[0]!.components.epistemicInfluence).toBe(0.04);
    expect(boosted[0]!.score - base[0]!.score).toBeCloseTo(0.04, 10);
  });
});

describe('multi-hop relation traversal', () => {
  const chain = () => [
    record('a', { content: 'uniquealpha anchor', links: [link('b', 'related'), link('x', 'contradicts')] }),
    record('b', { content: 'second step', links: [link('c', 'related'), link('y', 'contradicts')] }),
    record('c', { content: 'third step', links: [link('d', 'supports')] }),
    record('d', { content: 'fourth step', links: [link('a', 'related')] }),
    record('x', { content: 'conflicting claim' }),
    record('y', { content: 'deep conflicting claim' }),
  ];
  // The legacy profile scores every record by recency, so limit 1 keeps `a` the only direct result.
  const search = (maxHops?: number, profile?: 'fusion', maxNeighbors = 2) =>
    rank(chain(), 'uniquealpha', { limit: 1, maxNeighbors, maxHops, ...(profile ? { rankingProfile: profile } : {}) });
  const hopsOf = (results: MemorySearchResult[]) => Object.fromEntries(results.map((r) => [r.record.id, r.hops ?? (r.matchType === 'direct' ? 0 : 1)]));

  it('keeps the original single hop by default', () => {
    expect(view(search())).toEqual(view(search(1)));
    expect(hopsOf(search())).toEqual({ a: 0, b: 1, x: 1 });
    expect(search().every((result) => result.hops === undefined && result.viaPath === undefined)).toBe(true);
  });

  it.each([undefined, 'fusion' as const])('walks deeper hops with decay and a recorded path (%s)', (profile) => {
    // capacity is limit + maxNeighbors * limit, so four neighbors leave room for three hops.
    const results = search(3, profile, 4);
    const byId = new Map(results.map((result) => [result.record.id, result]));
    expect(byId.get('c')?.hops).toBe(2);
    expect(byId.get('c')?.viaPath).toEqual(['a', 'b']);
    expect(byId.get('c')?.viaMemoryId).toBe('b');
    expect(byId.get('d')?.hops).toBe(3);
    expect(byId.get('d')?.viaPath).toEqual(['a', 'b', 'c']);
    expect(byId.get('b')!.score).toBeGreaterThan(byId.get('c')!.score);
    expect(byId.get('c')!.score).toBeGreaterThan(byId.get('d')!.score);
    // Contradictions are context at hop 1 but are never followed deeper.
    expect(byId.has('x')).toBe(true);
    expect(byId.has('y')).toBe(false);
    // The cycle d -> a never duplicates the direct result.
    expect(results.filter((result) => result.record.id === 'a')).toHaveLength(1);
  });

  it('leaves first-hop results identical when depth is increased', () => {
    const shallow = search(1, undefined, 4);
    const deep = search(3, undefined, 4);
    const firstHop = (results: MemorySearchResult[]) => view(results.filter((result) => (result.hops ?? 1) === 1));
    expect(firstHop(deep)).toEqual(firstHop(shallow));
    expect(deep.length).toBeGreaterThan(shallow.length);
  });

  it('respects the shared capacity and per-seed neighbor cap', () => {
    const byId = new Map(chain().map((item) => [item.id, item]));
    const seeds = [{ record: byId.get('a')!, score: 5 }];
    const options = { maxHops: 3, maxNeighbors: 1, capacity: 10, initialCount: 1, referenceTime: NOW };
    expect(traverseRelations(seeds, byId, { ...options, seen: new Set(['a']) }).map((hit) => hit.record.id)).toEqual(['b', 'c', 'd']);
    expect(traverseRelations(seeds, byId, { ...options, capacity: 2, seen: new Set(['a']) })).toHaveLength(1);
    expect(traverseRelations(seeds, byId, { ...options, maxHops: 99, seen: new Set(['a']) })).toHaveLength(3);
  });
});

describe('memory tiers', () => {
  const policy = { l1WindowMs: 6 * HOUR, l2WindowMs: 30 * DAY };
  const v2 = (id: string, retention: 'active' | 'durable' | 'archive', updated: number) =>
    ({ ...record(id, { updatedAt: ago(updated) }), version: 2 as const, experience: { ...legacyExperience(), retention } }) as MemoryRecord;

  it('derives the tier from persisted fields only', () => {
    expect(classifyMemoryTier(record('p', { pinned: true, updatedAt: ago(400 * DAY) }), NOW, policy)).toBe('L1');
    expect(classifyMemoryTier(record('hot', { lastAccessedAt: ago(HOUR), updatedAt: ago(90 * DAY) }), NOW, policy)).toBe('L1');
    expect(classifyMemoryTier(record('warm', { updatedAt: ago(10 * DAY) }), NOW, policy)).toBe('L2');
    expect(classifyMemoryTier(record('recalled', { lastAccessedAt: ago(5 * DAY), updatedAt: ago(90 * DAY) }), NOW, policy)).toBe('L2');
    expect(classifyMemoryTier(record('cold', { updatedAt: ago(100 * DAY) }), NOW, policy)).toBe('L3');
    expect(classifyMemoryTier(v2('active', 'active', 100 * DAY), NOW, policy)).toBe('L2');
    expect(classifyMemoryTier(v2('archive', 'archive', DAY), NOW, policy)).toBe('L3');
    expect(classifyMemoryTier(record('bad', { updatedAt: 'nope' }), NOW, policy)).toBe('L3');
    const parts = partitionByTier([record('p', { pinned: true }), record('c', { updatedAt: ago(100 * DAY) })], NOW, policy);
    expect(parts.L1.map((r) => r.id)).toEqual(['p']);
    expect(parts.L3.map((r) => r.id)).toEqual(['c']);
  });

  const corpus = () => [
    record('hot', { content: 'kubernetes rollout runbook', lastAccessedAt: ago(HOUR), updatedAt: ago(DAY) }),
    record('warm', { content: 'incident postmortem payments', updatedAt: ago(5 * DAY) }),
    record('cold', { content: 'legacy mainframe migration notes', updatedAt: ago(200 * DAY) }),
  ];
  const run = (pool: MemoryRecord[], query: string) =>
    searchMemories(pool, query, { rankingProfile: 'fusion', limit: 1, maxNeighbors: 0 }, undefined, 50, NOW);

  it('answers from the smallest tier when it already holds strong evidence', () => {
    const outcome = searchByTier(corpus(), (pool) => run(pool, 'kubernetes rollout runbook'), { limit: 1, now: NOW, policy });
    expect(outcome.tiersSearched).toEqual(['L1']);
    expect(outcome.escalated).toBe(false);
    expect(outcome.results.map((r) => [r.record.id, r.tier])).toEqual([['hot', 'L1']]);
    expect(outcome.poolSizes).toEqual({ L1: 1, L2: 1, L3: 1 });
  });

  it('escalates to the full candidate set and then equals an ordinary search', () => {
    const outcome = searchByTier(corpus(), (pool) => run(pool, 'legacy mainframe migration notes'), { limit: 1, now: NOW, policy });
    expect(outcome.tiersSearched).toEqual(['L1', 'L2', 'L3']);
    expect(outcome.escalated).toBe(true);
    expect(view(outcome.results)).toEqual(view(run(corpus(), 'legacy mainframe migration notes')));
    expect(outcome.results[0]!.tier).toBe('L3');
  });

  it('handles empty tiers and an empty corpus', () => {
    expect(searchByTier([], () => [], { limit: 1, now: NOW, policy })).toMatchObject({ results: [], tiersSearched: [], escalated: false });
    const onlyCold = [record('cold', { content: 'zebra', updatedAt: ago(200 * DAY) })];
    expect(searchByTier(onlyCold, (pool) => run(pool, 'zebra'), { limit: 1, now: NOW, policy }).tiersSearched).toEqual(['L3']);
  });
});

describe('read-path wiring in MemoryService', () => {
  const fixtures = createCognitiveFixtures();
  afterEach(() => fixtures.cleanup());
  const ALL = { adaptiveFusion: true, epistemicConfidence: true, tiering: true, multiHop: true, forgettingCurve: true } as const;

  it('returns the same record set with the read-path features on as off', async () => {
    const off = await fixtures.service();
    const on = await fixtures.service({ features: ALL });
    for (const { service } of [off, on]) {
      const base = await service.remember({ content: 'zorptoken anchor note', keywords: ['zorptoken'], tags: ['t'], category: 'c', context: 'x' });
      await service.remember({ content: 'neighbor of the anchor', keywords: ['near'], tags: ['t'], category: 'c', context: 'x', links: [{ targetId: base.id, type: 'related', strength: 0.9 }] });
    }
    for (const profile of ['legacy', 'bm25', 'fusion'] as const) {
      const [a, b] = await Promise.all([off, on].map(({ service }) =>
        service.search('zorptoken', { rankingProfile: profile, limit: 3 })));
      expect(b!.map((r) => r.record.content)).toEqual(a!.map((r) => r.record.content));
    }
    expect(on.service.cognitiveStatus().enabled).toEqual(expect.arrayContaining(Object.keys(ALL)));
    expect(off.service.cognitiveStatus().enabled).toEqual([]);
  });

  it('uses the forgetting model for retirement review only when enabled', async () => {
    const off = await fixtures.service();
    const on = await fixtures.service({ features: { forgettingCurve: true } });
    expect((await off.service.retirementReview()).retentionThreshold).toBe(0.2);
    expect((await on.service.retirementReview()).retentionThreshold).toBe(0.3);
  });

  it('exposes an epistemic assessment per record', async () => {
    const { service } = await fixtures.service();
    const saved = await service.remember({ content: 'reviewed fact', tags: ['verified'], source: { type: 'learning-review' }, keywords: ['k'], category: 'c', context: 'x' });
    expect(await service.epistemicAssessment(saved.id)).toMatchObject({ status: 'verified' });
    await expect(service.epistemicAssessment('00000000-0000-4000-8000-000000000000')).rejects.toThrow(/not found/i);
  });
});
