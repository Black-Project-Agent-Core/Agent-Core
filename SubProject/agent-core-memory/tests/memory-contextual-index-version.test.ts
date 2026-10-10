import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEmbedder } from '../src/memory/embedder.js';
import { legacyExperience } from '../src/memory/experience-types.js';
import { MemoryIndex } from '../src/memory/index.js';
import { serializeCanonicalNote } from '../src/memory/note-format.js';
import { resolveMemoryPaths } from '../src/memory/paths.js';
import { searchMemories } from '../src/memory/retrieval.js';
import { SEMANTIC_DOCUMENT_VERSION, buildSemanticDocument } from '../src/memory/semantic-document.js';
import { MemoryService } from '../src/memory/service.js';
import type { MemoryRecord } from '../src/memory/types.js';

const atomicFault = vi.hoisted(() => ({ destination: '' }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: async (...args: Parameters<typeof actual.rename>) => {
    if (String(args[1]) === atomicFault.destination) throw new Error('synthetic interrupted index rename');
    return actual.rename(...args);
  } };
});

const NOW = '2026-10-09T12:00:00.000Z';
const roots: string[] = [];
class FakeEmbedder implements MemoryEmbedder {
  readonly identity = { provider: 'synthetic', model: 'contextual-v1', dimensions: 3 };
  calls: string[][] = [];
  mode: 'good' | 'fail' | 'dimension' | 'partial' = 'good';
  async embedDocuments(texts: string[]): Promise<number[][]> {
    this.calls.push([...texts]);
    if (this.mode === 'fail') throw new Error('synthetic provider unavailable');
    if (this.mode === 'partial') return [];
    if (this.mode === 'dimension') return texts.map(() => [1, 0]);
    return texts.map(text => text.includes('Nebula') ? [1, 0, 0] : [0, 1, 0]);
  }
}
function record(id = 'target', patch: Partial<MemoryRecord> = {}): MemoryRecord {
  return { version: 1, id, title: id === 'target' ? 'Nebula Adapter' : 'Lunar Archive',
    content: `${id} durable fact`, keywords: ['penghubung-nebula'], context: 'General', tags: [],
    category: 'Uncategorized', links: [], createdAt: NOW, updatedAt: NOW,
    lastAccessedAt: null, retrievalCount: 0, evolutionHistory: [], pinned: false, ...patch } as MemoryRecord;
}
function oldFingerprint(record: MemoryRecord): string {
  return createHash('sha256').update(JSON.stringify({ id: record.id, content: record.content,
    keywords: record.keywords, context: record.context, tags: record.tags, category: record.category,
    ...(record.version === 2 ? { experience: record.experience } : {}) })).digest('hex');
}
function oldFile(records: MemoryRecord[], embedder: FakeEmbedder) {
  return { version: 2, builtAt: NOW, embedder: embedder.identity,
    entries: records.map(record => ({ id: record.id, fingerprint: oldFingerprint(record),
      semanticText: record.content, embedding: [0, 0, 1] })).sort((a, b) => a.id.localeCompare(b.id)) };
}
async function fixture(records = [record(), record('unchanged')]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-contextual-index-')); roots.push(root);
  const paths = resolveMemoryPaths(root, root);
  await mkdir(paths.notes, { recursive: true });
  await mkdir(paths.index, { recursive: true });
  await writeFile(paths.bootstrap, '# Synthetic Agent Core foundational memory\n');
  for (const record of records) await writeFile(path.join(paths.notes, `${record.id}.md`), serializeCanonicalNote(record));
  const embedder = new FakeEmbedder();
  return { root, paths, records, embedder, index: new MemoryIndex(paths, embedder), file: path.join(paths.index, 'index.json') };
}
async function canonicalDigests(root: string) {
  const names = ['00-agent-core-memory.md', ...(await readdir(path.join(root, 'notes'))).map(name => path.join('notes', name))].sort();
  return Promise.all(names.map(async name => ({ name, sha256: createHash('sha256').update(await readFile(path.join(root, name))).digest('hex') })));
}
async function stored(file: string) { return JSON.parse(await readFile(file, 'utf8')); }
afterEach(async () => {
  atomicFault.destination = '';
  vi.useRealTimers();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('contextual index version and cache invalidation', () => {
  it('re-embeds only a title-edited record and persists its new fingerprint and text', async () => {
    const { index, records, embedder, file } = await fixture();
    await index.ensure(records);
    const before = await stored(file);
    embedder.calls = [];
    const edited = [{ ...records[0], title: 'Nebula Relay' }, records[1]] as MemoryRecord[];
    expect(await index.inspect(edited)).toMatchObject({ index: 'degraded', embedding: 'degraded' });
    await index.ensure(edited);
    const after = await stored(file);
    expect(embedder.calls).toEqual([[buildSemanticDocument(edited[0])]]);
    expect(after.entries.find((entry: any) => entry.id === 'target').fingerprint).not.toBe(before.entries.find((entry: any) => entry.id === 'target').fingerprint);
    expect(after.entries.find((entry: any) => entry.id === 'target').semanticText).toContain('title: Nebula Relay');
    expect(after.version).toBe(3);
    expect(after.semanticDocumentVersion).toBe(SEMANTIC_DOCUMENT_VERSION);
  });

  it('rejects old same-provider index format and rebuilds every document before accepting restart cache hits', async () => {
    const { index, records, embedder, file, paths, root } = await fixture();
    const before = await canonicalDigests(root);
    await writeFile(file, JSON.stringify(oldFile(records, embedder)));
    expect(await index.inspect(records)).toMatchObject({ index: 'degraded', embedding: 'degraded', indexWarning: 'Unsupported memory index format' });
    await expect(index.semanticContext('Nebula', records)).rejects.toThrow('Unsupported memory index format');
    expect(embedder.calls).toEqual([]);
    await index.ensure(records);
    expect(embedder.calls.flat().sort()).toEqual(records.map(buildSemanticDocument).sort());
    const next = await stored(file);
    expect(next).toMatchObject({ version: 3, semanticDocumentVersion: 2 });
    expect(next.entries.every((entry: any) => entry.embedding.join(',') !== '0,0,1')).toBe(true);
    embedder.calls = [];
    const restarted = new MemoryIndex(paths, embedder);
    expect(await restarted.ensure(records)).toMatchObject({ index: 'available', embedding: 'available' });
    expect(embedder.calls).toEqual([]);
    expect(await canonicalDigests(root)).toEqual(before);
  });

  it('rejects an unknown representation version and never relabels its vectors as current', async () => {
    const { index, records, embedder, file } = await fixture();
    await index.ensure(records);
    const old = await stored(file); old.semanticDocumentVersion = 999;
    await writeFile(file, JSON.stringify(old)); embedder.calls = [];
    expect(await index.inspect(records)).toMatchObject({ index: 'degraded', embedding: 'degraded' });
    await index.ensure(records);
    expect(embedder.calls.flat().sort()).toEqual(records.map(buildSemanticDocument).sort());
    expect((await stored(file)).semanticDocumentVersion).toBe(2);
  });

  for (const change of ['remove-title', 'keywords', 'experience'] as const) {
    it(`invalidates embeddings on ${change} while keeping access telemetry outside cache identity`, async () => {
      const target: MemoryRecord = { ...record(), version: 2, experience: legacyExperience() };
      const { index, embedder, file } = await fixture([target]);
      await index.ensure([target]); const before = await stored(file); embedder.calls = [];
      const accessed = { ...target, lastAccessedAt: NOW, retrievalCount: 25 };
      await index.ensure([accessed]); expect(embedder.calls).toEqual([]);
      const changed: MemoryRecord = change === 'remove-title' ? { ...accessed, title: undefined }
        : change === 'keywords' ? { ...accessed, keywords: ['new-canonical-alias'] }
        : { ...accessed, experience: { ...target.experience, retention: 'archive' } };
      await index.ensure([changed]);
      expect(embedder.calls).toEqual([[buildSemanticDocument(changed)]]);
      expect((await stored(file)).entries[0].fingerprint).not.toBe(before.entries[0].fingerprint);
    });
  }

  it('binds controller semantic revision to the actual index and document representation versions', async () => {
    const { index, records, file } = await fixture();
    await index.ensure(records);
    const context = await index.semanticContext('Nebula', records, [records[0]]);
    const data = await stored(file);
    const expected = `sha256:${createHash('sha256').update(JSON.stringify([
      'semantic-search/v2', 3, 'record', 2, data.embedder,
      data.entries.filter((entry: any) => entry.id === records[0].id)
        .map((entry: any) => [entry.id, entry.fingerprint, entry.embedding,
          entry.passages?.map((child: any) => [child.id, child.fingerprint, child.embedding ?? null, child.unavailableReason ?? null])]),
    ])).digest('hex')}`;
    expect(context?.revision).toBe(expected);
  });

  it('keeps the privacy allowlist when producing actual embedder inputs', async () => {
    const marker = 'PRIVATE_PATH_SENTINEL';
    const target: MemoryRecord = { ...record(), version: 2, experience: { ...legacyExperience(),
      verification: { status: 'unverified', evidence: [], method: marker } },
      source: { type: marker, ref: marker }, provenance: { repo: marker, workspace: marker,
        files: [marker], gitRef: marker, identity: { kind: 'directory', repositoryId: marker, worktreeId: marker },
        sourceSnapshot: { version: 1, observedAt: NOW, files: [{ path: marker, status: 'unavailable', reason: 'evidence-policy' }] } } };
    const { index, embedder } = await fixture([target]);
    await index.ensure([target]);
    expect(embedder.calls).toEqual([[buildSemanticDocument(target)]]);
    expect(embedder.calls.flat().join('\n')).not.toContain(marker);
  });

  it('builds the versioned lexical index when no embedding provider is configured', async () => {
    const { paths, records, file } = await fixture();
    const index = new MemoryIndex(paths);
    expect(await index.ensure(records)).toEqual({ index: 'available', embedding: 'not-configured' });
    expect(await stored(file)).toMatchObject({ version: 3, semanticDocumentVersion: 2, embedder: null });
    expect(await index.semanticContext('Nebula', records)).toBeNull();
  });
});

describe('contextual index rebuild fail-soft contract', () => {
  for (const mode of ['fail', 'dimension', 'partial'] as const) {
    it(`does not trust stale vectors after ${mode} and preserves canonical bytes and lexical retrieval`, async () => {
      const { root, records, index, embedder, file } = await fixture();
      const before = await canonicalDigests(root);
      await writeFile(file, JSON.stringify(oldFile(records, embedder))); embedder.mode = mode;
      const result = await index.ensure(records);
      expect(result).toMatchObject({ index: 'available', embedding: 'degraded' });
      expect((await stored(file)).entries.every((entry: any) => entry.embedding === undefined)).toBe(true);
      expect(await index.semanticContext('Nebula', records)).toBeNull();
      expect(searchMemories(records, 'Nebula Adapter', { rankingProfile: 'bm25', maxNeighbors: 0 })[0].record.id).toBe('target');
      expect(await canonicalDigests(root)).toEqual(before);
    });
  }

  it('rejects a corrupt index and repairs it from canonical records without touching canonical notes', async () => {
    const { root, records, index, file } = await fixture();
    const before = await canonicalDigests(root);
    await writeFile(file, '{broken');
    expect(await index.inspect(records)).toMatchObject({ index: 'degraded', embedding: 'degraded' });
    expect(await index.ensure(records)).toMatchObject({ index: 'available', embedding: 'available' });
    expect(await canonicalDigests(root)).toEqual(before);
  });

  it('leaves the previous derived file intact after an interrupted atomic rename and recovers on retry', async () => {
    const { root, records, index, file } = await fixture();
    await index.ensure(records); const previous = await readFile(file, 'utf8');
    const before = await canonicalDigests(root);
    const changed = [{ ...records[0], title: 'Nebula Relay' }, records[1]] as MemoryRecord[];
    atomicFault.destination = file;
    await expect(index.ensure(changed)).rejects.toThrow('synthetic interrupted index rename');
    expect(await readFile(file, 'utf8')).toBe(previous);
    expect(await index.inspect(changed)).toMatchObject({ index: 'degraded', embedding: 'degraded' });
    expect(await index.semanticContext('Nebula', changed)).toBeNull();
    expect((await readdir(path.dirname(file))).filter(name => name.endsWith('.tmp'))).toEqual([]);
    atomicFault.destination = '';
    expect(await index.ensure(changed)).toMatchObject({ index: 'available', embedding: 'available' });
    expect(await canonicalDigests(root)).toEqual(before);
  });

  it('uses bounded provider retries, reaches a terminal failed repair, then recovers on explicit rebuild', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
    const { root, records, index, embedder } = await fixture();
    const before = await canonicalDigests(root); embedder.mode = 'fail';
    await index.ensure(records);
    await index.ensure(records);
    expect(embedder.calls).toHaveLength(1);
    for (let attempt = 1; attempt < 6; attempt++) { vi.setSystemTime(Date.now() + 3_600_001); await index.ensure(records); }
    expect(embedder.calls).toHaveLength(6);
    expect(await index.repairSummary()).toMatchObject({ pending: 0, failed: records.length });
    vi.setSystemTime(Date.now() + 3_600_001); await index.ensure(records);
    expect(embedder.calls).toHaveLength(6);
    embedder.mode = 'good';
    expect(await index.rebuild(records)).toMatchObject({ index: 'available', embedding: 'available' });
    expect(await index.repairSummary()).toMatchObject({ pending: 0, failed: 0 });
    expect(await canonicalDigests(root)).toEqual(before);
  });

  it('proves startup ensure re-embeds the complete synthetic corpus when encountering format 2', async () => {
    const { root, records, embedder, file } = await fixture();
    const initial = await MemoryService.initialize(root, root);
    const corpus = await initial.list();
    expect(corpus.length).toBe(records.length + 1);
    const before = await canonicalDigests(root);
    await writeFile(file, JSON.stringify(oldFile(corpus, embedder)));
    const restarted = await MemoryService.initialize(root, root, embedder);
    expect(restarted.health()).toMatchObject({ canonicalStore: 'available', index: 'available', embedding: 'available' });
    expect(embedder.calls.flat().sort()).toEqual(corpus.map(buildSemanticDocument).sort());
    expect(await canonicalDigests(root)).toEqual(before);
  });
});
