import * as z from 'zod/v4';

export const getConfig = z.object({ origin: z.enum(['ui', 'llm']).optional() });
export const setConfigValue = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
  origin: z.enum(['ui', 'llm']).optional(),
});
export const readFile = z.object({
  path: z.string(), isUrl: z.boolean().optional().meta({ default: false }),
  offset: z.number().optional().meta({ default: 0 }), length: z.number().optional().meta({ default: 1000 }),
  sheet: z.string().optional(), range: z.string().optional(),
  options: z.record(z.string(), z.any()).optional(), origin: z.enum(['ui', 'llm']).optional(),
});
export const readMultipleFiles = z.object({ paths: z.array(z.string()) });
export const writeFile = z.object({
  path: z.string(), content: z.string(), mode: z.enum(['rewrite', 'append']).optional().meta({ default: 'rewrite' }),
  origin: z.enum(['ui', 'llm']).optional(),
});
const pdfInsert = z.object({
  type: z.literal('insert'), pageIndex: z.number(), markdown: z.string().optional(),
  sourcePdfPath: z.string().optional(), pdfOptions: z.record(z.string(), z.any()).optional(),
});
const pdfDelete = z.object({ type: z.literal('delete'), pageIndexes: z.array(z.number()) });
export const writePdf = z.object({
  path: z.string(), content: z.union([z.string(), z.array(z.union([pdfInsert, pdfDelete]))]),
  outputPath: z.string().optional(), options: z.record(z.string(), z.any()).optional(),
});
export const createDirectory = z.object({ path: z.string() });
export const listDirectory = z.object({
  path: z.string(), depth: z.number().optional().meta({ default: 2 }), origin: z.enum(['ui', 'llm']).optional(),
});
export const moveFile = z.object({ source: z.string(), destination: z.string() });
export const getFileInfo = z.object({ path: z.string() });
export const editBlock = z.object({
  file_path: z.string(), old_string: z.string().optional(), new_string: z.string().optional(),
  expected_replacements: z.number().optional().meta({ default: 1 }), range: z.string().optional(),
  content: z.any().optional(), options: z.record(z.string(), z.any()).optional(), origin: z.enum(['ui', 'llm']).optional(),
});
export const startSearch = z.object({
  path: z.string(), pattern: z.string(), searchType: z.enum(['files', 'content']).optional().meta({ default: 'files' }),
  filePattern: z.string().optional(), ignoreCase: z.boolean().optional().meta({ default: true }),
  maxResults: z.number().optional(), includeHidden: z.boolean().optional().meta({ default: false }),
  contextLines: z.number().optional().meta({ default: 5 }), timeout_ms: z.number().optional(),
  earlyTermination: z.boolean().optional(), literalSearch: z.boolean().optional().meta({ default: false }),
  origin: z.enum(['ui', 'llm']).optional(),
});
export const getMoreSearchResults = z.object({
  sessionId: z.string(), offset: z.number().optional().meta({ default: 0 }), length: z.number().optional().meta({ default: 100 }),
});
export const stopSearch = z.object({ sessionId: z.string() });
export const listSearches = z.object({});
export const startProcess = z.object({
  command: z.string(), timeout_ms: z.number(), shell: z.string().optional(),
  verbose_timing: z.boolean().optional(), origin: z.enum(['ui', 'llm']).optional(),
});
export const readProcessOutput = z.object({
  pid: z.number(), timeout_ms: z.number().optional(), offset: z.number().optional(),
  length: z.number().optional(), verbose_timing: z.boolean().optional(),
});
export const interactWithProcess = z.object({
  pid: z.number(), input: z.string(), timeout_ms: z.number().optional(),
  wait_for_prompt: z.boolean().optional(), verbose_timing: z.boolean().optional(),
});
export const forceTerminate = z.object({ pid: z.number() });
export const listSessions = z.object({});
export const listProcesses = z.object({});
export const killProcess = z.object({ pid: z.number() });
export const getUsageStats = z.object({});
export const getRecentToolCalls = z.object({
  maxResults: z.number().min(1).max(1000).optional().meta({ default: 50 }),
  toolName: z.string().optional(),
  since: z.iso.datetime().optional(),
  compact: z.boolean().optional().meta({ default: false }),
  failuresOnly: z.boolean().optional().meta({ default: false }),
});
export const giveFeedback = z.object({});
export const getPrompts = z.object({ action: z.literal('get_prompt'), promptId: z.string() });
