import type { MemorySearchResult } from './retrieval.js';

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

function shape(item: MemorySearchResult & { retrievalEvidence?: MemorySearchRetrievalEvidence }, delivery: MemorySearchDelivery) {
  if (delivery.detail === 'preview') {
    return {
      id: item.record.id,
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

function sizeOf(item: MemorySearchResult, delivery: MemorySearchDelivery): number {
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
  items: MemorySearchResult[],
  budgetChars: number,
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

  return {
    results: [...selected.entries()].sort((a, b) => a[0] - b[0]).map(([, item]) => item),
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
