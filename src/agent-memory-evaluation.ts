import { z } from 'zod';

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const nativeMemoryEvaluationSchema = z.object({
  pairId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/),
  arm: z.enum(['seed', 'omit', 'reuse']),
  lessonMemoryId: z.string().min(1).max(128).optional(),
  lessonContentDigest: digest.optional(),
  lessonTitle: z.string().min(1).max(200).optional(),
  inputPath: z.string().min(1).max(1_000).optional(),
  browserUrl: z.string().url().max(2_000).optional(),
  workspaceIdentity: z.object({ name: z.string().min(1).max(200), key: z.string().min(1).max(2_048) }).strict().optional(),
  oracle: z.object({ casePath: z.string().min(1).max(1_000), caseDigest: digest,
    answerPath: z.string().min(1).max(1_000) }).strict(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.inputPath) === Boolean(value.browserUrl)) {
    context.addIssue({ code: 'custom', message: 'An evaluated task requires one exact artifact input or owned browser URL.' });
  }
  if (value.arm !== 'seed' && (!value.lessonMemoryId || !value.lessonContentDigest)) {
    context.addIssue({ code: 'custom', message: 'A paired run requires one exact lesson revision.' });
  }
  if (value.arm === 'seed' && (value.lessonMemoryId || value.lessonContentDigest)) {
    context.addIssue({ code: 'custom', message: 'A seed run cannot omit a lesson.' });
  }
  if (value.arm === 'seed' && !value.lessonTitle) {
    context.addIssue({ code: 'custom', message: 'A seed run requires an exact lesson title.' });
  }
});

export type NativeMemoryEvaluation = z.infer<typeof nativeMemoryEvaluationSchema>;

const count = z.number().int().nonnegative();
const measure = z.number().nonnegative();
const executionMetricsSchema = z.object({ startedAt: z.string().max(40),
  toolCalls: count, toolFailures: count, adaptiveRecalls: count, strategyChanges: count,
  blockedEquivalentRetries: count, hypotheses: count, verifications: count, knowledgeUseReceipts: count,
  artifactUseOutcomes: count, firstHypothesisAt: z.string().max(40).optional(),
  recallMs: measure.optional(), modelMs: measure.optional(), toolMs: measure.optional(), modelCalls: count.optional(),
  providerAttempts: count.optional(),
  usageObservedCalls: count.optional(), costObservedCalls: count.optional(), inputTokens: count.optional(),
  outputTokens: count.optional(), totalTokens: count.optional(), costUsd: measure.optional() });
const learnedLessonSchema = z.object({ memoryId: z.string().min(1).max(128),
  title: z.string().max(200), contentDigest: digest });
const modelIdentitySchema = z.object({ observedCalls: count,
  identities: z.array(z.object({ providerId: z.string().min(1).max(120), model: z.string().min(1).max(240) })).max(32) });
const resultMetadataSchema = z.object({ learningStatus: z.enum(['complete', 'failed']).optional(),
  jobVerification: z.enum(['pass', 'fail', 'unavailable']).optional(),
  evaluation: nativeMemoryEvaluationSchema.optional(), metrics: executionMetricsSchema.optional(),
  learnedLesson: learnedLessonSchema.optional(), modelIdentity: modelIdentitySchema.optional(),
  settingsDigest: digest.optional(), toolContractDigest: digest.optional() });
export type NativeMemoryResultMetadata = z.infer<typeof resultMetadataSchema>;

export function normalizeNativeResultMetadata(raw: unknown): NativeMemoryResultMetadata {
  const parsed = resultMetadataSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}
