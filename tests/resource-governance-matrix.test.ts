import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ResourceGovernor, type ResourceThrottleReasonCode } from '../src/execution/resource-governor.js';
import type { ResourceSnapshot, ResourceSnapshotProvider } from '../src/runtime/resource-snapshot.js';

class FixedProvider implements ResourceSnapshotProvider {
  constructor(private readonly value: ResourceSnapshot) {}
  async snapshot(): Promise<ResourceSnapshot> { return structuredClone(this.value); }
}

function healthy(): ResourceSnapshot {
  return {
    capturedAt: 123,
    cpu: { normalizedLoad: 0.1, available: true },
    memory: { usedRatio: 0.3, available: true },
    storage: { freeRatio: 0.5, available: true },
    backlog: { auditQueueRatio: 0.1, telemetryQueueRatio: 0.1, queuedMemorySync: 0, queuedMemorySyncAvailable: true },
    worker: { healthy: true, available: true },
  };
}

function governor(value: ResourceSnapshot) {
  const config = loadConfig({}, process.cwd()).execution;
  return new ResourceGovernor({ operatorMaxConcurrency: 8, config: config.resourceGovernance, provider: new FixedProvider(value) });
}

describe('Wave F adversarial resource policy matrix', () => {
  const warningCases: Array<[ResourceThrottleReasonCode, (value: ResourceSnapshot) => void]> = [
    ['local_cpu_pressure', (v) => { v.cpu = { normalizedLoad: 0.90, available: true }; }],
    ['local_memory_pressure', (v) => { v.memory = { usedRatio: 0.85, available: true }; }],
    ['local_storage_pressure', (v) => { v.storage = { freeRatio: 0.15, available: true }; }],
    ['audit_backlog_pressure', (v) => { v.backlog.auditQueueRatio = 0.75; }],
    ['telemetry_backlog_pressure', (v) => { v.backlog.telemetryQueueRatio = 0.75; }],
    ['execution_sync_backlog_pressure', (v) => { v.backlog.queuedMemorySync = 32; }],
  ];
  const criticalCases: Array<[ResourceThrottleReasonCode, (value: ResourceSnapshot) => void]> = [
    ['local_cpu_pressure', (v) => { v.cpu = { normalizedLoad: 1.25, available: true }; }],
    ['local_memory_pressure', (v) => { v.memory = { usedRatio: 0.95, available: true }; }],
    ['local_storage_pressure', (v) => { v.storage = { freeRatio: 0.05, available: true }; }],
    ['audit_backlog_pressure', (v) => { v.backlog.auditQueueRatio = 0.90; }],
    ['telemetry_backlog_pressure', (v) => { v.backlog.telemetryQueueRatio = 0.90; }],
    ['execution_sync_backlog_pressure', (v) => { v.backlog.queuedMemorySync = 128; }],
    ['execution_worker_degraded', (v) => { v.worker = { healthy: false, available: true }; }],
  ];

  for (const [reason, mutate] of warningCases) {
    it(`classifies ${reason} warning deterministically without exceeding the hard maximum`, async () => {
      const value = healthy(); mutate(value);
      const first = await governor(value).decide(8);
      const second = await governor(value).decide(99);
      expect(first).toMatchObject({ requestedMaxConcurrency: 8, safeConcurrency: 4, severity: 'warning', reasonCodes: [reason] });
      expect(second).toEqual(first);
    });
  }

  for (const [reason, mutate] of criticalCases) {
    it(`classifies ${reason} critical deterministically at minimum concurrency`, async () => {
      const value = healthy(); mutate(value);
      const decision = await governor(value).decide(99);
      expect(decision).toMatchObject({ requestedMaxConcurrency: 8, safeConcurrency: 1, severity: 'critical', reasonCodes: [reason] });
    });
  }

  it('retains every combined reason in stable order and lets any critical signal dominate warning signals', async () => {
    const value = healthy();
    value.cpu.normalizedLoad = 0.95;
    value.memory.usedRatio = 0.90;
    value.storage.freeRatio = 0.10;
    value.backlog.auditQueueRatio = 0.80;
    value.backlog.telemetryQueueRatio = 0.95;
    value.backlog.queuedMemorySync = 64;
    value.worker = { healthy: false, available: true };
    const decision = await governor(value).decide(8);
    expect(decision.severity).toBe('critical');
    expect(decision.safeConcurrency).toBe(1);
    expect(decision.reasonCodes).toEqual([
      'local_cpu_pressure',
      'local_memory_pressure',
      'local_storage_pressure',
      'audit_backlog_pressure',
      'telemetry_backlog_pressure',
      'execution_sync_backlog_pressure',
      'execution_worker_degraded',
    ]);
  });

  it('treats a fully unavailable snapshot as unknown and never invents throttling', async () => {
    const value: ResourceSnapshot = {
      capturedAt: 123,
      cpu: { normalizedLoad: null, available: false },
      memory: { usedRatio: null, available: false },
      storage: { freeRatio: null, available: false },
      backlog: { auditQueueRatio: null, telemetryQueueRatio: null, queuedMemorySync: null, queuedMemorySyncAvailable: false },
      worker: { healthy: null, available: false },
    };
    const decision = await governor(value).decide(99);
    expect(decision).toMatchObject({ requestedMaxConcurrency: 8, safeConcurrency: 8, severity: 'none', reasonCodes: [], throttled: false });
  });
});
