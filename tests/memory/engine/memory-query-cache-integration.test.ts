import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeMemoryRoot } from '../../../src/memory/initialize.js';
import { MemoryIndex } from '../../../src/memory/index.js';
import type { MemoryEmbedder } from '../../../src/memory/embedder.js';
import { legacyExperience } from '../../../src/memory/experience-types.js';
import { resolveMemoryPaths } from '../../../src/memory/paths.js';
import { DEFAULT_QUERY_CACHE_LIMITS, QueryEmbeddingCache } from '../../../src/memory/query-embedding-cache.js';
import { MemoryService } from '../../../src/memory/service.js';
import type { MemoryRecord, MemoryRecordV2 } from '../../../src/memory/types.js';

const QUERY = 'car';
const roots: string[] = [];
const owners: Array<{ dispose?: () => void }> = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) owner.dispose?.();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
function record(id: string, workspace = 'agent-core'): MemoryRecordV2 {
  return { version: 2, id, title: id, content: `automobile ${id}`, keywords: [], context: 'General', tags: [],
    category: 'state', links: [], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    lastAccessedAt: null, retrievalCount: 0, evolutionHistory: [], pinned: false,
    provenance: { workspace, files: [] }, experience: { ...legacyExperience(), epistemic: 'fact' } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function outcome<T>(promise: Promise<T>) {
  return promise.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
}
class Embedder implements MemoryEmbedder {
  identity = { provider: 'synthetic', model: 'cache-integration-v1', dimensions: 3 };
  queries = 0;
  queryGate?: ReturnType<typeof deferred<number[]>>;
  queryVector = [1, 0, 0];
  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (texts.length === 1 && texts[0] === QUERY) {
      this.queries++;
      return [this.queryGate ? await this.queryGate.promise : this.queryVector.slice()];
    }
    return texts.map(text => text.includes('automobile') || text === ' car '
      ? Array.from({ length: this.identity.dimensions }, (_, i) => i === 0 ? 1 : 0)
      : Array.from({ length: this.identity.dimensions }, (_, i) => i === 1 ? 1 : 0));
  }
}
async function tempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-query-cache-integration-'));
  roots.push(root);
  return root;
}
async function indexFixture(enabled = true, granularity: 'record' | 'passage' = 'record', embedder = new Embedder()) {
  const root = await tempRoot();
  const paths = resolveMemoryPaths(root, root);
  const records: MemoryRecord[] = [record('allowed'), record('foreign', 'foreign-workspace'), record('other')];
  const limits = { ...DEFAULT_QUERY_CACHE_LIMITS };
  const index = new MemoryIndex(paths, embedder, { granularity, ...(enabled ? { queryCache: limits } : {}) });
  owners.push(index);
  await index.rebuild(records);
  return { root, paths, records, index, embedder, limits, file: path.join(paths.index, 'index.json') };
}
async function serviceFixture(enabled = true, factory: 'standalone' | 'direct' = 'standalone', granularity: 'record' | 'passage' = 'record') {
  const root = await tempRoot();
  const paths = resolveMemoryPaths(root, root);
  const embedder = new Embedder();
  const options = { experience: { enabled: true as const }, indexGranularity: granularity,
    ...(enabled ? { queryCache: { ...DEFAULT_QUERY_CACHE_LIMITS } } : {}) };
  let service: MemoryService;
  if (factory === 'standalone') service = await initializeMemoryRoot({ baseDir: root, memoryRoot: root, embedder, ...options });
  else {
    await writeFile(paths.bootstrap, '# Agent Core Memory Foundation\n');
    service = await MemoryService.initialize(root, root, embedder, options);
  }
  owners.push(service);
  const records = [record('allowed'), record('foreign', 'foreign-workspace'), record('other')];
  const internal = service as any;
  await internal.store.transact([], ({ records: existing }: { records: MemoryRecord[] }) => ({
    records: [...existing, ...records], touchedIds: records.map(row => row.id), stateWrites: [], result: null,
  }));
  await internal.reload();
  await internal.refreshIndex();
  const contexts: Array<Awaited<ReturnType<MemoryIndex['semanticContext']>>> = [];
  const original = internal.index.semanticContext.bind(internal.index);
  vi.spyOn(internal.index, 'semanticContext').mockImplementation(async (...args: unknown[]) => {
    const context = await original(...args); contexts.push(context); return context;
  });
  embedder.queries = 0;
  const session = service.controller({ workspaceKey: 'agent-core', taskId: 'cache-fixture', controllerId: 'fixture' });
  return { root, paths, service, internal, embedder, records, contexts, session };
}

