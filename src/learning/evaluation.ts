import * as z from 'zod/v4';
import { assertLearningTextSafe } from '../memory/safety.js';
import { isSensitiveKey, redactSensitiveString } from '../security/redaction.js';
import type { LearningEvaluation, LearningEvidenceReason } from './types.js';

export class LearningEvidenceError extends Error {
  constructor(readonly reasonCode: LearningEvidenceReason) { super(`Learning claim rejected: ${reasonCode}`); }
}
export function isSafeLearningMetadata(value: string): boolean {
  if (!value.trim() || /[\x00-\x1f\x7f]/.test(value) || redactSensitiveString(value) !== value) return false;
  try { assertLearningTextSafe(value); return true; } catch { return false; }
}
export const safeMetadataSchema = (max: number) => z.string().trim().min(1).max(max)
  .refine(isSafeLearningMetadata, 'Unsafe learning metadata');
export const safeEvidenceRefSchema = (max = 1000) => safeMetadataSchema(max)
  .refine(value => /^(?:tool|activity|memory|file|grafel|source|verification|user-correction):\S.*$/i.test(value), 'Invalid evidence reference');

function validTimestamp(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return false;
  return m[7] === 'Z' || (Number(m[7].slice(1, 3)) <= 23 && Number(m[7].slice(4)) <= 59);
}

const evaluatedEvidenceSchema = z.strictObject({
  ref: safeEvidenceRefSchema(),
  digest: z.string().regex(/^sha256:[0-9a-fA-F]{64}$/, 'Invalid SHA-256 digest'),
  observedAt: z.string().max(64).refine(validTimestamp, 'Invalid timezone-aware timestamp'),
});
const verificationSchema = z.strictObject({
  method: z.literal('recomputed'),
  verdict: z.enum(['pass', 'fail', 'unavailable']),
  verifierRevision: safeMetadataSchema(200),
  evaluatorRevision: safeMetadataSchema(200),
  inputsDigest: z.string().regex(/^sha256:[0-9a-fA-F]{64}$/),
  resultEvidence: evaluatedEvidenceSchema,
});
const positiveCount = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const metricName = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/)
  .refine(name => !isSensitiveKey(name), 'Unsafe metric name');
export const learningEvaluationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.enum(['rank', 'discover']),
  evaluatorRevision: safeMetadataSchema(200),
  inputsDigest: z.string().regex(/^sha256:[0-9a-fA-F]{64}$/).optional(),
  verification: verificationSchema.optional(),
  correct: z.boolean(),
  objective: z.number().finite().nullable().optional(),
  evidence: z.array(evaluatedEvidenceSchema).min(1).max(8),
  metrics: z.record(metricName, z.number().finite()).optional(),
  baselineRef: safeEvidenceRefSchema().optional(),
  attributionComplete: z.boolean().optional(),
  samples: z.strictObject({ candidate: positiveCount, baseline: positiveCount, minimum: positiveCount }).optional(),
}).superRefine((value, context) => {
  if (value.verification && !value.inputsDigest)
    context.addIssue({ code: 'custom', path: ['inputsDigest'], message: 'Verification requires explicit input binding' });
  const refs = new Set<string>();
  for (const evidence of value.evidence) {
    if (refs.has(evidence.ref)) context.addIssue({ code: 'custom', path: ['evidence'], message: 'Duplicate or conflicting evidence reference' });
    refs.add(evidence.ref);
  }
  if (Object.keys(value.metrics ?? {}).length > 16) context.addIssue({ code: 'custom', path: ['metrics'], message: 'Too many metrics' });
  if (value.samples && (value.samples.candidate < value.samples.minimum || value.samples.baseline < value.samples.minimum))
    context.addIssue({ code: 'custom', path: ['samples'], message: 'Insufficient samples' });
});

/** Pure structural validation shared by direct coordinator and MCP schema paths. */
export function validateEvaluationEnvelope(value: unknown): LearningEvaluation {
  const result = learningEvaluationSchema.safeParse(value);
  if (!result.success) {
    const objectiveInvalid = result.error.issues.some(issue => issue.path[0] === 'objective');
    throw new LearningEvidenceError(objectiveInvalid ? 'objective-invalid' : 'evidence-invalid');
  }
  return result.data;
}

/** Eligibility check, not verification of the artifact or execution authorization. */
export function assertEvaluatedClaimEligible(value: LearningEvaluation): void {
  if (!value.correct) throw new LearningEvidenceError('correctness-failed');
  if (value.mode === 'rank' && (typeof value.objective !== 'number' || !Number.isFinite(value.objective)))
    throw new LearningEvidenceError('objective-invalid');
  if (value.attributionComplete === false) throw new LearningEvidenceError('attribution-incomplete');
  if (value.verification) {
    const report = value.verification;
    if (report.verdict === 'fail') throw new LearningEvidenceError('verifier-failed');
    if (report.verdict === 'unavailable') throw new LearningEvidenceError('verifier-unavailable');
    if (!value.inputsDigest || report.inputsDigest.toLowerCase() !== value.inputsDigest.toLowerCase())
      throw new LearningEvidenceError('verification-input-mismatch');
    if (report.evaluatorRevision !== value.evaluatorRevision)
      throw new LearningEvidenceError('verification-evaluator-mismatch');
  }
}
