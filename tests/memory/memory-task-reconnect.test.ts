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
import { report } from '../skill-proposal-fixture.js';
import { acknowledgeControllerContract } from '../controller-contract-fixture.js';
const roots: string[] = [], servers: Server[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function httpFixture(f: Awaited<ReturnType<typeof memoryTaskFixture>>) {
  const handler = createMcpHttpHandler({ memoryExperience: f.memory as any, memoryService: f.memory as any, externalControllerLearning: f.external, learningService: f.learning });
  const server = createServer((req, res) => { void handler(req, res, { id: req.headers['x-fixture-owner'] === 'b' ? 'owner-b' : 'owner-a' } as any); }); servers.push(server);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw Error('LISTENER_NOT_BOUND');
  const call = async (name: string, args: any, header?: string, owner = 'a') => {
    const response = await fetch('http://127.0.0.1:' + address.port + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json,text/event-stream', 'x-fixture-owner': owner, ...(header ? { 'x-agent-core-session-id': header } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    expect(response.ok).toBe(true); const body = await response.text(); const line = body.split('\n').find(x => x.startsWith('data:')); const rpc = JSON.parse(line ? line.slice(5) : body);
    expect(rpc.error, JSON.stringify(rpc)).toBeUndefined(); return rpc.result;
  };
  return async (name: string, args: any, header?: string, owner = 'a') => {
    const contractSession = await acknowledgeControllerContract((tool, input) => call(tool, input, header, owner));
    return call(name, { ...args, contractSession }, header, owner);
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
  it('finalizes the exact Learning task across a headerless hour boundary without another episode start', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root); const call = await httpFixture(f);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-09T00:59:59Z'));
    const task = await start(call, 'hour-boundary-learning');
    clock.mockReturnValue(Date.parse('2026-10-09T01:00:01Z'));
    const response = await call('learning', { action: 'checkpoint', taskId: task.id, workspace: 'agent-core',
      idempotencyKey: 'hour-boundary-learning', reason: 'task-complete', evidenceRefs: ['source:hour-boundary-fixture'] });
    expect(response.isError, JSON.stringify(response)).not.toBe(true);
    expect((await f.external.getEpisode(namespace('owner-a', undefined, Date.now())))?.id).toBe(task.id);
    const review = await call('learning', { action: 'review', taskId: task.id, workspace: 'agent-core',
      checkpointKeys: ['hour-boundary-learning'], candidates: [], disposition: 'no-new-knowledge' });
    expect(review.isError, JSON.stringify(review)).not.toBe(true);
    expect((await f.learning.status()).pendingReviewCount).toBe(0);
  });
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

describe('P1-P5 external Memory workflow — isolated HTTP fixtures', () => {
  it('P1 gives a bounded current-task next step, never the previous or another owner task', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const call = await httpFixture(f), header = 'p1-current-task';
    const a = await start(call, 'advisory-a', header);
    expect(a.workflowNext).toMatchObject({ taskId: a.id, advisory: true, status: 'active' });
    const statusA = JSON.parse((await call('controller_learning', { action: 'status' }, header)).content[0].text);
    expect(statusA.workflowNext.taskId).toBe(a.id);
    const b = await start(call, 'advisory-b', header);
    const statusB = JSON.parse((await call('controller_learning', { action: 'status' }, header)).content[0].text);
    expect(statusB.workflowNext.taskId).toBe(b.id);
    expect(JSON.stringify(statusB.workflowNext)).not.toContain(a.id);
    const foreign = JSON.parse((await call('controller_learning', { action: 'status' }, header, 'b')).content[0].text);
    expect(foreign.workflowNext.status).toBe('scope-unavailable');
  });
  it('P2 mirrors only the final v2 hits and never a budget-withheld candidate', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root); const header = 'p2-bounded';
    for (const suffix of ['alpha', 'beta', 'gamma']) await f.memory.remember({
      title: 'Sapphire proof ' + suffix, content: 'Sapphire proof instrument ' + suffix,
      provenance: { workspace: 'agent-core', files: [] },
    });
    const call = await httpFixture(f), task = await start(call, 'p2-delivery', header);
    const response = await call('memory_v2_read', { action: 'recall', scope: { taskId: task.id },
      payload: { query: 'sapphire proof instrument', view: 'abstract', limit: 1, budget: { maxBytes: 4096 } } }, header);
    expect(response.isError).not.toBe(true);
    const page = JSON.parse(response.content[0].text).result;
    expect(page.data.hits).toHaveLength(1);
    const hit = page.data.hits[0], episodes = await f.external.recentEpisodes({ taskKey: 'p2-delivery' });
    const stored = episodes[0];
    expect(stored.deliveredMemories).toEqual({
      [hit.retrievalEvidence.attemptId + ':' + hit.id]: hit.retrievalEvidence.contentDigest,
    });
    const ledgerFile = path.join(f.root, 'runtime/memory/state/retrieval-ledger.jsonl');
    const attempts = (await readFile(ledgerFile, 'utf8')).trim().split('\n').map(JSON.parse);
    const attempt = attempts.find((row: any) => row.attemptId === hit.retrievalEvidence.attemptId);
    expect(attempt.taskId).toBe(task.id);
    expect(attempt.exposures.filter((row: any) => row.handoffStatus === 'returned-to-controller')
      .map((row: any) => row.memoryId)).toEqual([hit.id]);
    const blocked = await call('memory_v2_read', { action: 'recall', scope: { taskId: task.id },
      payload: { query: 'sapphire proof instrument', view: 'abstract', budget: { maxBytes: 512 } } }, header);
    expect(JSON.parse(blocked.content[0].text).result.status).toBe('insufficient-budget');
    expect((await readFile(ledgerFile, 'utf8')).trim().split('\n')).toHaveLength(attempts.length);
    expect((await f.external.recentEpisodes({ taskKey: 'p2-delivery' }))[0].deliveredMemories)
      .toEqual(stored.deliveredMemories);
  });
  it('F1 permits a slow host-bound Memory recall while preserving exact delivery evidence', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const record = await f.memory.remember({ content: 'Distinct slow recall acceptance violet lantern',
      provenance: { workspace: 'agent-core', files: [] } });
    const original = f.memory.controller.bind(f.memory);
    vi.spyOn(f.memory, 'controller').mockImplementation(((...args: any[]) => {
      const session = (original as any)(...args);
      return new Proxy(session, { get(target, key) {
        if (key === 'recall') return async (input: any) => {
          await new Promise(resolve => setTimeout(resolve, 400));
          return target.recall(input);
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    }) as any);
    const call = await httpFixture(f), header = 'slow-recall-f1';
    const task = await start(call, 'slow-recall-evidence', header);
    const result = await call('memory_v2_read', { action: 'recall', scope: { taskId: task.id },
      payload: { query: 'violet lantern', view: 'abstract', limit: 1 } }, header);
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    const hit = JSON.parse(result.content[0].text).result.data.hits.find((item: any) => item.id === record.id);
    expect(hit).toBeDefined();
    const episode = (await f.external.recentEpisodes({ taskKey: 'slow-recall-evidence' }))[0];
    expect(episode.deliveredMemories[hit.retrievalEvidence.attemptId + ':' + record.id])
      .toBe(hit.retrievalEvidence.contentDigest);
  });
  it('F1 rejects an in-flight recall after rotating to another host task', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    await f.memory.remember({ content: 'Rotated delayed amber lantern evidence',
      provenance: { workspace: 'agent-core', files: [] } });
    let entered!: () => void, release!: () => void;
    const recallEntered = new Promise<void>(resolve => { entered = resolve; });
    const recallRelease = new Promise<void>(resolve => { release = resolve; });
    const original = f.memory.controller.bind(f.memory);
    vi.spyOn(f.memory, 'controller').mockImplementation(((...args: any[]) => {
      const session = (original as any)(...args);
      return new Proxy(session, { get(target, key) {
        if (key === 'recall') return async (input: any) => {
          entered(); await recallRelease; return target.recall(input);
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    }) as any);
    const call = await httpFixture(f), header = 'rotated-recall-f1';
    const oldTask = await start(call, 'rotated-f1-old', header);
    const inFlight = call('memory_v2_read', { action: 'recall', scope: { taskId: oldTask.id },
      payload: { query: 'amber lantern', view: 'abstract', limit: 1 } }, header);
    await recallEntered;
    const newTask = await start(call, 'rotated-f1-new', header);
    expect(newTask.id).not.toBe(oldTask.id);
    release();
    const denied = await inFlight;
    expect(denied.isError).toBe(true);
    expect(JSON.parse(denied.content[0].text).code).toBe('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    const old = (await f.external.recentEpisodes({ taskKey: 'rotated-f1-old' }))[0];
    const current = (await f.external.recentEpisodes({ taskKey: 'rotated-f1-new' }))[0];
    expect(Object.keys(old.deliveredMemories ?? {})).toHaveLength(0);
    expect(Object.keys(current.deliveredMemories ?? {})).toHaveLength(0);
  });
  it('P2 ledger reconciliation uses the identical immutable attempt and is idempotent', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const record = await f.memory.remember({ content: 'Exact missed mirror topaz procedure',
      provenance: { workspace: 'agent-core', files: [] } });
    const call = await httpFixture(f), header = 'p2-reconcile';
    const task = await start(call, 'p2-ledger', header);
    // A direct host-issued v2 engine recall persists its ledger entry but bypasses the MCP mirror.
    const session = f.memory.controller({ taskId: task.id, workspaceKey: 'agent-core', controllerId: 'test' });
    const recalled = await session.recall({ query: 'missed mirror topaz procedure',
      view: 'abstract', limit: 1, budget: { maxBytes: 4096 } });
    if (!('data' in recalled)) throw Error('NO_RECALL_DATA');
    const hit = recalled.data.hits.find(row => row.id === record.id);
    expect(hit).toBeDefined();
    const exact = { taskId: task.id, workspace: 'agent-core',
      retrievalAttemptId: hit!.retrievalEvidence.attemptId, memoryId: record.id,
      contentDigest: hit!.retrievalEvidence.contentDigest };
    expect(await f.memory.confirmedMemoryDelivery(exact)).toBe(true);
    for (const patch of [{ taskId: 'wrong-task' }, { workspace: 'foreign' },
      { memoryId: 'missing-memory' }, { contentDigest: 'sha256:' + '0'.repeat(64) },
      { retrievalAttemptId: 'missing-attempt' }])
      expect(await f.memory.confirmedMemoryDelivery({ ...exact, ...patch })).toBe(false);
    expect(Object.keys((await f.external.recentEpisodes({ taskKey: 'p2-ledger' }))[0].deliveredMemories ?? {})).toHaveLength(0);
    const input = { action: 'artifact_receipt', artifactKind: 'memory', artifactId: record.id,
      taskId: task.id, workspace: 'agent-core', applicability: 'rejected', result: 'unavailable',
      reasonCode: 'not-applicable', retrievalAttemptId: exact.retrievalAttemptId,
      memoryId: record.id, contentDigest: exact.contentDigest };
    const first = await call('controller_learning', input, header);
    expect(first.isError, JSON.stringify(first)).not.toBe(true);
    expect(JSON.parse(first.content[0].text).duplicate).toBe(false);
    const second = await call('controller_learning', input, header);
    expect(JSON.parse(second.content[0].text).duplicate).toBe(true);
    const after = (await f.external.recentEpisodes({ taskKey: 'p2-ledger' }))[0];
    expect(after.deliveredMemories[exact.retrievalAttemptId + ':' + record.id]).toBe(exact.contentDigest);
    expect(after.events.filter((event: any) => event.kind === 'artifact-use'
      && event.evidenceRefs.some((ref: string) => ref.startsWith('receipt:')))).toHaveLength(1);
    const receiptsFile = path.join(f.root, 'runtime/memory/state/retrieval-use-receipts.jsonl');
    expect((await readFile(receiptsFile, 'utf8')).trim().split('\n')).toHaveLength(1);
    await start(call, 'p2-rotated', header);
    const stale = await call('controller_learning', input, header);
    expect(stale.isError).toBe(true);
    expect((await readFile(receiptsFile, 'utf8')).trim().split('\n')).toHaveLength(1);
  });
  it('P3 binds actual receipt, verified feedback and immutable idempotent evidence', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const record = await f.memory.remember({ content: 'Copper verified routine checksum',
      provenance: { workspace: 'agent-core', files: [] } });
    const call = await httpFixture(f), header = 'p3-verified', task = await start(call, 'p3-proof', header);
    const result = await call('memory_v2_read', { action: 'recall', scope: { taskId: task.id },
      payload: { query: 'copper verified routine checksum', view: 'abstract', limit: 1 } }, header);
    const hit = JSON.parse(result.content[0].text).result.data.hits.find((row: any) => row.id === record.id);
    expect(hit).toBeDefined();
    const verificationRef = await report(f.root, task.id);
    const proof = JSON.parse(await readFile(path.join(f.root, task.id + '-report.json'), 'utf8'));
    const use = { action: 'artifact_receipt', artifactKind: 'memory', artifactId: record.id,
      taskId: task.id, workspace: 'agent-core', applicability: 'applied', result: 'success',
      reasonCode: 'verification-backed', retrievalAttemptId: hit.retrievalEvidence.attemptId,
      memoryId: record.id, contentDigest: hit.retrievalEvidence.contentDigest,
      verificationRef, actionRefs: ['file:' + proof.answer.path + '#' + proof.answer.digest],
      memoryFeedback: 'helpful' };
    const first = await call('controller_learning', use, header);
    expect(first.isError, JSON.stringify(first)).not.toBe(true);
    const firstValue = JSON.parse(first.content[0].text);
    expect(firstValue.receipt.result).toBe('success');
    expect(firstValue.memoryFeedback.status).toBe('recorded');
    const repeated = JSON.parse((await call('controller_learning', use, header)).content[0].text);
    expect(repeated.duplicate).toBe(true);
    expect(repeated.memoryFeedback.duplicate).toBe(true);
    expect((await f.memory.feedbackStatus()).recordCount).toBe(1);
    const episode = (await f.external.recentEpisodes({ taskKey: 'p3-proof' }))[0];
    expect(episode.events.filter((event: any) => event.kind === 'artifact-use')).toHaveLength(1);
    const ledgerFile = path.join(f.root, 'runtime/memory/state/retrieval-use-receipts.jsonl');
    expect((await readFile(ledgerFile, 'utf8')).trim().split('\n')).toHaveLength(1);
    const unverified = await call('controller_learning', { ...use, reasonCode: 'proof-missing',
      verificationRef: 'verification:unavailable-proof', actionRefs: [], memoryFeedback: undefined }, header);
    expect(unverified.isError).not.toBe(true);
    expect(JSON.parse(unverified.content[0].text).receipt).toMatchObject({
      result: 'unavailable', reportedResult: 'success',
    });
    expect((await f.memory.feedbackStatus()).recordCount).toBe(1);
    const denied = await call('controller_learning', use, header, 'b');
    expect(denied.isError).toBe(true);
    const bypass = await call('learning', { action: 'receipt', useId: 'bypass-receipt',
      retrievalAttemptId: hit.retrievalEvidence.attemptId, memoryId: record.id,
      contentDigest: hit.retrievalEvidence.contentDigest, applicability: 'applied',
      result: 'unavailable', reasonCode: 'bypass' }, header, 'b');
    expect(bypass.isError).toBe(true);
    expect((await readFile(ledgerFile, 'utf8')).trim().split('\n')).toHaveLength(2);
  });
  it('P4 preserves Learning commit when episode mirror fails and replays exact checkpoint keys', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const call = await httpFixture(f), header = 'p4-review';
    const a = await start(call, 'p4-a', header), b = await start(call, 'p4-b', header, 'b');
    const checkpoint = (task: any, key: string) => ({ action: 'checkpoint',
      idempotencyKey: key, taskId: task.id, workspace: 'agent-core',
      reason: 'task-complete', evidenceRefs: ['source:isolated-fixture'] });
    vi.spyOn(f.external, 'recordLearningCheckpoint').mockRejectedValueOnce(new Error('TEST_MIRROR_UNAVAILABLE'));
    const aFirst = JSON.parse((await call('learning', checkpoint(a, 'p4-key-a'), header)).content[0].text);
    expect(aFirst.externalEpisodeLinkage).toBe('unavailable');
    expect((await f.learning.status()).pendingReviewCount).toBe(1);
    const aRepeat = JSON.parse((await call('learning', checkpoint(a, 'p4-key-a'), header)).content[0].text);
    expect(aRepeat.duplicate).toBe(true);
    expect(aRepeat.externalEpisodeLinkage).toBe('recorded');
    expect((await f.external.recentEpisodes({ taskKey: 'p4-a' }))[0].checkpointKeys).toEqual(['p4-key-a']);
    const bFirst = JSON.parse((await call('learning', checkpoint(b, 'p4-key-b'), header, 'b')).content[0].text);
    expect(bFirst.externalEpisodeLinkage).toBe('recorded');
    const foreign = await call('learning', checkpoint(b, 'p4-key-foreign'), header);
    expect(foreign.isError).toBe(true);
    expect((await f.learning.status()).pendingReviewCount).toBe(2);
    vi.spyOn(f.external, 'recordLearningReview').mockRejectedValueOnce(new Error('TEST_REVIEW_MIRROR_UNAVAILABLE'));
    const review = { action: 'review', checkpointKeys: ['p4-key-a'], taskId: a.id,
      workspace: 'agent-core', disposition: 'no-new-knowledge', candidates: [] };
    const result = JSON.parse((await call('learning', review, header)).content[0].text);
    expect(result.externalEpisodeLinkage).toBe('unavailable');
    expect(result.checkpointDecisions['p4-key-a']).toMatchObject({ complete: true, status: 'no-new-knowledge' });
    expect((await f.learning.status()).pendingReviewCount).toBe(1);
    expect((await f.external.recentEpisodes({ taskKey: 'p4-b' }))[0].checkpointKeys).toEqual(['p4-key-b']);
    const repeated = JSON.parse((await call('learning', review, header)).content[0].text);
    expect(repeated.externalEpisodeLinkage).toBe('recorded');
    expect((await f.external.recentEpisodes({ taskKey: 'p4-a' }))[0].pendingLearning).toBe(false);
    expect((await f.learning.status()).pendingReviewCount).toBe(1);
    const noWork = JSON.parse((await call('learning', { ...checkpoint(a, 'p4-no-work'),
      meaningful: false, reason: 'status' }, header)).content[0].text);
    expect(noWork.externalEpisodeLinkage).toBe('not-required');
    expect((await f.learning.status()).pendingReviewCount).toBe(1);
    const stableState = await readFile(path.join(f.root, 'learning/state.json'), 'utf8');
    const replay = await call('learning', review, header);
    expect(replay.isError, JSON.stringify(replay)).not.toBe(true);
    expect(JSON.parse(replay.content[0].text).externalEpisodeLinkage).toBe('not-required');
    expect(await readFile(path.join(f.root, 'learning/state.json'), 'utf8')).toBe(stableState);
  });
  it('publishes the external proposal result before terminal review closes its admitted episode', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const call = await httpFixture(f), header = 'terminal-publication';
    const task = await start(call, 'terminal-publication', header);
    const verified = await call('controller_learning', { action: 'episode', episodeOperation: 'verify',
      taskId: task.id, episodeOutcome: 'verified', verificationRef: await report(f.root, task.id) }, header);
    expect(verified.isError, JSON.stringify(verified)).not.toBe(true);
    const key = 'terminal-publication-key';
    const checkpoint = await call('learning', { action: 'checkpoint', idempotencyKey: key,
      taskId: task.id, workspace: 'agent-core', reason: 'task-complete',
      evidenceRefs: ['source:isolated-terminal-publication'] }, header);
    expect(checkpoint.isError, JSON.stringify(checkpoint)).not.toBe(true);
    const publish = vi.spyOn(f.learning, 'publishExternalTaskSkillProposals');
    const review = await call('learning', { action: 'review', checkpointKeys: [key],
      taskId: task.id, workspace: 'agent-core', disposition: 'no-new-knowledge', candidates: [] }, header);
    expect(review.isError, JSON.stringify(review)).not.toBe(true);
    const outcome = JSON.parse(review.content[0].text);
    expect(outcome.proposalDocuments).toMatchObject({ status: 'not-required', documents: [], unavailable: [] });
    expect(publish).toHaveBeenCalledExactlyOnceWith({ workspace: 'agent-core', taskId: task.id });
    expect(outcome.externalEpisodeLinkage).toBe('recorded');
    expect(outcome.checkpointDecisions[key]).toMatchObject({ complete: true, status: 'no-new-knowledge' });
    expect((await f.external.recentEpisodes({ taskKey: 'terminal-publication' }))[0]).toMatchObject({
      terminalOutcome: 'verified', closedAt: expect.any(String), pendingLearning: false,
    });
    expect((await f.learning.status()).pendingReviewCount).toBe(0);
  });
  it('F1 completes slow host-bound keyed Learning review without using the optional observer timeout', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const call = await httpFixture(f), header = 'f1-learning-review';
    const task = await start(call, 'f1-learning-review', header);
    const key = 'f1-learning-review-key';
    const checkpoint = await call('learning', { action: 'checkpoint', idempotencyKey: key,
      taskId: task.id, workspace: 'agent-core', reason: 'task-complete',
      evidenceRefs: ['source:f1-isolated-fixture'] }, header);
    expect(checkpoint.isError, JSON.stringify(checkpoint)).not.toBe(true);
    const original = f.external.getEpisode.bind(f.external);
    vi.spyOn(f.external, 'getEpisode').mockImplementation(async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 400));
      return original(...args);
    });
    const review = await call('learning', { action: 'review', checkpointKeys: [key],
      taskId: task.id, workspace: 'agent-core', disposition: 'no-new-knowledge',
      candidates: [] }, header);
    expect(review.isError, JSON.stringify(review)).not.toBe(true);
    const outcome = JSON.parse(review.content[0].text);
    expect(outcome.checkpointDecisions[key]).toMatchObject({ complete: true, status: 'no-new-knowledge' });
    expect((await f.learning.status()).pendingReviewCount).toBe(0);
  });
  it('F1 rejects a delayed Learning review after the external task rotates', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const call = await httpFixture(f), header = 'f1-learning-rotation';
    const a = await start(call, 'f1-review-old', header), key = 'f1-review-old-key';
    const checkpoint = await call('learning', { action: 'checkpoint', idempotencyKey: key,
      taskId: a.id, workspace: 'agent-core', reason: 'task-complete',
      evidenceRefs: ['source:f1-isolated-fixture'] }, header);
    expect(checkpoint.isError, JSON.stringify(checkpoint)).not.toBe(true);
    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const releasePromise = new Promise<void>(resolve => { release = resolve; });
    const original = f.external.getEpisode.bind(f.external);
    vi.spyOn(f.external, 'getEpisode').mockImplementation(async (...args) => {
      entered(); await releasePromise; return original(...args);
    });
    const inFlight = call('learning', { action: 'review', checkpointKeys: [key],
      taskId: a.id, workspace: 'agent-core', disposition: 'no-new-knowledge',
      candidates: [] }, header);
    await enteredPromise;
    const b = await start(call, 'f1-review-new', header);
    expect(b.id).not.toBe(a.id);
    release();
    const denied = await inFlight;
    expect(denied.isError).toBe(true);
    expect((await f.learning.status()).pendingReviewCount).toBe(1);
    const previous = (await f.external.recentEpisodes({ taskKey: 'f1-review-old' }))[0];
    expect(previous.checkpointKeys).toEqual([key]);
  });
  it('F2/F3 share canonical lineage and exact progressive hints across external controller contexts', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    await f.memory.batch([
      { op: 'remember', id: 'f23-root', value: { content: 'Upstream unique evidence origin',
        provenance: { workspace: 'agent-core', files: [] } } },
      ...['a','b'].map(letter => ({ op: 'remember' as const, id: 'f23-'+letter,
        value: { content: 'f23nexus '+letter+' '.repeat(4)+letter.repeat(550),
          links: [{ targetId: 'f23-root', type: 'derived-from' as const, strength: 1 }],
          provenance: { workspace: 'agent-core', files: [] } } })),
    ]);
    const header = 'f23-internal-handoff', call = await httpFixture(f);
    const task = await start(call, 'f23-real-handoff', header);
    const response = await call('controller_learning', { action: 'context', workspace: 'agent-core',
      query: 'f23nexus', limit: 5 }, header);
    expect(response.isError, JSON.stringify(response)).not.toBe(true);
    const packet = JSON.parse(response.content[0].text);
    const a = packet.memories?.find((item: any) => item.id === 'f23-a');
    const b = packet.memories?.find((item: any) => item.id === 'f23-b');
    expect(a).toBeDefined(); expect(b).toBeDefined();
    expect(a.evidenceLineage).toMatchObject({ status: 'shared-origin' });
    expect(a.evidenceLineage.peers).toContain('f23-b');
    expect(a.detailHint).toMatchObject({ action: 'expand-if-needed', view: 'record',
      source: a.sourceRef, reason: 'delivery-truncated' });
    const recall = await call('memory_v2_read', { action: 'recall', scope: { taskId: task.id },
      payload: { query: 'f23nexus', view: 'abstract', limit: 4, budget: { maxBytes: 12000 } } }, header);
    expect(recall.isError, JSON.stringify(recall)).not.toBe(true);
    const result = JSON.parse(recall.content[0].text).result;
    const hit = result.data.hits.find((item: any) => item.id === 'f23-a');
    expect(hit.detailHint.source).toEqual({ kind: 'memory', id: 'f23-a', revision: hit.revision });
    expect(hit.evidenceLineage.peers).toContain('f23-b');
  });
  it('P5 carries sourceRef, exact revision/digest and bounded serialized excerpt from one recall snapshot', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const original = await f.memory.remember({ content: 'Indigo documentation procedure original snapshot',
      provenance: { workspace: 'agent-core', files: [] } });
    const call = await httpFixture(f), header = 'p5-same-snapshot';
    const task = await start(call, 'p5-snapshot', header);
    const query = 'indigo documentation procedure original snapshot';
    const response = await call('controller_learning', { action: 'context', query, workspace: 'agent-core' }, header);
    expect(response.isError, JSON.stringify(response)).not.toBe(true);
    const context = JSON.parse(response.content[0].text);
    const hit = context.memories.find((item: any) => item.id === original.id);
    expect(hit).toBeDefined();
    const { memorySemanticRevision } = await import('../../src/memory/disclosure.js');
    const { memoryFeedbackContentDigest } = await import('../../src/memory/feedback-target.js');
    expect(hit.sourceRef).toEqual({
      kind: 'memory', id: original.id, revision: memorySemanticRevision(original),
    });
    expect(hit.retrievalEvidence.contentDigest).toBe(memoryFeedbackContentDigest(original));
    expect(Buffer.byteLength(JSON.stringify(hit.content), 'utf8')
      + Buffer.byteLength(JSON.stringify(hit.sourceRef), 'utf8')).toBeLessThanOrEqual(1400);
    const expand = await call('memory_v2_read', { action: 'expand', scope: { taskId: task.id },
      payload: { source: hit.sourceRef, view: 'record', budget: { maxBytes: 4096 } } }, header);
    expect(expand.isError, JSON.stringify(expand)).not.toBe(true);
    const expanded = JSON.parse(expand.content[0].text).result;
    expect(expanded.data.source).toEqual(hit.sourceRef);
    expect(expanded.data.text).toContain('original snapshot');
    await f.memory.update(original.id, { content: 'Indigo documentation procedure revised snapshot' });
    const prior = await call('memory_v2_read', { action: 'expand', scope: { taskId: task.id },
      payload: { source: hit.sourceRef, view: 'record', budget: { maxBytes: 4096 } } }, header);
    const priorContent = JSON.parse(prior.content[0].text).result;
    if (priorContent.data) {
      expect(priorContent.data.source.revision).toBe(hit.sourceRef.revision);
      expect(priorContent.data.text).not.toContain('revised snapshot');
    } else expect(prior.isError).toBe(true);
  });
  it('P5 keeps the captured record revision when canonical content changes before response composition', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const record = await f.memory.remember({ title: 'Atomic purple coral proof',
      content: 'Purple coral proof before asynchronous update',
      provenance: { workspace: 'agent-core', files: [] } });
    const originalSearch = f.memory.search.bind(f.memory);
    let changed = false;
    vi.spyOn(f.memory, 'search').mockImplementationOnce(async (query, options, host) => {
      const snapshot = await originalSearch(query, options, host);
      await f.memory.update(record.id, { content: 'Purple coral proof after asynchronous update' });
      changed = true;
      return snapshot;
    });
    const call = await httpFixture(f), header = 'p5-source-drift';
    await start(call, 'p5-drift', header);
    const response = await call('controller_learning', {
      action: 'context', query: 'purple coral proof', workspace: 'agent-core',
    }, header);
    expect(response.isError, JSON.stringify(response)).not.toBe(true);
    const hit = JSON.parse(response.content[0].text).memories.find((value: any) => value.id === record.id);
    const { memorySemanticRevision } = await import('../../src/memory/disclosure.js');
    const { memoryFeedbackContentDigest } = await import('../../src/memory/feedback-target.js');
    expect(changed).toBe(true);
    expect(hit.sourceRef.revision).toBe(memorySemanticRevision(record));
    expect(hit.retrievalEvidence.contentDigest).toBe(memoryFeedbackContentDigest(record));
    expect(hit.content).toContain('before asynchronous update');
    expect(hit.content).not.toContain('after asynchronous update');
    expect(memorySemanticRevision((await f.memory.read(record.id, false))!)).not.toBe(hit.sourceRef.revision);
  });
});