// Execute the real host close closure with inert component owners. Importing the
// host entrypoint would start tracker/runtime setup; no server or private runtime
// is needed to verify this narrow shutdown wiring.
async function isolatedHostClose(experience?: { dispose: () => void }) {
  const source = await readFile(new URL('../../../src/index.ts', import.meta.url), 'utf8');
  const match = source.match(/close:\s*(async \(\) => \{[\s\S]*?)\n    \},\n  \};\n\}/);
  if (!match) throw new Error('Host close closure was not found');
  const arrow = `${match[1]}\n    }`
    .replace('const failures: string[]', 'const failures')
    .replace('async (name: string, operation: () => Promise<unknown>): Promise<void>', 'async (name, operation)');
  const tracker = { record: vi.fn(), captureFailure: vi.fn() };
  const legacy = { dispose: vi.fn() };
  const laterCleanup = vi.fn(async () => undefined);
  const bindings = { memoryRuntime: { service: legacy, experience }, activityTracker: tracker,
    artifactAuthorization: { shutdown: vi.fn() },
    managedBrowserUseRuntime: () => ({ close: async () => undefined }), config: { projectRoot: 'fixture' },
    mutationSafety: { beginDraining() {}, waitForDrain: async () => true, status: () => ({}) },
    workflows: { close: async () => undefined }, server: {}, closeServer: async () => undefined,
    browserControlService: { closeAll: async () => undefined }, terminalManager: { shutdownAll: async () => undefined },
    semanticIde: undefined, codeIntelligence: undefined, toolHistory: { cleanup: async () => undefined },
    configManager: { close: laterCleanup } };
  const close: () => Promise<void> = new Function(...Object.keys(bindings), `return (${arrow});`)(...Object.values(bindings));
  return { close, tracker, legacy, laterCleanup };
}

describe('host shutdown', () => {
  it('disposes_the_actual_experience_owner', async () => {
    const dispose = vi.fn();
    const host = await isolatedHostClose({ dispose });
    await host.close();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(host.legacy.dispose).not.toHaveBeenCalled();
    expect(host.laterCleanup).toHaveBeenCalledTimes(1);
  });

  it('legacy_mode_has_no_experience_disposal', async () => {
    const host = await isolatedHostClose();
    await host.close();
    expect(host.legacy.dispose).not.toHaveBeenCalled();
    expect(host.laterCleanup).toHaveBeenCalledTimes(1);
  });

  it('experience_disposal_failure_does_not_skip_other_cleanup', async () => {
    const host = await isolatedHostClose({ dispose: () => { throw new Error('synthetic disposal failure'); } });
    await host.close();
    expect(host.tracker.captureFailure).toHaveBeenCalledWith('SYSTEM', expect.any(Error),
      'service-stop-component-failure', { component: 'memory-experience' });
    expect(host.laterCleanup).toHaveBeenCalledTimes(1);
  });
});

