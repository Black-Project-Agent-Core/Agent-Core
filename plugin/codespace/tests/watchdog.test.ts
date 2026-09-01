import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  computeRepairTimeoutMs,
  evaluateBridgeHealth,
  readNewTunnelLogLines,
  type RuntimeStatus,
  type WatchdogState,
} from '../src/watchdog.js';

const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repairBridge = path.join(pluginRoot, 'scripts', 'repair-bridge.sh');
const expectedTunnelId = 'tunnel_expected';
const expectedMcpServerUrl = 'http://127.0.0.1:38765/mcp';
const expectedRuntimeApiKeyRef = 'file:/workspaces/Agent-Core/secrets/github/CONTROL_PLANE_API_KEY';
const nowMs = 1_000_000;

const healthyStatus: RuntimeStatus = {
  process_running: true,
  healthy: true,
  ready: true,
  runtime_state: 'ready',
  stale: false,
  tunnel_id: expectedTunnelId,
  remote_lookup_attempted: true,
  remote_error: '',
  remote_lookup_auth_ref: expectedRuntimeApiKeyRef,
  remote: { id: expectedTunnelId },
  process: { target_kind: 'server_url', target_value: expectedMcpServerUrl },
};

const failureLine = (source: 'client_internal' | 'transport_closed' = 'client_internal') => JSON.stringify({
  level: 'ERROR',
  msg: 'dispatcher received MCP upstream error; posted error response to control plane',
  component: 'dispatcher',
  status_code: 502,
  failure_source: source,
  transport_error_kind: source === 'transport_closed' ? 'eof' : undefined,
  upstream_response_received: false,
});

const successLine = () => JSON.stringify({
  level: 'INFO',
  msg: 'dispatcher forwarded command to MCP server',
  component: 'dispatcher',
});

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateBridgeHealth({
    localMcpHealthy: true,
    runtimeObservation: { state: 'healthy', status: healthyStatus },
    expectedTunnelId,
    expectedMcpServerUrl,
    expectedRuntimeApiKeyRef,
    newLogLines: [],
    previousFailureStreak: 0,
    routeGeneration: 0,
    failureThreshold: 3,
    nowMs,
    lastReconnectAt: 0,
    reconnectCooldownMs: 60_000,
    ...overrides,
  } as Parameters<typeof evaluateBridgeHealth>[0]);
}

describe('codespace watchdog staged action classifier', () => {
  it('keeps an exactly healthy route running', () => {
    expect(evaluate()).toMatchObject({ action: 'none', reason: 'healthy', failureStreak: 0 });
  });

  it('repairs only local MCP when it is unavailable and runtime is healthy', () => {
    expect(evaluate({ localMcpHealthy: false })).toMatchObject({
      action: 'local-mcp',
      reason: 'local_mcp_unhealthy',
    });
  });

  it('reconnects only for a proven unhealthy runtime', () => {
    expect(evaluate({
      runtimeObservation: { state: 'unhealthy', status: { ...healthyStatus, stale: true } },
    })).toMatchObject({ action: 'tunnel', reason: 'runtime_unhealthy' });
  });

  it('does nothing destructive when runtime status is unknown', () => {
    expect(evaluate({ runtimeObservation: { state: 'unknown' } })).toMatchObject({
      action: 'none',
      reason: 'runtime_status_unknown',
    });
  });

  it.each(['client_internal', 'transport_closed'] as const)(
    'routes the first threshold burst for %s through local repair only',
    (source) => {
      expect(evaluate({ newLogLines: [failureLine(source), failureLine(source), failureLine(source)] }))
        .toMatchObject({ action: 'local-mcp', reason: 'repeated_route_failure', failureStreak: 3 });
    },
  );

  it('routes a second threshold burst in generation 1 through one tunnel reconnect', () => {
    expect(evaluate({
      routeGeneration: 1,
      newLogLines: [failureLine('transport_closed'), failureLine('transport_closed'), failureLine('transport_closed')],
    })).toMatchObject({ action: 'tunnel', reason: 'repeated_route_failure' });
  });

  it('does not repair after one transient EOF below threshold', () => {
    expect(evaluate({ newLogLines: [failureLine('transport_closed')] }))
      .toMatchObject({ action: 'none', reason: 'healthy', failureStreak: 1 });
  });

  it('a successful forward or fresh runtime resets streak and route generation', () => {
    const fresh = JSON.stringify({ msg: '🟢 tunnel-client started' });
    expect(evaluate({
      routeGeneration: 1,
      previousFailureStreak: 2,
      newLogLines: [successLine()],
    })).toMatchObject({ action: 'none', failureStreak: 0, routeGeneration: 0 });
    expect(evaluate({
      routeGeneration: 1,
      previousFailureStreak: 2,
      newLogLines: [fresh],
    })).toMatchObject({ action: 'none', failureStreak: 0, routeGeneration: 0 });
  });

  it('uses a separate reconnect cooldown as a circuit breaker', () => {
    expect(evaluate({
      runtimeObservation: { state: 'unhealthy', status: { ...healthyStatus, stale: true } },
      lastReconnectAt: nowMs - 1_000,
    })).toMatchObject({ action: 'cooldown', reason: 'reconnect_cooldown' });
  });

  it('requires the exact credential file reference for runtime health', () => {
    for (const ref of ['file:/tmp/other', 'env:CONTROL_PLANE_API_KEY', undefined]) {
      expect(evaluate({
        runtimeObservation: {
          state: 'unhealthy',
          status: { ...healthyStatus, remote_lookup_auth_ref: ref },
        },
      })).toMatchObject({ action: 'tunnel', reason: 'runtime_unhealthy' });
    }
  });
});

