import type { MemoryService } from '../memory/service.js';
import type { LearningJourney, LearningJourneyEdge, LearningJourneyNode } from './types.js';
import type { CodePatternLearningSink } from './code-pattern-sink.js';

export class LearningJourneyBuilder {
  constructor(
    private readonly memory: MemoryService,
    private readonly patterns?: CodePatternLearningSink,
  ) {}

  async build(workspace?: string): Promise<LearningJourney> {
    const records = await this.memory.list(workspace);
    const nodes: LearningJourneyNode[] = records.map((record) => ({
      id: `memory:${record.id}`,
      type: 'memory',
      label: record.title ?? record.id,
      category: record.category,
      retrievalCount: record.retrievalCount,
    }));
    const edges: LearningJourneyEdge[] = [];

    for (const record of records) {
      for (const link of record.links) {
        edges.push({
          from: `memory:${record.id}`,
          to: `memory:${link.targetId}`,
          type: link.type,
          strength: link.strength,
        });
      }
    }

    let patternsAvailable = false;
    let patternsSampled = false;

    if (workspace && this.patterns) {
      try {
        patternsAvailable = await this.patterns.isAvailable();
        if (patternsAvailable) {
          const patterns = await this.patterns.samplePatterns(workspace);
          patternsSampled = true;
          for (const pattern of patterns) {
            const id = String(pattern?.id ?? pattern?.pattern_id ?? '').trim();
            if (!id) continue;
            nodes.push({
              id: `pattern:${id}`,
              type: 'pattern',
              label: String(pattern?.trigger?.natural_language ?? pattern?.trigger?.naturalLanguage ?? id),
              category: String(pattern?.category ?? 'code'),
              workspace,
            });
            const exemplars = Array.isArray(pattern?.exemplars) ? pattern.exemplars : [];
            for (const exemplar of exemplars) {
              const target = String(exemplar ?? '').trim();
              if (!target) continue;
              edges.push({
                from: `pattern:${id}`,
                to: `evidence:${target}`,
                type: 'exemplar',
              });
            }
          }
        }
      } catch {
        patternsAvailable = false;
      }
    }

    return {
      nodes,
      edges,
      stats: {
        memoryNodes: nodes.filter((node) => node.type === 'memory').length,
        patternNodes: nodes.filter((node) => node.type === 'pattern').length,
        edges: edges.length,
        patternsAvailable,
        patternsSampled,
      },
    };
  }
}
