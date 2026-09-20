import { assertLearningTextSafe } from '../memory/safety.js';
import type { LearningCandidate, LearningReviewOutcome } from './types.js';
import { LearningSinkManager } from './sink-manager.js';

const EVIDENCE_PREFIX = /^(?:tool|activity|memory|file|grafel|source|verification|user-correction):/i;

function validateEvidenceRefs(refs: string[]): string[] {
  const output = [...new Set(refs.map((value) => value.trim()).filter(Boolean))].slice(0, 32);
  for (const ref of output) {
    if (ref.length > 1000) throw new Error('Learning evidence reference is too long');
    if (!EVIDENCE_PREFIX.test(ref)) {
      throw new Error(`Unsupported learning evidence reference: ${ref}`);
    }
    assertLearningTextSafe(ref);
  }
  return output;
}

function validateCandidate(candidate: LearningCandidate): LearningCandidate {
  const content = candidate.content.trim();
  if (!content) throw new Error('Learning candidate content is required');
  if (content.length > 50_000) throw new Error('Learning candidate content is too large');
  assertLearningTextSafe(content);

  const evidenceRefs = validateEvidenceRefs(candidate.evidenceRefs);
  if (candidate.verified && !evidenceRefs.length) {
    throw new Error('Verified learning candidate requires evidenceRefs');
  }
  if (candidate.kind === 'operational-reflection' && candidate.verified && !candidate.reuseCondition?.trim()) {
    throw new Error('Verified operational reflection requires reuseCondition');
  }
  if (candidate.kind === 'code-pattern' && candidate.verified && !candidate.workspace?.trim()) {
    throw new Error('Verified code pattern requires workspace');
  }

  return {
    ...candidate,
    ...(candidate.title?.trim() ? { title: candidate.title.trim() } : {}),
    content,
    evidenceRefs,
    ...(candidate.reuseCondition?.trim() ? { reuseCondition: candidate.reuseCondition.trim() } : {}),
    ...(candidate.workspace?.trim() ? { workspace: candidate.workspace.trim() } : {}),
    tags: [...new Set((candidate.tags ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 32),
    steps: (candidate.steps ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 50),
    exemplars: (candidate.exemplars ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 100),
  };
}

export class LearningReviewCoordinator {
  constructor(private readonly sinks: LearningSinkManager) {}

  async review(candidates: LearningCandidate[], explicit = false): Promise<LearningReviewOutcome[]> {
    if (!candidates.length) return [];
    if (candidates.length > 25) throw new Error('Learning review supports at most 25 candidates');

    const output: LearningReviewOutcome[] = [];
    for (const raw of candidates) {
      try {
        const candidate = validateCandidate(raw);
        if (!candidate.verified) {
          output.push({
            kind: candidate.kind,
            status: 'proposal',
            reason: explicit
              ? 'candidate is unverified; explicit learn bypasses trigger thresholds but not verification'
              : 'candidate is unverified and was not persisted',
          });
          continue;
        }
        output.push(await this.sinks.capture(candidate));
      } catch (error) {
        output.push({
          kind: raw.kind,
          status: 'rejected',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return output;
  }
}
