import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ExecutionLogStore, type ExecutionResultMarker } from '../src/execution/log-store.js';
import type { ExecutionRunHandle } from '../src/execution/runner.js';
import { ExecutionCommandRunner } from '../src/execution/runner.js';
import { ExecutionService, type ExecutionServiceDependencies, type ExecutionWorkflowGuardRequest } from '../src/execution/service.js';
import type { ExecutionRunnerLike } from '../src/execution/scheduler.js';
import type { ValidatedExecutionNode } from '../src/execution/dag.js';
import type { ExecutionScope } from '../src/execution/types.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { retryMarkerCommand, nodeShellCommand } from './helpers/platform-command.js';

const roots: string[] = [];

async function fixture(label: string, runner?: ExecutionRunnerLike, maxConcurrency = 4, dependencies: ExecutionServiceDependencies = {}) {
  const base = process.env.TEMP || process.env.TMP || os.tmpdir();
  const root = await mkdtemp(path.join(base, `agent-core-execution-scheduler-${label}-`));
  roots.push(root);
  const work = path.join(root, 'work');
  await mkdir(work, { recursive: true });
  const baseConfig = loadConfig({}, root).execution;
  const config = {
    ...baseConfig,
    enabled: true,
    logRoot: path.join(root, 'runtime', 'execution', 'runs'),
    maxConcurrency,
  };
  const workspace = new WorkspacePolicy([root]);
  const service = new ExecutionService(config, workspace, { ...dependencies, ...(runner ? { runner } : {}) });
  await service.open();
  return { root, work, config, workspace, service, scope: { principalId: 'principal-a', projectId: root } satisfies ExecutionScope };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function marker(runId: string, nodeId: string, attemptId: string, attemptNo: number, state: ExecutionResultMarker['state']): ExecutionResultMarker {
  const now = Date.now();
  return {
    version: 1,
    runId,
    nodeId,
    attemptId,
    attemptNo,
    state,
    startedAt: now - 1,
    finishedAt: now,
    exitCode: state === 'succeeded' ? 0 : 9,
    signal: null,
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutSha256: '0'.repeat(64),
    stderrSha256: '0'.repeat(64),
  };
}

class ControlledRunner implements ExecutionRunnerLike {
  readonly starts: Array<{ runId: string; node: ValidatedExecutionNode; attemptId: string; attemptNo: number }> = [];
  private pending = new Map<string, { resolve(value: ExecutionResultMarker): void; reject(error: Error): void }>();

  async start(runId: string, node: ValidatedExecutionNode, attemptId: string, attemptNo: number): Promise<ExecutionRunHandle> {
    this.starts.push({ runId, node, attemptId, attemptNo });
    let resolve!: (value: ExecutionResultMarker) => void;
    let reject!: (error: Error) => void;
    const completion = new Promise<ExecutionResultMarker>((res, rej) => { resolve = res; reject = rej; });
    this.pending.set(`${runId}/${node.id}/${attemptNo}`, { resolve, reject });
    return {
      pid: 10_000 + this.starts.length,
      completion,
      terminate: (state = 'cancelled') => resolve(marker(runId, node.id, attemptId, attemptNo, state)),
    };
  }

  complete(runId: string, nodeId: string, attemptNo: number, state: ExecutionResultMarker['state']) {
    const key = `${runId}/${nodeId}/${attemptNo}`;
    const pending = this.pending.get(key);
    if (!pending) throw new Error(`No pending runner handle: ${key}`);
    const started = this.starts.find((item) => item.runId === runId && item.node.id === nodeId && item.attemptNo === attemptNo)!;
    pending.resolve(marker(runId, nodeId, started.attemptId, attemptNo, state));
    this.pending.delete(key);
  }

  startedNodeIds(): string[] {
    return this.starts.map((item) => item.node.id);
  }
}

async function eventually(assertion: () => void | Promise<void>, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try { await assertion(); return; }
    catch (error) { lastError = error; await new Promise((resolve) => setImmediate(resolve)); }
  }
  throw lastError;
}

