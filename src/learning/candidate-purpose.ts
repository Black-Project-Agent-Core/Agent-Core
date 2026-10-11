import * as z from 'zod/v4';
import { learningDecisionFields } from './decision-evidence.js';
import { learningEvaluationSchema } from './evaluation.js';
import { learningEffectEvidenceSchema } from './effect-evidence.js';
import type { LearningCandidate } from './types.js';

export type CandidatePurpose = 'task-fact' | 'artifact-outcome' | 'reusable-procedure';

/** Controller-declared intent only. This structural gate never establishes truth or verification. */
export function validateCandidatePurpose(candidate: LearningCandidate): LearningCandidate {
  if (candidate.purpose === undefined) return candidate;
  if (candidate.purpose === 'task-fact' || candidate.purpose === 'artifact-outcome') {
    if (!['durable-fact', 'architecture'].includes(candidate.kind) || candidate.steps !== undefined)
      throw new Error('LEARNING_CANDIDATE_PURPOSE_INVALID: facts and outcomes cannot contain procedure steps');
  } else if (candidate.purpose === 'reusable-procedure') {
    if (candidate.kind !== 'operational-reflection' || !candidate.reuseCondition?.trim()
      || !Array.isArray(candidate.steps) || candidate.steps.length < 1 || candidate.steps.length > 50
      || candidate.steps.some(step => typeof step !== 'string' || !step.trim())
      || !Array.isArray(candidate.evidenceRefs) || !candidate.evidenceRefs.length)
      throw new Error('LEARNING_CANDIDATE_PURPOSE_INVALID: procedure requires condition, steps and evidence');
  } else throw new Error('LEARNING_CANDIDATE_PURPOSE_INVALID: unknown purpose');
  return candidate;
}

export const learningCandidateSchema = z.object({
  purpose: z.enum(['task-fact', 'artifact-outcome', 'reusable-procedure']).optional(),
  checkpointKey: z.string().min(1).max(200).optional(),
  ...learningDecisionFields,
  kind: z.enum(['durable-fact', 'operational-reflection', 'architecture', 'code-pattern']),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(50_000),
  evidenceRefs: z.array(z.string().min(1).max(1000)).max(32).default([]),
  verified: z.boolean(),
  effectEvidence: learningEffectEvidenceSchema.optional(),
  evaluation: learningEvaluationSchema.optional(),
  reuseCondition: z.string().max(2_000).optional(),
  workspace: z.string().min(1).max(200).optional(),
  tags: z.array(z.string().max(200)).max(32).optional(),
  steps: z.array(z.string().min(1).max(2_000)).max(50).optional(),
  exemplars: z.array(z.string().min(1).max(2_000)).max(100).optional(),
});
