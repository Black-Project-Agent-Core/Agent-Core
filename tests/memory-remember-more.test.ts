import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MEMORY_REMEMBER_MORE_DEFAULTS,
  MEMORY_REMEMBER_MORE_LIMITS,
  MEMORY_REMEMBER_MORE_REASONS,
  type MemoryScope,
} from '../src/memory/types.js';
import { memoryFixture } from './helpers/memory-fixture.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });

async function fixture(label: string) {
  const f = await memoryFixture(`remember-more-${label}`);
  roots.push(f.root);
  const scope: MemoryScope = { principalId: 'principal-a', projectId: 'project-a' };
  return { ...f, scope };
}

/** A causal chain: failure <- procedure <- decision, each linked to the previous one. */
async function seedChain(f: Awaited<ReturnType<typeof fixture>>) {
  const failure = await f.service.commit({
    scope: f.scope, canonicalKey: 'failure.release.bundle', kind: 'failure',
    value: 'Release bundle verification failed on the packaging step.', sourceType: 'test',
  });
  const procedure = await f.service.commit({
    scope: f.scope, canonicalKey: 'procedure.release.repair', kind: 'procedure',
    value: 'Repair the release bundle by regenerating the manifest first.', sourceType: 'test',
    explicitRelations: [{ targetMemoryId: failure.memoryId, relation: 'resolved_by' }],
  });
  const decision = await f.service.commit({
    scope: f.scope, canonicalKey: 'decision.release.flow', kind: 'decision',
    value: 'Release flow now regenerates the manifest before packaging.', sourceType: 'test',
    explicitRelations: [{ targetMemoryId: procedure.memoryId, relation: 'derived_from' }],
  });
  const context = await f.service.preflight({
    scope: f.scope, routeContextId: 'route-remember-more', task: 'repair the release bundle flow',
    expiresAt: Date.now() + 60_000,
  });
  return { failure, procedure, decision, contextId: context.contextId };
}

