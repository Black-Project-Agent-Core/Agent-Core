import { access, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { writeRegistryGeneration } from '../src/capabilities/registry-writer.js';
import type { CapabilityRecord } from '../src/capabilities/types.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { AgentCoreRouteError, RouteContextStore } from '../src/runtime/route-context-store.js';
import { createRuntimeServices } from '../src/runtime/services.js';
import { memoryConfig, memoryRoot } from './helpers/memory-fixture.js';

const auditLoggers: FileAuditLogger[] = [];
function createAuditLogger(logDir: string): FileAuditLogger {
  const logger = new FileAuditLogger(logDir);
  auditLoggers.push(logger);
  return logger;
}

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: Array<ReturnType<typeof createRuntimeServices>> = [];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function routePlan(): RoutePlan {
  return {
    tier: 'atomic', mode: 'atomic_direct', domain: 'general', confidence: 1, risk: 'low',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['write_file'],
    verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['fixture'],
  };
}

function capabilityRecord(
  id: string,
  name: string,
  overrides: Partial<CapabilityRecord> = {},
): CapabilityRecord {
  return {
    id,
    name,
    displayName: name,
    aliases: [],
    type: 'skill',
    category: 'general',
    categoryTitle: 'General',
    declaredPurpose: `Support ${name} workflows`,
    functionalSummary: `Provide guidance for ${name}`,
    source: { url: `https://example.test/${id}`, repo: 'example/test', path: null, sha: 'fixture-sha' },
    compatibility: ['chatgpt'],
    language: ['en'],
    triggers: [],
    invocation: 'auto_candidate',
    inputsContext: [],
    outputsArtifacts: [],
    requiredTools: [],
    dependencies: [],
    sideEffects: [],
    risk: 'low',
    license: { status: 'verified', id: 'MIT' },
    state: 'cataloged',
    nativeEligible: false,
    normalizedPath: null,
    equivalenceGroup: null,
    catalogSha: 'fixture-sha',
    catalogFile: 'fixture.md',
    catalogRow: 1,
    ...overrides,
  };
}

async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 51, method: 'tools/call', params: { name, arguments: args } }),
  });
  return await response.json() as Record<string, any>;
}

