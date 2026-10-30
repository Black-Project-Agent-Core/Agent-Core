import * as z from 'zod/v4';
import type { ToolCaller } from '../tracker/tool-invocation.js';

/**
 * The tool registry a Native turn calls inside its own process. Native does not need an MCP server: the same
 * `registerTool(name, config, callback)` registrations (and the grant, mutation-safety and evidence wrappers that hang on
 * that one method) fill this registry instead, and a call is a function call. MCP stays the surface for third parties.
 * Listing and calling follow the MCP SDK's own rules (schema conversion, input validation, error results) so the model
 * sees the same contract and the same messages on either path.
 */
const JSON_SCHEMA_TARGET = 'draft-2020-12';
const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {} };

export interface HostToolConfig {
  title?: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export interface HostCallOptions {
  /** The turn's Stop signal; handlers read it as `ctx.mcpReq.signal`. */
  signal?: AbortSignal;
  /** Request metadata; handlers read it as `ctx.mcpReq._meta` (for example the durable invocation id). */
  meta?: Record<string, unknown>;
  /** Who the call is for, supplied by the host; handlers read it as `ctx.mcpReq.caller`. A caller can only run its granted tools. */
  caller?: ToolCaller;
}

export interface RegisteredHostTool {
  readonly enabled: boolean;
  enable(): void;
  disable(): void;
  remove(): void;
}

interface HostTool extends HostToolConfig {
  inputSchema: any;
  handler: (...args: any[]) => unknown;
  enabled: boolean;
  inputJson?: Record<string, unknown>;
}

/** A raw zod shape ({ field: z.string() }) is accepted like in the SDK; a Standard Schema is used as given. */
function normalizeSchema(schema: unknown): any {
  if (schema === undefined) return undefined;
  if (typeof schema === 'object' && schema !== null && !('~standard' in schema)) return z.object(schema as z.ZodRawShape);
  return schema;
}

function inputJsonSchema(schema: any): Record<string, unknown> {
  const standard = schema['~standard'];
  const result = standard.jsonSchema
    ? standard.jsonSchema.input({ target: JSON_SCHEMA_TARGET })
    : z.toJSONSchema(schema, { target: JSON_SCHEMA_TARGET, io: 'input' });
  // Same key order as the MCP client hands back (type, properties, required, then the rest), because the tool contract
  // digest hashes the JSON text and a stored checkpoint must still match on either path.
  const { type: _type, properties, required, ...rest } = result as Record<string, unknown>;
  return { type: 'object', ...(properties !== undefined ? { properties } : {}), ...(required !== undefined ? { required } : {}), ...rest };
}

function formatIssue(issue: { path?: Array<unknown>; message: string }): string {
  if (!issue.path?.length) return issue.message;
  return `${issue.path.map(part => String(typeof part === 'object' && part !== null ? (part as { key: unknown }).key : part)).join('.')}: ${issue.message}`;
}

export class InProcessToolHost {
  private readonly tools = new Map<string, HostTool>();

  registerTool(name: string, config: HostToolConfig, callback: (...args: any[]) => unknown): RegisteredHostTool {
    if (this.tools.has(name)) throw new Error(`Tool ${name} is already registered`);
    const tool: HostTool = { ...config, inputSchema: normalizeSchema(config.inputSchema), handler: callback, enabled: true };
    this.tools.set(name, tool);
    return {
      get enabled() { return tool.enabled; },
      enable: () => { tool.enabled = true; },
      disable: () => { tool.enabled = false; },
      remove: () => { this.tools.delete(name); },
    };
  }

  /** Enabled tools only, in registration order, shaped like an MCP `tools/list` entry; with a caller, only the ones it is granted. */
  listTools(caller?: Pick<ToolCaller, 'allowedTools'>): Array<{ name: string; title?: string; description?: string; inputSchema: Record<string, unknown>;
    annotations?: Record<string, unknown>; _meta?: Record<string, unknown> }> {
    return [...this.tools].filter(([name, tool]) => tool.enabled && (!caller || caller.allowedTools.has(name))).map(([name, tool]) => {
      tool.inputJson ??= tool.inputSchema ? inputJsonSchema(tool.inputSchema) : EMPTY_OBJECT_SCHEMA;
      return { name, title: tool.title, description: tool.description, inputSchema: tool.inputJson,
        annotations: tool.annotations, _meta: tool._meta };
    });
  }

  /** An unknown or disabled tool throws; bad arguments and handler failures come back as an `isError` result. */
  async callTool(name: string, args: unknown, options: HostCallOptions = {}): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    if (!tool.enabled || (options.caller && !options.caller.allowedTools.has(name))) throw new Error(`Tool ${name} disabled`);
    try {
      const ctx = { mcpReq: { signal: options.signal ?? new AbortController().signal, _meta: options.meta, caller: options.caller } };
      if (!tool.inputSchema) return await tool.handler(ctx);
      const checked = await tool.inputSchema['~standard'].validate(args ?? {});
      if (checked.issues?.length) {
        throw new Error(`Input validation error: Invalid arguments for tool ${name}: ${checked.issues.map(formatIssue).join(', ')}`);
      }
      return await tool.handler(checked.value, ctx);
    } catch (error) {
      return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
    }
  }
}
