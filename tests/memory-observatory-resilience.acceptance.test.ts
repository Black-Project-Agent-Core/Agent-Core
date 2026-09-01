import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { replayAuditRecords } from '../src/observability/audit-stream.js';

type Tracked = { child: ChildProcess; stderr: string; stdout: string };
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('NO_PORT'));
      server.close(() => resolve(address.port));
    });
  });
}

function spawnTracked(entry: string, env: NodeJS.ProcessEnv, cwd: string): Tracked {
  const child = spawn(process.execPath, [entry], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const tracked: Tracked = { child, stdout: '', stderr: '' };
  child.stdout?.on('data', (chunk) => { tracked.stdout = `${tracked.stdout}${chunk}`.slice(-8000); });
  child.stderr?.on('data', (chunk) => { tracked.stderr = `${tracked.stderr}${chunk}`.slice(-8000); });
  return tracked;
}

async function stop(tracked: Tracked | undefined) {
  if (!tracked || tracked.child.exitCode !== null || tracked.child.signalCode !== null) return;
  tracked.child.kill('SIGTERM');
  if (!await Promise.race([once(tracked.child, 'exit').then(() => true), sleep(3000).then(() => false)])) {
    tracked.child.kill('SIGKILL');
    await Promise.race([once(tracked.child, 'exit').catch(() => undefined), sleep(1000)]);
  }
}

async function requestAgentShutdown(tracked: Tracked | undefined, requestPath: string) {
  if (!tracked || tracked.child.exitCode !== null || tracked.child.signalCode !== null) return;
  await mkdir(path.dirname(requestPath), { recursive: true });
  await writeFile(requestPath, `${Date.now()}\n`, { encoding: 'utf8' });
  const exited = await Promise.race([
    once(tracked.child, 'exit').then(() => true),
    sleep(5000).then(() => false),
  ]);
  if (!exited) {
    throw new Error(`AGENT_SHUTDOWN_REQUEST_TIMEOUT:${tracked.stderr}`);
  }
}

async function waitJson(url: string, predicate: (value: any) => boolean, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const value = await response.json();
        if (predicate(value)) return value;
        last = JSON.stringify(value);
      } else last = `HTTP_${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await sleep(80);
  }
  throw new Error(`WAIT_TIMEOUT ${url} ${last}`);
}

function cleanEnv(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|API_KEY|ENCRYPTION_KEY)/i.test(key)) delete env[key];
  }
  return { ...env, ...overrides };
}

function authoritative(snapshot: any) {
  return {
    schemaVersion: snapshot.schemaVersion,
    project: snapshot.project,
    status: snapshot.status,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    conflicts: snapshot.conflicts,
    timeline: snapshot.timeline,
    continuity: snapshot.continuity,
    truncated: snapshot.truncated,
  };
}

async function postShared(agentPort: number, workspaceRoot: string, action: string, input: Record<string, unknown>) {
  const response = await fetch(`http://127.0.0.1:${agentPort}/internal/codespace-memory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, workspaceRoot, ...input }),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error(`SHARED_${action}_FAILED:${response.status}:${JSON.stringify(body)}`);
  return body.result;
}

async function checkpointDecision(agentPort: number, workspaceRoot: string, key: string, value: string) {
  const opened = await postShared(agentPort, workspaceRoot, 'open_context', {
    task: `resilience ${key}`,
    context: `persist ${value}`,
    continuity: { objective: `resilience ${key}` },
  });
  const checkpoint = await postShared(agentPort, workspaceRoot, 'checkpoint', {
    routeContextId: opened.routeContextId,
    memoryContextId: opened.memoryContextId,
    continuityTaskId: opened.continuityTaskId,
    continuityTurnId: opened.continuityTurnId,
    status: 'completed',
    summary: `completed ${key}`,
    evidence: [{ type: 'test', ref: key, result: 'verified' }],
    decisions: [{ key, value, reason: 'resilience acceptance evidence' }],
    projectTerminal: true,
  });
  expect(checkpoint.taskStatus).toBe('completed');
  expect(checkpoint.memoryLifecycle.postflightState).toBe('CLOSED');
  return { opened, checkpoint };
}

async function readSseReplay(url: string, lastEventId: number, expected: number) {
  const controller = new AbortController();
  const response = await fetch(url, {
    headers: { 'Last-Event-ID': String(lastEventId) },
    signal: controller.signal,
  });
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const records: Array<{ id: number; event: string; data: any }> = [];
  const deadline = Date.now() + 5000;
  try {
    while (records.length < expected && Date.now() < deadline) {
      const next = await Promise.race([
        reader.read(),
        sleep(500).then(() => ({ done: false, value: new Uint8Array() })),
      ]);
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      let split;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const lines = frame.split('\n');
        const id = Number(lines.find((line) => line.startsWith('id: '))?.slice(4));
        const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '';
        const raw = lines.find((line) => line.startsWith('data: '))?.slice(6);
        if (event === 'activity' && Number.isSafeInteger(id) && raw) records.push({ id, event, data: JSON.parse(raw) });
      }
    }
  } finally {
    controller.abort();
    await reader.cancel().catch(() => undefined);
  }
  return records;
}

