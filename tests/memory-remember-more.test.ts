import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import { MemoryRememberMore } from '../src/memory/remember-more.js';
import { MemoryStore } from '../src/memory/store.js';
import {
  MEMORY_REMEMBER_MORE_DEFAULTS,
  MEMORY_REMEMBER_MORE_LIMITS,
  MEMORY_REMEMBER_MORE_REASONS,
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
});
