import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeMemoryRoot, resolveMemoryPaths } from '../../../src/memory/facade.js';
import { searchMemories } from '../../../src/memory/retrieval.js';
import { memorySemanticRevision } from '../../../src/memory/disclosure.js';
import { serializeCanonicalNote } from '../../../src/memory/note-format.js';
import { notePath } from '../../../src/memory/facade.js';
import type { Budgeted, ExpansionPage, RecallPage } from '../../../src/memory/facade.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-disclosure-'));
  roots.push(root);
  const memory = await initializeMemoryRoot({ baseDir: root });
  const session = () => memory.controller({ workspaceKey: 'agent-core', taskId: 'task-fixture', controllerId: 'controller-a' });
  return { root, memory, session };
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

function data<T>(result: Budgeted<T>): T {
  expect(result.status).not.toBe('insufficient-budget');
  if (result.status === 'insufficient-budget') throw new Error('fixture expected data');
  return result.data;
}
function budget(result: Budgeted<unknown>, max: number) {
  const json = JSON.stringify(result);
  expect(Buffer.byteLength(json)).toBeLessThanOrEqual(max);
  expect(result.metrics.payloadBytes).toBe(Buffer.byteLength(json));
  expect(result.metrics.estimatedTokens).toBe(Math.ceil(Array.from(json).length / 4));
  expect(result.metrics.tokenEstimator).toBe('unicode-codepoints/4-v1');
}

