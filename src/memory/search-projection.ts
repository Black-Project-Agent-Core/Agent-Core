import { recordExperience } from './experience-types.js';
import type { MemoryHit } from './disclosure.js';
import type { MemoryRecord } from './types.js';
import type { MemorySearchResult } from './retrieval.js';
import { selectMemoryExcerpt } from './evidence-excerpt.js';
import { progressiveMemoryDetail } from './progressive-disclosure.js';
import { assessEvidenceLineage, type EvidenceLineageAdvisory } from './evidence-lineage.js';

export type MemorySearchDeliveryDetail = 'full' | 'compact' | 'minimal' | 'preview';

export interface MemorySearchDelivery {
  detail: MemorySearchDeliveryDetail;
  content: string;
  truncated: boolean;
  originalContentChars: number;
  omittedContentChars: number;
}

export interface MemorySearchRetrievalEvidence {
  attemptId: string;
  contentDigest: string;
  recordFingerprint: string;
}

export type DeliveredMemorySearchResult = MemorySearchResult & {
  delivery: MemorySearchDelivery;
  evidenceLineage?: EvidenceLineageAdvisory;
  retrievalEvidence?: MemorySearchRetrievalEvidence;
};

export interface MemorySearchProjectionDisposition {
  memoryId: string;
  rank: number;
  disposition: 'selected' | 'trimmed' | 'dropped';
}

export interface MemorySearchProjection {
  results: DeliveredMemorySearchResult[];
  dispositions: MemorySearchProjectionDisposition[];
}

const TRUST_RESERVE_CHARS = 220;
const PREVIEW_MARKER = '\n\n[... memory content omitted ...]\n\n';
function headTail(text: string, maxChars: number): string {
  const points = Array.from(text);
  if (points.length <= maxChars) return text;
  if (maxChars <= PREVIEW_MARKER.length + 24) {
    return points.slice(0, Math.max(0, maxChars)).join('');
  }
  const keep = maxChars - PREVIEW_MARKER.length;
  const head = Math.ceil(keep * 0.7);
  const tail = Math.floor(keep * 0.3);
  return points.slice(0, head).join('') + PREVIEW_MARKER + points.slice(-tail).join('');
}

function shape(item: MemorySearchResult & { retrievalEvidence?: MemorySearchRetrievalEvidence; evidenceLineage?: EvidenceLineageAdvisory }, delivery: MemorySearchDelivery) {
  const guidance = progressiveMemoryDetail(item.record, delivery.truncated, 'delivery-truncated');
  const annotations = { ...(item.evidenceLineage ? { evidenceLineage: item.evidenceLineage } : {}),
    ...(guidance ? { detailHint: guidance } : {}) };
  if (delivery.detail === 'preview') {
    return {
      id: item.record.id,
      ...annotations,
      content: delivery.content,
      score: item.score,
      matchType: item.matchType,
      ...(item.retrievalEvidence ? { retrievalEvidence: item.retrievalEvidence } : {}),
      delivery: {
        detail: delivery.detail,
        truncated: delivery.truncated,
        originalContentChars: delivery.originalContentChars,
        omittedContentChars: delivery.omittedContentChars,
      },
    };
  }
  const base = {
    id: item.record.id,
    ...annotations,
    ...(item.record.title ? { title: item.record.title } : {}),
    content: delivery.content,
    category: item.record.category,
    pinned: item.record.pinned,
    ...(item.record.expiresAt ? { expiresAt: item.record.expiresAt } : {}),
    workspace: item.record.provenance?.workspace,
    score: item.score,
    matchType: item.matchType,
    ...(item.retrievalEvidence ? { retrievalEvidence: item.retrievalEvidence } : {}),
    ...(item.viaMemoryId ? { viaMemoryId: item.viaMemoryId } : {}),
    ...(item.viaLinkType ? { viaLinkType: item.viaLinkType } : {}),
    delivery: {
      detail: delivery.detail,
      truncated: delivery.truncated,
      originalContentChars: delivery.originalContentChars,
      omittedContentChars: delivery.omittedContentChars,
    },
  };
  if (delivery.detail === 'full') {
    return {
      ...base,
      context: item.record.context,
      keywords: item.record.keywords,
      tags: item.record.tags,
      components: item.components,
      ...(item.suppressedDuplicateIds ? { suppressedDuplicateIds: item.suppressedDuplicateIds } : {}),
      ...(item.selection ? { selection: item.selection } : {}),
    };
  }
  if (delivery.detail === 'compact') {
    return {
      ...base,
      context: item.record.context,
      keywords: item.record.keywords,
      tags: item.record.tags,
    };
  }
  return base;
}

function sizeOf(item: MemorySearchResult & { evidenceLineage?: EvidenceLineageAdvisory }, delivery: MemorySearchDelivery): number {
  return JSON.stringify(shape(item, delivery)).length + TRUST_RESERVE_CHARS;
}

