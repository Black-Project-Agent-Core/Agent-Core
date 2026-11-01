import { createHash } from 'node:crypto';
import type { VerifiedKey } from './auth/key-types.js';
import type { AgentModelImage, AgentModelTool } from './agent-provider.js';
import type { AgentToolRestriction } from './agent-capability-catalog.js';
import { createAgentCoreMcpServer, createAgentCoreToolHost, WORKSPACE_BOUND_NATIVE_TOOLS, type AgentCoreMcpRuntime } from './mcp/server.js';
import { InProcessToolHost } from './mcp/in-process-tool-host.js';
import { isReadOnlyToolCall } from './mcp/mutation-safety.js';
import type { ToolCaller } from './tracker/tool-invocation.js';

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
 * How a Native session reaches the tools: a plain in-process registry, the same tool registrations, with no MCP server,
 * client or transport built. MCP is for third parties (the external HTTP surface); Native dispatches its own tools directly.
 */
interface ToolPort {
  readonly kind: 'direct';
  listTools(): Promise<any[]>;
  callTool(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal; invocationId?: string }): Promise<any>;
  close(): Promise<void>;
}

/**
 * The registry only lists a different set of names when one of these runtime fields appears or disappears (see the
 * conditional registrations in `createAgentCoreMcpServer`), or when the phone controller is switched on or off.
 */
const REGISTRY_SHAPE_FIELDS = [
  'memoryService', 'memoryExperience', 'learningService', 'semanticIde', 'skillsService', 'codeIntelligence',
  'webResearch', 'artifactAuthorization', 'externalControllerLearning', 'controllerSessionId', 'nativeTaskId', 'nativeWorkspace',
] as const satisfies ReadonlyArray<keyof AgentCoreMcpRuntime>;
const toolNamesByShape = new Map<string, readonly string[]>();
function registryShape(runtime: AgentCoreMcpRuntime): string {
  const present = REGISTRY_SHAPE_FIELDS.map(field => (runtime[field] ? '1' : '0')).join('');
  return `${present}:${runtime.phoneController?.enabled ? '1' : '0'}`;
}

/**
 * Default: one registry per process serves every Native task, each call naming its own task through a ToolCaller.
 * AGENT_CORE_NATIVE_TOOL_REGISTRY=per-task builds a registry for each session with its task fixed at registration (the earlier path).
 */
const useSharedRegistry = (runtime: AgentCoreMcpRuntime) =>
  process.env.AGENT_CORE_NATIVE_TOOL_REGISTRY !== 'per-task' && Boolean(runtime.nativeTaskId);

/** What belongs to one task or session, not to the process: the shared registry is built without any of it. */
const PER_TASK_FIELDS: ReadonlySet<string> = new Set(['nativeTaskId', 'nativeWorkspace', 'failureLoopAdvisor', 'imageInspector', 'toolTarget', 'sharedNativeRegistry']);
const sharedHosts = new Map<string, { services: Record<string, unknown>; host: InProcessToolHost }>();
/** One registry per registry shape, rebuilt only when the services behind it are not the same objects any more. */
function sharedHostFor(runtime: AgentCoreMcpRuntime): InProcessToolHost {
  const services = Object.fromEntries(Object.entries(runtime).filter(([field, value]) => !PER_TASK_FIELDS.has(field) && value !== undefined));
  const key = REGISTRY_SHAPE_FIELDS.filter(field => !PER_TASK_FIELDS.has(field)).map(field => (runtime[field] ? '1' : '0')).join('')
    + ':' + (runtime.phoneController?.enabled ? '1' : '0');
  const known = sharedHosts.get(key);
  const sameServices = known && Object.keys(known.services).length === Object.keys(services).length
    && Object.entries(services).every(([field, value]) => known.services[field] === value);
  if (known && sameServices) return known.host;
  const host = new InProcessToolHost();
  createAgentCoreMcpServer(undefined, { ...services, sharedNativeRegistry: true, toolTarget: host });
  sharedHosts.set(key, { services, host });
  return host;
}
// A hung tool must not hold a turn forever; bound one call at 60 s.
const DIRECT_CALL_TIMEOUT_MS = 60_000;

class DirectToolPort implements ToolPort {
  readonly kind = 'direct' as const;
  /** A caller means the host is the registry shared by every Native task: it lists and runs only what this caller is granted. */
  constructor(private readonly host: InProcessToolHost, private readonly caller?: ToolCaller) {}

