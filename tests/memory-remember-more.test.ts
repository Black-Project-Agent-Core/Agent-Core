import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import { MemoryRememberMore } from '../src/memory/remember-more.js';
import { MemoryService } from '../src/memory/service.js';
import { MemoryStore } from '../src/memory/store.js';
import {
  MEMORY_REMEMBER_MORE_DEFAULTS,
  MEMORY_REMEMBER_MORE_LIMITS,
  MEMORY_REMEMBER_MORE_REASONS,
  type MemoryRelation,
  type MemoryScope,
} from '../src/memory/types.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

function tempDb(label: string): string {
  const base = process.env.TEMP || process.env.TMP || os.tmpdir();
  return path.join(mkdtempSync(path.join(base, `agent-core-remember-more-${label}-`)), 'memory.sqlite');
}

async function fixture(label: string) {
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  await store.open({ dbPath: tempDb(label) });
  const cognition = new MemoryCognitionLedger(client);
  const rememberMore = new MemoryRememberMore(client, cognition);
  return { client, store, cognition, rememberMore };
}

async function authorizeSeed(
  client: MemoryWorkerClient,
  scope: MemoryScope,
  contextId: string,
  memoryId: string,
  expiresAt = Date.now() + 60_000,
): Promise<void> {
  const now = Date.now();
  await client.transaction([
    {
      kind: 'run',
      sql: `INSERT OR IGNORE INTO memory_contexts(
        id, principal_id, route_context_id, query_text, query_hash, result_json, blocking_json, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, '{}', '{}', ?, ?)`,
      params: [contextId, scope.principalId, randomUUID(), 'remember more fixture', 'fixture-hash', now, expiresAt],
    },
    {
      kind: 'run',
      sql: `INSERT OR IGNORE INTO memory_access_log(memory_id, context_id, rank, score, reason_json, accessed_at)
            VALUES (?, ?, 1, 1, '{}', ?)`,
      params: [memoryId, contextId, now],
    },
  ]);
}

async function insertEdge(
  client: MemoryWorkerClient,
  fromMemoryId: string,
  toMemoryId: string,
  relation: MemoryRelation,
): Promise<void> {
  await client.transaction([{
    kind: 'run',
    sql: `INSERT INTO memory_edges(from_memory_id, to_memory_id, relation, weight, evidence_event_id, created_at)
          VALUES (?, ?, ?, 1, NULL, ?)`,
    params: [fromMemoryId, toMemoryId, relation, Date.now()],
  }]);
}

async function insertConflict(
  client: MemoryWorkerClient,
  leftMemoryId: string,
  rightMemoryId: string,
): Promise<void> {
  await client.transaction([{
    kind: 'run',
    sql: `INSERT INTO memory_conflicts(
      id, left_memory_id, right_memory_id, conflict_type, status, evidence_json, created_at, resolved_at
    ) VALUES (?, ?, ?, 'semantic', 'open', '{}', ?, NULL)`,
    params: [randomUUID(), leftMemoryId, rightMemoryId, Date.now()],
  }]);
}

async function setBranchParent(
  client: MemoryWorkerClient,
  memoryId: string,
  parentMemoryId: string,
): Promise<void> {
  await client.transaction([{
    kind: 'run',
    sql: `INSERT INTO memory_node_metadata(
      memory_id, title, root_reason, novelty_class, created_from_decision_id,
      branch_parent_memory_id, semantic_profile_json, semantic_profile_hash, updated_at
    ) VALUES (?, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?)`,
    params: [memoryId, parentMemoryId, Date.now()],
  }]);
}

