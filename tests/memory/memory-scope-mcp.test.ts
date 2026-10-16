import path from 'node:path';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), captureFailure: vi.fn() } }));
import { ExternalControllerLearningService } from '../../src/learning/external-controller.js';
import { registerMemoryExperienceTools } from '../../src/memory/mcp/experience-tools.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
function tools() {
  const callbacks = new Map<string, (input: any) => Promise<any>>();
  const server = { registerTool(name: string, _metadata: any, callback: any) { callbacks.set(name, callback); } };
  return { server, read: (input: any) => callbacks.get('memory_v2_read')!(input) };
}
describe('Memory facade task identity baseline', () => {
  it('follows explicit episode rotation and reconnect rather than a transport session', async () => {
    const base = path.resolve('runtime/tmp'); await mkdir(base, { recursive: true });
    const root = await mkdtemp(path.join(base, 'memory-adapter-')); roots.push(root);
    const learning = await ExternalControllerLearningService.initialize({ stateDir: root, memory: {} as any, learning: {} as any });
    const facade = tools(); let active = await learning.startEpisode('same-transport', { taskKey: 'A' });
    const calls: any[] = [];
    const memory = { registeredWorkspaceIdentity: () => ({name:'agent-core',key:'agent-core'}), controller(scope: any) { calls.push(scope); return { capabilities: () => ({ writeMode: 'experience-v2' }) }; } };
    // The recorded RED used the former transport-identity argument; assertion unchanged.
    registerMemoryExperienceTools(facade.server as any, memory as any, async () => ({ workspaceKey: 'agent-core', taskId: active.id, controllerId: 'agent-core-external' }));
    await facade.read({ action: 'capabilities' }); expect(calls.at(-1).taskId).toBe(active.id);
    active = await learning.startEpisode('same-transport', { taskKey: 'B' });
    await facade.read({ action: 'capabilities' }); expect(calls.at(-1).taskId).toBe(active.id);
    active = await learning.startEpisode('new-transport', { taskKey: 'A' });
    await facade.read({ action: 'capabilities' }); expect(calls.at(-1).taskId).toBe(active.id);
  });
});

