import type {
  LearningCheckpointInput,
  LearningCheckpointResult,
  LearningConfig,
  LearningState,
  LearningTriggerReason,
} from './types.js';

const IMMEDIATE = new Set<LearningTriggerReason>([
  'user-correction',
  'verified-recovery',
  'explicit-learn',
]);

export function isCuratorDue(state: LearningState, config: LearningConfig, now = Date.now()): boolean {
  if (!config.enabled) return false;
  if (!state.lastCuratorAt) return true;
  const elapsed = now - Date.parse(state.lastCuratorAt);
  return elapsed >= config.curatorIntervalHours * 60 * 60 * 1000;
}

/**
 * A pending review older than this is backlog, not an invitation: the context that would let anyone
 * judge it has usually gone, and counting it as "due" makes every later checkpoint look due as well.
 */
export const PENDING_REVIEW_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function isStalePendingReview(item: { createdAt: string }, now = Date.now()): boolean {
  const created = Date.parse(item.createdAt);
  return Number.isFinite(created) && now - created > PENDING_REVIEW_STALE_MS;
}

export function applyCheckpoint(
  state: LearningState,
  input: LearningCheckpointInput,
  config: LearningConfig,
  now = new Date(),
): { state: LearningState; result: LearningCheckpointResult } {
  const key = input.idempotencyKey.trim();
  if (!key) throw new Error('Learning checkpoint idempotencyKey is required');
  const pendingReviews = state.pendingReviews ?? [];
  const duplicate = state.recentIdempotency.some((item) => item.key === key)
    || pendingReviews.some(item => item.idempotencyKey === key)
    || Boolean(state.reviewDecisions?.[key]?.complete);
  const meaningful = input.meaningful !== false && (input.reason ?? 'task-complete') !== 'status';
  const reason = input.reason ?? 'task-complete';

  if (duplicate) {
    const pendingReview = pendingReviews.find((item) => item.idempotencyKey === key);
    const effectiveReason = pendingReview?.reason ?? reason;
    return {
      state,
      result: {
        duplicate: true,
        advanced: false,
        reviewDue: Boolean(pendingReview),
        reviewReason: pendingReview ? effectiveReason : null,
        checkpointCount: state.checkpointCount,
        sinceReview: state.sinceReview,
        curatorDue: isCuratorDue(state, config, now.getTime()),
        pendingReviewCount: pendingReviews.length,
        ...(pendingReview ? { pendingReview } : {}),
      },
    };
  }

  const createdAt = now.toISOString();
  const pendingReview = meaningful ? {
    idempotencyKey: key.slice(0, 200),
    reason: reason as Exclude<LearningTriggerReason, 'status'>,
    evidenceRefs: input.evidenceRefs ?? [],
    ...(input.workspace?.trim() ? { workspace: input.workspace.trim().slice(0, 200) } : {}),
    createdAt,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.summary?.trim() ? { summary: input.summary.trim().slice(0, 500) } : {}),
  } : undefined;
  const nextPendingReviews = pendingReview
    ? [...pendingReviews, pendingReview]
    : pendingReviews;
  const next: LearningState = {
    ...state,
    checkpointCount: state.checkpointCount + (meaningful ? 1 : 0),
    sinceReview: state.sinceReview + (meaningful ? 1 : 0),
    lastCheckpointAt: createdAt,
    recentIdempotency: [...state.recentIdempotency, { key: key.slice(0, 200), at: createdAt }].slice(-64),
    pendingReviews: nextPendingReviews,
  };

  return {
    state: next,
    result: {
      duplicate: false,
      advanced: meaningful,
      reviewDue: meaningful,
      reviewReason: meaningful ? reason : null,
      checkpointCount: next.checkpointCount,
      sinceReview: next.sinceReview,
      curatorDue: isCuratorDue(next, config, now.getTime()),
      pendingReviewCount: nextPendingReviews.length,
      ...(pendingReview ? { pendingReview } : {}),
    },
  };
}

export function markReviewed(state: LearningState, now = new Date(), checkpointKeys: string[] = []): LearningState {
  const reviewed = new Set(checkpointKeys);
  const pendingReviews = (state.pendingReviews ?? []).filter(item => !reviewed.has(item.idempotencyKey));
  return {
    ...state,
    sinceReview: pendingReviews.length,
    lastReviewAt: now.toISOString(),
    pendingReviews,
  };
}

export function markCurated(state: LearningState, now = new Date()): LearningState {
  return {
    ...state,
    lastCuratorAt: now.toISOString(),
  };
}
