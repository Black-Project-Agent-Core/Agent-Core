import { createHash } from 'node:crypto';
// The MCP client is only loaded on the fallback path (AGENT_CORE_NATIVE_TOOL_TRANSPORT=mcp); Native does not need it.
import type { Client } from '@modelcontextprotocol/client';
import type { VerifiedKey } from './auth/key-types.js';
import type { AgentModelImage, AgentModelTool } from './agent-provider.js';
import type { AgentToolRestriction } from './agent-capability-catalog.js';
import { createAgentCoreMcpServer, createAgentCoreToolHost, type AgentCoreMcpRuntime } from './mcp/server.js';
import type { InProcessToolHost } from './mcp/in-process-tool-host.js';

export interface AgentToolResult {
  name: string;
  isError: boolean;
  text: string;
  /** Pictures the tool returned (read_file on an image, image_inspect, a screenshot), bounded; the model may see them. */
  images?: AgentModelImage[];
  raw: unknown;
}

const IMAGE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_TOOL_IMAGES = 3;
// Anthropic accepts up to 5 MB per image; stay under it and keep one result from filling the context.
const MAX_TOOL_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOOL_IMAGES_TOTAL_BYTES = 8 * 1024 * 1024;

/** The supported pictures in an MCP tool result, bounded in number and size. Anything else is left out. */
export function toolImages(result: any): AgentModelImage[] {
  if (!Array.isArray(result?.content)) return [];
  const images: AgentModelImage[] = [];
  let total = 0;
  for (const item of result.content) {
    if (images.length >= MAX_TOOL_IMAGES) break;
    if (item?.type !== 'image' || typeof item.data !== 'string' || !IMAGE_MEDIA_TYPES.has(String(item.mimeType))) continue;
    const bytes = Math.floor(item.data.length * 3 / 4);
    if (bytes > MAX_TOOL_IMAGE_BYTES || total + bytes > MAX_TOOL_IMAGES_TOTAL_BYTES) continue;
    total += bytes;
    images.push({ mediaType: item.mimeType as AgentModelImage['mediaType'], dataBase64: item.data });
  }
  return images;
}

function principal(sessionId: string, allowedTools: string[]): VerifiedKey {
  const now = new Date().toISOString();
  return {
    id: `agent-runtime:${sessionId}`,
    name: 'Native Agent Runtime',
    createdAt: now,
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    authentication: 'bearer-api-key',
    toolGrant: { version: 1, allowedTools: [...new Set(allowedTools)] },
  };
}

/**
 * Tools whose handler consumes the MCP request signal (`ctx.mcpReq.signal` or the mutation context
 * signal) and stops its own work on Stop. Every other tool only has its late result discarded, and a
 * child process or an in-progress write may still finish. Keep in step with the handlers' signal use.
 */
const STOP_OBSERVING_TOOLS: ReadonlySet<string> = new Set([
  'read_file', 'read_multiple_files', 'web_search', 'web_open', 'browser_control',
  'native_chat_bridge', 'artifact_inspect', 'reconstruction_harness', 'memory_v2_read', 'memory_v2_write',
]);
export function toolObservesStop(name: string): boolean {
  return STOP_OBSERVING_TOOLS.has(name);
}

function toolText(result: any): string {
  if (!Array.isArray(result?.content)) return JSON.stringify(result);
  return result.content
    .filter((item: any) => item?.type === 'text')
    .map((item: any) => String(item.text ?? ''))
    .join('\n')
    .slice(0, 200_000);
}
/**
 * How a Native session reaches the tools. The default is a plain in-process registry: the same tool registrations, with no MCP
 * server, client or transport built. MCP is for third parties; the older in-memory MCP path stays only behind the switch
 * AGENT_CORE_NATIVE_TOOL_TRANSPORT=mcp.
 */
interface ToolPort {
  readonly kind: 'direct' | 'mcp';
  listTools(): Promise<any[]>;
  callTool(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal; invocationId?: string }): Promise<any>;
  close(): Promise<void>;
}

