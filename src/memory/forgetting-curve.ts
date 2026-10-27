import type { RetentionScore } from './retention-score.js';
import type { MemoryRecord } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ebbinghaus-style forgetting model: retrievability R = exp(-t / S), where t is the
 * time since the record was last reinforced (written or recalled) and the stability S
 * grows with access frequency, salience and epistemic confidence (spaced repetition).
 * Unlike the legacy additive retention score this stays in 0..1, so its review
 * threshold is different and the caller picks the matching one.
 */
export const FORGETTING_PARAMS = Object.freeze({
  baseStabilityDays: 14,
  reinforcement: 0.9,
  minStabilityDays: 1,
  maxStabilityDays: 3650,
  reviewThreshold: 0.3,
});

export interface ForgettingScore extends RetentionScore {
  /** R in 0..1: probability-like measure that the memory is still worth keeping active. */
  retrievability: number;
  stabilityDays: number;
}

function elapsedDays(now: number, value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, (now - parsed) / DAY_MS) : null;
}

export function scoreMemoryForgetting(
  record: MemoryRecord,
  now = Date.now(),
  inputs: { salience?: number; confidence?: number } = {},
): ForgettingScore | null {
  const ageDays = elapsedDays(now, record.updatedAt);
  if (ageDays === null) return null;
  const daysSinceAccess = record.lastAccessedAt ? elapsedDays(now, record.lastAccessedAt) : null;
  if (record.lastAccessedAt && daysSinceAccess === null) return null;
  const accessCount = Math.max(0, Number.isSafeInteger(record.retrievalCount) ? record.retrievalCount : 0);
  const salience = Number.isFinite(inputs.salience) ? Math.max(0.25, Math.min(2, Number(inputs.salience))) : 1;
  const confidence = Number.isFinite(inputs.confidence) ? Math.max(0, Math.min(1, Number(inputs.confidence))) : 0.5;

  const sinceReinforced = daysSinceAccess === null ? ageDays : Math.min(ageDays, daysSinceAccess);
  const stabilityDays = Math.max(
    FORGETTING_PARAMS.minStabilityDays,
    Math.min(
      FORGETTING_PARAMS.maxStabilityDays,
      FORGETTING_PARAMS.baseStabilityDays
        * (1 + FORGETTING_PARAMS.reinforcement * Math.log1p(accessCount))
        * salience
        * (0.5 + confidence),
    ),
  );
  const retrievability = Math.exp(-sinceReinforced / stabilityDays);
  if (!Number.isFinite(retrievability)) return null;
  return { score: retrievability, retrievability, stabilityDays, ageDays, accessCount, daysSinceAccess, salience };
}
