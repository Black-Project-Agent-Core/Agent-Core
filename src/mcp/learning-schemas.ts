import * as z from 'zod/v4';
import { learningEvaluationSchema, safeEvidenceRefSchema, safeMetadataSchema } from '../learning/evaluation.js';
import { learningEffectEvidenceSchema } from '../learning/effect-evidence.js';
import { learningDecisionFields } from '../learning/decision-evidence.js';
import { decisionRequestSchema } from '../learning/decision-review.js';

const evidenceRef = z.string().min(1).max(1000);

const learningCandidate = z.object({
  checkpointKey: z.string().min(1).max(200).optional(),
  ...learningDecisionFields,
  kind: z.enum(['durable-fact', 'operational-reflection', 'architecture', 'code-pattern']),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(50_000),
  evidenceRefs: z.array(evidenceRef).max(32).default([]),
  verified: z.boolean(),
  effectEvidence: learningEffectEvidenceSchema.optional(),
  evaluation: learningEvaluationSchema.optional(),
  reuseCondition: z.string().max(2_000).optional(),
  workspace: z.string().min(1).max(200).optional(),
  tags: z.array(z.string().max(200)).max(32).optional(),
  steps: z.array(z.string().min(1).max(2_000)).max(50).optional(),
  exemplars: z.array(z.string().min(1).max(2_000)).max(100).optional(),
});

export const learning = z.object({
  action: z.enum(['status', 'checkpoint', 'review', 'curate', 'journey', 'receipt', 'decision']),
  decision: decisionRequestSchema.optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  taskId: z.string().min(1).max(200).optional(),
  actionRefs: z.array(safeEvidenceRefSchema()).max(16).optional(),
  checkpointKeys: z.array(z.string().min(1).max(200)).min(1).max(25).optional(),
  disposition: z.enum(['no-new-knowledge', 'rejected', 'awaiting-verification']).optional(),
  meaningful: z.boolean().optional(),
  reason: z.enum([
    'task-complete',
    'user-correction',
    'verified-recovery',
    'explicit-learn',
    'status',
  ]).optional(),
  evidenceRefs: z.array(evidenceRef).max(32).optional(),
  candidates: z.array(learningCandidate).max(25).optional(),
  explicit: z.boolean().optional(),
  workspace: z.string().min(1).max(200).optional(),
  useId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/).optional(),
  retrievalAttemptId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/).optional(),
  memoryId: z.string().min(1).max(128).optional(),
  contentDigest: z.string().regex(/^sha256:[0-9a-fA-F]{64}$/).optional(),
  applicability: z.enum(['applied', 'adapted', 'rejected']).optional(),
  result: z.enum(['success', 'failure', 'unavailable']).optional(),
  reasonCode: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/).optional(),
  verificationRef: safeEvidenceRefSchema().optional(),
  summary: safeMetadataSchema(500).optional(),
}).superRefine((value, context) => {
  if (value.action === 'decision' && !value.decision) context.addIssue({ code: 'custom', path: ['decision'], message: 'decision required' });
  if (value.action !== 'decision' && value.decision) context.addIssue({ code: 'custom', path: ['decision'], message: 'decision only valid for action=decision' });
  if (value.action !== 'receipt') return;
  for (const key of ['useId', 'retrievalAttemptId', 'memoryId', 'contentDigest', 'applicability', 'result', 'reasonCode'] as const) {
    if (value[key] === undefined) context.addIssue({ code: 'custom', path: [key], message: `${key} is required for action=receipt` });
  }
  if ((value.evidenceRefs?.length ?? 0) > 16) {
    context.addIssue({ code: 'custom', path: ['evidenceRefs'], message: 'Receipt evidence is limited to 16 references' });
  }
  for (const ref of value.evidenceRefs ?? []) {
    if (!safeEvidenceRefSchema().safeParse(ref).success) context.addIssue({ code: 'custom', path: ['evidenceRefs'], message: 'Unsafe receipt evidence reference' });
  }
  if ((value.result === 'success' || value.result === 'failure') && !value.verificationRef) {
    context.addIssue({ code: 'custom', path: ['verificationRef'], message: 'Receipt success/failure requires verificationRef' });
  }
  if (value.workspace && value.workspace.length > 120) {
    context.addIssue({ code: 'custom', path: ['workspace'], message: 'Receipt workspace exceeds Memory scope limit' });
  }
});