// Production changes that break these: returning raw records, measuring text
// instead of the envelope, trusting cursor claims, or reading latest on mismatch.
describe('controller compact disclosure E11–E13', () => {
  it('exports a compact-first v1 facade and conservative capabilities', async () => {
    const { session } = await fixture();
    expect(session().capabilities()).toEqual({ contractVersion: 1, views: ['map', 'abstract', 'record'],
      budgets: { defaultBytes: 8192, minBytes: 512, maxBytes: 65536 }, writeMode: 'legacy-read', temporalAsOf: false, advisory: true });
  });

  it('returns only serializable hit DTOs with bounded deterministic previews', async () => {
    const { memory, session } = await fixture();
    const saved = await memory.remember({ title: 'Unicode fixture', content: 'needle ' + '🚀漢字é'.repeat(2000),
      tags: ['metadata '.repeat(1000)], context: 'long context '.repeat(1000),
      provenance: { workspace: 'agent-core', files: [] } });
    const result = await session().recall({ query: 'needle', limit: 1 });
    budget(result, 8192);
    const hit = data(result).hits[0]!;
    expect(hit.id).toBe(saved.id);
    expect(Array.from(hit.abstract!).length).toBe(240);
    expect(hit.availableViews).toEqual(['record']);
    expect(hit).toMatchObject({ retention: 'durable', epistemic: 'unknown', temporal: 'unknown', verification: 'unverified', applicability: 'unknown', freshness: 'unknown' });
    expect(JSON.stringify(result)).not.toContain(saved.content);
    expect(JSON.stringify(result)).not.toContain(saved.context);
    expect(Object.keys(hit).sort()).toEqual(['abstract','excerpt','applicability','availableViews','epistemic','freshness','id','retention','retrievalEvidence','revision','score','temporal','title','verification'].sort());
  });

  it('uses map without body when query is omitted or map is requested', async () => {
    const { memory, session } = await fixture();
    const saved = await memory.remember({ title: 'A map title', content: 'map body must stay unopened', provenance: { workspace: 'agent-core', files: [] } });
    const hit = data(await session().recall()).hits.find(hit => hit.id === saved.id)!;
    expect(hit.abstract).toBeUndefined();
    const queried = data(await session().recall({ query: 'map body', view: 'map', limit: 1 }));
    expect(queried.hits[0]!.abstract).toBeUndefined();
    expect(JSON.stringify(queried)).not.toContain(saved.content);
    await expect(session().recall({ view: 'abstract' })).rejects.toMatchObject({ code: 'MEMORY_INPUT_INVALID' });
  });

  it.each(['ASCII "\\'.repeat(80), '漢🚀é'.repeat(120)])('honors final UTF-8 budget and explicitly overflows at 512: %s', async content => {
    const { memory, session } = await fixture();
    await memory.remember({ title: 'title '.repeat(1000), content: 'budget needle ' + content, provenance: { workspace: 'agent-core', files: [] } });
    const result = await session().recall({ query: 'budget needle', limit: 1, budget: { maxBytes: 512 } });
    expect(result.status).toBe('insufficient-budget');
    if (result.status === 'insufficient-budget') expect(result.requiredBytes).toBeGreaterThan(512);
    budget(result, 512);
    // Exact excerpt text plus its backward-compatible abstract alias are both
    // counted. A 6,000-character title is preserved rather than trimmed to fit.
    const roomy = await session().recall({ query: 'budget needle', limit: 1, budget: { maxBytes: 65536 } });
    expect(roomy.status).not.toBe('insufficient-budget');
    budget(roomy, 65536);
  });

  it('keeps exact IDs and whole long titles when a hit cannot fit, instead of silently trimming them', async () => {
    const { memory, session } = await fixture();
    const saved = await memory.remember({ title: 'critical-id MEMORY_REVISION_CONFLICT '.repeat(500), content: 'mandatory needle', provenance: { workspace: 'agent-core', files: [] } });
    const small = await session().recall({ query: 'mandatory needle', limit: 1 });
    expect(small.status).toBe('insufficient-budget');
    const large = data(await session().recall({ query: 'mandatory needle', limit: 1, budget: { maxBytes: 65536 } }));
    expect(large.hits[0]!.id).toBe(saved.id);
    expect(large.hits[0]!.title).toBe(saved.title);
  });

  it('pages every candidate beyond legacy top50 without loss or duplicates', async () => {
    const { root, memory, session } = await fixture();
    const operations = Array.from({ length: 61 }, (_, n) => ({ op: 'remember' as const, id: `candidate-${n.toString().padStart(3,'0')}`,
      value: { title: `candidate ${n}`, content: `paging needle unique ${n}`, provenance: { workspace: 'agent-core', files: [] } } }));
    await memory.batch(operations);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await session().recall({ query: 'paging needle', limit: 7, cursor });
      budget(result, 8192);
      const page = data(result);
      ids.push(...page.hits.map(hit => hit.id));
      cursor = page.nextCursor;
      if (cursor) expect(result.status).toBe('partial');
    } while (cursor);
    const ledger = (await readFile(path.join(resolveMemoryPaths(root).state, 'retrieval-ledger.jsonl'), 'utf8')).trim().split('\n').map(row => JSON.parse(row));
    expect(ledger[0].candidateCount).toBe(61);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter(id => id.startsWith('candidate-')).sort()).toEqual(operations.map(op => op.id).sort());
  });

  it('keeps paged rank order stable when the current recency clock advances', async () => {
    const { root, memory, session } = await fixture();
    await memory.batch(['aaa-old','zzz-new'].map(id => ({ op: 'remember' as const, id,
      value: { content: `clock paging needle ${id}`, provenance: { workspace: 'agent-core', files: [] } } })));
    const old = (await memory.read('aaa-old', false))!;
    await writeFile(notePath(resolveMemoryPaths(root), old.id), serializeCanonicalNote({ ...old, updatedAt: '2000-01-01T00:00:00.000Z' }));
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const first = data(await session().recall({ query: 'clock paging needle', limit: 1 }));
    expect(first.hits[0]!.id).toBe('zzz-new');
    clock.mockReturnValue(now + 2 * 366 * 86_400_000);
    const second = data(await session().recall({ query: 'clock paging needle', limit: 1, cursor: first.nextCursor }));
    expect(second.hits[0]!.id).toBe('aaa-old');
  });

  it('binds cursors to the actual query, view and semantic snapshot', async () => {
    const { memory, session } = await fixture();
    await memory.batch([1,2].map(n => ({ op: 'remember' as const, value: { content: `cursor needle ${n}`, provenance: { workspace: 'agent-core', files: [] } } })));
    const first = data(await session().recall({ query: 'cursor needle', limit: 1 }));
    expect(first.nextCursor).toBeTruthy();
    await expect(session().recall({ query: 'different query', limit: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'MEMORY_CURSOR_STALE' });
    await expect(session().recall({ query: 'cursor needle', view: 'map', limit: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'MEMORY_CURSOR_STALE' });
    await memory.read(first.hits[0]!.id); // access-only mutation is not a semantic revision
    expect(data(await session().recall({ query: 'cursor needle', limit: 1, cursor: first.nextCursor })).hits.length).toBe(1);
    await memory.update(first.hits[0]!.id, { title: 'metadata-only correction' });
    await expect(session().recall({ query: 'cursor needle', limit: 1, cursor: first.nextCursor })).rejects.toMatchObject({ code: 'MEMORY_CURSOR_STALE' });
    await expect(session().recall({ query: 'cursor needle', cursor: 'invalid' })).rejects.toMatchObject({ code: 'MEMORY_CURSOR_INVALID' });
  });

  it('expands only the selected exact source and reassembles Unicode-safe pages', async () => {
    const { root, memory, session } = await fixture();
    const saved = await memory.remember({ title: 'exact source', content: 'expand needle ' + '🚀漢é "\\'.repeat(500), provenance: { workspace: 'agent-core', files: [] } });
    const unopened = await memory.remember({ content: 'UNOPENED PRIVATE SYNTHETIC BODY', provenance: { workspace: 'agent-core', files: [] } });
    const hit = data(await session().recall({ query: 'expand needle', limit: 1 })).hits[0]!;
    const source = { kind: 'memory' as const, id: hit.id, revision: hit.revision };
    const pages: ExpansionPage[] = [];
    let cursor: string | undefined;
    do {
      const result = await session().expand({ source, view: 'record', cursor, budget: { maxBytes: 1200 } });
      budget(result, 1200);
      const page = data(result);
      expect(page.source).toEqual(source);
      expect(page.sourceRefs).toEqual([]);
      expect(page.offset).toBe(pages.reduce((sum,p) => sum + Array.from(p.text).length, 0));
      expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(page.text)).toBe(false);
      pages.push(page); cursor = page.nextCursor;
    } while (cursor);
    const text = pages.map(page => page.text).join('');
    const expanded = JSON.parse(text);
    expect(expanded.content).toBe(saved.content);
    expect(expanded.title).toBe(saved.title);
    expect(text).not.toContain(unopened.content);
    expect(pages.at(-1)!.totalCodePoints).toBe(Array.from(text).length);
    expect((await memory.read(saved.id, false))!.retrievalCount).toBe(0);
    const rows = (await readFile(path.join(resolveMemoryPaths(root).state, 'retrieval-ledger.jsonl'), 'utf8')).trim().split('\n').map(row => JSON.parse(row));
    const expansions = rows.filter(row => row.surface === 'memory_expand');
    expect(expansions).toHaveLength(pages.length);
    expect(pages.at(-1)!.offset).toBeGreaterThan(0);
    expect(expansions.at(-1).exposures[0].disposition).toBe('trimmed');
    expect(expansions.every(row => row.exposures[0].disposition === 'trimmed')).toBe(true);
  });

  it('fails exact revision expansion after body or metadata changes, never returning latest', async () => {
    const { memory, session } = await fixture();
    const saved = await memory.remember({ content: 'revision needle', provenance: { workspace: 'agent-core', files: [] } });
    const hit = data(await session().recall({ query: 'revision needle', limit: 1 })).hits[0]!;
    const input = { source: { kind: 'memory' as const, id: hit.id, revision: hit.revision }, view: 'record' as const };
    await memory.read(saved.id);
    expect(data(await session().expand(input)).source.revision).toBe(hit.revision);
    await memory.update(saved.id, { tags: ['new applicability'] });
    await expect(session().expand(input)).rejects.toMatchObject({ code: 'MEMORY_REVISION_CONFLICT' });
  });

  it('validates actual source/revision/position even when the cursor integrity checksum is recomputed', async () => {
    const { memory, session } = await fixture();
    const first = await memory.remember({ content: 'first continuation needle ' + '🚀'.repeat(2000), provenance: { workspace: 'agent-core', files: [] } });
    const second = await memory.remember({ content: 'second continuation needle ' + '漢'.repeat(2000), provenance: { workspace: 'agent-core', files: [] } });
    const hits = data(await session().recall({ query: 'continuation needle', limit: 2 })).hits;
    const source = { kind: 'memory' as const, id: first.id, revision: hits.find(hit => hit.id === first.id)!.revision };
    const other = { kind: 'memory' as const, id: second.id, revision: hits.find(hit => hit.id === second.id)!.revision };
    const page = data(await session().expand({ source, view: 'record', budget: { maxBytes: 1200 } }));
    expect(page.nextCursor).toBeTruthy();
    await expect(session().expand({ source: other, view: 'record', cursor: page.nextCursor })).rejects.toMatchObject({ code: 'MEMORY_CURSOR_STALE' });
    const parts = JSON.parse(Buffer.from(page.nextCursor!, 'base64url').toString('utf8'));
    parts[4] = page.totalCodePoints + 1;
    parts[parts.length - 1] = createHash('sha256').update(JSON.stringify(parts.slice(0,-1))).digest('base64url');
    const tampered = Buffer.from(JSON.stringify(parts)).toString('base64url');
    await expect(session().expand({ source, view: 'record', cursor: tampered })).rejects.toMatchObject({ code: 'MEMORY_CURSOR_STALE' });
    await memory.update(first.id, { content: 'changed revision after first page' });
    await expect(session().expand({ source, view: 'record', cursor: page.nextCursor })).rejects.toMatchObject({ code: 'MEMORY_REVISION_CONFLICT' });
  });

  it('budgets minimum expansion envelopes explicitly and records no full exposure on overflow', async () => {
    const { root, memory, session } = await fixture();
    await memory.remember({ content: 'minimum expansion needle ' + '🚀'.repeat(500), provenance: { workspace: 'agent-core', files: [] } });
    const hit = data(await session().recall({ query: 'minimum expansion needle', limit: 1 })).hits[0]!;
    const result = await session().expand({ source: { kind: 'memory', id: hit.id, revision: hit.revision }, view: 'record', budget: { maxBytes: 512 } });
    expect(result.status).toBe('insufficient-budget'); budget(result, 512);
    const rows = (await readFile(path.join(resolveMemoryPaths(root).state, 'retrieval-ledger.jsonl'), 'utf8')).trim().split('\n').map(row => JSON.parse(row));
    expect(rows.at(-1)).toMatchObject({ surface: 'memory_expand', selectedCount: 0, disclosureView: 'record', exposures: [expect.objectContaining({ disposition: 'dropped', handoffStatus: 'not-attempted' })] });
  });

  it('keeps legacy top50 selection unchanged while the facade pages the complete ranking', async () => {
    const { memory } = await fixture();
    await memory.batch(Array.from({ length: 61 }, (_, n) => ({ op: 'remember' as const, id: `legacy-limit-${n}`,
      value: { content: `legacy limit needle ${n}`, provenance: { workspace: 'agent-core', files: [] } } })));
    const legacy = await memory.search('legacy limit needle', { limit: 100, maxNeighbors: 0, budgetChars: 100000 });
    expect(legacy).toHaveLength(50);
    expect(legacy.every(item => typeof item.record.content === 'string')).toBe(true);
  });

  it('preserves the legacy per-candidate recency clock when no facade clock is supplied', async () => {
    const { memory } = await fixture();
    const saved = await Promise.all(['aaa','bbb'].map(n => memory.remember({ content: `legacy recency needle ${n}` })));
    const records = saved.map(record => ({ ...record, updatedAt: '1970-01-01T00:00:00.000Z' }));
    let ticks = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => ++ticks * 100 * 86_400_000);
    const results = searchMemories(records, 'legacy recency needle', { limit: 2, maxNeighbors: 0 });
    expect(results).toHaveLength(2);
    expect(results[0]!.components.recency).toBeGreaterThan(results[1]!.components.recency);
  });

  it('does not mark a v1 record conflicted by inactive relationship metadata', async () => {
    const { memory, session } = await fixture();
    const saved = await memory.remember({ content: 'inactive conflict needle', provenance: { workspace: 'agent-core', files: [] } });
    await memory.remember({ content: 'expired relationship holder', provenance: { workspace: 'agent-core', files: [] },
      links: [{ targetId: saved.id, type: 'contradicts', strength: 1, validTo: '2001-01-01T00:00:00.000Z' }] });
    expect(data(await session().recall({ query: 'inactive conflict needle', limit: 1 })).hits[0]!.applicability).toBe('unknown');
  });

  it('reports actual exposure view, final payload digest and receipt-compatible evidence in ledger', async () => {
    const { root, memory, session } = await fixture();
    await memory.remember({ content: 'ledger needle ' + 'details '.repeat(100), provenance: { workspace: 'agent-core', files: [] } });
    const result = await session().recall({ query: 'ledger needle', limit: 1 });
    const hit = data(result).hits[0]!;
    const rows = (await readFile(path.join(resolveMemoryPaths(root).state, 'retrieval-ledger.jsonl'), 'utf8')).trim().split('\n').map(row => JSON.parse(row));
    const attempt = rows.find(row => row.attemptId === hit.retrievalEvidence.attemptId)!;
    expect(attempt.surface).toBe('memory_recall');
    expect(attempt.disclosureView).toBe('abstract');
    expect(attempt.payloadBytes).toBe(Buffer.byteLength(JSON.stringify(result)));
    expect(attempt.payloadDigest).toBe('sha256:' + createHash('sha256').update(JSON.stringify(result)).digest('hex'));
    expect(attempt.exposures).toEqual([expect.objectContaining({ memoryId: hit.id, contentDigest: hit.retrievalEvidence.contentDigest, disposition: 'trimmed', handoffStatus: 'returned-to-controller' })]);
    expect(hit.revision).not.toBe(hit.retrievalEvidence.contentDigest);
  });

  it('fails closed when visibility state is unavailable', async () => {
    const { root, memory, session } = await fixture();
    await memory.remember({ content: 'invisible needle', provenance: { workspace: 'agent-core', files: [] } });
    await writeFile(path.join(resolveMemoryPaths(root).state, 'feedback.json'), '{broken');
    await expect(session().recall({ query: 'invisible needle' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
  });

  it.each(['recall', 'expand', 'restart-recall', 'restart-expand'])('fails closed on missing visibility after forget: %s', async operation => {
    const { root, memory, session } = await fixture();
    const saved = await memory.remember({ content: 'forgotten missing state needle', provenance: { workspace: 'agent-core', files: [] } });
    const hit = data(await session().recall({ query: 'forgotten missing state needle', limit: 1 })).hits[0]!;
    const source = { kind: 'memory' as const, id: saved.id, revision: hit.revision };
    await memory.lifecycle(saved.id, 'missing-state-forget', 'forget');
    expect(data(await session().recall({ query: 'forgotten missing state needle' })).hits.some(item => item.id === saved.id)).toBe(false);
    await expect(session().expand({ source, view: 'record' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
    const state = path.join(resolveMemoryPaths(root).state, 'feedback.json');
    const backup = state + '.test-backup';
    await rename(state, backup);
    try {
      const reader = operation.startsWith('restart-') ? await initializeMemoryRoot({ baseDir: root }) : memory;
      const controller = reader.controller({ workspaceKey: 'agent-core', taskId: 'task-fixture', controllerId: 'controller-b' });
      if (operation.endsWith('recall')) await expect(controller.recall({ query: 'forgotten missing state needle' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
      else await expect(controller.expand({ source, view: 'record' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
      expect(await readFile(state, 'utf8').catch(() => null)).toBeNull();
      // Preserve the documented v1 legacy API's fallback, even though the new
      // facade must refuse exposure when visibility evidence has gone missing.
      expect((await reader.search('forgotten missing state needle', { maxNeighbors: 0 })).some(item => item.record.id === saved.id)).toBe(true);
    } finally { await rename(backup, state); }
  });

  it('refuses existing notes with missing visibility before first facade use or restart', async () => {
    const { root, memory, session } = await fixture();
    const saved = await memory.remember({ content: 'legacy missing visibility needle', provenance: { workspace: 'agent-core', files: [] } });
    const state = path.join(resolveMemoryPaths(root).state, 'feedback.json');
    await rm(state, { force: true }); // a legacy root that never recorded visibility is indistinguishable from lost state
    await expect(session().recall({ query: 'legacy missing visibility needle' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
    const restarted = await initializeMemoryRoot({ baseDir: root });
    const controller = restarted.controller({ workspaceKey: 'agent-core', taskId: 'task-fixture', controllerId: 'controller-b' });
    await expect(controller.expand({ source: { kind: 'memory', id: saved.id, revision: memorySemanticRevision(saved) }, view: 'record' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
    expect(await readFile(state, 'utf8').catch(() => null)).toBeNull();
  });

  it('refuses corrupt visibility for expansion and restart without silently repairing it', async () => {
    const { root, memory, session } = await fixture();
    const saved = await memory.remember({ content: 'corrupt strict visibility needle', provenance: { workspace: 'agent-core', files: [] } });
    const state = path.join(resolveMemoryPaths(root).state, 'feedback.json');
    await writeFile(state, '{broken');
    const source = { kind: 'memory' as const, id: saved.id, revision: memorySemanticRevision(saved) };
    await expect(session().expand({ source, view: 'record' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
    const restarted = await initializeMemoryRoot({ baseDir: root });
    await expect(restarted.controller({ workspaceKey: 'agent-core', taskId: 'task-fixture', controllerId: 'controller-b' }).recall()).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
    expect(await readFile(state, 'utf8')).toBe('{broken');
  });

  it('does not overwrite corrupt visibility during a foundation-only restart', async () => {
    const { root } = await fixture();
    const state = path.join(resolveMemoryPaths(root).state, 'feedback.json');
    await writeFile(state, '{broken');
    const restarted = await initializeMemoryRoot({ baseDir: root });
    await expect(restarted.controller({ workspaceKey: 'agent-core', taskId: 'task-fixture', controllerId: 'controller-b' }).recall()).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
    expect(await readFile(state, 'utf8')).toBe('{broken');
  });

  it('fails closed on an unreadable visibility object without auto-repair', async () => {
    const { root, memory, session } = await fixture();
    const saved = await memory.remember({ content: 'unreadable visibility needle', provenance: { workspace: 'agent-core', files: [] } });
    const state = path.join(resolveMemoryPaths(root).state, 'feedback.json');
    const backup = state + '.test-backup';
    await rename(state, backup);
    await mkdir(state); // EISDIR reliably models an unreadable file even for privileged runners
    try {
      await expect(session().recall()).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
      await expect(session().expand({ source: { kind: 'memory', id: saved.id, revision: memorySemanticRevision(saved) }, view: 'record' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
    } finally {
      await rm(state, { recursive: true });
      await rename(backup, state);
    }
  });

  it('initializes legitimate empty visibility and preserves fresh/restart reads', async () => {
    const { root, memory, session } = await fixture();
    const state = await readFile(path.join(resolveMemoryPaths(root).state, 'feedback.json'), 'utf8').catch(() => null);
    expect(state).not.toBeNull();
    expect(JSON.parse(state!)).toEqual({ version: 1, records: [] });
    expect(data(await session().recall()).hits.some(hit => hit.id === 'agent-core-foundational')).toBe(true);
    const saved = await memory.remember({ content: 'fresh strict visibility needle', provenance: { workspace: 'agent-core', files: [] } });
    const restarted = await initializeMemoryRoot({ baseDir: root });
    const controller = restarted.controller({ workspaceKey: 'agent-core', taskId: 'task-fixture', controllerId: 'controller-b' });
    const hit = data(await controller.recall({ query: 'fresh strict visibility needle', limit: 1 })).hits[0]!;
    expect(hit.id).toBe(saved.id);
    const opened = await controller.expand({ source: { kind: 'memory', id: hit.id, revision: hit.revision }, view: 'record' });
    expect(opened.status).toBe('ok');
    expect(data(opened).offset).toBe(0);
    expect(JSON.parse(data(opened).text).content).toBe(saved.content);
    const rows = (await readFile(path.join(resolveMemoryPaths(root).state, 'retrieval-ledger.jsonl'), 'utf8')).trim().split('\n').map(row => JSON.parse(row));
    expect(rows.at(-1).exposures[0].disposition).toBe('selected');
  });

  it('returns a typed source error after canonical health becomes unavailable', async () => {
    const { root, memory, session } = await fixture();
    const saved = await memory.remember({ content: 'health failure needle', provenance: { workspace: 'agent-core', files: [] } });
    const hit = data(await session().recall({ query: 'health failure needle', limit: 1 })).hits[0]!;
    await rm(resolveMemoryPaths(root).bootstrap);
    await expect(session().recall()).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE' });
    await expect(session().expand({ source: { kind: 'memory', id: saved.id, revision: hit.revision }, view: 'record' })).rejects.toMatchObject({ code: 'MEMORY_SOURCE_UNAVAILABLE', message: 'MEMORY_SOURCE_UNAVAILABLE' });
  });

  it('rejects unsupported temporal/episode/evidence/write operations without store effects', async () => {
    const { memory, session } = await fixture();
    const before = await memory.list();
    await expect(session().recall({ asOf: '2020-01-01T00:00:00Z' })).rejects.toMatchObject({ code: 'MEMORY_TEMPORAL_UNSUPPORTED' });
    for (const operation of ['captureEvidence','startEpisode','appendEvent','checkpoint','getTaskContext','prepareConsolidation','applyConsolidation','setRetention','setEpisodeStatus'] as const) {
      await expect(session()[operation]({ arbitrary: 'not yet implemented' })).rejects.toMatchObject({ code: 'MEMORY_EXPERIENCE_NOT_ENABLED' });
    }
    await expect(session().expand({ source: { kind: 'episode', id: 'episode-not-existing', revision: 'sha256:' + '0'.repeat(64) }, view: 'episode' })).rejects.toMatchObject({ code: 'MEMORY_EXPERIENCE_NOT_ENABLED' });
    expect(await memory.list()).toEqual(before);
  });

  it('marks v1 archive-only and all retention coverage explicitly incomplete', async () => {
    const { session } = await fixture();
    const result = await session().recall({ retention: 'archive' });
    expect(result.status).toBe('partial');
    expect(data(result)).toMatchObject({ hits: [], archiveSearchAvailable: false, completeness: 'partial' });
    expect(result.warnings).toContain('archive-not-enabled');
    expect((await session().recall({ retention: 'all' })).warnings).toContain('archive-not-enabled');
  });

  it.each([511,65537,NaN,1000.5])('rejects invalid byte budgets %s', async maxBytes => {
    const { session } = await fixture();
    await expect(session().recall({ budget: { maxBytes } })).rejects.toMatchObject({ code: 'MEMORY_INPUT_INVALID' });
  });
});
