import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), captureFailure: vi.fn(),
} }));
import { ExternalControllerLearningService, type ExternalInvocationContext } from '../src/learning/external-controller.js';
import * as verifier from '../src/memory/workflow-verifier.js';
import { MemoryService } from '../src/memory/service.js';
import { registerControllerLearningTools } from '../src/mcp/controller-learning-tools.js';
import { installInvocationContext } from '../src/mcp/external-controller-tool-support.js';
import * as stateFiles from '../src/persistence/state-file.js';

const roots: string[] = [];
const session = 'batch16-transport', owner = 'batch16-owner', workspace = 'batch16-fixture';
const scopeError = 'EXTERNAL_EPISODE_VERIFICATION_SCOPE_UNAVAILABLE';
const staleError = 'EXTERNAL_EPISODE_VERIFICATION_STALE_TASK';
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function captureWithoutDeadlineRace(service: ExternalControllerLearningService,
  input: Parameters<ExternalControllerLearningService['captureToolInvocationContext']>[0]) {
  // Authority checks use real state; filesystem scheduling is outside this contract test.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try { return await ExternalControllerLearningService.prototype.captureToolInvocationContext.call(service, input); }
  finally { vi.useRealTimers(); }
}

async function fixture() {
  const base = path.resolve('runtime/tmp'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'batch16-verification-')); roots.push(root);
  const repo = path.join(root, 'repo'); await mkdir(repo);
  const memory = await MemoryService.initialize(root);
  await memory.registerWorkspaceAliases([{ name: workspace, repos: [{ path: repo }] }]);
  const stateDir = path.join(root, 'learning');
  const service = await ExternalControllerLearningService.initialize({ stateDir, memory, learning: {} as any });
  vi.spyOn(service, 'captureToolInvocationContext').mockImplementation(input => captureWithoutDeadlineRace(service, input));
  const start = (taskKey: string) => service.startEpisode(session, { taskKey, workspace }, {
    ownerId: owner, workspaceIdentityKey: memory.registeredWorkspaceIdentity(workspace).key,
  });
  const task = await start('A');
  const capture = (sessionId = session, ownerId = owner) => service.captureToolInvocationContext({
    invocationId: randomUUID(), processSessionId: 'batch16-process', sessionId, ownerId,
  });
  const context = await capture(); expect(context.binding).toBe('bound');
  const statePath = path.join(stateDir, 'external-controller.json');
  const snapshot = async () => ({
    current: await readFile(statePath, 'utf8'), previous: await readFile(statePath + '.last-good', 'utf8'),
  });
  const digest = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
  const casePath = path.join(root, 'case.json'), answerPath = path.join(root, 'answer.json');
  const fact = { key: 'scope', value: 'exact-task', source: 'fixture' };
  const caseText = JSON.stringify({ domain: 'research', facts: [fact] });
  const answerText = JSON.stringify([{ ...fact, contradictions: [] }]);
  await writeFile(casePath, caseText); await writeFile(answerPath, answerText);
  const reportPath = path.join(root, 'report.json');
  const report = JSON.stringify({ verifierRevision: verifier.WORKFLOW_VERIFIER_REVISION, taskId: task.id,
    case: { path: casePath, digest: digest(caseText) }, answer: { path: answerPath, digest: digest(answerText) } });
  await writeFile(reportPath, report);
  verifier.registerWorkflowVerification({ taskId: task.id, case: { path: casePath, digest: digest(caseText) }, answerPath });
  const input = { outcome: 'verified' as const, verificationRef: 'verification:' + reportPath + '#' + digest(report) };
  const failedReport = async () => {
    const wrongAnswer = JSON.stringify([{ ...fact, value: 'wrong-task', contradictions: [] }]);
    await writeFile(answerPath, wrongAnswer);
    const failed = JSON.stringify({ ...JSON.parse(report), answer: { path: answerPath, digest: digest(wrongAnswer) } });
    await writeFile(reportPath, failed);
    return 'verification:' + reportPath + '#' + digest(failed);
  };
  const close = async () => {
    await service.verifyEpisode(session, input, context);
    await service.recordLearningCheckpoint(session, workspace, 'close-A', task.id);
    await service.recordLearningReview(session, 'no-new-knowledge', { 'close-A': { complete: true, status: 'no-new-knowledge' } });
    expect((await service.getEpisode(session))?.closedAt).toBeTruthy();
  };
  return { root, memory, service, start, task, capture, context, statePath, snapshot, input, close, failedReport };
}

function pauseVerifier() {
  let entered!: () => void, resume!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
  const resumePromise = new Promise<void>(resolve => { resume = resolve; });
  const original = verifier.recheckWorkflowReport;
  const spy = vi.spyOn(verifier, 'recheckWorkflowReport').mockImplementationOnce(async (...args) => {
    entered(); await resumePromise;
    return original(...args);
  });
  return { entered: enteredPromise, resume, spy };
}

