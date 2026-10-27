import { isMemoryLinkActive } from './relations.js';
import type { MemoryLinkType, MemoryRecord } from './types.js';

/**
 * Bounded breadth-first relation traversal for GraphRAG style retrieval.
 *
 * At `maxHops = 1` it reproduces the original single-hop neighbor expansion
 * exactly (same ordering, caps and scoring), so enabling depth is the only change.
 * Deeper hops follow only evidence-bearing link types, decay geometrically and are
 * cycle safe through the shared `seen` set.
 */

export interface TraversalSeed {
  record: MemoryRecord;
  score: number;
}

export interface TraversalHit {
  record: MemoryRecord;
  score: number;
  linkBoost: number;
  viaMemoryId: string;
  viaLinkType: MemoryLinkType;
  hops: number;
  /** Ids from the originating direct result to this hit, exclusive of the hit itself. */
  path: string[];
}

export interface TraversalOptions {
  maxHops: number;
  maxNeighbors: number;
  /** Total result capacity shared with the direct results (`initialCount` already used). */
  capacity: number;
  initialCount: number;
  referenceTime: number;
  /** Ids already present in the result; mutated with every discovered hit. */
  seen: Set<string>;
}

export const MAX_TRAVERSAL_HOPS = 3;
const HOP_DECAY = 0.6;
const PARENT_SCORE_FACTOR = 0.35;
const DEEP_LINK_TYPES: ReadonlySet<MemoryLinkType> = new Set(['related', 'supports', 'derived-from']);

export function traverseRelations(
  seeds: TraversalSeed[],
  byId: ReadonlyMap<string, MemoryRecord>,
  options: TraversalOptions,
): TraversalHit[] {
  const maxHops = Math.max(1, Math.min(MAX_TRAVERSAL_HOPS, Math.trunc(options.maxHops) || 1));
  const hits: TraversalHit[] = [];
  let frontier: Array<{ record: MemoryRecord; score: number; path: string[] }> =
    seeds.map((seed) => ({ record: seed.record, score: seed.score, path: [] }));

  for (let hop = 1; hop <= maxHops && frontier.length; hop += 1) {
    const next: typeof frontier = [];
    for (const parent of frontier) {
      let expanded = 0;
      const links = parent.record.links.slice().sort((a, b) => b.strength - a.strength);
      for (const link of links) {
        if (expanded >= options.maxNeighbors || options.initialCount + hits.length >= options.capacity) break;
        if (!isMemoryLinkActive(link, options.referenceTime)) continue;
        if (hop > 1 && !DEEP_LINK_TYPES.has(link.type)) continue;
        if (options.seen.has(link.targetId)) continue;
        const neighbor = byId.get(link.targetId);
        if (!neighbor) continue;
        const linkBoost = (0.5 + link.strength) * HOP_DECAY ** (hop - 1);
        const score = Math.max(0.01, parent.score * PARENT_SCORE_FACTOR + linkBoost);
        const path = [...parent.path, parent.record.id];
        hits.push({
          record: neighbor, score, linkBoost, viaMemoryId: parent.record.id,
          viaLinkType: link.type, hops: hop, path,
        });
        options.seen.add(neighbor.id);
        next.push({ record: neighbor, score, path });
        expanded += 1;
      }
    }
    frontier = next;
  }
  return hits;
}
