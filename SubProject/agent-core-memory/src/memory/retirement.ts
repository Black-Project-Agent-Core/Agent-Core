import { createHash } from 'node:crypto';
import type { MemoryRecord } from './types.js';

export function memoryRetirementFingerprint(record: MemoryRecord): string {
  const canonical = {
    version: record.version,
    id: record.id,
    title: record.title ?? null,
    content: record.content,
    keywords: record.keywords,
    context: record.context,
    tags: record.tags,
    category: record.category,
    links: record.links.map(link => ({
      targetId: link.targetId,
      type: link.type,
      strength: link.strength,
      createdAt: link.createdAt,
      reason: link.reason ?? null,
    })),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastAccessedAt: record.lastAccessedAt,
    retrievalCount: record.retrievalCount,
    source: record.source ?? null,
    provenance: record.provenance ?? null,
  };
  return 'sha256:' + createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}
