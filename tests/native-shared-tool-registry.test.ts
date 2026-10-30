import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';
import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';
import { ArtifactAuthorization } from '../src/auth/artifact-authorization.js';
import { InProcessToolHost } from '../src/mcp/in-process-tool-host.js';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { installInvocationContext } from '../src/mcp/external-controller-tool-support.js';
import { installMcpMutationSafety } from '../src/mcp/mutation-safety.js';
import { registerArtifactInspectTool } from '../src/mcp/artifact-inspect-tools.js';
import { registerReconstructionHarnessTool } from '../src/mcp/reconstruction-harness-tools.js';
import { registerSkillsTools } from '../src/mcp/skills-tools.js';
import { createMemoryScopeResolver } from '../src/memory/mcp/scope.js';
import { NativeSkillSettings } from '../src/native-skill-settings.js';
import { currentToolInvocationRequest, withToolInvocationRequest, type ToolCaller, type ToolInvocationRequest } from '../src/tracker/tool-invocation.js';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), captureFailure: vi.fn(), recordOutcome: vi.fn(), readFeatureOutcomes: () => [] } }));

// One Native tool registry serves every task: nothing about a task is fixed when it is built, and each call names its own
// through the host's ToolCaller. These tests prove the shared registry gives the model the same tools as one built per
// task, and that two tasks on the one registry never see each other's identity, advisor, image views or grant.
const MODE = 'AGENT_CORE_NATIVE_TOOL_REGISTRY';
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
beforeEach(() => { vi.stubEnv(MODE, 'shared'); });

const open = (mode: 'shared' | 'per-task', id: string, grant: string[], runtime: any) => {
  vi.stubEnv(MODE, mode);
  return AgentRuntimeToolSession.open(id, grant, runtime);
};
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const caller = (taskId: string, extra: Partial<ToolCaller> = {}): ToolCaller => ({
  taskId, workspace: 'agent-core', sessionId: 'session-' + taskId, principalId: 'agent-runtime:session-' + taskId,
  allowedTools: new Set(['get_config']), ...extra,
});
const request = (tool: string, taskId: string | undefined, who?: ToolCaller): ToolInvocationRequest => Object.freeze({
  tool, identity: { id: 'invocation-' + tool, processSessionId: 'process' },
  mutationContext: Object.freeze({ invocationId: 'invocation-' + tool, ...(taskId ? { taskId } : {}), checkpointGranted: false,
    reportAutoCheckpoint: () => {} }) as any,
  checkpointReceipt: () => undefined, ...(who ? { caller: who } : {}),
});
const ctxFor = (who?: ToolCaller) => ({ mcpReq: { signal: new AbortController().signal, caller: who } });

describe('shared Native registry gives the model the same tools as a per-task registry', () => {
  it.each([[true], [false]])('has identical definitions and contract digest, with a workspace: %s', async withWorkspace => {
    const runtime = { nativeTaskId: 'parity-task', ...(withWorkspace ? { nativeWorkspace: 'agent-core' } : {}), artifactAuthorization: new ArtifactAuthorization() };
    const names = await AgentRuntimeToolSession.discoverAvailableTools(runtime);
    expect(names.includes('artifact_inspect')).toBe(withWorkspace);
    expect(names.includes('reconstruction_harness')).toBe(withWorkspace);
    const perTask = await open('per-task', 'parity-per-task', names, runtime);
    const shared = await open('shared', 'parity-shared', names, runtime);
    try {
      expect(await shared.contractDigest()).toBe(await perTask.contractDigest());
      expect(json(await shared.modelTools())).toEqual(json(await perTask.modelTools()));
      expect((await shared.modelTools()).map(tool => tool.function.name)).toEqual(names);
      for (const name of names) expect(await shared.isMutating(name), name).toBe(await perTask.isMutating(name));
    } finally {
      await perTask.close(); await shared.close();
    }
  });

  it('discovers the same tool names whichever registry mode is on', async () => {
    const runtime = { nativeTaskId: 'names-task', nativeWorkspace: 'agent-core', artifactAuthorization: new ArtifactAuthorization() };
    vi.stubEnv(MODE, 'per-task');
    const perTask = await AgentRuntimeToolSession.discoverAvailableTools({ ...runtime, nativeTaskId: 'names-other' });
    vi.stubEnv(MODE, 'shared');
    expect(await AgentRuntimeToolSession.discoverAvailableTools({ ...runtime, nativeTaskId: 'names-third' })).toEqual(perTask);
  });
});