const useMcpTransport = () => process.env.AGENT_CORE_NATIVE_TOOL_TRANSPORT === 'mcp';
// The MCP client bounded one call at 60 s; the direct path keeps that bound so a hung tool cannot hold a turn forever.
const DIRECT_CALL_TIMEOUT_MS = 60_000;

class DirectToolPort implements ToolPort {
  readonly kind = 'direct' as const;
  constructor(private readonly host: InProcessToolHost) {}

  async listTools(): Promise<any[]> {
    return this.host.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal; invocationId?: string }): Promise<any> {
    const { signal, invocationId } = options;
    const running = this.host.callTool(name, args, {
      ...(signal ? { signal } : {}),
      ...(invocationId ? { meta: { 'io.agentcore/invocation-id': invocationId } } : {}),
    });
    // A result that arrives after Stop or the timeout is discarded, as with the MCP client.
    running.catch(() => undefined);
    let release = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Request timed out')), DIRECT_CALL_TIMEOUT_MS);
      const onAbort = () => reject(signal?.reason instanceof Error ? signal.reason : new Error('Request aborted'));
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      release = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    });
    try {
      return await Promise.race([running, interrupted]);
    } finally {
      release();
    }
  }

  async close(): Promise<void> {}
}

class McpToolPort implements ToolPort {
  readonly kind = 'mcp' as const;
  constructor(
    private readonly client: Client,
    private readonly server: ReturnType<typeof createAgentCoreMcpServer>,
  ) {}

  async listTools(): Promise<any[]> {
    return (await this.client.listTools()).tools as any[];
  }

  async callTool(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal; invocationId?: string }): Promise<any> {
    const request: any = { name, arguments: args };
    if (options.invocationId) request._meta = { 'io.agentcore/invocation-id': options.invocationId };
    return this.client.callTool(request, options.signal ? { signal: options.signal } : undefined);
  }

  async close(): Promise<void> {
    const failures: unknown[] = [];
    try { await this.client.close(); } catch (error) { failures.push(error); }
    try { await this.server.close(); } catch (error) { failures.push(error); }
    if (failures.length) {
      throw failures[0] instanceof Error ? failures[0] : new Error(String(failures[0]));
    }
  }
}

export class AgentRuntimeToolSession {
  private constructor(
    readonly sessionId: string,
    private readonly port: ToolPort,
    readonly allowedTools: readonly string[],
    private readonly restrictions: Readonly<Record<string, AgentToolRestriction>>,
  ) {}

  /** Which path this session uses: 'direct' (in-process registry) or 'mcp' (the older in-memory MCP client and server). */
  get transport(): 'direct' | 'mcp' {
    return this.port.kind;
  }

  static async open(
    sessionId: string,
    allowedTools: string[],
    runtime: AgentCoreMcpRuntime,
    restrictions: Record<string, AgentToolRestriction> = {},
  ): Promise<AgentRuntimeToolSession> {
    const key = principal(sessionId, allowedTools);
    let port: ToolPort;
    if (useMcpTransport()) {
      const { Client, InMemoryTransport } = await import('@modelcontextprotocol/client');
      const server = createAgentCoreMcpServer(key, runtime);
      const client = new Client({ name: 'agent-core-native-runtime', version: '1.0.0' });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      port = new McpToolPort(client, server);
    } else {
      port = new DirectToolPort(createAgentCoreToolHost(key, runtime));
    }
    return new AgentRuntimeToolSession(sessionId, port, key.toolGrant!.allowedTools, restrictions);
  }