function controller(f: Awaited<ReturnType<typeof fixture>>) {
  let callback!: (args: unknown, context: unknown) => Promise<any>;
  const server = { registerTool(_name: string, _metadata: unknown, handler: typeof callback) { callback = handler; } };
  installInvocationContext(server as any, { external: f.service, sessionId: session, ownerId: owner, checkpointGranted: false });
  registerControllerLearningTools(server as any, f.service, session, {
    ownerId: owner, workspaceIdentity: value => f.memory.registeredWorkspaceIdentity(value), browserAllowed: false,
  });
  return () => callback({ action: 'episode', episodeOperation: 'verify', episodeOutcome: 'verified',
    verificationRef: f.input.verificationRef, workspace }, {});
}

describe('Batch16 exact-task episode verification', () => {
  it.each(['missing', 'copied', 'foreign-service', 'unbound', 'foreign-owner', 'wrong-session'] as const)(
    'refuses %s invocation authority before verifier I/O or state writes', async kind => {
      const f = await fixture();
      let context: ExternalInvocationContext | undefined = f.context;
      if (kind === 'missing') context = undefined;
      if (kind === 'copied') context = { ...f.context };
      if (kind === 'unbound') context = await f.capture('unknown-session');
      if (kind === 'foreign-owner') context = await f.capture(session, 'foreign-owner');
      if (kind === 'foreign-service') {
        const other = await ExternalControllerLearningService.initialize({
          stateDir: path.dirname(f.statePath), memory: f.memory, learning: {} as any,
        });
        context = await captureWithoutDeadlineRace(other, { invocationId: randomUUID(),
          processSessionId: 'other-process', sessionId: session, ownerId: owner });
        expect(context.binding).toBe('bound');
      }
      const before = await f.snapshot();
      const recheck = vi.spyOn(verifier, 'recheckWorkflowReport'), writes = vi.spyOn(stateFiles, 'writeStateFile');
      await expect(f.service.verifyEpisode(kind === 'wrong-session' ? 'wrong-session' : session, f.input, context)).rejects.toThrow(scopeError);
      expect(recheck).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
      expect(await f.snapshot()).toEqual(before);
    },
  );

  it('passes the host-captured task to the canonical verifier through the MCP wrapper', async () => {
    const f = await fixture(), invoke = controller(f);
    const recheck = vi.spyOn(verifier, 'recheckWorkflowReport');
    const result = await invoke();
    expect(result.isError).not.toBe(true);
    expect(recheck).toHaveBeenCalledExactlyOnceWith(f.input.verificationRef, f.task.id);
    const stored = await f.service.getEpisode(session);
    expect(stored).toMatchObject({ id: f.task.id, verificationStatus: 'pass', terminalOutcome: 'verified',
      meaningful: true, pendingLearning: true, metrics: { verifications: 1 } });
    expect(stored?.events.filter(item => item.kind === 'verification')).toHaveLength(1);
  });

  it('rejects captured task A when the MCP callback starts with current head B', async () => {
    const f = await fixture(), invoke = controller(f);
    let rotated!: Awaited<ReturnType<typeof f.snapshot>>;
    vi.spyOn(f.service, 'captureToolInvocationContext').mockImplementationOnce(async input => {
      const captured = await captureWithoutDeadlineRace(f.service, input);
      expect(captured.taskId).toBe(f.task.id);
      await f.start('B'); rotated = await f.snapshot();
      return captured;
    });
    const recheck = vi.spyOn(verifier, 'recheckWorkflowReport');
    const result = await invoke();
    expect(result.isError).toBe(true); expect(result.content[0].text).toContain(staleError);
    expect(recheck).not.toHaveBeenCalled(); expect(await f.snapshot()).toEqual(rotated);
  });

  it('refuses A to B rotation during verifier await without verification writes to either episode', async () => {
    const f = await fixture(), gate = pauseVerifier();
    const pending = f.service.verifyEpisode(session, f.input, f.context);
    await gate.entered;
    await f.start('B');
    const before = await f.snapshot(), writes = vi.spyOn(stateFiles, 'writeStateFile');
    gate.resume();
    await expect(pending).rejects.toThrow(staleError);
    expect(gate.spy).toHaveBeenCalledExactlyOnceWith(f.input.verificationRef, f.task.id);
    expect(writes).not.toHaveBeenCalled(); expect(await f.snapshot()).toEqual(before);
    const state = JSON.parse(before.current);
    expect(state.episodes.every((item: any) => item.metrics.verifications === 0 && !item.terminalOutcome
      && !item.events.some((event: any) => event.kind === 'verification'))).toBe(true);
  });

  it('returns the same closed captured task unchanged without starting verifier I/O', async () => {
    const f = await fixture(); await f.close();
    const closed = await f.service.getEpisode(session), before = await f.snapshot();
    const recheck = vi.spyOn(verifier, 'recheckWorkflowReport'), writes = vi.spyOn(stateFiles, 'writeStateFile');
    expect(await f.service.verifyEpisode(session, f.input, f.context)).toEqual(closed);
    expect(recheck).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
    expect(await f.snapshot()).toEqual(before);
  });

  it('preserves the same captured task closed by its owner during verifier await', async () => {
    const f = await fixture(), gate = pauseVerifier();
    const pending = f.service.verifyEpisode(session, f.input, f.context);
    await gate.entered;
    await f.close();
    const closed = await f.service.getEpisode(session), before = JSON.parse((await f.snapshot()).current);
    gate.resume();
    expect(await pending).toEqual(closed);
    expect(JSON.parse((await f.snapshot()).current)).toEqual(before);
    expect((await f.service.getEpisode(session))?.events.filter(item => item.kind === 'verification')).toHaveLength(1);
  });

  it.each(['missing-binding', 'owner', 'workspace-binding', 'workspace-name', 'non-explicit', 'missing-row', 'registry'] as const)(
    'refuses %s invalidation during verifier await without verification state writes', async kind => {
      const f = await fixture(), gate = pauseVerifier();
      const pending = f.service.verifyEpisode(session, f.input, f.context);
      await gate.entered;
      if (kind === 'registry') await f.memory.registerWorkspaceAliases([]);
      else {
        const state = JSON.parse(await readFile(f.statePath, 'utf8'));
        const episode = state.episodes.find((item: any) => item.id === f.task.id);
        if (kind === 'missing-binding') delete episode.memoryBinding;
        if (kind === 'owner') episode.memoryBinding.ownerId = 'other-owner';
        if (kind === 'workspace-binding') episode.memoryBinding.workspaceIdentityKey = 'other-workspace';
        if (kind === 'workspace-name') episode.workspace = 'agent-core';
        if (kind === 'non-explicit') episode.boundary = 'inferred';
        if (kind === 'missing-row') state.episodes = [];
        await writeFile(f.statePath, JSON.stringify(state));
      }
      const before = await f.snapshot(), writes = vi.spyOn(stateFiles, 'writeStateFile');
      gate.resume();
      await expect(pending).rejects.toThrow(kind === 'registry' ? 'MEMORY_CONTROLLER_SCOPE_UNAVAILABLE' : scopeError);
      expect(writes).not.toHaveBeenCalled(); expect(await f.snapshot()).toEqual(before);
    },
  );

  it('preserves degraded state and refuses verification before I/O or replacement writes', async () => {
    const f = await fixture(); await writeFile(f.statePath, '{broken');
    const before = await f.snapshot();
    const recheck = vi.spyOn(verifier, 'recheckWorkflowReport'), writes = vi.spyOn(stateFiles, 'writeStateFile');
    await expect(f.service.verifyEpisode(session, f.input, f.context)).rejects.toThrow('EXTERNAL_CONTROLLER_STATE_DEGRADED_WRITE_REFUSED');
    expect(recheck).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
    expect(await f.snapshot()).toEqual(before);
  });

  it('keeps unavailable verification separate from a caller-declared verified outcome', async () => {
    const f = await fixture();
    const result = await f.service.verifyEpisode(session, { ...f.input, verificationRef: 'verification:no-registered-oracle' }, f.context);
    expect(result).toMatchObject({ terminalOutcome: 'verified', verificationStatus: 'unavailable', metrics: { verifications: 0 } });
    expect((await f.service.getEpisode(session))?.verificationStatus).toBe('unavailable');
  });

  it('records a real oracle failure without crediting the caller-declared verified outcome', async () => {
    const f = await fixture(), verificationRef = await f.failedReport();
    const recheck = vi.spyOn(verifier, 'recheckWorkflowReport');
    const result = await f.service.verifyEpisode(session, { ...f.input, verificationRef }, f.context);
    expect(recheck).toHaveBeenCalledExactlyOnceWith(verificationRef, f.task.id);
    expect(result).toMatchObject({ id: f.task.id, terminalOutcome: 'verified', verificationStatus: 'fail', metrics: { verifications: 0 } });
    const stored = await f.service.getEpisode(session);
    expect(stored?.verificationStatus).toBe('fail');
    expect(stored?.events.filter(item => item.kind === 'verification')).toEqual([
      expect.objectContaining({ evidenceRefs: [verificationRef], outcome: 'verified' }),
    ]);
  });
});
