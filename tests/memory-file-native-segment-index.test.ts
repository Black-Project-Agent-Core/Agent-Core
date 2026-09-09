import { copyFile, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileNativeMemoryBackend } from '../src/memory/file-native/backend.js';
import { GraphifyAdapter } from '../src/memory/file-native/graphify-adapter.js';
import { resolveFileNativeMemoryPaths, type FileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { FileNativeMemoryRetriever, type GraphRecallHit } from '../src/memory/file-native/retriever.js';
import { FileNativeMemoryRepository, segmentInScope } from '../src/memory/file-native/vault-repository.js';
import { parseVaultSegment, serializeVaultSegment } from '../src/memory/file-native/vault-codec.js';
import { memoryConfig } from './helpers/memory-fixture.js';

const scope = { principalId: 'p1', projectId: 'segment-index-project' };
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function vaultPaths(label: string): Promise<FileNativeMemoryPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), `ac-${label}-`));
  roots.push(root);
  const paths = resolveFileNativeMemoryPaths(root);
  await mkdir(paths.ripgrepRoot, { recursive: true });
  const rg = process.platform === 'win32' ? 'rg.exe' : 'rg';
  await copyFile(path.resolve('.tools', 'ripgrep', rg), path.join(paths.ripgrepRoot, rg));
  return paths;
}

/** Rewrite one segment the way a second writer or a human editing Markdown would: straight to disk. */
async function editSegmentOutsideTheRepository(
  paths: FileNativeMemoryPaths, relativePath: string, edit: (segment: ReturnType<typeof parseVaultSegment>) => void,
): Promise<void> {
  const file = path.join(paths.vaultRoot, ...relativePath.split('/'));
  const segment = parseVaultSegment(await readFile(file, 'utf8'), relativePath);
  edit(segment);
  await writeFile(file, serializeVaultSegment(segment), 'utf8');
}

