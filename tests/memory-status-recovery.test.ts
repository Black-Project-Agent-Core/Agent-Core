import { mkdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';
import { isolatedMemoryDependencies, memoryRoot, strictMemoryConfig } from './helpers/memory-fixture.js';

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const loggers: FileAuditLogger[] = [];

async function fixture(logicalPrincipal?: string) {
  const root = await memoryRoot('status-recovery');
  roots.push(root);
  const projects = ['project-a', 'project-b', 'project-c'].map((name) => path.join(root, name));
  await Promise.all(projects.map((project) => mkdir(project)));
  const config = await strictMemoryConfig(root, { AGENT_CORE_MEMORY_PRINCIPAL_ID: logicalPrincipal });
  const dependencies = isolatedMemoryDependencies(config);
  const runtime = createRuntimeServices(projects, path.join(root, 'capabilities'), undefined, config,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, dependencies);
  runtimes.push(runtime);
  const keyStore = new FileKeyStore(path.join(root, 'keys'));
  const principalA = await keyStore.create('recovery-a');
  const principalB = await keyStore.create('recovery-b');
  const auditLogger = new FileAuditLogger(path.join(root, 'logs'));
  loggers.push(auditLogger);
  const server = createServer(createHttpHandler({ keyStore, auditLogger, mcpHandler: createMcpHttpHandler(runtime) }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { root, projectA: projects[0]!, projectB: projects[1]!, runtime, dependencies, principalA, principalB,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function call(f: Awaited<ReturnType<typeof fixture>>, key: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${f.baseUrl}/mcp`, { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const raw = await response.json() as Record<string, any>;
  return { raw, result: JSON.parse(raw.result.content[0].text) as Record<string, any> };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const runtime of runtimes.splice(0)) {
    await runtime.execution.close();
    await runtime.memory.close();
  }
  await Promise.all(loggers.splice(0).map((logger) => logger.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('memory status recovery without a route', () => {
  it('keeps scoped status and sync reachable across multiple workspaces while unhealthy preflight cannot create a route', async () => {
    const f = await fixture();
    const transport = f.dependencies.supabaseDirectTransport;
    transport.offline = true;
    const ownMemoryIds: string[] = [];
    for (const [principalId, projectId, canonicalKey] of [
      [f.principalA.metadata.id, f.projectA, 'decision:own-first'],
      [f.principalA.metadata.id, f.projectA, 'decision:own-second'],
      [f.principalA.metadata.id, f.projectB, 'decision:other-project'],
      [f.principalB.metadata.id, f.projectA, 'decision:other-principal'],
    ] as const) {
      const saved = await f.runtime.memory.commit({ scope: { principalId, projectId }, canonicalKey, kind: 'decision', value: 'Previously completed work awaiting projection.' });
      expect(saved.supabaseSync?.state).toBe('pending');
      if (principalId === f.principalA.metadata.id && projectId === f.projectA) ownMemoryIds.push(saved.memoryId);
    }
    const routed = await call(f, f.principalA.key, 'capability_route', { task: 'Inspect pending work', projectRoot: f.projectA });
    expect(routed.raw.result.isError).toBe(true);
    expect(routed.result.error).toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    expect(routed.result.routeContextId).toBeUndefined();
    const ambiguous = await call(f, f.principalA.key, 'memory_status', { sync: true });
    expect(ambiguous.result.error.code).toBe('WORKSPACE_PROJECT_AMBIGUOUS');

    const pending = await call(f, f.principalA.key, 'memory_status', { projectRoot: f.projectA, sync: true });
    expect(pending.raw.result.isError).not.toBe(true);
    expect(pending.result).toMatchObject({ healthy: false, counts: { active_items: 2 },
      supabaseSync: { state: 'pending', pendingItems: 2, errorCode: 'MEMORY_SUPABASE_NETWORK_ERROR' } });
    const other = await call(f, f.principalB.key, 'memory_status', { projectRoot: f.projectA, sync: true });
    expect(other.result).toMatchObject({ counts: { active_items: 1 }, supabaseSync: { state: 'pending', pendingItems: 1 } });
    expect(transport.documents.size).toBe(0);

    transport.offline = false;
    const recovered = await call(f, f.principalA.key, 'memory_status', { projectRoot: f.projectA, sync: true });
    expect(recovered.result).toMatchObject({ healthy: true, counts: { active_items: 2 }, supabaseSync: { state: 'synced', pendingItems: 0 } });
    expect([...transport.documents.values()].map(({ document }) => document.entry.memoryId).sort()).toEqual(ownMemoryIds.sort());
    expect(f.runtime.routes.activeRouteContextIds(f.principalA.metadata.id, f.projectA)).toEqual([]);
  });

  it('rejects an outside project before accessing status or attempting synchronization', async () => {
    const f = await fixture();
    const status = vi.spyOn(f.runtime.memory, 'status');
    const sync = vi.spyOn(f.runtime.memory, 'syncDirectMemory');
    const denied = await call(f, f.principalA.key, 'memory_status', { projectRoot: path.join(f.root, 'outside'), sync: true });
    expect(denied.raw.result.isError).toBe(true);
    expect(denied.result.error.code).toBe('WORKSPACE_PROJECT_NOT_ALLOWED');
    expect(status).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it.each([undefined, 'shared-memory-principal'])('keeps route ownership and project agreement with configured principal %s', async (logicalPrincipal) => {
    const f = await fixture(logicalPrincipal);
    const routed = await call(f, f.principalA.key, 'capability_route', { task: 'Inspect selected project', projectRoot: f.projectA });
    expect(routed.raw.result.isError).not.toBe(true);
    const status = vi.spyOn(f.runtime.memory, 'status');
    const sync = vi.spyOn(f.runtime.memory, 'syncDirectMemory');
    const mismatch = await call(f, f.principalA.key, 'memory_status', {
      routeContextId: routed.result.routeContextId, projectRoot: f.projectB, sync: true,
    });
    expect(mismatch.result.error.code).toBe('ROUTE_PROJECT_MISMATCH');
    const wrongOwner = await call(f, f.principalB.key, 'memory_status', {
      routeContextId: routed.result.routeContextId, projectRoot: f.projectA, sync: true,
    });
    expect(wrongOwner.result.error.code).toBe('ROUTE_PRINCIPAL_MISMATCH');
    expect(status).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    const allowed = await call(f, f.principalA.key, 'memory_status', {
      routeContextId: routed.result.routeContextId, projectRoot: f.projectA, sync: true,
    });
    expect(allowed.raw.result.isError).not.toBe(true);
    expect(sync).toHaveBeenCalledWith({ principalId: logicalPrincipal ?? f.principalA.metadata.id, projectId: f.projectA });
    expect(status).toHaveBeenCalledWith({ principalId: logicalPrincipal ?? f.principalA.metadata.id, projectId: f.projectA });
  });
});
