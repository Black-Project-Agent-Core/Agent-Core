import * as z from 'zod/v4';
import { safeEvidenceRefSchema, safeMetadataSchema } from './evaluation.js';
import type { WorkflowEvidence } from './workflow-evidence.js';

const observationSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  goalRelevance: z.enum(['direct', 'indirect', 'unrelated', 'unknown']),
  potentialSeverity: z.enum(['low', 'moderate', 'high', 'critical', 'unknown']),
  evidenceReliability: z.enum(['unverified', 'supported', 'corroborated', 'contradicted', 'unknown']),
  uncertainty: z.array(safeMetadataSchema(300)).max(8),
  evidenceRefs: z.array(safeEvidenceRefSchema()).min(1).max(8),
  inspectionAuthority: z.enum(['granted', 'not-granted', 'unknown']),
  reviewState: z.enum(['new', 'reviewed-unchanged', 'new-evidence']).default('new'),
  requirement: z.enum(['mandatory', 'optional']).optional(),
  resolution: z.enum(['unresolved', 'resolved', 'deferred']).optional(),
  deferralReason: safeMetadataSchema(300).optional(),
  marginalValue: z.enum(['useful', 'low', 'unknown']).optional(),
});

export const salienceReviewSchema = z.strictObject({
  observations: z.array(observationSchema).min(1).max(8),
  stoppingContext: z.strictObject({
    requiredChecks: z.enum(['complete', 'incomplete', 'unknown']),
    userConstraints: z.enum(['satisfied', 'unsatisfied', 'unknown']),
  }).optional(),
}).superRefine((value, context) => {
  if (new Set(value.observations.map(item => item.id)).size !== value.observations.length)
    context.addIssue({ code: 'custom', path: ['observations'], message: 'Duplicate observation ID' });
  value.observations.forEach((item, index) => {
    if (new Set(item.evidenceRefs).size !== item.evidenceRefs.length)
      context.addIssue({ code: 'custom', path: ['observations', index, 'evidenceRefs'], message: 'Duplicate evidence reference' });
    if (item.resolution === 'deferred' && !item.deferralReason)
      context.addIssue({ code: 'custom', path: ['observations', index, 'deferralReason'], message: 'Deferred observations require a reason' });
    if (item.deferralReason && item.resolution !== 'deferred')
      context.addIssue({ code: 'custom', path: ['observations', index, 'deferralReason'], message: 'A deferral reason requires deferred resolution' });
  });
});

export type SalienceReviewInput = z.infer<typeof salienceReviewSchema>;

