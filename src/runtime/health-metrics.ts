import type { RuntimeMetricRegistry, RuntimeMetricSnapshot } from './metric-window.js';
import type { ResourceGovernanceDecision } from '../execution/resource-governor.js';
import { diagnoseRuntime, type RuntimeDiagnosisRecommendation } from './diagnosis.js';

export type OverallHealth = 'healthy' | 'degraded' | 'critical';
export type ApiHealth = 'green' | 'yellow' | 'red';
export type CredentialHealth = 'valid' | 'missing' | 'invalid' | 'unknown';

export interface RuntimeHealthMetricsOptions {
  now?: () => number;
  githubProbeTtlMs?: number;
}

type HealthRuntime = {
  metrics: RuntimeMetricRegistry;
  resourceGovernor?: { decide(requestedMaxConcurrency: number): Promise<ResourceGovernanceDecision> };
  memory: {
    config: { enabled: boolean };
    currentState: string;
    status(scope?: unknown): Promise<any>;
    getContinuitySnapshot?(scope: unknown): Promise<any>;
  };
  execution: {
    config: { enabled: boolean; maxConcurrency?: number; resourceGovernance?: { enabled: boolean } };
    currentState: string;
    health(scope?: unknown): Promise<any>;
    store: { systemCounts(): Promise<any> };
  };
  github: { config: { enabled: boolean }; status(): Promise<any>; apiRequest(input: any): Promise<any> };
  routes: { metrics(): any };
  capabilities: { coverage(): any };
  audit?: { status?(): { queueDepth: number; queueCapacity: number; written: number; dropped: number; writeErrors: number; sequence: number; headHash: string | null; currentFileBytes: number; rotatedFiles: number; lastWriteErrorCode?: string } };
  telemetry?: { status(): { enabled: boolean; queueDepth: number; queueCapacity: number; dropped: number; lastExportAt?: number; lastFailureCode?: string } };
};

export interface RuntimeHealthSnapshot extends Record<string, unknown> {
  timestamp: number;
  memory: Record<string, unknown>;
  execution: Record<string, unknown>;
  github: Record<string, unknown>;
  routing: Record<string, unknown>;
  audit: Record<string, unknown>;
  observability: Record<string, unknown>;
  overallHealth: OverallHealth;
}

function metricView(metric: RuntimeMetricSnapshot) {
  return {
    count: metric.count,
    p50Ms: metric.p50,
    p95Ms: metric.p95,
    p99Ms: metric.p99,
    maxMs: metric.max,
    ...(metric.lastFailureCode ? { lastFailureCode: metric.lastFailureCode } : {}),
    ...(metric.lastFailureAt === undefined ? {} : { lastFailureAt: metric.lastFailureAt }),
  };
}

export class RuntimeHealthMetrics {
  private readonly now: () => number;
  private readonly githubProbeTtlMs: number;
  private githubProbeExpiresAt = 0;
  private githubProbeValue: { apiHealth: ApiHealth; credentialStatus: CredentialHealth; lastApiCheckMs: number | null; lastFailureCode?: string } | null = null;
  private githubProbePromise?: Promise<{ apiHealth: ApiHealth; credentialStatus: CredentialHealth; lastApiCheckMs: number | null; lastFailureCode?: string }>;

  constructor(private readonly runtime: HealthRuntime, options: RuntimeHealthMetricsOptions = {}) {
    this.now = options.now ?? Date.now;
    this.githubProbeTtlMs = Math.max(100, options.githubProbeTtlMs ?? 60_000);
  }