describe('shared Native registry is built once', () => {
  it('registers no tool for a second task, and builds again only when a service behind it changed', async () => {
    const registrations = vi.spyOn(InProcessToolHost.prototype, 'registerTool');
    const services = { artifactAuthorization: new ArtifactAuthorization() };
    const first = await open('shared', 'once-1', ['get_config'], { ...services, nativeTaskId: 'once-a', nativeWorkspace: 'agent-core' });
    const afterFirst = registrations.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);
    const second = await open('shared', 'once-2', ['read_file'], { ...services, nativeTaskId: 'once-b', nativeWorkspace: 'other' });
    expect(registrations.mock.calls.length).toBe(afterFirst);
    const changed = await open('shared', 'once-3', ['get_config'], { artifactAuthorization: new ArtifactAuthorization(), nativeTaskId: 'once-c' });
    expect(registrations.mock.calls.length).toBeGreaterThan(afterFirst);
    await Promise.all([first.close(), second.close(), changed.close()]);
  });

  it('keeps every grant apart: a task lists and runs only its own tools on the one registry', async () => {
    const runtime = { nativeTaskId: 'grant-task', nativeWorkspace: 'agent-core' };
    const config = await open('shared', 'grant-config', ['get_config'], runtime);
    const reader = await open('shared', 'grant-reader', ['read_file'], runtime);
    try {
      expect((await config.modelTools()).map(tool => tool.function.name)).toEqual(['get_config']);
      expect((await reader.modelTools()).map(tool => tool.function.name)).toEqual(['read_file']);
      await expect(config.call('read_file', { path: 'x' })).rejects.toThrow('AGENT_RUNTIME_TOOL_NOT_GRANTED');
      const { host, caller: configCaller } = (config as any).port;
      await expect(host.callTool('read_file', { path: 'x' }, { caller: configCaller })).rejects.toThrow('Tool read_file disabled');
      expect((await config.call('get_config', {})).isError).toBe(false);
    } finally {
      await config.close(); await reader.close();
    }
  });

  it('refuses a call that names no caller, and serves one that does', async () => {
    const host = new InProcessToolHost();
    createAgentCoreMcpServer(undefined, { sharedNativeRegistry: true, toolTarget: host });
    const refused = await host.callTool('get_config', {});
    expect(refused).toMatchObject({ isError: true });
    expect(refused.content[0].text).toContain('MCP_TOOL_CALLER_REQUIRED');
    const served = await host.callTool('get_config', {}, { caller: caller('refuse-task') });
    expect(served.isError).toBeUndefined();
    expect(served.content[0].text).toContain('allowedDirectories');
  });
});

