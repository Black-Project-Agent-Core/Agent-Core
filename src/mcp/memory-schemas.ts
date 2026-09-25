import * as z from 'zod/v4';

const memoryLink = z.object({
  targetId: z.string().min(3).max(128),
  type: z.enum(['related', 'supports', 'supersedes', 'contradicts', 'derived-from']),
  strength: z.number().min(0).max(1),
  createdAt: z.iso.datetime().optional(),
  reason: z.string().max(500).optional(),
});

const source = z.object({ type: z.string().min(1).max(80), ref: z.string().max(500).optional() });
const provenance = z.object({
  workspace: z.string().min(1).max(120).optional(),
  repo: z.string().min(1).max(160).optional(),
  files: z.array(z.string().min(1).max(500)).max(64),
  gitCommit: z.string().regex(/^[0-9a-fA-F]{7,64}$/).optional(),
  gitRef: z.string().min(1).max(240).optional(),
});

export const memoryList = z.object({});
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
}).refine((value) => Object.keys(value).some((key) => key !== 'id'), { message: 'At least one memory field must be provided' });

export const memoryDelete = z.object({ id: z.string().min(3).max(128) });
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
      link: memoryLink,
    }),
  ])).min(1).max(100),
});
