import { isStalePendingReview } from './triggers.js';
import type { LearningState, PendingLearningReview } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_LIMIT = 25;
const RECENT_DECISIONS = 10;

/** Counts that do not depend on which view the caller asked for. */
export function pendingBacklog(pending: PendingLearningReview[], now: number) {
  const stale = pending.filter(item => isStalePendingReview(item, now));
  const times = pending.map(item => Date.parse(item.createdAt)).filter(Number.isFinite);
  return {
    pendingReviewCount: pending.length,
    freshReviewCount: pending.length - stale.length,
    staleReviewCount: stale.length,
    ...(times.length ? { oldestPendingAt: new Date(Math.min(...times)).toISOString() } : {}),
  };
}

/**
 * What a reviewer needs to decide what to do next, without the history: the full state grows with
 * every decision ever taken, so a status call that returns it costs more with each task.
 */
export function compactStatus(state: LearningState, now: number, base: Record<string, unknown>) {
  const pending = state.pendingReviews ?? [];
  const ordered = [...pending].sort((a, b) => {
    const staleDelta = Number(isStalePendingReview(a, now)) - Number(isStalePendingReview(b, now));
    return staleDelta || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
  const decisions = Object.entries(state.reviewDecisions ?? {});
  const byStatus: Record<string, number> = {};
  for (const [, decision] of decisions) byStatus[decision.status] = (byStatus[decision.status] ?? 0) + 1;
  return {
    view: 'compact' as const,
    ...base,
    checkpointCount: state.checkpointCount,
    sinceReview: state.sinceReview,
    lastCheckpointAt: state.lastCheckpointAt,
    lastReviewAt: state.lastReviewAt,
    pending: ordered.slice(0, PENDING_LIMIT).map(item => ({
      idempotencyKey: item.idempotencyKey,
      reason: item.reason,
      createdAt: item.createdAt,
      ageDays: Math.max(0, Math.floor((now - Date.parse(item.createdAt)) / DAY_MS)),
      stale: isStalePendingReview(item, now),
      ...(item.workspace ? { workspace: item.workspace } : {}),
      hasTask: Boolean(item.taskId),
      ...(item.taskId ? { taskId: item.taskId } : {}),
      evidenceRefCount: item.evidenceRefs.length,
      ...(item.summary ? { summary: item.summary } : {}),
    })),
    pendingOmitted: Math.max(0, pending.length - PENDING_LIMIT),
    decisions: {
      total: decisions.length,
      byStatus,
      incomplete: decisions.filter(([, decision]) => !decision.complete).length,
      recent: decisions
        .map(([idempotencyKey, decision]) => ({ idempotencyKey, status: decision.status, complete: decision.complete, reviewedAt: decision.reviewedAt }))
        .sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt))
        .slice(0, RECENT_DECISIONS),
    },
    counts: {
      procedures: (state.procedures ?? []).length,
      skillProposals: (state.skillProposals ?? []).length,
      externalImprovements: (state.externalImprovements ?? []).length,
    },
  };
}
