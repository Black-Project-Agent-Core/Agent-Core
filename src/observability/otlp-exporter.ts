import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';

export type TelemetryAttributeValue = string | number | boolean;

export interface TelemetrySpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  traceFlags: string;
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  attributes: Record<string, TelemetryAttributeValue>;
}

export interface TelemetryMetricSnapshot {
  counters: Record<string, number>;
  measurements: Record<string, number>;
  timestampMs: number;
}

export interface OtlpHttpJsonExporterOptions {
  endpoint: string;
  timeoutMs: number;
  metrics?: RuntimeMetricRegistry;
  serviceVersion: string;
  fetchImpl?: typeof fetch;
}

const TRACE_ID = /^[a-f0-9]{32}$/;
const SPAN_ID = /^[a-f0-9]{16}$/;
const TRACE_FLAGS = /^[a-f0-9]{2}$/;
const SAFE_ATTRIBUTE_KEYS = new Set([
  'http.request.method',
  'http.route',
  'http.response.status_code',
  'mcp.tool.name',
  'agent_core.status',
  'error.type',
]);
const SAFE_METRIC_NAME = /^(?:http|auth|oauth|routing|tool|execution|audit|telemetry|memory|github)\.[A-Za-z0-9_.:-]{1,160}$/;

function loopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') return true;
  if (!/^127(?:\.\d{1,3}){3}$/.test(normalized)) return false;
  return normalized.split('.').every((part) => {
    const value = Number(part);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

function assertLoopbackEndpoint(endpoint: string): string {
  let parsed: URL;
  try { parsed = new URL(endpoint); }
  catch { throw new Error('OTLP endpoint must be a valid URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('OTLP endpoint must use http or https');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('OTLP endpoint must not contain credentials, query, or fragment');
  if (!loopbackHostname(parsed.hostname)) throw new Error('OTLP endpoint must use a loopback hostname');
  const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/g, '');
  return `${parsed.origin}${pathname}`;
}

function anyValue(value: TelemetryAttributeValue) {
  if (typeof value === 'string') return { stringValue: value.slice(0, 500) };
  if (typeof value === 'boolean') return { boolValue: value };
  if (Number.isInteger(value)) return { intValue: String(value) };
  return { doubleValue: value };
}

function safeAttributes(input: Record<string, TelemetryAttributeValue>) {
  return Object.entries(input)
    .filter(([key, value]) => SAFE_ATTRIBUTE_KEYS.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, value: anyValue(value) }));
}

function unixNano(ms: number): string {
  const safe = Number.isFinite(ms) && ms >= 0 ? ms : Date.now();
  return (BigInt(Math.floor(safe * 1000)) * 1000n).toString();
}

function resource(serviceVersion: string) {
  return {
    attributes: [
      { key: 'service.name', value: { stringValue: 'agent-core' } },
      { key: 'service.version', value: { stringValue: serviceVersion.slice(0, 80) } },
    ],
  };
}

function failureCode(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string') return String((error as { name: string }).name).slice(0, 120);
  return 'OTLP_EXPORT_ERROR';
}

export class OtlpHttpJsonExporter {
  readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private lastFailureCode?: string;

  constructor(private readonly options: OtlpHttpJsonExporterOptions) {
    this.endpoint = assertLoopbackEndpoint(options.endpoint);
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 60_000) {
      throw new Error('OTLP timeoutMs must be between 1 and 60000');
    }
  }

  status(): { lastFailureCode?: string } {
    return this.lastFailureCode ? { lastFailureCode: this.lastFailureCode } : {};
  }

  async exportTraces(spans: TelemetrySpan[]): Promise<boolean> {
    const safeSpans = spans.filter((span) => TRACE_ID.test(span.traceId) && SPAN_ID.test(span.spanId) && TRACE_FLAGS.test(span.traceFlags))
      .slice(0, 65_536)
      .map((span) => ({
        traceId: span.traceId,
        spanId: span.spanId,
        ...(span.parentSpanId && SPAN_ID.test(span.parentSpanId) ? { parentSpanId: span.parentSpanId } : {}),
        name: span.name.slice(0, 200),
        kind: 1,
        startTimeUnixNano: unixNano(span.startTimeMs),
        endTimeUnixNano: unixNano(Math.max(span.startTimeMs, span.endTimeMs)),
        attributes: safeAttributes(span.attributes),
        flags: Number.parseInt(span.traceFlags, 16) & 1,
        status: { code: span.attributes['agent_core.status'] === 'error' ? 2 : 1 },
      }));
    if (safeSpans.length === 0) return true;
    return this.post('/v1/traces', {
      resourceSpans: [{
        resource: resource(this.options.serviceVersion),
        scopeSpans: [{ scope: { name: 'agent-core.observability', version: this.options.serviceVersion }, spans: safeSpans }],
      }],
    });
  }

  async exportMetrics(snapshot: TelemetryMetricSnapshot): Promise<boolean> {
    const timeUnixNano = unixNano(snapshot.timestampMs);
    const metrics = [
      ...Object.entries(snapshot.counters)
        .filter(([name, value]) => SAFE_METRIC_NAME.test(name) && Number.isFinite(value))
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, 512)
        .map(([name, value]) => ({
          name,
          sum: {
            aggregationTemporality: 2,
            isMonotonic: true,
            dataPoints: [{ timeUnixNano, asInt: String(Math.max(0, Math.trunc(value))) }],
          },
        })),
      ...Object.entries(snapshot.measurements)
        .filter(([name, value]) => SAFE_METRIC_NAME.test(name) && Number.isFinite(value))
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, 512)
        .map(([name, value]) => ({ name, gauge: { dataPoints: [{ timeUnixNano, asDouble: value }] } })),
    ];
    return this.post('/v1/metrics', {
      resourceMetrics: [{
        resource: resource(this.options.serviceVersion),
        scopeMetrics: [{ scope: { name: 'agent-core.observability', version: this.options.serviceVersion }, metrics }],
      }],
    });
  }

  private async post(suffix: '/v1/traces' | '/v1/metrics', body: unknown): Promise<boolean> {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.endpoint}${suffix}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.lastFailureCode = `HTTP_${response.status}`;
        this.options.metrics?.increment('telemetry.export_failures.count');
        this.options.metrics?.failure('telemetry.export.duration_ms', this.lastFailureCode);
        return false;
      }
      this.lastFailureCode = undefined;
      return true;
    } catch (error) {
      this.lastFailureCode = failureCode(error);
      this.options.metrics?.increment('telemetry.export_failures.count');
      this.options.metrics?.failure('telemetry.export.duration_ms', this.lastFailureCode);
      return false;
    } finally {
      clearTimeout(timer);
      this.options.metrics?.observe('telemetry.export.duration_ms', Math.max(0, performance.now() - startedAt));
    }
  }
}
