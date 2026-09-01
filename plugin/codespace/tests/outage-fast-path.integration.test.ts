import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repairScript = path.join(pluginRoot, 'scripts', 'repair-bridge.sh');
const tunnelId = 'tunnel_leaf_test';
const mcpUrl = 'http://127.0.0.1:39998/mcp';
let base: string;

beforeEach(async () => { base = await fs.mkdtemp(path.join(os.tmpdir(), 'codespace-leaf-repair-')); });
afterEach(async () => { await fs.rm(base, { recursive: true, force: true }); });

function healthyStatus(keyFile: string) {
  return {
    process_running: true, healthy: true, ready: true, runtime_state: 'ready', stale: false,
    tunnel_id: tunnelId, remote_lookup_attempted: true, remote_error: '',
    remote_lookup_auth_ref: `file:${keyFile}`, remote: { id: tunnelId },
    process: { target_kind: 'server_url', target_value: mcpUrl },
  };
}

async function setupFakes(statuses: object[], probeExit = 0) {
  const fakeDir = path.join(base, 'bin');
  const operationLog = path.join(base, 'operations.log');
  const forbiddenLog = path.join(base, 'forbidden.log');
  const earlyPathLog = path.join(base, 'early-path.log');
  const statusQueue = path.join(base, 'status.queue');
  const urlFile = path.join(base, 'http-mcp.url');
  const keyFile = path.join(base, 'runtime-key');
  await fs.mkdir(fakeDir, { recursive: true });
  await fs.writeFile(keyFile, 'decoy-leaf-raw-secret\n', { mode: 0o600 });
  await fs.writeFile(statusQueue, statuses.map((s) => JSON.stringify(s)).join('\n') + '\n');
  for (const name of ['npm', 'tsc', 'vitest', 'git']) {
    await fs.writeFile(path.join(fakeDir, name), `#!/usr/bin/env bash
printf '%s\\n' '${name}' >> "$FORBIDDEN_LOG"
exit 99
`, { mode: 0o755 });
  }
  for (const name of ['dirname', 'timeout']) {
    await fs.writeFile(path.join(fakeDir, name), `#!/usr/bin/env bash
set -euo pipefail
fd="\${CODESPACE_RUNTIME_LOCK_FD:-9}"
fd_state=closed
[[ -e "/proc/$$/fd/$fd" ]] && fd_state=open
printf '%s secret=%s fd=%s\\n' '${name}' "\${CONTROL_PLANE_API_KEY-unset}" "$fd_state" >> "$EARLY_PATH_LOG"
exec /usr/bin/${name} "$@"
`, { mode: 0o755 });
  }
  const ensure = path.join(base, 'ensure-http');
  await fs.writeFile(ensure, `#!/usr/bin/env bash
set -euo pipefail
printf 'ensure secret=%s fd=%s\\n' "\${CONTROL_PLANE_API_KEY-unset}" "$([[ -e "/proc/$$/fd/\${CODESPACE_RUNTIME_LOCK_FD:-9}" ]] && printf open || printf closed)" >> "$OPERATION_LOG"
printf '%s\\n' "$CODESPACE_MCP_HTTP_TEST_URL" > "$CODESPACE_MCP_HTTP_URL_FILE"
`, { mode: 0o755 });
  const probe = path.join(base, 'protocol-probe');
  await fs.writeFile(probe, `#!/usr/bin/env bash
set -euo pipefail
printf 'probe:%s secret=%s fd=%s\\n' "$1" "\${CONTROL_PLANE_API_KEY-unset}" "$([[ -e "/proc/$$/fd/\${CODESPACE_RUNTIME_LOCK_FD:-9}" ]] && printf open || printf closed)" >> "$OPERATION_LOG"
exit ${probeExit}
`, { mode: 0o755 });
  const tunnel = path.join(base, 'tunnel-client');
  await fs.writeFile(tunnel, `#!/usr/bin/env bash
set -euo pipefail
printf 'tunnel:%s secret=%s fd=%s\\n' "$*" "\${CONTROL_PLANE_API_KEY-unset}" "$([[ -e "/proc/$$/fd/\${CODESPACE_RUNTIME_LOCK_FD:-9}" ]] && printf open || printf closed)" >> "$OPERATION_LOG"
if [[ "$1 $2" == "runtimes status" ]]; then
  head -n 1 "$STATUS_QUEUE"
  tail -n +2 "$STATUS_QUEUE" > "$STATUS_QUEUE.tmp"
  mv "$STATUS_QUEUE.tmp" "$STATUS_QUEUE"
fi
`, { mode: 0o755 });
  return {
    fakeDir, operationLog, forbiddenLog, earlyPathLog, statusQueue, urlFile, keyFile, ensure, probe, tunnel,
  };
}

