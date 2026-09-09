import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { MaintenanceConfig } from '../src/config.js';
import { LocalMaintenanceCoordinator } from '../src/runtime/maintenance.js';
import { RuntimeMetricRegistry } from '../src/runtime/metric-window.js';
import { loadConfig } from '../src/config.js';
import { createRuntimeServices } from '../src/runtime/services.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function maintenanceConfig(enabled = true): MaintenanceConfig {
  return {
    enabled,
    intervalMs: 1_000,
    retentionOlderThanMs: 30_000,
    retentionPlanRoot: '/private/retention-plan-root',
  };
}

function retentionResult(count = 3) {
  return {
    planPath: '/private/retention-plan-root/secret-plan.json',
    plan: {
      format: 'agent-core-execution-retention-plan',
      version: 1,
      planId: 'a'.repeat(64),
      createdAt: new Date(0).toISOString(),
      dryRun: true,
      logRoot: '/private/execution/logs',
      olderThanMs: 30_000,
      cutoffAt: new Date(0).toISOString(),
      totalBytes: count * 10,
      candidates: Array.from({ length: count }, (_, index) => ({ path: `run/${index}.stdout.log` })),
    },
  } as any;
}

async function eventually(assertion: () => void | Promise<void>, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try { await assertion(); return; }
    catch (error) { last = error; await new Promise((resolve) => setImmediate(resolve)); }
  }
  throw last;
}

describe('safe local maintenance coordinator', () => {
  it('is disabled by default behavior and creates no timer or maintenance work when disabled', async () => {
    let scheduled = 0;
    let calls = 0;
    const coordinator = new LocalMaintenanceCoordinator(maintenanceConfig(false), {
      logRoot: '/private/execution/logs',
      memoryStatus: async () => { calls += 1; return { integrity: 'ok' }; },
      executionHealth: async () => { calls += 1; return { integrity: 'ok' }; },
      planRetention: async () => { calls += 1; return retentionResult(); },
      setInterval: () => { scheduled += 1; return {} as any; },
      clearInterval: () => {},
      now: () => 100,
    });

    coordinator.start();
    await coordinator.runNow();
    expect(scheduled).toBe(0);
    expect(calls).toBe(0);
    expect(coordinator.status()).toMatchObject({
      enabled: false,
      running: false,
      runCount: 0,
      retentionCandidates: 0,
      overdue: false,
    });
  });

  it('schedules one unref-like interval, runs only integrity plus retention dry-run work, records bounded evidence, and closes cleanly', async () => {
    let now = 1_000;
    let callback: (() => void) | undefined;
    let intervalMs = 0;
    let clears = 0;
    const calls = { memory: 0, execution: 0, retention: 0 };
    const audit: Array<Record<string, unknown>> = [];
    const metrics = new RuntimeMetricRegistry();
    const coordinator = new LocalMaintenanceCoordinator(maintenanceConfig(true), {
      logRoot: '/private/execution/logs',
      memoryStatus: async () => { calls.memory += 1; return { integrity: 'ok' }; },
      executionHealth: async () => { calls.execution += 1; return { integrity: 'ok' }; },
      planRetention: async () => { calls.retention += 1; return retentionResult(3); },
      audit: { logRuntime: (_category, _event, data = {}) => { audit.push(data); } },
      metrics,
      now: () => now,
      setInterval: (fn, ms) => { callback = fn; intervalMs = ms; return { unref() {} } as any; },
      clearInterval: () => { clears += 1; },
    });

    coordinator.start();
    coordinator.start();
    expect(intervalMs).toBe(1_000);
    expect(coordinator.status()).toMatchObject({ enabled: true, runCount: 0, nextRunAt: 2_000, overdue: false });

    now = 2_000;
    callback?.();
    await eventually(() => expect(coordinator.status().runCount).toBe(1));
    expect(calls).toEqual({ memory: 1, execution: 1, retention: 1 });
    expect(coordinator.status()).toMatchObject({
      enabled: true,
      running: false,
      runCount: 1,
      lastRunAt: 2_000,
      lastSuccessAt: 2_000,
      nextRunAt: 3_000,
      retentionCandidates: 3,
      memoryIntegrity: 'ok',
      executionIntegrity: 'ok',
      failureCodes: [],
      overdue: false,
    });
    expect(metrics.counter('maintenance.local_success.count')).toBe(1);
    expect(audit).toHaveLength(1);
    const serialized = JSON.stringify({ status: coordinator.status(), audit });
    expect(serialized).not.toContain('/private/');
    expect(serialized).not.toContain('secret-plan');

    coordinator.close();
    expect(clears).toBe(1);
    expect(coordinator.status().nextRunAt).toBeNull();
  });

  it('records bounded failure reason codes without throwing or retrying in a tight loop', async () => {
    const metrics = new RuntimeMetricRegistry();
    const coordinator = new LocalMaintenanceCoordinator(maintenanceConfig(true), {
      logRoot: '/private/execution/logs',
      memoryStatus: async () => { throw new Error('secret memory path'); },
      executionHealth: async () => ({ integrity: 'ok' }),
      planRetention: async () => { throw new Error('secret plan failure'); },
      metrics,
      now: () => 5_000,
      setInterval: () => ({ unref() {} }) as any,
      clearInterval: () => {},
    });

    const result = await coordinator.runNow();
    expect(result).toMatchObject({
      runCount: 1,
      failureCodes: ['MAINTENANCE_MEMORY_CHECK_FAILED', 'MAINTENANCE_RETENTION_PLAN_FAILED'],
      executionIntegrity: 'ok',
      retentionCandidates: 0,
    });
    expect(metrics.counter('maintenance.local_failure.count')).toBe(1);
    expect(metrics.metric('maintenance.local.duration_ms').lastFailureCode).toBe('MAINTENANCE_RUN_DEGRADED');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('wires the coordinator into RuntimeServices without starting a timer during construction', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-maintenance-runtime-'));
    const defaults = loadConfig({}, root);
    const runtime = createRuntimeServices(
      [root], path.join(root, 'capabilities'), undefined,
      { ...defaults.memory, enabled: false },
      { ...defaults.execution, enabled: true, stateRoot: path.join(root, 'execution'), logRoot: path.join(root, 'runs') },
      { ...defaults.github, enabled: false }, undefined, defaults.observability, 'test-version',
      { ...defaults.maintenance, enabled: true, intervalMs: 60_000 },
    );
    try {
      expect(runtime.maintenance.status()).toMatchObject({ enabled: true, runCount: 0, nextRunAt: null });
    } finally {
      runtime.maintenance.close();
      await runtime.execution.close().catch(() => undefined);
      await runtime.memory.close().catch(() => undefined);
      await runtime.telemetry.close().catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('has no scheduled destructive maintenance call path', async () => {
    const source = await readFile(new URL('../src/runtime/maintenance.ts', import.meta.url), 'utf8');
    for (const forbidden of [
      'applyExecutionRetention',
      'restoreExecutionRecoveryBundle',
      'revoke-key',
      'rotate-key',
      'rm(',
      'unlink(',
    ]) expect(source).not.toContain(forbidden);
    expect(source).toContain('planExecutionRetention');
  });
});
