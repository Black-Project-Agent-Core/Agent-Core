import type { MemoryService } from '../memory/service.js';
import type { LearningCandidate } from './types.js';
import type { LearningCaptureResult, LearningSink, LearningSinkHealth } from './sink.js';

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function categoryFor(candidate: LearningCandidate): string {
  if (candidate.kind === 'operational-reflection') return 'operational-reflection';
  if (candidate.kind === 'architecture') return 'learning-architecture';
  return 'learned-fact';
}

export class MemoryLearningSink implements LearningSink {
  readonly name = 'memory';

  constructor(private readonly memory: MemoryService) {}

  async isAvailable(): Promise<boolean> {
    const health = this.memory.health();
    return health.status !== 'error' && health.canonicalStore !== 'error';
  }

  async health(): Promise<LearningSinkHealth> {
    const health = this.memory.health();
    return {
      available: health.status !== 'error' && health.canonicalStore !== 'error',
      ...(health.status === 'error' ? { issue: 'MemoryService unavailable' } : {}),
    };
  }

  classifySupport(candidate: LearningCandidate): boolean {
    return candidate.kind !== 'code-pattern';
  }

  async findDuplicates(candidate: LearningCandidate): Promise<Array<{ id?: string; reason: string }>> {
    const target = normalized(candidate.content);
    const title = normalized(candidate.title ?? '');
    const records = await this.memory.list();
    return records
      .filter((record) => !record.pinned)
      .filter((record) => {
        if (normalized(record.content) === target) return true;
        return Boolean(title && normalized(record.title ?? '') === title && normalized(record.category) === normalized(categoryFor(candidate)));
      })
      .map((record) => ({ id: record.id, reason: 'equivalent durable memory already exists' }));
  }

  async capture(candidate: LearningCandidate): Promise<LearningCaptureResult> {
    const evidence = candidate.evidenceRefs.join(', ').slice(0, 480);
    const record = await this.memory.remember({
      ...(candidate.title ? { title: candidate.title } : {}),
      content: candidate.content,
      context: candidate.reuseCondition
        ? `Reusable when: ${candidate.reuseCondition}`
        : 'Captured by Agent Core learning review.',
      tags: [...new Set(['learning', candidate.kind, ...(candidate.tags ?? [])])],
      category: categoryFor(candidate),
      source: { type: 'learning-review', ...(evidence ? { ref: evidence } : {}) },
    });
    return { id: record.id };
  }
}
