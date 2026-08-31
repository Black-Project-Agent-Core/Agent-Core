import type { ExecutionResourceGovernanceConfig } from '../config.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import type { ResourceSnapshot, ResourceSnapshotProvider } from '../runtime/resource-snapshot.js';

export type ResourceThrottleReasonCode =
  | 'local_cpu_pressure'
  | 'local_memory_pressure'
  | 'local_storage_pressure'
  | 'audit_backlog_pressure'
  | 'telemetry_backlog_pressure'
  | 'execution_sync_backlog_pressure'
  | 'execution_worker_degraded';

export type ResourceGovernanceSeverity = 'none' | 'warning' | 'critical';

export interface ResourceGovernanceDecision {
  capturedAt: number;
  requestedMaxConcurrency: number;
  safeConcurrency: number;
  throttled: boolean;
  severity: ResourceGovernanceSeverity;
  reasonCodes: ResourceThrottleReasonCode[];
  snapshot: ResourceSnapshot;
}

export interface ResourceGovernorOptions {
  operatorMaxConcurrency: number;
  config: ExecutionResourceGovernanceConfig;
  provider: ResourceSnapshotProvider;
  metrics?: RuntimeMetricRegistry;
  now?: () => number;
}

type Pressure = { reason: ResourceThrottleReasonCode; severity: Exclude<ResourceGovernanceSeverity, 'none'> };

const REASON_ORDER: ResourceThrottleReasonCode[] = [
  'local_cpu_pressure',
  'local_memory_pressure',
  'local_storage_pressure',
  'audit_backlog_pressure',
  'telemetry_backlog_pressure',
  'execution_sync_backlog_pressure',
  'execution_worker_degraded',
];

function unavailableSnapshot(capturedAt: number): ResourceSnapshot {
  return {
    capturedAt,
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
  };
}

function highPressure(
  value: number | null,
  available: boolean,
  warning: number,
  critical: number,
  reason: ResourceThrottleReasonCode,
): Pressure | null {
  if (!available || value === null || !Number.isFinite(value)) return null;
  if (value >= critical) return { reason, severity: 'critical' };
  if (value >= warning) return { reason, severity: 'warning' };
  return null;
}

function lowPressure(
  value: number | null,
  available: boolean,
  warning: number,
  critical: number,
  reason: ResourceThrottleReasonCode,
): Pressure | null {
  if (!available || value === null || !Number.isFinite(value)) return null;
  if (value <= critical) return { reason, severity: 'critical' };
  if (value <= warning) return { reason, severity: 'warning' };
  return null;
}

export class ResourceGovernor {
  private readonly operatorMaxConcurrency: number;
  private readonly config: ExecutionResourceGovernanceConfig;
  private readonly provider: ResourceSnapshotProvider;
  private readonly metrics?: RuntimeMetricRegistry;
  private readonly now: () => number;

  constructor(options: ResourceGovernorOptions) {
    if (!Number.isInteger(options.operatorMaxConcurrency) || options.operatorMaxConcurrency < 1) {
      throw new Error('RESOURCE_OPERATOR_MAX_CONCURRENCY_INVALID');
    }
    if (!Number.isInteger(options.config.minimumConcurrency)
      || options.config.minimumConcurrency < 1
      || options.config.minimumConcurrency > options.operatorMaxConcurrency) {
      throw new Error('RESOURCE_MINIMUM_CONCURRENCY_INVALID');
    }
    this.operatorMaxConcurrency = options.operatorMaxConcurrency;
    this.config = { ...options.config };
    this.provider = options.provider;
    this.metrics = options.metrics;
    this.now = options.now ?? Date.now;
  }

  async decide(requestedMaxConcurrency: number): Promise<ResourceGovernanceDecision> {
    if (!Number.isInteger(requestedMaxConcurrency) || requestedMaxConcurrency < 1) {
      throw new Error('RESOURCE_REQUESTED_CONCURRENCY_INVALID');
    }
    const requested = Math.min(requestedMaxConcurrency, this.operatorMaxConcurrency);
    const startedAt = performance.now();
    let snapshot: ResourceSnapshot;
    try {
      snapshot = await this.provider.snapshot();
    } catch {
      this.metrics?.failure('execution.resource_snapshot.duration_ms', 'RESOURCE_SNAPSHOT_UNAVAILABLE');
      snapshot = unavailableSnapshot(this.now());
    } finally {
      this.metrics?.observe('execution.resource_snapshot.duration_ms', Math.max(0, performance.now() - startedAt));
    }

    if (!this.config.enabled) return this.build(snapshot, requested, requested, 'none', []);

    const pressures = this.pressures(snapshot);
    const severity: ResourceGovernanceSeverity = pressures.some((item) => item.severity === 'critical')
      ? 'critical'
      : pressures.some((item) => item.severity === 'warning') ? 'warning' : 'none';
    const reasonSet = new Set(pressures.map((item) => item.reason));
    const reasonCodes = REASON_ORDER.filter((reason) => reasonSet.has(reason));

    let safe = requested;
    if (severity === 'critical') safe = Math.min(requested, this.config.minimumConcurrency);
    else if (severity === 'warning') safe = Math.max(
      Math.min(requested, this.config.minimumConcurrency),
      Math.min(requested, Math.ceil(requested / 2)),
    );

    safe = Math.max(1, Math.min(safe, requested, this.operatorMaxConcurrency));
    return this.build(snapshot, requested, safe, severity, reasonCodes);
  }

  private pressures(snapshot: ResourceSnapshot): Pressure[] {
    const output: Pressure[] = [];
    const push = (value: Pressure | null) => { if (value) output.push(value); };

    push(highPressure(snapshot.cpu.normalizedLoad, snapshot.cpu.available,
      this.config.cpuWarningRatio, this.config.cpuCriticalRatio, 'local_cpu_pressure'));
    push(highPressure(snapshot.memory.usedRatio, snapshot.memory.available,
      this.config.memoryWarningRatio, this.config.memoryCriticalRatio, 'local_memory_pressure'));
    push(lowPressure(snapshot.storage.freeRatio, snapshot.storage.available,
      this.config.storageWarningFreeRatio, this.config.storageCriticalFreeRatio, 'local_storage_pressure'));
    push(highPressure(snapshot.backlog.auditQueueRatio, snapshot.backlog.auditQueueRatio !== null,
      this.config.auditWarningRatio, this.config.auditCriticalRatio, 'audit_backlog_pressure'));
    push(highPressure(snapshot.backlog.telemetryQueueRatio, snapshot.backlog.telemetryQueueRatio !== null,
      this.config.telemetryWarningRatio, this.config.telemetryCriticalRatio, 'telemetry_backlog_pressure'));
    push(highPressure(snapshot.backlog.queuedMemorySync, snapshot.backlog.queuedMemorySyncAvailable,
      this.config.queuedSyncWarning, this.config.queuedSyncCritical, 'execution_sync_backlog_pressure'));
    if (snapshot.worker.available && snapshot.worker.healthy === false) {
      output.push({ reason: 'execution_worker_degraded', severity: 'critical' });
    }
    return output;
  }

  private build(
    snapshot: ResourceSnapshot,
    requested: number,
    safe: number,
    severity: ResourceGovernanceSeverity,
    reasonCodes: ResourceThrottleReasonCode[],
  ): ResourceGovernanceDecision {
    return {
      capturedAt: snapshot.capturedAt,
      requestedMaxConcurrency: requested,
      safeConcurrency: safe,
      throttled: safe < requested,
      severity,
      reasonCodes,
      snapshot,
    };
  }
}