describe('bounded remember_more expansion', () => {
  it('publishes the approved reasons, defaults, and hard request ceilings', () => {
    expect([...MEMORY_REMEMBER_MORE_REASONS]).toContain('causal_history');
    expect(MEMORY_REMEMBER_MORE_DEFAULTS.maxHops).toBeLessThanOrEqual(MEMORY_REMEMBER_MORE_LIMITS.maxHops);
    expect(MEMORY_REMEMBER_MORE_DEFAULTS.maxItems).toBeLessThanOrEqual(MEMORY_REMEMBER_MORE_LIMITS.maxItems);
    expect(MEMORY_REMEMBER_MORE_DEFAULTS.characterBudget).toBeLessThanOrEqual(MEMORY_REMEMBER_MORE_LIMITS.characterBudget);
  });

  it('requires a live recalled context and rejects seeds outside the project scope', async () => {
    const f = await fixture('scope');
    const chain = await seedChain(f);

    await expect(f.service.rememberMore({
      scope: f.scope, contextId: '00000000-0000-4000-8000-000000000000',
      seedMemoryIds: [chain.decision.memoryId], reason: 'causal_history',
    })).rejects.toThrow('MEMORY_REMEMBER_MORE_CONTEXT_NOT_FOUND');

    await expect(f.service.rememberMore({
      scope: { principalId: 'principal-a', projectId: 'other-project' }, contextId: chain.contextId,
      seedMemoryIds: [chain.decision.memoryId], reason: 'causal_history',
    })).rejects.toThrow('MEMORY_REMEMBER_MORE_CONTEXT_NOT_FOUND');
    await f.service.close();
  });

  it('rejects empty seeds and requests beyond the hard expansion ceilings before traversal', async () => {
    const f = await fixture('ceilings');
    const chain = await seedChain(f);
    const base = { scope: f.scope, contextId: chain.contextId, reason: 'causal_history' as const };

    await expect(f.service.rememberMore({ ...base, seedMemoryIds: [] }))
      .rejects.toThrow('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
    await expect(f.service.rememberMore({ ...base, seedMemoryIds: [chain.decision.memoryId], maxHops: MEMORY_REMEMBER_MORE_LIMITS.maxHops + 1 }))
      .rejects.toThrow('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
    await expect(f.service.rememberMore({ ...base, seedMemoryIds: [chain.decision.memoryId], maxItems: MEMORY_REMEMBER_MORE_LIMITS.maxItems + 1 }))
      .rejects.toThrow('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
    await expect(f.service.rememberMore({ ...base, seedMemoryIds: [chain.decision.memoryId], characterBudget: MEMORY_REMEMBER_MORE_LIMITS.characterBudget + 1 }))
      .rejects.toThrow('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
    await f.service.close();
  });

  it('returns bounded revision predecessors without replacing the current revision', async () => {
    const f = await fixture('revisions');
    const chain = await seedChain(f);
    await f.service.revise({
      scope: f.scope, memoryId: chain.decision.memoryId,
      value: 'Release flow regenerates the manifest and verifies it before packaging.', sourceType: 'test',
    });

    const expanded = await f.service.rememberMore({
      scope: f.scope, contextId: chain.contextId, seedMemoryIds: [chain.decision.memoryId], reason: 'causal_history',
    });
    const historical = expanded.expansions.filter((entry) => entry.historicalRevision);
    expect(historical).toHaveLength(1);
    expect(historical[0]?.valueText).toContain('before packaging');
    expect(historical[0]?.reasonCode).toBe('revision_predecessor');
    expect((await f.service.getMemory(f.scope, chain.decision.memoryId))?.valueText).toContain('verifies it');
    await f.service.close();
  });

  it('traverses recursive causal history and records an audit row for every packed expansion', async () => {
    const f = await fixture('causal');
    const chain = await seedChain(f);

    const expanded = await f.service.rememberMore({
      scope: f.scope, contextId: chain.contextId, seedMemoryIds: [chain.decision.memoryId], reason: 'causal_history',
    });
    const reached = expanded.expansions.map((entry) => entry.memoryId);
    expect(reached).toContain(chain.procedure.memoryId);
    expect(reached).toContain(chain.failure.memoryId);
    const deepest = expanded.expansions.find((entry) => entry.memoryId === chain.failure.memoryId);
    expect(deepest?.memoryPath).toEqual([chain.decision.memoryId, chain.procedure.memoryId, chain.failure.memoryId]);
    expect(deepest?.depth).toBe(2);

    const audited = await f.service.listRecallExpansions(f.scope, chain.contextId);
    expect(audited.map((row) => row.targetMemoryId).sort()).toEqual([...new Set(reached)].sort());
    expect(audited.every((row) => row.contextId === chain.contextId)).toBe(true);
    await f.service.close();
  });

  it('enforces hop, item, and character bounds while replaying deterministically', async () => {
    const f = await fixture('bounds');
    const chain = await seedChain(f);
    const request = {
      scope: f.scope, contextId: chain.contextId, seedMemoryIds: [chain.decision.memoryId],
      reason: 'causal_history' as const, maxHops: 1,
    };

    const oneHop = await f.service.rememberMore(request);
    expect(oneHop.expansions.map((entry) => entry.memoryId)).toContain(chain.procedure.memoryId);
    expect(oneHop.expansions.map((entry) => entry.memoryId)).not.toContain(chain.failure.memoryId);

    const capped = await f.service.rememberMore({ ...request, maxHops: 2, maxItems: 1 });
    expect(capped.expansions).toHaveLength(1);
    expect(capped.truncated).toBe(true);

    const squeezed = await f.service.rememberMore({ ...request, maxHops: 2, characterBudget: 1 });
    expect(squeezed.expansions).toHaveLength(0);
    expect(squeezed.characterBudgetConsumed).toBe(0);

    const replay = await f.service.rememberMore(request);
    expect(replay.snapshotHash).toBe(oneHop.snapshotHash);
    expect(replay.expansions.map((entry) => entry.memoryId)).toEqual(oneHop.expansions.map((entry) => entry.memoryId));
    await f.service.close();
  });
});
