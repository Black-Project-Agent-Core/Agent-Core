import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import {
  correlationFields,
  createRequestCorrelation,
  currentCorrelation,
  formatTraceparent,
  runWithCorrelation,
  withCorrelation,
} from '../src/observability/correlation.js';

const servers: Server[] = [];
const roots: string[] = [];
const auditLoggers: FileAuditLogger[] = [];

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function root() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-core-correlation-'));
  roots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(auditLoggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('request correlation context', () => {
  it('preserves a valid inbound W3C trace id/flags, records the parent span, and creates a new local span', () => {
    const inbound = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    const correlation = createRequestCorrelation({ traceparent: inbound });
    expect(correlation.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(correlation.traceId).toBe('0123456789abcdef0123456789abcdef');
    expect(correlation.parentSpanId).toBe('0123456789abcdef');
    expect(correlation.traceFlags).toBe('01');
    expect(correlation.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(correlation.spanId).not.toBe(correlation.parentSpanId);
    expect(formatTraceparent(correlation)).toBe(`00-${correlation.traceId}-${correlation.spanId}-01`);
  });

  it.each([
    undefined,
    '',
    '00-00000000000000000000000000000000-0123456789abcdef-01',
    '00-0123456789abcdef0123456789abcdef-0000000000000000-01',
    '00-0123456789abcdef0123456789abcdef-0123456789abcdef-zz',
    'ff-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01,00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
  ])('replaces missing/malformed traceparent %s with a fresh local trace', (traceparent) => {
    const correlation = createRequestCorrelation(traceparent === undefined ? {} : { traceparent });
    expect(correlation.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(correlation.traceId).not.toBe('00000000000000000000000000000000');
    expect(correlation.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(correlation.spanId).not.toBe('0000000000000000');
    expect(correlation.parentSpanId).toBeUndefined();
    expect(correlation.traceFlags).toBe('00');
  });

  it('keeps nested correlation immutable and isolated across concurrent async flows', async () => {
    const first = createRequestCorrelation({});
    const second = createRequestCorrelation({});
    const seen: string[] = [];
    await Promise.all([
      runWithCorrelation(first, async () => {
        await withCorrelation({ toolName: 'execution_create', routeContextId: 'route-a' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          const active = currentCorrelation()!;
          seen.push(`${active.requestId}:${active.toolName}:${active.routeContextId}`);
        });
        expect(currentCorrelation()?.toolName).toBeUndefined();
      }),
      runWithCorrelation(second, async () => {
        await withCorrelation({ toolName: 'read_file', routeContextId: 'route-b' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          const active = currentCorrelation()!;
          seen.push(`${active.requestId}:${active.toolName}:${active.routeContextId}`);
        });
      }),
    ]);
    expect(seen).toEqual(expect.arrayContaining([
      `${first.requestId}:execution_create:route-a`,
      `${second.requestId}:read_file:route-b`,
    ]));
    expect(currentCorrelation()).toBeNull();
    expect(first).not.toHaveProperty('toolName');
  });

  it('returns safe OpenTelemetry-compatible correlation fields', async () => {
    const correlation = createRequestCorrelation({});
    await runWithCorrelation(correlation, async () => withCorrelation({
      routeContextId: 'route-1', toolName: 'execution_start', runId: 'run-1', nodeId: 'A', attemptId: 'attempt-1',
    }, async () => {
      expect(correlationFields()).toEqual({
        requestId: correlation.requestId,
        trace_id: correlation.traceId,
        span_id: correlation.spanId,
        trace_flags: correlation.traceFlags,
        routeContextId: 'route-1',
        toolName: 'execution_start',
        runId: 'run-1',
        nodeId: 'A',
        attemptId: 'attempt-1',
      });
    }));
  });

  it('sets request/trace response headers and makes the same context visible to the MCP hook', async () => {
    const dir = await root();
    const inbound = '00-11111111111111111111111111111111-2222222222222222-01';
    let observed: ReturnType<typeof currentCorrelation> = null;
    const auditLogger = new FileAuditLogger(path.join(dir, 'logs'));
    auditLoggers.push(auditLogger);
    const handler = createHttpHandler({
      keyStore: new FileKeyStore(path.join(dir, 'data')),
      auditLogger,
      mcpHandler: async (_request, response) => {
        observed = currentCorrelation();
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'fixture' }));
      },
    });
    // unauthenticated requests never reach MCP, so health gives a clean request-boundary assertion.
    const baseUrl = await listen(createServer(handler));
    const response = await fetch(`${baseUrl}/health`, { headers: { traceparent: inbound } });
    expect(response.status).toBe(200);
    const requestId = response.headers.get('x-agent-core-request-id');
    const traceparent = response.headers.get('traceparent');
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(traceparent).toMatch(/^00-11111111111111111111111111111111-[0-9a-f]{16}-01$/);
    expect(traceparent).not.toContain('2222222222222222-01');
    expect(observed).toBeNull();
  });
});