  async getMetrics(scope?: unknown): Promise<RuntimeHealthSnapshot> {
    const [memory, execution, executionCounts, github] = await Promise.all([
      this.runtime.memory.status(),
      this.runtime.execution.health(),
      this.runtime.execution.store.systemCounts(),
      this.githubMetrics(),
    ]);
    const routing = this.runtime.routes.metrics();
    let resourceDecision: ResourceGovernanceDecision | null = null;
    const configuredMaxConcurrency = Number(this.runtime.execution.config.maxConcurrency ?? 1);
    if (this.runtime.resourceGovernor && Number.isInteger(configuredMaxConcurrency) && configuredMaxConcurrency > 0) {
      try { resourceDecision = await this.runtime.resourceGovernor.decide(configuredMaxConcurrency); }
      catch { resourceDecision = null; }
    }
    let continuityBlockedTasks = 0;
    if (scope && memory.healthy && this.runtime.memory.getContinuitySnapshot) {
      try {
        const continuity = await this.runtime.memory.getContinuitySnapshot(scope);
        continuityBlockedTasks = Array.isArray(continuity?.blockedTasks) ? continuity.blockedTasks.length : 0;
      } catch { continuityBlockedTasks = 0; }
    }
    const auditStatus = this.runtime.audit?.status?.();
    const audit = auditStatus ? {
      enabled: true,
      queueDepth: auditStatus.queueDepth,
      queueCapacity: auditStatus.queueCapacity,
      written: auditStatus.written,
      dropped: auditStatus.dropped,
      writeErrors: auditStatus.writeErrors,
      sequence: auditStatus.sequence,
      headHashPrefix: auditStatus.headHash ? auditStatus.headHash.slice(0, 16) : null,
      currentFileBytes: auditStatus.currentFileBytes,
      rotatedFiles: auditStatus.rotatedFiles,
      ...(auditStatus.lastWriteErrorCode ? { lastWriteErrorCode: auditStatus.lastWriteErrorCode } : {}),
    } : {
      enabled: false,
      queueDepth: 0,
      queueCapacity: 0,
      written: 0,
      dropped: 0,
      writeErrors: 0,
      sequence: 0,
      headHashPrefix: null,
      currentFileBytes: 0,
      rotatedFiles: 0,
    };
    const telemetryStatus = this.runtime.telemetry?.status() ?? { enabled: false, queueDepth: 0, queueCapacity: 0, dropped: 0 };
    const memoryCritical = Boolean(this.runtime.memory.config.enabled && !memory.healthy);
    const executionCritical = Boolean(this.runtime.execution.config.enabled && !execution.healthy);
    const optionalDegraded = (this.runtime.github.config.enabled && (github.apiHealth !== 'green' || github.credentialStatus !== 'valid'))
      || (Boolean(audit.enabled) && (Number(audit.writeErrors) > 0 || Number(audit.dropped) > 0));
    const overallHealth: OverallHealth = memoryCritical || executionCritical ? 'critical' : optionalDegraded ? 'degraded' : 'healthy';
    const memoryPreflight = metricView(this.runtime.metrics.metric('memory.preflight.duration_ms'));
    const executionDispatch = metricView(this.runtime.metrics.metric('execution.dispatch.duration_ms'));
    const diagnosis: RuntimeDiagnosisRecommendation[] = diagnoseRuntime({
      resourceDecision,
      github: {
        enabled: Boolean(github.enabled),
        apiHealth: String(github.apiHealth ?? 'green'),
        credentialStatus: String(github.credentialStatus ?? 'unknown'),
      },
      audit: { dropped: Number(audit.dropped), writeErrors: Number(audit.writeErrors) },
      telemetry: {
        enabled: Boolean(telemetryStatus.enabled),
        dropped: Number(telemetryStatus.dropped ?? 0),
        ...(telemetryStatus.lastFailureCode ? { lastFailureCode: String(telemetryStatus.lastFailureCode) } : {}),
      },
      memoryPreflightP95Ms: memoryPreflight.p95Ms,
      executionDispatchP95Ms: executionDispatch.p95Ms,
      continuityBlockedTasks,
    });
    return {
      timestamp: this.now(),
      memory: {
        enabled: Boolean(memory.enabled),
        healthy: Boolean(memory.healthy),
        state: this.runtime.memory.currentState,
        dbSize: Number(memory.counts?.db_bytes ?? 0),
        itemCount: Number(memory.counts?.active_items ?? 0),
        query: metricView(this.runtime.metrics.metric('memory.search.duration_ms')),
        preflight: memoryPreflight,
        integrity: String(memory.integrity ?? 'unknown'),
      },
      execution: {
        enabled: Boolean(execution.enabled),
        healthy: Boolean(execution.healthy),
        state: this.runtime.execution.currentState,
        activeRuns: Number(execution.activeRuns ?? executionCounts.activeRuns ?? 0),
        queuedNodes: Number(executionCounts.queuedNodes ?? 0),
        runningNodes: Number(executionCounts.runningNodes ?? 0),
        queuedMemorySync: Number(execution.queuedSync ?? executionCounts.queuedSync ?? 0),
        dag: metricView(this.runtime.metrics.metric('execution.dag_validation.duration_ms')),
        dispatch: executionDispatch,
        wake: metricView(this.runtime.metrics.metric('execution.wake_delivery.duration_ms')),
        integrity: String(execution.integrity ?? 'unknown'),
      },
      resourceGovernance: {
        enabled: Boolean(this.runtime.execution.config.resourceGovernance?.enabled),
        configuredMaxConcurrency,
        decision: resourceDecision,
      },
      diagnosis,
      github,
      routing: {
        ...routing,
        validation: metricView(this.runtime.metrics.metric('routing.validation.duration_ms')),
        capabilityStage: 'v5-local-continuity-execution-fabric',
      },
      audit,
      observability: {
        http: {
          requests: this.runtime.metrics.counter('http.requests.count'),
          failures: this.runtime.metrics.counter('http.failures.count'),
          duration: metricView(this.runtime.metrics.metric('http.request.duration_ms')),
        },
        auth: { failures: this.runtime.metrics.counter('auth.failures.count') },
        oauth: {
          failures: this.runtime.metrics.counter('oauth.failures.count'),
          duration: metricView(this.runtime.metrics.metric('oauth.handle.duration_ms')),
        },
        tools: {
          calls: this.runtime.metrics.counter('tool.calls.count'),
          failures: this.runtime.metrics.counter('tool.failures.count'),
          duration: metricView(this.runtime.metrics.metric('tool.duration_ms')),
        },
        maintenance: {
          backup: metricView(this.runtime.metrics.metric('execution.backup.duration_ms')),
          restore: metricView(this.runtime.metrics.metric('execution.restore.duration_ms')),
          retention: metricView(this.runtime.metrics.metric('execution.retention.duration_ms')),
        },
        audit: {
          written: this.runtime.metrics.counter('audit.written.count'),
          dropped: this.runtime.metrics.counter('audit.dropped.count'),
          writeErrors: this.runtime.metrics.counter('audit.write_errors.count'),
          rotations: this.runtime.metrics.counter('audit.rotation.count'),
        },
        telemetry: {
          ...telemetryStatus,
          exportFailures: this.runtime.metrics.counter('telemetry.export_failures.count'),
          export: metricView(this.runtime.metrics.metric('telemetry.export.duration_ms')),
        },
      },
      overallHealth,
    };
  }

