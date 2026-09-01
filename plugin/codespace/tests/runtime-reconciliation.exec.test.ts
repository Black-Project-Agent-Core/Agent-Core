import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(pluginRoot, 'scripts', 'runtime-reconciliation.sh');

let base: string;

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'codespace-runtime-reconcile-'));
});

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

const tunnelId = 'tunnel_test';
const mcpUrl = 'http://127.0.0.1:39999/mcp';

function status(overrides: Record<string, unknown> = {}) {
  return {
    process_running: true,
    healthy: true,
    ready: true,
    runtime_state: 'ready',
    stale: false,
    tunnel_id: tunnelId,
    remote_lookup_attempted: true,
    remote_error: '',
    remote_lookup_auth_ref: `file:${path.join(base, 'runtime-key')}`,
    remote: { id: tunnelId },
    process: { target_kind: 'server_url', target_value: mcpUrl },
    ...overrides,
  };
}

async function writeQueue(file: string, entries: Array<Record<string, unknown> | string>) {
  await fs.writeFile(file, entries.map((entry) => (
    typeof entry === 'string' ? entry : JSON.stringify(entry)
  )).join('\n') + '\n', 'utf8');
}

async function makeFakeClient() {
  const bin = path.join(base, 'fake-tunnel-client');
  const shimDir = path.join(base, 'classifier-bin');
  const classifierEnvLog = path.join(base, 'classifier-env.log');
  await fs.mkdir(shimDir, { recursive: true });
  await fs.writeFile(path.join(shimDir, 'node'), `#!/usr/bin/env bash
if [[ -v STATUS_JSON ]]; then
  printf '%s\\n' 'STATUS_JSON=set' >> "$FAKE_CLASSIFIER_ENV_LOG"
else
  printf '%s\\n' 'STATUS_JSON=unset' >> "$FAKE_CLASSIFIER_ENV_LOG"
fi
if tr '\\0' '\\n' < /proc/$$/environ | grep -Fq 'unexpected-status-canary-secret'; then
  printf '%s\\n' 'canary=present' >> "$FAKE_CLASSIFIER_ENV_LOG"
else
  printf '%s\\n' 'canary=absent' >> "$FAKE_CLASSIFIER_ENV_LOG"
fi
exec ${JSON.stringify(process.execPath)} "$@"
`, { mode: 0o755 });
  await fs.writeFile(bin, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_CALL_LOG"
printf 'secret=%s fd=%s\\n' "\${CONTROL_PLANE_API_KEY-unset}" "$([[ -e /proc/$$/fd/\${CODESPACE_TEST_LOCK_FD:-9} ]] && printf open || printf closed)" >> "$FAKE_CHILD_LOG"
if [[ "$1 $2" == "runtimes status" ]]; then
  entry="$(head -n 1 "$FAKE_STATUS_QUEUE" 2>/dev/null || true)"
  tail -n +2 "$FAKE_STATUS_QUEUE" > "$FAKE_STATUS_QUEUE.tmp" 2>/dev/null || true
  mv "$FAKE_STATUS_QUEUE.tmp" "$FAKE_STATUS_QUEUE"
  case "$entry" in
    __FAIL__) exit 7 ;;
    __TIMEOUT__) sleep 10; exit 0 ;;
    __EMPTY__) exit 0 ;;
    *) printf '%s\\n' "$entry" ;;
  esac
  exit 0
fi
if [[ "$1 $2" == "runtimes connect" ]]; then
  entry="$(head -n 1 "$FAKE_CONNECT_QUEUE" 2>/dev/null || true)"
  if [[ -n "$entry" ]]; then
    tail -n +2 "$FAKE_CONNECT_QUEUE" > "$FAKE_CONNECT_QUEUE.tmp" 2>/dev/null || true
    mv "$FAKE_CONNECT_QUEUE.tmp" "$FAKE_CONNECT_QUEUE"
    exit "$entry"
  fi
