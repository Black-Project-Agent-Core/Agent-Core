import os from 'node:os';
import { statfs as nodeStatfs } from 'node:fs/promises';

export interface ResourceSnapshot {
  capturedAt: number;
  cpu: { normalizedLoad: number | null; available: boolean };
  memory: { usedRatio: number | null; available: boolean };
  storage: { freeRatio: number | null; available: boolean };
  backlog: {
    auditQueueRatio: number | null;
    telemetryQueueRatio: number | null;
    queuedMemorySync: number | null;
    queuedMemorySyncAvailable: boolean;
  };
  worker: { healthy: boolean | null; available: boolean };
}

export interface ResourceSnapshotProvider {
  snapshot(): Promise<ResourceSnapshot>;
}

export interface ResourceQueueStatus {
  queueDepth: number;
  queueCapacity: number;
}

export interface ResourceExecutionCounts {
  queuedSync: number;
}

export interface ResourceStatFs {
  blocks: number | bigint;
  bavail: number | bigint;
  bsize: number | bigint;
}

export interface NodeResourceSnapshotProviderOptions {
  storagePath: string;
  now?: () => number;
  loadAverage?: () => number[];
  logicalCpuCount?: () => number;
  totalMemory?: () => number;
  freeMemory?: () => number;
  statfs?: (target: string) => Promise<ResourceStatFs>;
  auditStatus?: () => ResourceQueueStatus | null;
  telemetryStatus?: () => ResourceQueueStatus | null;
  executionCounts?: () => Promise<ResourceExecutionCounts>;
  workerHealth?: () => Promise<boolean>;
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function queueRatio(status: ResourceQueueStatus | null | undefined): number | null {
  if (!status || !Number.isFinite(status.queueDepth) || !Number.isFinite(status.queueCapacity) || status.queueCapacity <= 0) return null;
  return clampRatio(status.queueDepth / status.queueCapacity);
}

function finiteNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function statNumber(value: number | bigint): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export class NodeResourceSnapshotProvider implements ResourceSnapshotProvider {
  private readonly now: () => number;
  private readonly loadAverage: () => number[];
  private readonly logicalCpuCount: () => number;
  private readonly totalMemory: () => number;
  private readonly freeMemory: () => number;
  private readonly statfs: (target: string) => Promise<ResourceStatFs>;
  private readonly auditStatus: () => ResourceQueueStatus | null;
  private readonly telemetryStatus: () => ResourceQueueStatus | null;
  private readonly executionCounts: () => Promise<ResourceExecutionCounts>;
  private readonly workerHealth: () => Promise<boolean>;

  constructor(private readonly options: NodeResourceSnapshotProviderOptions) {
    if (!options.storagePath?.trim()) throw new Error('RESOURCE_STORAGE_PATH_REQUIRED');
    this.now = options.now ?? Date.now;
    this.loadAverage = options.loadAverage ?? (process.platform === 'win32' ? (() => []) : os.loadavg);
    this.logicalCpuCount = options.logicalCpuCount ?? (() => os.availableParallelism());
    this.totalMemory = options.totalMemory ?? os.totalmem;
    this.freeMemory = options.freeMemory ?? os.freemem;
    this.statfs = options.statfs ?? (async (target) => nodeStatfs(target));
    this.auditStatus = options.auditStatus ?? (() => null);
    this.telemetryStatus = options.telemetryStatus ?? (() => null);
    this.executionCounts = options.executionCounts ?? (async () => ({ queuedSync: 0 }));
    this.workerHealth = options.workerHealth ?? (async () => true);
  }

  async snapshot(): Promise<ResourceSnapshot> {
    const capturedAt = this.now();

    let cpu: ResourceSnapshot['cpu'] = { normalizedLoad: null, available: false };
    try {
      const oneMinute = Number(this.loadAverage()[0]);
      const cpus = Number(this.logicalCpuCount());
      if (Number.isFinite(oneMinute) && oneMinute >= 0 && Number.isFinite(cpus) && cpus > 0) {
        cpu = { normalizedLoad: Math.max(0, oneMinute / cpus), available: true };
      }
    } catch {}

    let memory: ResourceSnapshot['memory'] = { usedRatio: null, available: false };
    try {
      const total = Number(this.totalMemory());
      const free = Number(this.freeMemory());
      if (Number.isFinite(total) && total > 0 && Number.isFinite(free)) {
        memory = { usedRatio: clampRatio(1 - (free / total)), available: true };
      }
    } catch {}

    let storage: ResourceSnapshot['storage'] = { freeRatio: null, available: false };
    try {
      const facts = await this.statfs(this.options.storagePath);
      const blocks = statNumber(facts.blocks);
      const available = statNumber(facts.bavail);
      if (Number.isFinite(blocks) && blocks > 0 && Number.isFinite(available)) {
        storage = { freeRatio: clampRatio(available / blocks), available: true };
      }
    } catch {}

    let auditQueueRatio: number | null = null;
    try { auditQueueRatio = queueRatio(this.auditStatus()); } catch {}
    let telemetryQueueRatio: number | null = null;
    try { telemetryQueueRatio = queueRatio(this.telemetryStatus()); } catch {}

    let queuedMemorySync: number | null = null;
    try { queuedMemorySync = finiteNonNegativeInteger((await this.executionCounts()).queuedSync); } catch {}
    const queuedMemorySyncAvailable = queuedMemorySync !== null;

    let workerHealthy: boolean | null = null;
    try { workerHealthy = (await this.workerHealth()) === true; } catch {}

    return {
      capturedAt,
      cpu,
      memory,
      storage,
      backlog: { auditQueueRatio, telemetryQueueRatio, queuedMemorySync, queuedMemorySyncAvailable },
      worker: { healthy: workerHealthy, available: workerHealthy !== null },
    };
  }
}