describe('two tasks on the one registry never see each other', () => {
  it('sends each failure to its own task advisor', async () => {
    const advisor = () => ({ observeSuccess: vi.fn(), observeFailure: vi.fn(() => undefined) });
    const [a, b] = [advisor(), advisor()];
    const sessionA = await open('shared', 'advisor-a', ['read_file'], { nativeTaskId: 'advisor-task-a', nativeWorkspace: 'agent-core', failureLoopAdvisor: a });
    const sessionB = await open('shared', 'advisor-b', ['read_file'], { nativeTaskId: 'advisor-task-b', nativeWorkspace: 'agent-core', failureLoopAdvisor: b });
    try {
      await sessionA.call('read_file', { path: path.join(os.tmpdir(), 'agent-core-missing-a.txt') });
      expect(a.observeFailure).toHaveBeenCalledTimes(1);
      expect(b.observeFailure).not.toHaveBeenCalled();
      await sessionB.call('read_file', { path: path.join(os.tmpdir(), 'agent-core-missing-b.txt') });
      expect(a.observeFailure).toHaveBeenCalledTimes(1);
      expect(b.observeFailure).toHaveBeenCalledTimes(1);
    } finally {
      await sessionA.close(); await sessionB.close();
    }
  });

  it('keeps each conversation\'s image views in its own store', async () => {
    const store = (text: string) => vi.fn(async () => ({ content: [{ type: 'text', text }] }));
    const [a, b] = [store('A'), store('B')];
    const sessionA = await open('shared', 'image-a', ['image_inspect'], { nativeTaskId: 'image-task-a', nativeWorkspace: 'agent-core', imageInspector: a });
    const sessionB = await open('shared', 'image-b', ['image_inspect'], { nativeTaskId: 'image-task-b', nativeWorkspace: 'agent-core', imageInspector: b });
    try {
      expect((await sessionA.call('image_inspect', { action: 'overview', path: 'a.png' })).text).toBe('A');
      expect(b).not.toHaveBeenCalled();
      expect((await sessionB.call('image_inspect', { action: 'overview', path: 'b.png' })).text).toBe('B');
      expect(a).toHaveBeenCalledTimes(1);
    } finally {
      await sessionA.close(); await sessionB.close();
    }
  });

  it('files each mutation under its own caller credential and grants a checkpoint only to a caller that holds it', async () => {
    const host = new InProcessToolHost();
    const runMutation = vi.fn(async (_caller: string, _tool: string, _args: unknown, _ctx: unknown, run: () => unknown) => run());
    const authority = { checkpointGranted: true };
    installMcpMutationSafety(host as any, { runMutation } as any, (ctx: any) => ctx.mcpReq.caller.principalId);
    installInvocationContext(host as any, authority);
    let seen: ToolInvocationRequest | undefined;
    host.registerTool('probe', { inputSchema: z.object({}), annotations: { readOnlyHint: false } }, async () => { seen = currentToolInvocationRequest(); return { content: [] }; });
    const withCheckpoint = caller('probe-a', { allowedTools: new Set(['probe', 'file_checkpoint']) });
    const without = caller('probe-b', { allowedTools: new Set(['probe']) });
    await host.callTool('probe', {}, { caller: withCheckpoint });
    expect(seen?.caller).toBe(withCheckpoint);
    expect(seen?.mutationContext).toMatchObject({ taskId: 'probe-a', checkpointGranted: true });
    await host.callTool('probe', {}, { caller: without });
    expect(seen?.caller).toBe(without);
    expect(seen?.mutationContext).toMatchObject({ taskId: 'probe-b', checkpointGranted: false });
    expect(runMutation.mock.calls.map(call => call[0])).toEqual(['agent-runtime:session-probe-a', 'agent-runtime:session-probe-b']);
  });

  it('resolves the Memory scope from the caller of this call, refusing a foreign selector, a missing workspace and no caller', async () => {
    const resolve = createMemoryScopeResolver({ workspaceRegistry: { registeredWorkspaceIdentity: workspace => ({ name: 'key:' + workspace }) } });
    const as = (who: ToolCaller | undefined, selector?: { taskId: string }) =>
      withToolInvocationRequest(request('memory_v2_read', who?.taskId, who), () => resolve(selector));
    expect(await as(caller('scope-a', { workspace: 'one' }))).toMatchObject({ taskId: 'scope-a', workspaceKey: 'key:one', controllerId: 'agent-core-native' });
    expect(await as(caller('scope-b', { workspace: 'two' }), { taskId: 'scope-b' })).toMatchObject({ taskId: 'scope-b', workspaceKey: 'key:two' });
    await expect(as(caller('scope-a', { workspace: 'one' }), { taskId: 'scope-b' })).rejects.toThrow('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    await expect(as({ ...caller('scope-c'), workspace: undefined })).rejects.toThrow('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    await expect(as(undefined)).rejects.toThrow('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  });

  it('applies the owner\'s Skill switch to the task the caller names, and not to anyone else', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'native-shared-skills-'));
    roots.push(root);
    const settings = new NativeSkillSettings(root);
    settings.setEnabled('mind-control', false);
    const digest = 'sha256:' + 'a'.repeat(64);
    const service = { inspect: vi.fn(async (name: string) => ({ name, digest, description: name, metadata: {} })) };
    let call: (args: any, ctx?: any) => Promise<any> = async () => undefined;
    registerSkillsTools({ registerTool: (_name: string, _config: unknown, fn: typeof call) => { call = fn; } } as any,
      service as any, undefined, undefined, undefined, undefined, undefined, undefined, settings);
    const as = (who: ToolCaller | undefined, args: any) => withToolInvocationRequest(request('skills', who?.taskId, who), () => call(args, ctxFor(who)));
    const blocked = await as(caller('skills-task'), { action: 'inspect', name: 'mind-control' });
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0].text).toContain('SKILL_DISABLED_BY_USER');
    expect(service.inspect).not.toHaveBeenCalled();
    expect((await as(caller('skills-task'), { action: 'inspect', name: 'source-review' })).isError).toBeUndefined();
    // With no Native caller the tool is an external one, and the owner's Native switch does not apply to it.
    expect((await as(undefined, { action: 'inspect', name: 'mind-control' })).isError).toBeUndefined();
  });
});

