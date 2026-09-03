import * as z from 'zod/v4';

export const craftingReferenceSchema = z.object({
  referenceId: z.string().min(1).max(200),
  kind: z.enum(['git_repo', 'local_repo', 'source_bundle']),
  repository: z.string().max(1_000).optional(),
  localPath: z.string().max(5_000).optional(),
  commit: z.string().max(128).optional(),
  tree: z.string().max(128).optional(),
  bundleHash: z.string().max(128).optional(),
  featureScope: z.string().min(1).max(1_000),
  approvalSource: z.string().min(1).max(1_000),
  availability: z.enum(['available', 'unavailable', 'ambiguous']).optional(),
  required: z.boolean().optional(),
}).strict();

export const craftingRouteSchema = z.object({
  featureId: z.string().min(1).max(500),
  title: z.string().max(1_000).optional(),
  requiredBehaviors: z.array(z.string().max(2_000)).max(100).default([]),
  requiredInvariants: z.array(z.string().max(2_000)).max(100).default([]),
  explicitNonGoals: z.array(z.string().max(2_000)).max(100).default([]),
  targetAuthorities: z.array(z.string().max(500)).max(100).default([]),
  verificationRequirements: z.array(z.string().max(2_000)).max(100).default([]),
  targetPaths: z.array(z.string().max(5_000)).max(200).optional(),
  references: z.array(craftingReferenceSchema).max(16).default([]),
}).strict();
