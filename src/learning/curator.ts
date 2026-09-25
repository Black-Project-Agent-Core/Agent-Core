import type { MemoryService } from '../memory/service.js';
import type { LearningCuratorProposal } from './types.js';
import type { CodePatternLearningSink } from './code-pattern-sink.js';

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export class LearningCurator {
  constructor(
    private readonly memory: MemoryService,
    private readonly patterns?: CodePatternLearningSink,
  ) {}

  async propose(workspace?: string): Promise<LearningCuratorProposal[]> {
    const proposals: LearningCuratorProposal[] = [];
    const records = await this.memory.list();
    const now = Date.now();

    for (const record of records) {
      if (record.pinned) continue;
      const accessBase = record.lastAccessedAt ?? record.updatedAt;
      const age = now - Date.parse(accessBase);
      if (record.retrievalCount === 0 && Number.isFinite(age) && age >= STALE_MS) {
        proposals.push({
          recommendation: 'review-stale',
          memoryIds: [record.id],
          reason: 'memory has not been recalled and is older than the conservative stale-review window',
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