describe('Native tools that check the task twice take the two sources from different channels', () => {
  const server = () => {
    let handler: (args: any, ctx: any) => Promise<any> = async () => undefined;
    return { server: { registerTool: (_name: string, _config: unknown, fn: typeof handler) => { handler = fn; } } as any, run: (args: any, ctx: any) => handler(args, ctx) };
  };

  it('reconstruction_harness refuses a call whose ambient request names another task or no caller is given', async () => {
    const { server: fake, run } = server();
    registerReconstructionHarnessTool(fake, 'caller');
    const asked = caller('harness-a', { workspace: 'agent-core' });
    const scopeUnavailable = (result: any) => result.isError === true && result.content[0].text === 'HARNESS_HOST_SCOPE_UNAVAILABLE';
    expect(scopeUnavailable(await withToolInvocationRequest(request('reconstruction_harness', 'harness-b', asked), () => run({}, ctxFor(asked))))).toBe(true);
    expect(scopeUnavailable(await withToolInvocationRequest(request('reconstruction_harness', 'harness-a'), () => run({}, ctxFor(undefined))))).toBe(true);
    const matched = await withToolInvocationRequest(request('reconstruction_harness', 'harness-a', asked), () => run({}, ctxFor(asked)));
    expect(scopeUnavailable(matched)).toBe(false);
  });

  it('artifact_inspect refuses a call whose ambient request names another task or no caller is given', async () => {
    const { server: fake, run } = server();
    const authorization = new ArtifactAuthorization();
    const status = vi.spyOn(authorization, 'status').mockReturnValue({ requestId: 'fixture' } as any);
    registerArtifactInspectTool(fake, authorization, undefined, 'caller');
    const asked = caller('artifact-a', { workspace: 'agent-core' });
    const args = { action: 'status', requestId: '00000000-0000-4000-8000-000000000000', revisionDigest: 'sha256:' + 'b'.repeat(64) };
    await expect(withToolInvocationRequest(request('artifact_inspect', 'artifact-b', asked), () => run(args, ctxFor(asked)))).rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
    await expect(withToolInvocationRequest(request('artifact_inspect', 'artifact-a'), () => run(args, ctxFor(undefined)))).rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
    expect(status).not.toHaveBeenCalled();
    await withToolInvocationRequest(request('artifact_inspect', 'artifact-a', asked), () => run(args, ctxFor(asked)));
    expect(status).toHaveBeenCalledWith({ ownerId: 'agent-runtime:session-artifact-a', taskId: 'artifact-a', workspace: 'agent-core' }, args.requestId, args.revisionDigest);
  });
});