/** Controller assessments prioritize one inspection; they never establish truth, grants or a new task. */
export function reviewSalience(input: SalienceReviewInput, evidence: readonly WorkflowEvidence[] = []) {
  const parsed = salienceReviewSchema.parse(input);
  const prerequisitesComplete = parsed.stoppingContext?.requiredChecks === 'complete'
    && parsed.stoppingContext.userConstraints === 'satisfied';
  const observations = parsed.observations.map(item => {
    const sources = item.evidenceRefs.map(ref => {
      const resolved = evidence.find(source => source.ref === ref);
      return { ref, status: resolved?.status ?? 'unavailable' as const,
        ...(resolved?.reason ? { reason: resolved.reason } : {}) };
    });
    const evidenceAvailability = sources.every(source => source.status === 'resolved') ? 'available' as const : 'incomplete' as const;
    const serious = item.potentialSeverity === 'high' || item.potentialSeverity === 'critical';
    const relevant = item.goalRelevance === 'direct' || item.goalRelevance === 'indirect';
    const contradicted = item.evidenceReliability === 'contradicted';
    const unchanged = item.reviewState === 'reviewed-unchanged';
    const resolved = item.resolution === 'resolved' && evidenceAvailability === 'available' && !contradicted;
    const deferred = item.resolution === 'deferred';
    const required = item.requirement === 'mandatory';
    const riskUnresolved = !resolved && !deferred && (serious || item.potentialSeverity === 'unknown');
    const requiredPending = required && !resolved && !deferred;
    const useful = item.marginalValue === 'useful' || item.reviewState === 'new-evidence';
    const lowOptionalValue = !required && !riskUnresolved && !contradicted && prerequisitesComplete
      && !useful && item.marginalValue === 'low' && evidenceAvailability === 'available';
    const reviewPriority = deferred ? 'none' as const : riskUnresolved ? serious && !contradicted ? 'high' as const : 'normal' as const
      : requiredPending || useful ? 'normal' as const : resolved || lowOptionalValue ? 'none' as const
      : contradicted ? 'normal' as const : unchanged ? 'none' as const
      : serious ? 'high' as const : relevant ? 'normal' as const : 'none' as const;
    const nextStep = deferred ? 'defer-affected-action' as const
      : reviewPriority === 'none' ? 'continue-current-task' as const
      : item.inspectionAuthority !== 'granted' ? 'request-inspection-authority' as const
      : evidenceAvailability !== 'available' ? 'locate-permitted-evidence' as const
      : contradicted ? 'review-contradicting-evidence' as const : 'inspect-permitted-evidence' as const;
    return {
      ...item,
      assessmentSource: 'controller' as const,
      evidenceAvailability,
      sources,
      resolutionStatus: deferred ? 'deferred' as const : resolved ? 'controller-resolved-with-source' as const : 'unresolved' as const,
      reviewPriority,
      nextStep,
      claimVerification: 'not-established' as const,
      actionAuthorization: 'unchanged' as const,
    };
  });
  const order = { high: 0, normal: 1, none: 2 };
  const next = observations.filter(item => item.reviewPriority !== 'none')
    .sort((a, b) => order[a.reviewPriority] - order[b.reviewPriority]
      || Number(b.potentialSeverity === 'critical') - Number(a.potentialSeverity === 'critical')
      || a.id.localeCompare(b.id))[0];
  const deferredObservationIds = observations.filter(item => item.resolutionStatus === 'deferred').map(item => item.id);
  const unresolvedRequiredObservationIds = observations.filter(item => item.requirement === 'mandatory'
    && item.resolutionStatus === 'unresolved').map(item => item.id);
  const unresolvedRiskObservationIds = observations.filter(item => ['high', 'critical', 'unknown'].includes(item.potentialSeverity)
    && item.resolutionStatus === 'unresolved').map(item => item.id);
  const blockedInspection = observations.some(item => item.reviewPriority !== 'none' && item.inspectionAuthority !== 'granted');
  const optionalChecksExhausted = observations.every(item => item.resolutionStatus === 'controller-resolved-with-source'
    ? item.marginalValue !== 'useful' && item.reviewState !== 'new-evidence' : item.resolutionStatus === 'deferred'
      || item.requirement !== 'mandatory' && item.marginalValue === 'low'
        && item.reviewState !== 'new-evidence'
        && item.evidenceAvailability === 'available' && item.evidenceReliability !== 'contradicted');
  const stoppingRecommendation = !parsed.stoppingContext ? 'not-assessed' as const
    : deferredObservationIds.length || blockedInspection ? 'defer-action' as const
    : !prerequisitesComplete || unresolvedRequiredObservationIds.length || unresolvedRiskObservationIds.length || !optionalChecksExhausted
      ? 'continue-verification' as const : 'stop-optional-checks' as const;
  return {
    advisory: true as const,
    observations,
    nextFocus: next ? 'bounded-review' as const : 'preserve-focus' as const,
    selectedObservationId: next?.id ?? null,
    maxInspections: next ? 1 : 0,
    stopping: {
      recommendation: stoppingRecommendation,
      assessmentSource: 'controller' as const,
      ...(parsed.stoppingContext ? { prerequisites: parsed.stoppingContext } : {}),
      deferredObservationIds,
      unresolvedRequiredObservationIds,
      unresolvedRiskObservationIds,
      evidenceIndependence: 'not-established' as const,
      decisionBenefit: 'not-established' as const,
      claimVerification: 'not-established' as const,
      actionAuthorization: 'unchanged' as const,
    },
    requiredLearningReview: 'unchanged' as const,
    claimVerification: 'not-established' as const,
    actionAuthorization: 'unchanged' as const,
  };
}
