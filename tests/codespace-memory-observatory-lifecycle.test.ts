import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const startScript = path.join(repoRoot, 'scripts/codespace/start-memory-observatory.sh');
const verifyScript = path.join(repoRoot, 'scripts/codespace/verify-memory-observatory.sh');
const stateRoots: string[] = [];
const upstreams: Server[] = [];

async function tempStateRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-observatory-lifecycle-'));
  stateRoots.push(root);
  return root;
}

async function startFakeUpstream(): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    if (request.url === '/internal/memory-observatory/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', mode: 'shadow', auditSequence: 17 }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":"not_found"}');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  upstreams.push(server);
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function command(script: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('bash', [script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number | null>((resolve) => child.once('close', resolve));
  return { code, stdout, stderr };
}

async function canConnect(host: string, port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(300, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function listenerAddresses(port: number): Promise<string> {
  const child = spawn('bash', ['-lc', `ss -ltnH 'sport = :${port}'`], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  await new Promise<void>((resolve) => child.once('close', () => resolve()));
  return stdout;
}

async function cleanupLifecycle(root: string): Promise<void> {
  try {
    const pid = Number((await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim());
    if (Number.isSafeInteger(pid) && pid > 1) {
      try { process.kill(pid, 'SIGTERM'); } catch {}
      const deadline = Date.now() + 3_000;
      while (Date.now() < deadline) {
        try { process.kill(pid, 0); await new Promise((resolve) => setTimeout(resolve, 50)); }
        catch { break; }
      }
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  } catch {}
}

afterEach(async () => {
  await Promise.all(stateRoots.splice(0).map(async (root) => {
    await cleanupLifecycle(root);
    await rm(root, { recursive: true, force: true });
  }));
  await Promise.all(upstreams.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('manual Codespace Memory Observatory lifecycle', () => {
  it('starts only on exact loopback, prints only safe READY metadata, and is health-verifiable', async () => {
    const root = await tempStateRoot();
    const upstream = await startFakeUpstream();
    const env = {
      MEMORY_OBSERVATORY_LIFECYCLE_DIR: root,
      MEMORY_OBSERVATORY_AGENT_CORE_URL: upstream.url,
      MEMORY_OBSERVATORY_WORKSPACE_ROOT: repoRoot,
    };

    const started = await command(startScript, env);
    expect(started.code, started.stderr).toBe(0);
    expect(started.stdout).toBe(
      'Memory Observatory READY\n'
      + 'Local URL: http://127.0.0.1:3697\n'
      + 'Mode: shadow\n'
      + 'Agent Core target: loopback\n',
    );
    expect(started.stdout).not.toMatch(/token|secret|lease|principal|memoryContext|api.?key/i);
    expect(await canConnect('127.0.0.1', 3697)).toBe(true);
    const listeners = await listenerAddresses(3697);
    expect(listeners).toContain('127.0.0.1:3697');
    expect(listeners).not.toContain('*:3697');

    const verified = await command(verifyScript, env);
    expect(verified.code, verified.stderr).toBe(0);
    expect(verified.stdout).toBe(started.stdout);
  }, 60_000);

  it('is idempotent: a healthy repeated start reuses the same owned process instead of spawning copies', async () => {
    const root = await tempStateRoot();
    const upstream = await startFakeUpstream();
    const env = {
      MEMORY_OBSERVATORY_LIFECYCLE_DIR: root,
      MEMORY_OBSERVATORY_AGENT_CORE_URL: upstream.url,
      MEMORY_OBSERVATORY_WORKSPACE_ROOT: repoRoot,
    };

    expect((await command(startScript, env)).code).toBe(0);
    const firstPid = (await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim();
    expect(firstPid).toMatch(/^\d+$/);

    expect((await command(startScript, env)).code).toBe(0);
    const secondPid = (await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim();
    expect(secondPid).toBe(firstPid);
    expect(await canConnect('127.0.0.1', 3697)).toBe(true);
  }, 60_000);

  it('never makes Observatory public and leaves the automatic Codespace attach lifecycle untouched', async () => {
    const [startSource, verifySource, ensureRunning] = await Promise.all([
      readFile(startScript, 'utf8'),
      readFile(verifyScript, 'utf8'),
      readFile(path.join(repoRoot, 'scripts/codespace/ensure-running.sh'), 'utf8'),
    ]);
    for (const source of [startSource, verifySource]) {
      expect(source).not.toMatch(/gh\s+codespace\s+ports\s+visibility/i);
      expect(source).not.toMatch(/3697:public/i);
      expect(source).not.toMatch(/0\.0\.0\.0/);
    }
    expect(ensureRunning).not.toMatch(/start-memory-observatory|memory-observatory\.sh|MEMORY_OBSERVATORY_PORT/);
  });
});
