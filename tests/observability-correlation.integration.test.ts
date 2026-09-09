import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';
import { printCommand } from './helpers/platform-command.js';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const loggers: FileAuditLogger[] = [];
const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TRACEPARENT = `00-${TRACE_ID}-bbbbbbbbbbbbbbbb-01`;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-observability-lineage-'));
  roots.push(root);
  const work = path.join(root, 'work');
  await mkdir(work, { recursive: true });
  const defaults = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'advisory' }, root);
  const logger = new FileAuditLogger(path.join(root, 'logs'), defaults.observability.audit);
  loggers.push(logger);
  const runtime = createRuntimeServices(
    [root],
    path.join(root, 'capabilities'),
    logger,
    { ...defaults.memory, enabled: false },
    {
      ...defaults.execution,
      enabled: true,
      stateRoot: path.join(root, 'runtime', 'execution', 'lineage'),
      logRoot: path.join(root, 'runtime', 'execution', 'runs'),
    },
  );
  await runtime.execution.open();
  runtimes.push(runtime);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const principal = await keyStore.create('observability-lineage');
  const server = createServer(createHttpHandler({ keyStore, auditLogger: logger, mcpHandler: createMcpHttpHandler(runtime) }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return {
    root, work, logger, runtime, principal,
    scope: { principalId: principal.metadata.id, projectId: root },
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}

async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      traceparent: TRACEPARENT,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random() * 10_000), method: 'tools/call', params: { name, arguments: args } }),
  });
  const raw = await response.json() as Record<string, any>;
  const text = raw.result?.content?.[0]?.text;
  return {
    raw,
    result: typeof text === 'string' ? JSON.parse(text) as Record<string, any> : {},
    requestId: response.headers.get('x-agent-core-request-id')!,
    responseTraceparent: response.headers.get('traceparent')!,
  };
}

async function route(f: Awaited<ReturnType<typeof fixture>>) {
  const routed = await call(f.baseUrl, f.principal.key, 'capability_route', {
    task: 'Print a diagnostic message',
    context: `Workspace root is ${f.root}`,
  });
  expect(routed.raw.result?.isError).not.toBe(true);
  for (const required of routed.result.requiredSkillLoads ?? []) {
    const loaded = await call(f.baseUrl, f.principal.key, 'skill_load', {
      id: required.id,
      routeContextId: routed.result.routeContextId,
    });
    expect(loaded.raw.result?.isError).not.toBe(true);
  }
  return routed;
}

async function terminal(runtime: RuntimeServices, scope: { principalId: string; projectId: string }, runId: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const status = await runtime.execution.status(scope, runId);
    if (status && ['completed', 'failed', 'blocked', 'interrupted', 'cancelled'].includes(status.state)) return status;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('execution did not become terminal');
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(loggers.splice(0).map((logger) => logger.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('end-to-end request -> route -> tool -> execution evidence correlation', () => {
  it('preserves trace lineage while keeping per-request and per-attempt identifiers factual', async () => {
    const f = await fixture();
    const routed = await route(f);
    expect(routed.responseTraceparent).toMatch(new RegExp(`^00-${TRACE_ID}-[a-f0-9]{16}-01$`));

    const secretSentinel = 'SENTINEL_RAW_COMMAND_CONTENT_DO_NOT_AUDIT';
    const created = await call(f.baseUrl, f.principal.key, 'execution_create', {
      routeContextId: routed.result.routeContextId,
      objective: 'correlated execution fixture',
      nodes: [{ id: 'A', purpose: 'correlate', command: printCommand(secretSentinel), cwd: f.work, inputs: [] }],
    });
    expect(created.raw.result?.isError).not.toBe(true);
    const runId = created.result.runId as string;
    const storedRun = await f.runtime.execution.store.getRun(f.scope, runId);
    expect(storedRun?.metadata).toMatchObject({
      observability: {
        createdBy: {
          requestId: created.requestId,
          trace_id: TRACE_ID,
          toolName: 'execution_create',
          routeContextId: routed.result.routeContextId,
        },
      },
    });

    const started = await call(f.baseUrl, f.principal.key, 'execution_start', {
      routeContextId: routed.result.routeContextId,
      runId,
    });
    expect(started.raw.result?.isError).not.toBe(true);
    const done = await terminal(f.runtime, f.scope, runId);
    expect(done.state).toBe('completed');

    const attempts = await f.runtime.execution.store.listAttempts(f.scope, runId, 'A');
    expect(attempts).toHaveLength(1);
    const marker = await f.runtime.execution.logs.readResult(runId, 'A', 1) as any;
    expect(marker.correlation).toMatchObject({
      requestId: started.requestId,
      trace_id: TRACE_ID,
      toolName: 'execution_start',
      routeContextId: routed.result.routeContextId,
      runId,
      nodeId: 'A',
      attemptId: attempts[0]!.attemptId,
    });

    const events = await f.runtime.execution.events(f.scope, runId, 0, undefined, 100);
    const startedEvent = events.find((event) => event.eventType === 'node.started');
    const terminalEvent = events.find((event) => event.eventType === 'node.succeeded');
    expect(startedEvent?.payload.correlation).toMatchObject({ trace_id: TRACE_ID, requestId: started.requestId, runId, nodeId: 'A' });
    expect(terminalEvent?.payload.correlation).toMatchObject({ trace_id: TRACE_ID, requestId: started.requestId, runId, nodeId: 'A' });

    await f.logger.drain();
    const auditText = await readFile(f.logger.filePath, 'utf8');
    const audit = auditText.trim().split('\n').map((line) => JSON.parse(line));
    expect(audit.some((record) => record.category === 'routing' && record.event === 'route.created' && record.trace_id === TRACE_ID)).toBe(true);
    expect(audit.some((record) => record.category === 'tool' && record.event === 'tool.completed'
      && record.trace_id === TRACE_ID && record.requestId === created.requestId
      && record.data.toolName === 'execution_create')).toBe(true);
    expect(audit.some((record) => record.category === 'tool' && record.data.toolName === 'execution_start'
      && record.requestId === started.requestId)).toBe(true);
    expect(auditText).not.toContain(secretSentinel);

    expect(f.runtime.metrics.counter('tool.calls.count')).toBeGreaterThanOrEqual(3);
    expect(f.runtime.metrics.metric('tool.duration_ms').count).toBeGreaterThanOrEqual(3);
  }, 10_000);
});
