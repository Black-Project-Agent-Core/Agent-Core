import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import type { HermesPartnerConfig, HermesPartnerHealth } from './types.js';
import { fetchWithPolicy, correlationSuffix, type OutboundSafety } from '../net/outbound-request.js';
import { readResponseTextBounded } from '../net/bounded-response.js';
import { buildOwnedChildEnv } from '../security/environment.js';

const HELPER_SOURCE = `import asyncio, os
from pathlib import Path
from dotenv import load_dotenv
import psutil

home = Path(os.environ["HERMES_HOME"]).resolve()
load_dotenv(home / ".env", override=False)

from gateway.config import PlatformConfig
from gateway.platforms.api_server import APIServerAdapter

async def main():
    cfg = PlatformConfig(enabled=True, extra={
        "key": os.environ["API_SERVER_KEY"],
        "host": os.environ.get("API_SERVER_HOST", "127.0.0.1"),
        "port": int(os.environ["API_SERVER_PORT"]),
    })
    adapter = APIServerAdapter(cfg)
    ok = await adapter.connect()
    if not ok:
        raise RuntimeError("Hermes API adapter failed to connect")

    parent_pid = int(os.environ.get("AGENT_CORE_PARTNER_PARENT_PID", "0") or "0")
    try:
        while True:
            await asyncio.sleep(1.0)
            if parent_pid > 0 and not psutil.pid_exists(parent_pid):
                break
    finally:
        try:
            await adapter.disconnect()
        except Exception:
            pass

asyncio.run(main())
`;

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

