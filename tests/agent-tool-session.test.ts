import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRuntimeToolSession, toolObservesStop } from '../src/agent-tool-session.js';
import { ArtifactAuthorization } from '../src/auth/artifact-authorization.js';
import * as z from 'zod/v4';
import { InProcessToolHost } from '../src/mcp/in-process-tool-host.js';
import { installMcpMutationSafety } from '../src/mcp/mutation-safety.js';
const nativeRuntime = { nativeTaskId: 'fixture-native-task', nativeWorkspace: 'agent-core' };
afterEach(() => { vi.unstubAllEnvs(); });

describe('native agent MCP tool session', () => {
  it('discovers and dispatches only explicitly granted existing Agent Core tools', async () => {
    const session = await AgentRuntimeToolSession.open('fixture', ['get_config'], nativeRuntime);
    try {
      const tools = await session.modelTools();
      expect(tools.map(tool => tool.function.name)).toEqual(['get_config']);
      const result = await session.call('get_config', {});
      expect(result.isError).toBe(false);
      expect(result.text).toContain('allowedDirectories');
      await expect(session.call('read_file', { path: 'never' }))
        .rejects.toThrow('AGENT_RUNTIME_TOOL_NOT_GRANTED');
    } finally {
      await session.close();
    }
  });

  it('discovers the current Agent Core registry without granting it', async () => {
    const tools = await AgentRuntimeToolSession.discoverAvailableTools(nativeRuntime);
    expect(tools).toEqual(expect.arrayContaining([
      'get_config',
      'read_file',
      'image_inspect',
      'browser_control',
      'start_process',
    ]));
  });

  it('builds the discovery registry once per registry shape and again when the shape changes', async () => {
    const registrations = vi.spyOn(InProcessToolHost.prototype, 'registerTool');
    try {
      const phone = { enabled: false };
      const shape = { ...nativeRuntime, phoneController: phone as any };
      const off = await AgentRuntimeToolSession.discoverAvailableTools(shape);
      const afterFirst = registrations.mock.calls.length;
      await AgentRuntimeToolSession.discoverAvailableTools(shape);
      expect(registrations.mock.calls.length).toBe(afterFirst);

      phone.enabled = true;
      const on = await AgentRuntimeToolSession.discoverAvailableTools(shape);
      expect(off).not.toContain('phone_status');
      expect(on).toContain('phone_status');
      const afterOn = registrations.mock.calls.length;
      expect(afterOn).toBeGreaterThan(afterFirst);
      await AgentRuntimeToolSession.discoverAvailableTools(shape);
      expect(registrations.mock.calls.length).toBe(afterOn);

      phone.enabled = false;
      expect(await AgentRuntimeToolSession.discoverAvailableTools(shape)).toEqual(off);
      expect(registrations.mock.calls.length).toBe(afterOn);
    } finally {
      registrations.mockRestore();
    }
  });

  it('lists the granted tools once per session however often definitions, digest and mutation are read', async () => {
    const session = await AgentRuntimeToolSession.open('fixture-memo', ['get_config', 'read_file'], nativeRuntime);
    const listing = vi.spyOn((session as any).port.host, 'listTools');
    try {
      const digest = await session.contractDigest();
      await session.modelTools();
      await session.modelTools();
      expect(await session.contractDigest()).toBe(digest);
      expect(await session.isMutating('read_file')).toBe(false);
      expect(await session.isMutating('get_config')).toBe(false);
      await expect(session.isMutating('write_file')).rejects.toThrow('AGENT_RUNTIME_TOOL_NOT_GRANTED');
      expect(listing).toHaveBeenCalledTimes(1);
    } finally {
      await session.close();
    }
  });

  it('keeps the contract digest of a grant when the phone controller is switched on, so a parked turn can resume', async () => {
    const phone = { enabled: false };
    const open = () => AgentRuntimeToolSession.open('fixture-digest', ['get_config', 'read_file'], { ...nativeRuntime, phoneController: phone as any });
    const before = await open();
    phone.enabled = true;
    const after = await open();
    try {
      expect(await after.contractDigest()).toBe(await before.contractDigest());
    } finally {
      await before.close();
      await after.close();
    }
  });

  it('counts only the writing actions of the skills tool as mutation', async () => {
    const session = await AgentRuntimeToolSession.open('fixture-skills', ['skills', 'write_file'], { ...nativeRuntime, skillsService: {} as any });
    try {
      for (const action of ['list', 'search', 'read', 'inspect']) expect(await session.isMutating('skills', { action })).toBe(false);
      for (const action of ['propose', 'decide_proposal', 'promote_revision', 'import']) expect(await session.isMutating('skills', { action })).toBe(true);
      expect(await session.isMutating('skills')).toBe(true);
      expect(await session.isMutating('skills', { action: ['read'] })).toBe(true);
      expect(await session.isMutating('write_file', { action: 'read' })).toBe(true);
    } finally {
      await session.close();
    }
  });

  it('journals only the writing actions of skills, and every call of an ordinary write tool', async () => {
    const host = new InProcessToolHost();
    const runMutation = vi.fn(async (_caller: string, _name: string, _args: unknown, _ctx: unknown, run: () => unknown) => run());
    installMcpMutationSafety(host as any, { runMutation } as any, 'caller');
    const handler = vi.fn(async () => ({ content: [] }));
    const config = { inputSchema: z.object({ action: z.string() }), annotations: { readOnlyHint: false } };
    host.registerTool('skills', config, handler);
    host.registerTool('writer', config, handler);
    for (const action of ['list', 'search', 'read', 'inspect']) await host.callTool('skills', { action });
    expect(runMutation).not.toHaveBeenCalled();
    await host.callTool('skills', { action: 'propose' });
    await host.callTool('writer', { action: 'list' });
    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledTimes(6);
  });

  it('offers native task-bound artifact inspection when its existing owner is installed', async () => {
    const discovered = await AgentRuntimeToolSession.discoverAvailableTools({
      ...nativeRuntime, artifactAuthorization: new ArtifactAuthorization(),
    });
    expect(discovered).toContain('artifact_inspect');
  });

  it('narrows mixed-action discovery and enforces the same restriction at call time', async () => {
    const session = await AgentRuntimeToolSession.open(
      'fixture-browser',
      ['browser_control'],
      nativeRuntime,
      { browser_control: { allowedActions: ['status'] } },
    );
    try {
      const tools = await session.modelTools();
      const browser = tools.find(tool => tool.function.name === 'browser_control');
      expect((browser?.function.parameters as any)?.properties?.action?.enum).toEqual(['status']);
      await expect(session.call('browser_control', {
        action: 'act',
        sessionId: '00000000-0000-0000-0000-000000000000',
      })).rejects.toThrow('AGENT_RUNTIME_TOOL_ACTION_NOT_GRANTED');
      const result = await session.call('browser_control', { action: 'status' });
      expect(result.isError).toBe(false);
    } finally {
      await session.close();
    }
  });

  // Both paths must honor Stop: the default in-process registry and the older in-memory MCP client behind the switch.
  const paths = [
    ['direct', undefined, (session: any) => session.port.host, 2],
    ['mcp', 'mcp', (session: any) => session.port.client, 1],
  ] as const;

  it.each(paths)('makes no tool call when Stop was already requested (%s)', async (_path, mode, target) => {
    if (mode) vi.stubEnv('AGENT_CORE_NATIVE_TOOL_TRANSPORT', mode);
    const session = await AgentRuntimeToolSession.open('fixture-stop-before', ['get_config'], nativeRuntime);
    const dispatch = vi.spyOn(target(session), 'callTool');
    try {
      const stop = new AbortController();
      stop.abort();
      await expect(session.call('get_config', {}, undefined, stop.signal))
        .rejects.toThrow('AGENT_RUNTIME_TURN_STOPPED');
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it.each(paths)('forwards the turn Stop signal to the in-flight call (%s)', async (_path, mode, target, optionsAt) => {
    if (mode) vi.stubEnv('AGENT_CORE_NATIVE_TOOL_TRANSPORT', mode);
    const session = await AgentRuntimeToolSession.open('fixture-stop-during', ['get_config'], nativeRuntime);
    const dispatch = vi.spyOn(target(session), 'callTool');
    try {
      const stop = new AbortController();
      const pending = session.call('get_config', {}, 'dtc:fixture:stop', stop.signal);
      stop.abort();
      await expect(pending).rejects.toBeDefined();
      expect(dispatch.mock.calls[0]?.[optionsAt]).toMatchObject({ signal: stop.signal });
      const finished = await session.call('get_config', {});
      expect(finished.isError).toBe(false);
    } finally {
      await session.close();
    }
  });

  it('declares which tools observe Stop', () => {
    expect(toolObservesStop('read_file')).toBe(true);
    expect(toolObservesStop('start_process')).toBe(false);
  });

  it('can expose local read_file while denying URL reads', async () => {
    const session = await AgentRuntimeToolSession.open(
      'fixture-file',
      ['read_file'],
      nativeRuntime,
      { read_file: { forbidUrlRead: true } },
    );
    try {
      const tools = await session.modelTools();
      const readFile = tools.find(tool => tool.function.name === 'read_file');
      expect((readFile?.function.parameters as any)?.properties?.isUrl?.enum).toEqual([false]);
      await expect(session.call('read_file', {
        path: 'https://example.com',
        isUrl: true,
      })).rejects.toThrow('AGENT_RUNTIME_TOOL_ARGUMENT_NOT_GRANTED');
    } finally {
      await session.close();
    }
  });
});
