import { isMemoryLinkActive } from './relations.js';
import type { MemoryRecord } from './types.js';

/**
 * Epistemic confidence is derived at read time from fields the canonical store
 * already persists. Nothing here changes the note format, so it is reversible by
 * simply not calling it. The result is advisory evidence, never proof of truth.
 */
export type EpistemicStatus = 'verified' | 'supported' | 'inferred' | 'unverified' | 'contested';

export interface EpistemicAssessment {
  status: EpistemicStatus;
  /** 0.05..0.99, comparative only. */
  confidence: number;
  factors: string[];
}

export interface EpistemicLinkCounts {
  supports: number;
  contradicts: number;
}

const VERIFIED_TAGS = new Set(['verified', 'confirmed', 'fact']);
const INFERRED_TAGS = new Set(['inferred', 'hypothesis', 'assumption', 'speculation', 'rem-consolidated']);

/** Counts active supports/contradicts links in both directions, skipping superseded endpoints. */
export function buildEpistemicLinkIndex(records: MemoryRecord[], now = Date.now()): Map<string, EpistemicLinkCounts> {
  const byId = new Map(records.map((record) => [record.id, record]));
  const superseded = new Set(records.flatMap((record) => record.links
    .filter((link) => link.type === 'supersedes' && isMemoryLinkActive(link, now))
    .map((link) => link.targetId)));
  const counts = new Map<string, EpistemicLinkCounts>();
  const bump = (id: string, field: keyof EpistemicLinkCounts): void => {
    const current = counts.get(id) ?? { supports: 0, contradicts: 0 };
    current[field] += 1;
    counts.set(id, current);
  };
  for (const record of records) {
    if (superseded.has(record.id)) continue;
    for (const link of record.links) {
      if (!isMemoryLinkActive(link, now) || !byId.has(link.targetId) || superseded.has(link.targetId)) continue;
      if (link.type === 'supports') {
        bump(record.id, 'supports');
        bump(link.targetId, 'supports');
      } else if (link.type === 'contradicts') {
        bump(record.id, 'contradicts');
        bump(link.targetId, 'contradicts');
      }
    }
  }
  return counts;
}

export function assessEpistemicConfidence(record: MemoryRecord, links?: EpistemicLinkCounts): EpistemicAssessment {
  const factors: string[] = [];
  let confidence = 0.35;
  let inferred = false;
  let verified = false;
  let supported = false;
  const adjust = (delta: number, factor: string): void => {
    confidence += delta;
    factors.push(factor);
  };

  if (record.version === 2) {
    const { verification, epistemic } = record.experience;
    if (verification.status === 'verified') { adjust(0.45, 'experience:verified'); verified = true; }
    else if (verification.status === 'supported') { adjust(0.25, 'experience:supported'); supported = true; }
    if (epistemic === 'fact') adjust(0.1, 'epistemic:fact');
    else if (epistemic === 'observation') adjust(0.05, 'epistemic:observation');
    else if (epistemic === 'hypothesis' || epistemic === 'prediction') { adjust(-0.15, `epistemic:${epistemic}`); inferred = true; }
    else if (epistemic === 'opinion') adjust(-0.1, 'epistemic:opinion');
  }

  const tags = new Set(record.tags.map((tag) => tag.trim().toLowerCase()));
  if ([...tags].some((tag) => VERIFIED_TAGS.has(tag))) { adjust(0.4, 'tag:verified'); verified = true; }
  if ([...tags].some((tag) => INFERRED_TAGS.has(tag))) { adjust(-0.2, 'tag:inferred'); inferred = true; }
  // The Learning sink only persists candidates that passed review with evidence.
  if (record.source?.type === 'learning-review') { adjust(0.25, 'source:learning-review'); supported = true; }
  if (record.source?.type === 'rem-consolidation') inferred = true;

  const provenance = record.provenance;
  if (provenance?.gitCommit || provenance?.sourceSnapshot?.files.some((file) => file.status === 'captured')) {
    adjust(0.1, 'provenance:anchored');
  }
  if (provenance?.files.length) adjust(0.05, 'provenance:files');

  const derivedOnly = record.links.length > 0
    && record.links.every((link) => link.type === 'derived-from');
  if (derivedOnly) { adjust(-0.1, 'links:derived-only'); inferred = true; }

  const supports = Math.min(3, links?.supports ?? 0);
  if (supports) { adjust(supports * 0.05, `links:supports=${supports}`); supported = true; }
  const contradicts = Math.min(2, links?.contradicts ?? 0);
  if (contradicts) adjust(-contradicts * 0.2, `links:contradicts=${contradicts}`);

  // Round before comparing so the status never depends on floating point noise.
  const score = Number(Math.max(0.05, Math.min(0.99, confidence)).toFixed(4));
  const status: EpistemicStatus = contradicts > 0 ? 'contested'
    : verified && score >= 0.75 ? 'verified'
      : inferred ? 'inferred'
        : supported && score >= 0.5 ? 'supported'
          : 'unverified';
  return { status, confidence: score, factors };
}

/** Bounded additive ranking influence in [-0.04, +0.04]; neutral at confidence 0.5. */
export function epistemicRankingInfluence(assessment: EpistemicAssessment): number {
  const value = (assessment.confidence - 0.5) * 0.08;
  return Math.max(-0.04, Math.min(0.04, value));
}
