import type { MemoryLink, MemoryRecord } from './types.js';

export function normalizeLinks(ownerId: string, links: MemoryLink[], validIds: Set<string>): MemoryLink[] {
  const positions = new Map<string, number>();
  const output: MemoryLink[] = [];
  for (const raw of links) {
    if (raw.targetId === ownerId) throw new Error('Memory cannot link to itself');
    if (!validIds.has(raw.targetId)) throw new Error(`Linked memory not found: ${raw.targetId}`);
    const link = { ...raw, strength: Math.max(0, Math.min(1, raw.strength)) };
    const key = `${link.targetId}\u0000${link.type}`;
    const position = positions.get(key);
    if (position !== undefined) {
      const existing = output[position];
      if (link.strength > existing.strength) {
        output[position] = {
          ...existing,
          strength: link.strength,
          ...(link.reason ? { reason: link.reason } : {}),
        };
      } else if (!existing.reason && link.reason) {
        output[position] = { ...existing, reason: link.reason };
      }
      continue;
    }
    if (output.length >= 32) continue;
    positions.set(key, output.length);
    output.push(link);
  }
  return output;
}

export function relatedByMetadata(a: MemoryRecord, b: MemoryRecord): number {
  const aTerms = new Set([...a.keywords, ...a.tags, a.category].map((v) => v.toLowerCase()).filter(Boolean));
  const bTerms = new Set([...b.keywords, ...b.tags, b.category].map((v) => v.toLowerCase()).filter(Boolean));
  if (aTerms.size === 0 || bTerms.size === 0) return 0;
  let intersection = 0;
  for (const term of aTerms) if (bTerms.has(term)) intersection++;
  return intersection / Math.max(aTerms.size, bTerms.size);
}
