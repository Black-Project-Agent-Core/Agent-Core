import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { CallToolResult } from '@modelcontextprotocol/client';
import { AGENT_CORE_VERSION } from '../version.js';
import { GrafelRuntime } from './grafel-runtime.js';

type ToolSurfaceListener = (toolNames: string[]) => void | Promise<void>;

export class GrafelClient {
  private client?: Client;
  private transport?: StdioClientTransport;
  private connecting?: Promise<void>;
  private refreshingTools?: Promise<string[]>;
  private toolNames = new Set<string>();
  private toolSurfaceListener?: ToolSurfaceListener;

  constructor(
    private readonly runtime: GrafelRuntime,
    private readonly timeoutMs: number,
  ) {}

  setToolSurfaceListener(listener: ToolSurfaceListener | undefined): void {
    this.toolSurfaceListener = listener;
  }

  async connect(): Promise<void> {
    if (this.client && this.transport) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.connectInternal().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  async listToolNames(): Promise<string[]> {
    await this.connect();
    return [...this.toolNames].sort();
  }

  async refreshToolNames(): Promise<string[]> {
    await this.connect();
    if (!this.client) throw new Error('GRAFEL_CLIENT_NOT_CONNECTED');
    if (this.refreshingTools) return this.refreshingTools;

    this.refreshingTools = (async () => {
      const listed = await this.withTimeout(this.client!.listTools(), this.timeoutMs);
      const next = new Set(listed.tools.map(tool => tool.name));
      const before = [...this.toolNames].sort();
      const after = [...next].sort();
      this.toolNames = next;
      if (before.join('\0') !== after.join('\0') && this.toolSurfaceListener) {
        await this.toolSurfaceListener(after);
      }
      return after;
    })().finally(() => {
      this.refreshingTools = undefined;
    });
    return this.refreshingTools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    context: { cwd?: string } = {},
  ): Promise<CallToolResult> {
    await this.connect();
    if (!this.client) throw new Error('GRAFEL_CLIENT_NOT_CONNECTED');
    if (!this.toolNames.has(name)) throw new Error(`GRAFEL_TOOL_UNAVAILABLE: ${name}`);

    try {
      return await this.withTimeout(
        this.client.callTool({
          name,
          arguments: args,
          _meta: { cwd: context.cwd ?? this.runtime.config.projectRoot },
        } as any),
        this.timeoutMs,
      );
    } catch (error) {
      await this.reset().catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.reset();
  }

  private async connectInternal(): Promise<void> {
    const transport = new StdioClientTransport({
      command: this.runtime.config.binaryPath,
      args: ['mcp-bridge'],
      cwd: this.runtime.config.projectRoot,
      env: this.runtime.stdioEnvironment(),
      stderr: 'ignore',
      maxBufferSize: 10 * 1024 * 1024,
    });
    const client = new Client({
      name: 'agent-core-code-intelligence',
      version: AGENT_CORE_VERSION,
    });

    try {
      await this.withTimeout(client.connect(transport), this.timeoutMs);
      client.setNotificationHandler('notifications/tools/list_changed', async () => {
        await this.refreshToolNames().catch(() => undefined);
      });
      this.transport = transport;
      this.client = client;
      const listed = await this.withTimeout(client.listTools(), this.timeoutMs);
      this.toolNames = new Set(listed.tools.map(tool => tool.name));
    } catch (error) {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
      throw error;
    }
  }

  private async reset(): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    this.client = undefined;
    this.transport = undefined;
    this.toolNames.clear();
    if (client) await client.close().catch(() => undefined);
    if (transport) await transport.close().catch(() => undefined);
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`GRAFEL_TIMEOUT_AFTER_${timeoutMs}MS`)), timeoutMs);
        timer.unref();
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
}
