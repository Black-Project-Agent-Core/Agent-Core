import type { MaintenanceConfig } from '../config.js';
import { planExecutionRetention } from '../execution/retention.js';
import type { RuntimeAuditLogger } from '../logging/audit-log.js';
import type { RuntimeMetricRegistry } from './metric-window.js';

export interface LocalMaintenanceStatus {
  enabled: boolean;
  running: boolean;
  runCount: number;
  retentionCandidates: number;
  failureCodes: string[];
  memoryIntegrity?: 'ok' | 'degraded' | 'unknown';
  executionIntegrity?: 'ok' | 'degraded' | 'unknown';
  lastRunAt?: number;
  lastSuccessAt?: number;
  nextRunAt: number | null;
  overdue: boolean;
}

interface RetentionDryRunResult {
  plan: { candidates: unknown[] };
}

export interface LocalMaintenanceDependencies {
  logRoot: string;
  memoryStatus: () => Promise<{ integrity?: unknown }>;
  executionHealth: () => Promise<{ integrity?: unknown }>;
  planRetention?: (options: {
    logRoot: string;
    planRoot: string;
    olderThanMs: number;
    now?: number;
    metrics?: RuntimeMetricRegistry;
  }) => Promise<RetentionDryRunResult>;
  audit?: Pick<RuntimeAuditLogger, 'logRuntime'>;
  metrics?: RuntimeMetricRegistry;
  now?: () => number;
  setInterval?: (callback: () => void, delayMs: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

function boundedIntegrity(value: unknown): 'ok' | 'degraded' | 'unknown' {
  if (value === 'ok') return 'ok';
  if (typeof value === 'string' && value.startsWith('degraded')) return 'degraded';
  return 'unknown';
}

export class LocalMaintenanceCoordinator {
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => unknown;
  private readonly cancelSchedule: (handle: unknown) => void;
  private readonly planRetention: NonNullable<LocalMaintenanceDependencies['planRetention']>;
  private timer: unknown | null = null;
  private running = false;
  private runCount = 0;
  private retentionCandidates = 0;
  private failureCodes: string[] = [];
  private memoryIntegrity?: 'ok' | 'degraded' | 'unknown';
  private executionIntegrity?: 'ok' | 'degraded' | 'unknown';
  private lastRunAt?: number;
  private lastSuccessAt?: number;
  private nextRunAt: number | null = null;

  constructor(
    readonly config: MaintenanceConfig,
    private readonly dependencies: LocalMaintenanceDependencies,
  ) {
    this.now = dependencies.now ?? Date.now;
    this.schedule = dependencies.setInterval ?? ((callback, delayMs) => setInterval(callback, delayMs));
    this.cancelSchedule = dependencies.clearInterval ?? ((handle) => clearInterval(handle as NodeJS.Timeout));
    this.planRetention = dependencies.planRetention ?? planExecutionRetention;
  }

  start(): void {
    if (!this.config.enabled || this.timer !== null) return;
    this.nextRunAt = this.now() + this.config.intervalMs;
    this.timer = this.schedule(() => { void this.runNow(); }, this.config.intervalMs);
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer && typeof (this.timer as { unref?: unknown }).unref === 'function') {
      (this.timer as { unref(): void }).unref();
    }
  }

  close(): void {
    if (this.timer !== null) {
      this.cancelSchedule(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
  }

  status(): LocalMaintenanceStatus {
    return {
      enabled: this.config.enabled,
      running: this.running,
      runCount: this.runCount,
      retentionCandidates: this.retentionCandidates,
      failureCodes: [...this.failureCodes],
      ...(this.memoryIntegrity ? { memoryIntegrity: this.memoryIntegrity } : {}),
      ...(this.executionIntegrity ? { executionIntegrity: this.executionIntegrity } : {}),
      ...(this.lastRunAt === undefined ? {} : { lastRunAt: this.lastRunAt }),
      ...(this.lastSuccessAt === undefined ? {} : { lastSuccessAt: this.lastSuccessAt }),
      nextRunAt: this.nextRunAt,
      overdue: Boolean(this.config.enabled && this.nextRunAt !== null && !this.running && this.now() > this.nextRunAt),
    };
  }

  async runNow(): Promise<LocalMaintenanceStatus> {
    if (!this.config.enabled || this.running) return this.status();
    this.running = true;
    this.runCount += 1;
    const runAt = this.now();
    this.lastRunAt = runAt;
    if (this.timer !== null) this.nextRunAt = runAt + this.config.intervalMs;
    const startedAt = performance.now();

    const [memoryResult, executionResult, retentionResult] = await Promise.allSettled([
      this.dependencies.memoryStatus(),
      this.dependencies.executionHealth(),
      this.planRetention({
        logRoot: this.dependencies.logRoot,
        planRoot: this.config.retentionPlanRoot,
        olderThanMs: this.config.retentionOlderThanMs,
        now: runAt,
        metrics: this.dependencies.metrics,
      }),
    ]);

    const failures: string[] = [];
    if (memoryResult.status === 'fulfilled') this.memoryIntegrity = boundedIntegrity(memoryResult.value.integrity);
    else { this.memoryIntegrity = 'unknown'; failures.push('MAINTENANCE_MEMORY_CHECK_FAILED'); }
    if (executionResult.status === 'fulfilled') this.executionIntegrity = boundedIntegrity(executionResult.value.integrity);
    else { this.executionIntegrity = 'unknown'; failures.push('MAINTENANCE_EXECUTION_CHECK_FAILED'); }
    if (retentionResult.status === 'fulfilled') {
      this.retentionCandidates = Array.isArray(retentionResult.value.plan?.candidates) ? retentionResult.value.plan.candidates.length : 0;
    } else {
      this.retentionCandidates = 0;
      failures.push('MAINTENANCE_RETENTION_PLAN_FAILED');
    }

    this.failureCodes = failures;
    if (failures.length === 0) {
      this.lastSuccessAt = runAt;
      this.dependencies.metrics?.increment('maintenance.local_success.count');
    } else {
      this.dependencies.metrics?.failure('maintenance.local.duration_ms', 'MAINTENANCE_RUN_DEGRADED');
      this.dependencies.metrics?.increment('maintenance.local_failure.count');
    }
    this.dependencies.metrics?.observe('maintenance.local.duration_ms', Math.max(0, performance.now() - startedAt));
    this.running = false;

    this.dependencies.audit?.logRuntime('maintenance', 'scheduled_run_completed', {
      runCount: this.runCount,
      healthy: failures.length === 0,
      retentionCandidates: this.retentionCandidates,
      memoryIntegrity: this.memoryIntegrity,
      executionIntegrity: this.executionIntegrity,
      failureCodes: [...failures],
    });
    return this.status();
  }
}