it('confirmedDelivery rejects incorrect disposition, handoff and failed retrieval status', async () => {
  const f = await memoryTaskFixture(); roots.push(f.root);
  const task = await f.start('owner-a', 'negative-ledger', 'ledger-negatives');
  const note = await f.memory.remember({ content: 'Synthetic ledger negative outcomes',
    provenance: { workspace: 'agent-core', files: [] } });
  const { memoryFeedbackContentDigest } = await import('../../src/memory/feedback-target.js');
  const { MemoryRetrievalLedger } = await import('../../src/memory/retrieval-ledger.js');
  const { resolveMemoryPaths } = await import('../../src/memory/paths.js');
  const ledger = new MemoryRetrievalLedger(resolveMemoryPaths(f.root, path.join(f.root, 'runtime/memory')));
  const now = new Date().toISOString(), digest = memoryFeedbackContentDigest(note);
  const cases = [
    { key: 'failed', status: 'failed', disposition: 'selected', handoff: 'returned-to-controller', delivered: 1 },
    { key: 'dropped', status: 'succeeded', disposition: 'dropped', handoff: 'returned-to-controller', delivered: 0 },
    { key: 'nohandoff', status: 'succeeded', disposition: 'selected', handoff: 'not-attempted', delivered: 1 },
    { key: 'failedhandoff', status: 'succeeded', disposition: 'selected', handoff: 'failed', delivered: 1 },
  ] as const;
  for (const row of cases) {
    const retrievalAttemptId = 'negative-' + row.key;
    await ledger.record({ version: 1, taskId: task.id, workspace: 'agent-core',
      attemptId: retrievalAttemptId, surface: 'memory_recall', trigger: 'explicit',
      startedAt: now, completedAt: now, retrievalStatus: row.status,
      deliveryStatus: 'returned-to-controller', candidateCount: 1, selectedCount: row.delivered,
      exposures: [{ memoryId: note.id, rank: 1, disposition: row.disposition,
        handoffStatus: row.handoff, recordFingerprint: 'sha256:' + 'a'.repeat(64), contentDigest: digest }],
    });
    expect(await f.memory.confirmedMemoryDelivery({ taskId: task.id, workspace: 'agent-core',
      retrievalAttemptId, memoryId: note.id, contentDigest: digest })).toBe(false);
  }
});