fi
exit 0
`, { mode: 0o755 });
  return { bin, shimDir, classifierEnvLog };
}

async function runHelper(options: {
  phase?: 'create' | 'start' | 'attach' | 'manual';
  force?: boolean;
  statuses: Array<Record<string, unknown> | string>;
  connectResults?: number[];
  secret?: string;
  env?: Record<string, string>;
}) {
  const callLog = path.join(base, 'calls.log');
  const childLog = path.join(base, 'children.log');
  const statusQueue = path.join(base, 'status.queue');
  const connectQueue = path.join(base, 'connect.queue');
  const keyFile = path.join(base, 'runtime-key');
  const lockFile = path.join(base, 'runtime.lock');
  const fake = await makeFakeClient();
  const secret = options.secret ?? 'decoy-raw-secret';
  await fs.writeFile(keyFile, `${secret}\n`, { mode: 0o600 });
  await writeQueue(statusQueue, options.statuses);
  await fs.writeFile(connectQueue, (options.connectResults ?? []).join('\n') + '\n', 'utf8');

  const helperArgs = [helper, '--phase', options.phase ?? 'manual'];
  if (options.force) helperArgs.push('--force-reconnect');
  let result: { stdout: string; stderr: string; code: number };
  try {
    const completed = await execFileAsync('/bin/bash', [
      '-c',
      'exec 9>"$1"; shift; exec /bin/bash "$@"',
      'runtime-test',
      lockFile,
      ...helperArgs,
    ], {
      cwd: pluginRoot,
      env: {
        ...process.env,
        PATH: `${fake.shimDir}:${process.env.PATH}`,
        CONTROL_PLANE_API_KEY: secret,
        CODESPACE_TUNNEL_CLIENT_BIN: fake.bin,
        CODESPACE_TUNNEL_ALIAS: 'codespace',
        CODESPACE_PROFILE_NAME: 'codespace',
        CODESPACE_PROFILE_DIR: path.join(base, 'profiles'),
        TUNNEL_CLIENT_STATE_DIR: path.join(base, 'state'),
        CODESPACE_EXPECTED_TUNNEL_ID: tunnelId,
        CODESPACE_MCP_SERVER_URL: mcpUrl,
        CODESPACE_RUNTIME_API_KEY_FILE: keyFile,
        CODESPACE_RUNTIME_API_KEY_REF: `file:${keyFile}`,
        CODESPACE_RUNTIME_SKIP_PROTOCOL_PROBE: '1',
        CODESPACE_RUNTIME_STATUS_MAX_ATTEMPTS: '3',
        CODESPACE_RUNTIME_STATUS_RETRY_DELAY_SECONDS: '0',
        CODESPACE_RUNTIME_STATUS_TIMEOUT_SECONDS: '0.1',
        CODESPACE_CONNECT_MAX_ATTEMPTS: '3',
        CODESPACE_CONNECT_RETRY_DELAY_SECONDS: '0',
        CODESPACE_CONNECT_TIMEOUT_SECONDS: '1',
        CODESPACE_DOCTOR_MAX_ATTEMPTS: '1',
        CODESPACE_DOCTOR_RETRY_DELAY_SECONDS: '0',
        CODESPACE_DOCTOR_TIMEOUT_SECONDS: '1',
        CODESPACE_RUNTIME_LOCK_FILE: lockFile,
        CODESPACE_RUNTIME_LOCK_FD: '9',
        CODESPACE_TEST_LOCK_FD: '9',
        FAKE_CALL_LOG: callLog,
        FAKE_CHILD_LOG: childLog,
        FAKE_STATUS_QUEUE: statusQueue,
        FAKE_CONNECT_QUEUE: connectQueue,
        FAKE_CLASSIFIER_ENV_LOG: fake.classifierEnvLog,
        ...options.env,
      },
      timeout: 15_000,
    });
    result = { ...completed, code: 0 };
  } catch (error) {
    const failed = error as Error & { stdout?: string; stderr?: string; code?: number };
    result = {
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
      code: typeof failed.code === 'number' ? failed.code : 1,
    };
  }

  return {
    ...result,
    secret,
    calls: await fs.readFile(callLog, 'utf8').catch(() => ''),
    children: await fs.readFile(childLog, 'utf8').catch(() => ''),
    classifierEnvironment: await fs.readFile(fake.classifierEnvLog, 'utf8').catch(() => ''),
  };
}

function lines(value: string): string[] {
  return value.trim() ? value.trim().split('\n') : [];
}

describe('runtime reconciliation production helper', () => {
  it.each(['create', 'start', 'attach', 'manual'] as const)(
    'preserves an exact healthy runtime during %s',
    async (phase) => {
      const result = await runHelper({ phase, statuses: [status()] });
      expect(result.code).toBe(0);
      expect(lines(result.calls)).toEqual(['runtimes status codespace --json']);
    },
  );

  it('forces a healthy runtime through stop, connect, exact final status, then doctor', async () => {
    const result = await runHelper({ force: true, statuses: [status(), status()] });
    expect(result.code).toBe(0);
    expect(lines(result.calls).map((call) => call.split(' ')[0] === 'doctor' ? 'doctor' : call.startsWith('runtimes connect') ? 'connect' : call))
      .toEqual(['runtimes status codespace --json', 'runtimes stop codespace', 'connect', 'runtimes status codespace --json', 'doctor']);
  });

  it.each([
    ['dead', { process_running: false }],
    ['stale', { stale: true }],
    ['wrong tunnel', { tunnel_id: 'tunnel_wrong' }],
    ['wrong remote', { remote: { id: 'tunnel_wrong' } }],
    ['different file ref', { remote_lookup_auth_ref: 'file:/tmp/other-key' }],
    ['environment ref', { remote_lookup_auth_ref: 'env:CONTROL_PLANE_API_KEY' }],
    ['missing ref', { remote_lookup_auth_ref: undefined }],
    ['wrong target', { process: { target_kind: 'command', target_value: 'old-stdio' } }],
  ])('reconnects a readable unhealthy runtime: %s', async (_name, override) => {
    const result = await runHelper({ statuses: [status(override), status()] });
    expect(result.code).toBe(0);
    expect(lines(result.calls)[0]).toBe('runtimes status codespace --json');
    expect(result.calls).toContain('runtimes stop codespace');
    expect(result.calls).toContain('runtimes connect');
    expect(lines(result.calls).at(-1)).toContain('doctor ');
  });

  it('retries a transient status and stops once exact health is observed', async () => {
    const result = await runHelper({ statuses: ['__FAIL__', status()] });
    expect(result.code).toBe(0);
    expect(lines(result.calls)).toEqual([
      'runtimes status codespace --json',
      'runtimes status codespace --json',
    ]);
  });

  it.each([
    ['failed commands', ['__FAIL__', '__FAIL__', '__FAIL__']],
    ['malformed JSON', ['{bad', '{bad', '{bad']],
    ['empty output', ['__EMPTY__', '__EMPTY__', '__EMPTY__']],
    ['timeouts', ['__TIMEOUT__', '__TIMEOUT__', '__TIMEOUT__']],
  ])('returns nonzero without destructive calls for permanently unknown status: %s', async (_name, statuses) => {
    const result = await runHelper({ statuses });
    expect(result.code).not.toBe(0);
    expect(lines(result.calls)).toHaveLength(3);
    expect(result.calls).not.toContain(' stop ');
    expect(result.calls).not.toContain(' connect ');
    expect(result.calls).not.toContain('doctor');
  });

  it('retries connect boundedly and succeeds', async () => {
    const result = await runHelper({
      statuses: [status({ stale: true }), status()],
      connectResults: [9, 0],
    });
    expect(result.code).toBe(0);
    expect(lines(result.calls).filter((call) => call.startsWith('runtimes connect'))).toHaveLength(2);
  });

  it('fails after bounded connect attempts without a final status or doctor', async () => {
    const result = await runHelper({
      statuses: [status({ stale: true })],
      connectResults: [9, 9, 9],
    });
    expect(result.code).not.toBe(0);
    expect(lines(result.calls).filter((call) => call.startsWith('runtimes connect'))).toHaveLength(3);
    expect(lines(result.calls).filter((call) => call.includes('runtimes status'))).toHaveLength(1);
    expect(result.calls).not.toContain('doctor');
  });

  it('requires exact final health and never runs doctor after an unknown final gate', async () => {
    const result = await runHelper({
      statuses: [status({ stale: true }), '__FAIL__', '{bad', '__EMPTY__'],
    });
    expect(result.code).not.toBe(0);
    expect(result.calls).not.toContain('doctor');
  });

  it.each([
    ['status attempts', { CODESPACE_RUNTIME_STATUS_MAX_ATTEMPTS: '0' }],
    ['status retry delay', { CODESPACE_RUNTIME_STATUS_RETRY_DELAY_SECONDS: '-1' }],
    ['status timeout', { CODESPACE_RUNTIME_STATUS_TIMEOUT_SECONDS: '0' }],
    ['stop timeout', { CODESPACE_STOP_TIMEOUT_SECONDS: '0' }],
    ['connect attempts', { CODESPACE_CONNECT_MAX_ATTEMPTS: '0' }],
    ['connect retry delay', { CODESPACE_CONNECT_RETRY_DELAY_SECONDS: '-1' }],
    ['connect timeout', { CODESPACE_CONNECT_TIMEOUT_SECONDS: '0' }],
    ['doctor attempts', { CODESPACE_DOCTOR_MAX_ATTEMPTS: '0' }],
    ['doctor retry delay', { CODESPACE_DOCTOR_RETRY_DELAY_SECONDS: '-1' }],
    ['doctor timeout', { CODESPACE_DOCTOR_TIMEOUT_SECONDS: '0' }],
  ])('rejects invalid %s before any destructive action', async (_name, env) => {
    const result = await runHelper({
      force: true,
      statuses: [status(), status()],
      env,
    });
    expect(result.code).not.toBe(0);
    expect(result.calls).not.toContain('runtimes stop');
    expect(result.calls).not.toContain('runtimes connect');
    expect(result.calls).not.toContain('doctor');
  });

  it('passes status payload through a non-environment channel', async () => {
    const canary = 'unexpected-status-canary-secret';
    const result = await runHelper({
      statuses: [status({ unexpected_note: canary })],
    });
    const transcript = `${result.stdout}\n${result.stderr}\n${result.calls}\n${result.children}\n${result.classifierEnvironment}`;
    expect(result.code).toBe(0);
    expect(result.classifierEnvironment).toContain('STATUS_JSON=unset');
    expect(result.classifierEnvironment).toContain('canary=absent');
    expect(transcript).not.toContain(canary);
  });

  it('sanitizes raw credentials, passes only the exact file ref, and closes lock fd in every child', async () => {
    const result = await runHelper({
      force: true,
      statuses: [status(), status()],
      secret: 'decoy-z2-raw-secret',
    });
    const transcript = `${result.stdout}\n${result.stderr}\n${result.calls}\n${result.children}`;
    expect(transcript).not.toContain(result.secret);
    expect(result.calls).toContain(`--runtime-api-key file:${path.join(base, 'runtime-key')}`);
    expect(result.calls).not.toContain('env:CONTROL_PLANE_API_KEY');
    expect(lines(result.children).length).toBeGreaterThan(0);
    expect(lines(result.children).every((line) => line === 'secret=unset fd=closed')).toBe(true);
  });
});
