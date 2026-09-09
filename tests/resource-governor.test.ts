import { describe, expect, it } from 'vitest';
import type { ExecutionResourceGovernanceConfig } from '../src/config.js';
import type { ResourceSnapshot, ResourceSnapshotProvider } from '../src/runtime/resource-snapshot.js';
import { ResourceGovernor } from '../src/execution/resource-governor.js';
import { RuntimeMetricRegistry } from '../src/runtime/metric-window.js';

const config: ExecutionResourceGovernanceConfig = {
  enabled: true,
  minimumConcurrency: 1,
  cpuWarningRatio: 0.90,
  cpuCriticalRatio: 1.25,
  memoryWarningRatio: 0.85,
  memoryCriticalRatio: 0.95,
  storageWarningFreeRatio: 0.15,
  storageCriticalFreeRatio: 0.05,
  auditWarningRatio: 0.75,
  auditCriticalRatio: 0.90,
  telemetryWarningRatio: 0.75,
  telemetryCriticalRatio: 0.90,
  queuedSyncWarning: 32,
  queuedSyncCritical: 128,
};

function snapshot(overrides: Partial<ResourceSnapshot> = {}): ResourceSnapshot {
  return {
    capturedAt: 42,
    cpu: { normalizedLoad: 0.2, available: true },
    memory: { usedRatio: 0.4, available: true },
    storage: { freeRatio: 0.5, available: true },
    backlog: {
      auditQueueRatio: 0.1,
      telemetryQueueRatio: 0.1,
      queuedMemorySync: 0,
      queuedMemorySyncAvailable: true,
    },
    worker: { healthy: true, available: true },
    ...overrides,
  };
}

class FixedProvider implements ResourceSnapshotProvider {
  constructor(private readonly value: ResourceSnapshot | Error) {}
  async snapshot(): Promise<ResourceSnapshot> {
    if (this.value instanceof Error) throw this.value;
    return structuredClone(this.value);
  }
}

function governor(value: ResourceSnapshot | Error, options: { enabled?: boolean; operatorMax?: number; minimum?: number; metrics?: RuntimeMetricRegistry } = {}) {
  return new ResourceGovernor({
    operatorMaxConcurrency: options.operatorMax ?? 8,
    config: {
      ...config,
      ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
      ...(options.minimum === undefined ? {} : { minimumConcurrency: options.minimum }),
    },
    provider: new FixedProvider(value),
    metrics: options.metrics,
    now: () => 99,
  });
}

describe('deterministic resource governor', () => {
  it('preserves the bounded requested maximum when no pressure exists and clamps requests above the operator maximum', async () => {
    const normal = await governor(snapshot()).decide(6);
    expect(normal).toEqual({
      capturedAt: 42,
      requestedMaxConcurrency: 6,
      safeConcurrency: 6,
      throttled: false,
      severity: 'none',
      reasonCodes: [],
      snapshot: snapshot(),
    });

    const clamped = await governor(snapshot(), { operatorMax: 8 }).decide(99);
    expect(clamped.requestedMaxConcurrency).toBe(8);
    expect(clamped.safeConcurrency).toBe(8);
  });

  it('halves new-dispatch capacity for warning-only pressure without dropping below the configured minimum', async () => {
    const decision = await governor(snapshot({ memory: { usedRatio: 0.90, available: true } })).decide(7);
    expect(decision).toMatchObject({
      requestedMaxConcurrency: 7,
      safeConcurrency: 4,
      throttled: true,
      severity: 'warning',
      reasonCodes: ['local_memory_pressure'],
    });

    const floor = await governor(snapshot({ cpu: { normalizedLoad: 1.0, available: true } }), { minimum: 3 }).decide(4);
    expect(floor.safeConcurrency).toBe(3);
  });

  it('drops only the dispatch ceiling to the minimum when any critical signal exists and keeps stable combined reason ordering', async () => {
    const pressured = snapshot({
      cpu: { normalizedLoad: 1.30, available: true },
      memory: { usedRatio: 0.90, available: true },
      storage: { freeRatio: 0.04, available: true },
      backlog: {
        auditQueueRatio: 0.80,
        telemetryQueueRatio: 0.95,
        queuedMemorySync: 140,
        queuedMemorySyncAvailable: true,
      },
      worker: { healthy: false, available: true },
    });
    const decision = await governor(pressured).decide(8);
    expect(decision).toMatchObject({
      safeConcurrency: 1,
      throttled: true,
      severity: 'critical',
      reasonCodes: [
        'local_cpu_pressure',
        'local_memory_pressure',
        'local_storage_pressure',
        'audit_backlog_pressure',
        'telemetry_backlog_pressure',
        'execution_sync_backlog_pressure',
        'execution_worker_degraded',
      ],
    });
  });

  it('ignores unavailable signals instead of creating pressure', async () => {
    const unknown = snapshot({
      cpu: { normalizedLoad: null, available: false },
      memory: { usedRatio: null, available: false },
      storage: { freeRatio: null, available: false },
      backlog: {
        auditQueueRatio: null,
        telemetryQueueRatio: null,
        queuedMemorySync: null,
        queuedMemorySyncAvailable: false,
      },
      worker: { healthy: null, available: false },
    });
    const decision = await governor(unknown).decide(5);
    expect(decision).toMatchObject({ safeConcurrency: 5, throttled: false, severity: 'none', reasonCodes: [] });
  });

  it('fails open within the hard operator maximum when snapshot acquisition itself fails and records bounded failure evidence', async () => {
    const metrics = new RuntimeMetricRegistry({ now: () => 500 });
    const decision = await governor(new Error('secret host failure'), { operatorMax: 4, metrics }).decide(20);
    expect(decision.requestedMaxConcurrency).toBe(4);
    expect(decision.safeConcurrency).toBe(4);
    expect(decision.throttled).toBe(false);
    expect(decision.reasonCodes).toEqual([]);
    expect(decision.snapshot).toEqual({
      capturedAt: 99,
      cpu: { normalizedLoad: null, available: false },
      memory: { usedRatio: null, available: false },
      storage: { freeRatio: null, available: false },
      backlog: {
        auditQueueRatio: null,
        telemetryQueueRatio: null,
        queuedMemorySync: null,
        queuedMemorySyncAvailable: false,
      },
      worker: { healthy: null, available: false },
    });
    expect(metrics.metric('execution.resource_snapshot.duration_ms').lastFailureCode).toBe('RESOURCE_SNAPSHOT_UNAVAILABLE');
    expect(JSON.stringify(decision)).not.toContain('secret host failure');
  });

  it('bypasses pressure when governance is disabled and replays identical snapshots identically', async () => {
    const pressured = snapshot({ memory: { usedRatio: 0.99, available: true } });
    const disabled = await governor(pressured, { enabled: false, operatorMax: 6 }).decide(8);
    expect(disabled).toMatchObject({ requestedMaxConcurrency: 6, safeConcurrency: 6, throttled: false, severity: 'none', reasonCodes: [] });

    const first = await governor(pressured).decide(8);
    const second = await governor(pressured).decide(8);
    expect(second).toEqual(first);
  });
});
