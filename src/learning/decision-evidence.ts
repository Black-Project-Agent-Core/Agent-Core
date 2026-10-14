import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { isSafeLearningMetadata, LearningEvidenceError, safeEvidenceRefSchema, safeMetadataSchema } from './evaluation.js';
import type { LearningCandidate, LearningDecisionEvidence, LearningReviewOutcome } from './types.js';

export const learningDecisionFields = {
  candidateId: safeMetadataSchema(200).optional(),
  auditRef: safeEvidenceRefSchema(480).optional(),
  corrections: z.array(z.strictObject({
    kind: z.enum(['invalidates', 'supersedes']),
    targetCandidateId: safeMetadataSchema(200),
    reasonRef: safeEvidenceRefSchema(),
  })).max(8).optional(),
};
const metadataSchema = z.strictObject(learningDecisionFields);
export function validateDecisionMetadata(candidate: LearningCandidate): Pick<LearningCandidate, 'candidateId' | 'auditRef' | 'corrections'> {
  const result = metadataSchema.safeParse({candidateId:candidate.candidateId,auditRef:candidate.auditRef,corrections:candidate.corrections});
  if (!result.success) throw new LearningEvidenceError('evidence-invalid');
  return result.data;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter(key=>object[key]!==undefined).sort().map(key=>`${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
const digest = (value: unknown): string => 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');

/** Fingerprints describe normalized claims, not authenticated content or exactly-once keys. */
export function createLearningDecision(candidate: LearningCandidate | undefined, raw: LearningCandidate,
  reviewId: string, index: number): LearningDecisionEvidence {
  const rawId = learningDecisionFields.candidateId.safeParse(raw.candidateId);
  const candidateId = candidate?.candidateId ?? (rawId.success ? rawId.data : undefined) ?? `candidate-${index}`;
  const workspaceKey = digest(candidate?.workspace ?? '');
  const evidence = candidate?.evaluation?.evidence ?? candidate?.evidenceRefs ?? [];
  const corrections = candidate?.corrections ?? [];
  const effectEvidence = candidate?.effectEvidence;
  const fingerprint = candidate ? digest({
    purpose:candidate.purpose,kind:candidate.kind,title:candidate.title,content:candidate.content,verified:candidate.verified,
    evidenceRefs:candidate.evidenceRefs,evaluation:candidate.evaluation,auditRef:candidate.auditRef,
    effectEvidence:candidate.effectEvidence,
    corrections:candidate.corrections,reuseCondition:candidate.reuseCondition,
    tags:candidate.tags,steps:candidate.steps,exemplars:candidate.exemplars,
  }) : digest(['rejected-input',reviewId,index]);
  return { ...(candidate?.purpose ? { purpose: candidate.purpose } : {}), reviewId, candidateId, candidateKey:digest([reviewId,workspaceKey,candidateId]),workspaceKey,
    fingerprint,fingerprintBasis:candidate?'normalized-claim':'rejected-input',index,
    evidenceCount:evidence.length,evidenceDigest:digest(evidence),
    correctionCount:corrections.length,correctionsDigest:digest(corrections),
    effectClaimType:effectEvidence?.claimType,effectStatus:effectEvidence?.status,
    effectEvidenceDigest:effectEvidence?digest(effectEvidence):undefined };
}

export type LearningDecisionRecorder = (module: string, level: 'info' | 'warn' | 'success',
  message: string, kind: string, context: Record<string, unknown>) => unknown;
function safeLabel(value: string | undefined, max = 200): string | undefined {
  return value && value.length <= max && isSafeLearningMetadata(value) ? value : undefined;
}

/** Best-effort telemetry; recording can never repeat or veto a completed sink operation. */
export function recordLearningDecisions(outcomes: LearningReviewOutcome[], record: LearningDecisionRecorder): void {
  for (const outcome of outcomes) {
    const decision = outcome.decision;
    if (!decision) continue;
    const context: Record<string, unknown> = {
      ...decision, kind:safeLabel(outcome.kind,40) ?? 'unknown', outcome:outcome.status,
      reasonCode:outcome.reasonCode ?? outcome.status,
      evidenceRefsOmitted:decision.evidenceCount, correctionRefsOmitted:decision.correctionCount,
      correctionsDeclared:outcome.status === 'captured' && decision.correctionCount > 0,
      evidenceValidation:outcome.evidenceValidation ?? 'not-evaluated',
      durability:'best-effort',
    };
    const evaluatorRevision = safeLabel(outcome.evaluation?.evaluatorRevision);
    const sink = safeLabel(outcome.sink,80), sinkId = safeLabel(outcome.id);
    if (evaluatorRevision) context.evaluatorRevision = evaluatorRevision;
    if (sink) context.sink = sink;
    if (sinkId) context.sinkId = sinkId;
    if (outcome.id && !sinkId) context.sinkIdOmitted = true;
    try {
      record('LEARNING', ['rejected','sink-failed','sink-unavailable'].includes(outcome.status) ? 'warn' : 'info',
        'Learning candidate decision', 'learning-candidate-decision', context);
    } catch { /* Telemetry has no authority over capture. */ }
    if (outcome.status !== 'captured') continue;
    for (const correction of outcome.declaredCorrections ?? []) {
      try {
        record('LEARNING', 'info', 'Learning correction declared', 'learning-correction-declared', {
          reviewId:decision.reviewId,candidateKey:decision.candidateKey,fingerprint:decision.fingerprint,
          relation:correction.kind,targetCandidateId:correction.targetCandidateId,
          reasonDigest:digest(correction.reasonRef),targetExistence:'not-checked',
          evidenceValidation:'declared',durability:'best-effort',
        });
      } catch { /* A correction declaration never modifies another sink record. */ }
    }
  }
}
