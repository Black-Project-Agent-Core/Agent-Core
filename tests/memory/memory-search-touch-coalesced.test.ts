import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { MemoryEmbedder } from '../../src/memory/embedder.js';
import { legacyExperience } from '../../src/memory/experience-types.js';
import { resolveMemoryPaths } from '../../src/memory/paths.js';
import { MemoryService } from '../../src/memory/service.js';
import type { MemoryRecord, MemoryRecordV2 } from '../../src/memory/types.js';

const roots: string[] = [];
const owners: Array<{ dispose?: () => void }> = [];
afterEach(async () => {
  for (const owner of owners.splice(0)) owner.dispose?.();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function record(id: string, category: MemoryRecordV2['category'] = 'state'): MemoryRecordV2 {
  return { version: 2, id, title: id, content: `automobile ${id}`, keywords: [], context: 'General', tags: [],
    category, links: [], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    lastAccessedAt: null, retrievalCount: 0, evolutionHistory: [], pinned: false,
    provenance: { workspace: 'agent-core', files: [] }, experience: { ...legacyExperience(), epistemic: 'fact' } };
}

class NullEmbedder implements MemoryEmbedder {
  identity = { provider: 'synthetic', model: 'touch-coalesced-v1', dimensions: 1 };
  async embedDocuments(texts: string[]): Promise<number[][]> { return texts.map(() => [1]); }
}

async function serviceFixture(ids: string[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-touch-coalesced-'));
  roots.push(root);
  const paths = resolveMemoryPaths(root, root);
  await writeFile(paths.bootstrap, '# Agent Core Memory Foundation\n');
  const service = await MemoryService.initialize(root, root, new NullEmbedder(), { experience: { enabled: true } });
  owners.push(service);
  const records = ids.map(id => record(id));
  const internal = service as any;
  await internal.store.transact([], ({ records: existing }: { records: MemoryRecord[] }) => ({
    records: [...existing, ...records], touchedIds: records.map(row => row.id), stateWrites: [], result: null,
  }));
  await internal.reload();
  return { service, internal };
}

/** Each touch is an O(store) commit under the memory lock (about 7 s on the production store). The recency
 * touches of one search must therefore share one commit instead of queueing N of them ahead of the next search. */
it('records the recency touches of one search in a single store commit', async () => {
  const { service, internal } = await serviceFixture(['vehicle-a', 'vehicle-b', 'vehicle-c']);
  const commit = vi.spyOn(internal.store.transactions, 'commit');

  const results = await service.search('automobile', { limit: 5 });
  expect(results.length).toBeGreaterThanOrEqual(3); // the pinned foundation record may rank too and is never touched
  const ids = ['vehicle-a', 'vehicle-b', 'vehicle-c'];
  const deadline = Date.now() + 15_000;
  const touched = async () => (await Promise.all(ids.map(id => service.read(id, false))))
    .filter(row => row!.retrievalCount === 1).length;
  while (Date.now() < deadline && await touched() < ids.length) await new Promise(resolve => setTimeout(resolve, 100));
  await new Promise(resolve => setTimeout(resolve, 600)); // let any extra commit show up before counting

  expect(await touched()).toBe(ids.length);
  expect(commit).toHaveBeenCalledTimes(1);
}, 40_000);

it('commits the records that can be touched and reports the ones that cannot', async () => {
  const { internal } = await serviceFixture(['vehicle-a', 'vehicle-b']);
  const commit = vi.spyOn(internal.store.transactions, 'commit');

  const outcome = await internal.store.mutateEach(['vehicle-a', 'vehicle-gone', 'vehicle-b'], (current: MemoryRecord, id: string) => {
    if (id === 'vehicle-b') throw new Error('MEMORY_REVISION_CONFLICT');
    return { ...current, retrievalCount: current.retrievalCount + 1 };
  });

  expect([...outcome.records.keys()]).toEqual(['vehicle-a']);
  expect(outcome.records.get('vehicle-a')!.retrievalCount).toBe(1);
  expect([...outcome.failures.keys()].sort()).toEqual(['vehicle-b', 'vehicle-gone']);
  expect(commit).toHaveBeenCalledTimes(1);
}, 40_000);
