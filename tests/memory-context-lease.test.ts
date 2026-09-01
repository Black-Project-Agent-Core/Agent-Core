import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { hashMemoryLogicalState, projectMemoryLogicalState } from '../src/memory/logical-state-hash.js';
import { MemoryService } from '../src/memory/service.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';
import { MemoryStore } from '../src/memory/store.js';

const services: MemoryService[] = [];

function fixture(label: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `agent-core-context-lease-${label}-`));
  const config = loadConfig({ AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce' }, root).memory;
  const service = new MemoryService({ ...config, enabled: true, dbPath: path.join(root, 'memory.sqlite') });
  services.push(service);
  return {
    root,
    config: service.config,
    service,
    scope: { principalId: `principal-${label}`, projectId: root },
  };
}

async function projectionHash(dbPath: string, scope: { principalId: string; projectId: string }) {
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  await store.open({ dbPath });
  try {
    return hashMemoryLogicalState(await projectMemoryLogicalState(client, scope));
  } finally {
    await store.close();
  }
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close().catch(() => undefined)));
});

describe('opaque Memory Context Lease authority', () => {
  it('issues an opaque bounded lease only for an exact persisted actionable lifecycle and caps expiry', async () => {
    const f = fixture('issue');
    const routeContextId = 'route-lease-issue';
    const preflight = await f.service.preflight({
      scope: f.scope,
      routeContextId,
      task: 'Issue a direct Codespace bridge memory lease',
      context: 'The bridge must never decode memory semantics.',
      expiresAt: Date.now() + 60 * 60_000,
    });
    const lifecycle = await f.service.getLifecycleContext(f.scope, preflight.contextId);
    expect(lifecycle).not.toBeNull();

    const beforeHash = await projectionHash(f.config.dbPath, f.scope);
    const issuedAt = Date.now();
    const lease = await f.service.issueContextLease({
      scope: f.scope,
      contextId: preflight.contextId,
      routeContextId,
      now: issuedAt,
    });

    expect(lease.token).toMatch(/^mcl1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(lease.token.length).toBeLessThan(4096);
    expect(lease.expiresAt).toBeLessThanOrEqual(lifecycle!.expiresAt);
    expect(lease.expiresAt).toBeLessThanOrEqual(issuedAt + 15 * 60_000);
    expect(lease.token).not.toContain(f.scope.principalId);
    expect(lease.token).not.toContain(f.scope.projectId);
    expect(lease.token).not.toContain(lifecycle!.objectiveHash);
    expect(lease.token).not.toContain(preflight.contextId);

    await expect(f.service.validateContextLease({
      lease: lease.token,
      workspaceRoot: f.root,
      now: issuedAt + 1,
    })).resolves.toMatchObject({
      scope: f.scope,
      contextId: preflight.contextId,
      routeContextId,
      objectiveHash: lifecycle!.objectiveHash,
      expiresAt: lease.expiresAt,
    });
    expect(await projectionHash(f.config.dbPath, f.scope)).toBe(beforeHash);
  });

  it('rejects cross-route issuance, closed lifecycle issuance, wrong workspace, tamper, truncation, and expiry predictably', async () => {
    const f = fixture('reject');
    const routeContextId = 'route-lease-reject';
    const preflight = await f.service.preflight({
      scope: f.scope,
      routeContextId,
      task: 'Reject invalid lease authority',
      expiresAt: Date.now() + 60_000,
    });

    await expect(f.service.issueContextLease({
      scope: f.scope,
      contextId: preflight.contextId,
      routeContextId: 'route-wrong',
    })).rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });

    const issued = await f.service.issueContextLease({
      scope: f.scope,
      contextId: preflight.contextId,
      routeContextId,
    });
    await expect(f.service.validateContextLease({
      lease: issued.token,
      workspaceRoot: path.join(f.root, 'other'),
    })).rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });

    const tampered = `${issued.token.slice(0, -1)}${issued.token.endsWith('A') ? 'B' : 'A'}`;
    await expect(f.service.validateContextLease({ lease: tampered, workspaceRoot: f.root }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    await expect(f.service.validateContextLease({ lease: issued.token.slice(0, 40), workspaceRoot: f.root }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    await expect(f.service.validateContextLease({ lease: issued.token, workspaceRoot: f.root, now: issued.expiresAt + 1 }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });

    await f.service.prepareLifecycleClosure({ scope: f.scope, contextId: preflight.contextId, routeContextId });
    await expect(f.service.validateContextLease({ lease: issued.token, workspaceRoot: f.root }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    await expect(f.service.issueContextLease({ scope: f.scope, contextId: preflight.contextId, routeContextId }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
  });

  it('invalidates old leases when the Agent Core service lifetime changes without changing persisted memory truth', async () => {
    const f = fixture('restart');
    const routeContextId = 'route-lease-restart';
    const preflight = await f.service.preflight({
      scope: f.scope,
      routeContextId,
      task: 'Service lifetime lease invalidation',
      expiresAt: Date.now() + 60_000,
    });
    const issued = await f.service.issueContextLease({ scope: f.scope, contextId: preflight.contextId, routeContextId });
    const beforeHash = await projectionHash(f.config.dbPath, f.scope);
    await f.service.close();
    services.splice(services.indexOf(f.service), 1);

    const restarted = new MemoryService(f.config);
    services.push(restarted);
    await expect(restarted.validateContextLease({ lease: issued.token, workspaceRoot: f.root }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    expect(await restarted.getLifecycleContext(f.scope, preflight.contextId)).toMatchObject({ postflightState: 'OPEN' });
    expect(await projectionHash(f.config.dbPath, f.scope)).toBe(beforeHash);

    const fresh = await restarted.issueContextLease({ scope: f.scope, contextId: preflight.contextId, routeContextId });
    expect(fresh.token).not.toBe(issued.token);
    await expect(restarted.validateContextLease({ lease: fresh.token, workspaceRoot: f.root })).resolves.toBeTruthy();
  });
});
