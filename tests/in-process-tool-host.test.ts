import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { InProcessToolHost } from '../src/mcp/in-process-tool-host.js';
import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';

// Native calls its own tools in the same process, so it does not need an MCP server. The host must behave exactly like
// the MCP server it replaces for the same registrations; every check below compares the two instead of fixing strings.
const nativeRuntime = { nativeTaskId: 'fixture-native-task', nativeWorkspace: 'agent-core' };
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const close of closers.splice(0)) await close();
});

function register(target: any) {
  target.registerTool('echo', { title: 'Echo', description: 'Echo text', inputSchema: z.object({ text: z.string().min(1), times: z.number().int().optional() }),
    annotations: { readOnlyHint: true } },
  async (args: any, ctx: any) => ({ content: [{ type: 'text', text: args.text + ':' + (ctx?.mcpReq?._meta?.['io.agentcore/invocation-id'] ?? '-') }] }));
  target.registerTool('boom', { description: 'Throws', inputSchema: z.object({}) }, async () => { throw new Error('exploded'); });
  target.registerTool('hidden', { description: 'Disabled', inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'x' }] })).disable();
  target.registerTool('wait', { description: 'Waits for the stop signal', inputSchema: z.object({}) },
    async (_args: any, ctx: any) => new Promise(resolve => {
      const done = () => resolve({ content: [{ type: 'text', text: 'aborted' }] });
      if (ctx.mcpReq.signal.aborted) done(); else ctx.mcpReq.signal.addEventListener('abort', done);
    }));
}