  async listTools(): Promise<any[]> {
    return this.host.listTools(this.caller);
  }

  async callTool(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal; invocationId?: string }): Promise<any> {
    const { signal, invocationId } = options;
    const running = this.host.callTool(name, args, {
      ...(signal ? { signal } : {}),
      ...(invocationId ? { meta: { 'io.agentcore/invocation-id': invocationId } } : {}),
      ...(this.caller ? { caller: this.caller } : {}),
    });
    // A result that arrives after Stop or the timeout is discarded.
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

export class AgentRuntimeToolSession {
  private constructor(
    readonly sessionId: string,
    private readonly port: ToolPort,
    readonly allowedTools: readonly string[],
    private readonly restrictions: Readonly<Record<string, AgentToolRestriction>>,
  ) {}

  /** Native dispatches every tool through the in-process registry; this is not a transport choice. */
  get transport(): 'direct' {
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
    if (useSharedRegistry(runtime)) {
      // A workspace-less task never had the workspace-bound tools: a per-task registry did not register them for it.
      const granted = key.toolGrant!.allowedTools.filter(name => runtime.nativeWorkspace || !WORKSPACE_BOUND_NATIVE_TOOLS.has(name));
      port = new DirectToolPort(sharedHostFor(runtime), {
        taskId: runtime.nativeTaskId!, sessionId, principalId: key.id, allowedTools: new Set(granted),
        ...(runtime.nativeWorkspace ? { workspace: runtime.nativeWorkspace } : {}),
        ...(runtime.failureLoopAdvisor ? { failureLoopAdvisor: runtime.failureLoopAdvisor } : {}),
        ...(runtime.imageInspector ? { imageInspector: runtime.imageInspector } : {}),
      });
    } else {
      port = new DirectToolPort(createAgentCoreToolHost(key, runtime));
    }
    return new AgentRuntimeToolSession(sessionId, port, key.toolGrant!.allowedTools, restrictions);
  }

  /** Names only, so one process builds the throw-away discovery registry once per registry shape instead of once per turn. */
  static async discoverAvailableTools(runtime: AgentCoreMcpRuntime): Promise<string[]> {
    const shape = registryShape(runtime);
    const known = toolNamesByShape.get(shape);
    if (known) return [...known];
    const names = await AgentRuntimeToolSession.listAvailableToolNames(runtime);
    toolNamesByShape.set(shape, names);
    return [...names];
  }

  private static async listAvailableToolNames(runtime: AgentCoreMcpRuntime): Promise<string[]> {
    if (useSharedRegistry(runtime)) {
      return sharedHostFor(runtime).listTools().map(tool => tool.name)
        .filter(name => runtime.nativeWorkspace || !WORKSPACE_BOUND_NATIVE_TOOLS.has(name));
    }
    return createAgentCoreToolHost(undefined, runtime).listTools().map(tool => tool.name);
  }

  /** Own keys only: restrictions can arrive as a plain object, whose prototype members are not tool names. */
  private restrictionFor(name: string): AgentToolRestriction | undefined {
    return Object.hasOwn(this.restrictions, name) ? this.restrictions[name] : undefined;
  }

  // The registry, the grant and the restrictions are fixed when the session opens, so these are read once; a changed grant opens a new session.
  private listing?: any[];
  private definitions?: AgentModelTool[];
  private digest?: string;

  private async listedTools(): Promise<any[]> {
    return this.listing ??= await this.port.listTools();
  }

  async modelTools(): Promise<AgentModelTool[]> {
    return this.definitions ??= await this.buildModelTools();
  }

  private async buildModelTools(): Promise<AgentModelTool[]> {
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
    return this.digest ??= await this.computeContractDigest();
  }

  private async computeContractDigest(): Promise<string> {
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

  /** Per call: a mixed tool such as `skills` only mutates for its writing actions. Unknown or unclear arguments count as mutation. */
  async isMutating(name: string, args?: Record<string, unknown>): Promise<boolean> {
    const tool = (await this.listedTools()).find(item => String(item.name) === name);
    if (!tool) throw new Error('AGENT_RUNTIME_TOOL_NOT_GRANTED');
    return !isReadOnlyToolCall(name, tool.annotations, args);
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
   * mid-call forwards the abort to the handler's `ctx.mcpReq.signal`, so only handlers that consume
   * it actually stop. A late result of a handler that ignores it is discarded.
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
