import { z } from "zod/v3";
import { pointerRequestSchema } from "../browser-control/pointer-actions.js";
import { screenshotOptionsSchema } from "../browser-control/viewport-capture.js";

// Config tools schemas
export const GetConfigArgsSchema = z.object({
  // 'ui' marks calls the config-editor widget fires programmatically; they are
  // excluded from tool-call telemetry (see isUiOriginCall in server.ts).
  origin: z.enum(['ui', 'llm']).optional(),
});

export const SetConfigValueArgsSchema = z.object({
  key: z.string(),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.null(),
  ]),
  // 'ui' marks widget-fired calls; excluded from tool-call telemetry.
  origin: z.enum(['ui', 'llm']).optional(),
});

// Empty schemas
export const ListProcessesArgsSchema = z.object({});

// Terminal tools schemas
export const StartProcessArgsSchema = z.object({
  command: z.string(),
  timeout_ms: z.number(),
  shell: z.string().optional(),
  verbose_timing: z.boolean().optional(),
  // 'ui' marks widget-fired calls (e.g. open-in-folder/editor buttons);
  // excluded from tool-call telemetry (see isUiOriginCall in server.ts).
  origin: z.enum(['ui', 'llm']).optional(),
});

export const ReadProcessOutputArgsSchema = z.object({
  pid: z.number(),
  timeout_ms: z.number().optional(),
  offset: z.number().optional(),   // Line offset: 0=from last read, positive=absolute, negative=tail
  length: z.number().optional(),   // Max lines to return (default from config.fileReadLineLimit)
  verbose_timing: z.boolean().optional(),
});

export const ForceTerminateArgsSchema = z.object({
  pid: z.number(),
});

export const ListSessionsArgsSchema = z.object({});

export const KillProcessArgsSchema = z.object({
  pid: z.number(),
});

// Filesystem tools schemas
export const ReadFileArgsSchema = z.object({
  path: z.string(),
  isUrl: z.boolean().optional().default(false),
  offset: z.number().optional().default(0),
  length: z.number().optional().default(1000),
  sheet: z.string().optional(),  // String only for MCP client compatibility (Cursor doesn't support union types in JSON Schema)
  range: z.string().optional(),
  options: z.record(z.any()).optional(),
  // Whether the call came from the file-preview UI (refresh/navigation) or the
  // LLM. 'ui' calls are excluded from tool-call telemetry; see isUiOriginCall
  // in server.ts.
  origin: z.enum(['ui', 'llm']).optional(),
});

export const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

export const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
  mode: z.enum(['rewrite', 'append']).default('rewrite'),
  // 'ui' when fired by the file-preview UI, else 'llm'. 'ui' calls are
  // excluded from tool-call telemetry; see isUiOriginCall in server.ts.
  origin: z.enum(['ui', 'llm']).optional(),
});

// PDF modification schemas - exported for reuse
export const PdfInsertOperationSchema = z.object({
  type: z.literal('insert'),
  pageIndex: z.number(),
  markdown: z.string().optional(),
  sourcePdfPath: z.string().optional(),
  pdfOptions: z.object({}).passthrough().optional(),
});

export const PdfDeleteOperationSchema = z.object({
  type: z.literal('delete'),
  pageIndexes: z.array(z.number()),
});

export const PdfOperationSchema = z.union([PdfInsertOperationSchema, PdfDeleteOperationSchema]);

export const WritePdfArgsSchema = z.object({
  path: z.string(),
  // Preprocess content to handle JSON strings that should be parsed as arrays
  content: z.preprocess(
    (val) => {
      // If it's a string that looks like JSON array, parse it
      if (typeof val === 'string' && val.trim().startsWith('[')) {
        try {
          return JSON.parse(val);
        } catch {
          // If parsing fails, return as-is (might be markdown content)
          return val;
        }
      }
      // Otherwise return as-is
      return val;
    },
    z.union([z.string(), z.array(PdfOperationSchema)])
  ),
  outputPath: z.string().optional(),
  options: z.object({}).passthrough().optional(), // Allow passing options to md-to-pdf
});

export const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

export const ListDirectoryArgsSchema = z.object({
  path: z.string(),
  depth: z.number().optional().default(2),
  // 'ui' when fired by the file-preview UI, else 'llm'. 'ui' calls are
  // excluded from tool-call telemetry; see isUiOriginCall in server.ts.
  origin: z.enum(['ui', 'llm']).optional(),
});