async function mcpPeer() {
  const server = new McpServer({ name: 'fixture', version: '1.0.0' });
  register(server);
  const client = new Client({ name: 'fixture-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  closers.push(async () => { await client.close(); await server.close(); });
  return client;
}
const hostPeer = () => { const host = new InProcessToolHost(); register(host); return host; };
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('InProcessToolHost matches the MCP server for the same registrations', () => {
  it('lists the same definitions and hides a disabled tool', async () => {
    const client = await mcpPeer();
    const viaMcp = json((await client.listTools()).tools);
    const viaHost = json(hostPeer().listTools());
    expect(viaHost.map((tool: any) => tool.name)).toEqual(['echo', 'boom', 'wait']);
    expect(viaHost).toEqual(viaMcp);
    expect(viaHost[0].inputSchema.type).toBe('object');
  });

  it.each([
    ['a valid call', 'echo', { text: 'hi' }],
    ['arguments that fail validation', 'echo', { times: 2 }],
    ['a handler that throws', 'boom', {}],
  ])('returns the same result for %s', async (_label, name, args) => {
    const client = await mcpPeer();
    const viaMcp = json(await client.callTool({ name, arguments: args }));
    const viaHost = json(await hostPeer().callTool(name, args));
    expect(viaHost).toEqual(viaMcp);
  });

  it.each([['an unknown tool', 'missing'], ['a disabled tool', 'hidden']])('refuses %s with the same message', async (_label, name) => {
    const client = await mcpPeer();
    const viaMcp = await client.callTool({ name, arguments: {} }).then(() => 'resolved', (error: Error) => error.message);
    const viaHost = await hostPeer().callTool(name, {}).then(() => 'resolved', (error: Error) => error.message);
    expect(viaHost).toBe(viaMcp);
    expect(viaHost).not.toBe('resolved');
  });

  it('hands the handler the invocation id and the caller stop signal', async () => {
    const host = hostPeer();
    expect(json(await host.callTool('echo', { text: 'a' }, { meta: { 'io.agentcore/invocation-id': 'inv-1' } })).content[0].text).toBe('a:inv-1');
    const stop = new AbortController();
    const waiting = host.callTool('wait', {}, { signal: stop.signal });
    stop.abort();
    expect(json(await waiting).content[0].text).toBe('aborted');
  });
});

describe('InProcessToolHost per-call caller', () => {
  const caller = (allowedTools: string[], taskId = 'task-a') => ({ taskId, sessionId: 'session-' + taskId, principalId: 'agent-runtime:' + taskId,
    allowedTools: new Set(allowedTools) });

  it('hands the handler the host-supplied caller and never one claimed in request metadata', async () => {
    const host = new InProcessToolHost();
    host.registerTool('who', { inputSchema: z.object({}) }, async (_args: any, ctx: any) => ({ content: [{ type: 'text', text: String(ctx.mcpReq.caller?.taskId) }] }));
    const claimed = { 'io.agentcore/caller': { taskId: 'forged' }, caller: { taskId: 'forged' } };
    expect(json(await host.callTool('who', {}, { caller: caller(['who']), meta: claimed })).content[0].text).toBe('task-a');
    expect(json(await host.callTool('who', {}, { meta: claimed })).content[0].text).toBe('undefined');
  });

  it('serves two callers one after another from one registry without mixing them up', async () => {
    const host = new InProcessToolHost();
    host.registerTool('who', { inputSchema: z.object({}) }, async (_args: any, ctx: any) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return { content: [{ type: 'text', text: ctx.mcpReq.caller.taskId }] };
    });
    const answers = await Promise.all([
      host.callTool('who', {}, { caller: caller(['who'], 'task-a') }),
      host.callTool('who', {}, { caller: caller(['who'], 'task-b') }),
    ]);
    expect(answers.map(answer => json(answer).content[0].text)).toEqual(['task-a', 'task-b']);
  });

  it('lists and runs only the tools the caller is granted, refusing the rest like a disabled tool', async () => {
    const host = hostPeer();
    expect(host.listTools().map(tool => tool.name)).toEqual(['echo', 'boom', 'wait']);
    expect(host.listTools(caller(['wait', 'echo'])).map(tool => tool.name)).toEqual(['echo', 'wait']);
    expect(host.listTools(caller([])).map(tool => tool.name)).toEqual([]);
    expect(json(await host.callTool('echo', { text: 'hi' }, { caller: caller(['echo']) })).content[0].text).toBe('hi:-');
    await expect(host.callTool('echo', { text: 'hi' }, { caller: caller(['wait']) })).rejects.toThrow('Tool echo disabled');
  });
});

describe('Native tool session transport', () => {
  const open = async (mode: string | undefined) => {
    if (mode) vi.stubEnv('AGENT_CORE_NATIVE_TOOL_TRANSPORT', mode);
    const session = await AgentRuntimeToolSession.open('transport-fixture', ['get_config', 'read_file', 'image_inspect', 'start_process'], nativeRuntime);
    closers.push(() => session.close());
    return session;
  };

  it('uses no MCP server by default, and the old path stays available behind a switch', async () => {
    expect((await open(undefined)).transport).toBe('direct');
    expect((await open('mcp')).transport).toBe('mcp');
  });

  it('gives the model the same tool contract through both paths, so a stored checkpoint digest still matches', async () => {
    const direct = await open('direct');
    const viaMcp = await open('mcp');
    expect(await direct.contractDigest()).toBe(await viaMcp.contractDigest());
    expect(json(await direct.modelTools())).toEqual(json(await viaMcp.modelTools()));
    expect(await direct.isMutating('start_process')).toBe(await viaMcp.isMutating('start_process'));
    expect(await direct.isMutating('read_file')).toBe(await viaMcp.isMutating('read_file'));
  });

  it('runs a granted tool and refuses an ungranted one the same way', async () => {
    const direct = await open('direct');
    const result = await direct.call('get_config', {});
    expect(result).toMatchObject({ name: 'get_config', isError: false });
    expect(result.text).toContain('allowedDirectories');
    await expect(direct.call('write_file', { path: 'never', content: 'x' })).rejects.toThrow('AGENT_RUNTIME_TOOL_NOT_GRANTED');
  });

  it('discovers the same tool names without building an MCP server', async () => {
    const names = await AgentRuntimeToolSession.discoverAvailableTools(nativeRuntime);
    vi.stubEnv('AGENT_CORE_NATIVE_TOOL_TRANSPORT', 'mcp');
    expect([...names].sort()).toEqual([...await AgentRuntimeToolSession.discoverAvailableTools(nativeRuntime)].sort());
  });
});
