import type { MemorySearchResult } from './retrieval.js';
import type { MemoryRecord } from './types.js';

/**
 * Derived memory hierarchy. Tier membership is computed from persisted fields
 * (`lastAccessedAt`, `updatedAt`, pin and experience retention), so no new state
 * exists to drift out of sync with the canonical store.
 *
 *   L1 working cache : pinned or recalled within the L1 window
 *   L2 episodic      : touched within the L2 window, or experience retention "active"
 *   L3 long-term     : everything else, and experience retention "archive"
 */
export type MemoryTier = 'L1' | 'L2' | 'L3';

export interface MemoryTierPolicy {
  l1WindowMs: number;
  l2WindowMs: number;
}

export function classifyMemoryTier(record: MemoryRecord, now: number, policy: MemoryTierPolicy): MemoryTier {
  if (record.pinned) return 'L1';
  if (record.version === 2 && record.experience.retention === 'archive') return 'L3';
  const accessed = record.lastAccessedAt ? Date.parse(record.lastAccessedAt) : Number.NaN;
  if (Number.isFinite(accessed) && now - accessed <= policy.l1WindowMs) return 'L1';
  const updated = Date.parse(record.updatedAt);
  const touchedAt = Math.max(Number.isFinite(updated) ? updated : 0, Number.isFinite(accessed) ? accessed : 0);
  if (now - touchedAt <= policy.l2WindowMs) return 'L2';
  if (record.version === 2 && record.experience.retention === 'active') return 'L2';
  return 'L3';
}

export function partitionByTier(
  records: MemoryRecord[],
  now: number,
  policy: MemoryTierPolicy,
): Record<MemoryTier, MemoryRecord[]> {
  const tiers: Record<MemoryTier, MemoryRecord[]> = { L1: [], L2: [], L3: [] };
  for (const record of records) tiers[classifyMemoryTier(record, now, policy)].push(record);
  return tiers;
}

export function isStrongEvidence(result: MemorySearchResult): boolean {
  const c = result.components;
  return c.exactPhrase > 0 || c.contentExactPhrase || c.semanticSimilarity >= 0.75 || c.bm25Lexical >= 0.6;
}

export interface TieredSearchOutcome {
  results: MemorySearchResult[];
  tiersSearched: MemoryTier[];
  /** True when a smaller tier pool was not sufficient and the next pool was searched. */
  escalated: boolean;
  poolSizes: Record<MemoryTier, number>;
}

/**
 * Searches L1, then L1+L2, then everything. A smaller pool answers only when it already
 * holds `limit` direct results with strong evidence; otherwise the search escalates, and
 * the final pool is the full candidate set, so escalation always equals an ordinary search.
 */
export function searchByTier(
  records: MemoryRecord[],
  search: (pool: MemoryRecord[]) => MemorySearchResult[],
  options: { limit: number; now: number; policy: MemoryTierPolicy },
): TieredSearchOutcome {
  const tiers = partitionByTier(records, options.now, options.policy);
  const poolSizes = { L1: tiers.L1.length, L2: tiers.L2.length, L3: tiers.L3.length };
  const pools: Array<{ tier: MemoryTier; records: MemoryRecord[] }> = [];
  let accumulated: MemoryRecord[] = [];
  for (const tier of ['L1', 'L2', 'L3'] as const) {
    if (!tiers[tier].length) continue;
    accumulated = [...accumulated, ...tiers[tier]];
    pools.push({ tier, records: accumulated });
  }
  const searched: MemoryTier[] = [];
  let results: MemorySearchResult[] = [];
  for (const [index, pool] of pools.entries()) {
    searched.push(pool.tier);
    results = search(pool.records);
    const last = index === pools.length - 1;
    const strong = results.filter((result) => result.matchType === 'direct' && isStrongEvidence(result)).length;
    if (last || strong >= options.limit) break;
  }
  const classified = results.map((result) => ({
    ...result,
    tier: classifyMemoryTier(result.record, options.now, options.policy),
  }));
  return { results: classified, tiersSearched: searched, escalated: searched.length > 1, poolSizes };
}
