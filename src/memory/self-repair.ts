import { boundedHistory } from './note-format.js';
import type { MemoryIndexResult } from './index.js';
import type { MemoryLink, MemoryLinkType, MemoryRecord } from './types.js';

/**
 * Integrity detection and repair for relation references and the derived semantic index.
 * Only dangling references are removed; embeddings are repaired through the existing
 * bounded index refresh, so this module never talks to an embedding provider itself.
 */
export interface OrphanReference {
  ownerId: string;
  kind: 'link' | 'evidence-ref';
  targetId: string;
  linkType: MemoryLinkType;
}

export type EmbeddingDriftStatus = 'ok' | 'stale-index' | 'incomplete-embeddings' | 'not-configured';

export interface IntegrityScan {
  scannedRecords: number;
  /**
   * False when some note could not be loaded. A reference to an unreadable note is not an
   * orphan, so orphans are withheld and no repair runs until the store is complete again.
   */
  canonicalComplete: boolean;
  orphanReferences: OrphanReference[];
  embedding: { status: EmbeddingDriftStatus; detail?: string; pending: number; failed: number };
  /** True when anything above needs repair. */
  needsRepair: boolean;
}

const memoryEvidenceId = (ref: string): string | undefined =>
  ref.toLowerCase().startsWith('memory:') ? ref.slice('memory:'.length) : undefined;

export function findOrphanReferences(records: MemoryRecord[]): OrphanReference[] {
  const ids = new Set(records.map((record) => record.id));
  const orphans: OrphanReference[] = [];
  for (const record of records) {
    for (const link of record.links) {
      if (!ids.has(link.targetId)) {
        orphans.push({ ownerId: record.id, kind: 'link', targetId: link.targetId, linkType: link.type });
        continue;
      }
      for (const ref of link.evidenceRefs ?? []) {
        const evidenceId = memoryEvidenceId(ref);
        if (evidenceId !== undefined && !ids.has(evidenceId)) {
          orphans.push({ ownerId: record.id, kind: 'evidence-ref', targetId: evidenceId, linkType: link.type });
        }
      }
    }
  }
  return orphans;
}

export function classifyEmbeddingDrift(inspection: MemoryIndexResult): { status: EmbeddingDriftStatus; detail?: string } {
  if (inspection.embedding === 'not-configured') return { status: 'not-configured' };
  if (inspection.index !== 'available') {
    return { status: 'stale-index', ...(inspection.indexWarning ? { detail: inspection.indexWarning } : {}) };
  }
  if (inspection.embedding !== 'available') {
    return { status: 'incomplete-embeddings', ...(inspection.embeddingWarning ? { detail: inspection.embeddingWarning } : {}) };
  }
  return { status: 'ok' };
}

/** Pure repair of one record; returns null when it holds no dangling reference. */
export function stripOrphanReferences(
  record: MemoryRecord,
  validIds: ReadonlySet<string>,
): { record: MemoryRecord; removedTargets: string[]; removedEvidenceIds: string[] } | null {
  const removedTargets: string[] = [];
  const removedEvidenceIds: string[] = [];
  const links: MemoryLink[] = [];
  for (const link of record.links) {
    if (!validIds.has(link.targetId)) { removedTargets.push(link.targetId); continue; }
    const kept = (link.evidenceRefs ?? []).filter((ref) => {
      const evidenceId = memoryEvidenceId(ref);
      if (evidenceId === undefined || validIds.has(evidenceId)) return true;
      removedEvidenceIds.push(evidenceId);
      return false;
    });
    if (kept.length === (link.evidenceRefs ?? []).length) { links.push(link); continue; }
    const { evidenceRefs: _dropped, ...rest } = link;
    links.push(kept.length ? { ...rest, evidenceRefs: kept } : rest);
  }
  if (!removedTargets.length && !removedEvidenceIds.length) return null;
  const now = new Date().toISOString();
  return {
    removedTargets,
    removedEvidenceIds,
    record: {
      ...record,
      links,
      updatedAt: now,
      evolutionHistory: boundedHistory(record.evolutionHistory, {
        kind: 'link_removed',
        source: 'system',
        timestamp: now,
        changedFields: ['links'],
        details: { reason: 'orphan-reference-repair', removedTargets, removedEvidenceIds },
      }),
    },
  };
}