  static async discoverAvailableTools(runtime: AgentCoreMcpRuntime): Promise<string[]> {
    if (!useMcpTransport()) return createAgentCoreToolHost(undefined, runtime).listTools().map(tool => tool.name);
    const { Client, InMemoryTransport } = await import('@modelcontextprotocol/client');
    const server = createAgentCoreMcpServer(undefined, runtime);
    const client = new Client({ name: 'agent-core-native-discovery', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      return listed.tools.map((tool: any) => String(tool.name)).filter(Boolean);
    } finally {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  }

  /** Own keys only: restrictions can arrive as a plain object, whose prototype members are not tool names. */
  private restrictionFor(name: string): AgentToolRestriction | undefined {
    return Object.hasOwn(this.restrictions, name) ? this.restrictions[name] : undefined;
  }

  private async listedTools(): Promise<any[]> {
    return this.port.listTools();
  }

  async modelTools(): Promise<AgentModelTool[]> {
    const tools = await this.listedTools();
    return tools.map((tool: any) => {
      const restriction = this.restrictionFor(String(tool.name));
      const schema = tool.inputSchema && typeof tool.inputSchema === 'object'
        ? structuredClone(tool.inputSchema)
        : { type: 'object', properties: {} };
      const properties = schema.properties && typeof schema.properties === 'object'
        ? schema.properties as Record<string, any>
        : undefined;
      if (restriction?.allowedActions?.length && properties?.action) {
        properties.action = {
          ...properties.action,
          enum: [...restriction.allowedActions],
        };
      }
      if (restriction?.forbidUrlRead && properties?.isUrl) {
        properties.isUrl = { ...properties.isUrl, enum: [false] };
      }
      return {
        type: 'function' as const,
        function: {
          name: tool.name,
          ...(tool.description ? { description: tool.description } : {}),
          parameters: schema,
        },
      };
    });
  }

  async contractDigest(): Promise<string> {
    const definitions = (await this.modelTools())
      .map(tool => ({
        name: tool.function.name,
        description: tool.function.description ?? '',
        parameters: tool.function.parameters,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return 'sha256:' + createHash('sha256')
      .update(JSON.stringify(definitions), 'utf8').digest('hex');
  }

  async isMutating(name: string): Promise<boolean> {
    const tool = (await this.listedTools()).find(item => String(item.name) === name);
    if (!tool) throw new Error('AGENT_RUNTIME_TOOL_NOT_GRANTED');
    return tool?.annotations?.readOnlyHint !== true;
  }

  /** Pure local admission check. Must run before a mutating dispatch is checkpointed. */
  admissionIssue(name: string, args: Record<string, unknown>): string | null {
    if (!this.allowedTools.includes(name)) return 'AGENT_RUNTIME_TOOL_NOT_GRANTED';
    const restriction = this.restrictionFor(name);
    if (restriction?.allowedActions?.length) {
      const action = typeof args.action === 'string' ? args.action : '';
      if (!restriction.allowedActions.includes(action)) return 'AGENT_RUNTIME_TOOL_ACTION_NOT_GRANTED';
    }
    if (restriction?.forbidUrlRead && args.isUrl === true) return 'AGENT_RUNTIME_TOOL_ARGUMENT_NOT_GRANTED';
    return null;
  }

  /**
   * `signal` is the turn's Stop signal. Aborting it before dispatch makes no tool call; aborting it
   * mid-call makes the MCP client send `notifications/cancelled`, so only handlers that consume
   * `ctx.mcpReq.signal` actually stop. A late result of a handler that ignores it is discarded.
   */
  async call(
    name: string,
    args: Record<string, unknown>,
    invocationId?: string,
    signal?: AbortSignal,
  ): Promise<AgentToolResult> {
    const admissionIssue = this.admissionIssue(name, args);
    if (admissionIssue) throw new Error(admissionIssue);
    if (signal?.aborted) throw new Error('AGENT_RUNTIME_TURN_STOPPED');
    const raw: any = await this.port.callTool(name, args, { ...(signal ? { signal } : {}), ...(invocationId ? { invocationId } : {}) });
    const images = raw?.isError === true ? [] : toolImages(raw);
    return {
      name,
      isError: raw?.isError === true,
      text: toolText(raw),
      ...(images.length ? { images } : {}),
      raw,
    };
  }

  async close(): Promise<void> {
    await this.port.close();
  }
}