describe('query cache index integration', () => {
  it.each([1e308, 1e-308])('normalizes_finite_extreme_passage_means_without_invalid_persistence_%s', async magnitude => {
    const { index, records, embedder } = await indexFixture(true, 'passage');
    const changed = [{ ...records[0], content: 'automobile ' + 'x'.repeat(1500) }, ...records.slice(1)];
    vi.spyOn(embedder, 'embedDocuments').mockImplementation(async texts => texts.map(() => [magnitude, 0, 0]));
    expect(await index.rebuild(changed)).toMatchObject({ embedding: 'available' });
    const loaded = await index.load();
    expect(loaded?.entries[0].passages!.length).toBeGreaterThan(1);
    for (const entry of loaded!.entries) expect(entry.embedding).toEqual([1, 0, 0]);
    const context = await index.semanticContext(QUERY, changed);
    expect(context).not.toBeNull();
    for (const score of context!.passageScores!.values()) expect(score.score).toBe(1);
  });

  it.each([true, false])('rejects_sparse_query_vectors_cache_%s', async enabled => {
    const { index, records, embedder } = await indexFixture(enabled);
    embedder.queryVector = new Array(embedder.identity.dimensions);
    await expect(index.semanticContext(QUERY, records)).rejects.toThrow('invalid dimensions or values');
  });

  it.each(['record', 'passage'] as const)('rejects_sparse_document_vectors_in_%s_mode', async granularity => {
    const { index, records, embedder, file } = await indexFixture(true, granularity);
    vi.spyOn(embedder, 'embedDocuments').mockImplementation(async texts => texts.map(() => new Array(embedder.identity.dimensions)));
    expect(await index.rebuild(records)).toMatchObject({ embedding: 'degraded' });
    const stored = JSON.parse(await readFile(file, 'utf8'));
    expect(stored.entries.every((entry: any) => entry.embedding === undefined
      && (entry.passages ?? []).every((child: any) => child.embedding === undefined))).toBe(true);
    expect(await index.semanticContext(QUERY, records)).toBeNull();
  });

  it('default_disabled_repeated_queries_keep_two_provider_calls', async () => {
    const { index, records, embedder } = await indexFixture(false);
    await index.semanticContext(QUERY, records);
    await index.semanticContext(QUERY, records);
    expect(embedder.queries).toBe(2);
  });

  it('opt_in_repeated_queries_use_one_provider_call', async () => {
    const { index, records, embedder } = await indexFixture();
    const first = await index.semanticContext(QUERY, records);
    const second = await index.semanticContext(QUERY, records);
    expect(first).toEqual(second);
    expect(embedder.queries).toBe(1);
  });

  it('twenty_warm_queries_preserve_current_context_with_one_call', async () => {
    const { index, records, embedder } = await indexFixture();
    const results = [];
    for (let i = 0; i < 20; i++) results.push(await index.semanticContext(QUERY, records, [records[0]]));
    expect(results.every(context => context?.vectors.size === 1 && context.vectors.has('allowed'))).toBe(true);
    expect(embedder.queries).toBe(1);
  });

  it('eight_concurrent_cold_queries_use_one_call', async () => {
    const { index, records, embedder } = await indexFixture();
    embedder.queryGate = deferred<number[]>();
    const waiters = Array.from({ length: 8 }, () => index.semanticContext(QUERY, records));
    try {
      await vi.waitFor(() => {
        if (embedder.queries > 1) return;
        expect((index as any).queryCache?.stats().joins).toBe(7);
      });
    } finally { embedder.queryGate.resolve([1, 0, 0]); }
    const results = await Promise.all(waiters);
    expect(results.every(context => context?.queryVector[0] === 1)).toBe(true);
    expect(embedder.queries).toBe(1);
  });

  it('same_labels_and_same_limits_object_never_share_between_owners', async () => {
    const first = await indexFixture();
    const secondEmbedder = new Embedder();
    secondEmbedder.queryVector = [0, 1, 0];
    const root = await tempRoot();
    const second = new MemoryIndex(resolveMemoryPaths(root, root), secondEmbedder, { queryCache: first.limits });
    owners.push(second);
    await second.rebuild(first.records);
    const a = await first.index.semanticContext(QUERY, first.records);
    const b = await second.semanticContext(QUERY, first.records);
    expect(a?.queryVector).toEqual([1, 0, 0]);
    expect(b?.queryVector).toEqual([0, 1, 0]);
    expect(first.embedder.queries).toBe(1);
    expect(secondEmbedder.queries).toBe(1);
  });

  it('copies_constructor_limits_and_each_returned_vector', async () => {
    const { index, records, embedder, limits } = await indexFixture();
    limits.maxEntries = 0;
    const first = await index.semanticContext(QUERY, records);
    first!.queryVector[0] = 99;
    const second = await index.semanticContext(QUERY, records);
    expect(second?.queryVector).toEqual([1, 0, 0]);
    expect(embedder.queries).toBe(1);
  });

  it('key_uses_exact_query_and_semantic_document_version_without_ranking_policy', async () => {
    const spy = vi.spyOn(QueryEmbeddingCache.prototype, 'getOrCreate');
    const { index, records } = await indexFixture();
    await index.semanticContext(' car ', records);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toEqual({ identity: { provider: 'synthetic', model: 'cache-integration-v1', dimensions: 3 },
      queryRepresentationVersion: 'embedDocuments-query/v1', documentRepresentationVersion: 'semantic-document/v2', query: ' car ' });
  });

  it.each(['changed-record', 'deleted-record', 'foreign-subset', 'empty-subset', 'duplicate-subset', 'corrupt-index',
    'changed-representation', 'no-vectors'] as const)('warm_cache_rechecks_%s_before_using_query_vector', async mode => {
    const { index, records, embedder, file } = await indexFixture();
    await index.semanticContext(QUERY, records, [records[0]]);
    let canonical = records;
    let eligible = [records[0]];
    if (mode === 'changed-record') canonical = [{ ...records[0], content: 'changed canonical text' }, ...records.slice(1)];
    if (mode === 'deleted-record') canonical = records.slice(1);
    if (mode === 'foreign-subset') eligible = [{ ...records[0], provenance: { workspace: 'changed-workspace', files: [] }, content: 'different' }];
    if (mode === 'empty-subset') eligible = [];
    if (mode === 'duplicate-subset') eligible = [records[0], records[0]];
    if (mode === 'corrupt-index') await writeFile(file, '{');
    if (mode === 'changed-representation' || mode === 'no-vectors') {
      const stored = JSON.parse(await readFile(file, 'utf8'));
      if (mode === 'changed-representation') stored.semanticDocumentVersion = 999;
      else for (const entry of stored.entries) delete entry.embedding;
      await writeFile(file, JSON.stringify(stored));
    }
    if (mode === 'corrupt-index' || mode === 'changed-representation') {
      await expect(index.semanticContext(QUERY, canonical, eligible)).rejects.toThrow();
    } else expect(await index.semanticContext(QUERY, canonical, eligible)).toBeNull();
    expect(embedder.queries).toBe(1);
  });

  it('updated_valid_corpus_reuses_query_only_and_returns_new_snapshot', async () => {
    const { index, records, embedder } = await indexFixture();
    const before = await index.semanticContext(QUERY, records);
    const changed = [{ ...records[0], content: 'a different unrelated document' }, ...records.slice(1)];
    await index.ensure(changed);
    const after = await index.semanticContext(QUERY, changed, [changed[0]]);
    expect(embedder.queries).toBe(1);
    expect(after?.revision).not.toBe(before?.revision);
    expect(after?.vectors.get('allowed')).toEqual([0, 1, 0]);
    expect([...after!.vectors.keys()]).toEqual(['allowed']);
  });

  it.each(['provider', 'model', 'dimensions'] as const)('identity_%s_change_rebuilds_and_misses_old_query_entry', async field => {
    const { index, records, embedder } = await indexFixture();
    await index.semanticContext(QUERY, records);
    if (field === 'dimensions') { embedder.identity.dimensions = 2; embedder.queryVector = [1, 0]; }
    else embedder.identity[field] += '-changed';
    expect(await index.semanticContext(QUERY, records)).toBeNull();
    await index.rebuild(records);
    expect((await index.semanticContext(QUERY, records))?.queryVector).toEqual(embedder.queryVector);
    expect(embedder.queries).toBe(2);
  });

  it('passage_mode_recomputes_child_scores_and_snapshot_after_parent_changes', async () => {
    const { index, records, embedder } = await indexFixture(true, 'passage');
    const before = await index.semanticContext(QUERY, records, [records[0]]);
    expect(before?.passageScores?.get('allowed')?.score).toBe(1);
    const changed = [{ ...records[0], content: 'different unrelated passage' }, ...records.slice(1)];
    await index.ensure(changed);
    const after = await index.semanticContext(QUERY, changed, [changed[0]]);
    expect(after?.passageScores?.get('allowed')?.score).toBe(0);
    expect(after?.revision).not.toBe(before?.revision);
    expect(after?.passageScores?.get('allowed')?.passageId).not.toBe(before?.passageScores?.get('allowed')?.passageId);
    expect(embedder.queries).toBe(1);
  });

  it.each([true, false])('one_cancelled_waiter_does_not_abort_other_queries_cache_%s', async enabled => {
    const { index, records, embedder } = await indexFixture(enabled);
    embedder.queryGate = deferred<number[]>();
    const controller = new AbortController();
    const cancelled = outcome(index.semanticContext(QUERY, records, undefined, { signal: controller.signal }));
    const survivor = index.semanticContext(QUERY, records);
    await vi.waitFor(() => enabled
      ? expect((index as any).queryCache.stats().joins).toBe(1)
      : expect(embedder.queries).toBe(2));
    controller.abort();
    expect((await cancelled).error).toMatchObject({ name: 'AbortError' });
    embedder.queryGate.resolve([1, 0, 0]);
    expect((await survivor)?.queryVector).toEqual([1, 0, 0]);
    expect(embedder.queries).toBe(enabled ? 1 : 2);
  });

  it('dispose_aborts_pending_query_and_prevents_future_query_embeddings', async () => {
    const { index, records, embedder } = await indexFixture();
    embedder.queryGate = deferred<number[]>();
    const pending = outcome(index.semanticContext(QUERY, records));
    await vi.waitFor(() => expect(embedder.queries).toBe(1));
    index.dispose();
    expect((await pending).error).toMatchObject({ name: 'AbortError' });
    embedder.queryGate.reject(new Error('synthetic late shutdown failure'));
    await expect(index.semanticContext(QUERY, records)).rejects.toMatchObject({ name: 'AbortError' });
    expect(embedder.queries).toBe(1);
  });

  it.each([true, false])('preaborted_query_skips_provider_cache_%s', async enabled => {
    const { index, records, embedder } = await indexFixture(enabled);
    const controller = new AbortController();
    controller.abort('synthetic reason');
    await expect(index.semanticContext(QUERY, records, undefined, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(embedder.queries).toBe(0);
  });

  it('config_replacement_clears_old_generations_even_when_labels_return', async () => {
    const { index, records, embedder } = await indexFixture();
    await index.semanticContext(QUERY, records);
    const model = embedder.identity.model;
    embedder.identity.model = model + '-replacement';
    await index.rebuild(records);
    await index.semanticContext(QUERY, records);
    embedder.identity.model = model;
    embedder.queryVector = [0, 1, 0];
    await index.rebuild(records);
    expect((await index.semanticContext(QUERY, records))?.queryVector).toEqual([0, 1, 0]);
    expect(embedder.queries).toBe(3);
  });

  it('observed_identity_change_invalidates_cache_even_with_an_incompatible_index', async () => {
    const { index, records, embedder } = await indexFixture();
    await index.semanticContext(QUERY, records);
    const model = embedder.identity.model;
    embedder.identity.model = model + '-replacement';
    expect(await index.semanticContext(QUERY, records)).toBeNull();
    embedder.identity.model = model;
    embedder.queryVector = [0, 1, 0];
    expect((await index.semanticContext(QUERY, records))?.queryVector).toEqual([0, 1, 0]);
    expect(embedder.queries).toBe(2);
  });
});

describe('query cache service forwarding and current trust', () => {
  it.each([['standalone', 'record'], ['direct', 'record'], ['standalone', 'passage'], ['direct', 'passage']] as const)(
    '%s_factory_forwards_opt_in_limits_in_%s_mode', async (factory, granularity) => {
    const { service, embedder, paths } = await serviceFixture(true, factory, granularity);
    await service.search(QUERY, { workspace: 'agent-core' });
    await service.search(QUERY, { workspace: 'agent-core' });
    expect(embedder.queries).toBe(1);
    expect(JSON.parse(await readFile(path.join(paths.index, 'index.json'), 'utf8')).version).toBe(granularity === 'passage' ? 4 : 3);
  });

  it('service_default_disabled_keeps_two_calls', async () => {
    const { service, embedder } = await serviceFixture(false);
    await service.search(QUERY, { workspace: 'agent-core' });
    await service.search(QUERY, { workspace: 'agent-core' });
    expect(embedder.queries).toBe(2);
  });

  it('warm_query_preserves_cache_on_off_results_and_eligible_vectors', async () => {
    const cached = await serviceFixture();
    const uncached = await serviceFixture(false);
    const summarize = (rows: Awaited<ReturnType<MemoryService['search']>>) => rows.map(row => ({
      id: row.record.id, score: row.score, components: row.components,
    }));
    for (let i = 0; i < 2; i++) {
      const a = await cached.service.search(QUERY, { workspace: 'agent-core' });
      const b = await uncached.service.search(QUERY, { workspace: 'agent-core' });
      expect(summarize(a)).toEqual(summarize(b));
      expect(cached.contexts.at(-1)?.vectors.has('foreign')).toBe(false);
    }
    expect(cached.embedder.queries).toBe(1);
    expect(uncached.embedder.queries).toBe(2);
  });

  it.each(['forget', 'expire', 'workspace', 'delete', 'content'] as const)('warm_query_rechecks_current_%s', async change => {
    const { service, embedder, contexts, session, internal, paths } = await serviceFixture();
    await session.recall({ query: QUERY });
    expect(contexts.at(-1)?.vectors.has('allowed')).toBe(true);
    if (change === 'forget') await service.lifecycle('allowed', 'synthetic-forget', 'forget');
    if (change === 'expire') await service.update('allowed', { expiresAt: '2020-01-01T00:00:00.000Z' });
    if (change === 'workspace') await service.update('allowed', { provenance: { workspace: 'foreign-workspace', files: [] } });
    if (change === 'content') await service.update('allowed', { content: 'different unrelated material' });
    if (change === 'delete') {
      await rm(path.join(paths.notes, 'allowed.md'));
      await internal.reload(); await internal.refreshIndex();
    }
    const result: any = await session.recall({ query: QUERY });
    expect(contexts.at(-1)?.vectors.has('foreign')).toBe(false);
    if (change === 'content') expect(contexts.at(-1)?.vectors.get('allowed')).toEqual([0, 1, 0]);
    else {
      expect(contexts.at(-1)?.vectors.has('allowed')).toBe(false);
      expect(result.data.hits.map((row: any) => row.id)).not.toContain('allowed');
    }
    expect(embedder.queries).toBe(1);
  });

  it('warm_pagination_revalidates_cursor_and_scope', async () => {
    const { service, session, embedder, contexts } = await serviceFixture();
    const whole: any = await session.recall({ query: QUERY, limit: 20 });
    const first: any = await session.recall({ query: QUERY, limit: 1 });
    expect(first.data.nextCursor).toBeTruthy();
    const next: any = await session.recall({ query: QUERY, limit: 1, cursor: first.data.nextCursor });
    expect(next.data.hits[0].id).not.toBe(first.data.hits[0].id);
    expect(whole.data.hits.map((row: any) => row.id)).toContain(next.data.hits[0].id);
    expect(contexts.at(-1)?.vectors.has('foreign')).toBe(false);
    await expect(service.controller({ workspaceKey: 'foreign-workspace', taskId: 'cache-fixture', controllerId: 'other' })
      .recall({ query: QUERY, cursor: first.data.nextCursor })).rejects.toMatchObject({ code: 'MEMORY_SCOPE_MISMATCH' });
    await service.update('allowed', { content: 'changed canonical material' });
    await expect(session.recall({ query: QUERY, cursor: first.data.nextCursor })).rejects.toMatchObject({ code: 'MEMORY_CURSOR_STALE' });
    expect(embedder.queries).toBe(1);
  });

  it.each(['corrupt', 'no-vectors'] as const)('warm_controller_%s_index_never_returns_cached_semantic_context', async mode => {
    const { session, embedder, contexts, paths } = await serviceFixture();
    await session.recall({ query: QUERY });
    const file = path.join(paths.index, 'index.json');
    const stored = JSON.parse(await readFile(file, 'utf8'));
    for (const entry of stored.entries) delete entry.embedding;
    await writeFile(file, mode === 'corrupt' ? '{' : JSON.stringify(stored));
    const before = contexts.length;
    await session.recall({ query: QUERY });
    expect(contexts.slice(before).every(context => context === null)).toBe(true);
    expect(embedder.queries).toBe(1);
  });

  it('service_dispose_releases_owned_index_waiters', async () => {
    const { service, internal, embedder } = await serviceFixture();
    embedder.queryGate = deferred<number[]>();
    const records = [...internal.records.values()];
    const pending = outcome(internal.index.semanticContext(QUERY, records));
    await vi.waitFor(() => expect(embedder.queries).toBe(1));
    service.dispose();
    expect((await pending).error).toMatchObject({ name: 'AbortError' });
    embedder.queryGate.resolve([1, 0, 0]);
    await expect(internal.index.semanticContext(QUERY, records)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
