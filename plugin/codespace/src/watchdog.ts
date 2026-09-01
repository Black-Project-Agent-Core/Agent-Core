import { execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { PACKAGE_ROOT, RUNTIME_DIR, sanitizeEnvironment } from './constants.js';

const execFileAsync = promisify(execFile);
const DEFAULT_INTERVAL_MS = 2_000;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_RECONNECT_COOLDOWN_MS = 60_000;
const DEFAULT_FAILED_REPAIR_RETRY_MS = 5_000;
const LOCAL_MCP_CONFIG_TIMEOUT_SECONDS = 1;
const DEFAULT_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS = 1_420;
const DEFAULT_LOCAL_MCP_PROTOCOL_TIMEOUT_SECONDS = 15;
const DEFAULT_REPAIR_SAFETY_MS = 10_000;
const DEFAULT_REPAIR_KILL_GRACE_MS = 2_000;
const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;
const MAX_TIMER_SECONDS = MAX_NODE_TIMER_DELAY_MS / 1_000;
const MAX_RETRY_ATTEMPTS = 10_000;
const MAX_LOG_READ_BYTES = 2 * 1024 * 1024;

export interface RuntimeStatus {
  process_running?: boolean;
  healthy?: boolean;
  ready?: boolean;
  runtime_state?: string;
  stale?: boolean;
  tunnel_id?: string;
  remote_lookup_attempted?: boolean;
  remote_error?: string;
  remote_lookup_auth_ref?: string;
  remote?: { id?: string };
  process?: { target_kind?: string; target_value?: string };
}

export type RuntimeStatusObservation =
  | { state: 'healthy'; status: RuntimeStatus }
  | { state: 'unhealthy'; status: RuntimeStatus }
  | { state: 'unknown'; status?: undefined };

export interface WatchdogState {
  version?: number;
  logInode?: number;
  logOffset: number;
  logRemainder?: string;
  failureStreak?: number;
  routeGeneration?: number;
  lastLocalRepairAt?: number;
  lastReconnectAt?: number;
  lastRepairAttemptAt?: number;
}

export interface BridgeHealthInput {
  localMcpHealthy: boolean;
  runtimeObservation: RuntimeStatusObservation;
  expectedTunnelId: string;
  expectedMcpServerUrl: string;
  expectedRuntimeApiKeyRef: string;
  newLogLines: string[];
  previousFailureStreak: number;
  routeGeneration: number;
  failureThreshold: number;
  nowMs: number;
  lastReconnectAt: number;
  reconnectCooldownMs: number;
  lastRepairAttemptAt?: number;
  failedRepairRetryMs?: number;
}

export type RepairAction = 'none' | 'local-mcp' | 'tunnel' | 'cooldown';

export interface RepairDecision {
  action: RepairAction;
  reason:
    | 'healthy'
    | 'local_mcp_unhealthy'
    | 'runtime_unhealthy'
    | 'runtime_status_unknown'
    | 'repeated_route_failure'
    | 'reconnect_cooldown'
    | 'repair_retry_wait';
  failureStreak: number;
  routeGeneration: number;
}

interface TunnelLogRecord {
  msg?: unknown;
  component?: unknown;
  status_code?: unknown;
  failure_source?: unknown;
  transport_error_kind?: unknown;
  upstream_response_received?: unknown;
}

function isRouteFailure(record: TunnelLogRecord): boolean {
  if (
    record.component !== 'dispatcher'
    || record.msg !== 'dispatcher received MCP upstream error; posted error response to control plane'
    || record.status_code !== 502
    || record.upstream_response_received !== false
  ) return false;
  return record.failure_source === 'client_internal'
    || (
      record.failure_source === 'transport_closed'
      && record.transport_error_kind === 'eof'
    );
}

function isSuccessfulForward(record: TunnelLogRecord): boolean {
  return record.component === 'dispatcher'
    && record.msg === 'dispatcher forwarded command to MCP server';
}

function isFreshRuntime(record: TunnelLogRecord): boolean {
  return record.msg === '🟢 tunnel-client started';
}

function updateRouteEvidence(
  lines: string[],
  previousFailureStreak: number,
): { failureStreak: number; resetGeneration: boolean } {
  let failureStreak = Math.max(0, previousFailureStreak);
  let resetGeneration = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    let record: TunnelLogRecord;
    try {
      record = JSON.parse(line) as TunnelLogRecord;
    } catch {
      continue;
    }
    if (isSuccessfulForward(record) || isFreshRuntime(record)) {
      failureStreak = 0;
      resetGeneration = true;
    } else if (isRouteFailure(record)) {
      failureStreak += 1;
    }
  }
  return { failureStreak, resetGeneration };
}

