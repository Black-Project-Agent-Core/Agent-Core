import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [] } }));
import { createMcpHttpHandler } from '../../src/mcp/handler.js';
import { registerMemoryExperienceTools } from '../../src/memory/mcp/experience-tools.js';
import { AgentRuntimeToolSession } from '../../src/agent-tool-session.js';
import { initializeMemoryRoot } from '../../src/memory/initialize.js';
import { ExternalControllerLearningService } from '../../src/learning/external-controller.js';
import { memoryTaskFixture, memoryToolFixture, responseData } from './memory-task-test-utils.js';
const roots: string[] = [], servers: Server[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function httpFixture(f: Awaited<ReturnType<typeof memoryTaskFixture>>) {
  const handler = createMcpHttpHandler({ memoryExperience: f.memory as any, memoryService: f.memory as any, externalControllerLearning: f.external, learningService: f.learning });
  const server = createServer((req, res) => { void handler(req, res, { id: req.headers['x-fixture-owner'] === 'b' ? 'owner-b' : 'owner-a' } as any); }); servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw Error('LISTENER_NOT_BOUND');
  return async (name: string, args: any, header?: string, owner = 'a') => {
    const response = await fetch('http://127.0.0.1:' + address.port + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json,text/event-stream', 'x-fixture-owner': owner, ...(header ? { 'x-agent-core-session-id': header } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    expect(response.ok).toBe(true); const body = await response.text(); const line = body.split('\n').find(x => x.startsWith('data:')); const rpc = JSON.parse(line ? line.slice(5) : body);
    expect(rpc.error, JSON.stringify(rpc)).toBeUndefined(); return rpc.result;
  };
}
function namespace(owner: string, header: string | undefined, now: number) {
  const basis = header ? 'mcp:' + header : 'legacy:' + owner + ':' + Math.floor(now / 3600000);
  const transport = 'ext-' + createHash('sha256').update(basis).digest('hex').slice(0, 32);
  return 'ext-owner-' + createHash('sha256').update(JSON.stringify([owner, transport])).digest('hex').slice(0, 48);
}
async function start(call: any, taskKey: string, header?: string, owner = 'a') {
  const response = await call('controller_learning', { action: 'episode', episodeOperation: 'start', taskKey, workspace: 'agent-core' }, header, owner);
  expect(response.isError, JSON.stringify(response)).not.toBe(true); return JSON.parse(response.content[0].text);
}
async function memoryCall(call: any, name: string, taskId: string, action: string, payload: any, header?: string) { return responseData(await call(name, { action, scope: { taskId }, payload }, header)); }
const episodeStart = { startKey: 'memory-start', goal: 'Synthetic continuation', sourceRefs: [] };
function append(header: any, operationId: string, text: string) { return { episodeId: header.id, expectedRevision: header.revision, operationId, event: { kind: 'observation', summary: text, sourceRefs: [], stateChanges: [{ op: 'upsert', item: { id: operationId, kind: 'next-action', text, critical: true, state: 'active', sourceRefs: [], verification: { status: 'unverified', evidence: [] } } }] } }; }
function checkpoint(header: any) { return { episodeId: header.id, expectedRevision: header.revision, operationId: 'memory-checkpoint', trigger: 'explicit' }; }
describe('explicit Memory task continuation', () => {
  it('preserves task, episode and checkpoint idempotency across headerless hourly rotation, changed header and restart', async () => {
    let f = await memoryTaskFixture(); roots.push(f.root); let call = await httpFixture(f);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-09T00:59:59Z'));
    const task = await start(call, 'long-task'); const episode = await memoryCall(call, 'memory_v2_write', task.id, 'task_start', episodeStart);
    const first = await memoryCall(call, 'memory_v2_write', task.id, 'checkpoint', checkpoint(episode));
    const initial = await memoryCall(call, 'memory_v2_read', task.id, 'task_context', {}); const eventCount = initial.data.episode.eventCount;
    clock.mockReturnValue(Date.parse('2026-10-09T01:00:01Z'));
    for (const header of [undefined, 'changed-header']) {
      expect((await start(call, 'long-task', header)).id).toBe(task.id);
      const context = await memoryCall(call, 'memory_v2_read', task.id, 'task_context', {}, header); expect(context.data.episodeRef.id).toBe(episode.id);
      expect((await memoryCall(call, 'memory_v2_write', task.id, 'checkpoint', checkpoint(episode), header)).data.id).toBe(first.data.id);
      expect((await memoryCall(call, 'memory_v2_read', task.id, 'task_context', {}, header)).data.episode.eventCount).toBe(eventCount);
    }
    const memory = await initializeMemoryRoot({ baseDir: f.root, experience: { enabled: true } });
    const external = await ExternalControllerLearningService.initialize({ stateDir: path.join(f.root, 'external'), memory: memory as any, learning: f.learning });
    f = { ...f, memory, external }; call = await httpFixture(f);
    expect((await start(call, 'long-task', 'post-restart')).id).toBe(task.id);
    expect((await memoryCall(call, 'memory_v2_read', task.id, 'task_context', {}, 'post-restart')).data.episodeRef.id).toBe(episode.id);
    expect((await memoryCall(call, 'memory_v2_write', task.id, 'checkpoint', checkpoint(episode), 'post-restart')).data.id).toBe(first.data.id);
  });
  it('interleaves only Memory v2 state, binds cursors to tasks and denies a foreign selector without ledger changes', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root); const a = await f.start('owner-a', 'shared', 'A'), b = await f.start('owner-a', 'shared', 'B'), foreign = await f.start('owner-b', 'shared', 'foreign');
    const facade = memoryToolFixture();
    registerMemoryExperienceTools(facade.server as any, f.memory as any, async selector => ({ ...await f.external.resolveMemoryTask('owner-a', selector?.taskId ?? ''), controllerId: 'fixture' }));
    const write = async (taskId: string, action: string, payload: any) => responseData(await facade.write({ action, scope: { taskId }, payload }));
    const read = async (taskId: string, action: string, payload: any = {}) => responseData(await facade.read({ action, scope: { taskId }, payload }));
    let ea = await write(a.id, 'task_start', episodeStart), eb = await write(b.id, 'task_start', episodeStart);
    ea = { ...ea, revision: (await write(a.id, 'event_append', append(ea, 'next-a', 'Only state A'))).revision };
    eb = { ...eb, revision: (await write(b.id, 'event_append', append(eb, 'next-b', 'Only state B'))).revision };
    await write(a.id, 'checkpoint', checkpoint(ea)); await write(b.id, 'checkpoint', checkpoint(eb));
    const ca = await read(a.id, 'task_context'), cb = await read(b.id, 'task_context'); expect(JSON.stringify(ca)).toContain('Only state A'); expect(JSON.stringify(ca)).not.toContain('Only state B'); expect(JSON.stringify(cb)).toContain('Only state B'); expect(JSON.stringify(cb)).not.toContain('Only state A');
    await f.memory.batch([1, 2].map(n => ({ op: 'remember', value: { content: 'Cursor continuation needle ' + n, provenance: { workspace: 'agent-core', files: [] } } })));
    const page = await read(a.id, 'recall', { query: 'Cursor continuation needle', limit: 1 }); expect(page.data.nextCursor).toBeTruthy();
    const wrong = await facade.read({ action: 'recall', scope: { taskId: b.id }, payload: { query: 'Cursor continuation needle', limit: 1, cursor: page.data.nextCursor } }); expect(JSON.parse(wrong.content[0].text).code).toBe('MEMORY_SCOPE_MISMATCH');
    const file = path.join(f.root, 'external/external-controller.json'); const before = await readFile(file);
    const denied = await facade.write({ action: 'event_append', scope: { taskId: foreign.id }, payload: append(ea, 'foreign-change', 'Must never appear') }); expect(denied.isError).toBe(true); expect(await readFile(file)).toEqual(before); expect(await read(a.id, 'task_context')).toEqual(ca);
  });
  it('serializes Learning activation and hooks A then B then A; Memory selector does not switch Learning head', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root); const call = await httpFixture(f); const header = 'serial'; const now = Date.parse('2026-10-09T02:00:00Z'); vi.spyOn(Date, 'now').mockReturnValue(now);
    const ns = namespace('owner-a', header, now);
    const a = await start(call, 'A', header); await memoryCall(call, 'memory_v2_write', a.id, 'task_start', episodeStart, header);
    let b: any;
    for (const key of ['A', 'B', 'A']) {
      const current = await start(call, key, header);
      if (key === 'B') b ??= current;
      const task = key === 'A' ? a : b;
      expect(current.id).toBe(task.id);
      await call('memory_search', { query: 'foundational', workspace: 'agent-core', limit: 1 }, header);
      expect((await f.external.getEpisode(ns))?.id).toBe(task.id);
      const checkpointKey = 'finalize-' + key;
      await call('learning', { action: 'checkpoint', idempotencyKey: checkpointKey, taskId: task.id, workspace: 'agent-core', reason: 'task-complete', evidenceRefs: ['source:synthetic-offline-test'] }, header);
      await call('learning', { action: 'review', checkpointKeys: [checkpointKey], taskId: task.id, disposition: 'no-new-knowledge', candidates: [] }, header);
      expect((await f.external.getEpisode(ns))?.pendingLearning).toBe(false);
    }
    b = await start(call, 'B', header);
    await memoryCall(call, 'memory_v2_read', a.id, 'task_context', {}, header);
    expect((await f.external.getEpisode(ns))?.id).toBe(b.id);
    const otherOwner = await start(call, 'B', header, 'b'); expect(otherOwner.id).not.toBe(b.id);
    const denied = await call('memory_v2_read', { action: 'capabilities', scope: { taskId: b.id } }, header, 'b'); expect(denied.isError).toBe(true); expect(JSON.parse(denied.content[0].text).code).toBe('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  });
  it('keeps canonical binding through real legacy Memory search hooks using aliases and another workspace', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const registeredRoot = path.join(f.root, 'registered-root'), otherRoot = path.join(f.root, 'other-root');
    await mkdir(registeredRoot); await mkdir(otherRoot);
    await f.memory.registerWorkspaceAliases([{ name: 'registered', repos: [{ path: registeredRoot }] }, { name: 'other', repos: [{ path: otherRoot }] }]);
    const call = await httpFixture(f), header = 'workspace-hooks';
    const activate = async () => {
      const result = await call('controller_learning', { action: 'episode', episodeOperation: 'start', taskKey: 'registered-task', workspace: 'registered' }, header);
      expect(result.isError).not.toBe(true); return JSON.parse(result.content[0].text);
    };
    const task = await activate();
    for (const workspace of [registeredRoot, 'other']) {
      const recalled = await call('memory_search', { query: 'synthetic needle', workspace, limit: 1 }, header); expect(recalled.isError).not.toBe(true);
      expect((await activate()).id).toBe(task.id);
      expect(await f.external.resolveMemoryTask('owner-a', task.id)).toEqual({ taskId: task.id, workspaceKey: 'registered' });
      const capabilities = await call('memory_v2_read', { action: 'capabilities', scope: { taskId: task.id } }, header); expect(capabilities.isError).not.toBe(true);
    }
  });
  it('preserves a Native task across tool sessions and rejects a mismatched selector or missing workspace', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root); const runtime = { memoryExperience: f.memory as any, nativeTaskId: 'native-stable', nativeWorkspace: 'agent-core' }; let episode: any;
    for (const sessionId of ['native-tool-1', 'native-tool-2']) {
      const session = await AgentRuntimeToolSession.open(sessionId, ['memory_v2_read', 'memory_v2_write'], runtime);
      try {
        const result = await session.call('memory_v2_write', { action: 'task_start', payload: episodeStart }); expect(result.isError).toBe(false); const current = JSON.parse(result.text).result;
        if (episode) expect(current.id).toBe(episode.id); episode = current;
        const context = await session.call('memory_v2_read', { action: 'task_context', scope: { taskId: 'native-stable' } }); expect(context.isError).toBe(false); expect(JSON.parse(context.text).result.data.episodeRef.id).toBe(episode.id);
        expect((await session.call('memory_v2_read', { action: 'capabilities', scope: { taskId: 'other' } })).isError).toBe(true);
      } finally { await session.close(); }
    }
    const missing = await AgentRuntimeToolSession.open('missing-native-workspace', ['memory_v2_read'], { ...runtime, nativeWorkspace: undefined });
    try { const result = await missing.call('memory_v2_read', { action: 'capabilities' }); expect(result.isError).toBe(true); expect(result.text).toContain('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE'); } finally { await missing.close(); }
  });
});