describe('Memory Observatory resilience', () => {
  it('survives sidecar loss, exact SSE reconnect, audit rotation/retention gap, and Agent Core restart', async () => {
    const repoRoot = process.cwd();
    const root = await mkdtemp(path.join(os.tmpdir(), 'memory-observatory-resilience-'));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const workspaceRoot = path.join(root, 'workspace');
    const stateRoot = path.join(root, 'state');
    const logRoot = path.join(stateRoot, 'logs');
    await mkdir(workspaceRoot, { recursive: true });
    const agentPort = await freePort();
    const sidecarPort = await freePort();
    const agentEntry = path.join(repoRoot, 'dist', 'index.js');
    const sidecarEntry = path.join(repoRoot, 'SubProject', 'Memory-Observatory', 'server-dist', 'server.js');

    const agentEnv = (retention: boolean, shutdownRequestPath: string) => cleanEnv({
      AGENT_CORE_HOST: '127.0.0.1',
      AGENT_CORE_PORT: String(agentPort),
      AGENT_CORE_SHUTDOWN_REQUEST_PATH: shutdownRequestPath,
      AGENT_CORE_DATA_DIR: path.join(stateRoot, 'data'),
      AGENT_CORE_LOG_DIR: logRoot,
      AGENT_CORE_CAPABILITY_DIR: path.join(repoRoot, 'capabilities'),
      AGENT_CORE_ALLOWED_ROOTS: workspaceRoot,
      AGENT_CORE_MEMORY_ENABLED: 'true',
      AGENT_CORE_MEMORY_PRINCIPAL_ID: 'resilience-principal',
      AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'advisory',
      AGENT_CORE_MEMORY_DB_PATH: path.join(stateRoot, 'memory.sqlite'),
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false',
      AGENT_CORE_MEMORY_OBSERVATORY_ENABLED: 'true',
      AGENT_CORE_MEMORY_OBSERVATORY_MODE: 'shadow',
      AGENT_CORE_EXECUTION_ENABLED: 'false',
      AGENT_CORE_GITHUB_ENABLED: 'false',
      AGENT_CORE_MAINTENANCE_ENABLED: 'false',
      AGENT_CORE_AUDIT_MAX_FILE_BYTES: '512',
      AGENT_CORE_AUDIT_MAX_ROTATED_FILES: retention ? '1' : '32',
      AGENT_CORE_AUDIT_RETENTION_MS: retention ? '1' : String(30 * 24 * 60 * 60 * 1000),
    });
    const sidecarEnv = cleanEnv({
      MEMORY_OBSERVATORY_HOST: '127.0.0.1',
      MEMORY_OBSERVATORY_PORT: String(sidecarPort),
      MEMORY_OBSERVATORY_AGENT_CORE_URL: `http://127.0.0.1:${agentPort}`,
      MEMORY_OBSERVATORY_WORKSPACE_ROOT: workspaceRoot,
    });

    let agentGeneration = 1;
    let agentShutdownPath = path.join(stateRoot, `shutdown-${agentGeneration}.request`);
    let agent = spawnTracked(agentEntry, agentEnv(false, agentShutdownPath), repoRoot);
    cleanup.push(() => requestAgentShutdown(agent, agentShutdownPath));
    await waitJson(`http://127.0.0.1:${agentPort}/health`, (value) => value.status === 'ok' && value.memory?.healthy === true);
    let sidecar = spawnTracked(sidecarEntry, sidecarEnv, path.join(repoRoot, 'SubProject', 'Memory-Observatory'));
    cleanup.push(() => stop(sidecar));
    await waitJson(`http://127.0.0.1:${sidecarPort}/api/health`, (value) => value.status === 'ok');

    await checkpointDecision(agentPort, workspaceRoot, 'resilience.a1', 'A1 before sidecar loss');
    const beforeCrash = await waitJson(`http://127.0.0.1:${sidecarPort}/api/snapshot`, (value) => value.nodes?.length > 0);

    await stop(sidecar);
    await expect(fetch(`http://127.0.0.1:${sidecarPort}/api/health`)).rejects.toThrow();
    await checkpointDecision(agentPort, workspaceRoot, 'resilience.a2', 'A2 while sidecar is down');
    const liveWhileObserverDown = await waitJson(`http://127.0.0.1:${agentPort}/health`, (value) => value.status === 'ok' && value.memory?.healthy === true);
    expect(liveWhileObserverDown.memory.healthy).toBe(true);
    const backendWhileDown = await waitJson(`http://127.0.0.1:${agentPort}/internal/memory-observatory/snapshot`, (value) => value.nodes?.length > beforeCrash.nodes.length);

    sidecar = spawnTracked(sidecarEntry, sidecarEnv, path.join(repoRoot, 'SubProject', 'Memory-Observatory'));
    try {
      await waitJson(`http://127.0.0.1:${sidecarPort}/api/health`, (value) => value.status === 'ok');
    } catch (error) {
      throw new Error(`SIDECAR_RESTART_FAILED:${error instanceof Error ? error.message : String(error)}:exit=${sidecar.child.exitCode}:signal=${sidecar.child.signalCode}:stderr=${sidecar.stderr}`);
    }
    const afterSidecarRestart = await waitJson(`http://127.0.0.1:${sidecarPort}/api/snapshot`, (value) => value.nodes?.length === backendWhileDown.nodes.length);
    expect(authoritative(afterSidecarRestart)).toEqual(authoritative(backendWhileDown));

    const auditRoot = path.join(logRoot, 'audit');
    let baseline = await replayAuditRecords(auditRoot, { afterSequence: 0, limit: 2000 });
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) throw new Error('BASELINE_REPLAY_FAILED');
    const disconnectSequence = baseline.latestSequence;

    for (let index = 0; index < 10; index += 1) {
      const response = await fetch(`http://127.0.0.1:${agentPort}/health`);
      expect(response.status).toBe(200);
    }
    let expectedReplay = await replayAuditRecords(auditRoot, { afterSequence: disconnectSequence, limit: 2000 });
    for (let attempt = 0; attempt < 50 && (!expectedReplay.ok || expectedReplay.records.length < 10); attempt += 1) {
      await sleep(50);
      expectedReplay = await replayAuditRecords(auditRoot, { afterSequence: disconnectSequence, limit: 2000 });
    }
    expect(expectedReplay.ok).toBe(true);
    if (!expectedReplay.ok) throw new Error('EXPECTED_REPLAY_FAILED');
    expect(expectedReplay.records.length).toBeGreaterThanOrEqual(10);
    const streamed = await readSseReplay(`http://127.0.0.1:${sidecarPort}/api/stream`, disconnectSequence, expectedReplay.records.length);
    expect(streamed.map((item) => item.id)).toEqual(expectedReplay.records.map((record) => record.sequence));
    expect(streamed.map((item) => item.data.event)).toEqual(expectedReplay.records.map((record) => record.event));
    expect(new Set(streamed.map((item) => item.id)).size).toBe(streamed.length);

    const rotatedBeforeRestart = (await readdir(auditRoot)).filter((name) => /^audit\.\d+-\d+\..+\.jsonl$/.test(name));
    expect(rotatedBeforeRestart.length).toBeGreaterThan(0);
    const beforeAgentRestart = await fetchJsonSnapshot(sidecarPort);

    await requestAgentShutdown(agent, agentShutdownPath);
    agentGeneration += 1;
    agentShutdownPath = path.join(stateRoot, `shutdown-${agentGeneration}.request`);
    agent = spawnTracked(agentEntry, agentEnv(true, agentShutdownPath), repoRoot);
    await waitJson(`http://127.0.0.1:${agentPort}/health`, (value) => value.status === 'ok' && value.memory?.healthy === true);
    const afterAgentRestart = await waitJson(`http://127.0.0.1:${sidecarPort}/api/snapshot`, (value) => value.nodes?.length === beforeAgentRestart.nodes.length);
    expect(authoritative(afterAgentRestart)).toEqual(authoritative(beforeAgentRestart));

    for (let index = 0; index < 20; index += 1) {
      await fetch(`http://127.0.0.1:${agentPort}/health`);
      await sleep(3);
    }
    let anchor = { sequence: 0 };
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { anchor = JSON.parse(await readFile(path.join(auditRoot, 'audit-anchor.json'), 'utf8')); } catch {}
      if (anchor.sequence > 0) break;
      await sleep(50);
    }
    expect(anchor.sequence).toBeGreaterThan(0);
    const gapResponse = await fetch(`http://127.0.0.1:${sidecarPort}/api/activity?after=0&limit=250`);
    expect(gapResponse.status).toBe(409);
    const gap = await gapResponse.json();
    expect(gap.error).toBe('AUDIT_HISTORY_GAP');
    expect(gap.requiresSnapshotResync).toBe(true);
    const graphAfterGap = await fetchJsonSnapshot(sidecarPort);
    expect(graphAfterGap.nodes.length).toBe(afterAgentRestart.nodes.length);
  }, 90_000);
});

async function fetchJsonSnapshot(sidecarPort: number) {
  const response = await fetch(`http://127.0.0.1:${sidecarPort}/api/snapshot`);
  expect(response.status).toBe(200);
  return response.json();
}