describe('codespace watchdog repair timeout budget', () => {
  it('dominates the executable production leaf contract and helper retry budget', async () => {
    const { stdout } = await execFileAsync('/bin/bash', [repairBridge, '--print-budget-ms'], {
      cwd: pluginRoot,
      env: process.env,
      encoding: 'utf8',
    });
    const realLeafBudgetMs = Number(stdout.trim());
    expect(realLeafBudgetMs).toBeGreaterThan(1_200_000);

    const defaults = computeRepairTimeoutMs({});
    expect(defaults).toBeGreaterThan(realLeafBudgetMs + 165_000);

    const expanded = computeRepairTimeoutMs({
      CODESPACE_CONNECT_MAX_ATTEMPTS: '10',
      CODESPACE_CONNECT_TIMEOUT_SECONDS: '20',
      CODESPACE_CONNECT_RETRY_DELAY_SECONDS: '2',
    });
    expect(expanded).toBeGreaterThan(defaults);
  });

  it('accepts the maximum Node timer delay and rejects the first overflowing millisecond', () => {
    expect(computeRepairTimeoutMs({
      CODESPACE_WATCHDOG_REPAIR_TIMEOUT_MS: '2147483647',
    })).toBe(2_147_483_647);
    expect(() => computeRepairTimeoutMs({
      CODESPACE_WATCHDOG_REPAIR_TIMEOUT_MS: '2147483648',
    })).toThrow(/CODESPACE_WATCHDOG_REPAIR_TIMEOUT_MS.*2147483647/);
  });

  it('rejects a leaf timeout whose millisecond conversion cannot fit a Node timer', () => {
    expect(() => computeRepairTimeoutMs({
      CODESPACE_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS: '2147483.648',
    })).toThrow(/CODESPACE_LOCAL_MCP_ENSURE_TIMEOUT_SECONDS/);
  });
});

describe('codespace watchdog tunnel-log cursor', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('ignores historical failures and reads only newly appended complete records', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codespace-watchdog-'));
    const logPath = path.join(directory, 'codespace.log');
    await fs.writeFile(logPath, `${failureLine()}\n`, 'utf8');

    const initial = await readNewTunnelLogLines(logPath, undefined);
    expect(initial.lines).toEqual([]);

    await fs.appendFile(logPath, `${failureLine('transport_closed')}\n`, 'utf8');
    const appended = await readNewTunnelLogLines(logPath, initial.state);
    expect(appended.lines).toHaveLength(1);

    const unchanged = await readNewTunnelLogLines(logPath, appended.state as WatchdogState);
    expect(unchanged.lines).toEqual([]);
  });
});