  private async githubMetrics() {
    if (!this.runtime.github.config.enabled) {
      return { enabled: false, apiHealth: 'green' as const, credentialStatus: 'unknown' as const, lastApiCheckMs: null };
    }
    const now = this.now();
    if (this.githubProbeValue && now < this.githubProbeExpiresAt) return { enabled: true, ...this.githubProbeValue };
    if (!this.githubProbePromise) this.githubProbePromise = this.probeGithub();
    try {
      this.githubProbeValue = await this.githubProbePromise;
      this.githubProbeExpiresAt = this.now() + this.githubProbeTtlMs;
      return { enabled: true, ...this.githubProbeValue };
    } finally {
      this.githubProbePromise = undefined;
    }
  }

  private async probeGithub() {
    const status = await this.runtime.github.status();
    if (!status.githubTokenConfigured) {
      return { apiHealth: 'red' as const, credentialStatus: 'missing' as const, lastApiCheckMs: null };
    }
    const started = this.now();
    try {
      const result = await this.runtime.github.apiRequest({ method: 'GET', endpoint: '/user' });
      const elapsed = Math.max(0, this.now() - started);
      if (Number(result?.status ?? 0) >= 200 && Number(result?.status ?? 0) < 300) {
        return { apiHealth: 'green' as const, credentialStatus: 'valid' as const, lastApiCheckMs: elapsed };
      }
      return { apiHealth: 'yellow' as const, credentialStatus: 'unknown' as const, lastApiCheckMs: elapsed, lastFailureCode: `HTTP_${result?.status ?? 'UNKNOWN'}` };
    } catch (error) {
      const elapsed = Math.max(0, this.now() - started);
      const code = error instanceof Error && 'code' in error ? String((error as any).code) : 'GITHUB_API_ERROR';
      const invalid = /AUTH|CREDENTIAL|401/.test(code);
      return { apiHealth: 'red' as const, credentialStatus: invalid ? 'invalid' as const : 'unknown' as const, lastApiCheckMs: elapsed, lastFailureCode: code };
    }
  }
}
