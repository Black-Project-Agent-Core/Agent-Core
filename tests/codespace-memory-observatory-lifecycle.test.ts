import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const startScript = path.join(repoRoot, 'scripts/codespace/start-memory-observatory.sh');
const verifyScript = path.join(repoRoot, 'scripts/codespace/verify-memory-observatory.sh');
const ensureScript = path.join(repoRoot, 'scripts/codespace/ensure-memory-observatory-running.sh');
const watchdogScript = path.join(repoRoot, 'scripts/codespace/watch-memory-observatory.sh');
const rootEnsureRunning = path.join(repoRoot, 'scripts/codespace/ensure-running.sh');
const stateRoots: string[] = [];
const upstreams: Server[] = [];
const watchdogSessions: string[] = [];

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

async function command(
  script: string,
  env: NodeJS.ProcessEnv,
  args: string[] = [],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('bash', [script, ...args], {
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

async function freeLoopbackPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
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

async function stopWatchdogSession(session: string): Promise<void> {
  const child = spawn('tmux', ['kill-session', '-t', session], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await new Promise<void>((resolve) => child.once('close', () => resolve()));
}

function lifecycleEnv(root: string, upstreamUrl: string, port: number): NodeJS.ProcessEnv {
  return {
    MEMORY_OBSERVATORY_LIFECYCLE_DIR: root,
    MEMORY_OBSERVATORY_AGENT_CORE_URL: upstreamUrl,
    MEMORY_OBSERVATORY_WORKSPACE_ROOT: repoRoot,
    MEMORY_OBSERVATORY_SOURCE_ROOT: repoRoot,
    MEMORY_OBSERVATORY_PORT: String(port),
    MEMORY_OBSERVATORY_WATCHDOG_ENABLED: '0',
  };
}

afterEach(async () => {
  for (const session of watchdogSessions.splice(0)) {
    await stopWatchdogSession(session);
  }
  await Promise.all(stateRoots.splice(0).map(async (root) => {
    await cleanupLifecycle(root);
    await rm(root, { recursive: true, force: true });
  }));
  await Promise.all(upstreams.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('Codespace Memory Observatory lifecycle', () => {
  it('starts only on exact loopback, prints only safe READY metadata, and is health-verifiable', async () => {
    const root = await tempStateRoot();
    const upstream = await startFakeUpstream();
    const port = await freeLoopbackPort();
    const env = lifecycleEnv(root, upstream.url, port);

    const started = await command(startScript, env);
    expect(started.code, started.stderr).toBe(0);
    expect(started.stdout).toBe(
      'Memory Observatory READY\n'
      + `Local URL: http://127.0.0.1:${port}\n`
      + 'Mode: shadow\n'
      + 'Agent Core target: loopback\n',
    );
    expect(started.stdout).not.toMatch(/token|secret|lease|principal|memoryContext|api.?key/i);
    expect(await canConnect('127.0.0.1', port)).toBe(true);
    const listeners = await listenerAddresses(port);
    expect(listeners).toContain(`127.0.0.1:${port}`);
    expect(listeners).not.toContain(`*:${port}`);

    const verified = await command(verifyScript, env);
    expect(verified.code, verified.stderr).toBe(0);
    expect(verified.stdout).toBe(started.stdout);
  }, 60_000);

  it('auto-start launcher is idempotent and reuses the same healthy sidecar', async () => {
    const root = await tempStateRoot();
    const upstream = await startFakeUpstream();
    const port = await freeLoopbackPort();
    const env = lifecycleEnv(root, upstream.url, port);

    const first = await command(ensureScript, env);
    expect(first.code, first.stderr).toBe(0);
    const firstPid = (await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim();
    expect(firstPid).toMatch(/^\d+$/);

    const second = await command(ensureScript, env);
    expect(second.code, second.stderr).toBe(0);
    const secondPid = (await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim();
    expect(secondPid).toBe(firstPid);
    expect(await canConnect('127.0.0.1', port)).toBe(true);
    expect(`${first.stdout}${first.stderr}${second.stdout}${second.stderr}`).not.toMatch(
      /token|secret|lease|principal|memoryContext|api.?key/i,
    );
  }, 60_000);

  it('repairs stale PID ownership and watchdog once recovers a crashed sidecar', async () => {
    const root = await tempStateRoot();
    const upstream = await startFakeUpstream();
    const port = await freeLoopbackPort();
    const env = lifecycleEnv(root, upstream.url, port);

    await writeFile(path.join(root, 'memory-observatory.pid'), '99999999\n', 'utf8');
    expect((await command(ensureScript, env)).code).toBe(0);
    const firstPid = Number((await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim());
    expect(firstPid).toBeGreaterThan(1);

    process.kill(firstPid, 'SIGKILL');
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      try { process.kill(firstPid, 0); await new Promise((resolve) => setTimeout(resolve, 50)); }
      catch { break; }
    }

    const recovered = await command(watchdogScript, env, ['--once']);
    expect(recovered.code, recovered.stderr).toBe(0);
    const secondPid = Number((await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim());
    expect(secondPid).toBeGreaterThan(1);
    expect(secondPid).not.toBe(firstPid);
    expect(await canConnect('127.0.0.1', port)).toBe(true);
  }, 60_000);

  it('keeps the sidecar self-healing under the long-running watchdog', async () => {
    const root = await tempStateRoot();
    const upstream = await startFakeUpstream();
    const port = await freeLoopbackPort();
    const session = `memory-observatory-watchdog-test-${process.pid}-${Date.now()}`;
    watchdogSessions.push(session);
    const env = {
      ...lifecycleEnv(root, upstream.url, port),
      MEMORY_OBSERVATORY_WATCHDOG_ENABLED: '1',
      MEMORY_OBSERVATORY_WATCHDOG_SESSION: session,
    };

    const started = await command(ensureScript, env);
    expect(started.code, started.stderr).toBe(0);
    const firstPid = Number((await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim());
    expect(firstPid).toBeGreaterThan(1);
    process.kill(firstPid, 'SIGKILL');

    const deadline = Date.now() + 9_000;
    let recoveredPid = firstPid;
    while (Date.now() < deadline) {
      try {
        recoveredPid = Number((await readFile(path.join(root, 'memory-observatory.pid'), 'utf8')).trim());
      } catch {}
      if (recoveredPid > 1 && recoveredPid !== firstPid && await canConnect('127.0.0.1', port)) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(recoveredPid).toBeGreaterThan(1);
    expect(recoveredPid).not.toBe(firstPid);
    expect(await canConnect('127.0.0.1', port)).toBe(true);
  }, 60_000);

  it('keeps 3697 private and wires auto-start after the primary Codespace bridge without making it critical', async () => {
    const [startSource, verifySource, ensureSource, watchdogSource, rootLifecycle] = await Promise.all([
      readFile(startScript, 'utf8'),
      readFile(verifyScript, 'utf8'),
      readFile(ensureScript, 'utf8'),
      readFile(watchdogScript, 'utf8'),
      readFile(rootEnsureRunning, 'utf8'),
    ]);
    expect(startSource).toContain('MEMORY_OBSERVATORY_PORT:-3697');
    expect(verifySource).toContain('MEMORY_OBSERVATORY_PORT:-3697');
    for (const source of [startSource, verifySource, ensureSource, watchdogSource]) {
      expect(source).not.toMatch(/gh\s+codespace\s+ports\s+visibility/i);
      expect(source).not.toMatch(/3697:public/i);
      expect(source).not.toMatch(/0\.0\.0\.0/);
    }

    const pluginIndex = rootLifecycle.indexOf('run_without_codespace_lifecycle_lock bash "$plugin_lifecycle"');
    const observatoryIndex = rootLifecycle.indexOf('ensure-memory-observatory-running.sh');
    const readyIndex = rootLifecycle.indexOf("log_info 'READY:");
    expect(pluginIndex).toBeGreaterThanOrEqual(0);
    expect(observatoryIndex).toBeGreaterThan(pluginIndex);
    expect(readyIndex).toBeGreaterThan(observatoryIndex);
    expect(rootLifecycle).toContain("Memory Observatory auto-start degraded");
    expect(rootLifecycle).toMatch(/if ! .*ensure-memory-observatory-running\.sh/);
  });

  it('fails truthfully when shadow source is unavailable so the primary lifecycle can isolate the failure', async () => {
    const root = await tempStateRoot();
    const missing = path.join(root, 'missing-shadow-source');
    const result = await command(ensureScript, {
      MEMORY_OBSERVATORY_LIFECYCLE_DIR: root,
      MEMORY_OBSERVATORY_SOURCE_ROOT: missing,
      MEMORY_OBSERVATORY_BOOTSTRAP_ALLOW_REMOTE: '0',
      MEMORY_OBSERVATORY_WATCHDOG_ENABLED: '0',
    });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('SHADOW_SOURCE_UNAVAILABLE');
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/token|secret|lease|principal|memoryContext|api.?key/i);
  });
});