async function runRepair(
  scope: 'local-mcp' | 'reconcile' | 'tunnel',
  setup: Awaited<ReturnType<typeof setupFakes>>,
  lifecycleFd: 9 | 17 = 9,
) {
  try {
    const result = await execFileAsync('/bin/bash', [
      '-c',
      'if [[ "$1" == 17 ]]; then exec 17>"$2"; else exec 9>"$2"; fi; shift 2; exec /bin/bash "$@"',
      'leaf-test', String(lifecycleFd), path.join(base, 'lifecycle.lock'),
      repairScript, '--scope', scope, '--reason', 'z2_test',
    ], {
      cwd: pluginRoot,
      env: {
        ...process.env, PATH: `${setup.fakeDir}:${process.env.PATH}`,
        CONTROL_PLANE_API_KEY: 'decoy-leaf-raw-secret',
        FORBIDDEN_LOG: setup.forbiddenLog, OPERATION_LOG: setup.operationLog,
        EARLY_PATH_LOG: setup.earlyPathLog,
        STATUS_QUEUE: setup.statusQueue,
        CODESPACE_ENSURE_HTTP_MCP_SCRIPT: setup.ensure,
        CODESPACE_HTTP_PROTOCOL_PROBE_BIN: setup.probe,
        CODESPACE_MCP_HTTP_URL_FILE: setup.urlFile,
        CODESPACE_MCP_HTTP_TEST_URL: mcpUrl,
        CODESPACE_TUNNEL_CLIENT_BIN: setup.tunnel,
        CODESPACE_EXPECTED_TUNNEL_ID: tunnelId,
        CODESPACE_MCP_SERVER_URL: mcpUrl,
        CODESPACE_RUNTIME_API_KEY_FILE: setup.keyFile,
        CODESPACE_RUNTIME_API_KEY_REF: `file:${setup.keyFile}`,
        CODESPACE_RUNTIME_LOCK_FILE: path.join(base, 'lifecycle.lock'),
        CODESPACE_RUNTIME_LOCK_FD: String(lifecycleFd),
        CODESPACE_RUNTIME_STATUS_MAX_ATTEMPTS: '2',
        CODESPACE_RUNTIME_STATUS_RETRY_DELAY_SECONDS: '0',
        CODESPACE_CONNECT_RETRY_DELAY_SECONDS: '0',
        CODESPACE_DOCTOR_RETRY_DELAY_SECONDS: '0',
      },
      timeout: 10_000,
    });
    return { ...result, code: 0 };
  } catch (error) {
    const failed = error as Error & { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
  }
}

describe('production bridge leaf repair', () => {
  it('sanitizes secrets and the configured lifecycle fd before the earliest path subprocess', async () => {
    const setup = await setupFakes([]);
    const result = await runRepair('local-mcp', setup, 17);
    expect(result.code).toBe(0);
    const earliest = await fs.readFile(setup.earlyPathLog, 'utf8');
    expect(earliest.split('\n').filter(Boolean)[0]).toMatch(/^timeout /);
    expect(earliest).not.toContain('decoy-leaf-raw-secret');
    expect(earliest).not.toContain('fd=open');

    const laterChildren = await fs.readFile(setup.operationLog, 'utf8');
    expect(laterChildren).not.toContain('decoy-leaf-raw-secret');
    expect(laterChildren).not.toContain('fd=open');
  });

  it('repairs local MCP without runtime, package, build, test, or Git commands', async () => {
    const setup = await setupFakes([]);
    const result = await runRepair('local-mcp', setup);
    expect(result.code).toBe(0);
    const operations = await fs.readFile(setup.operationLog, 'utf8');
    expect(operations.split('\n').filter(Boolean).map((line) => line.split(' ')[0]))
      .toEqual(['ensure', `probe:${mcpUrl}`]);
    await expect(fs.readFile(setup.forbiddenLog, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(operations).not.toContain('decoy-leaf-raw-secret');
    expect(operations).not.toContain('fd=open');
  });

  it('reconcile probes local MCP and leaves an exact healthy runtime untouched', async () => {
    const setup = await setupFakes([healthyStatus(path.join(base, 'runtime-key'))]);
    const result = await runRepair('reconcile', setup);
    expect(result.code).toBe(0);
    const operations = await fs.readFile(setup.operationLog, 'utf8');
    expect(operations).toContain('ensure ');
    expect(operations).toContain(`probe:${mcpUrl}`);
    expect(operations).toContain('tunnel:runtimes status codespace --json');
    expect(operations).not.toContain('tunnel:runtimes stop');
    expect(operations).not.toContain('tunnel:runtimes connect');
    expect(operations).not.toContain('tunnel:doctor');
  });

  it('tunnel scope requires protocol health then performs a forced shared-helper reconnect', async () => {
    const keyFile = path.join(base, 'runtime-key');
    const setup = await setupFakes([healthyStatus(keyFile), healthyStatus(keyFile)]);
    const result = await runRepair('tunnel', setup);
    expect(result.code).toBe(0);
    const operations = await fs.readFile(setup.operationLog, 'utf8');
    const calls = operations.split('\n').filter((line) => line.startsWith('tunnel:'));
    expect(calls.map((line) => line.split(' secret=')[0].replace(/ --profile.*/, '')))
      .toEqual([
        'tunnel:runtimes status codespace --json',
        'tunnel:runtimes stop codespace',
        'tunnel:runtimes connect --alias codespace --tunnel-id tunnel_leaf_test',
        'tunnel:runtimes status codespace --json',
        'tunnel:doctor',
      ]);
    expect(operations).not.toContain('decoy-leaf-raw-secret');
    expect(operations).not.toContain('fd=open');
  });

  it('does not reconnect when the local MCP protocol probe fails', async () => {
    const setup = await setupFakes([], 7);
    const result = await runRepair('tunnel', setup);
    expect(result.code).not.toBe(0);
    const operations = await fs.readFile(setup.operationLog, 'utf8');
    expect(operations).not.toContain('tunnel:');
  });
});
