import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createExecutionRecoveryBundle } from '../src/execution/backup.js';
import { ExecutionStore, type ExecutionStoreError } from '../src/execution/store.js';
import { EXECUTION_STATE_VERSION } from '../src/execution/types.js';

const roots: string[] = [];
const stores: ExecutionStore[] = [];
const scope = { principalId: 'principal-layout', projectId: 'project-layout' };

async function fixture(label: string) {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `agent-core-execution-layout-${label}-`));
  roots.push(root);
  const stateRoot = path.join(root, 'runtime', 'execution', 'state');
  const store = new ExecutionStore();
  stores.push(store);
  const opened = await store.open({ stateRoot });
  return { root, stateRoot, store, opened };
}

async function reopen(stateRoot: string) {
  const store = new ExecutionStore();
  stores.push(store);
  return { store, opened: await store.open({ stateRoot }) };
}

function node(id: string, cwd: string) {
  return {
    id,
    purpose: `purpose ${id}`,
    command: `Write-Output '${id}'`,
    cwd,
    dependsOn: [],
    timeoutMs: 30_000,
    continueOnFailure: false,
    expectedArtifacts: [],
  };
}

async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  const info = await stat(root).catch(() => null);
  if (!info) return out;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await walk(absolute));
    else out.push(absolute);
  }
  return out;
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('file-native execution state layout and crash recovery', () => {
  it('lays out the deterministic state root and stamps the layout version', async () => {
    const f = await fixture('skeleton');
    expect(f.opened).toMatchObject({ stateRoot: f.stateRoot, stateVersion: EXECUTION_STATE_VERSION, journalsRecovered: 0, runsRepaired: [] });
    for (const directory of ['state/runs', 'state/sync', 'events', 'artifacts', 'leases', 'checkpoints', 'journal', 'index']) {
      expect((await stat(path.join(f.stateRoot, ...directory.split('/')))).isDirectory()).toBe(true);
    }
    expect(JSON.parse(await readFile(path.join(f.stateRoot, 'state.json'), 'utf8'))).toMatchObject({ stateVersion: EXECUTION_STATE_VERSION });
    expect((await f.store.status())).toMatchObject({ healthy: true, integrity: 'ok', stateRoot: f.stateRoot });
  });

  it('refuses to open a state root written by a newer runtime instead of silently downgrading it', async () => {
    const f = await fixture('newer');
    await f.store.close();
    stores.splice(stores.indexOf(f.store), 1);
    await writeFile(path.join(f.stateRoot, 'state.json'), `${JSON.stringify({ stateVersion: EXECUTION_STATE_VERSION + 1 })}\n`, 'utf8');
    await expect(reopen(f.stateRoot)).rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({
      code: 'EXECUTION_STATE_VERSION_UNSUPPORTED',
    }));
  });

  it('replays an interrupted transaction journal on open and then clears it', async () => {
    const f = await fixture('journal');
    const run = await f.store.createRun(scope, { objective: 'journal replay', maxConcurrency: 1 });
    await f.store.close();
    stores.splice(stores.indexOf(f.store), 1);

    const pendingNode = path.join(f.stateRoot, 'state', 'runs', run.runId, 'nodes', 'z.json');
    const journalPath = path.join(f.stateRoot, 'journal', `${randomUUID()}.json`);
    await writeFile(journalPath, `${JSON.stringify({
      id: 'pending',
      createdAt: Date.now(),
      writes: [{
        path: pendingNode,
        content: `${JSON.stringify({
          runId: run.runId, nodeId: 'Z', purpose: 'recovered', command: 'noop', cwd: f.root, state: 'queued',
          timeoutMs: 1_000, continueOnFailure: false, expectedArtifacts: [], attemptCount: 0, dependsOn: [],
          createdAt: Date.now(), updatedAt: Date.now(),
        })}\n`,
      }],
      appends: [{ path: path.join(f.stateRoot, 'events', `${run.runId}.jsonl`), line: JSON.stringify({ runId: run.runId, sequence: 1, globalSequence: 1, eventType: 'run.created', payload: {}, payloadHash: '0'.repeat(64), createdAt: Date.now() }), guardSequence: 1 }],
    })}\n`, 'utf8');

    const reopened = await reopen(f.stateRoot);
    expect(reopened.opened.journalsRecovered).toBe(1);
    expect((await readdir(path.join(f.stateRoot, 'journal'))).filter((name) => name.endsWith('.json'))).toEqual([]);
    expect((await reopened.store.getNodes(scope, run.runId)).map((item) => item.nodeId)).toEqual(['Z']);
    // The replayed append is guarded, so replaying it twice must not duplicate the event.
    const again = await reopen(f.stateRoot);
    expect(await again.store.getEvents(scope, run.runId, 0)).toHaveLength(1);
  });

  it('heals a materialised run that fell behind its own append-only event log', async () => {
    const f = await fixture('heal');
    const run = await f.store.createRun(scope, { objective: 'heal', maxConcurrency: 1 });
    await f.store.appendEvent(scope, run.runId, 'run.created');
    await f.store.appendEvent(scope, run.runId, 'run.started');
    await f.store.close();
    stores.splice(stores.indexOf(f.store), 1);

    const runPath = path.join(f.stateRoot, 'state', 'runs', run.runId, 'run.json');
    const stale = JSON.parse(await readFile(runPath, 'utf8')) as Record<string, unknown>;
    await writeFile(runPath, `${JSON.stringify({ ...stale, lastEventSequence: 0 }, null, 2)}\n`, 'utf8');

    const reopened = await reopen(f.stateRoot);
    expect(reopened.opened.runsRepaired).toEqual([run.runId]);
    expect((await reopened.store.getRun(scope, run.runId))?.lastEventSequence).toBe(2);
  });

  it('rebuilds a lost run manifest from the durable run bodies', async () => {
    const f = await fixture('manifest');
    const run = await f.store.createRun(scope, { objective: 'manifest rebuild', maxConcurrency: 1 });
    await f.store.close();
    stores.splice(stores.indexOf(f.store), 1);
    await rm(path.join(f.stateRoot, 'index', 'runs.jsonl'), { force: true });

    const reopened = await reopen(f.stateRoot);
    expect((await reopened.store.listRuns(scope, 10)).map((item) => item.runId)).toEqual([run.runId]);
  });

  it('surfaces a typed corruption code instead of silently dropping a damaged event log', async () => {
    const f = await fixture('corrupt');
    const run = await f.store.createRun(scope, { objective: 'corrupt log', maxConcurrency: 1 });
    await f.store.appendEvent(scope, run.runId, 'run.created');
    const eventsPath = path.join(f.stateRoot, 'events', `${run.runId}.jsonl`);
    const body = await readFile(eventsPath, 'utf8');
    await writeFile(eventsPath, `{ this is not json\n${body}`, 'utf8');
    await expect(f.store.getEvents(scope, run.runId, 0)).rejects.toEqual(expect.objectContaining<Partial<ExecutionStoreError>>({
      code: 'EXECUTION_STATE_CORRUPT',
    }));
  });

  it('reclaims an owner-token lock whose holder is gone rather than blocking forever', async () => {
    const f = await fixture('lock');
    const run = await f.store.createRun(scope, { objective: 'stale lock', maxConcurrency: 1 });
    const lockPath = path.join(f.stateRoot, 'journal', 'locks', `run-${run.runId}.lock`);
    await mkdir(path.dirname(lockPath), { recursive: true });
    await writeFile(lockPath, JSON.stringify({ pid: 0x7ffffff, token: randomUUID(), acquiredAt: Date.now() }), 'utf8');

    await f.store.persistGraph(scope, run.runId, [node('A', f.root)]);
    expect((await f.store.getNodes(scope, run.runId)).map((item) => item.nodeId)).toEqual(['A']);
    await expect(stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps execution state and recovery bundles in the file-native layout', async () => {
    const f = await fixture('file-layout');
    const logRoot = path.join(f.root, 'runtime', 'execution', 'runs');
    await mkdir(logRoot, { recursive: true });
    const run = await f.store.createRun(scope, { objective: 'verify file-native storage', maxConcurrency: 1 });
    await f.store.persistGraph(scope, run.runId, [node('A', f.root)]);
    await f.store.createAttempt(scope, run.runId, 'A', 'attempt-1', 1, {
      directory: logRoot, stdoutPath: 'o.log', stderrPath: 'e.log', resultPath: 'r.json',
    });
    await f.store.appendEvent(scope, run.runId, 'node.started', { nodeId: 'A', attemptId: 'attempt-1' });
    await f.store.recordArtifacts(scope, run.runId, 'A', 1, 'r.json', [{ path: path.join(f.root, 'out.bin'), artifactType: 'build', sha256: 'b'.repeat(64) }]);
    await f.store.enqueueMemorySync(scope, run.runId, 1, 'sync-key', { fact: 'x' });
    await f.store.setRunState(scope, run.runId, 'completed');
    await f.store.close();
    stores.splice(stores.indexOf(f.store), 1);

    await createExecutionRecoveryBundle({
      stateRoot: f.stateRoot,
      logRoot,
      destinationRoot: path.join(f.root, 'bundles'),
      sourceVersion: '0.0.0-test',
    });

    const files = await walk(f.root);
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((file) => /\.(json|jsonl|log)$/.test(file))).toBe(true);
  });
});
