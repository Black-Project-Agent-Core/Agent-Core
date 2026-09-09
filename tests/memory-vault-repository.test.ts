import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';

const scope = { principalId: 'p1', projectId: 'F:\\Projects\\Agent-Core' };

describe('file-native memory repository', () => {
  it('deduplicates, revises with immutable history, tombstones, and keeps stable IDs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-vault-repo-'));
    const repo = new FileNativeMemoryRepository(resolveFileNativeMemoryPaths(root));
    const first = await repo.commit({ scope, canonicalKey: 'agent-core:memory', kind: 'decision', value: 'Markdown canonical', metadata: { contextFamily: 'decision', topicKey: 'agent-core-memory' } });
    const duplicate = await repo.commit({ scope, canonicalKey: 'agent-core:memory', kind: 'decision', value: 'Markdown canonical', metadata: { contextFamily: 'decision', topicKey: 'agent-core-memory' } });
    expect(duplicate.memoryId).toBe(first.memoryId);
    expect(duplicate.deduplicated).toBe(true);
    const revised = await repo.revise({ scope, memoryId: first.memoryId, value: 'Markdown canonical + Graphify' });
    expect(revised.memoryId).toBe(first.memoryId);
    expect(revised.revisionNo).toBe(2);
    const revisions = await repo.listRevisions(scope, first.memoryId);
    expect(revisions.map(r => r.revisionNo)).toEqual([1, 2]);
    await repo.tombstoneMemory(scope, first.memoryId, 'retired');
    expect((await repo.getMemory(scope, first.memoryId))?.state).toBe('tombstoned');
  });

  it('persists several justified relations on one memory without forcing one-parent shape', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-vault-rel-'));
    const repo = new FileNativeMemoryRepository(resolveFileNativeMemoryPaths(root));
    const a = await repo.commit({ scope, canonicalKey: 'a', kind: 'decision', value: 'A', metadata: { contextFamily: 'decision', topicKey: 'memory' } });
    const b = await repo.commit({ scope, canonicalKey: 'b', kind: 'failure', value: 'B', metadata: { contextFamily: 'failure', topicKey: 'memory' } });
    const c = await repo.commit({ scope, canonicalKey: 'c', kind: 'procedure', value: 'C', metadata: { contextFamily: 'procedure', topicKey: 'memory' } });
    await repo.addExplicitRelation({ scope, fromMemoryId: a.memoryId, toMemoryId: b.memoryId, relation: 'resolved_by', reasonCode: 'TEST' });
    await repo.addExplicitRelation({ scope, fromMemoryId: a.memoryId, toMemoryId: c.memoryId, relation: 'validated_by', reasonCode: 'TEST' });
    const located = await repo.findEntry(scope, a.memoryId);
    expect(located?.entry.relations.map(r => r.relation).sort()).toEqual(['resolved_by','validated_by']);
  });
});
