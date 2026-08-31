import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { startAgentCoreService } from '../src/index.js';
import { OtlpHttpJsonExporter } from '../src/observability/otlp-exporter.js';
import { TelemetryService } from '../src/observability/telemetry.js';
import { RuntimeMetricRegistry } from '../src/runtime/metric-window.js';

const servers: Server[] = [];
const roots: string[] = [];

async function collector() {
  const requests: Array<{ path: string; contentType: string | null; body: any }> = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    requests.push({ path: request.url ?? '', contentType: request.headers['content-type'] ?? null, body: JSON.parse(text) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { endpoint: `http://127.0.0.1:${port}/otel`, requests, server };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('loopback OTLP/HTTP JSON export', () => {
  it('posts traces and metrics to exact local OTLP paths with valid IDs and safe attributes', async () => {
    const c = await collector();
    const metrics = new RuntimeMetricRegistry();
    const exporter = new OtlpHttpJsonExporter({ endpoint: c.endpoint, timeoutMs: 1000, metrics, serviceVersion: '0.5.4' });
    const traceId = 'a'.repeat(32);
    const spanId = 'b'.repeat(16);
    expect(await exporter.exportTraces([{
      traceId, spanId, parentSpanId: 'c'.repeat(16), traceFlags: '01',
      name: 'mcp.tool agent_core_status', startTimeMs: 1000, endTimeMs: 1005,
      attributes: { 'mcp.tool.name': 'agent_core_status', 'agent_core.status': 'ok', forbidden: 'discard-me' },
    }])).toBe(true);
    expect(await exporter.exportMetrics({
      counters: { 'http.requests.count': 3, 'tool.calls.count': 2 },
      measurements: { 'http.request.duration_ms': 12.5 },
      timestampMs: 2000,
    })).toBe(true);

    expect(c.requests.map((item) => item.path)).toEqual(['/otel/v1/traces', '/otel/v1/metrics']);
    expect(c.requests.every((item) => item.contentType === 'application/json')).toBe(true);
    const span = c.requests[0]!.body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.traceId).toBe(traceId);
    expect(span.spanId).toBe(spanId);
    expect(span.parentSpanId).toBe('c'.repeat(16));
    const attrs = Object.fromEntries(span.attributes.map((item: any) => [item.key, item.value.stringValue ?? item.value.intValue ?? item.value.doubleValue]));
    expect(attrs).toMatchObject({ 'mcp.tool.name': 'agent_core_status', 'agent_core.status': 'ok' });
    expect(attrs.forbidden).toBeUndefined();
    expect(JSON.stringify(c.requests)).not.toContain('Authorization');
  });

  it('bounds its trace queue and treats an unavailable collector as local telemetry degradation only', async () => {
    const metrics = new RuntimeMetricRegistry();
    const telemetry = new TelemetryService(metrics, {
      enabled: true,
      endpoint: 'http://127.0.0.1:9',
      timeoutMs: 100,
      maxQueue: 2,
      exportIntervalMs: 60_000,
    }, { serviceVersion: '0.5.4' });
    for (let index = 0; index < 3; index += 1) {
      telemetry.recordSpan({
        traceId: `${index + 1}`.repeat(32).slice(0, 32),
        spanId: `${index + 1}`.repeat(16).slice(0, 16),
        traceFlags: '00',
        name: 'http.request', startTimeMs: 1000 + index, endTimeMs: 1001 + index,
        attributes: { 'http.request.method': 'POST', 'http.route': '/mcp', 'http.response.status_code': 200 },
      });
    }
    expect(telemetry.status()).toMatchObject({ enabled: true, queueDepth: 2, queueCapacity: 2, dropped: 1 });
    await expect(telemetry.flush()).resolves.toBe(false);
    expect(telemetry.status().queueDepth).toBeLessThanOrEqual(2);
    expect(metrics.counter('telemetry.export_failures.count')).toBeGreaterThanOrEqual(1);
    await telemetry.close();
  });

  it('exports real HTTP and MCP tool spans, while Agent Core remains functional when the collector disappears', async () => {
    const c = await collector();
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-otlp-runtime-'));
    roots.push(root);
    const config = loadConfig({ AGENT_CORE_OTLP_ENDPOINT: c.endpoint, AGENT_CORE_OTLP_EXPORT_INTERVAL_MS: '60000' }, root);
    config.port = 0;
    config.allowedRoots = [root];
    config.dataDir = path.join(root, 'data');
    config.logDir = path.join(root, 'logs');
    config.capabilityDir = path.join(root, 'capabilities');
    config.memory = { ...config.memory, enabled: false };
    config.execution = { ...config.execution, dbPath: path.join(root, 'execution.sqlite'), logRoot: path.join(root, 'runs') };
    config.github = { ...config.github, enabled: false };
    const keyStore = new FileKeyStore(config.dataDir);
    const key = await keyStore.create('otlp-runtime');
    const service = await startAgentCoreService(config);
    try {
      const baseUrl = `http://${service.host}:${service.port}`;
      const health = await fetch(`${baseUrl}/health`);
      expect(health.status).toBe(200);
      const status = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.key}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agent_core_status', arguments: {} } }),
      });
      expect(status.status).toBe(200);
      await service.telemetry.flush();
      const traces = c.requests.filter((item) => item.path.endsWith('/v1/traces'));
      const names = traces.flatMap((item) => item.body.resourceSpans.flatMap((rs: any) => rs.scopeSpans.flatMap((ss: any) => ss.spans.map((span: any) => span.name))));
      expect(names).toContain('http.request');
      expect(names).toContain('mcp.tool agent_core_status');

      await new Promise<void>((resolve) => c.server.close(() => resolve()));
      const collectorIndex = servers.indexOf(c.server);
      if (collectorIndex >= 0) servers.splice(collectorIndex, 1);
      const afterCollector = await fetch(`${baseUrl}/health`);
      expect(afterCollector.status).toBe(200);
      await expect(service.telemetry.flush()).resolves.toBe(false);
      const detailed = await fetch(`${baseUrl}/health/metrics`).then((response) => response.json()) as any;
      expect(detailed.overallHealth).toBe('healthy');
      expect(detailed.observability.telemetry).toMatchObject({ enabled: true, exportFailures: expect.any(Number) });
      expect(detailed.observability.telemetry.lastFailureCode).toBeTruthy();
      expect(JSON.stringify(detailed)).not.toContain(c.endpoint);
    } finally {
      await service.close();
    }
  }, 15_000);
});