export const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const browserCanvas = z.object({
  mode:z.enum(['inventory','sample']),canvasId:z.string().uuid().optional(),
  columns:z.number().int().min(1).max(128).optional(),rows:z.number().int().min(1).max(64).optional(),
  paletteSize:z.number().int().min(2).max(16).optional(),
  labels:z.record(z.string().regex(/^#[0-9a-fA-F]{6}$/),z.string().min(1).max(80)).optional(),
}).strict().superRefine((v,c)=>{
  if(v.mode==='sample'&&!v.canvasId)c.addIssue({code:'custom',message:'canvasId required for sample'});
  if(Object.keys(v.labels??{}).length>(v.paletteSize??8))c.addIssue({code:'custom',message:'labels exceed palette budget'});
  if(v.mode==='inventory'&&Object.keys(v).some(k=>k!=='mode'))c.addIssue({code:'custom',message:'inventory takes only mode'});
});
export const BrowserControlArgsSchema = z.object({
  action: z.enum(['open', 'observe', 'act', 'pause', 'resume', 'close', 'status']),
  transport: z.enum(['isolated', 'extension']).optional(),
  sessionId: z.string().uuid().optional(),
  url: z.string().url().max(4000).optional(),
  observationId: z.string().uuid().optional(),
  actionId: z.string().min(1).max(64).optional(),
  text: z.string().max(2000).optional(),
  headless: z.boolean().optional().default(true),
  canvas:browserCanvas.optional(),
  screenshot: screenshotOptionsSchema.optional(),
  pointer: pointerRequestSchema.optional(),
  interactionCapabilities:z.array(z.enum(['keyboard','held-key','history'])).max(3).refine(v=>new Set(v).size===v.length).optional(),
  origin: z.enum(['ui', 'llm']).optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'open' && !value.url) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'url required for open' });
  if (value.transport && value.action !== 'open') ctx.addIssue({ code: 'custom', message: 'transport is open-only' });
  if(value.screenshot && value.action!=='observe')ctx.addIssue({code:'custom',message:'screenshot is observe-only'});
  if(value.pointer && value.action!=='act')ctx.addIssue({code:'custom',message:'pointer is act-only'});
  if(value.canvas && value.action!=='observe')ctx.addIssue({code:'custom',message:'canvas is observe-only'});
  if(value.interactionCapabilities && value.action!=='open')ctx.addIssue({code:'custom',message:'interactionCapabilities is open-only'});
  if (['observe', 'pause', 'resume', 'close'].includes(value.action) && !value.sessionId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sessionId required' });
  if (value.action === 'act') {
    if (!value.sessionId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sessionId required' });
    if (!value.observationId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'observationId required' });
    if (value.pointer?.captureId ? Boolean(value.actionId) : !value.actionId) ctx.addIssue({ code: 'custom', message: 'act requires either observed actionId or capture-bound pointer' });
    if (value.pointer && value.text !== undefined) ctx.addIssue({code:'custom',message:'text is not a pointer argument'});
  }
});

export const FileCheckpointArgsSchema = z.object({
  action: z.enum(['create', 'list', 'show', 'preview_restore', 'restore', 'drop']),
  paths: z.array(z.string().min(1).max(4000)).min(1).max(32).optional(),
  title: z.string().max(200).optional(),
  checkpointId: z.string().min(1).max(200).optional(),
  previewDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'create' && !value.paths?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'paths required for create' });
  if (['show','preview_restore','restore','drop'].includes(value.action) && !value.checkpointId) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'checkpointId required' });
  if (value.action === 'restore' && !value.previewDigest) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'previewDigest required for restore' });
});

export const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

// Edit tools schema - SIMPLIFIED from three modes to two
// Previously supported: text replacement, location-based edits (edits array), and range rewrites
// Now supports only: text replacement and range rewrites
// Removed 'edits' array parameter - location-based surgical edits were complex and unnecessary
// Range rewrites are more powerful and cover all structured file editing needs
export const EditBlockArgsSchema = z.object({
  file_path: z.string(),
  // Text file string replacement
  old_string: z.string().optional(),
  new_string: z.string().optional(),
  expected_replacements: z.number().optional().default(1),
  // Structured file range rewrite (Excel, etc.)
  range: z.string().optional(),
  content: z.any().optional(),
  options: z.record(z.any()).optional(),
  // 'ui' when fired by the file-preview UI, else 'llm'. 'ui' calls are
  // excluded from tool-call telemetry; see isUiOriginCall in server.ts.
  origin: z.enum(['ui', 'llm']).optional(),
}).refine(
  data => {
    // Helper to check if value is actually provided (not undefined, not empty string)
    const hasValue = (v: unknown) => v !== undefined && v !== '';
    return (hasValue(data.old_string) && data.new_string !== undefined) ||
           (hasValue(data.range) && hasValue(data.content));
  },
  { message: "Must provide either (old_string + new_string) or (range + content)" }
);