export function updateFailureStreak(lines: string[], previousFailureStreak: number): number {
  return updateRouteEvidence(lines, previousFailureStreak).failureStreak;
}

function structurallyClassifiable(status: RuntimeStatus): boolean {
  return typeof status.process_running === 'boolean'
    && typeof status.healthy === 'boolean'
    && typeof status.ready === 'boolean'
    && typeof status.runtime_state === 'string'
    && typeof status.stale === 'boolean'
    && typeof status.tunnel_id === 'string'
    && typeof status.remote_lookup_attempted === 'boolean'
    && typeof status.remote_error === 'string'
    && status.remote !== null
    && typeof status.remote === 'object'
    && typeof status.remote.id === 'string'
    && status.process !== null
    && typeof status.process === 'object'
    && typeof status.process.target_kind === 'string'
    && typeof status.process.target_value === 'string'
    && (
      status.remote_lookup_auth_ref === undefined
      || typeof status.remote_lookup_auth_ref === 'string'
    );
}

export function classifyRuntimeStatus(
  status: RuntimeStatus,
  expectedTunnelId: string,
  expectedMcpServerUrl: string,
  expectedRuntimeApiKeyRef: string,
): RuntimeStatusObservation {
  if (!structurallyClassifiable(status)) return { state: 'unknown' };
  const healthy = status.process_running === true
    && status.healthy === true
    && status.ready === true
    && status.runtime_state === 'ready'
    && status.stale === false
    && status.tunnel_id === expectedTunnelId
    && status.remote_lookup_attempted === true
    && status.remote_error === ''
    && status.remote?.id === expectedTunnelId
    && status.remote_lookup_auth_ref === expectedRuntimeApiKeyRef
    && status.process?.target_kind === 'server_url'
    && status.process?.target_value === expectedMcpServerUrl;
  return healthy ? { state: 'healthy', status } : { state: 'unhealthy', status };
}

export function evaluateBridgeHealth(input: BridgeHealthInput): RepairDecision {
  const evidence = updateRouteEvidence(input.newLogLines, input.previousFailureStreak);
  const routeGeneration = evidence.resetGeneration ? 0 : Math.max(0, input.routeGeneration);
  const base = { failureStreak: evidence.failureStreak, routeGeneration };

  let action: 'local-mcp' | 'tunnel' | undefined;
  let reason: 'local_mcp_unhealthy' | 'runtime_unhealthy' | 'repeated_route_failure' | undefined;

  if (!input.localMcpHealthy) {
    action = 'local-mcp';
    reason = 'local_mcp_unhealthy';
  } else if (input.runtimeObservation.state === 'unknown') {
    return { action: 'none', reason: 'runtime_status_unknown', ...base };
  } else if (input.runtimeObservation.state === 'unhealthy') {
    action = 'tunnel';
    reason = 'runtime_unhealthy';
  } else if (evidence.failureStreak >= input.failureThreshold) {
    action = routeGeneration === 0 ? 'local-mcp' : 'tunnel';
    reason = 'repeated_route_failure';
  }

  if (!action || !reason) return { action: 'none', reason: 'healthy', ...base };

  const failedRepairRetryMs = input.failedRepairRetryMs ?? DEFAULT_FAILED_REPAIR_RETRY_MS;
  const lastAttempt = input.lastRepairAttemptAt ?? 0;
  if (lastAttempt > 0 && input.nowMs - lastAttempt < failedRepairRetryMs) {
    return { action: 'cooldown', reason: 'repair_retry_wait', ...base };
  }
  if (
    action === 'tunnel'
    && input.lastReconnectAt > 0
    && input.nowMs - input.lastReconnectAt < input.reconnectCooldownMs
  ) {
    return { action: 'cooldown', reason: 'reconnect_cooldown', ...base };
  }
  return { action, reason, ...base };
}

