import { createHash } from 'node:crypto';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { VerifiedKey } from './auth/key-types.js';
import type { AgentModelTool } from './agent-provider.js';
import type { AgentToolRestriction } from './agent-capability-catalog.js';
import { createAgentCoreMcpServer, type AgentCoreMcpRuntime } from './mcp/server.js';

export interface AgentToolResult {
  name: string;
  isError: boolean;
  text: string;
  raw: unknown;
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
export class AgentRuntimeToolSession {
  private constructor(
    readonly sessionId: string,
    private readonly client: Client,
    private readonly server: ReturnType<typeof createAgentCoreMcpServer>,
    readonly allowedTools: readonly string[],
    private readonly restrictions: Readonly<Record<string, AgentToolRestriction>>,
  ) {}

  static async open(
    sessionId: string,
    allowedTools: string[],
    runtime: AgentCoreMcpRuntime,
    restrictions: Record<string, AgentToolRestriction> = {},
  ): Promise<AgentRuntimeToolSession> {
    const key = principal(sessionId, allowedTools);
    const server = createAgentCoreMcpServer(key, runtime);
    const client = new Client({ name: 'agent-core-native-runtime', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return new AgentRuntimeToolSession(
      sessionId,
      client,
      server,
      key.toolGrant!.allowedTools,
      restrictions,
    );
  }

  static async discoverAvailableTools(runtime: AgentCoreMcpRuntime): Promise<string[]> {
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

  private async listedTools(): Promise<any[]> {
    const listed = await this.client.listTools();
    return listed.tools as any[];
  }

  async modelTools(): Promise<AgentModelTool[]> {
    const tools = await this.listedTools();
    return tools.map((tool: any) => {
      const restriction = this.restrictions[String(tool.name)];
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
    const restriction = this.restrictions[name];
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
    const request: any = { name, arguments: args };
    if (invocationId) {
      request._meta = { 'io.agentcore/invocation-id': invocationId };
    }
    const raw: any = await this.client.callTool(request, signal ? { signal } : undefined);
    return {
      name,
      isError: raw?.isError === true,
      text: toolText(raw),
      raw,
    };
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
