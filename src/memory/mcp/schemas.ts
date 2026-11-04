import * as z from 'zod/v4';

// Keep server ISO validation; date-time already describes the wire format.
const isoInstant = z.iso.datetime().meta({ pattern: undefined, description: 'UTC ISO-8601 timestamp ending in Z.' });

const memoryLink = z.object({
  targetId: z.string().min(3).max(128),
  type: z.enum(['related', 'supports', 'supersedes', 'contradicts', 'derived-from']),
  strength: z.number().min(0).max(1),
  createdAt: isoInstant.optional(),
  reason: z.string().max(500).optional(),
});
const temporalMemoryLink = memoryLink.extend({
  validFrom: isoInstant.optional(),
  validTo: isoInstant.optional(),
  referenceTime: isoInstant.optional(),
  evidenceRefs: z.array(z.string().min(1).max(500)).max(16).optional(),
}).refine(value => !value.validFrom || !value.validTo || Date.parse(value.validTo) >= Date.parse(value.validFrom), {
  message: 'validTo must not precede validFrom',
});

const source = z.object({ type: z.string().min(1).max(80), ref: z.string().max(500).optional() });
const provenance = z.object({
  workspace: z.string().min(1).max(120).optional(),
  repo: z.string().min(1).max(160).optional(),
  files: z.array(z.string().min(1).max(500)).max(64),
  gitCommit: z.string().regex(/^[0-9a-fA-F]{7,64}$/).optional(),
  gitRef: z.string().min(1).max(240).optional(),
});

export const memoryList = z.object({
  workspace: z.string().min(1).max(120).optional(),
});
export const memoryPage = z.object({
  workspace: z.string().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(100).optional().meta({ default: 50 }),
  cursor: z.string().min(1).max(4096).optional(),
});
export const memoryRetrievalDiagnostics = z.object({
  workspace: z.string().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(200).optional().meta({ default: 100 }),
  maxAgeDays: z.number().int().min(1).max(365).optional().meta({ default: 90 }),
});
export const memoryExport = z.object({
  workspace: z.string().min(1).max(120).optional(),
});
export const memoryImport = z.object({
  payload: z.unknown(),
  mode: z.enum(['preview', 'apply']).optional().meta({ default: 'preview' }),
  confirmation: z.string().min(1).max(100).optional(),
  allowedSourceWorkspaces: z.array(z.string().min(1).max(120)).max(32).optional(),
  allowUnscoped: z.boolean().optional().meta({ default: false }),
});
export const memoryRead = z.object({
  id: z.string().min(3).max(128),
  revisionLimit: z.number().int().min(0).max(8).optional().meta({ default: 0 }),
});
export const memorySearch = z.object({
  query: z.string().min(1).max(10_000),
  limit: z.number().int().min(1).max(50).optional().meta({ default: 5 }),
  maxNeighbors: z.number().int().min(0).max(10).optional().meta({ default: 2 }),
  budgetChars: z.number().int().min(500).max(100_000).optional().meta({ default: 20_000 }),
  sourceFiles: z.array(z.string().min(1).max(500)).max(32).optional(),
  workspace: z.string().min(1).max(120).optional(),
  rankingProfile: z.enum(['legacy', 'bm25', 'fusion']).optional().meta({ default: 'legacy' }),
  asOf: isoInstant.optional(),
});
export const memoryRemember = z.object({
  content: z.string().min(1).max(200_000),
  title: z.string().max(200).optional(),
  keywords: z.array(z.string().max(200)).max(64).optional(),
  context: z.string().max(2_000).optional(),
  tags: z.array(z.string().max(200)).max(64).optional(),
  category: z.string().max(200).optional(),
  links: z.array(memoryLink).max(32).optional(),
  source: source.optional(),
  provenance: provenance.optional(),
  expiresAt: isoInstant.optional(),
});

export const memoryUpdate = z.object({
  id: z.string().min(3).max(128),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(200_000).optional(),
  keywords: z.array(z.string().max(200)).max(64).optional(),
  context: z.string().max(2_000).optional(),
  tags: z.array(z.string().max(200)).max(64).optional(),
  category: z.string().max(200).optional(),
  links: z.array(memoryLink).max(32).optional(),
  provenance: provenance.optional(),
  expiresAt: isoInstant.nullable().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'id'), { message: 'At least one memory field must be provided' });

export const memoryDelete = z.object({
  id: z.string().min(3).max(128),
  expectedReviewFingerprint: z.string().regex(/^sha256:[0-9a-fA-F]{64}$/).optional(),
});
export const memoryFeedback = z.object({
  id: z.string().min(3).max(128),
  eventId: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  kind: z.enum(['helpful', 'not-helpful', 'stale', 'wrong', 'forget', 'restore']),
  expectedContentDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  reason: z.string().max(500).optional(),
});
export const memoryRetirementReview = z.object({
  workspace: z.string().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(100).optional().meta({ default: 20 }),
  retentionThreshold: z.number().min(0).max(5).optional().meta({ default: 0.2 }),
});
export const memoryStatus = z.object({});
export const memoryReindex = z.object({});
export const memoryEvolve = z.object({
  id: z.string().min(3).max(128),
  mode: z.enum(['apply', 'preview']).optional().meta({ default: 'apply' }),
  neighborLimit: z.number().int().min(1).max(8).optional().meta({ default: 5 }),
});
export const memoryConsolidate = z.object({
  semanticThreshold: z.number().min(0).max(1).optional().meta({ default: 0.82 }),
  lexicalThreshold: z.number().min(0).max(1).optional().meta({ default: 0.62 }),
  limit: z.number().int().min(1).max(100).optional().meta({ default: 20 }),
});

const memoryRememberValue = z.object({
  content: z.string().min(1).max(200_000),
  title: z.string().max(200).optional(),
  keywords: z.array(z.string().max(200)).max(64).optional(),
  context: z.string().max(2_000).optional(),
  tags: z.array(z.string().max(200)).max(64).optional(),
  category: z.string().max(200).optional(),
  links: z.array(memoryLink).max(32).optional(),
  source: source.optional(),
  provenance: provenance.optional(),
  expiresAt: isoInstant.optional(),
});

const memoryUpdatePatch = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(200_000).optional(),
  keywords: z.array(z.string().max(200)).max(64).optional(),
  context: z.string().max(2_000).optional(),
  tags: z.array(z.string().max(200)).max(64).optional(),
  category: z.string().max(200).optional(),
  links: z.array(memoryLink).max(32).optional(),
  provenance: provenance.optional(),
  expiresAt: isoInstant.nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one update field must be provided' });

export const memoryBatch = z.object({
  operations: z.array(z.discriminatedUnion('op', [
    z.object({
      op: z.literal('remember'),
      id: z.string().min(3).max(128).optional(),
      value: memoryRememberValue,
    }),
    z.object({
      op: z.literal('update'),
      id: z.string().min(3).max(128),
      patch: memoryUpdatePatch,
    }),
    z.object({
      op: z.literal('delete'),
      id: z.string().min(3).max(128),
    }),
    z.object({
      op: z.literal('link'),
      id: z.string().min(3).max(128),
      link: temporalMemoryLink,
    }),
  ])).min(1).max(100),
});
