import { randomBytes } from 'node:crypto';
import type { OtlpObservabilityConfig } from '../config.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import { currentCorrelation } from './correlation.js';
import { OtlpHttpJsonExporter, type TelemetrySpan, type TelemetryAttributeValue } from './otlp-exporter.js';

export interface TelemetryServiceOptions {
  serviceVersion: string;
  exporter?: OtlpHttpJsonExporter;
  now?: () => number;
}

const SAFE_COUNTERS = [
  'http.requests.count', 'http.failures.count', 'auth.failures.count', 'oauth.failures.count',
  'routing.created.count', 'routing.rejected.count', 'routing.expired.count',
  'tool.calls.count', 'tool.failures.count',
  'audit.written.count', 'audit.dropped.count', 'audit.write_errors.count', 'audit.rotation.count',
  'telemetry.export_failures.count', 'telemetry.dropped.count',
] as const;

const SAFE_MEASUREMENTS = [
  'http.request.duration_ms', 'oauth.handle.duration_ms', 'routing.validation.duration_ms', 'tool.duration_ms',
  'memory.search.duration_ms', 'memory.preflight.duration_ms',
  'execution.dag_validation.duration_ms', 'execution.dispatch.duration_ms', 'execution.wake_delivery.duration_ms',
  'execution.backup.duration_ms', 'execution.restore.duration_ms', 'execution.retention.duration_ms',
  'telemetry.export.duration_ms',
] as const;

function randomSpanId(): string {
  while (true) {
    const value = randomBytes(8).toString('hex');
    if (!/^0+$/.test(value)) return value;
  }
}

export class TelemetryService {
  private readonly queue: TelemetrySpan[] = [];
  private readonly exporter?: OtlpHttpJsonExporter;
  private readonly now: () => number;
  private readonly timer?: NodeJS.Timeout;
  private inFlight?: Promise<boolean>;
  private dropped = 0;
  private lastExportAt?: number;
  private lastFailureCode?: string;

  constructor(
    private readonly metrics: RuntimeMetricRegistry,
    readonly config: OtlpObservabilityConfig,
    options: TelemetryServiceOptions,
  ) {
    this.now = options.now ?? Date.now;
    if (config.enabled) {
      if (!config.endpoint) throw new Error('Enabled OTLP telemetry requires a loopback endpoint');
      this.exporter = options.exporter ?? new OtlpHttpJsonExporter({
        endpoint: config.endpoint,
        timeoutMs: config.timeoutMs,
        metrics,
        serviceVersion: options.serviceVersion,
      });
      this.timer = setInterval(() => { void this.flush(); }, config.exportIntervalMs);
      this.timer.unref?.();
    }
  }

  status() {
    return {
      enabled: this.config.enabled,
      queueDepth: this.queue.length,
      queueCapacity: this.config.maxQueue,
      dropped: this.dropped,
      ...(this.lastExportAt === undefined ? {} : { lastExportAt: this.lastExportAt }),
      ...(this.lastFailureCode ? { lastFailureCode: this.lastFailureCode } : {}),
    };
  }

  recordSpan(span: TelemetrySpan): boolean {
    if (!this.config.enabled) return false;
    if (this.queue.length >= this.config.maxQueue) {
      this.queue.shift();
      this.dropped += 1;
      this.metrics.increment('telemetry.dropped.count');
    }
    this.queue.push({ ...span, attributes: { ...span.attributes } });
    return true;
  }

  recordHttpSpan(startTimeMs: number, endTimeMs: number, attributes: Record<string, TelemetryAttributeValue>): boolean {
    const current = currentCorrelation();
    if (!current) return false;
    return this.recordSpan({
      traceId: current.traceId,
      spanId: current.spanId,
      ...(current.parentSpanId ? { parentSpanId: current.parentSpanId } : {}),
      traceFlags: current.traceFlags,
      name: 'http.request',
      startTimeMs,
      endTimeMs,
      attributes,
    });
  }

  recordToolSpan(name: string, startTimeMs: number, endTimeMs: number, attributes: Record<string, TelemetryAttributeValue>): boolean {
    const current = currentCorrelation();
    if (!current) return false;
    return this.recordSpan({
      traceId: current.traceId,
      spanId: randomSpanId(),
      parentSpanId: current.spanId,
      traceFlags: current.traceFlags,
      name: `mcp.tool ${name}`.slice(0, 200),
      startTimeMs,
      endTimeMs,
      attributes,
    });
  }

  flush(): Promise<boolean> {
    if (!this.config.enabled || !this.exporter) return Promise.resolve(true);
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.flushOnce().finally(() => { this.inFlight = undefined; });
    return this.inFlight;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush().catch(() => false);
  }

  private async flushOnce(): Promise<boolean> {
    const batch = this.queue.splice(0);
    const tracesOk = batch.length === 0 ? true : await this.exporter!.exportTraces(batch);
    const metricsOk = await this.exporter!.exportMetrics(this.metricSnapshot());
    const ok = tracesOk && metricsOk;
    if (!tracesOk && batch.length > 0) {
      const combined = [...batch, ...this.queue];
      const overflow = Math.max(0, combined.length - this.config.maxQueue);
      if (overflow > 0) {
        this.dropped += overflow;
        this.metrics.increment('telemetry.dropped.count', overflow);
      }
      this.queue.splice(0, this.queue.length, ...combined.slice(-this.config.maxQueue));
    }
    if (ok) {
      this.lastExportAt = this.now();
      this.lastFailureCode = undefined;
    } else {
      this.lastFailureCode = this.exporter!.status().lastFailureCode ?? 'OTLP_EXPORT_FAILED';
    }
    return ok;
  }

  private metricSnapshot() {
    const counters: Record<string, number> = {};
    for (const name of SAFE_COUNTERS) counters[name] = this.metrics.counter(name);
    const measurements: Record<string, number> = {};
    for (const name of SAFE_MEASUREMENTS) {
      const value = this.metrics.metric(name).last;
      if (value !== null) measurements[name] = value;
    }
    return { counters, measurements, timestampMs: this.now() };
  }
}