export async function readNewTunnelLogLines(
  logPath: string,
  previousState: WatchdogState | undefined,
): Promise<{ lines: string[]; state: WatchdogState }> {
  let stat;
  try {
    stat = await fs.stat(logPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        lines: [],
        state: {
          ...previousState,
          version: 2,
          logInode: undefined,
          logOffset: 0,
          logRemainder: '',
        },
      };
    }
    throw error;
  }

  const sameFile = previousState?.logInode === stat.ino
    && stat.size >= (previousState?.logOffset ?? 0);
  if (!previousState || !sameFile) {
    return {
      lines: [],
      state: {
        ...previousState,
        version: 2,
        logInode: stat.ino,
        logOffset: stat.size,
        logRemainder: '',
      },
    };
  }
  if (stat.size === previousState.logOffset) {
    return { lines: [], state: { ...previousState, version: 2, logInode: stat.ino } };
  }

  const availableBytes = stat.size - previousState.logOffset;
  const bytesToRead = Math.min(availableBytes, MAX_LOG_READ_BYTES);
  const start = stat.size - bytesToRead;
  const handle = await fs.open(logPath, 'r');
  let text = '';
  try {
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, start);
    text = buffer.toString('utf8');
  } finally {
    await handle.close();
  }

  const prefix = start === previousState.logOffset ? previousState.logRemainder ?? '' : '';
  const records = `${prefix}${text}`.split(/\r?\n/);
  const remainder = records.pop() ?? '';
  return {
    lines: records,
    state: {
      ...previousState,
      version: 2,
      logInode: stat.ino,
      logOffset: stat.size,
      logRemainder: remainder,
    },
  };
}

interface WatchdogConfig {
  alias: string;
  bin: string;
  stateDir: string;
  stateFile: string;
  tunnelLog: string;
  expectedTunnelId: string;
  expectedMcpServerUrl: string;
  expectedRuntimeApiKeyFile: string;
  expectedRuntimeApiKeyRef: string;
  healthUrl: string;
  repairScript: string;
  intervalMs: number;
  failureThreshold: number;
  reconnectCooldownMs: number;
  failedRepairRetryMs: number;
  repairTimeoutMs: number;
  repairKillGraceMs: number;
  once: boolean;
  checkOnly: boolean;
}

function positiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be a positive integer at most ${maximum}.`);
  }
  return value;
}

function positiveNumber(
  raw: string | undefined,
  fallback: number,
  name: string,
  maximum = Number.MAX_VALUE,
): number {
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be positive and at most ${maximum}.`);
  }
  return value;
}

