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
});