describe('bounded remember_more historical expansion', () => {
  it('publishes the approved reasons, defaults, and hard request ceilings', () => {
    expect(MEMORY_REMEMBER_MORE_REASONS).toEqual([
      'causal_history',
      'revision_history',
      'failure_history',
      'branch_history',
      'conflict_history',
      'user_requested',
    ]);
    expect(MEMORY_REMEMBER_MORE_DEFAULTS).toEqual({
      maxHops: 2,
      maxItems: 4,
      characterBudget: 6000,
    });
    expect(MEMORY_REMEMBER_MORE_LIMITS).toEqual({
      seedMemoryIds: 16,
      maxHops: 4,
      maxItems: 16,
      characterBudget: 20_000,
    });
  });

  it('requires every seed to have been recalled in the live authenticated context and project scope', async () => {
    const { client, store, rememberMore } = await fixture('authority');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const recalled = await store.commitMemory({
      scope,
      canonicalKey: 'decision.recalled',
      kind: 'decision',
      value: 'Current recalled decision.',
      sourceType: 'test',
    });
    const neverRecalled = await store.commitMemory({
      scope,
      canonicalKey: 'decision.never-recalled',
      kind: 'decision',
      value: 'Never recalled decision.',
      sourceType: 'test',
    });
    const contextId = randomUUID();
    await authorizeSeed(client, scope, contextId, recalled.memoryId);

    await expect(rememberMore.expand({
      scope,
      contextId,
      seedMemoryIds: [neverRecalled.memoryId],
      reason: 'user_requested',
    })).rejects.toThrow('MEMORY_REMEMBER_MORE_SEED_NOT_RECALLED');

    const expiredContextId = randomUUID();
    await authorizeSeed(client, scope, expiredContextId, recalled.memoryId, Date.now() - 1);
    await expect(rememberMore.expand({
      scope,
      contextId: expiredContextId,
      seedMemoryIds: [recalled.memoryId],
      reason: 'user_requested',
    })).rejects.toThrow('MEMORY_REMEMBER_MORE_CONTEXT_INVALID');

    const foreignPrincipalContext = randomUUID();
    await authorizeSeed(client, { principalId: 'principal-b', projectId: 'project-a' }, foreignPrincipalContext, recalled.memoryId);
    await expect(rememberMore.expand({
      scope,
      contextId: foreignPrincipalContext,
      seedMemoryIds: [recalled.memoryId],
      reason: 'user_requested',
    })).rejects.toThrow('MEMORY_REMEMBER_MORE_CONTEXT_INVALID');

    const foreignProject = await store.commitMemory({
      scope: { principalId: 'principal-a', projectId: 'project-b' },
      canonicalKey: 'decision.foreign-project',
      kind: 'decision',
      value: 'Foreign project memory.',
      sourceType: 'test',
    });
    const foreignProjectContext = randomUUID();
    await authorizeSeed(client, scope, foreignProjectContext, foreignProject.memoryId);
    await expect(rememberMore.expand({
      scope,
      contextId: foreignProjectContext,
      seedMemoryIds: [foreignProject.memoryId],
      reason: 'user_requested',
    })).rejects.toThrow('MEMORY_REMEMBER_MORE_SEED_NOT_RECALLED');

    await store.close();
  });

  it('rejects empty seeds and requests beyond the hard expansion ceilings before traversal', async () => {
    const { store, rememberMore } = await fixture('bounds');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    await expect(rememberMore.expand({
      scope,
      contextId: randomUUID(),
      seedMemoryIds: [],
      reason: 'user_requested',
    })).rejects.toThrow('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
    await expect(rememberMore.expand({
      scope,
      contextId: randomUUID(),
      seedMemoryIds: Array.from({ length: 17 }, () => randomUUID()),
      reason: 'user_requested',
      maxHops: 5,
      maxItems: 17,
      characterBudget: 20_001,
    })).rejects.toThrow('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
    await store.close();
  });

  it('returns bounded revision predecessors without replacing the current revision or loading unrelated memories', async () => {
    const { client, store, rememberMore } = await fixture('revision');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const first = await store.commitMemory({
      scope,
      canonicalKey: 'decision.geometry',
      kind: 'decision',
      value: 'Use post-render scaling for geometry.',
      sourceType: 'test',
    });
    const second = await store.reviseMemory({
      scope,
      memoryId: first.memoryId,
      value: 'Preserve source-native geometry without post-render scaling.',
      sourceType: 'test',
    });
    await store.commitMemory({
      scope,
      canonicalKey: 'note.unrelated',
      kind: 'observation',
      value: 'Unrelated coffee observation must not enter revision history.',
      sourceType: 'test',
    });
    const contextId = randomUUID();
    await authorizeSeed(client, scope, contextId, first.memoryId);

    const result = await rememberMore.expand({
      scope,
      contextId,
      seedMemoryIds: [first.memoryId, first.memoryId],
      reason: 'revision_history',
    });

    expect(result.seedMemoryIds).toEqual([first.memoryId]);
    expect(result.expansions).toHaveLength(1);
    expect(result.expansions[0]).toMatchObject({
      memoryId: first.memoryId,
      revisionId: first.revisionId,
      revisionNo: 1,
      canonicalKey: 'decision.geometry',
      valueText: 'Use post-render scaling for geometry.',
      sourceSeedMemoryId: first.memoryId,
      depth: 1,
      relationPath: ['supersedes'],
      memoryPath: [first.memoryId],
      reasonCode: 'revision_predecessor',
      score: 1,
      historicalRevision: true,
    });
    expect(result.expansions[0]!.revisionId).not.toBe(second.revisionId);
    expect(result.characterBudgetConsumed).toBe(result.expansions[0]!.valueText.length);
    expect(result.truncated).toBe(false);
    expect(result.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await store.getMemory(scope, first.memoryId))?.revisionId).toBe(second.revisionId);
    await store.close();
  });

  it('traverses recursive causal history in fixed priority while refusing weak or reverse-only edges', async () => {
    const { client, store, rememberMore } = await fixture('graph');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const cause = await store.commitMemory({ scope, canonicalKey: 'failure.cause', kind: 'failure', value: 'Root failure cause.', sourceType: 'test' });
    const failure = await store.commitMemory({ scope, canonicalKey: 'failure.render', kind: 'failure', value: 'Rendering failed.', sourceType: 'test' });
    const solution = await store.commitMemory({ scope, canonicalKey: 'solution.render', kind: 'solution', value: 'Use the validated renderer.', sourceType: 'test' });
    const validation = await store.commitMemory({ scope, canonicalKey: 'validation.render', kind: 'validation', value: 'Renderer validation passed.', sourceType: 'test' });
    const dependency = await store.commitMemory({ scope, canonicalKey: 'dependency.render', kind: 'procedure', value: 'Required geometry dependency.', sourceType: 'test' });
    const reverseOnly = await store.commitMemory({ scope, canonicalKey: 'failure.reverse', kind: 'failure', value: 'Must not be followed backwards.', sourceType: 'test' });

    await insertEdge(client, failure.memoryId, solution.memoryId, 'resolved_by');
    await insertEdge(client, failure.memoryId, cause.memoryId, 'failed_because');
    await insertEdge(client, solution.memoryId, validation.memoryId, 'validated_by');
    await insertEdge(client, solution.memoryId, dependency.memoryId, 'depends_on');
    await insertEdge(client, reverseOnly.memoryId, solution.memoryId, 'failed_because');

    const weakRelations: MemoryRelation[] = ['token_overlap', 'same_anchor', 'temporal_neighbor', 'same_task_family'];
    const weakIds: string[] = [];
    for (const [index, relation] of weakRelations.entries()) {
      const weak = await store.commitMemory({
        scope,
        canonicalKey: `weak.${index}`,
        kind: 'observation',
        value: `Weak relation ${relation}.`,
        sourceType: 'test',
      });
      weakIds.push(weak.memoryId);
      await insertEdge(client, solution.memoryId, weak.memoryId, relation);
    }
    const hiddenBehindWeak = await store.commitMemory({
      scope,
      canonicalKey: 'dependency.behind-weak',
      kind: 'procedure',
      value: 'Must remain unreachable behind a weak edge.',
      sourceType: 'test',
    });
    await insertEdge(client, weakIds[0]!, hiddenBehindWeak.memoryId, 'depends_on');

    const contextId = randomUUID();
    await authorizeSeed(client, scope, contextId, solution.memoryId);
    const result = await rememberMore.expand({
      scope,
      contextId,
      seedMemoryIds: [solution.memoryId],
      reason: 'failure_history',
      maxHops: 2,
      maxItems: 16,
      characterBudget: 20_000,
    });

    expect(result.expansions.map((entry) => entry.memoryId)).toEqual([
      cause.memoryId,
      failure.memoryId,
      validation.memoryId,
      dependency.memoryId,
    ]);
    expect(result.expansions.map((entry) => entry.reasonCode)).toEqual([
      'failure_cause',
      'resolved_by',
      'validated_by',
      'dependency',
    ]);
    expect(result.expansions[0]).toMatchObject({
      depth: 2,
      relationPath: ['resolved_by', 'failed_because'],
      memoryPath: [solution.memoryId, failure.memoryId, cause.memoryId],
      score: 0.9,
      historicalRevision: false,
    });
    expect(result.expansions[1]).toMatchObject({ depth: 1, relationPath: ['resolved_by'], score: 0.9 });
    expect(result.expansions[2]).toMatchObject({ depth: 1, relationPath: ['validated_by'], score: 0.85 });
    expect(result.expansions[3]).toMatchObject({ depth: 1, relationPath: ['depends_on'], score: 0.7 });
    expect(result.expansions.some((entry) => entry.memoryId === reverseOnly.memoryId)).toBe(false);
    expect(result.expansions.some((entry) => weakIds.includes(entry.memoryId))).toBe(false);
    expect(result.expansions.some((entry) => entry.memoryId === hiddenBehindWeak.memoryId)).toBe(false);
    await store.close();
  });

  it('recovers graph branch parents, metadata branch fallback, and conflict-table history with strict scope isolation', async () => {
    const { client, store, rememberMore } = await fixture('branch-conflict');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const graphParent = await store.commitMemory({ scope, canonicalKey: 'branch.graph.parent', kind: 'decision', value: 'Graph parent.', sourceType: 'test' });
    const graphBranch = await store.commitMemory({ scope, canonicalKey: 'branch.graph.child', kind: 'decision', value: 'Graph branch.', sourceType: 'test' });
    const metadataParent = await store.commitMemory({ scope, canonicalKey: 'branch.meta.parent', kind: 'decision', value: 'Metadata parent.', sourceType: 'test' });
    const metadataBranch = await store.commitMemory({ scope, canonicalKey: 'branch.meta.child', kind: 'decision', value: 'Metadata branch.', sourceType: 'test' });
    const conflictSeed = await store.commitMemory({ scope, canonicalKey: 'conflict.seed', kind: 'decision', value: 'Current disputed decision.', sourceType: 'test' });
    const conflictOther = await store.commitMemory({ scope, canonicalKey: 'conflict.other', kind: 'decision', value: 'Conflicting historical decision.', sourceType: 'test' });
    const foreignProject = await store.commitMemory({
      scope: { principalId: 'principal-a', projectId: 'project-b' },
      canonicalKey: 'foreign.project', kind: 'decision', value: 'Foreign project.', sourceType: 'test',
    });
    const foreignPrincipal = await store.commitMemory({
      scope: { principalId: 'principal-b', projectId: 'project-a' },
      canonicalKey: 'foreign.principal', kind: 'decision', value: 'Foreign principal.', sourceType: 'test',
    });
    const tombstoned = await store.commitMemory({ scope, canonicalKey: 'branch.tombstoned', kind: 'decision', value: 'Deleted parent.', sourceType: 'test' });
    await store.tombstoneMemory(scope, tombstoned.memoryId, 'test tombstone');

    await insertEdge(client, graphBranch.memoryId, graphParent.memoryId, 'branch_of');
    await setBranchParent(client, metadataBranch.memoryId, metadataParent.memoryId);
    await insertConflict(client, conflictSeed.memoryId, conflictOther.memoryId);
    await insertEdge(client, graphBranch.memoryId, foreignProject.memoryId, 'branch_of');
    await insertEdge(client, graphBranch.memoryId, foreignPrincipal.memoryId, 'branch_of');
    await insertEdge(client, graphBranch.memoryId, tombstoned.memoryId, 'branch_of');

    const contextId = randomUUID();
    for (const seed of [graphBranch, metadataBranch, conflictSeed]) {
      await authorizeSeed(client, scope, contextId, seed.memoryId);
    }
    const result = await rememberMore.expand({
      scope,
      contextId,
      seedMemoryIds: [conflictSeed.memoryId, metadataBranch.memoryId, graphBranch.memoryId],
      reason: 'user_requested',
      maxHops: 1,
      maxItems: 16,
      characterBudget: 20_000,
    });

    const orderedBranchParents = [
      { seed: graphBranch.memoryId, parent: graphParent.memoryId },
      { seed: metadataBranch.memoryId, parent: metadataParent.memoryId },
    ].sort((left, right) => left.seed.localeCompare(right.seed)).map((entry) => entry.parent);
    expect(result.expansions.map((entry) => entry.memoryId)).toEqual([
      ...orderedBranchParents,
      conflictOther.memoryId,
    ]);
    expect(result.expansions.filter((entry) => entry.reasonCode === 'branch_parent')).toHaveLength(2);
    expect(result.expansions.find((entry) => entry.memoryId === metadataParent.memoryId)).toMatchObject({
      sourceSeedMemoryId: metadataBranch.memoryId,
      depth: 1,
      relationPath: ['branch_of'],
      memoryPath: [metadataBranch.memoryId, metadataParent.memoryId],
      score: 0.8,
    });
    expect(result.expansions.find((entry) => entry.memoryId === conflictOther.memoryId)).toMatchObject({
      sourceSeedMemoryId: conflictSeed.memoryId,
      depth: 1,
      relationPath: ['contradicts'],
      reasonCode: 'conflict',
      score: 0.75,
    });
    expect(result.expansions.some((entry) => entry.memoryId === foreignProject.memoryId)).toBe(false);
    expect(result.expansions.some((entry) => entry.memoryId === foreignPrincipal.memoryId)).toBe(false);
    expect(result.expansions.some((entry) => entry.memoryId === tombstoned.memoryId)).toBe(false);
    await store.close();
  });

  it('enforces hop, item, and character bounds while preserving deterministic replay across seed order', async () => {
    const { client, store, rememberMore } = await fixture('determinism');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const seedA = await store.commitMemory({ scope, canonicalKey: 'seed.a', kind: 'decision', value: 'Seed A.', sourceType: 'test' });
    const seedB = await store.commitMemory({ scope, canonicalKey: 'seed.b', kind: 'decision', value: 'Seed B.', sourceType: 'test' });
    const hopOne = await store.commitMemory({ scope, canonicalKey: 'hop.one', kind: 'procedure', value: 'hop1', sourceType: 'test' });
    const hopTwo = await store.commitMemory({ scope, canonicalKey: 'hop.two', kind: 'procedure', value: 'hop2', sourceType: 'test' });
    const long = await store.commitMemory({ scope, canonicalKey: 'budget.long', kind: 'procedure', value: 'ABCDEFGHIJK', sourceType: 'test' });
    const smallA = await store.commitMemory({ scope, canonicalKey: 'budget.small-a', kind: 'procedure', value: 'abc', sourceType: 'test' });
    const smallB = await store.commitMemory({ scope, canonicalKey: 'budget.small-b', kind: 'procedure', value: 'de', sourceType: 'test' });

    await insertEdge(client, seedA.memoryId, hopOne.memoryId, 'depends_on');
    await insertEdge(client, hopOne.memoryId, hopTwo.memoryId, 'depends_on');
    await insertEdge(client, seedA.memoryId, long.memoryId, 'depends_on');
    await insertEdge(client, seedA.memoryId, smallA.memoryId, 'depends_on');
    await insertEdge(client, seedB.memoryId, smallB.memoryId, 'depends_on');

    const contextId = randomUUID();
    await authorizeSeed(client, scope, contextId, seedA.memoryId);
    await authorizeSeed(client, scope, contextId, seedB.memoryId);

    const hopBound = await rememberMore.expand({
      scope, contextId, seedMemoryIds: [seedA.memoryId], reason: 'causal_history', maxHops: 1, maxItems: 16, characterBudget: 20_000,
    });
    expect(hopBound.expansions.some((entry) => entry.memoryId === hopOne.memoryId)).toBe(true);
    expect(hopBound.expansions.some((entry) => entry.memoryId === hopTwo.memoryId)).toBe(false);
    expect(hopBound.truncated).toBe(true);

    const itemBound = await rememberMore.expand({
      scope, contextId, seedMemoryIds: [seedA.memoryId, seedB.memoryId], reason: 'user_requested', maxHops: 2, maxItems: 1, characterBudget: 20_000,
    });
    expect(itemBound.expansions).toHaveLength(1);
    expect(itemBound.truncated).toBe(true);

    const request = {
      scope,
      contextId,
      seedMemoryIds: [seedA.memoryId, seedB.memoryId],
      reason: 'user_requested' as const,
      maxHops: 1,
      maxItems: 16,
      characterBudget: 5,
    };
    const first = await rememberMore.expand(request);
    const second = await rememberMore.expand(request);
    const reversed = await rememberMore.expand({ ...request, seedMemoryIds: [...request.seedMemoryIds].reverse() });
    expect(first.characterBudgetConsumed).toBeLessThanOrEqual(5);
    expect(first.expansions.every((entry) => entry.characterCount <= 5)).toBe(true);
    expect(first.expansions.some((entry) => entry.memoryId === long.memoryId)).toBe(false);
    expect(first.truncated).toBe(true);
    expect(second).toEqual(first);
    expect(reversed).toEqual(first);
    await store.close();
  });


  it('audits only returned packed expansions with scoped source, path, reason, depth, and score', async () => {
    const { client, store, cognition, rememberMore } = await fixture('audit');
    const scope = { principalId: 'principal-a', projectId: 'project-a' };
    const parent = await store.commitMemory({ scope, canonicalKey: 'audit.parent', kind: 'decision', value: 'Historical branch parent.', sourceType: 'test' });
    const dependency = await store.commitMemory({ scope, canonicalKey: 'audit.dependency', kind: 'procedure', value: 'Lower priority dependency.', sourceType: 'test' });
    const first = await store.commitMemory({ scope, canonicalKey: 'audit.seed', kind: 'decision', value: 'Old seed revision.', sourceType: 'test' });
    await store.reviseMemory({ scope, memoryId: first.memoryId, value: 'Current seed revision.', sourceType: 'test' });
    await insertEdge(client, first.memoryId, parent.memoryId, 'branch_of');
    await insertEdge(client, first.memoryId, dependency.memoryId, 'depends_on');
    const contextId = randomUUID();
    await authorizeSeed(client, scope, contextId, first.memoryId);

    const result = await rememberMore.expand({
      scope,
      contextId,
      seedMemoryIds: [first.memoryId],
      reason: 'user_requested',
      maxHops: 1,
      maxItems: 2,
      characterBudget: 20_000,
    });
    expect(result.expansions).toHaveLength(2);
    expect(result.expansions.map((entry) => entry.memoryId)).toEqual([first.memoryId, parent.memoryId]);
    expect(result.expansions.some((entry) => entry.memoryId === dependency.memoryId)).toBe(false);

    const audit = await cognition.listRecallExpansions(scope, contextId);
    expect(audit).toHaveLength(2);
    for (const expansion of result.expansions) {
      expect(audit).toContainEqual(expect.objectContaining({
        principalId: scope.principalId,
        projectId: scope.projectId,
        contextId,
        sourceMemoryId: expansion.sourceSeedMemoryId,
        targetMemoryId: expansion.memoryId,
        depth: expansion.depth,
        relationPath: expansion.relationPath,
        reasonCode: `user_requested:${expansion.reasonCode}`,
        score: expansion.score,
      }));
    }
    expect(audit.some((row) => row.targetMemoryId === dependency.memoryId)).toBe(false);
    expect(audit.find((row) => row.targetMemoryId === first.memoryId)).toMatchObject({
      sourceMemoryId: first.memoryId,
      targetMemoryId: first.memoryId,
      relationPath: ['supersedes'],
    });
    await store.close();
  });

  it('composes bounded remember_more through MemoryService without changing current-first preflight recall', async () => {
    const root = mkdtempSync(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-remember-more-service-'));
    const base = loadConfig({}, root).memory;
    const service = new MemoryService({ ...base, enabled: true, dbPath: path.join(root, 'runtime', 'memory', 'service.sqlite') });
    const scope = { principalId: 'service-principal', projectId: 'service-project' };
    try {
      const first = await service.commit({
        scope,
        canonicalKey: 'decision.remember-more.service',
        kind: 'decision',
        value: 'The service originally used legacy geometry scaling.',
        sourceType: 'test',
      });
      const current = await service.revise({
        scope,
        memoryId: first.memoryId,
        value: 'The service now preserves source-native geometry.',
        sourceType: 'test',
      });
      const preflight = await service.preflight({
        scope,
        routeContextId: randomUUID(),
        task: 'preserve source-native geometry decision remember more service',
        expiresAt: Date.now() + 60_000,
      });
      expect(preflight.recalled.find((hit) => hit.memoryId === first.memoryId)?.revisionId).toBe(current.revisionId);

      const result = await service.rememberMore({
        scope,
        contextId: preflight.contextId,
        seedMemoryIds: [first.memoryId],
        reason: 'revision_history',
      });
      expect(result.expansions).toHaveLength(1);
      expect(result.expansions[0]).toMatchObject({
        memoryId: first.memoryId,
        revisionId: first.revisionId,
        revisionNo: 1,
        historicalRevision: true,
      });
      expect((await service.getMemory(scope, first.memoryId))?.revisionId).toBe(current.revisionId);
      expect(await service.listRecallExpansions(scope, preflight.contextId)).toHaveLength(1);
    } finally {
      await service.close();
    }
  });

});