describe('concurrent dependency-aware execution scheduler', () => {
  it('reconciles a persisted workflow callback after restart without repeating a successful source edit', async () => {
    let callbackCalls = 0, callbackAvailable = false;
    const phases: string[] = [];
    const dependencies: ExecutionServiceDependencies = {
      workflowGuard: async request => {
        phases.push(request.operation);
        if (request.operation === 'reconcile' && request.originRouteContextId !== 'fresh-route') throw new Error('fresh route required');
        return { planRevision: '1', planHash: 'a'.repeat(64), requiredStepIds: ['edit'] };
      },
      workflowAfterAttempt: async () => { callbackCalls++; if (!callbackAvailable) throw new Error('workflow store unavailable'); },
    };
    const f = await fixture('pending-workflow', undefined, 1, dependencies);
    const source = path.join(f.work, 'source.txt'), count = path.join(f.work, 'process-count.txt');
    await writeFile(source, 'before');
    let reopened: ExecutionService | undefined;
    try {
      const command = nodeShellCommand(`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(source)},'after');const countPath=${JSON.stringify(count)};fs.writeFileSync(countPath,String(fs.existsSync(countPath)?Number(fs.readFileSync(countPath,'utf8'))+1:1));`);
      const run = await f.service.create(f.scope, { objective: 'edit once', originRouteContextId: 'initial-route', nodes: [{ id: 'edit',
        purpose: 'edit source once', command, cwd: f.work, stepIds: ['edit'], inputs: [source],
        resources: { reads: [source], writes: [source, count] }, expectedArtifacts: [{ path: count, hash: 'sha256' }] }] });
      await f.service.start(f.scope, run.runId);
      const pending = await f.service.wait(f.scope, run.runId, run.lastEventSequence, { eventTypes: ['run.blocked'] }, 5000);
      expect(pending.state.nodes[0]).toMatchObject({ state: 'succeeded', attemptCount: 1 });
      expect(pending.state.metadata.workflowPendingAttempts).toHaveLength(1);
      expect(callbackCalls).toBe(1);
      await f.service.close();
      reopened = new ExecutionService(f.config, f.workspace, dependencies); await reopened.open();
      callbackAvailable = true;
      await expect(reopened.start(f.scope, run.runId, { originRouteContextId: 'expired-route' })).rejects.toThrow('fresh route required');
      await writeFile(source, 'external edit');
      await expect(reopened.start(f.scope, run.runId, { originRouteContextId: 'fresh-route' })).rejects.toMatchObject({ code: 'EXECUTION_WORKFLOW_EVIDENCE_STALE' });
      expect(callbackCalls).toBe(1);
      await writeFile(source, 'after');
      const completed = await reopened.start(f.scope, run.runId, { originRouteContextId: 'fresh-route' });
      expect(completed.state).toBe('completed');
      expect(completed.metadata.workflowPendingAttempts).toBeUndefined();
      await reopened.start(f.scope, run.runId, { originRouteContextId: 'fresh-route' });
      expect(callbackCalls).toBe(2);
      expect(await readFile(count, 'utf8')).toBe('1');
      expect(await reopened.store.listAttempts(f.scope, run.runId)).toHaveLength(1);
      expect(phases).toContain('reconcile');
      expect(reopened.scheduler.resourceClaims.size).toBe(0);
    } finally { await reopened?.close(); await f.service.close(); }
  }, 15_000);
  it('rechecks workflow before queued dispatch, preserves current route identity and retries a guarded node without an old spawn', async () => {
    const runner = new ControlledRunner();
    const calls: ExecutionWorkflowGuardRequest[] = [];
    let denied = false;
    const f = await fixture('workflow-dispatch', runner, 1, { workflowGuard: async request => {
      calls.push(request);
      if (denied && request.operation === 'dispatch') throw new Error('source changed before spawn');
      return { planRevision: '1', planHash: 'a'.repeat(64), requiredStepIds: [] };
    } });
    try {
      const run = await f.service.create(f.scope, { objective: 'guard each launch', originRouteContextId: 'old-route', nodes: [
        { id: 'A', purpose: 'A', command: 'Write-Output A', cwd: f.work, inputs: [] },
        { id: 'B', purpose: 'B', command: 'Write-Output B', cwd: f.work, inputs: [] },
      ] });
      await f.service.start(f.scope, run.runId, { originRouteContextId: 'fresh-route' });
      expect(calls.filter(c => c.operation === 'dispatch').map(c => c.originRouteContextId)).toEqual(['fresh-route']);
      denied = true;
      runner.complete(run.runId, 'A', 1, 'succeeded');
      await eventually(async () => expect((await f.service.status(f.scope, run.runId))?.state).toBe('blocked'));
      expect(runner.startedNodeIds()).toEqual(['A']);
      expect(await f.service.store.listAttempts(f.scope, run.runId, 'B')).toEqual([]);
      denied = false;
      await f.service.retry(f.scope, run.runId, 'B', { originRouteContextId: 'recovered-route' });
      expect(runner.startedNodeIds()).toEqual(['A', 'B']);
      expect(calls.at(-1)?.originRouteContextId).toBe('recovered-route');
      await f.service.cancel(f.scope, run.runId);
    } finally { await f.service.close(); }
  });

  it('holds filesystem claims against execution across principals and wakes the queued run on release', async () => {
    const runner = new ControlledRunner();
    const f = await fixture('workspace-claims', runner);
    try {
      const release = await f.service.acquireWorkspaceClaim({ principalId: 'other', projectId: f.root }, { writes: [f.work] });
      await expect(f.service.acquireWorkspaceClaim(f.scope, { reads: [f.work] })).rejects.toMatchObject({ code: 'EXECUTION_RESOURCE_BUSY' });
      const run = await f.service.create(f.scope, { objective: 'wait for edit', nodes: [{ id: 'A', purpose: 'A', command: 'Write-Output A', cwd: f.work }] });
      await f.service.start(f.scope, run.runId);
      expect(runner.starts).toHaveLength(0);
      await release(); await release();
      await eventually(() => expect(runner.starts).toHaveLength(1));
      await f.service.cancel(f.scope, run.runId);
      expect(f.service.scheduler.resourceClaims.size).toBe(0);
    } finally { await f.service.close(); }
  });

  it('coordinates nested projects independently while keeping parent and relative workspace claims consistent', async () => {
    const runner = new ControlledRunner();
    const f = await fixture('nested-claims', runner);
    const sibling = path.join(f.root, 'sibling');
    await mkdir(sibling);
    const scopeA = { ...f.scope, projectId: f.work };
    const scopeB = { principalId: 'principal-b', projectId: sibling };
    try {
      const runA = await f.service.create(scopeA, { objective: 'nested A', nodes: [{ id: 'A', purpose: 'A', command: 'Write-Output A', cwd: f.work, inputs: [] }] });
      const runB = await f.service.create(scopeB, { objective: 'nested B', nodes: [{ id: 'B', purpose: 'B', command: 'Write-Output B', cwd: sibling, inputs: [] }] });
      await f.service.start(scopeA, runA.runId);
      await f.service.start(scopeB, runB.runId);
      expect(runner.startedNodeIds()).toEqual(['A', 'B']);
      await expect(f.service.acquireWorkspaceClaim(scopeA, { writes: ['inside-a.txt'] }))
        .rejects.toMatchObject({ code: 'EXECUTION_RESOURCE_BUSY' });
      await expect(f.service.acquireWorkspaceClaim(f.scope, { writes: [f.root] }))
        .rejects.toMatchObject({ code: 'EXECUTION_RESOURCE_BUSY' });
      const releaseParentManifest = await f.service.acquireWorkspaceClaim(f.scope, { writes: ['package.json'] });
      await releaseParentManifest();
      await f.service.cancel(scopeA, runA.runId);
      await f.service.cancel(scopeB, runB.runId);
      expect(f.service.scheduler.resourceClaims.size).toBe(0);
    } finally { await f.service.close(); }
  });

  it('retains nested project scope through native execution evidence and later status verification', async () => {
    const f = await fixture('nested-evidence');
    const scope = { ...f.scope, projectId: f.work };
    try {
      const created = await f.service.create(scope, { objective: 'nested evidence', nodes: [{ id: 'A', purpose: 'check fixture',
        command: nodeShellCommand('process.stdout.write("verified")'), cwd: f.work, inputs: [] }] });
      await f.service.start(scope, created.runId);
      await f.service.wait(scope, created.runId, created.lastEventSequence, { eventTypes: ['run.completed'] }, 5000);
      let current = await f.service.status(scope, created.runId);
      expect(current?.state).toBe('completed');
      expect(current?.evidence.nodes[0]?.applicability).toBe('current');
      const result = await f.service.logs.readResult(created.runId, 'A', 1);
      expect(result?.provenance?.inputPaths).toContain(path.join(f.work, 'package.json'));
      expect(result?.provenance?.inputPaths).not.toContain(path.join(f.root, 'package.json'));
      await writeFile(path.join(f.root, 'package.json'), '{"name":"parent-changed"}');
      current = await f.service.status(scope, created.runId);
      expect(current?.evidence.nodes[0]?.applicability).toBe('current');
      await writeFile(path.join(f.work, 'package.json'), '{"name":"fixture-changed"}');
      current = await f.service.status(scope, created.runId);
      expect(current?.evidence.nodes[0]?.applicability).toBe('inputs_changed');
    } finally { await f.service.close(); }
  }, 15_000);

  it('launches independent A/B concurrently and starts C after A succeeds while B is still running; D waits for A+B', async () => {
    const runner = new ControlledRunner();
    const f = await fixture('unlock', runner, 4);
    try {
      const created = await f.service.create(f.scope, {
        objective: 'A/B/C/D dependency fixture',
        nodes: [
          { id: 'D', purpose: 'D', command: "Write-Output 'D'", cwd: f.work, resources: { reads: [f.work] }, dependsOn: ['A', 'B'] },
          { id: 'C', purpose: 'C', command: "Write-Output 'C'", cwd: f.work, resources: { reads: [f.work] }, dependsOn: ['A'] },
          { id: 'B', purpose: 'B', command: "Write-Output 'B'", cwd: f.work, resources: { reads: [f.work] } },
          { id: 'A', purpose: 'A', command: "Write-Output 'A'", cwd: f.work, resources: { reads: [f.work] } },
        ],
      });
      expect(created.state).toBe('planned');
      expect(created.nodes.map((item: any) => item.nodeId)).toEqual(['A', 'B', 'C', 'D']);

      await f.service.start(f.scope, created.runId);
      expect(runner.startedNodeIds()).toEqual(['A', 'B']);
      let status = await f.service.status(f.scope, created.runId);
      expect(status?.nodes.filter((item: any) => item.state === 'running').map((item: any) => item.nodeId).sort()).toEqual(['A', 'B']);

      runner.complete(created.runId, 'A', 1, 'succeeded');
      await eventually(() => expect(runner.startedNodeIds()).toEqual(['A', 'B', 'C']));
      status = await f.service.status(f.scope, created.runId);
      expect(status?.nodes.find((item: any) => item.nodeId === 'B')?.state).toBe('running');
      expect(status?.nodes.find((item: any) => item.nodeId === 'C')?.state).toBe('running');
      expect(status?.nodes.find((item: any) => item.nodeId === 'D')?.state).toBe('queued');

      runner.complete(created.runId, 'C', 1, 'succeeded');
      await new Promise((resolve) => setImmediate(resolve));
      expect(runner.startedNodeIds()).toEqual(['A', 'B', 'C']);

      runner.complete(created.runId, 'B', 1, 'succeeded');
      await eventually(() => expect(runner.startedNodeIds()).toEqual(['A', 'B', 'C', 'D']));
      runner.complete(created.runId, 'D', 1, 'succeeded');
      await eventually(async () => {
        const current = await f.service.status(f.scope, created.runId);
        expect(current?.state).toBe('completed');
      });
    } finally {
      await f.service.close();
    }
  });

  it('keeps unrelated B running after A fails and blocks only hard dependents of A', async () => {
    const runner = new ControlledRunner();
    const f = await fixture('failure', runner, 3);
    try {
      const created = await f.service.create(f.scope, {
        objective: 'failure isolation fixture',
        nodes: [
          { id: 'C', purpose: 'C', command: "Write-Output 'C'", cwd: f.work, resources: { reads: [f.work] }, dependsOn: ['A'] },
          { id: 'B', purpose: 'B', command: "Write-Output 'B'", cwd: f.work, resources: { reads: [f.work] } },
          { id: 'A', purpose: 'A', command: "Write-Output 'A'", cwd: f.work, resources: { reads: [f.work] } },
        ],
      });
      await f.service.start(f.scope, created.runId);
      expect(runner.startedNodeIds()).toEqual(['A', 'B']);

      runner.complete(created.runId, 'A', 1, 'failed');
      await eventually(async () => {
        const status = await f.service.status(f.scope, created.runId);
        expect(status?.nodes.find((item: any) => item.nodeId === 'A')?.state).toBe('failed');
        expect(status?.nodes.find((item: any) => item.nodeId === 'B')?.state).toBe('running');
        expect(status?.nodes.find((item: any) => item.nodeId === 'C')?.state).toBe('blocked');
      });
      expect(runner.startedNodeIds()).toEqual(['A', 'B']);

      runner.complete(created.runId, 'B', 1, 'succeeded');
      await eventually(async () => expect((await f.service.status(f.scope, created.runId))?.state).toBe('failed'));
    } finally {
      await f.service.close();
    }
  });

  it('never exceeds the configured max concurrency and fills newly available slots deterministically', async () => {
    const runner = new ControlledRunner();
    const f = await fixture('bound', runner, 2);
    try {
      const created = await f.service.create(f.scope, {
        objective: 'max concurrency fixture',
        maxConcurrency: 2,
        nodes: ['A', 'B', 'C', 'D'].map((id) => ({ id, purpose: id, command: `Write-Output '${id}'`, cwd: f.work, resources: { reads: [f.work] } })),
      });
      await f.service.start(f.scope, created.runId);
      expect(runner.startedNodeIds()).toEqual(['A', 'B']);

      runner.complete(created.runId, 'A', 1, 'succeeded');
      await eventually(() => expect(runner.startedNodeIds()).toEqual(['A', 'B', 'C']));
      let status = await f.service.status(f.scope, created.runId);
      expect(status?.nodes.filter((item: any) => item.state === 'running')).toHaveLength(2);

      runner.complete(created.runId, 'B', 1, 'succeeded');
      await eventually(() => expect(runner.startedNodeIds()).toEqual(['A', 'B', 'C', 'D']));
      status = await f.service.status(f.scope, created.runId);
      expect(status?.nodes.filter((item: any) => item.state === 'running')).toHaveLength(2);

      runner.complete(created.runId, 'C', 1, 'succeeded');
      runner.complete(created.runId, 'D', 1, 'succeeded');
      await eventually(async () => expect((await f.service.status(f.scope, created.runId))?.state).toBe('completed'));
    } finally {
      await f.service.close();
    }
  });

  it('holds root claims across runs until the first process actually closes and wakes the other run', async () => {
    const runner = new ControlledRunner();
    const f = await fixture('claims', runner, 4);
    try {
      const first = await f.service.create(f.scope, { objective: 'first writer', nodes: [{ id: 'A', purpose: 'write', command: "Write-Output 'A'", cwd: f.work }] });
      const second = await f.service.create(f.scope, { objective: 'second writer', nodes: [{ id: 'B', purpose: 'write', command: "Write-Output 'B'", cwd: f.work }] });
      await f.service.start(f.scope, first.runId);
      await f.service.start(f.scope, second.runId);
      expect(runner.startedNodeIds()).toEqual(['A']);
      runner.complete(first.runId, 'A', 1, 'succeeded');
      await eventually(() => expect(runner.startedNodeIds()).toEqual(['A', 'B']));
      expect(f.service.scheduler.resourceClaims.size).toBe(1);
      await f.service.cancel(f.scope, second.runId);
      expect(f.service.scheduler.resourceClaims.size).toBe(0);
    } finally { await f.service.close(); }
  });

  it('explicit retry creates attempt 2 and preserves factual attempt 1 evidence', async () => {
    const f = await fixture('retry');
    try {
      const markerPath = path.join(f.work, 'retry.marker');
      const command = retryMarkerCommand(markerPath);
      const created = await f.service.create(f.scope, {
        objective: 'explicit retry fixture',
        nodes: [{ id: 'A', purpose: 'A retry', command, cwd: f.work }],
      });
      await f.service.start(f.scope, created.runId);
      await eventually(async () => expect((await f.service.status(f.scope, created.runId))?.nodes[0]?.state).toBe('failed'), 5000);

      const logStore = new ExecutionLogStore(f.config.logRoot);
      const attempt1 = await logStore.readResult(created.runId, 'A', 1);
      expect(attempt1).toMatchObject({ state: 'failed', exitCode: 9, attemptNo: 1 });

      await f.service.retry(f.scope, created.runId, 'A');
      await eventually(async () => expect((await f.service.status(f.scope, created.runId))?.state).toBe('completed'), 5000);
      const attempt2 = await logStore.readResult(created.runId, 'A', 2);
      expect(attempt2).toMatchObject({ state: 'succeeded', exitCode: 0, attemptNo: 2 });
      expect(await logStore.readResult(created.runId, 'A', 1)).toEqual(attempt1);
      expect((await f.service.status(f.scope, created.runId))?.nodes[0]).toMatchObject({ state: 'succeeded', attemptCount: 2 });
    } finally {
      await f.service.close();
    }
  }, 10_000);

  it('binds ownership to principal/project and RuntimeServices exposes the same ExecutionService facade without enabling live rollout', async () => {
    const f = await fixture('scope');
    try {
      const created = await f.service.create(f.scope, {
        objective: 'scope fixture',
        nodes: [{ id: 'A', purpose: 'A', command: "Write-Output 'A'", cwd: f.work }],
      });
      expect(await f.service.status({ principalId: 'other', projectId: f.root }, created.runId)).toBeNull();
      expect(await f.service.status({ principalId: 'principal-a', projectId: `${f.root}-other` }, created.runId)).toBeNull();
    } finally {
      await f.service.close();
    }
  });
});
