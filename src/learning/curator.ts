import type { MemoryService } from '../memory/service.js';
import type { LearningCuratorProposal } from './types.js';
import type { CodePatternLearningSink } from './code-pattern-sink.js';
import { RETENTION_PARAMS, scoreMemoryRetention } from './retention-score.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { buildFeatureOutcomeProposals } from './feature-outcome-pool.js';

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

type RankedStale = { proposal: LearningCuratorProposal; score: number; id: string };

export class LearningCurator {
  constructor(
    private readonly memory: MemoryService,
    private readonly patterns?: CodePatternLearningSink,
  ) {}

  async propose(workspace?: string): Promise<LearningCuratorProposal[]> {
    const proposals: LearningCuratorProposal[] = [];
    const stale: RankedStale[] = [];
    const records = await this.memory.list(workspace);
    const salienceByMemory = await this.memory.feedbackSalienceMap();
    const now = Date.now();

    for (const record of records) {
      if (record.pinned) continue;
      const accessBase = record.lastAccessedAt ?? record.updatedAt;
      const age = now - Date.parse(accessBase);
      const retention = scoreMemoryRetention(record, now, salienceByMemory.get(record.id) ?? 1);
      const legacyStale = record.retrievalCount === 0 && Number.isFinite(age) && age >= STALE_MS;
      const scoreStale = retention !== null && retention.score < RETENTION_PARAMS.reviewThreshold;
      if (legacyStale || scoreStale) {
        const scoreText = retention ? retention.score.toFixed(4) : 'unavailable';
        stale.push({
          score: retention?.score ?? Number.POSITIVE_INFINITY,
          id: record.id,
          proposal: {
            recommendation: 'review-stale',
            memoryIds: [record.id],
            reason: `retention score ${scoreText}; salience ${retention?.salience.toFixed(2) ?? 'unavailable'}; explicit review recommended (threshold ${RETENTION_PARAMS.reviewThreshold})`,
          },
        });
      }
      for (const link of record.links) {
        if (link.type !== 'contradicts') continue;
        proposals.push({
          recommendation: 'review-contradiction',
          memoryIds: [record.id, link.targetId],
          reason: link.reason ?? 'typed contradiction link requires explicit review',
        });
      }
    }

    stale.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    proposals.unshift(...stale.map((item) => item.proposal));

    proposals.push(...buildFeatureOutcomeProposals(activityTracker.readFeatureOutcomes({
      maxEvents: 512,
      maxAgeMs: 90 * 24 * 60 * 60 * 1000,
      ...(workspace ? { workspace } : {}),
    })));

    for (const candidate of await this.memory.consolidate({ limit: 20 })) {
      proposals.push({
        recommendation: candidate.recommendation,
        memoryIds: [candidate.leftId, candidate.rightId],
        reason: `combined overlap score ${candidate.combinedScore}`,
      });
    }

    if (workspace && this.patterns && await this.patterns.isAvailable()) {
      try {
        const patterns = await this.patterns.samplePatterns(workspace);
        for (const pattern of patterns) {
          const confidence = Number(pattern?.confidence ?? pattern?.score ?? 1);
          const uses = Number(pattern?.use_count ?? pattern?.uses ?? 1);
          if ((Number.isFinite(confidence) && confidence < 0.35) || (Number.isFinite(uses) && uses === 0)) {
            const id = String(pattern?.id ?? pattern?.pattern_id ?? '');
            if (!id) continue;
            proposals.push({
              recommendation: 'review-pattern-refine',
              patternId: id,
              reason: 'pattern lifecycle metadata suggests explicit refinement review',
            });
          }
        }
      } catch {
        // Curator is proposal-only and pattern inspection is fail-soft.
      }
    }

    const seen = new Set<string>();
    return proposals.filter((proposal) => {
      const key = JSON.stringify([proposal.recommendation, proposal.memoryIds ?? [], proposal.patternId ?? '']);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 100);
  }
}
