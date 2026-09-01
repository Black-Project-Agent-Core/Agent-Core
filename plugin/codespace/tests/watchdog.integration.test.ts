import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watchdogEntry = path.join(pluginRoot, 'dist', 'watchdog.js');
const expectedTunnelId = 'tunnel_watchdog_integration';

let base: string;
let healthServer: Server | undefined;

beforeEach(async () => { base = await fs.mkdtemp(path.join(os.tmpdir(), 'codespace-watchdog-integration-')); });
afterEach(async () => {
  if (healthServer) await new Promise<void>((resolve) => healthServer?.close(() => resolve()));
  healthServer = undefined;
  await fs.rm(base, { recursive: true, force: true });
});

async function startHealthServer(): Promise<string> {
  healthServer = createServer((req, res) => {
    if (req.url === '/healthz') return void res.writeHead(200).end('ok');
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    healthServer?.once('error', reject);
    healthServer?.listen(0, '127.0.0.1', resolve);
  });
  const address = healthServer.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${address.port}/mcp`;
}

function failureLine() {
  return JSON.stringify({
    component: 'dispatcher',
    msg: 'dispatcher received MCP upstream error; posted error response to control plane',
    status_code: 502,
    failure_source: 'transport_closed',
    transport_error_kind: 'eof',
    upstream_response_received: false,
  });
}

async function harness(mcpUrl: string, repairExit = 0, statusMode: 'healthy' | 'unhealthy' | 'unknown' = 'healthy') {
  const stateDir = path.join(base, 'state');
  const stateFile = path.join(stateDir, 'watchdog.json');
  const tunnelLog = path.join(stateDir, 'logs', 'codespace.log');
  const repairLog = path.join(base, 'repair.log');
  const fakeBin = path.join(base, 'fake-tunnel-client');
  const fakeRepair = path.join(base, 'fake-repair.sh');
  const keyFile = path.join(base, 'runtime-key');
  await fs.mkdir(path.dirname(tunnelLog), { recursive: true });
  await fs.writeFile(tunnelLog, '');
  await fs.writeFile(keyFile, 'watchdog-decoy-secret\n');
  const status = {
    process_running: statusMode !== 'unhealthy',
    healthy: true, ready: true, runtime_state: 'ready', stale: false,
    tunnel_id: expectedTunnelId, remote_lookup_attempted: true, remote_error: '',
    remote_lookup_auth_ref: `file:${keyFile}`, remote: { id: expectedTunnelId },
    process: { target_kind: 'server_url', target_value: mcpUrl },
  };
  await fs.writeFile(fakeBin, `#!/usr/bin/env bash
set -euo pipefail
[[ "${statusMode}" == unknown ]] && exit 7
printf '%s\\n' '${JSON.stringify(status)}'
`, { mode: 0o755 });
  await fs.writeFile(fakeRepair, `#!/usr/bin/env bash
set -euo pipefail
printf 'args=%s secret=%s fd=%s\\n' "$*" "\${CONTROL_PLANE_API_KEY-unset}" "$([[ -e /proc/$$/fd/9 ]] && printf open || printf closed)" >> ${JSON.stringify(repairLog)}
exit ${repairExit}
`, { mode: 0o755 });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CONTROL_PLANE_API_KEY: 'watchdog-decoy-secret',
    CODESPACE_EXPECTED_TUNNEL_ID: expectedTunnelId,
    CODESPACE_MCP_SERVER_URL: mcpUrl,
    CODESPACE_RUNTIME_API_KEY_FILE: keyFile,
    CODESPACE_TUNNEL_CLIENT_BIN: fakeBin,
    CODESPACE_REPAIR_BRIDGE_SCRIPT: fakeRepair,
    CODESPACE_WATCHDOG_STATE_FILE: stateFile,
    CODESPACE_TUNNEL_LOG_FILE: tunnelLog,
    TUNNEL_CLIENT_STATE_DIR: stateDir,
    CODESPACE_WATCHDOG_FAILURE_THRESHOLD: '3',
    CODESPACE_WATCHDOG_RECONNECT_COOLDOWN_MS: '60000',
    CODESPACE_WATCHDOG_FAILED_REPAIR_RETRY_MS: '1',
  };
  async function invoke(extra: string[] = []) {
    await execFileAsync('/bin/bash', [
      '-c', 'exec 9>"$1"; shift; exec "$@"', 'watchdog-test', path.join(base, 'held.lock'),
      process.execPath, watchdogEntry, '--once', ...extra,
    ], { cwd: pluginRoot, env, timeout: 15_000 });
  }
  return { stateFile, tunnelLog, repairLog, fakeRepair, env, invoke };
}

describe('codespace watchdog production outcomes', () => {
  it('stages a first EOF burst through local repair and a second through tunnel reconnect', async () => {
    const mcpUrl = await startHealthServer();
    const h = await harness(mcpUrl);
    await h.invoke();
    await fs.appendFile(h.tunnelLog, `${failureLine()}\n${failureLine()}\n${failureLine()}\n`);
    await h.invoke();
    let state = JSON.parse(await fs.readFile(h.stateFile, 'utf8'));
    expect(state.routeGeneration).toBe(1);
    expect(state.failureStreak).toBe(0);

    await fs.appendFile(h.tunnelLog, `${failureLine()}\n${failureLine()}\n${failureLine()}\n`);
    await h.invoke();
    state = JSON.parse(await fs.readFile(h.stateFile, 'utf8'));
    expect(state.routeGeneration).toBe(0);
    expect(state.lastReconnectAt).toBeGreaterThan(0);
    const repairs = await fs.readFile(h.repairLog, 'utf8');
    expect(repairs).toContain('args=--scope local-mcp --reason repeated_route_failure');
    expect(repairs).toContain('args=--scope tunnel --reason repeated_route_failure');
    expect(repairs).not.toContain('watchdog-decoy-secret');
    expect(repairs).not.toContain('fd=open');
  });

  it('does not record failed local repair as generation or successful cooldown', async () => {
    const mcpUrl = await startHealthServer();
    const h = await harness(mcpUrl, 7);
    await h.invoke();
    await fs.appendFile(h.tunnelLog, `${failureLine()}\n${failureLine()}\n${failureLine()}\n`);
    await h.invoke();
    let state = JSON.parse(await fs.readFile(h.stateFile, 'utf8'));
    expect(state.routeGeneration).toBe(0);
    expect(state.failureStreak).toBe(3);
    expect(state.lastLocalRepairAt).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await h.invoke();
    const repairs = (await fs.readFile(h.repairLog, 'utf8')).trim().split('\n');
    expect(repairs).toHaveLength(2);
  });

  it('check-only under a held lifecycle fd makes zero persistent state mutation', async () => {
    const mcpUrl = 'http://127.0.0.1:39997/mcp';
    const h = await harness(mcpUrl);
    const original = '{"version":2,"logOffset":0,"failureStreak":7,"routeGeneration":1}\n';
    await fs.mkdir(path.dirname(h.stateFile), { recursive: true });
    await fs.writeFile(h.stateFile, original);
    await h.invoke(['--check-only']);
    await expect(fs.readFile(h.repairLog, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(h.stateFile, 'utf8')).toBe(original);
  });

  it('successful local health repair does not prime route generation', async () => {
    const mcpUrl = 'http://127.0.0.1:39997/mcp';
    const h = await harness(mcpUrl);
    await h.invoke();
    const state = JSON.parse(await fs.readFile(h.stateFile, 'utf8'));
    expect(state.routeGeneration).toBe(0);
    expect(state.lastLocalRepairAt).toBeGreaterThan(0);
    expect(await fs.readFile(h.repairLog, 'utf8'))
      .toContain('args=--scope local-mcp --reason local_mcp_unhealthy');
  });

  it('kills the complete repair process group when its coherent budget expires', async () => {
    const mcpUrl = 'http://127.0.0.1:39997/mcp';
    const h = await harness(mcpUrl);
    const childPidFile = path.join(base, 'repair-child.pid');
    await fs.writeFile(h.fakeRepair, `#!/usr/bin/env bash
set -euo pipefail
setsid sleep 30 &
child=$!
printf '%s\\n' "$child" > ${JSON.stringify(childPidFile)}
wait "$child"
`, { mode: 0o755 });
    Object.assign(h.env, {
      CODESPACE_RUNTIME_STATUS_MAX_ATTEMPTS: '1',
      CODESPACE_RUNTIME_STATUS_TIMEOUT_SECONDS: '0.01',
      CODESPACE_RUNTIME_STATUS_RETRY_DELAY_SECONDS: '0',
      CODESPACE_STOP_TIMEOUT_SECONDS: '0.01',
      CODESPACE_CONNECT_MAX_ATTEMPTS: '1',
      CODESPACE_CONNECT_TIMEOUT_SECONDS: '0.01',
      CODESPACE_CONNECT_RETRY_DELAY_SECONDS: '0',
      CODESPACE_DOCTOR_MAX_ATTEMPTS: '1',
      CODESPACE_DOCTOR_TIMEOUT_SECONDS: '0.01',
      CODESPACE_DOCTOR_RETRY_DELAY_SECONDS: '0',
      CODESPACE_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS: '0.02',
      CODESPACE_LOCAL_MCP_PROTOCOL_TIMEOUT_SECONDS: '0.02',
      CODESPACE_RUNTIME_LOCK_TIMEOUT_SECONDS: '0.01',
      CODESPACE_WATCHDOG_REPAIR_SAFETY_MS: '20',
      CODESPACE_WATCHDOG_REPAIR_KILL_GRACE_MS: '20',
    });
    await h.invoke();
    const childPid = Number((await fs.readFile(childPidFile, 'utf8')).trim());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(() => process.kill(childPid, 0)).toThrow();
  });

  it('does not immediately kill a repair at the maximum accepted Node timer delay', async () => {
    const mcpUrl = 'http://127.0.0.1:39997/mcp';
    const h = await harness(mcpUrl);
    await fs.writeFile(h.fakeRepair, `#!/usr/bin/env bash
set -euo pipefail
sleep 0.05
printf '%s\\n' completed > ${JSON.stringify(h.repairLog)}
`, { mode: 0o755 });
    h.env.CODESPACE_WATCHDOG_REPAIR_TIMEOUT_MS = '2147483647';
    await h.invoke();
    expect(await fs.readFile(h.repairLog, 'utf8')).toBe('completed\n');
  });

  it('rejects the first overflowing timer delay before starting repair', async () => {
    const mcpUrl = 'http://127.0.0.1:39997/mcp';
    const h = await harness(mcpUrl);
    h.env.CODESPACE_WATCHDOG_REPAIR_TIMEOUT_MS = '2147483648';
    await expect(h.invoke()).rejects.toMatchObject({ code: 1 });
    await expect(fs.readFile(h.repairLog, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('runtime status command failure remains unknown and never reconnects', async () => {
    const mcpUrl = await startHealthServer();
    const h = await harness(mcpUrl, 0, 'unknown');
    await h.invoke();
    await expect(fs.readFile(h.repairLog, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
