import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryService } from '../src/memory/service.js';
import { FILE_NATIVE_SELF_PROJECT_ID } from '../src/memory/file-native/paths.js';
import { strictMemoryConfig, isolatedMemoryDependencies, memoryStateHash } from './helpers/memory-fixture.js';

const services: MemoryService[] = [];

async function fixture(label: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `agent-core-context-lease-${label}-`));
  const config = await strictMemoryConfig(root, { AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE: 'enforce' });
  const service = new MemoryService(config, undefined, isolatedMemoryDependencies(config));
  services.push(service);
  return {
    root,
    config: service.config,
    service,
    scope: { principalId: `principal-${label}`, projectId: root },
  };
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close().catch(() => undefined)));
});

describe('opaque Memory Context Lease authority', () => {
  it('records completed work after lease expiry or readiness loss while still rejecting new work and forged completion', async () => {
    const f = await fixture('completion');
    const routeContextId = 'route-lease-completion';
    const preflight = await f.service.preflight({
      scope: f.scope, routeContextId, task: 'Preserve completed work during an outage', expiresAt: Date.now() + 60_000,
    });
    const issued = await f.service.issueContextLease({ scope: f.scope, contextId: preflight.contextId, routeContextId });
    await f.service.validateContextLease({ lease: issued.token, workspaceRoot: f.root });
    const validation = vi.spyOn(f.service, 'validateLifecycleContext').mockRejectedValue(new Error('readiness lost after work'));
    const completion = { lease: issued.token, workspaceRoot: f.root, toolName: 'edit_file', reasonCode: 'workspace_mutation', now: issued.expiresAt + 1 };
    await expect(f.service.completeContextLeaseMeaningfulWork(completion)).resolves.toMatchObject({
      postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1,
    });
    expect(validation).not.toHaveBeenCalled();
    await expect(f.service.validateContextLease({ lease: issued.token, workspaceRoot: f.root, now: issued.expiresAt + 1 }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    await expect(f.service.completeContextLeaseMeaningfulWork({ ...completion, workspaceRoot: path.join(f.root, 'other') }))
      .rejects.toMatchObject({ code: 'MEMORY_POSTFLIGHT_REQUIRED' });
    await expect(f.service.completeContextLeaseMeaningfulWork({ ...completion, lease: issued.token.slice(0, 40) }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    expect(await f.service.getLifecycleContext(f.scope, preflight.contextId)).toMatchObject({ meaningfulWorkCount: 1 });
    validation.mockRestore();
  });

  it('issues an opaque bounded lease only for an exact persisted actionable lifecycle and caps expiry', async () => {
    const f = await fixture('issue');
    const routeContextId = 'route-lease-issue';
    const preflight = await f.service.preflight({
      scope: f.scope,
      routeContextId,
      task: 'Issue a direct bridge memory lease',
      context: 'The bridge must never decode memory semantics.',
      expiresAt: Date.now() + 60 * 60_000,
    });
    const lifecycle = await f.service.getLifecycleContext(f.scope, preflight.contextId);
    expect(lifecycle).not.toBeNull();

    const beforeHash = await memoryStateHash(f.root);
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
      scope: { principalId: f.scope.principalId, projectId: FILE_NATIVE_SELF_PROJECT_ID },
      contextId: preflight.contextId,
      routeContextId,
      objectiveHash: lifecycle!.objectiveHash,
      expiresAt: lease.expiresAt,
    });
    expect(await memoryStateHash(f.root)).toBe(beforeHash);
  });

  it('rejects cross-route issuance, closed lifecycle issuance, wrong workspace, tamper, truncation, and expiry predictably', async () => {
    const f = await fixture('reject');
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

    await f.service.applyPostflight({ scope: f.scope, contextId: preflight.contextId, routeContextId, reasonCodes: ['TRANSIENT_OPERATION'], evidenceRefs: ['test:lease-validation'] });
    await f.service.prepareLifecycleClosure({ scope: f.scope, contextId: preflight.contextId, routeContextId });
    await expect(f.service.validateContextLease({ lease: issued.token, workspaceRoot: f.root }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    await expect(f.service.issueContextLease({ scope: f.scope, contextId: preflight.contextId, routeContextId }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
  });

  it('invalidates old leases when the Agent Core service lifetime changes without changing persisted memory truth', async () => {
    const f = await fixture('restart');
    const routeContextId = 'route-lease-restart';
    const preflight = await f.service.preflight({
      scope: f.scope,
      routeContextId,
      task: 'Service lifetime lease invalidation',
      expiresAt: Date.now() + 60_000,
    });
    const issued = await f.service.issueContextLease({ scope: f.scope, contextId: preflight.contextId, routeContextId });
    const beforeHash = await memoryStateHash(f.root);
    await f.service.close();
    services.splice(services.indexOf(f.service), 1);

    const restarted = new MemoryService(f.config, undefined, isolatedMemoryDependencies(f.config));
    services.push(restarted);
    await expect(restarted.validateContextLease({ lease: issued.token, workspaceRoot: f.root }))
      .rejects.toMatchObject({ code: 'MEMORY_PREFLIGHT_REQUIRED' });
    expect(await restarted.getLifecycleContext(f.scope, preflight.contextId)).toMatchObject({ postflightState: 'OPEN' });
    expect(await memoryStateHash(f.root)).toBe(beforeHash);

    const fresh = await restarted.issueContextLease({ scope: f.scope, contextId: preflight.contextId, routeContextId });
    expect(fresh.token).not.toBe(issued.token);
    await expect(restarted.validateContextLease({ lease: fresh.token, workspaceRoot: f.root })).resolves.toBeTruthy();
  });
});