function delivery(item: MemorySearchResult, detail: MemorySearchDeliveryDetail, content = item.record.content): MemorySearchDelivery {
  const originalContentChars = Array.from(item.record.content).length;
  const contentChars = Array.from(content).length;
  return {
    detail,
    content,
    truncated: contentChars < originalContentChars,
    originalContentChars,
    omittedContentChars: Math.max(0, originalContentChars - contentChars),
  };
}
export function projectMemorySearchResults(
  items: Array<MemorySearchResult & { evidenceLineage?: EvidenceLineageAdvisory }>,
  budgetChars: number,
  eligible: readonly MemoryRecord[] = items.map(item => item.record),
  referenceTime = Date.now(),
): MemorySearchProjection {
  const budget = Math.max(500, Math.min(100_000, budgetChars));
  const ranked = items.map((item, index) => ({ item, index }));
  const prioritized = [...ranked].sort((a, b) =>
    Number(a.item.matchType === 'linked') - Number(b.item.matchType === 'linked') || a.index - b.index);

  const selected = new Map<number, DeliveredMemorySearchResult>();
  const dispositionByIndex = new Map<number, MemorySearchProjectionDisposition>();
  let used = 0;

  for (const entry of prioritized) {
    const candidates = [
      delivery(entry.item, 'full'),
      delivery(entry.item, 'compact'),
      delivery(entry.item, 'minimal'),
    ];
    let chosen = candidates.find(candidate => used + sizeOf(entry.item, candidate) <= budget);

    if (!chosen && selected.size === 0) {
      const empty = delivery(entry.item, 'preview', '');
      const available = Math.max(24, budget - used - sizeOf(entry.item, empty));
      chosen = delivery(entry.item, 'preview', headTail(entry.item.record.content, available));
      while (chosen.content && used + sizeOf(entry.item, chosen) > budget) {
        const next = Math.max(0, Array.from(chosen.content).length - 32);
        chosen = delivery(entry.item, 'preview', headTail(entry.item.record.content, next));
      }
    }
    if (!chosen || used + sizeOf(entry.item, chosen) > budget) {
      dispositionByIndex.set(entry.index, {
        memoryId: entry.item.record.id,
        rank: entry.index + 1,
        disposition: 'dropped',
      });
      continue;
    }

    used += sizeOf(entry.item, chosen);
    selected.set(entry.index, { ...entry.item, delivery: chosen });
    dispositionByIndex.set(entry.index, {
      memoryId: entry.item.record.id,
      rank: entry.index + 1,
      disposition: chosen.detail === 'full' ? 'selected' : 'trimmed',
    });
  }

  // Only actual returned hits may corroborate one another. Re-budget these
  // advisories before finalizing the same ranked delivery/disposition list.
  const published = [...selected.entries()].sort((a,b)=>a[0]-b[0]);
  let results: DeliveredMemorySearchResult[] = [];
  for (;;) {
    const lineage = published.length > 1
      ? assessEvidenceLineage(published.map(([,item])=>item.record),eligible,referenceTime) : undefined;
    results = published.map(([,item])=>({
      ...item,...(lineage ? { evidenceLineage:lineage.get(item.record.id) } : {}),
    }));
    if(results.reduce((bytes,item)=>bytes+sizeOf(item,item.delivery),0)<=budget||!published.length)break;
    const [removedIndex,removed] = published.pop()!;
    dispositionByIndex.set(removedIndex,{memoryId:removed.record.id,rank:removedIndex+1,disposition:'dropped'});
  }
  return { results,
    dispositions: ranked.map(({ item, index }) => dispositionByIndex.get(index) ?? {
      memoryId: item.record.id,
      rank: index + 1,
      disposition: 'dropped' as const,
    }),
  };
}

export function formatDeliveredMemorySearchResult(item: DeliveredMemorySearchResult) {
  return shape(item, item.delivery);
}

/** Additive compact projection; the legacy projection above stays unchanged. */
export function projectMemoryHit(
  record: MemoryRecord,
  input: { revision: string; view: 'map' | 'abstract'; query?: string; score?: number;
    applicability: MemoryHit['applicability'];invalidatedBy?:MemoryHit['invalidatedBy'];
    freshness: MemoryHit['freshness'];
    retrievalEvidence: MemoryHit['retrievalEvidence'] },
): MemoryHit {
  const experience = recordExperience(record);
  const excerpt = input.view === 'abstract' ? selectMemoryExcerpt(record, input.query ?? '') : undefined;
  const incomplete = Boolean(excerpt && excerpt.span.end - excerpt.span.start < Array.from(record.content).length);
  const detailHint = progressiveMemoryDetail(record, incomplete, 'excerpt-incomplete', excerpt?.source);
  return { id: record.id, revision: input.revision, title: record.title ?? '',
    ...(excerpt ? { abstract: excerpt.text, excerpt } : {}),
    ...(detailHint ? { detailHint } : {}),
    ...(record.version===2?{validity:experience.validity,...(experience.observedAt?{observedAt:experience.observedAt}:{}),...(input.invalidatedBy?.length?{invalidatedBy:input.invalidatedBy}:{})}:{}),
    retention: experience.retention, epistemic: experience.epistemic, temporal: experience.temporal, verification: experience.verification.status,
    applicability: input.applicability, freshness: input.freshness, availableViews: ['record'],
    ...(input.score !== undefined ? { score: input.score } : {}), retrievalEvidence: { ...input.retrievalEvidence } };
}