it('a cancelled final v2 result is not mirrored or reported as delivered', async () => {
  const f = await memoryTaskFixture(); roots.push(f.root);
  await f.memory.remember({ content: 'Cancelled opaline disclosure fixture',
    provenance: { workspace: 'agent-core', files: [] } });
  const task = await f.start('owner-a', 'cancelled-transport', 'cancelled-at-response');
  const aborted = new AbortController(), facade = memoryToolFixture(); let mirrors = 0, withheld: any;
  const original = f.memory.controller.bind(f.memory);
  registerMemoryExperienceTools(facade.server as any, {
    registeredWorkspaceIdentity: f.memory.registeredWorkspaceIdentity.bind(f.memory),
    controller(scope: any, policy: any, host: any, defer: any) {
      const session = original(scope, policy, host, defer);
      return { capabilities: session.capabilities.bind(session), recall: async (input: any) => {
        const result = await session.recall(input); withheld = result; aborted.abort(); return result;
      } };
    },
  } as any, async selector => ({
    ...await f.external.resolveMemoryTask('owner-a', selector?.taskId ?? ''), controllerId: 'agent-core-external',
  }), async () => { mirrors++; });
  const invoke = facade.callbacks.get('memory_v2_read')! as any;
  const output = await invoke({ action: 'recall', scope: { taskId: task.id },
    payload: { query: 'cancelled opaline disclosure fixture', view: 'abstract' } },
    { mcpReq: { signal: aborted.signal } });
  expect(aborted.signal.aborted).toBe(true);
  expect(output.isError).toBe(true);
  expect(JSON.parse(output.content[0].text).code).toBe('MEMORY_DISCLOSURE_CANCELLED');
  expect(mirrors).toBe(0);
  expect(withheld.data.hits.length).toBeGreaterThan(0);
  const withheldHit = withheld.data.hits[0];
  expect(await f.memory.confirmedMemoryDelivery({ taskId: task.id, workspace: 'agent-core',
    retrievalAttemptId: withheldHit.retrievalEvidence.attemptId,
    memoryId: withheldHit.id, contentDigest: withheldHit.retrievalEvidence.contentDigest,
  })).toBe(false);
  expect(Object.keys((await f.external.recentEpisodes({ taskKey: 'cancelled-at-response' }))[0]
    .deliveredMemories ?? {})).toHaveLength(0);
});
it('late host invocation cannot mirror a previous task into the rotated external episode', async () => {
  const f = await memoryTaskFixture(); roots.push(f.root);
  const sessionId = 'late-scope-test';
  const a = await f.start('owner-a', sessionId, 'late-A');
  const capture = await f.external.captureToolInvocationContext({
    invocationId: 'late-invocation-a', processSessionId: 'synthetic',
    sessionId, ownerId: 'owner-a',
  });
  expect(capture.binding).toBe('bound');
  const b = await f.start('owner-a', sessionId, 'late-B');
  const admitted = await f.external.recordV2MemoryRecall(sessionId, [{
    id: 'synthetic-old-hit', retrievalEvidence: {
      attemptId: 'old-attempt', contentDigest: 'sha256:' + 'a'.repeat(64),
    },
  }], capture);
  expect(admitted).toBe(false);
  for (const task of [a, b]) expect(Object.keys(
    (await f.external.recentEpisodes({ taskKey: task.taskKey }))[0].deliveredMemories ?? {},
  )).toHaveLength(0);
});

