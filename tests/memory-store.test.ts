import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryRetriever } from '../src/memory/retriever.js';
import { MemoryStore, MemoryStoreError } from '../src/memory/store.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

function dbPath(label: string): string {
  const base = process.env.TEMP || process.env.TMP || os.tmpdir();
  return path.join(mkdtempSync(path.join(base, `agent-core-store-${label}-`)), 'memory.sqlite');
}

const scopeA = { principalId: 'principal-a', projectId: 'project-one', threadId: 'thread-a', resourceId: 'resource-a' };
const scopeB = { principalId: 'principal-b', projectId: 'project-one', threadId: 'thread-b', resourceId: 'resource-b' };

describe('auditable versioned memory store', () => {
  it('appends redacted events and creates/deduplicates/revises/tombstones memory transactionally with principal isolation', async () => {
    const client = new MemoryWorkerClient();
    const store = new MemoryStore(client);
    await store.open({ dbPath: dbPath('core') });

    const event = await store.recordEvent({
      scope: scopeA,
      eventType: 'memory.event_recorded',
      sourceType: 'test',
      sourceRef: 'secret-fixture',
      text: 'Authorization: Bearer super-secret-token-value normal evidence',
      metadata: { phase: 'preflight' },
    });
    const persistedEvent = await client.query<{ raw_text: string | null; redacted_text: string }>(
      'SELECT raw_text, redacted_text FROM memory_events WHERE id = ?', [event.eventId],
    );
    expect(persistedEvent[0]!.raw_text).toBeNull();
    expect(persistedEvent[0]!.redacted_text).toContain('[REDACTED:BEARER]');
    expect(persistedEvent[0]!.redacted_text).not.toContain('super-secret-token-value');
    await expect(client.exec(`UPDATE memory_events SET redacted_text = 'mutated' WHERE id = '${event.eventId}'`)).rejects.toBeTruthy();

    const first = await store.commitMemory({
      scope: scopeA,
      canonicalKey: 'project.storage.policy',
      kind: 'guardrail',
      value: 'Keep artifacts in F:\\Projects\\Agent-Core',
      importance: 1,
      pinned: true,
      enforcement: 'hard',
      sourceType: 'primary_ai',
      sourceRef: 'commit-1',
    });
    expect(first.deduplicated).toBe(false);
    expect(first.revisionNo).toBe(1);

    const same = await store.commitMemory({
      scope: scopeA,
      canonicalKey: 'project.storage.policy',
      kind: 'guardrail',
      value: 'Keep artifacts in F:\\Projects\\Agent-Core',
      importance: 1,
      pinned: true,
      enforcement: 'hard',
      sourceType: 'primary_ai',
      sourceRef: 'commit-duplicate',
    });
    expect(same).toMatchObject({ memoryId: first.memoryId, revisionId: first.revisionId, revisionNo: 1, deduplicated: true });

    const revised = await store.reviseMemory({
      scope: scopeA,
      memoryId: first.memoryId,
      value: 'Keep all task artifacts and caches on drive F',
      sourceType: 'user_correction',
      sourceRef: 'revise-1',
    });
    expect(revised.memoryId).toBe(first.memoryId);
    expect(revised.revisionNo).toBe(2);
    expect(revised.supersededRevisionId).toBe(first.revisionId);

    const current = await store.getMemory(scopeA, first.memoryId);
    expect(current).toMatchObject({ memoryId: first.memoryId, revisionId: revised.revisionId, revisionNo: 2, valueText: 'Keep all task artifacts and caches on drive F', state: 'active' });
    expect(await store.getMemory(scopeB, first.memoryId)).toBeNull();
    expect((await store.listRevisions(scopeA, first.memoryId)).map((row) => row.revisionNo)).toEqual([1, 2]);
    expect(await store.listRevisions(scopeB, first.memoryId)).toEqual([]);
    await expect(store.reviseMemory({ scope: scopeB, memoryId: first.memoryId, value: 'cross principal' }))
      .rejects.toEqual(expect.objectContaining<Partial<MemoryStoreError>>({ code: 'MEMORY_NOT_FOUND' }));

    const beforeRollbackEvents = (await client.query<{ count: number }>("SELECT count(*) AS count FROM memory_events WHERE source_ref = 'rollback-fixture'"))[0]!.count;
    await expect(store.commitMemory({
      scope: scopeA,
      canonicalKey: 'rollback.fixture',
      kind: 'decision',
      value: 'must rollback',
      sourceType: 'test',
      sourceRef: 'rollback-fixture',
      explicitRelations: [{ targetMemoryId: 'missing-target', relation: 'explicit_relation' }],
    })).rejects.toBeTruthy();
    expect((await client.query<{ count: number }>("SELECT count(*) AS count FROM memory_events WHERE source_ref = 'rollback-fixture'"))[0]!.count).toBe(beforeRollbackEvents);
    expect((await client.query<{ count: number }>("SELECT count(*) AS count FROM memory_items WHERE canonical_key = 'rollback.fixture'"))[0]!.count).toBe(0);

    await expect(store.tombstoneMemory(scopeB, first.memoryId, 'not owner')).rejects.toMatchObject({ code: 'MEMORY_NOT_FOUND' });
    await store.tombstoneMemory(scopeA, first.memoryId, 'user requested forget');
    expect((await store.getMemory(scopeA, first.memoryId))!.state).toBe('tombstoned');
    expect(await client.query('SELECT memory_id FROM memory_fts WHERE memory_id = ?', [first.memoryId])).toEqual([]);

    const eventCount = (await client.query<{ count: number }>('SELECT count(*) AS count FROM memory_events'))[0]!.count;
    expect(eventCount).toBeGreaterThanOrEqual(5);
    await store.close();
  });

  it('persists explicit contextual anchors deterministically and exposes them through exact retrieval', async () => {
    const client = new MemoryWorkerClient();
    const store = new MemoryStore(client);
    await store.open({ dbPath: dbPath('explicit-anchors') });
    const scope = { ...scopeA, projectId: 'anchor-project' };
    const commit = '482489d799ed696b752875a1753cbdc6527e5115';

    const memory = await store.commitMemory({
      scope,
      canonicalKey: 'memory.explicit.anchor.fixture',
      kind: 'artifact',
      value: 'Verified cross-session memory artifact.',
      sourceType: 'test',
      explicitAnchors: [
        { type: 'continuity_task_id', value: 'task-123' },
        { type: 'continuity_task_id', value: 'task-123' },
        { type: 'continuity_checkpoint_id', value: 'checkpoint-456' },
        { type: 'git_commit', value: commit },
        { type: 'branch_name', value: 'feature/memory-nervous-system' },
        { type: 'artifact_hash', value: 'a'.repeat(64) },
      ],
    });

    const explicitRows = await client.query<{ anchor: string; anchor_type: string }>(
      `SELECT anchor, anchor_type FROM memory_anchors
       WHERE memory_id = ? AND anchor_type IN (
         'continuity_task_id','continuity_checkpoint_id','git_commit','branch_name','artifact_hash'
       ) ORDER BY anchor_type, anchor`,
      [memory.memoryId],
    );
    expect(explicitRows).toEqual([
      { anchor: 'a'.repeat(64), anchor_type: 'artifact_hash' },
      { anchor: 'feature/memory-nervous-system', anchor_type: 'branch_name' },
      { anchor: 'checkpoint-456', anchor_type: 'continuity_checkpoint_id' },
      { anchor: 'task-123', anchor_type: 'continuity_task_id' },
      { anchor: commit, anchor_type: 'git_commit' },
    ]);

    const retriever = new MemoryRetriever(client, loadConfig({}, process.cwd()).memory);
    const recalled = await retriever.search({
      scope,
      query: 'continuity_task_id:task-123',
      limit: 5,
    });
    expect(recalled.hits[0]?.memoryId).toBe(memory.memoryId);
    expect(recalled.hits[0]?.whyMatched.exact).toBe(1);
    expect(recalled.hits[0]?.whyMatched.matchedAnchors).toContain('task-123');

    for (const invalidValue of ['   ', '[REDACTED:SECRET]']) {
      await expect(store.commitMemory({
        scope,
        canonicalKey: `memory.invalid.anchor.${invalidValue.trim() || 'blank'}`,
        kind: 'fact',
        value: 'This write must fail before persistence.',
        sourceType: 'test',
        explicitAnchors: [{ type: 'continuity_task_id', value: invalidValue }],
      })).rejects.toMatchObject({ code: 'MEMORY_EXPLICIT_ANCHOR_INVALID' });
    }

    await store.close();
  });

  it('keeps directed semantic relations one-way while logical conflicts stay symmetric', async () => {
    const client = new MemoryWorkerClient();
    const store = new MemoryStore(client);
    await store.open({ dbPath: dbPath('relation-direction') });
    const scope = { ...scopeA, projectId: 'relation-project' };

    const parent = await store.commitMemory({
      scope,
      canonicalKey: 'architecture.parent',
      kind: 'decision',
      value: 'Parent architecture decision',
      sourceType: 'test',
    });
    const conflicting = await store.commitMemory({
      scope,
      canonicalKey: 'architecture.conflicting',
      kind: 'decision',
      value: 'Conflicting architecture decision',
      sourceType: 'test',
    });
    const branch = await store.commitMemory({
      scope,
      canonicalKey: 'architecture.branch',
      kind: 'decision',
      value: 'Branch architecture decision',
      sourceType: 'test',
      explicitRelations: [
        { targetMemoryId: parent.memoryId, relation: 'branch_of' },
        { targetMemoryId: conflicting.memoryId, relation: 'contradicts' },
      ],
    });

    const branchEdges = await client.query<{ from_memory_id: string; to_memory_id: string; relation: string }>(
      `SELECT from_memory_id, to_memory_id, relation FROM memory_edges
       WHERE relation IN ('branch_of', 'contradicts')
       ORDER BY relation, from_memory_id, to_memory_id`,
    );
    expect(branchEdges.filter((edge) => edge.relation === 'branch_of')).toEqual([
      { from_memory_id: branch.memoryId, to_memory_id: parent.memoryId, relation: 'branch_of' },
    ]);
    const conflictEdges = branchEdges.filter((edge) => edge.relation === 'contradicts');
    expect(conflictEdges).toHaveLength(2);
    expect(conflictEdges).toEqual(expect.arrayContaining([
      { from_memory_id: branch.memoryId, to_memory_id: conflicting.memoryId, relation: 'contradicts' },
      { from_memory_id: conflicting.memoryId, to_memory_id: branch.memoryId, relation: 'contradicts' },
    ]));

    await store.close();
  });
});
