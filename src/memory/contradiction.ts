import { assessEpistemicConfidence, buildEpistemicLinkIndex } from './epistemic-confidence.js';
import { isMemoryExpired } from './visibility.js';
import { isMemoryLinkActive } from './relations.js';
import type { MemoryRecord } from './types.js';

/**
 * Contradiction detection and truth pruning over existing typed links.
 *
 * A pair is contradictory when either record holds an active `contradicts` link to the
 * other. Resolution never deletes anything: the loser is hidden from retrieval by the
 * existing `supersedes` semantics, and removing that one link restores it.
 */
export type ContradictionReason = 'confidence-margin' | 'recency' | 'pinned' | 'tie';

export interface ContradictionDecision {
  leftId: string;
  rightId: string;
  outcome: 'resolved' | 'unresolved';
  winnerId?: string;
  loserId?: string;
  reason: ContradictionReason;
  confidence: { left: number; right: number };
}

export interface ContradictionPolicy {
  confidenceMargin: number;
  recencyGapMs: number;
}

export function decideContradictions(
  records: MemoryRecord[],
  now: number,
  policy: ContradictionPolicy,
  limit = 50,
): ContradictionDecision[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const superseded = new Set(records.flatMap((record) => record.links
    .filter((link) => link.type === 'supersedes' && isMemoryLinkActive(link, now))
    .map((link) => link.targetId)));
  const linkIndex = buildEpistemicLinkIndex(records, now);
  const seen = new Set<string>();
  const decisions: ContradictionDecision[] = [];

  for (const record of records) {
    for (const link of record.links) {
      if (link.type !== 'contradicts' || !isMemoryLinkActive(link, now)) continue;
      const other = byId.get(link.targetId);
      if (!other || other.id === record.id) continue;
      const [left, right] = record.id < other.id ? [record, other] : [other, record];
      const key = `${left.id}\u0000${right.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (superseded.has(left.id) || superseded.has(right.id)) continue;
      if (isMemoryExpired(left, now) || isMemoryExpired(right, now)) continue;
      decisions.push(decide(left, right, policy, linkIndex));
    }
  }
  return decisions
    .sort((a, b) => a.leftId.localeCompare(b.leftId) || a.rightId.localeCompare(b.rightId))
    .slice(0, Math.max(1, limit));
}

function decide(
  left: MemoryRecord,
  right: MemoryRecord,
  policy: ContradictionPolicy,
  linkIndex: ReturnType<typeof buildEpistemicLinkIndex>,
): ContradictionDecision {
  const leftScore = assessEpistemicConfidence(left, linkIndex.get(left.id)).confidence;
  const rightScore = assessEpistemicConfidence(right, linkIndex.get(right.id)).confidence;
  const base = { leftId: left.id, rightId: right.id, confidence: { left: leftScore, right: rightScore } };
  // A pinned record cannot be rewritten and must never be hidden by a supersession.
  if (left.pinned || right.pinned) return { ...base, outcome: 'unresolved', reason: 'pinned' };

  const resolved = (winner: MemoryRecord, loser: MemoryRecord, reason: ContradictionReason): ContradictionDecision =>
    ({ ...base, outcome: 'resolved', winnerId: winner.id, loserId: loser.id, reason });

  if (Math.abs(leftScore - rightScore) >= policy.confidenceMargin) {
    return leftScore > rightScore ? resolved(left, right, 'confidence-margin') : resolved(right, left, 'confidence-margin');
  }
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)
    && left.category === right.category && Math.abs(leftTime - rightTime) >= policy.recencyGapMs) {
    return leftTime > rightTime ? resolved(left, right, 'recency') : resolved(right, left, 'recency');
  }
  return { ...base, outcome: 'unresolved', reason: 'tie' };
}
