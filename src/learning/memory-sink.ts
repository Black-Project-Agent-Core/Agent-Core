import type { MemoryService } from '../memory/service.js';
import { normalizeMemoryWorkspace } from '../memory/provenance.js';
import type { LearningCandidate } from './types.js';
import { validateDecisionMetadata } from './decision-evidence.js';
import type { LearningCaptureResult, LearningSink, LearningSinkHealth } from './sink.js';

function workspaceOf(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeMemoryWorkspace(value);
}

function contextFor(candidate: LearningCandidate): string {
  return candidate.reuseCondition?.trim()
    ? `Reusable when: ${candidate.reuseCondition.trim()}`
    : 'Captured by Agent Core learning review.';
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
    const workspace = candidate.workspace ? this.memory.resolveWorkspace(candidate.workspace) : undefined;
    const records = await this.memory.list();
    return records
      .filter((record) => !record.pinned)
      .filter((record) => (record.provenance?.workspace ? this.memory.resolveWorkspace(record.provenance.workspace) : undefined) === workspace)
      // A shared title is not evidence that a changed lesson has the same meaning.
      // Preserve code case/whitespace and different applicability conditions.
      .filter((record) => record.content.trim() === candidate.content.trim()
        && record.category === categoryFor(candidate)
        && record.context.trim() === contextFor(candidate))
      .map((record) => ({ id: record.id, reason: 'same-scope content and reuse condition already exist' }));
  }

  async capture(candidate: LearningCandidate): Promise<LearningCaptureResult> {
    const { auditRef } = validateDecisionMetadata(candidate);
    const evidence = auditRef ?? candidate.evidenceRefs.join(', ').slice(0, 480);
    const workspace = candidate.workspace ? this.memory.resolveWorkspace(candidate.workspace) : undefined;
    const record = await this.memory.remember({
      ...(candidate.title ? { title: candidate.title } : {}),
      content: candidate.content,
      context: contextFor(candidate),
      ...(workspace !== undefined ? { provenance: { workspace, files: [] } } : {}),
      tags: [...new Set(['learning', candidate.kind, ...(candidate.tags ?? [])])],
      category: categoryFor(candidate),
      source: { type: 'learning-review', ...(evidence ? { ref: evidence } : {}) },
    });
    return { id: record.id };
  }
}
