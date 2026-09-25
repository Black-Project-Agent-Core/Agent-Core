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

export function applyCheckpoint(
  state: LearningState,
  input: LearningCheckpointInput,
  config: LearningConfig,
  now = new Date(),
): { state: LearningState; result: LearningCheckpointResult } {
  const key = input.idempotencyKey.trim();
  if (!key) throw new Error('Learning checkpoint idempotencyKey is required');
  const duplicate = state.recentIdempotency.some((item) => item.key === key);
  const meaningful = input.meaningful !== false && (input.reason ?? 'task-complete') !== 'status';
  const reason = input.reason ?? 'task-complete';

  if (duplicate) {
    return {
      state,
      result: {
        duplicate: true,
        advanced: false,
        reviewDue: IMMEDIATE.has(reason) || state.sinceReview >= config.reviewInterval,
        reviewReason: IMMEDIATE.has(reason) ? reason : state.sinceReview >= config.reviewInterval ? 'periodic' : null,
        checkpointCount: state.checkpointCount,
        sinceReview: state.sinceReview,
        curatorDue: isCuratorDue(state, config, now.getTime()),
      },
    };
  }

  const next: LearningState = {
    ...state,
    checkpointCount: state.checkpointCount + (meaningful ? 1 : 0),
    sinceReview: state.sinceReview + (meaningful ? 1 : 0),
    lastCheckpointAt: now.toISOString(),
    recentIdempotency: [...state.recentIdempotency, { key: key.slice(0, 200), at: now.toISOString() }].slice(-64),
  };
  const immediate = IMMEDIATE.has(reason);
  const periodic = meaningful && next.sinceReview >= config.reviewInterval;

  return {
    state: next,
    result: {
      duplicate: false,
      advanced: meaningful,
      reviewDue: immediate || periodic,
      reviewReason: immediate ? reason : periodic ? 'periodic' : null,
      checkpointCount: next.checkpointCount,
      sinceReview: next.sinceReview,
      curatorDue: isCuratorDue(next, config, now.getTime()),
    },
  };
}

export function markReviewed(state: LearningState, now = new Date()): LearningState {
  return {
    ...state,
    sinceReview: 0,
    lastReviewAt: now.toISOString(),
  };
}

export function markCurated(state: LearningState, now = new Date()): LearningState {
  return {
    ...state,
    lastCuratorAt: now.toISOString(),
  };
}