// Send input to process schema
export const InteractWithProcessArgsSchema = z.object({
  pid: z.number(),
  input: z.string(),
  timeout_ms: z.number().optional(),
  wait_for_prompt: z.boolean().optional(),
  verbose_timing: z.boolean().optional(),
});

// Usage stats schema
export const GetUsageStatsArgsSchema = z.object({});

// Feedback tool schema - no pre-filled parameters, all user input
export const GiveFeedbackArgsSchema = z.object({
  // No parameters needed - form will be filled manually by user
  // Only auto-filled hidden fields remain:
  // - tool_call_count (auto)
  // - days_using (auto) 
  // - platform (auto)
  // - client_id (auto)
});

// Search schemas (renamed for natural language)
export const StartSearchArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  searchType: z.enum(['files', 'content']).default('files'),
  filePattern: z.string().optional(),
  ignoreCase: z.boolean().optional().default(true),
  maxResults: z.number().optional(),
  includeHidden: z.boolean().optional().default(false),
  contextLines: z.number().optional().default(5),
  timeout_ms: z.number().optional(), // Match process naming convention
  earlyTermination: z.boolean().optional(), // Stop search early when exact filename match is found (default: true for files, false for content)
  literalSearch: z.boolean().optional().default(false), // Force literal string matching (-F flag) instead of regex
  // 'ui' marks widget-fired calls (e.g. markdown link-target search);
  // excluded from tool-call telemetry (see isUiOriginCall in server.ts).
  origin: z.enum(['ui', 'llm']).optional(),
});

export const GetMoreSearchResultsArgsSchema = z.object({
  sessionId: z.string(),
  offset: z.number().optional().default(0),    // Same as file reading
  length: z.number().optional().default(100),  // Same as file reading (but smaller default)
});

export const StopSearchArgsSchema = z.object({
  sessionId: z.string(),
});

export const ListSearchesArgsSchema = z.object({});

// Prompts tool schema - SIMPLIFIED (only get_prompt action)
export const GetPromptsArgsSchema = z.object({
  action: z.enum(['get_prompt']),
  promptId: z.string(),
  // Disabled to check if it makes sense or should be removed or changed
  // anonymous_user_use_case: z.string().optional(),
});

// Tool history schema
export const GetRecentToolCallsArgsSchema = z.object({
  maxResults: z.number().min(1).max(1000).optional().default(50),
  toolName: z.string().optional(),
  since: z.string().datetime().optional(),
  compact: z.boolean().optional().default(false),
  failuresOnly: z.boolean().optional().default(false),
});

/**
 * Map of tool name -> argument schema, used by the dispatcher to detect and warn
 * about parameters a caller sent that the tool does not support. Keep in sync
 * with the tool definitions in server.ts.
 */
export const toolArgSchemas: Record<string, z.ZodTypeAny> = {
  get_config: GetConfigArgsSchema,
  set_config_value: SetConfigValueArgsSchema,
  read_file: ReadFileArgsSchema,
  read_multiple_files: ReadMultipleFilesArgsSchema,
  write_file: WriteFileArgsSchema,
  write_pdf: WritePdfArgsSchema,
  create_directory: CreateDirectoryArgsSchema,
  list_directory: ListDirectoryArgsSchema,
  move_file: MoveFileArgsSchema,
  file_checkpoint: FileCheckpointArgsSchema,
  browser_control: BrowserControlArgsSchema,
  start_search: StartSearchArgsSchema,
  get_more_search_results: GetMoreSearchResultsArgsSchema,
  stop_search: StopSearchArgsSchema,
  list_searches: ListSearchesArgsSchema,
  get_file_info: GetFileInfoArgsSchema,
  edit_block: EditBlockArgsSchema,
  start_process: StartProcessArgsSchema,
  read_process_output: ReadProcessOutputArgsSchema,
  interact_with_process: InteractWithProcessArgsSchema,
  force_terminate: ForceTerminateArgsSchema,
  list_sessions: ListSessionsArgsSchema,
  list_processes: ListProcessesArgsSchema,
  kill_process: KillProcessArgsSchema,
  get_usage_stats: GetUsageStatsArgsSchema,
  get_recent_tool_calls: GetRecentToolCallsArgsSchema,
  give_feedback_to_desktop_commander: GiveFeedbackArgsSchema,
  get_prompts: GetPromptsArgsSchema,
};