function nonnegativeNumber(
  raw: string | undefined,
  fallback: number,
  name: string,
  maximum = Number.MAX_VALUE,
): number {
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be nonnegative and at most ${maximum}.`);
  }
  return value;
}

export function computeRepairTimeoutMs(
  env: Record<string, string | undefined>,
): number {
  const attempts = (raw: string | undefined, fallback: number, name: string) =>
    positiveInteger(raw, fallback, name, MAX_RETRY_ATTEMPTS);
  const seconds = (raw: string | undefined, fallback: number, name: string) =>
    positiveNumber(raw, fallback, name, MAX_TIMER_SECONDS);
  const delaySeconds = (raw: string | undefined, fallback: number, name: string) =>
    nonnegativeNumber(raw, fallback, name, MAX_TIMER_SECONDS);

  const statusAttempts = attempts(env.CODESPACE_RUNTIME_STATUS_MAX_ATTEMPTS, 3, 'CODESPACE_RUNTIME_STATUS_MAX_ATTEMPTS');
  const statusTimeout = seconds(env.CODESPACE_RUNTIME_STATUS_TIMEOUT_SECONDS, 5, 'CODESPACE_RUNTIME_STATUS_TIMEOUT_SECONDS');
  const statusDelay = delaySeconds(env.CODESPACE_RUNTIME_STATUS_RETRY_DELAY_SECONDS, 1, 'CODESPACE_RUNTIME_STATUS_RETRY_DELAY_SECONDS');
  const stopTimeout = seconds(env.CODESPACE_STOP_TIMEOUT_SECONDS, 5, 'CODESPACE_STOP_TIMEOUT_SECONDS');
  const connectAttempts = attempts(env.CODESPACE_CONNECT_MAX_ATTEMPTS, 5, 'CODESPACE_CONNECT_MAX_ATTEMPTS');
  const connectTimeout = seconds(env.CODESPACE_CONNECT_TIMEOUT_SECONDS, 15, 'CODESPACE_CONNECT_TIMEOUT_SECONDS');
  const connectDelay = delaySeconds(env.CODESPACE_CONNECT_RETRY_DELAY_SECONDS, 1, 'CODESPACE_CONNECT_RETRY_DELAY_SECONDS');
  const doctorAttempts = attempts(env.CODESPACE_DOCTOR_MAX_ATTEMPTS, 3, 'CODESPACE_DOCTOR_MAX_ATTEMPTS');
  const doctorTimeout = seconds(env.CODESPACE_DOCTOR_TIMEOUT_SECONDS, 15, 'CODESPACE_DOCTOR_TIMEOUT_SECONDS');
  const doctorDelay = delaySeconds(env.CODESPACE_DOCTOR_RETRY_DELAY_SECONDS, 1, 'CODESPACE_DOCTOR_RETRY_DELAY_SECONDS');
  const lockTimeout = seconds(env.CODESPACE_RUNTIME_LOCK_TIMEOUT_SECONDS, 30, 'CODESPACE_RUNTIME_LOCK_TIMEOUT_SECONDS');
  const ensureTimeout = seconds(
    env.CODESPACE_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS,
    DEFAULT_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS,
    'CODESPACE_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS',
  );
  const protocolTimeout = seconds(
    env.CODESPACE_LOCAL_MCP_PROTOCOL_TIMEOUT_SECONDS,
    DEFAULT_LOCAL_MCP_PROTOCOL_TIMEOUT_SECONDS,
    'CODESPACE_LOCAL_MCP_PROTOCOL_TIMEOUT_SECONDS',
  );
  const safetyMs = positiveInteger(
    env.CODESPACE_WATCHDOG_REPAIR_SAFETY_MS,
    DEFAULT_REPAIR_SAFETY_MS,
    'CODESPACE_WATCHDOG_REPAIR_SAFETY_MS',
    MAX_NODE_TIMER_DELAY_MS,
  );

  const phaseSeconds = (phaseAttempts: number, timeout: number, delay: number) =>
    phaseAttempts * timeout + Math.max(0, phaseAttempts - 1) * delay;
  const helperSeconds =
    2 * phaseSeconds(statusAttempts, statusTimeout, statusDelay)
    + stopTimeout
    + phaseSeconds(connectAttempts, connectTimeout, connectDelay)
    + phaseSeconds(doctorAttempts, doctorTimeout, doctorDelay);
  const computed = Math.ceil(
    (LOCAL_MCP_CONFIG_TIMEOUT_SECONDS + ensureTimeout + protocolTimeout + lockTimeout + helperSeconds) * 1_000 + safetyMs,
  );
  if (!Number.isSafeInteger(computed) || computed > MAX_NODE_TIMER_DELAY_MS) {
    throw new Error(
      `Computed repair timeout must be at most ${MAX_NODE_TIMER_DELAY_MS} milliseconds.`,
    );
  }
  const requested = env.CODESPACE_WATCHDOG_REPAIR_TIMEOUT_MS
    ? positiveInteger(
      env.CODESPACE_WATCHDOG_REPAIR_TIMEOUT_MS,
      computed,
      'CODESPACE_WATCHDOG_REPAIR_TIMEOUT_MS',
      MAX_NODE_TIMER_DELAY_MS,
    )
    : computed;
  return Math.max(computed, requested);
}

async function readExpectedTunnelId(): Promise<string> {
  const configured = process.env.CODESPACE_EXPECTED_TUNNEL_ID?.trim();
  if (configured) return configured;
  const defaults = JSON.parse(
    await fs.readFile(path.join(PACKAGE_ROOT, 'config', 'tunnel.defaults.json'), 'utf8'),
  ) as { tunnelId?: unknown };
  if (typeof defaults.tunnelId !== 'string' || !/^tunnel_[A-Za-z0-9_-]+$/.test(defaults.tunnelId)) {
    throw new Error('Tracked tunnel identity is unavailable or invalid.');
  }
  return defaults.tunnelId;
}

async function readExpectedMcpServerUrl(): Promise<string> {
  const configured = process.env.CODESPACE_MCP_SERVER_URL?.trim();
  if (configured) return configured;
  return (await fs.readFile(path.join(RUNTIME_DIR, 'state', 'http-mcp.url'), 'utf8')).trim();
}

async function loadConfig(): Promise<WatchdogConfig> {
  const expectedTunnelId = await readExpectedTunnelId();
  const expectedMcpServerUrl = await readExpectedMcpServerUrl();
  const parsedUrl = new URL(expectedMcpServerUrl);
  if (parsedUrl.protocol !== 'http:' || parsedUrl.hostname !== '127.0.0.1' || parsedUrl.pathname !== '/mcp') {
    throw new Error('Watchdog MCP URL must be a loopback Streamable HTTP endpoint.');
  }
  parsedUrl.pathname = '/healthz';
  const expectedRuntimeApiKeyFile = process.env.CODESPACE_RUNTIME_API_KEY_FILE?.trim()
    || path.resolve(PACKAGE_ROOT, '..', '..', 'secrets', 'github', 'CONTROL_PLANE_API_KEY');
  const expectedRuntimeApiKeyRef = `file:${expectedRuntimeApiKeyFile}`;

  return {
    alias: process.env.CODESPACE_TUNNEL_ALIAS?.trim() || 'codespace',
    bin: process.env.CODESPACE_TUNNEL_CLIENT_BIN?.trim() || path.join(RUNTIME_DIR, 'bin', 'tunnel-client'),
    stateDir: process.env.TUNNEL_CLIENT_STATE_DIR?.trim() || path.join(RUNTIME_DIR, 'state'),
    stateFile: process.env.CODESPACE_WATCHDOG_STATE_FILE?.trim() || path.join(RUNTIME_DIR, 'state', 'watchdog.json'),
    tunnelLog: process.env.CODESPACE_TUNNEL_LOG_FILE?.trim() || path.join(RUNTIME_DIR, 'state', 'logs', 'codespace.log'),
    expectedTunnelId,
    expectedMcpServerUrl,
    expectedRuntimeApiKeyFile,
    expectedRuntimeApiKeyRef,
    healthUrl: parsedUrl.toString(),
    repairScript: process.env.CODESPACE_REPAIR_BRIDGE_SCRIPT?.trim() || path.join(PACKAGE_ROOT, 'scripts', 'repair-bridge.sh'),
    intervalMs: positiveInteger(
      process.env.CODESPACE_WATCHDOG_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      'CODESPACE_WATCHDOG_INTERVAL_MS',
      MAX_NODE_TIMER_DELAY_MS,
    ),
    failureThreshold: positiveInteger(
      process.env.CODESPACE_WATCHDOG_FAILURE_THRESHOLD,
      DEFAULT_FAILURE_THRESHOLD,
      'CODESPACE_WATCHDOG_FAILURE_THRESHOLD',
      MAX_RETRY_ATTEMPTS,
    ),
    reconnectCooldownMs: positiveInteger(
      process.env.CODESPACE_WATCHDOG_RECONNECT_COOLDOWN_MS ?? process.env.CODESPACE_WATCHDOG_COOLDOWN_MS,
      DEFAULT_RECONNECT_COOLDOWN_MS,
      'CODESPACE_WATCHDOG_RECONNECT_COOLDOWN_MS',
      MAX_NODE_TIMER_DELAY_MS,
    ),
    failedRepairRetryMs: positiveInteger(
      process.env.CODESPACE_WATCHDOG_FAILED_REPAIR_RETRY_MS,
      DEFAULT_FAILED_REPAIR_RETRY_MS,
      'CODESPACE_WATCHDOG_FAILED_REPAIR_RETRY_MS',
      MAX_NODE_TIMER_DELAY_MS,
    ),
    repairTimeoutMs: computeRepairTimeoutMs(process.env),
    repairKillGraceMs: positiveInteger(
      process.env.CODESPACE_WATCHDOG_REPAIR_KILL_GRACE_MS,
      DEFAULT_REPAIR_KILL_GRACE_MS,
      'CODESPACE_WATCHDOG_REPAIR_KILL_GRACE_MS',
      MAX_NODE_TIMER_DELAY_MS,
    ),
    once: process.argv.includes('--once'),
    checkOnly: process.argv.includes('--check-only'),
  };
}

async function loadState(stateFile: string): Promise<WatchdogState | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(stateFile, 'utf8')) as WatchdogState;
    return typeof parsed.logOffset === 'number' ? parsed : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function saveState(stateFile: string, state: WatchdogState): Promise<void> {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const temporaryPath = `${stateFile}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify({ ...state, version: 2 })}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.rename(temporaryPath, stateFile);
  await fs.chmod(stateFile, 0o600);
}

