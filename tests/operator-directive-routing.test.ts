import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';
import { RouteContextStore } from '../src/runtime/route-context-store.js';

const VERBATIM = 'instruksi verbatim : aku ingin kamu membantuku dengan men-install setiap kebutuhan alat bantu dalam pembangunan tanpa ragu untuk menunggu persetujuan, aku percaya dan mengizinkan sepenuhnya agar kamu bisa bantu aku install setiap alat kebutuhannya tanpa menunggu pertujuan lagi dan tidak perlu menundanya.';
const roots: string[] = [];
const servers: Server[] = [];
const loggers: FileAuditLogger[] = [];
const runtimes: RuntimeServices[] = [];

function plan(allowedTools = ['read_file']): RoutePlan {
  return {
    tier: 'atomic',
    mode: 'atomic_direct',
    domain: 'general',
    confidence: 1,
    risk: 'low',
    recommendedCapabilities: [],
    requiredSkillLoads: [],
    allowedTools,
    verification: { required: false, suggestedTools: [] },
    reasonCodes: ['fixture'],
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.operatorDirectives.close().catch(() => undefined);
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(loggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('operator directive route snapshots', () => {
  it('persists an immutable directive snapshot alongside the route', () => {
    const store = new RouteContextStore();
    const snapshot = {
      snapshotHash: 'a'.repeat(64),
      directiveKeys: ['dev_tool_install_consent'],
    };
    const route = store.create('principal-a', plan(), { operatorDirectiveSnapshot: snapshot });
    snapshot.directiveKeys.push('mutated-after-create');
    expect(route.operatorDirectiveSnapshot).toEqual({
      snapshotHash: 'a'.repeat(64),
      directiveKeys: ['dev_tool_install_consent'],
    });
    expect(store.get(route.routeContextId)?.operatorDirectiveSnapshot)
      .toEqual(route.operatorDirectiveSnapshot);
  });

  it('invalidates only matching principal routes that captured the directive key', () => {
    const store = new RouteContextStore();
    const matching = store.create('api-key-a', plan(), {
      operatorDirectiveSnapshot: {
        authorityPrincipalId: 'persistent-principal',
        snapshotHash: 'a'.repeat(64),
        directiveKeys: ['dev_tool_install_consent'],
      },
    });
    const unrelatedKey = store.create('api-key-a', plan(), {
      operatorDirectiveSnapshot: {
        authorityPrincipalId: 'persistent-principal',
        snapshotHash: 'b'.repeat(64),
        directiveKeys: ['future_other_key'],
      },
    });
    const otherPrincipal = store.create('api-key-b', plan(), {
      operatorDirectiveSnapshot: {
        authorityPrincipalId: 'other-persistent-principal',
        snapshotHash: 'c'.repeat(64),
        directiveKeys: ['dev_tool_install_consent'],
      },
    });
    const noSnapshot = store.create('api-key-a', plan());

    expect(store.invalidateByDirective('persistent-principal', 'dev_tool_install_consent')).toBe(1);
    expect(store.get(matching.routeContextId)).toBeNull();
    expect(store.get(unrelatedKey.routeContextId)).not.toBeNull();
    expect(store.get(otherPrincipal.routeContextId)).not.toBeNull();
    expect(store.get(noSnapshot.routeContextId)).not.toBeNull();
  });
});

async function setupMcp() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-route-mcp-'));
  roots.push(root);
  const defaults = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'advisory' }, root);
  const runtime = createRuntimeServices(
    [root],
    path.join(root, 'capabilities'),
    undefined,
    { ...defaults.memory, enabled: false },
    { ...defaults.execution, enabled: false },
    { ...defaults.github, enabled: false },
    undefined,
    defaults.observability,
    'test-version',
    defaults.maintenance,
    { ...defaults.langflow, enabled: false },
    defaults.operatorDirectives,
  );
  runtimes.push(runtime);
  const keyStore = new FileKeyStore(path.join(root, 'data'));
  const created = await keyStore.create('operator-route-client');
  const logger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(logger);
  const server = createServer(createHttpHandler({
    keyStore,
    auditLogger: logger,
    mcpHandler: createMcpHttpHandler(runtime),
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { root, runtime, created, baseUrl };
}

async function call(baseUrl: string, key: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const json = await response.json() as any;
  return JSON.parse(json.result.content[0].text) as Record<string, any>;
}

describe('capability_route operator directive injection', () => {
  it('injects active standing consent independently of semantic task matching without changing router input or allowedTools', async () => {
    const { root, runtime, created, baseUrl } = await setupMcp();
    await runtime.operatorDirectives.set({
      principalId: created.metadata.id,
      directiveKey: 'dev_tool_install_consent',
      verbatimText: VERBATIM,
      explicitGrant: true,
      actorKeyId: created.metadata.id,
      authenticationMode: 'bearer-api-key',
    });

    let capturedTask = '';
    let capturedContext = '';
    runtime.router.route = ((task: string, context?: string) => {
      capturedTask = task;
      capturedContext = context ?? '';
      return plan(['read_file']);
    }) as typeof runtime.router.route;

    const routed = await call(baseUrl, created.key, 'capability_route', {
      task: 'Review TypeScript types for this local project.',
      context: `Workspace is ${root}. No installation request appears in this task.`,
      projectRoot: root,
    });

    expect(capturedTask).toBe('Review TypeScript types for this local project.');
    expect(capturedContext).not.toContain(VERBATIM);
    expect(capturedContext).not.toContain('standing consent');
    expect(routed.allowedTools).toEqual(['read_file']);
    expect(routed.operatorDirectiveStatus).toBe('healthy');
    expect(routed.operatorDirectiveSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(routed.operatorDirectives).toHaveLength(1);
    expect(routed.operatorDirectives[0]).toMatchObject({
      directiveKey: 'dev_tool_install_consent',
      effect: 'allow_benign_development_dependency_install_without_chat_reconfirmation',
      trust: 'authenticated_user_explicit',
      active: true,
    });
    expect(routed.operatorPromptContext).toContain('without asking for another chat-level confirmation');
    expect(runtime.routes.get(routed.routeContextId)?.operatorDirectiveSnapshot).toEqual({
      authorityPrincipalId: created.metadata.id,
      snapshotHash: routed.operatorDirectiveSnapshotHash,
      directiveKeys: ['dev_tool_install_consent'],
    });
  });

  it('continues routing with no trusted consent when the directive service is degraded', async () => {
    const { root, runtime, created, baseUrl } = await setupMcp();
    runtime.router.route = (() => plan(['read_file'])) as typeof runtime.router.route;
    runtime.operatorDirectives.snapshot = async () => ({
      status: 'degraded', snapshotHash: null, directives: [], promptContext: '',
    });

    const routed = await call(baseUrl, created.key, 'capability_route', {
      task: 'Read a local file.',
      projectRoot: root,
    });
    expect(routed.allowedTools).toEqual(['read_file']);
    expect(routed.operatorDirectiveStatus).toBe('degraded');
    expect(routed.operatorDirectiveSnapshotHash).toBeNull();
    expect(routed.operatorDirectives).toEqual([]);
    expect(routed.operatorPromptContext).toBe('');
  });
});