describe('file-native segment index', () => {
  it('resolves a graph-only neighbour and still sees writes made outside the repository', async () => {
    const paths = await vaultPaths('segment-index-recall');
    const repo = new FileNativeMemoryRepository(paths);
    const anchor = await repo.commit({
      scope, canonicalKey: 'coding:index-anchor', kind: 'procedure',
      value: 'Segment index anchor phrase zebrafish.', metadata: { contextFamily: 'coding', topicKey: 'anchor' },
    });
    const neighbour = await repo.commit({
      scope, canonicalKey: 'decision:index-neighbour', kind: 'decision',
      value: 'Wording no lexical probe of the query can reach.', metadata: { contextFamily: 'decision', topicKey: 'neighbour' },
    });
    const related = new Map<string, GraphRecallHit>([[neighbour.memoryId, { score: 1, path: [anchor.memoryId, neighbour.memoryId] }]]);
    const retriever = new FileNativeMemoryRetriever(paths, {
      repository: repo, graphProvider: { scoreRelated: async () => related },
    });

    const first = await retriever.search({ scope, query: 'zebrafish' });
    expect(first.hits.map((hit) => hit.memoryId)).toContain(neighbour.memoryId);
    expect(first.hits.find((hit) => hit.memoryId === neighbour.memoryId)?.whyMatched.graph).toBe(1);

    // Warm index, then a second writer adds a memory the repository never saw: recall must still find it.
    const located = await repo.findEntry(scope, neighbour.memoryId);
    expect(located).not.toBeNull();
    await editSegmentOutsideTheRepository(paths, located!.segment.relativePath, (segment) => {
      segment.entries.push({
        ...segment.entries[0]!, memoryId: 'smuggled-memory-0001', revisionId: 'smuggled-revision-0001',
        canonicalKey: 'decision:smuggled', valueText: 'Smuggled in by a second writer.',
      });
    });
    expect((await repo.getMemory(scope, 'smuggled-memory-0001'))?.canonicalKey).toBe('decision:smuggled');
    expect((await repo.getMemoryByCanonicalKey(scope, 'decision:smuggled'))?.memoryId).toBe('smuggled-memory-0001');

    related.set('smuggled-memory-0001', { score: 1, path: [anchor.memoryId, 'smuggled-memory-0001'] });
    const second = await retriever.search({ scope, query: 'zebrafish' });
    expect(second.hits.map((hit) => hit.memoryId)).toContain('smuggled-memory-0001');

    // Same-byte-length rewrite: the size check cannot see it, so only the moved mtime can invalidate
    // the index and the parsed-segment cache. (NTFS utimes() cannot reproduce an identical mtimeMs,
    // so size-equal + mtime-moved is the honest variant of this test.)
    const segmentFile = path.join(paths.vaultRoot, located!.segment.relativePath);
    const beforeRewrite = await stat(segmentFile);
    const original = located!.entry.valueText;
    const replacement = 'External writer replaced this wording.'.padEnd(original.length, '!');
    expect(Buffer.byteLength(replacement)).toBe(Buffer.byteLength(original));
    await editSegmentOutsideTheRepository(paths, located!.segment.relativePath, (segment) => {
      segment.entries.find((candidate) => candidate.memoryId === neighbour.memoryId)!.valueText = replacement;
    });
    await utimes(segmentFile, beforeRewrite.atime, new Date(beforeRewrite.mtimeMs + 2000));
    expect((await stat(segmentFile)).size).toBe(beforeRewrite.size);
    expect((await stat(segmentFile)).mtimeMs).not.toBe(beforeRewrite.mtimeMs);
    const rewritten = await retriever.search({ scope, query: 'zebrafish' });
    expect(rewritten.hits.find(hit => hit.memoryId === neighbour.memoryId)?.valueText).toBe(replacement);
    expect((await repo.getMemory(scope, neighbour.memoryId))?.valueText).toBe(replacement);
  });

  it('hands one validated snapshot to a whole operation and revalidates only for the next one', async () => {
    const paths = await vaultPaths('segment-index-snapshot');
    const repo = new FileNativeMemoryRepository(paths);
    const committed = await repo.commit({ scope, canonicalKey: 'coding:snapshot-anchor', kind: 'observation', value: 'Snapshot anchor.' });

    // Unchanged tree: the same snapshot object comes back, so caches keyed on it (ripgrep candidates) stay warm.
    const first = await repo.readSnapshot();
    expect(await repo.readSnapshot()).toBe(first);
    expect(first.spineByPath.get(first.byMemoryId.get(committed.memoryId)!)?.memoryIds).toContain(committed.memoryId);
    // Lookups given that snapshot resolve through it; lookups without one validate for themselves.
    expect((await repo.getMemory(scope, committed.memoryId, first))?.canonicalKey).toBe('coding:snapshot-anchor');
    expect(await repo.findEntries(scope, [committed.memoryId], first)).toHaveLength(1);

    // A writer inside this process invalidates; the next operation gets a new snapshot that sees the write.
    const second = await repo.commit({ scope, canonicalKey: 'coding:snapshot-second', kind: 'observation', value: 'Second.' });
    const afterWrite = await repo.readSnapshot();
    expect(afterWrite).not.toBe(first);
    expect(afterWrite.byMemoryId.has(second.memoryId)).toBe(true);
    expect(first.byMemoryId.has(second.memoryId)).toBe(false);

    // A foreign in-place edit is caught by the next validation pass, not by any timer.
    const stable = await repo.readSnapshot();
    expect(stable).toBe(afterWrite);
    await editSegmentOutsideTheRepository(paths, afterWrite.byMemoryId.get(second.memoryId)!, (segment) => {
      segment.entries.push({ ...segment.entries[0]!, memoryId: 'foreign-0001', revisionId: 'foreign-rev-0001', canonicalKey: 'coding:foreign' });
    });
    const afterForeignWrite = await repo.readSnapshot();
    expect(afterForeignWrite).not.toBe(afterWrite);
    expect(afterForeignWrite.byMemoryId.get('foreign-0001')).toBe(afterWrite.byMemoryId.get(second.memoryId));
  });

  it('scopes every read by principal AND project, the pre-cutover contract', async () => {
    const paths = await vaultPaths('segment-index-scope');
    const repo = new FileNativeMemoryRepository(paths);
    const other = { principalId: 'p2', projectId: scope.projectId };
    const mine = await repo.commit({ scope, canonicalKey: 'coding:shared-key', kind: 'observation', value: 'Principal one copy hummingbird.' });
    const theirs = await repo.commit({ scope: other, canonicalKey: 'coding:shared-key', kind: 'observation', value: 'Principal two copy hummingbird.' });

    // Lookups: the same canonical key resolves per principal, and a foreign principal's id is not readable.
    expect((await repo.getMemoryByCanonicalKey(scope, 'coding:shared-key'))?.memoryId).toBe(mine.memoryId);
    expect((await repo.getMemoryByCanonicalKey(other, 'coding:shared-key'))?.memoryId).toBe(theirs.memoryId);
    expect(await repo.getMemory(scope, theirs.memoryId)).toBeNull();
    expect(await repo.findEntries(scope, [mine.memoryId, theirs.memoryId])).toHaveLength(1);
    expect(segmentInScope(paths, { principalId: 'p2', projectId: mine.memoryId && (await repo.findEntry(scope, mine.memoryId))!.segment.projectId }, scope)).toBe(false);

    // Counts: a scoped status counts only that principal's entries; an unscoped one counts the vault.
    expect((await repo.counts(scope)).active).toBe(1);
    expect((await repo.counts(other)).active).toBe(1);
    expect((await repo.counts()).active).toBe(2);

    // Recall: the lexical probe reaches both files, the scope filter keeps only the caller's principal.
    const retriever = new FileNativeMemoryRetriever(paths, { repository: repo });
    const recalled = (await retriever.search({ scope, query: 'hummingbird' })).hits.map((hit) => hit.memoryId);
    expect(recalled).toEqual([mine.memoryId]);
  });

  it('applies the same principal+project scope to status and export at the backend surface', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-segment-index-backend-'));
    roots.push(root);
    const backend = new FileNativeMemoryBackend({ ...await memoryConfig(root), enabled: true });
    await backend.ensureReady();
    const other = { principalId: 'p2', projectId: scope.projectId };
    const mine = await backend.commit({ scope, canonicalKey: 'coding:status-key', kind: 'observation', value: 'Mine.' });
    const theirs = await backend.commit({ scope: other, canonicalKey: 'coding:status-key', kind: 'observation', value: 'Theirs.' });

    expect((await backend.status(scope)).counts.active_items).toBe(1);
    expect((await backend.status(other)).counts.active_items).toBe(1);
    expect((await backend.status()).counts.active_items).toBe(2);
    expect((await backend.export(scope)).items.map((item) => item.memoryId)).toEqual([mine.memoryId]);
    expect((await backend.export(other)).items.map((item) => item.memoryId)).toEqual([theirs.memoryId]);
    expect(await backend.getMemory(scope, theirs.memoryId)).toBeNull();
    await backend.close();
  });

  it('caps the related set queryRelated returns at the budget and reports truncation honestly', async () => {
    const paths = await vaultPaths('segment-index-graph-cap');
    const spokes = 1500;
    const links = [];
    for (let index = 1; index <= spokes; index += 1) {
      const spoke = `spoke-${String(index).padStart(4, '0')}`;
      links.push({ source: 'hub', target: spoke, relation: 'explicit_relation', confidence: 'EXTRACTED', confidence_score: 1 });
      links.push({ source: spoke, target: 'hub', relation: 'explicit_relation', confidence: 'EXTRACTED', confidence_score: 1 });
    }
    await mkdir(paths.graphRoot, { recursive: true });
    await writeFile(path.join(paths.graphRoot, 'graph.json'), JSON.stringify({ directed: true, nodes: [], links }), 'utf8');
    const adapter = (options: { nodeCap?: number; edgeCap?: number } = {}) => {
      const graph=new GraphifyAdapter(paths,{pythonPath:'unused',bridgePath:'unused',...options});
      // This fixture owns a synthetic graph to isolate traversal budgets; installation and index
      // readiness are verified by memory-graphify-adapter and memory-strict-readiness suites.
      vi.spyOn(graph,'ensureFresh').mockResolvedValue({healthy:true,checkedAt:Date.now()});
      return graph;
    };

    // Every spoke is one hop from the hub, so the only reason to see fewer is the cap.
    const capped = await adapter().queryRelated(['hub'], 1000);
    expect(capped.size).toBe(1000);
    expect(capped.truncated).toBe(true);
    expect([...capped.keys()].every((id) => id.startsWith('spoke-'))).toBe(true);

    const roomy = await adapter().queryRelated(['hub'], spokes + 100);
    expect(roomy.size).toBe(spokes);
    expect(roomy.truncated).toBe(false);

    // The configured node cap binds even when the caller asks for more; the edge cap binds on its own.
    const configuredNodeCap = await adapter({ nodeCap: 10 }).queryRelated(['hub'], 5000);
    expect(configuredNodeCap.size).toBe(10);
    expect(configuredNodeCap.truncated).toBe(true);
    const configuredEdgeCap = await adapter({ edgeCap: 25 }).queryRelated(['hub'], 5000);
    expect(configuredEdgeCap.size).toBe(25);
    expect(configuredEdgeCap.truncated).toBe(true);
  });

  it('reports the same counters a full vault re-parse would, before and after a tombstone', async () => {
    const paths = await vaultPaths('segment-index-counts');
    const repo = new FileNativeMemoryRepository(paths);
    const first = await repo.commit({ scope, canonicalKey: 'coding:counted-one', kind: 'observation', value: 'One.' });
    const second = await repo.commit({ scope, canonicalKey: 'coding:counted-two', kind: 'observation', value: 'Two.' });
    await repo.addExplicitRelation({ scope, fromMemoryId: first.memoryId, toMemoryId: second.memoryId, relation: 'validated_by', reasonCode: 'TEST' });

    const rescan = async () => {
      const scan = await repo.scanSegments();
      let active = 0, tombstones = 0, edges = 0;
      for (const segment of scan.segments) {
        if (!segmentInScope(paths, segment, scope)) continue;
        for (const entry of segment.entries) {
          if (entry.state === 'active') active += 1;
          if (entry.state === 'tombstoned') tombstones += 1;
          edges += entry.relations.length;
        }
      }
      return { active, tombstones, edges, segments: scan.segments.length };
    };

    expect(await repo.counts(scope)).toMatchObject(await rescan());
    await repo.tombstoneMemory(scope, first.memoryId, 'retired');
    const after = await rescan();
    expect(after.tombstones).toBe(1);
    expect(await repo.counts(scope)).toMatchObject(after);
  });
});