async function probeLocalHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function readRuntimeStatus(config: Pick<
WatchdogConfig,
'bin' | 'alias' | 'stateDir' | 'expectedTunnelId' | 'expectedMcpServerUrl' | 'expectedRuntimeApiKeyRef'
>): Promise<RuntimeStatusObservation> {
  try {
    const { stdout } = await execFileAsync(
      config.bin,
      ['runtimes', 'status', config.alias, '--json'],
      {
        env: { ...sanitizeEnvironment(), TUNNEL_CLIENT_STATE_DIR: config.stateDir },
        timeout: 5_000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: 'utf8',
      },
    );
    const parsed = JSON.parse(stdout) as RuntimeStatus;
    return classifyRuntimeStatus(
      parsed,
      config.expectedTunnelId,
      config.expectedMcpServerUrl,
      config.expectedRuntimeApiKeyRef,
    );
  } catch {
    return { state: 'unknown' };
  }
}

function collectDescendantPids(rootPid: number, seen = new Set<number>()): Set<number> {
  let children: number[] = [];
  try {
    children = readFileSync(`/proc/${rootPid}/task/${rootPid}/children`, 'utf8')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return seen;
  }
  for (const pid of children) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    collectDescendantPids(pid, seen);
  }
  return seen;
}

interface BoundedProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stderr: string;
}

