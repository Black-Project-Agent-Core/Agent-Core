import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionStore, ExecutionStoreError } from '../src/execution/store.js';
import { EXECUTION_NODE_STATES, EXECUTION_RUN_STATES } from '../src/execution/types.js';
import type { ExecutionResultMarker } from '../src/execution/log-store.js';

const roots: string[] = [];
const stores: ExecutionStore[] = [];

async function fixture(label: string) {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `agent-core-execution-store-${label}-`));
  roots.push(root);
  const stateRoot = path.join(root, 'runtime', 'execution', 'state');
  const store = new ExecutionStore();
  stores.push(store);
  await store.open({ stateRoot });
  return { root, stateRoot, store };
}

function node(id: string, cwd: string, dependsOn: string[] = []) {
  return {
    id,
    purpose: `purpose ${id}`,
    command: `Write-Output '${id}'`,
    cwd,
    dependsOn,
    timeoutMs: 30_000,
    expectedArtifacts: [],
  };
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map(async (store) => {
    try { await store.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('file-native principal/project-scoped execution store', () => {
  it('rejects mismatched and late attempt markers without changing the current attempt or historical process truth', async () => {
    const f = await fixture('attempt-identity');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const run = await f.store.createRun(scope, { objective: 'identity', maxConcurrency: 1 });
    await f.store.persistGraph(scope, run.runId, [node('A', f.root)]);
    const paths = { directory: f.root, stdoutPath: 'o.log', stderrPath: 'e.log', resultPath: 'r.json' };
    await f.store.createAttempt(scope, run.runId, 'A', 'first', 1, paths);
    const marker: ExecutionResultMarker = { version: 1, runId: run.runId, nodeId: 'A', attemptId: 'first', attemptNo: 1,
      state: 'failed', exitCode: 1, signal: null, startedAt: 1, finishedAt: 2,
      stdoutBytes: 0, stderrBytes: 0, stdoutSha256: '0'.repeat(64), stderrSha256: '0'.repeat(64) };
    await expect(f.store.completeAttempt(scope, { ...marker, attemptId: 'fabricated' })).rejects.toMatchObject({ code: 'EXECUTION_RESULT_IDENTITY_MISMATCH' });
    await f.store.completeAttempt(scope, marker);
    await f.store.resetNodeForRetry(scope, run.runId, 'A');
    await f.store.createAttempt(scope, run.runId, 'A', 'second', 2, paths);
    await expect(f.store.completeAttempt(scope, { ...marker, state: 'succeeded' })).rejects.toMatchObject({ code: 'EXECUTION_RESULT_IDENTITY_MISMATCH' });
    await f.store.markAttemptInterrupted(scope, run.runId, 'A', 'first', 'late recovery');
    await f.store.failAttemptStart(scope, run.runId, 'A', 'first', new Error('late failure'));
    expect(await f.store.getNode(scope, run.runId, 'A')).toMatchObject({ state: 'running', attemptCount: 2 });
    expect((await f.store.listAttempts(scope, run.runId, 'A')).map(attempt => attempt.state)).toEqual(['failed', 'running']);
  });

  it('reads legacy node fields without rewriting the historical node file', async () => {
    const f = await fixture('legacy-reader');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const run = await f.store.createRun(scope, { objective: 'history', maxConcurrency: 1 });
    await f.store.persistGraph(scope, run.runId, [node('A', f.root)]);
    const file = path.join(f.stateRoot, 'state', 'runs', run.runId, 'nodes', 'A.json');
    const legacy = { ...JSON.parse(await readFile(file, 'utf8')), continueOnFailure: true };
    const historical = JSON.stringify(legacy);
    await writeFile(file, historical);
    expect(await f.store.getNode(scope, run.runId, 'A')).not.toHaveProperty('continueOnFailure');
    expect(await readFile(file, 'utf8')).toBe(historical);
  });
  it('exposes exact run/node state vocabularies', () => {
    expect(EXECUTION_RUN_STATES).toEqual(['planned', 'running', 'completed', 'failed', 'blocked', 'interrupted', 'cancelled']);
    expect(EXECUTION_NODE_STATES).toEqual(['queued', 'ready', 'running', 'succeeded', 'failed', 'blocked', 'interrupted', 'cancelled']);
  });

  it('creates and reopens durable planned runs with bounded metadata', async () => {
    const f = await fixture('durable');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const created = await f.store.createRun(scope, {
      objective: ' Build persistent multi-command execution ',
      continuityTaskId: 'continuity-task-a',
      originRouteContextId: 'route-a',
      maxConcurrency: 4,
      metadata: { source: 'task9', nested: { deterministic: true } },
    });
    expect(created.runId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.state).toBe('planned');

    expect(await f.store.getRun(scope, created.runId)).toMatchObject({
      runId: created.runId,
      principalId: 'principal-a',
      projectId: 'project-a',
      continuityTaskId: 'continuity-task-a',
      originRouteContextId: 'route-a',
      state: 'planned',
      objective: 'Build persistent multi-command execution',
      maxConcurrency: 4,
      lastEventSequence: 0,
      metadata: { source: 'task9', nested: { deterministic: true } },
    });

    const stateRoot = (await f.store.status()).stateRoot;
    await f.store.close();
    stores.splice(stores.indexOf(f.store), 1);
    const reopened = new ExecutionStore();
    stores.push(reopened);
    await reopened.open({ stateRoot });
    expect((await reopened.getRun(scope, created.runId))?.runId).toBe(created.runId);
  });

  it('materialises run, node, attempt and event files that stay readable as plain JSON', async () => {
    const f = await fixture('layout');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const run = await f.store.createRun(scope, { objective: 'file-native layout', maxConcurrency: 2 });
    await f.store.persistGraph(scope, run.runId, [node('A', f.root)]);
    await f.store.createAttempt(scope, run.runId, 'A', 'attempt-a-1', 1, {
      directory: f.root, stdoutPath: 'a.stdout.log', stderrPath: 'a.stderr.log', resultPath: 'a.result.json',
    });
    await f.store.appendEvent(scope, run.runId, 'node.started', { nodeId: 'A', attemptId: 'attempt-a-1' });

    const runBody = JSON.parse(await readFile(path.join(f.stateRoot, 'state', 'runs', run.runId, 'run.json'), 'utf8'));
    expect(runBody).toMatchObject({ runId: run.runId, state: 'planned', lastEventSequence: 1 });
    const nodeBody = JSON.parse(await readFile(path.join(f.stateRoot, 'state', 'runs', run.runId, 'nodes', 'A.json'), 'utf8'));
    expect(nodeBody).toMatchObject({ nodeId: 'A', state: 'running', attemptCount: 1 });
    const attemptBody = JSON.parse(await readFile(path.join(f.stateRoot, 'state', 'runs', run.runId, 'attempts', 'A', '001.json'), 'utf8'));
    expect(attemptBody).toMatchObject({ attemptId: 'attempt-a-1', attemptNo: 1, state: 'running' });

    const eventLines = (await readFile(path.join(f.stateRoot, 'events', `${run.runId}.jsonl`), 'utf8')).trim().split('\n');
    expect(eventLines).toHaveLength(1);
    expect(JSON.parse(eventLines[0]!)).toMatchObject({
      runId: run.runId,
      sequence: 1,
      globalSequence: expect.any(Number),
      eventType: 'node.started',
      nodeId: 'A',
      payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('hides run existence across principals and projects and lists only the authenticated scope', async () => {
    const f = await fixture('scope');
    const scopeA = { principalId: 'principal-a', projectId: 'project-a' };
    const scopeOtherPrincipal = { principalId: 'principal-b', projectId: 'project-a' };
    const scopeOtherProject = { principalId: 'principal-a', projectId: 'project-b' };
    const first = await f.store.createRun(scopeA, { objective: 'First run', maxConcurrency: 2 });
    const second = await f.store.createRun(scopeA, { objective: 'Second run', maxConcurrency: 3 });
    await f.store.createRun(scopeOtherPrincipal, { objective: 'Other principal run', maxConcurrency: 1 });
    await f.store.createRun(scopeOtherProject, { objective: 'Other project run', maxConcurrency: 1 });

    expect(await f.store.getRun(scopeOtherPrincipal, first.runId)).toBeNull();
    expect(await f.store.getRun(scopeOtherProject, first.runId)).toBeNull();
    await expect(f.store.getNodes(scopeOtherPrincipal, first.runId))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_RUN_NOT_FOUND' }));
    const own = await f.store.listRuns(scopeA, 10);
    expect(own.map((run) => run.runId).sort()).toEqual([first.runId, second.runId].sort());
    expect(own.every((run) => run.principalId === scopeA.principalId && run.projectId === scopeA.projectId)).toBe(true);
  });

  it('orders per-run event sequences monotonically and keeps the global sequence strictly increasing across runs', async () => {
    const f = await fixture('sequence');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const first = await f.store.createRun(scope, { objective: 'first', maxConcurrency: 1 });
    const second = await f.store.createRun(scope, { objective: 'second', maxConcurrency: 1 });
    const emitted = [
      await f.store.appendEvent(scope, first.runId, 'run.created'),
      await f.store.appendEvent(scope, second.runId, 'run.created'),
      await f.store.appendEvent(scope, first.runId, 'run.started'),
    ];
    expect(emitted.map((event) => event.sequence)).toEqual([1, 1, 2]);
    expect((await f.store.getRun(scope, first.runId))?.lastEventSequence).toBe(2);

    const globals: number[] = [];
    for (const runId of [first.runId, second.runId]) {
      for (const line of (await readFile(path.join(f.stateRoot, 'events', `${runId}.jsonl`), 'utf8')).trim().split('\n')) {
        globals.push(JSON.parse(line).globalSequence as number);
      }
    }
    expect(new Set(globals).size).toBe(globals.length);
    expect([...globals].sort((left, right) => left - right)).toEqual([1, 2, 3]);

    expect((await f.store.getEvents(scope, first.runId, 0)).map((event) => event.eventType)).toEqual(['run.created', 'run.started']);
    expect((await f.store.getEvents(scope, first.runId, 1)).map((event) => event.sequence)).toEqual([2]);
    expect(await f.store.getEvents(scope, first.runId, 0, { eventTypes: ['run.started'] })).toHaveLength(1);
  });

  it('enforces attempt sequencing, retry eligibility and run extensibility', async () => {
    const f = await fixture('transitions');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const run = await f.store.createRun(scope, { objective: 'transitions', maxConcurrency: 1 });
    await f.store.persistGraph(scope, run.runId, [node('A', f.root)]);
    const paths = { directory: f.root, stdoutPath: 'o.log', stderrPath: 'e.log', resultPath: 'r.json' };

    await expect(f.store.createAttempt(scope, run.runId, 'A', 'attempt-2', 2, paths))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_ATTEMPT_SEQUENCE_INVALID' }));
    await f.store.createAttempt(scope, run.runId, 'A', 'attempt-1', 1, paths);
    await expect(f.store.resetNodeForRetry(scope, run.runId, 'A'))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_RETRY_NOT_ALLOWED' }));

    await f.store.setNodeState(scope, run.runId, 'A', 'failed', { message: 'boom' });
    expect((await f.store.getNode(scope, run.runId, 'A'))?.lastError).toEqual({ message: 'boom' });
    await f.store.resetNodeForRetry(scope, run.runId, 'A');
    const retried = await f.store.getNode(scope, run.runId, 'A');
    expect(retried).toMatchObject({ state: 'queued', attemptCount: 1 });
    expect(retried?.lastError).toBeUndefined();
    expect((await f.store.getRun(scope, run.runId))?.state).toBe('running');

    await f.store.setRunState(scope, run.runId, 'completed');
    await expect(f.store.appendGraphNodes(scope, run.runId, [node('B', f.root)]))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_RUN_NOT_EXTENSIBLE' }));
    const finished = await f.store.getRun(scope, run.runId);
    expect(finished?.finishedAt).toBeGreaterThan(0);
  });

  it('deduplicates artifact metadata and looks it up by hash, type and run within the owning scope only', async () => {
    const f = await fixture('artifacts');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const other = { principalId: 'principal-b', projectId: 'project-a' };
    const run = await f.store.createRun(scope, { objective: 'artifacts', maxConcurrency: 1 });
    await f.store.persistGraph(scope, run.runId, [node('A', f.root)]);
    const hash = 'a'.repeat(64);
    const entry = { path: path.join(f.root, 'out.bin'), artifactType: 'build' as const, sha256: hash, size: 3 };

    expect(await f.store.recordArtifacts(scope, run.runId, 'A', 1, 'r.json', [entry])).toHaveLength(1);
    expect(await f.store.recordArtifacts(scope, run.runId, 'A', 1, 'r.json', [entry])).toHaveLength(0);
    expect(await f.store.listArtifacts(scope, { sha256: hash })).toHaveLength(1);
    expect(await f.store.listArtifacts(scope, { artifactType: 'build' })).toHaveLength(1);
    expect(await f.store.listArtifacts(scope, { runId: run.runId, nodeId: 'A', attemptNo: 1 })).toHaveLength(1);
    expect(await f.store.listArtifacts(other, { sha256: hash })).toEqual([]);
    expect(await f.store.listArtifacts(scope, { terminalRunsOnly: true })).toEqual([]);

    await f.store.setRunState(scope, run.runId, 'completed');
    expect(await f.store.listArtifacts(scope, { terminalRunsOnly: true })).toHaveLength(1);
  });

  it('keeps the memory sync queue idempotent per sync key and scoped to the owning principal', async () => {
    const f = await fixture('sync');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const other = { principalId: 'principal-b', projectId: 'project-a' };
    const run = await f.store.createRun(scope, { objective: 'sync', maxConcurrency: 1 });

    await f.store.enqueueMemorySync(scope, run.runId, 1, 'sync-key-a', { fact: 'first' });
    await f.store.enqueueMemorySync(scope, run.runId, 2, 'sync-key-a', { fact: 'second' });
    const queued = await f.store.listMemorySyncQueue(scope, 10);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ syncKey: 'sync-key-a', state: 'queued', attempts: 0, payload: { fact: 'first' } });
    expect(await f.store.countMemorySyncQueue(other)).toBe(0);

    await f.store.markMemorySyncState(scope, queued[0]!.queueId, 'failed', 'downstream unavailable');
    expect((await f.store.listMemorySyncQueue(scope, 10))[0]).toMatchObject({ state: 'failed', attempts: 1, lastError: 'downstream unavailable' });
    await f.store.markMemorySyncState(scope, queued[0]!.queueId, 'synced');
    expect(await f.store.countMemorySyncQueue(scope)).toBe(0);
    expect(await f.store.systemCounts()).toMatchObject({ activeRuns: 1, queuedSync: 0 });
  });

  it('rejects invalid scope, empty objectives, invalid concurrency, and oversized list limits before persistence', async () => {
    const f = await fixture('validation');
    await expect(f.store.createRun({ principalId: '', projectId: 'project-a' }, { objective: 'invalid', maxConcurrency: 1 }))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_SCOPE_REQUIRED' }));
    await expect(f.store.createRun({ principalId: 'principal-a', projectId: 'project-a' }, { objective: '   ', maxConcurrency: 1 }))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_OBJECTIVE_REQUIRED' }));
    await expect(f.store.createRun({ principalId: 'principal-a', projectId: 'project-a' }, { objective: 'bad concurrency', maxConcurrency: 0 }))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_CONCURRENCY_INVALID' }));
    await expect(f.store.listRuns({ principalId: 'principal-a', projectId: 'project-a' }, 1001))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_LIMIT_INVALID' }));
    await expect(f.store.createRun({ principalId: 'principal-a' }, { objective: 'too big', maxConcurrency: 1, metadata: { blob: 'x'.repeat(20_001) } }))
      .rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({ code: 'EXECUTION_METADATA_TOO_LARGE' }));
  });
});