function textBody(result: Record<string, any>) {
  return JSON.parse(result.result.content[0].text) as Record<string, any>;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(auditLoggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('memory-aware route context', () => {
  it('reserves route identity before routing and enforces only an explicitly enabled hard-memory snapshot', () => {
    const now = Date.parse('2026-08-25T01:00:00.000Z');
    const store = new RouteContextStore({ now: () => now, ttlMs: 60_000 });
    const reservation = store.reserve();
    expect(reservation.routeContextId).toMatch(UUID_RE);
    expect(reservation.createdAt).toBe('2026-08-25T01:00:00.000Z');
    expect(reservation.expiresAt).toBe('2026-08-25T01:01:00.000Z');

    const observed = store.create('principal-a', routePlan(), {
      reservation,
      memorySnapshot: {
        memoryContextId: 'memory-context-observe',
        memorySnapshotHash: 'a'.repeat(64),
        blockingGuardrailMemoryIds: ['guardrail-a'],
        enforceHardGuardrails: false,
      },
    });
    expect(observed.routeContextId).toBe(reservation.routeContextId);
    expect(observed.memorySnapshot?.memoryContextId).toBe('memory-context-observe');
    expect(store.validate(observed.routeContextId, 'principal-a', 'write_file').routeContextId)
      .toBe(observed.routeContextId);

    const blockedReservation = store.reserve();
    const blocked = store.create('principal-a', routePlan(), {
      reservation: blockedReservation,
      memorySnapshot: {
        memoryContextId: 'memory-context-enforced',
        memorySnapshotHash: 'b'.repeat(64),
        blockingGuardrailMemoryIds: ['guardrail-b'],
        enforceHardGuardrails: true,
      },
    });
    expect(() => store.validate(blocked.routeContextId, 'principal-a', 'write_file'))
      .toThrow(expect.objectContaining<Partial<AgentCoreRouteError>>({ code: 'ROUTE_MEMORY_GUARDRAIL_BLOCKED' }));
  });

  it('injects recalled decisions into real capability ranking instead of leaving memory as sideband metadata', async () => {
    const root = await memoryRoot('memory-routing-rank');
    roots.push(root);
    const capabilityDir = path.join(root, 'capabilities');
    await writeRegistryGeneration(capabilityDir, [
      capabilityRecord('generic-review', 'generic-review', {
        category: 'general',
        declaredPurpose: 'Review a general component',
        functionalSummary: 'General review guidance',
        triggers: ['review'],
        state: 'native_ready',
        nativeEligible: true,
        normalizedPath: 'normalized/skills/generic-review/SKILL.md',
      }),
      capabilityRecord('frontend-quality', 'frontend-quality', {
        category: 'frontend',
        declaredPurpose: 'Improve frontend dashboard visual hierarchy and spacing',
        functionalSummary: 'Frontend dashboard layout visual hierarchy spacing',
        triggers: ['frontend', 'dashboard', 'visual', 'hierarchy', 'spacing'],
        state: 'native_ready',
        nativeEligible: true,
        normalizedPath: 'normalized/skills/frontend-quality/SKILL.md',
      }),
    ], { catalogSha: 'fixture-sha', generatedAt: '2026-08-27T00:00:00.000Z' });
    const runtime = createRuntimeServices([root], capabilityDir, undefined, {
      ...await memoryConfig(root),
      enabled: true,
    });
    runtimes.push(runtime);
    const task = 'Review component';
    expect(runtime.router.route(task).recommendedCapabilities[0]?.id).toBe('generic-review');

    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const principal = await keyStore.create('memory-ranking-principal');
    const scope = { principalId: principal.metadata.id, projectId: root };
    const decision = await runtime.memory.commit({
      scope,
      canonicalKey: 'decision.component.frontend.layout',
      kind: 'decision',
      value: 'For this review component, use frontend dashboard visual hierarchy spacing and frontend layout quality.',
      importance: 1,
      pinned: true,
      sourceType: 'test',
    });
    const app = createHttpHandler({
      keyStore,
      auditLogger: createAuditLogger(path.join(root, 'logs')),
      mcpHandler: createMcpHttpHandler(runtime),
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const routed = await call(baseUrl, principal.key, 'capability_route', { task, projectRoot: root });
    const route = textBody(routed);
    expect(route.memoryInjection).toMatchObject({ applied: true, memoryIds: [decision.memoryId] });
    expect(route.reasonCodes).toContain('autonomous_memory_context');
    expect(route.recommendedCapabilities[0]?.id).toBe('frontend-quality');
    expect(route.domain).toBe('frontend');
  });

  it('surfaces canonical project memory through capability_route before ordinary operational recall', async () => {
    const root = await memoryRoot('memory-route-canonical');
    roots.push(root);
    const baseMemory = await memoryConfig(root);
    const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
      ...baseMemory,
      enabled: true,
      recallItemBudget: 6,
      recallCharacterBudget: 2_400,
    });
    runtimes.push(runtime);
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const principal = await keyStore.create('canonical-route-principal');
    const scope = { principalId: principal.metadata.id, projectId: root };
    const canonical = [];
    for (const [canonicalKey, facet, value] of [
      ['project.super-runtime.identity', 'identity', 'Super-Runtime is the product and not a Kimi K3 port or thin llama.cpp launcher.'],
      ['project.super-runtime.raison-detre', 'raison_d_etre', 'Super-Runtime exists to generalize K3-in-C low-memory and out-of-core mechanisms onto the multi-model llama.cpp/GGML substrate.'],
      ['project.super-runtime.primary-reference', 'primary_reference', 'Primary reference is kimi-k3-in-c revision 117e9d29bde14db9742f54fb66a191fd0bf03903.'],
      ['project.super-runtime.production-substrate', 'production_substrate', 'Production substrate is llama.cpp/GGML revision daef7b6874397a5a7c3d7e38b55e2ee0adf7da38.'],
    ] as const) {
      canonical.push(await runtime.memory.commit({
        scope,
        canonicalKey,
        kind: 'project_state',
        value,
        importance: 1,
        pinned: true,
        sourceType: 'test',
        explicitAnchors: [
          { type: 'subject_alias', value: 'Super-Runtime' },
          { type: 'subject_facet', value: facet },
        ],
      }));
    }
    for (let index = 0; index < 12; index += 1) {
      await runtime.memory.commit({
        scope,
        canonicalKey: `operational.super-runtime.route-noise.${index}`,
        kind: 'decision',
        value: `Super-Runtime recent hardening test ${index} build verification lifecycle output ${'x'.repeat(200)}.`,
        importance: 1,
        pinned: index < 6,
        sourceType: 'test',
      });
    }

    const app = createHttpHandler({
      keyStore,
      auditLogger: createAuditLogger(path.join(root, 'logs')),
      mcpHandler: createMcpHttpHandler(runtime),
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const routed = await call(baseUrl, principal.key, 'capability_route', {
      task: 'Apa tujuan Super-Runtime?',
      projectRoot: root,
    });
    const route = textBody(routed);
    expect(route.canonicalSubjectMemory.map((hit: any) => hit.canonicalKey)).toEqual(expect.arrayContaining([
      'project.super-runtime.identity',
      'project.super-runtime.raison-detre',
      'project.super-runtime.primary-reference',
      'project.super-runtime.production-substrate',
    ]));
    expect(route.memoryInjection.canonicalMemoryIds).toEqual(expect.arrayContaining(canonical.map((item) => item.memoryId)));
    expect(route.memoryDirective.hasCanonicalSubjectMemory).toBe(true);
    expect(route.reasonCodes).toContain('canonical_project_memory_context');
  });

  it('routes with memory evidence before execution and blocks a matching hard guardrail when enforcement is enabled', async () => {
    const root = await memoryRoot('memory-route');
    roots.push(root);
    const baseMemory = await memoryConfig(root);
    const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
      ...baseMemory,
      enabled: true,
      enforceHardGuardrails: true,
    } as any);
    runtimes.push(runtime);
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const principal = await keyStore.create('memory-routing-principal');
    const scope = { principalId: principal.metadata.id, projectId: root };
    const guardrail = await runtime.memory.commit({
      scope,
      canonicalKey: 'guardrail.proof.file',
      kind: 'guardrail',
      value: `Do not create proof files inside ${root}.`,
      enforcement: 'hard',
      importance: 1,
      pinned: true,
      sourceType: 'test',
    });
    const priorFailure = await runtime.memory.commit({
      scope,
      canonicalKey: 'failure.proof.file',
      kind: 'failure',
      value: `Creating a proof file inside ${root} failed previously.`,
      importance: 0.9,
      sourceType: 'test',
    });

    const app = createHttpHandler({
      keyStore,
      auditLogger: createAuditLogger(path.join(root, 'logs')),
      mcpHandler: createMcpHttpHandler(runtime),
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const routed = await call(baseUrl, principal.key, 'capability_route', {
      task: `Create a proof file inside ${root}`,
      context: 'Use write_file and verify it afterwards.',
    });
    expect(routed.result.isError).not.toBe(true);
    const route = textBody(routed);
    expect(route.routeContextId).toMatch(UUID_RE);
    expect(route.memoryStatus).toBe('healthy');
    expect(route.memoryContextId).toMatch(UUID_RE);
    expect(route.memorySnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(route.memorySummary.map((item: any) => item.memoryId)).toContain(guardrail.memoryId);
    expect(route.blockingGuardrails.map((item: any) => item.memoryId)).toContain(guardrail.memoryId);
    expect(route.priorFailures.map((item: any) => item.memoryId)).toContain(priorFailure.memoryId);
    expect(route.memoryConfidence).toBeGreaterThan(0);
    expect(route.memoryInjection).toMatchObject({
      applied: true,
      memoryIds: expect.arrayContaining([priorFailure.memoryId]),
      characterCount: expect.any(Number),
      omittedCount: expect.any(Number),
    });
    expect(route.memoryInjection.memoryIds).not.toContain(guardrail.memoryId);
    expect(route.reasonCodes).toContain('autonomous_memory_context');

    const storedRoute = runtime.routes.get(route.routeContextId)!;
    expect(storedRoute.memorySnapshot).toMatchObject({
      memoryContextId: route.memoryContextId,
      memorySnapshotHash: route.memorySnapshotHash,
      blockingGuardrailMemoryIds: [guardrail.memoryId],
      enforceHardGuardrails: true,
    });
    const persistedMemoryContext = await runtime.memory.getContext(scope, route.memoryContextId);
    expect(persistedMemoryContext?.routeContextId).toBe(route.routeContextId);
    expect(persistedMemoryContext?.expiresAt).toBe(Date.parse(storedRoute.expiresAt));

    const target = path.join(root, 'proof.txt');
    const write = await call(baseUrl, principal.key, 'write_file', {
      path: target,
      content: 'must not be written',
      routeContextId: route.routeContextId,
    });
    expect(write.result.isError).toBe(true);
    expect(textBody(write).error.code).toBe('ROUTE_MEMORY_GUARDRAIL_BLOCKED');
    await expect(access(target)).rejects.toThrow();

    await runtime.execution.close();
    await runtime.memory.close();
  });

  it('invalidates persisted memory context at the same TTL as its reserved route', async () => {
    const root = await memoryRoot('memory-route-ttl');
    roots.push(root);
    const baseMemory = await memoryConfig(root);
    const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
      ...baseMemory,
      enabled: true,
    });
    runtimes.push(runtime);
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const routeStore = new RouteContextStore({ ttlMs: 500, now: () => now });
    const reservation = routeStore.reserve();
    const scope = { principalId: 'principal-ttl', projectId: root };
    const preflight = await runtime.memory.preflight({
      scope,
      routeContextId: reservation.routeContextId,
      task: 'TTL fixture task',
      expiresAt: Date.parse(reservation.expiresAt),
    });
    routeStore.create(scope.principalId, routePlan(), {
      reservation,
      memorySnapshot: {
        memoryContextId: preflight.contextId,
        memorySnapshotHash: preflight.snapshotHash,
        blockingGuardrailMemoryIds: [],
        enforceHardGuardrails: false,
      },
    });
    expect(routeStore.get(reservation.routeContextId)).not.toBeNull();
    expect(await runtime.memory.getContext(scope, preflight.contextId)).not.toBeNull();
    now += 550;
    expect(routeStore.get(reservation.routeContextId)).toBeNull();
    expect(await runtime.memory.getContext(scope, preflight.contextId)).toBeNull();
    clock.mockRestore();
  });

  it('keeps capability routing unchanged when DMF is enabled but has no relevant memory', async () => {
    const root = await memoryRoot('memory-route-empty');
    roots.push(root);
    const baseMemory = await memoryConfig(root);
    const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
      ...baseMemory,
      enabled: true,
    });
    runtimes.push(runtime);
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const principal = await keyStore.create('empty-memory-principal');
    const app = createHttpHandler({
      keyStore,
      auditLogger: createAuditLogger(path.join(root, 'logs')),
      mcpHandler: createMcpHttpHandler(runtime),
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const routed = await call(baseUrl, principal.key, 'capability_route', { task: 'Create a small proof file' });
    const route = textBody(routed);
    expect(route).toMatchObject({ tier: 'atomic', mode: 'atomic_direct', memoryStatus: 'healthy' });
    expect(route.memoryContextId).toMatch(UUID_RE);
    expect(route.memorySummary).toEqual([]);
    expect(route.blockingGuardrails).toEqual([]);
    expect(route.memoryConfidence).toBe(0);
    expect(route.memoryInjection).toEqual({ applied: false, memoryIds: [], characterCount: 0, omittedCount: 0 });
    expect(route.reasonCodes).not.toContain('autonomous_memory_context');
  });

  it('keeps disabled memory routing behavior unchanged and reports the disabled state explicitly', async () => {
    const root = await memoryRoot('memory-route-disabled');
    roots.push(root);
    const baseMemory = await memoryConfig(root);
    const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
      ...baseMemory,
      enabled: false,
    });
    runtimes.push(runtime);
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const principal = await keyStore.create('disabled-memory-principal');
    const app = createHttpHandler({
      keyStore,
      auditLogger: createAuditLogger(path.join(root, 'logs')),
      mcpHandler: createMcpHttpHandler(runtime),
    });
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const routed = await call(baseUrl, principal.key, 'capability_route', { task: 'Create a small proof file' });
    const route = textBody(routed);
    expect(route).toMatchObject({ tier: 'atomic', mode: 'atomic_direct', memoryStatus: 'disabled' });
    expect(route.memoryContextId).toBeNull();
    expect(route.memoryContextLease).toBeNull();
    expect(route.memoryContextLeaseExpiresAt).toBeNull();
    expect(route.memorySummary).toEqual([]);
    expect(route.blockingGuardrails).toEqual([]);
    expect(route.openConflicts).toEqual([]);
    expect(route.priorFailures).toEqual([]);
    expect(route.relatedDecisions).toEqual([]);
    expect(route.memoryConfidence).toBe(0);
    expect(route.memoryInjection).toEqual({ applied: false, memoryIds: [], characterCount: 0, omittedCount: 0 });
    expect(route.reasonCodes).not.toContain('autonomous_memory_context');
  });
});