import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createAgentCoreMcpServer } from '../../src/mcp/server.js';
import { registerControllerLearningTools } from '../../src/mcp/controller-learning-tools.js';
import { memoryTaskFixture, memoryToolFixture, responseData } from './memory-task-test-utils.js';
const readActions = ['capabilities', 'recall', 'expand', 'task_context'];
const writeActions = ['task_start', 'event_append', 'evidence_capture', 'checkpoint', 'consolidation_preview', 'consolidation_apply', 'retention_set', 'episode_status'];
describe('Memory facade per-call scope authorization', () => {
  it('resolves every invocation and rejects missing, foreign, unknown or unbound tasks before engine dispatch', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const a = await f.start('owner-a', 'header', 'A'), b = await f.start('owner-b', 'header', 'B');
    const old = await f.external.startEpisode('legacy', { taskKey: 'legacy', workspace: 'agent-core' });
    const calls: any[] = []; const original = f.memory.controller.bind(f.memory);
    await original({ workspaceKey: 'agent-core', taskId: a.id, controllerId: 'fixture' }).startEpisode({ startKey: 'fixture-start', goal: 'Synthetic bound task', sourceRefs: [] });
    const facade = memoryToolFixture(); let resolutions = 0;
    registerMemoryExperienceTools(facade.server as any, {registeredWorkspaceIdentity:f.memory.registeredWorkspaceIdentity.bind(f.memory), controller(scope: any, policy:any, host:any) { calls.push(scope); return original(scope,policy,host); } } as any,
      async (selector: any) => { resolutions++; const scope = await (f.external as any).resolveMemoryTask('owner-a', selector?.taskId); return { ...scope, controllerId: 'agent-core-external' }; });
    for (const action of [...readActions, ...writeActions]) {
      const invoke = readActions.includes(action) ? facade.read : facade.write;
      for (const scope of [undefined, { taskId: b.id }, { taskId: 'unknown' }, { taskId: old.id }]) {
        const result = await invoke({ action, ...(scope ? { scope } : {}) });
        expect(result.isError).toBe(true); expect(JSON.parse(result.content[0].text).code).toBe('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
        expect(calls).toHaveLength(0);
      }
    }
    for (const action of readActions) {
      const result = await facade.read({ action, scope: { taskId: a.id } });
      expect(calls.at(-1)).toMatchObject({ taskId: a.id, workspaceKey: 'agent-core' });
      if (action === 'capabilities' || action === 'task_context' || action === 'recall') expect(result.isError, JSON.stringify(result)).not.toBe(true);
    }
    for (const action of writeActions) await facade.write({ action, scope: { taskId: a.id } });
    expect(calls).toHaveLength(readActions.length + writeActions.length);
    expect(resolutions).toBeGreaterThanOrEqual(4 * (readActions.length + writeActions.length) + calls.length);
  });
  it('refuses scope overrides in engine payload and malformed selectors without engine calls', async () => {
    const facade = memoryToolFixture(); let calls = 0;
    registerMemoryExperienceTools(facade.server as any, { controller() { calls++; throw Error('unexpected'); } } as any,
      async () => ({ workspaceKey: 'agent-core', taskId: 'allowed', controllerId: 'host' }));
    for (const name of ['taskId', 'workspaceKey', 'ownerId', 'controllerId', 'sessionId', 'workspace', 'scope']) {
      const result = await facade.write({ action: 'task_start', scope: { taskId: 'allowed' }, payload: { [name]: 'foreign' } });
      expect(result.isError).toBe(true); expect(JSON.parse(result.content[0].text).code).toBe('MEMORY_INPUT_INVALID');
    }
    for (const scope of [{}, { taskId: '' }, { taskId: 'allowed', ownerId: 'spoof' }]) expect((await facade.read({ action: 'capabilities', scope })).isError).toBe(true);
    expect(calls).toBe(0);
  });
  it('binds controller_learning starts only through the host registry and rejects missing task identity', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root); const facade = memoryToolFixture();
    (registerControllerLearningTools as any)(facade.server, f.external, 'host-session', { ownerId: 'owner-a', workspaceIdentity: (workspace: string) => f.memory.registeredWorkspaceIdentity(workspace) });
    for (const args of [{ taskKey: 'task' }, { workspace: 'fake', taskKey: 'task' }, { workspace: 'agent-core' }]) {
      const result = await facade.invoke('controller_learning', { action: 'episode', episodeOperation: 'start', ...args }); expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    }
    const result = await facade.invoke('controller_learning', { action: 'episode', episodeOperation: 'start', taskKey: 'task', workspace: 'agent-core', ownerId: 'spoof' });
    expect(result.isError, JSON.stringify(result)).not.toBe(true); const episode = JSON.parse(result.content[0].text);
    expect(episode.memoryBinding.ownerId).toBe('owner-a');
    expect(await (f.external as any).resolveMemoryTask('owner-a', episode.id)).toEqual({ taskId: episode.id, workspaceKey: 'agent-core' });
  });
  it('preserves real credential grants and refuses native task selector overrides', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root); let calls = 0; const original = f.memory.controller.bind(f.memory);
    const memory = { registeredWorkspaceIdentity: () => ({name:'agent-core',key:'agent-core'}), controller(scope: any) { calls++; return original(scope); }, registeredWorkspaceIdentity: f.memory.registeredWorkspaceIdentity.bind(f.memory) };
    const server = createAgentCoreMcpServer({ id: 'owner-a', toolGrant: { version: 1, allowedTools: ['memory_v2_read'] } }, { memoryExperience: memory as any, nativeTaskId: 'native-task', nativeWorkspace: 'agent-core' });
    const client = new Client({ name: 'scope-fixture', version: '1' }); const [c, s] = InMemoryTransport.createLinkedPair(); await server.connect(s); await client.connect(c);
    try {
      const result = await client.callTool({ name: 'memory_v2_read', arguments: { action: 'capabilities' } }); expect(result.isError, JSON.stringify(result)).not.toBe(true); expect(calls).toBe(1);
      const foreign = await client.callTool({ name: 'memory_v2_read', arguments: { action: 'capabilities', scope: { taskId: 'other' } } }); expect(foreign.isError).toBe(true); expect(calls).toBe(1);
      await expect(client.callTool({ name: 'memory_v2_write', arguments: { action: 'task_start' } })).rejects.toThrow(); expect(calls).toBe(1);
    } finally { await client.close(); await server.close(); }
  });
});
