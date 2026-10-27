import { describe, expect, it, vi } from 'vitest';
import { AgentRuntimeToolSession, toolObservesStop } from '../src/agent-tool-session.js';
import { ArtifactAuthorization } from '../src/auth/artifact-authorization.js';
const nativeRuntime = { nativeTaskId: 'fixture-native-task', nativeWorkspace: 'agent-core' };

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

  it('makes no tool call when Stop was already requested', async () => {
    const session = await AgentRuntimeToolSession.open('fixture-stop-before', ['get_config'], nativeRuntime);
    const dispatch = vi.spyOn((session as any).client, 'callTool');
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

  it('forwards the turn Stop signal to the in-flight MCP request', async () => {
    const session = await AgentRuntimeToolSession.open('fixture-stop-during', ['get_config'], nativeRuntime);
    const dispatch = vi.spyOn((session as any).client, 'callTool');
    try {
      const stop = new AbortController();
      const pending = session.call('get_config', {}, 'dtc:fixture:stop', stop.signal);
      stop.abort();
      await expect(pending).rejects.toBeDefined();
      expect(dispatch.mock.calls[0]?.[1]).toEqual({ signal: stop.signal });
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
