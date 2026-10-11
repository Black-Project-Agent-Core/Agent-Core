import type { LearningReviewOutcome, LearningReviewSummary } from './types.js';

/** Summarize outcomes, never infer absence of knowledge from a failed capture. */
export function summarizeLearningReview(outcomes: LearningReviewOutcome[]): LearningReviewSummary {
  const counts: LearningReviewSummary['counts'] = {
    captured: 0, proposal: 0, duplicate: 0, rejected: 0,
    'sink-unavailable': 0, 'sink-failed': 0,
  };
  for (const outcome of outcomes) counts[outcome.status]++;
  const pendingTarget = outcomes.some(outcome => outcome.status === 'proposal' && outcome.curation?.target);
  const failures = counts.rejected + counts['sink-unavailable'] + counts['sink-failed'];
  const status: LearningReviewSummary['status'] = outcomes.length === 0 ? 'no-new-knowledge'
    : failures > 0 ? (counts.captured > 0 ? 'partial' : 'incomplete')
    : pendingTarget ? (counts.captured > 0 ? 'partial' : 'awaiting-verification')
    : counts.captured > 0 ? 'captured'
    : counts.proposal > 0 ? 'awaiting-verification' : 'duplicates-only';
  return { status, complete: failures === 0 && !pendingTarget, counts };
}
