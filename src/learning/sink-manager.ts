import type { LearningCandidate, LearningReviewOutcome } from './types.js';
import type { LearningSink } from './sink.js';

export class LearningSinkManager {
  constructor(private readonly sinks: LearningSink[]) {}

  async health(): Promise<Array<{ name: string; available: boolean; issue?: string }>> {
    const output = [];
    for (const sink of this.sinks) {
      try {
        output.push({ name: sink.name, ...(await sink.health()) });
      } catch (error) {
        output.push({
          name: sink.name,
          available: false,
          issue: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return output;
  }

  async capture(candidate: LearningCandidate): Promise<LearningReviewOutcome> {
    const sink = this.sinks.find((item) => item.classifySupport(candidate));
    if (!sink) return { kind: candidate.kind, status: 'rejected', reason: 'no learning sink supports this candidate' };

    try {
      if (!await sink.isAvailable()) {
        return { kind: candidate.kind, status: 'sink-unavailable', sink: sink.name, reason: 'target learning sink is unavailable' };
      }
      const duplicates = await sink.findDuplicates(candidate);
      if (duplicates.length) {
        return {
          kind: candidate.kind,
          status: 'duplicate',
          sink: sink.name,
          id: duplicates[0]?.id,
          reason: duplicates[0]?.reason ?? 'duplicate knowledge exists',
        };
      }

      const captured = await sink.capture(candidate);
      return {
        kind: candidate.kind,
        status: 'captured',
        sink: sink.name,
        ...(captured.id ? { id: captured.id } : {}),
      };
    } catch (error) {
      return {
        kind: candidate.kind,
        status: 'sink-failed',
        sink: sink.name,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