async function runBoundedProcessGroup(
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    killGraceMs: number;
  },
): Promise<BoundedProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    let timedOut = false;
    let closeSeen = false;
    let graceDone = false;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let settled = false;
    let graceTimer: NodeJS.Timeout | undefined;
    const trackedDescendants = new Set<number>();

    const killPid = (pid: number, signal: NodeJS.Signals) => {
      try {
        process.kill(pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    };
    const killGroup = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    };
    const finishIfReady = () => {
      if (settled || !closeSeen || (timedOut && !graceDone)) return;
      settled = true;
      resolve({ code: exitCode, signal: exitSignal, timedOut, stderr });
    };

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4 * 1024 * 1024);
    });
    child.once('error', (error) => {
      if (!child.pid) {
        settled = true;
        reject(error);
      }
    });
    child.once('close', (code, signal) => {
      closeSeen = true;
      exitCode = code;
      exitSignal = signal;
      if (!timedOut) {
        clearTimeout(timeoutTimer);
        if (graceTimer) clearTimeout(graceTimer);
      }
      finishIfReady();
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        for (const pid of collectDescendantPids(child.pid)) trackedDescendants.add(pid);
      }
      try {
        killGroup('SIGTERM');
        for (const pid of trackedDescendants) killPid(pid, 'SIGTERM');
      } catch (error) {
        settled = true;
        reject(error);
        return;
      }
      graceTimer = setTimeout(() => {
        if (child.pid) {
          for (const pid of collectDescendantPids(child.pid)) trackedDescendants.add(pid);
        }
        for (const pid of [...trackedDescendants]) {
          for (const descendant of collectDescendantPids(pid)) trackedDescendants.add(descendant);
        }
        try {
          killGroup('SIGKILL');
          for (const pid of trackedDescendants) killPid(pid, 'SIGKILL');
        } catch (error) {
          settled = true;
          reject(error);
          return;
        }
        graceDone = true;
        finishIfReady();
      }, options.killGraceMs);
    }, options.timeoutMs);
  });
}

