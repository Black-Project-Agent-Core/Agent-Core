import type { TrackerEvent } from '../tracker/activity-tracker.js';
import type { LearningCuratorProposal } from './types.js';

const POSITIVE = new Set(['success', 'pass', 'passed', 'improved', 'resolved', 'available', 'healthy']);
const NEGATIVE = new Set(['failure', 'fail', 'failed', 'regressed', 'error', 'degraded', 'unavailable', 'rejected']);

interface Aggregate {
  featureId: string;
  positive: number;
  negative: number;
  evidenceRefs: string[];
}

function polarity(outcome: string): 1 | -1 | 0 {
  const normalized = outcome.trim().toLowerCase();
  if (POSITIVE.has(normalized)) return 1;
  if (NEGATIVE.has(normalized)) return -1;
  return 0;
}

export function buildFeatureOutcomeProposals(events: TrackerEvent[]): LearningCuratorProposal[] {
  const byFeature = new Map<string, Aggregate>();
  const seen = new Set<string>();
  for (const event of events) {
    if (!event.featureOutcome || seen.has(event.id)) continue;
    seen.add(event.id);
    const direction = polarity(event.featureOutcome.outcome);
    if (direction === 0) continue;
    const featureId = event.featureOutcome.featureId;
    const aggregate = byFeature.get(featureId) ?? { featureId, positive: 0, negative: 0, evidenceRefs: [] };
    if (direction > 0) aggregate.positive += 1;
    else aggregate.negative += 1;
    aggregate.evidenceRefs.push(`activity:${event.id}`);
    byFeature.set(featureId, aggregate);
  }

  const proposals: LearningCuratorProposal[] = [];
  for (const aggregate of [...byFeature.values()].sort((a, b) => a.featureId.localeCompare(b.featureId))) {
    const total = aggregate.positive + aggregate.negative;
    if (total < 2) continue;
    const score = (aggregate.positive - aggregate.negative) / (total + 2);
    if (Math.abs(score) < 0.25) continue;
    proposals.push({
      recommendation: 'review-feature-outcome',
      featureId: aggregate.featureId,
      evidenceRefs: aggregate.evidenceRefs.slice(-16),
      support: {
        positive: aggregate.positive,
        negative: aggregate.negative,
        score,
      },
      reason: `feature outcome evidence suggests explicit review; positive=${aggregate.positive}, negative=${aggregate.negative}, shrunkScore=${score.toFixed(4)}`,
    });
  }
  return proposals;
}
