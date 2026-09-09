import { describe, expect, it } from 'vitest';
import { RuntimeHealthMetrics } from '../src/runtime/health-metrics.js';
import { RuntimeMetricRegistry } from '../src/runtime/metric-window.js';
import { RouteContextStore } from '../src/runtime/route-context-store.js';
import { loadConfig } from '../src/config.js';
import { createRuntimeServices } from '../src/runtime/services.js';
import { startAgentCoreService } from '../src/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { memoryConfig, strictMemoryConfig, isolatedMemoryDependencies } from './helpers/memory-fixture.js';
import { printCommand } from './helpers/platform-command.js';
import { FileKeyStore } from '../src/auth/key-store.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { canonicalFileNativeProjectId } from '../src/memory/file-native/paths.js';

function routePlan(): RoutePlan {
  return {
    tier: 'atomic', mode: 'atomic_direct', domain: 'general', confidence: 1, risk: 'low',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['read_file'],
    verification: { required: false, suggestedTools: [] }, reasonCodes: ['fixture'],
  };
}

describe('bounded runtime observability', () => {
  it('keeps bounded rolling samples while preserving total count and deterministic percentiles', () => {
    const metrics = new RuntimeMetricRegistry({ sampleCapacity: 5, now: () => 10_000 });
    for (let value = 1; value <= 10; value += 1) metrics.observe('memory.search.duration_ms', value);
    metrics.failure('memory.search.duration_ms', 'MEMORY_TEST_FAILURE');

    expect(metrics.metric('memory.search.duration_ms')).toEqual({
      count: 10,
      windowSize: 5,
      last: 10,
      p50: 8,
      p95: 10,
      p99: 10,
      max: 10,
      lastFailureCode: 'MEMORY_TEST_FAILURE',
      lastFailureAt: 10_000,
    });
  });

  it('exposes only a bounded sorted registry inventory and counter snapshot', () => {
    const metrics = new RuntimeMetricRegistry({ sampleCapacity: 3 });
    for (let index = 0; index < 300; index += 1) metrics.increment(`counter.${String(index).padStart(3, '0')}`);
    metrics.observe('duration.safe', 12);
    const names = metrics.metricNames();
    expect(names).toEqual([...names].sort());
    expect(names).toHaveLength(256);
    const counters = metrics.counterSnapshot();
    expect(Object.keys(counters)).toEqual([...Object.keys(counters)].sort());
    expect(Object.keys(counters)).toHaveLength(256);
    expect(JSON.stringify(counters)).not.toContain('principal');
  });

  it('tracks route lifecycle counters without exposing route contents', () => {
    let now = Date.parse('2026-08-27T00:00:00.000Z');
    const metrics = new RuntimeMetricRegistry({ now: () => now });
    const store = new RouteContextStore({ now: () => now, ttlMs: 100, metrics });
    const first = store.create('principal-a', routePlan());
    store.create('principal-a', routePlan());
    expect(store.metrics()).toMatchObject({ totalRoutes: 2, activeContexts: 2, rejectedRoutes: 0, expiredContexts: 0 });

    expect(() => store.validate(first.routeContextId, 'principal-b', 'read_file')).toThrow();
    expect(store.metrics().rejectedRoutes).toBe(1);
    now += 101;
    expect(store.get(first.routeContextId)).toBeNull();
    expect(store.metrics()).toMatchObject({ activeContexts: 0, expiredContexts: 2 });
  });

  it('caches and single-flights GitHub API health probes while distinguishing configured from valid credentials', async () => {
    let now = 1_000;
    let calls = 0;
    let resolveProbe!: () => void;
    const gate = new Promise<void>((resolve) => { resolveProbe = resolve; });
    const runtime = {
      metrics: new RuntimeMetricRegistry({ now: () => now }),
      memory: {
        config: { enabled: true }, currentState: 'healthy',
        status: async () => ({ enabled: true, healthy: true, counts: { active_items: 7, db_bytes: 100 }, integrity: 'ok' }),
      },
      execution: {
        config: { enabled: true }, currentState: 'healthy',
        health: async () => ({ enabled: true, healthy: true, activeRuns: 1, queuedSync: 0, integrity: 'ok' }),
        store: { systemCounts: async () => ({ activeRuns: 1, queuedSync: 0, queuedNodes: 2, runningNodes: 1 }) },
      },
      github: {
        config: { enabled: true },
        status: async () => ({ githubTokenConfigured: true, packagesTokenConfigured: false, gitAvailable: true }),
        apiRequest: async () => { calls += 1; await gate; return { status: 200, data: { login: 'safe-user' } }; },
      },
      routes: { metrics: () => ({ totalRoutes: 3, activeContexts: 1, rejectedRoutes: 0, expiredContexts: 2 }) },
      capabilities: { coverage: () => ({ nativeReady: 2 }) },
    } as any;
    const provider = new RuntimeHealthMetrics(runtime, { now: () => now, githubProbeTtlMs: 5000 });

    const firstPromise = provider.getMetrics();
    const secondPromise = provider.getMetrics();
    await Promise.resolve();
    expect(calls).toBe(1);
    resolveProbe();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(second.github).toEqual(first.github);
    expect(first.github).toMatchObject({ apiHealth: 'green', credentialStatus: 'valid' });
    expect(first.overallHealth).toBe('healthy');

    await provider.getMetrics();
    expect(calls).toBe(1);
    now += 5001;
    await provider.getMetrics();
    expect(calls).toBe(2);
  });

  it('classifies required local persistence failure as critical and optional GitHub failure as degraded', async () => {
    const base = {
      metrics: new RuntimeMetricRegistry(),
      execution: {
        config: { enabled: true }, currentState: 'healthy',
        health: async () => ({ enabled: true, healthy: true, activeRuns: 0, queuedSync: 0, integrity: 'ok' }),
        store: { systemCounts: async () => ({ activeRuns: 0, queuedSync: 0, queuedNodes: 0, runningNodes: 0 }) },
      },
      routes: { metrics: () => ({ totalRoutes: 0, activeContexts: 0, rejectedRoutes: 0, expiredContexts: 0 }) },
      capabilities: { coverage: () => ({ nativeReady: 0 }) },
    } as any;

    const critical = new RuntimeHealthMetrics({
      ...base,
      memory: { config: { enabled: true }, currentState: 'degraded', status: async () => ({ enabled: true, healthy: false, counts: {}, integrity: 'corrupt' }) },
      github: { config: { enabled: false }, status: async () => ({ githubTokenConfigured: false }), apiRequest: async () => ({ status: 200 }) },
    } as any);
    expect((await critical.getMetrics()).overallHealth).toBe('critical');

    const degraded = new RuntimeHealthMetrics({
      ...base,
      memory: { config: { enabled: true }, currentState: 'healthy', status: async () => ({ enabled: true, healthy: true, counts: {}, integrity: 'ok' }) },
      github: { config: { enabled: true }, status: async () => ({ githubTokenConfigured: false }), apiRequest: async () => ({ status: 200 }) },
    } as any);
    const degradedMetrics = await degraded.getMetrics();
    expect(degradedMetrics.github).toMatchObject({ credentialStatus: 'missing', apiHealth: 'red' });
    expect(degradedMetrics.overallHealth).toBe('degraded');
  });

  it('instruments real memory, DAG, dispatch, and wake operations through the shared runtime registry', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-health-instrumentation-'));
    const defaults = loadConfig({}, root);
    const runtime = createRuntimeServices(
      [root], path.join(root, 'capabilities'), undefined,
      await memoryConfig(root),
      { ...defaults.execution, enabled: true },
      { ...defaults.github, enabled: false },
    );
    try {
      await runtime.execution.open();
      await runtime.memory.search({ scope: { principalId: 'metrics-principal', projectId: root }, query: 'no matching memory' });
      expect(runtime.metrics.metric('memory.search.duration_ms').count).toBe(1);

      const reservation = runtime.routes.reserve();
      const task = 'Print a diagnostic message';
      const workflow = await runtime.workflow.bind({ principalId: runtime.memory.config.principalId ?? 'metrics-principal',
        projectId: canonicalFileNativeProjectId(runtime.memory.config.fileNative, root), taskId: reservation.routeContextId }, { brief: task });
      const route = runtime.routes.create('metrics-principal', runtime.router.route(task), { reservation, projectId: root,
        workflow: { taskId: workflow.taskId, version: workflow.version, craftRequired: false, dagRequired: false } });

      const created = await runtime.execution.create({ principalId: 'metrics-principal', projectId: root }, {
        objective: 'metrics fixture',
        originRouteContextId: route.routeContextId, continuityTaskId: workflow.taskId,
        nodes: [{ id: 'A', purpose: 'A', command: printCommand('ok'), cwd: root, inputs: [] }],
      });
      expect(runtime.metrics.metric('execution.dag_validation.duration_ms').count).toBe(1);
      await runtime.execution.start({ principalId: 'metrics-principal', projectId: root }, created.runId);
      expect(runtime.metrics.metric('execution.dispatch.duration_ms').count).toBeGreaterThanOrEqual(1);
      await runtime.execution.wait(
        { principalId: 'metrics-principal', projectId: root }, created.runId, created.lastEventSequence,
        { eventTypes: ['run.completed'] }, 5_000,
      );
      expect(runtime.metrics.metric('execution.wake_delivery.duration_ms').count).toBeGreaterThanOrEqual(1);
    } finally {
      await runtime.execution.close().catch(() => undefined);
      await runtime.memory.close().catch(() => undefined);
      await runtime.operatorDirectives.close().catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    }
  }, 10_000);

  it('reports bounded audit and observability health without full hashes or request identifiers', async () => {
    const metrics = new RuntimeMetricRegistry({ now: () => 55_000 });
    metrics.increment('http.requests.count', 7);
    metrics.increment('http.failures.count', 2);
    metrics.increment('auth.failures.count', 1);
    metrics.increment('tool.calls.count', 4);
    metrics.increment('tool.failures.count', 1);
    metrics.observe('http.request.duration_ms', 10);
    metrics.observe('tool.duration_ms', 20);
    const fullHash = 'a'.repeat(64);
    const runtime = {
      metrics,
      audit: { status: () => ({ queueDepth: 2, queueCapacity: 4096, written: 11, dropped: 1, writeErrors: 0, sequence: 11, headHash: fullHash, currentFileBytes: 1234, rotatedFiles: 2 }) },
      memory: { config: { enabled: true }, currentState: 'healthy', status: async () => ({ enabled: true, healthy: true, counts: { active_items: 1, db_bytes: 10 }, integrity: 'ok' }) },
      execution: { config: { enabled: true }, currentState: 'healthy', health: async () => ({ enabled: true, healthy: true, activeRuns: 0, queuedSync: 0, integrity: 'ok' }), store: { systemCounts: async () => ({ activeRuns: 0, queuedSync: 0, queuedNodes: 0, runningNodes: 0 }) } },
      github: { config: { enabled: false }, status: async () => ({ githubTokenConfigured: false }), apiRequest: async () => ({ status: 200 }) },
      routes: { metrics: () => ({ totalRoutes: 0, activeContexts: 0, rejectedRoutes: 0, expiredContexts: 0 }) },
      capabilities: { coverage: () => ({ nativeReady: 0 }) },
    } as any;
    const snapshot = await new RuntimeHealthMetrics(runtime, { now: () => 55_000 }).getMetrics() as any;
    expect(snapshot.audit).toMatchObject({ queueDepth: 2, queueCapacity: 4096, written: 11, dropped: 1, rotatedFiles: 2, headHashPrefix: 'aaaaaaaaaaaaaaaa' });
    expect(snapshot.observability).toMatchObject({
      http: { requests: 7, failures: 2, duration: { count: 1, p50Ms: 10 } },
      auth: { failures: 1 },
      tools: { calls: 4, failures: 1, duration: { count: 1, p50Ms: 20 } },
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(fullHash);
    expect(serialized).not.toContain('requestId');
    expect(serialized).not.toContain('trace_id');
  });

  it('counts HTTP/auth failures and route-validation latency without cardinality labels', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-observability-http-metrics-'));
    const metrics = new RuntimeMetricRegistry();
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const logger = new FileAuditLogger(path.join(root, 'logs'), { metrics });
    const routes = new RouteContextStore({ metrics });
    const route = routes.create('principal-a', routePlan());
    expect(() => routes.validate(route.routeContextId, 'principal-b', 'read_file')).toThrow();
    const server = createServer(createHttpHandler({
      keyStore,
      auditLogger: logger,
      metrics,
      mcpHandler: async () => { throw new Error('must not dispatch'); },
    }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const response = await fetch(`${baseUrl}/mcp`, { method: 'POST' });
      expect(response.status).toBe(401);
      await logger.drain();
      expect(metrics.counter('http.requests.count')).toBe(1);
      expect(metrics.counter('http.failures.count')).toBe(1);
      expect(metrics.counter('auth.failures.count')).toBe(1);
      expect(metrics.counter('audit.written.count')).toBe(1);
      expect(metrics.metric('http.request.duration_ms').count).toBe(1);
      expect(metrics.metric('routing.validation.duration_ms').count).toBe(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await logger.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports bounded resource governance and scoped diagnosis without leaking principal or task contents', async () => {
    const metrics = new RuntimeMetricRegistry();
    metrics.observe('memory.preflight.duration_ms', 151);
    metrics.observe('execution.dispatch.duration_ms', 101);
    const decision = {
      capturedAt: 10,
      requestedMaxConcurrency: 4,
      safeConcurrency: 2,
      throttled: true,
      severity: 'warning' as const,
      reasonCodes: ['local_memory_pressure'] as const,
      snapshot: {
        capturedAt: 10,
        cpu: { normalizedLoad: 0.2, available: true },
        memory: { usedRatio: 0.9, available: true },
        storage: { freeRatio: 0.5, available: true },
        backlog: { auditQueueRatio: null, telemetryQueueRatio: null, queuedMemorySync: null, queuedMemorySyncAvailable: false },
        worker: { healthy: true, available: true },
      },
    };
    const runtime = {
      metrics,
      resourceGovernor: { decide: async () => structuredClone(decision) },
      memory: {
        config: { enabled: true }, currentState: 'healthy',
        status: async () => ({ enabled: true, healthy: true, counts: { active_items: 1, db_bytes: 10 }, integrity: 'ok' }),
        getContinuitySnapshot: async () => ({ blockedTasks: [{ title: 'SECRET TASK CONTENT' }] }),
      },
      execution: {
        config: { enabled: true, maxConcurrency: 4, resourceGovernance: { enabled: true } }, currentState: 'healthy',
        health: async () => ({ enabled: true, healthy: true, activeRuns: 0, queuedSync: 0, integrity: 'ok' }),
        store: { systemCounts: async () => ({ activeRuns: 0, queuedSync: 0, queuedNodes: 0, runningNodes: 0 }) },
      },
      github: { config: { enabled: false }, status: async () => ({ githubTokenConfigured: false }), apiRequest: async () => ({ status: 200 }) },
      routes: { metrics: () => ({ totalRoutes: 0, activeContexts: 0, rejectedRoutes: 0, expiredContexts: 0 }) },
      capabilities: { coverage: () => ({ nativeReady: 0 }) },
      audit: { status: () => ({ queueDepth: 0, queueCapacity: 100, written: 0, dropped: 0, writeErrors: 0, sequence: 0, headHash: null, currentFileBytes: 0, rotatedFiles: 0 }) },
      telemetry: { status: () => ({ enabled: false, queueDepth: 0, queueCapacity: 0, dropped: 0 }) },
      maintenance: { status: () => ({ enabled: true, running: false, runCount: 2, retentionCandidates: 2, failureCodes: [], nextRunAt: 50, overdue: true }) },
    } as any;
    const snapshot = await new RuntimeHealthMetrics(runtime).getMetrics({ principalId: 'SECRET_PRINCIPAL', projectId: 'SECRET_PROJECT' } as any) as any;
    expect(snapshot.resourceGovernance).toMatchObject({
      enabled: true,
      configuredMaxConcurrency: 4,
      decision: { safeConcurrency: 2, severity: 'warning', reasonCodes: ['local_memory_pressure'] },
    });
    expect(snapshot.diagnosis.map((item: any) => item.code)).toEqual([
      'resource_pressure_active',
      'memory_latency_regression',
      'execution_dispatch_latency_regression',
      'continuity_blockers_present',
      'retention_candidates_present',
      'maintenance_overdue',
    ]);
    expect(snapshot.maintenance).toMatchObject({ enabled: true, retentionCandidates: 2, overdue: true });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('SECRET_PRINCIPAL');
    expect(serialized).not.toContain('SECRET_PROJECT');
    expect(serialized).not.toContain('SECRET TASK CONTENT');
  });

  it('serves detailed metrics separately from lightweight readiness without exposing credential paths', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-health-http-'));
    const config = loadConfig({}, root);
    config.memory = await strictMemoryConfig(root);
    config.port = 0;
    config.allowedRoots = [root];
    config.dataDir = path.join(root, 'data');
    config.logDir = path.join(root, 'logs');
    config.capabilityDir = path.join(root, 'capabilities');
    config.github = { ...config.github, enabled: false };
    config.maintenance = { ...config.maintenance, enabled: true, intervalMs: 60 * 60 * 1000 };
    const service = await startAgentCoreService(config,{memory:isolatedMemoryDependencies(config.memory)});
    try {
      const readiness = await (await fetch(`http://${service.host}:${service.port}/health`)).json() as any;
      expect(readiness.status).toBe('ok');
      expect(readiness.metrics).toBeUndefined();

      const response = await fetch(`http://${service.host}:${service.port}/health/metrics`);
      expect(response.status).toBe(200);
      const metrics = await response.json() as any;
      expect(metrics).toMatchObject({
        overallHealth: 'healthy',
        memory: { healthy: true },
        execution: { healthy: true },
        maintenance: { enabled: true, running: false, runCount: 0, retentionCandidates: 0, overdue: false },
      });
      expect(metrics.maintenance.nextRunAt).toEqual(expect.any(Number));
      const serialized = JSON.stringify(metrics);
      expect(serialized).not.toContain('secrets/github');
      expect(serialized).not.toContain('gh-token');
      expect(serialized).not.toContain('packages-token');
    } finally {
      await service.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects non-loopback detailed metrics before invoking the provider', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-health-remote-'));
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    let providerCalls = 0;
    const security = new HttpSecurityPolicy({
      publicBaseUrl: null,
      trustProxy: false,
      allowedOrigins: [],
    });
    security.isLoopbackRequest = () => false;
    const auditLogger = new FileAuditLogger(path.join(root, 'logs'));
    const server = createServer(createHttpHandler({
      keyStore,
      auditLogger,
      security,
      healthMetricsProvider: async () => {
        providerCalls += 1;
        return { overallHealth: 'healthy' };
      },
      mcpHandler: async () => { throw new Error('MCP hook must not run'); },
    }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const response = await fetch(`${baseUrl}/health/metrics`);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'metrics_local_only' });
      expect(providerCalls).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await auditLogger.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('registers a read-only agent_core_health_metrics MCP surface backed by the same provider', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-health-mcp-'));
    const defaults = loadConfig({}, root);
    const runtime = createRuntimeServices(
      [root], path.join(root, 'capabilities'), undefined,
      { ...defaults.memory, enabled: false },
      { ...defaults.execution, enabled: true },
      { ...defaults.github, enabled: false },
    );
    await runtime.execution.open();
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const principal = await keyStore.create('health-metrics-principal');
    const auditLogger = new FileAuditLogger(path.join(root, 'logs'));
    const server = createServer(createHttpHandler({
      keyStore,
      auditLogger,
      mcpHandler: createMcpHttpHandler(runtime),
    }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const listed = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${principal.key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }).then((r) => r.json()) as any;
      const tool = listed.result.tools.find((entry: any) => entry.name === 'agent_core_health_metrics');
      expect(tool).toBeTruthy();
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(tool.outputSchema.properties.operatorDirectives).toBeTruthy();
      expect(tool.outputSchema.properties.audit).toBeTruthy();
      expect(tool.outputSchema.properties.observability).toBeTruthy();

      const called = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${principal.key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'agent_core_health_metrics', arguments: {} } }),
      }).then((r) => r.json()) as any;
      const body = JSON.parse(called.result.content[0].text);
      expect(body).toMatchObject({ execution: { healthy: true }, github: { enabled: false } });
      expect(body.operatorDirectives).toMatchObject({ enabled: true, healthy: true, schemaVersion: 1, integrity: 'ok' });
      expect(JSON.stringify(body.operatorDirectives)).not.toContain('verbatimText');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await runtime.execution.close().catch(() => undefined);
      await runtime.memory.close().catch(() => undefined);
      await runtime.operatorDirectives.close().catch(() => undefined);
      await auditLogger.close();
      await rm(root, { recursive: true, force: true });
    }
  });

});
