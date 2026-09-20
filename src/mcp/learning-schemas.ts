import * as z from 'zod/v4';

const evidenceRef = z.string().min(1).max(1000);

const learningCandidate = z.object({
  kind: z.enum(['durable-fact', 'operational-reflection', 'architecture', 'code-pattern']),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(50_000),
  evidenceRefs: z.array(evidenceRef).max(32).default([]),
  verified: z.boolean(),
  reuseCondition: z.string().max(2_000).optional(),
  workspace: z.string().min(1).max(200).optional(),
  tags: z.array(z.string().max(200)).max(32).optional(),
  steps: z.array(z.string().min(1).max(2_000)).max(50).optional(),
  exemplars: z.array(z.string().min(1).max(2_000)).max(100).optional(),
});

export const learning = z.object({
  action: z.enum(['status', 'checkpoint', 'review', 'curate', 'journey']),
  idempotencyKey: z.string().min(1).max(200).optional(),
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
});
