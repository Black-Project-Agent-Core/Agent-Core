import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryService } from '../src/memory/service.js';
import type { MemoryScope } from '../src/memory/types.js';
import { FakeSecondMemoryTransport, memoryConfig, memoryRoot, secondMemoryEnv } from './helpers/memory-fixture.js';

const roots: string[] = [];
const services: MemoryService[] = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const scope: MemoryScope = {
  principalId: 'boundary-principal',
  projectId: 'boundary-project',
  threadId: 'boundary-thread',
  resourceId: 'boundary-resource',
};

async function fixture(label: string, second: boolean) {
  const root = await memoryRoot(`durability-${label}`);
  roots.push(root);
  const config = await memoryConfig(root, second ? await secondMemoryEnv(root) : {});
  const transport = new FakeSecondMemoryTransport();
  const service = new MemoryService(config, undefined, second ? { fileSecondTransport: transport } : {});
  services.push(service);
  return { root, config, transport, service };
}

describe('production memory durability boundary', () => {
  it('returns NOT_REQUIRED without fabricating remote state when second memory is disabled', async () => {
    const f = await fixture('disabled', false);
    await f.service.commit({
      scope, canonicalKey: 'boundary.disabled.local', kind: 'decision',
      value: 'Local-only durable decision.', sourceType: 'test',
    });
    expect(await f.service.syncDurableBoundary(scope, 'continuity_terminal'))
      .toEqual({ required: false, state: 'NOT_REQUIRED', reason: 'continuity_terminal' });
    expect(f.transport.appendCalls).toBe(0);
  });

  it('certifies a verified remote generation and records the local durable closure receipt', async () => {
    const f = await fixture('receipt', true);
    const routeContextId = 'route-boundary-receipt';
    const preflight = await f.service.preflight({
      scope, routeContextId, task: 'Close the lifecycle behind a verified durability boundary', expiresAt: Date.now() + 60_000,
    });
    await f.service.markLifecycleMeaningfulWork({
      scope, contextId: preflight.contextId, routeContextId, toolName: 'write_file', reasonCode: 'explicit_mutation_tool',
    });
    await f.service.prepareLifecycleClosure({ scope, contextId: preflight.contextId, routeContextId });

    const synced = await f.service.syncDurableBoundary(scope, 'continuity_terminal');
    expect(synced).toMatchObject({ required: true, state: 'REMOTE_SYNCED', reason: 'continuity_terminal' });
    if (!synced.required) throw new Error('fixture requires second memory');
    expect(synced.logicalStateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(f.transport.syncStates.at(-1)?.logicalRootHash).toBe(synced.logicalStateHash);

    await f.service.markLifecycleDurableClosure({
      scope, contextId: preflight.contextId, generationId: synced.generationId!, logicalStateHash: synced.logicalStateHash!,
    });
    expect(await f.service.getLifecycleContext(scope, preflight.contextId)).toMatchObject({
      postflightState: 'CLOSED',
      localDurableGeneration: synced.generationId,
      localDurableHash: synced.logicalStateHash,
    });
  });

  it('refuses to certify durability before local postflight closure', async () => {
    const f = await fixture('unclosed', true);
    const routeContextId = 'route-boundary-unclosed';
    const preflight = await f.service.preflight({
      scope, routeContextId, task: 'Attempt durability before closing postflight', expiresAt: Date.now() + 60_000,
    });
    await expect(f.service.markLifecycleDurableClosure({
      scope, contextId: preflight.contextId, generationId: 'g'.repeat(32), logicalStateHash: 'a'.repeat(64),
    })).rejects.toMatchObject({ code: 'MEMORY_POSTFLIGHT_REQUIRED' });
  });

  it('restores the whole vault, including the durable closure receipt, into a fresh runtime', async () => {
    const f = await fixture('recovery', true);
    const routeContextId = 'route-boundary-recovery';
    const preflight = await f.service.preflight({
      scope, routeContextId, task: 'Survive a total loss of local memory', expiresAt: Date.now() + 60_000,
    });
    const committed = await f.service.commit({
      scope, canonicalKey: 'boundary.recovery.subject', kind: 'decision',
      value: 'Second memory restores the vault, not a database.', sourceType: 'test',
    });
    const turn = await f.service.beginContinuityTurn(scope, routeContextId, 'Durable continuity work', undefined, {}, Date.now() + 60_000);
    await f.service.prepareLifecycleClosure({ scope, contextId: preflight.contextId, routeContextId });
    const synced = await f.service.syncDurableBoundary(scope, 'continuity_terminal');
    if (!synced.required) throw new Error('fixture requires second memory');
    await f.service.markLifecycleDurableClosure({
      scope, contextId: preflight.contextId, generationId: synced.generationId!, logicalStateHash: synced.logicalStateHash!,
    });
    await f.service.close();
    services.splice(services.indexOf(f.service), 1);

    const freshRoot = await memoryRoot('durability-recovery-b');
    roots.push(freshRoot);
    const freshConfig = await memoryConfig(freshRoot, await secondMemoryEnv(freshRoot));
    const restored = new MemoryService(freshConfig, undefined, { fileSecondTransport: f.transport });
    services.push(restored);
    await expect(restored.hydrateRemote(scope)).resolves.toMatchObject({ state: 'SECOND_MEMORY_HYDRATED' });

    expect((await restored.getMemory(scope, committed.memoryId))?.valueText).toContain('not a database');
    expect(await restored.getContinuityTask(scope, turn.taskId)).toMatchObject({ taskId: turn.taskId });
    expect(await restored.getLifecycleContext(scope, preflight.contextId)).toMatchObject({
      postflightState: 'CLOSED',
      localDurableGeneration: synced.generationId,
      localDurableHash: synced.logicalStateHash,
    });
    // A full-vault restore already carries every receipt, so nothing is left to reconcile.
    expect(await restored.reconcileLifecycleDurability(scope)).toEqual({ reconciled: 0 });
    expect(await restored.findLifecycleReconciliationRequired({ scope })).toEqual([]);
  });
});
