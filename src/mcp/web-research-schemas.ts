import * as z from 'zod/v4';

export const webSearch = z.object({
  query: z.string(),
  mode: z.enum(['web', 'academic', 'assets']).optional(),
  limit: z.number().optional(),
  domains: z.array(z.string()).optional(),
  recencyDays: z.number().optional(),
});

export const webOpen = z.object({
  url: z.string(),
  reader: z.enum(['native', 'external']).optional(),
  // No schema default: explicitly setting a scope is unsupported for external readers.
  contentScope: z.enum(['full', 'main']).optional(),
  pdfPages: z.object({ start: z.number().int().min(1), count: z.number().int().min(1).max(8) }).optional(),
});
