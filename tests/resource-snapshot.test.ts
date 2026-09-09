import { describe, expect, it } from 'vitest';
import { NodeResourceSnapshotProvider } from '../src/runtime/resource-snapshot.js';

function provider(overrides: ConstructorParameters<typeof NodeResourceSnapshotProvider>[0] = {}) {
  return new NodeResourceSnapshotProvider({
    storagePath: '/sensitive/runtime/path',
    now: () => 123_456,
    loadAverage: () => [4, 0, 0],
    logicalCpuCount: () => 8,
    totalMemory: () => 1_000,
    freeMemory: () => 250,
    statfs: async () => ({ blocks: 1_000, bavail: 200, bsize: 4_096 }),
    auditStatus: () => ({ queueDepth: 30, queueCapacity: 100 }),
    telemetryStatus: () => ({ queueDepth: 10, queueCapacity: 40 }),
    executionCounts: async () => ({ queuedSync: 7 }),
    workerHealth: async () => true,
    ...overrides,
  });
}

describe('local resource snapshot contract', () => {
  it('normalizes local CPU, memory, storage, backlog, and worker facts without exposing the storage path', async () => {
    const snapshot = await provider().snapshot();

    expect(snapshot).toEqual({
      capturedAt: 123_456,
      cpu: { normalizedLoad: 0.5, available: true },
      memory: { usedRatio: 0.75, available: true },
      storage: { freeRatio: 0.2, available: true },
      backlog: {
        auditQueueRatio: 0.3,
        telemetryQueueRatio: 0.25,
        queuedMemorySync: 7,
        queuedMemorySyncAvailable: true,
      },
      worker: { healthy: true, available: true },
    });
    expect(JSON.stringify(snapshot)).not.toContain('/sensitive/runtime/path');
  });

  it('marks invalid or failed probes unavailable instead of inventing pressure or rejecting the snapshot', async () => {
    const snapshot = await provider({
      loadAverage: () => { throw new Error('cpu unavailable'); },
      totalMemory: () => 0,
      freeMemory: () => 0,
      statfs: async () => { throw new Error('storage unavailable'); },
      auditStatus: () => ({ queueDepth: 1, queueCapacity: 0 }),
      telemetryStatus: () => null,
      executionCounts: async () => { throw new Error('execution unavailable'); },
      workerHealth: async () => { throw new Error('worker unavailable'); },
    }).snapshot();

    expect(snapshot.cpu).toEqual({ normalizedLoad: null, available: false });
    expect(snapshot.memory).toEqual({ usedRatio: null, available: false });
    expect(snapshot.storage).toEqual({ freeRatio: null, available: false });
    expect(snapshot.backlog).toEqual({
      auditQueueRatio: null,
      telemetryQueueRatio: null,
      queuedMemorySync: null,
      queuedMemorySyncAvailable: false,
    });
    expect(snapshot.worker).toEqual({ healthy: null, available: false });
    expect(snapshot.capturedAt).toBe(123_456);
  });

  it('clamps bounded ratios and queued-sync counts to factual non-negative ranges', async () => {
    const snapshot = await provider({
      loadAverage: () => [-1, 0, 0],
      totalMemory: () => 100,
      freeMemory: () => 150,
      statfs: async () => ({ blocks: 100, bavail: 120, bsize: 4_096 }),
      auditStatus: () => ({ queueDepth: 150, queueCapacity: 100 }),
      telemetryStatus: () => ({ queueDepth: -2, queueCapacity: 100 }),
      executionCounts: async () => ({ queuedSync: -5 }),
    }).snapshot();

    expect(snapshot.cpu).toEqual({ normalizedLoad: null, available: false });
    expect(snapshot.memory).toEqual({ usedRatio: 0, available: true });
    expect(snapshot.storage).toEqual({ freeRatio: 1, available: true });
    expect(snapshot.backlog).toEqual({
      auditQueueRatio: 1,
      telemetryQueueRatio: 0,
      queuedMemorySync: null,
      queuedMemorySyncAvailable: false,
    });
  });
});
