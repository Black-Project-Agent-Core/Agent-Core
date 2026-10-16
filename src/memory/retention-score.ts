import type { MemoryRecord } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION_PARAMS = Object.freeze({
  lambda: 0.02,
  sigma: 0.6,
  mu: 0.04,
  reviewThreshold: 0.2,
});

export interface RetentionScore {
  score: number;
  ageDays: number;
  accessCount: number;
  daysSinceAccess: number | null;
  salience: number;
}

function finiteDays(now: number, value: string): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (now - parsed) / DAY_MS);
}

export function scoreMemoryRetention(record: MemoryRecord, now = Date.now(), salience = 1): RetentionScore | null {
  const ageDays = finiteDays(now, record.updatedAt);
  if (ageDays === null) return null;
  const daysSinceAccess = record.lastAccessedAt ? finiteDays(now, record.lastAccessedAt) : null;
  if (record.lastAccessedAt && daysSinceAccess === null) return null;
  const accessCount = Math.max(0, Number.isSafeInteger(record.retrievalCount) ? record.retrievalCount : 0);
  const boundedSalience = Number.isFinite(salience) ? Math.max(0.25, Math.min(2, salience)) : 1;
  const timeTerm = boundedSalience * Math.exp(-RETENTION_PARAMS.lambda * ageDays);
  const accessTerm = daysSinceAccess === null
    ? 0
    : RETENTION_PARAMS.sigma * Math.log1p(accessCount) * Math.exp(-RETENTION_PARAMS.mu * daysSinceAccess);
  const score = timeTerm + accessTerm;
  if (!Number.isFinite(score)) return null;
  return { score, ageDays, accessCount, daysSinceAccess, salience: boundedSalience };
}