async function runRepair(config: WatchdogConfig, action: 'local-mcp' | 'tunnel', reason: string): Promise<boolean> {
  const safeReason = reason.replace(/[^A-Za-z0-9._-]/g, '_');
  console.error(`[codespace-watchdog] repair starting scope=${action} reason=${safeReason}`);
  try {
    const result = await runBoundedProcessGroup(
      '/bin/bash',
      [config.repairScript, '--scope', action, '--reason', safeReason],
      {
        cwd: PACKAGE_ROOT,
        env: {
          ...sanitizeEnvironment(),
          CODESPACE_WATCHDOG_ACTIVE: '1',
          CODESPACE_EXPECTED_TUNNEL_ID: config.expectedTunnelId,
          CODESPACE_MCP_SERVER_URL: config.expectedMcpServerUrl,
          CODESPACE_RUNTIME_API_KEY_FILE: config.expectedRuntimeApiKeyFile,
          CODESPACE_RUNTIME_API_KEY_REF: config.expectedRuntimeApiKeyRef,
          CODESPACE_TUNNEL_CLIENT_BIN: config.bin,
          TUNNEL_CLIENT_STATE_DIR: config.stateDir,
        },
        timeoutMs: config.repairTimeoutMs,
        killGraceMs: config.repairKillGraceMs,
      },
    );
    if (result.timedOut) {
      console.error(`[codespace-watchdog] repair timed out scope=${action} reason=${safeReason} budget_ms=${config.repairTimeoutMs}`);
      return false;
    }
    if (result.code !== 0) {
      console.error(`[codespace-watchdog] repair failed scope=${action} reason=${safeReason} code=${result.code} signal=${result.signal ?? 'none'} error=${result.stderr.slice(-500)}`);
      return false;
    }
    console.error(`[codespace-watchdog] repair completed scope=${action} reason=${safeReason}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codespace-watchdog] repair failed scope=${action} reason=${safeReason} error=${message.slice(0, 500)}`);
    return false;
  }
}

async function runIteration(config: WatchdogConfig): Promise<void> {
  const previousState = await loadState(config.stateFile);
  const logRead = await readNewTunnelLogLines(config.tunnelLog, previousState);
  const nowMs = Date.now();
  const [localMcpHealthy, runtimeObservation] = await Promise.all([
    probeLocalHealth(config.healthUrl),
    readRuntimeStatus(config),
  ]);
  const decision = evaluateBridgeHealth({
    localMcpHealthy,
    runtimeObservation,
    expectedTunnelId: config.expectedTunnelId,
    expectedMcpServerUrl: config.expectedMcpServerUrl,
    expectedRuntimeApiKeyRef: config.expectedRuntimeApiKeyRef,
    newLogLines: logRead.lines,
    previousFailureStreak: previousState?.failureStreak ?? 0,
    routeGeneration: previousState?.routeGeneration ?? 0,
    failureThreshold: config.failureThreshold,
    nowMs,
    lastReconnectAt: previousState?.lastReconnectAt ?? 0,
    reconnectCooldownMs: config.reconnectCooldownMs,
    lastRepairAttemptAt: previousState?.lastRepairAttemptAt ?? 0,
    failedRepairRetryMs: config.failedRepairRetryMs,
  });

  if (config.checkOnly) {
    if (decision.action === 'local-mcp' || decision.action === 'tunnel') {
      console.error(`[codespace-watchdog] check-only would-repair scope=${decision.action} reason=${decision.reason}`);
    }
    return;
  }

  const nextState: WatchdogState = {
    ...logRead.state,
    failureStreak: decision.failureStreak,
    routeGeneration: decision.routeGeneration,
    lastLocalRepairAt: previousState?.lastLocalRepairAt ?? 0,
    lastReconnectAt: previousState?.lastReconnectAt ?? 0,
    lastRepairAttemptAt: previousState?.lastRepairAttemptAt ?? 0,
  };

  if (decision.action === 'local-mcp' || decision.action === 'tunnel') {
    nextState.lastRepairAttemptAt = nowMs;
    const repaired = await runRepair(config, decision.action, decision.reason);
    if (repaired) {
      nextState.failureStreak = 0;
      nextState.lastRepairAttemptAt = 0;
      if (decision.action === 'local-mcp') {
        nextState.routeGeneration =
          decision.reason === 'repeated_route_failure' && decision.routeGeneration === 0
            ? 1
            : decision.routeGeneration;
        nextState.lastLocalRepairAt = nowMs;
      } else {
        nextState.routeGeneration = 0;
        nextState.lastReconnectAt = nowMs;
      }
    }
  }
  await saveState(config.stateFile, nextState);
}

async function main(): Promise<void> {
  delete process.env.CONTROL_PLANE_API_KEY;
  delete process.env.OPENAI_ADMIN_KEY;
  const config = await loadConfig();
  do {
    try {
      await runIteration(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[codespace-watchdog] iteration failed: ${message.slice(0, 500)}`);
    }
    if (!config.once) await sleep(config.intervalMs);
  } while (!config.once);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codespace-watchdog] startup failed: ${message.slice(0, 500)}`);
    process.exitCode = 1;
  });
}
