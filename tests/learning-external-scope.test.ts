import path from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
import { memoryTaskFixture } from './memory/memory-task-test-utils.js';
import { installInvocationContext } from '../src/mcp/external-controller-tool-support.js';
import { registerLearningTools } from '../src/mcp/learning-tools.js';
import { registerControllerLearningTools } from '../src/mcp/controller-learning-tools.js';
import { createMemoryScopeResolver } from '../src/memory/mcp/scope.js';
import { currentExternalInvocationContext } from '../src/tracker/tool-invocation.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(ownerId = 'owner-a', startTask = true, transport = 'transport', bootstrap = false) {
  const f = await memoryTaskFixture(); roots.push(f.root);
  const task = startTask ? await f.start('owner-a', 'transport', 'scope-regression') : undefined;
  if (bootstrap) await f.external.touchSession(transport);
  const handlers = new Map<string, (args: any, ctx: any) => Promise<any>>();
  const server = { registerTool(name: string, _config: unknown, callback: any) { handlers.set(name, callback); } };
  installInvocationContext(server as any, { external: f.external, sessionId: transport, ownerId, checkpointGranted: false });
  const resolver = vi.fn(createMemoryScopeResolver({ memoryOwner: ownerId, externalControllerLearning: f.external }));
  registerLearningTools(server as any, f.learning, undefined, f.external, transport, resolver, false, true);
  server.registerTool('read_file', {}, async () => currentExternalInvocationContext());
  const invoke = (args: any, signal?: AbortSignal) => handlers.get('learning')!(args, { mcpReq: { signal } });
  const checkpoint = { action: 'checkpoint', taskId: task?.id, workspace: 'agent-core',
    idempotencyKey: 'scope-regression', reason: 'task-complete', evidenceRefs: ['source:scope-regression-fixture'] };
  const review = { action: 'review', taskId: task?.id, workspace: 'agent-core',
    checkpointKeys: ['scope-regression'], disposition: 'no-new-knowledge', candidates: [] };
  const receipt = { action: 'receipt', taskId: task?.id, workspace: 'agent-core', useId: 'scope-use',
    retrievalAttemptId: 'scope-retrieval', memoryId: 'scope-memory', contentDigest: 'sha256:' + 'a'.repeat(64),
    applicability: 'applied', result: 'unavailable', reasonCode: 'scope-regression' };
  const delayCapture = () => {
    const original = (f.external as any).load.bind(f.external);
    return vi.spyOn(f.external as any, 'load').mockImplementationOnce(async (...args: any[]) => {
      await new Promise(resolve => setTimeout(resolve, 180));
      return original(...args);
    });
  };
  const learningBytes = () => readFile(path.join(f.root, 'learning/state.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  return { ...f, task, handlers, resolver, invoke, checkpoint, review, receipt, delayCapture, learningBytes };
}

describe('external Learning task admission', () => {
  it.each(['checkpoint', 'review', 'receipt'] as const)('admits %s after a state read slower than the observer allowance', async action => {
    const f = await fixture();
    if (action === 'review') expect((await f.invoke(f.checkpoint)).isError).not.toBe(true);
    const receipt = vi.spyOn(f.learning, 'receipt').mockResolvedValue({ admitted: true } as any);
    f.delayCapture();
    const result = await f.invoke(f[action]);
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    if (action === 'checkpoint') expect((await f.learning.status()).pendingReviewCount).toBe(1);
    if (action === 'review') expect((await f.learning.status()).pendingReviewCount).toBe(0);
    if (action === 'receipt') expect(receipt).toHaveBeenCalledOnce();
  });

  it('keeps ordinary tool observation bounded', async () => {
    const f = await fixture(); const delayed = f.delayCapture();
    expect(await f.handlers.get('read_file')!({}, {})).toMatchObject({ binding: 'unbound', unboundReason: 'observer-unavailable' });
    await delayed.mock.results[0].value;
  });

  it.each([false, true])('reconnects only the exact owned open task after transport rotation (bootstrap=%s)', async bootstrap => {
    const f = await fixture('owner-a', true, 'new-hour', bootstrap);
    const before = await f.external.getEpisode('transport');
    const result = await f.invoke(f.checkpoint);
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect((await f.external.getEpisode('new-hour'))?.id).toBe(f.task!.id);
    expect((await f.external.getEpisode('transport'))?.id).toBe(before!.id);
    expect((await f.learning.status()).pendingReviewCount).toBe(1);
    const state = JSON.parse(await readFile(path.join(f.root, 'external/external-controller.json'), 'utf8'));
    if (bootstrap) expect(state.episodes.some((item: any) => item.id === 'new-hour' && item.boundary === 'inferred')).toBe(true);
  });

  it.each(['foreign-owner', 'closed', 'wrong-workspace', 'conflicting-head', 'stale-head'])('does not reconnect %s', async mode => {
    const f = await fixture(mode === 'foreign-owner' ? 'owner-b' : 'owner-a', true, 'new-hour', true);
    if (mode === 'conflicting-head') await f.start('owner-a', 'new-hour', 'another-task');
    const file = path.join(f.root, 'external/external-controller.json');
    if (mode === 'closed' || mode === 'stale-head') {
      const state = JSON.parse(await readFile(file, 'utf8'));
      if (mode === 'closed') state.episodes.find((item: any) => item.id === f.task!.id).closedAt = new Date().toISOString();
      else state.sessionHeads['new-hour'] = 'missing-task';
      await writeFile(file, JSON.stringify(state));
    }
    const before = await readFile(file, 'utf8'); const write = vi.spyOn(f.learning, 'checkpoint');
    const result = await f.invoke({ ...f.checkpoint, ...(mode === 'wrong-workspace' ? { workspace: 'foreign-workspace' } : {}) });
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it.each(['cancelled', 'missing-key', 'blank-key', 'invalid-review', 'blank-review-key', 'invalid-receipt'])('does not change the head for %s reconnect', async mode => {
    const f = await fixture('owner-a', true, 'new-hour', true);
    const file = path.join(f.root, 'external/external-controller.json');
    const before = await readFile(file, 'utf8'); const abort = new AbortController();
    if (mode === 'cancelled') abort.abort();
    const input = mode === 'missing-key' ? { ...f.checkpoint, idempotencyKey: undefined }
      : mode === 'blank-key' ? { ...f.checkpoint, idempotencyKey: ' ' }
        : mode === 'invalid-review' ? { ...f.review, checkpointKeys: undefined }
          : mode === 'blank-review-key' ? { ...f.review, checkpointKeys: [' '] }
            : mode === 'invalid-receipt' ? { ...f.receipt, contentDigest: 'invalid' } : f.checkpoint;
    await f.invoke(input, abort.signal).catch(() => undefined);
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it.each(['rotated', 'cancelled'])('rechecks reconnect admission after its initial read is %s', async mode => {
    const f = await fixture('owner-a', true, 'new-hour', true);
    const original = (f.external as any).load.bind(f.external);
    let entered!: () => void, resume!: () => void;
    const paused = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    vi.spyOn(f.external as any, 'load').mockImplementationOnce(async (...args: any[]) => {
      const snapshot = await original(...args); entered(); await gate; return snapshot;
    });
    const abort = new AbortController(); const pending = f.invoke(f.checkpoint, abort.signal);
    await paused;
    try {
      if (mode === 'rotated') await f.start('owner-a', 'new-hour', 'replacement');
      else abort.abort();
      const file = path.join(f.root, 'external/external-controller.json');
      const before = await readFile(file, 'utf8'); resume();
      expect((await pending).isError).toBe(true);
      expect(await readFile(file, 'utf8')).toBe(before);
      expect((await f.learning.status()).pendingReviewCount).toBe(0);
    } finally { resume(); }
  });

  it.each(['foreign-owner', 'no-task', 'cancelled', 'wrong-task', 'wrong-workspace'])('refuses %s without a Learning write', async mode => {
    const f = await fixture(mode === 'foreign-owner' ? 'owner-b' : 'owner-a', mode !== 'no-task');
    const before = await f.learningBytes(); const write = vi.spyOn(f.learning, 'checkpoint');
    const abort = new AbortController(); if (mode === 'cancelled') abort.abort();
    f.delayCapture();
    const result = await f.invoke({ ...f.checkpoint,
      ...(mode === 'wrong-task' ? { taskId: 'foreign-task' } : {}),
      ...(mode === 'wrong-workspace' ? { workspace: 'foreign-workspace' } : {}),
    }, abort.signal);
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(await f.learningBytes()).toBe(before);
  });

  it.each(['rotated', 'cancelled'])('refuses a task %s while resolving scope', async mode => {
    const f = await fixture(); const abort = new AbortController();
    const original = f.resolver.getMockImplementation()!;
    f.resolver.mockImplementationOnce(async selector => {
      const scope = await original(selector);
      if (mode === 'rotated') await f.start('owner-a', 'transport', 'replacement');
      else abort.abort();
      return scope;
    });
    const before = await f.learningBytes(); const write = vi.spyOn(f.learning, 'checkpoint');
    const result = await f.invoke(f.checkpoint, abort.signal);
    expect(result.isError).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(await f.learningBytes()).toBe(before);
  });
});

describe('external episode-start diagnostics', () => {
  async function controller(ownerId = 'owner-a') {
    const f = await fixture();
    let invoke!: (input: any, context: any) => Promise<any>;
    const server = { registerTool(_name: string, _metadata: unknown, callback: typeof invoke) { invoke = callback; } };
    registerControllerLearningTools(server as any, f.external, 'transport', {
      ownerId, browserAllowed: false,
      workspaceIdentity: workspace => f.memory.registeredWorkspaceIdentity(workspace),
    });
    return { ...f, startEpisode: vi.spyOn(f.external, 'startEpisode'),
      invoke: (input: any) => invoke(input, {}),
      input: { action: 'episode', episodeOperation: 'start', taskKey: 'new-task', workspace: 'agent-core', description: 'Diagnose the exact task scope.' } };
  }

  it.each([
    ['missing-workspace', { workspace: undefined }, 'workspace-required'],
    ['blank-workspace', { workspace: ' ' }, 'workspace-required'],
    ['missing-task-key', { taskKey: undefined }, 'task-key-required'],
    ['blank-task-key', { taskKey: ' ' }, 'task-key-required'],
    ['unregistered-workspace', { workspace: 'not-registered' }, 'workspace-unregistered-or-unavailable'],
    ['missing-owner', {}, 'owner-unavailable'],
  ])('explains %s before mutating task state', async (kind, patch, reason) => {
    const f = await controller(kind === 'missing-owner' ? '' : 'owner-a');
    const file = path.join(f.root, 'external/external-controller.json');
    const before = await readFile(file, 'utf8');
    const result = await f.invoke({ ...f.input, ...(patch as object) });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE: ' + reason);
    expect(result.content[0].text).toContain('stable taskKey and registered workspace');
    expect(f.startEpisode).not.toHaveBeenCalled();
    expect(await readFile(file, 'utf8')).toBe(before);
    expect((await f.external.getEpisode('transport'))?.id).toBe(f.task!.id);
  });

  it('starts a valid request with the host-owned workspace identity', async () => {
    const f = await controller();
    const result = await f.invoke(f.input);
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    const episode = JSON.parse(result.content[0].text);
    expect(episode).toMatchObject({ taskKey: 'new-task', workspace: 'agent-core',
      memoryBinding: { ownerId: 'owner-a', workspaceIdentityKey: 'agent-core' }, memoryTask: { status: 'linked' } });
    expect((await f.external.getEpisode('transport'))?.id).toBe(episode.id);
  });
});