it('scope rotation before MCP delivery admission cannot persist a returned attempt', async () => {
  const f = await memoryTaskFixture(); roots.push(f.root);
  const record = await f.memory.remember({ content: 'Orchid rotating scoped recall fixture',
    provenance: { workspace: 'agent-core', files: [] } });
  const task = await f.start('owner-a', 'rotation-test', 'rotation-A');
  const facade = memoryToolFixture();
  const original = f.memory.controller.bind(f.memory);
  let stillCurrent = true, assertions = 0, withheld: any;
  registerMemoryExperienceTools(facade.server as any, {
    registeredWorkspaceIdentity: f.memory.registeredWorkspaceIdentity.bind(f.memory),
    controller(scope: any, policy: any, host: any, defer: any) {
      const session = original(scope, policy, host, defer);
      return { capabilities: session.capabilities.bind(session), recall: async (request: any) => {
        const output = await session.recall(request);
        withheld = output; stillCurrent = false;
        return output;
      } };
    },
  } as any, async selector => ({
    ...await f.external.resolveMemoryTask('owner-a', selector?.taskId ?? ''), controllerId: 'agent-core-external',
  }), undefined, async (taskId, workspaceKey) => {
    assertions++;
    expect(taskId).toBe(task.id); expect(workspaceKey).toBe('agent-core');
    if (!stillCurrent) throw Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  });
  const response = await facade.read({ action: 'recall', scope: { taskId: task.id },
    payload: { query: 'orchid rotating scoped recall fixture', view: 'abstract' } });
  expect(response.isError).toBe(true);
  expect(JSON.parse(response.content[0].text).code).toBe('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  expect(assertions).toBeGreaterThanOrEqual(2);
  const hit = withheld.data.hits.find((row: any) => row.id === record.id);
  expect(hit).toBeDefined();
  expect(await f.memory.confirmedMemoryDelivery({
    taskId: task.id, workspace: 'agent-core',
    retrievalAttemptId: hit.retrievalEvidence.attemptId,
    memoryId: record.id, contentDigest: hit.retrievalEvidence.contentDigest,
  })).toBe(false);
});