async function portAvailable(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

export class HermesPartnerRuntime {
  private child: ChildProcess | null = null;
  private apiKey = '';
  private port: number | null = null;
  private pythonPath: string | null = null;
  private issue: string | null = null;
  private version: string | undefined;
  private lastStderr = '';
  private startPromise: Promise<void> | null = null;

  constructor(readonly config: HermesPartnerConfig) {}

  async initialize(): Promise<void> {
    await mkdir(this.config.runtimeDir, { recursive: true });
    if (!this.config.enabled) return;
    try {
      await this.ensureStarted();
    } catch (error) {
      this.issue = error instanceof Error ? error.message : String(error);
    }
  }

  async health(): Promise<HermesPartnerHealth> {
    if (!this.config.enabled) {
      return {
        status: 'not-configured',
        enabled: false,
        provider: 'hermes',
        transport: 'loopback-runs-api',
        issueCount: 0,
      };
    }

    const childAlive = Boolean(this.child && this.child.exitCode === null && this.port !== null && this.apiKey);
    if (!childAlive) {
      return {
        status: 'degraded',
        enabled: true,
        provider: 'hermes',
        transport: 'loopback-runs-api',
        issueCount: 1,
        issue: this.issue ?? 'Hermes partner child is not running',
        hermesHome: this.config.hermesHome,
        sourceRoot: this.config.hermesSourceRoot,
        ...(this.port !== null ? { port: this.port } : {}),
      };
    }

    try {
      const payload = await this.rawRequest('/health', { auth: false, timeoutMs: 2_000 });
      this.version = typeof payload?.version === 'string' ? payload.version : this.version;
      this.issue = null;
      return {
        status: 'available',
        enabled: true,
        provider: 'hermes',
        transport: 'loopback-runs-api',
        issueCount: 0,
        hermesHome: this.config.hermesHome,
        sourceRoot: this.config.hermesSourceRoot,
        ...(this.port !== null ? { port: this.port } : {}),
        ...(this.version ? { version: this.version } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'degraded',
        enabled: true,
        provider: 'hermes',
        transport: 'loopback-runs-api',
        issueCount: 1,
        issue: `Hermes partner child is alive but health probe failed: ${message}`,
        hermesHome: this.config.hermesHome,
        sourceRoot: this.config.hermesSourceRoot,
        ...(this.port !== null ? { port: this.port } : {}),
        ...(this.version ? { version: this.version } : {}),
      };
    }
  }

  async request(route: string, init: {
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {}): Promise<Record<string, unknown>> {
    await this.ensureStarted();
    return this.rawRequest(route, { ...init, auth: true });
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.port = null;
    this.apiKey = '';
    if (!child || child.exitCode !== null) return;
    try { child.kill(); } catch { /* fail-soft owned child shutdown */ }
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && this.child.exitCode === null && this.port !== null && this.apiKey) {
      // An owned Hermes API process may be temporarily unable to answer /health while
      // constructing an AIAgent or handling a heavy turn. Process liveness and transport
      // responsiveness are separate signals: never destroy an in-flight run solely because
      // a short health probe timed out. Restart only after the owned child actually exits.
      return;
    }
    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = this.startFresh();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async startFresh(): Promise<void> {
    if (this.child && this.child.exitCode === null && this.port !== null && this.apiKey) return;

    await this.assertLayout();
    await this.prepareHermesProvider();
    this.pythonPath = await this.resolvePython();
    this.port = await this.resolvePort();
    this.apiKey = randomBytes(32).toString('hex');
    this.lastStderr = '';

    const helperPath = path.join(this.config.runtimeDir, 'hermes_partner_api.py');
    await writeFile(helperPath, HELPER_SOURCE, { encoding: 'utf8', mode: 0o600 });
    await mkdir(path.join(this.config.hermesHome, 'tmp'), { recursive: true });

    const pythonPathEntries = [
      path.join(this.config.hermesSourceRoot, 'venv', 'Lib', 'site-packages'),
      this.config.hermesSourceRoot,
    ];
    const env = buildOwnedChildEnv({
      HERMES_HOME: this.config.hermesHome,
      PYTHONPATH: pythonPathEntries.join(path.delimiter),
      PATH: [
        path.join(this.config.hermesHome, 'bin'),
        path.join(this.config.hermesHome, 'node'),
        process.env.PATH ?? '',
      ].join(path.delimiter),
      TEMP: path.join(this.config.hermesHome, 'tmp'),
      TMP: path.join(this.config.hermesHome, 'tmp'),
      API_SERVER_KEY: this.apiKey,
      AGENT_CORE_PARTNER_PARENT_PID: String(process.pid),
      API_SERVER_HOST: this.config.host,
      API_SERVER_PORT: String(this.port),
    });

    const child = spawn(this.pythonPath, [helperPath], {
      cwd: this.config.hermesHome,
      env,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.child = child;
    child.stderr?.on('data', chunk => {
      this.lastStderr = (this.lastStderr + String(chunk)).slice(-4_000);
    });
    child.once('exit', (code, signal) => {
      if (this.child === child) {
        this.issue = `Hermes partner API exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})${this.lastStderr ? `: ${this.lastStderr.slice(-1_000)}` : ''}`;
      }
    });

    const deadline = Date.now() + this.config.startupTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(this.issue ?? `Hermes partner API exited with code ${child.exitCode}`);
      }
      try {
        const payload = await this.rawRequest('/health', { auth: false, timeoutMs: 2_000 });
        this.version = typeof payload?.version === 'string' ? payload.version : undefined;
        this.issue = null;
        return;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    try { child.kill(); } catch { /* ignore */ }
    throw new Error(`HERMES_PARTNER_START_TIMEOUT: ${lastError instanceof Error ? lastError.message : String(lastError ?? 'health unavailable')}`);
  }

  private async rawRequest(route: string, init: {
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    auth?: boolean;
    timeoutMs?: number;
  }): Promise<Record<string, unknown>> {
    if (this.port === null) throw new Error('HERMES_PARTNER_NOT_STARTED');
    const headers: Record<string, string> = {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.auth === false ? {} : { authorization: `Bearer ${this.apiKey}` }),
      ...(init.headers ?? {}),
    };
    const method = (init.method ?? 'GET').toUpperCase();
    const idempotencyKey = Object.entries(headers)
      .find(([key]) => key.toLowerCase() === 'idempotency-key')?.[1];
    const safety: OutboundSafety = method === 'GET' || method === 'HEAD'
      ? 'safe'
      : method === 'POST' && route === '/v1/runs' && Boolean(idempotencyKey)
        ? 'idempotent'
        : 'non-idempotent';
    const response = await fetchWithPolicy(`http://${this.config.host}:${this.port}${route}`, {
      method, headers, ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    }, {
      safety,
      maxAttempts: safety === 'non-idempotent' ? 1 : 3,
      maxTotalDelayMs: 8_000,
      timeoutMs: init.timeoutMs ?? this.config.callTimeoutMs,
    });
    const raw = await readResponseTextBounded(response, 4 * 1024 * 1024, `Hermes ${method} ${route} response`);
    let payload: Record<string, unknown> = {};
    if (raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        payload = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : { value: parsed };
      } catch {
        payload = { message: raw.slice(0, 4_000) };
      }
    }
    if (!response.ok) {
      const detail = typeof payload.error === 'object'
        ? JSON.stringify(payload.error)
        : String(payload.error ?? payload.message ?? response.statusText);
      throw new Error(`HERMES_PARTNER_HTTP_${response.status}: ${detail.slice(0, 2_000)}${correlationSuffix(response)}`);
    }
    return payload;
  }

  private async prepareHermesProvider(): Promise<void> {
    let configText = '';
    try {
      configText = await readFile(path.join(this.config.hermesHome, 'config.yaml'), 'utf8');
    } catch {
      return;
    }
    if (!/^\s*provider:\s*['"]?9router['"]?\s*$/im.test(configText)) return;

    const routerHealth = 'http://127.0.0.1:20128/api/health';
    if (!await this.probeUrl(routerHealth, 2_000)) {
      const launcher = path.join(this.config.hermesHome, '9Router.cmd');
      if (!await exists(launcher)) throw new Error('HERMES_9ROUTER_LAUNCHER_NOT_FOUND');
      const router = spawn(launcher, [], {
        cwd: this.config.hermesHome,
        env: buildOwnedChildEnv(),
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
        shell: true,
      });
      router.unref();

      const deadline = Date.now() + this.config.startupTimeoutMs;
      while (Date.now() < deadline) {
        if (await this.probeUrl(routerHealth, 2_000)) break;
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      if (!await this.probeUrl(routerHealth, 2_000)) {
        throw new Error('HERMES_9ROUTER_START_TIMEOUT');
      }
    }

    const nodeExe = path.join(this.config.hermesHome, 'node', 'node.exe');
    const syncScript = path.join(this.config.hermesHome, 'runtime', '9router', 'sync-providers.cjs');
    if (!await exists(nodeExe) || !await exists(syncScript)) {
      throw new Error('HERMES_9ROUTER_SYNC_RUNTIME_NOT_FOUND');
    }
    await this.runPreparationCommand(nodeExe, [syncScript], this.config.hermesHome);
  }

  private async probeUrl(url: string, timeoutMs: number): Promise<boolean> {
    try {
      const response = await fetchWithPolicy(url, {}, {
        safety: 'safe',
        maxAttempts: 2,
        maxTotalDelayMs: 1_000,
        timeoutMs,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async runPreparationCommand(command: string, args: string[], cwd: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: buildOwnedChildEnv(),
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4_000); });
      const timer = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        reject(new Error('HERMES_9ROUTER_SYNC_TIMEOUT'));
      }, this.config.startupTimeoutMs);
      timer.unref();
      child.once('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`HERMES_9ROUTER_SYNC_FAILED: exit=${code ?? 'null'}${stderr ? `: ${stderr.slice(-1_000)}` : ''}`));
      });
    });
  }

  private async assertLayout(): Promise<void> {
    if (!await exists(this.config.hermesHome)) throw new Error('HERMES_HOME_NOT_FOUND');
    if (!await exists(this.config.hermesSourceRoot)) throw new Error('HERMES_SOURCE_NOT_FOUND');
    if (!await exists(path.join(this.config.hermesSourceRoot, 'gateway', 'platforms', 'api_server.py'))) {
      throw new Error('HERMES_API_SERVER_SOURCE_NOT_FOUND');
    }
  }

  private async resolvePython(): Promise<string> {
    const portableRoot = path.join(this.config.hermesSourceRoot, '.hermes-runtime', 'python');
    try {
      const entries = await readdir(portableRoot, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory() || !entry.name.startsWith('cpython-3.11')) continue;
        const candidate = path.join(portableRoot, entry.name, 'python.exe');
        if (await exists(candidate)) return candidate;
      }
    } catch {
      // Fall through to venv.
    }
    const venv = path.join(this.config.hermesSourceRoot, 'venv', 'Scripts', 'python.exe');
    if (await exists(venv)) return venv;
    throw new Error('HERMES_PORTABLE_PYTHON_NOT_FOUND');
  }

  private async resolvePort(): Promise<number> {
    for (let port = this.config.portStart; port < this.config.portStart + 20; port += 1) {
      if (await portAvailable(this.config.host, port)) return port;
    }
    throw new Error('HERMES_PARTNER_NO_LOOPBACK_PORT_AVAILABLE');
  }
}
