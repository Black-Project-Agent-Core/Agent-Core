import { randomUUID } from 'node:crypto';
import { assertLearningTextSafe } from '../memory/safety.js';
import { createLearningDecision, validateDecisionMetadata } from './decision-evidence.js';
import { validateEffectEvidence } from './effect-evidence.js';
import type { LearningCandidate, LearningReviewOutcome } from './types.js';
import { LearningSinkManager } from './sink-manager.js';
import { assertEvaluatedClaimEligible, LearningEvidenceError, validateEvaluationEnvelope } from './evaluation.js';

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

  const evaluation = candidate.evaluation === undefined ? undefined : validateEvaluationEnvelope(candidate.evaluation);
  const effectEvidence = candidate.effectEvidence === undefined ? undefined : validateEffectEvidence(candidate.effectEvidence);
  return {
    ...candidate,
    ...validateDecisionMetadata(candidate),
    ...(evaluation ? { evaluation } : {}),
    ...(effectEvidence ? { effectEvidence } : {}),
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
    const reviewId = randomUUID();
    for (let index = 0; index < candidates.length; index++) {
      const raw = candidates[index];
      let candidate: LearningCandidate | undefined;
      let evaluated: Pick<LearningReviewOutcome, 'evaluation' | 'evidenceValidation' | 'verificationValidation'> = {};
      try {
        candidate = validateCandidate(raw);
        if (candidate.evaluation) evaluated = { evaluation: candidate.evaluation, evidenceValidation: 'declared' };
        if (!candidate.verified || (candidate.effectEvidence?.claimType === 'behavioral-outcome' && candidate.effectEvidence.status !== 'observed')) {
          output.push({
            kind: candidate.kind,
            status: 'proposal',
            ...evaluated,
            reason: explicit
              ? 'candidate or behavioral effect is unverified; explicit learn bypasses trigger thresholds but not verification'
              : 'candidate or behavioral effect is unverified and was not persisted',
          });
          continue;
        }
        if (candidate.evaluation) assertEvaluatedClaimEligible(candidate.evaluation);
        if (candidate.evaluation?.verification?.verdict === 'pass')
          evaluated.verificationValidation = 'controller-attested-recomputation';
        output.push({ ...await this.sinks.capture(candidate), ...evaluated });
      } catch (error) {
        output.push({
          kind: raw.kind,
          status: 'rejected',
          ...evaluated,
          reasonCode: error instanceof LearningEvidenceError ? error.reasonCode : 'candidate-invalid',
          reason: error instanceof Error ? error.message : String(error),
        });
      } finally {
        const outcome = output[output.length - 1];
        outcome.decision = createLearningDecision(candidate, raw, reviewId, index);
        if (outcome.status === 'captured' && candidate?.corrections?.length)
          outcome.declaredCorrections = candidate.corrections;
      }
    }
    return output;
  }
}
