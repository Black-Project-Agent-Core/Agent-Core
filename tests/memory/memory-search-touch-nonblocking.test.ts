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

function record(id: string): MemoryRecordV2 {
  return { version: 2, id, title: id, content: `automobile ${id}`, keywords: [], context: 'General', tags: [],
    category: 'state', links: [], createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    lastAccessedAt: null, retrievalCount: 0, evolutionHistory: [], pinned: false,
    provenance: { workspace: 'agent-core', files: [] }, experience: { ...legacyExperience(), epistemic: 'fact' } };
}

class NullEmbedder implements MemoryEmbedder {
  identity = { provider: 'synthetic', model: 'touch-nonblocking-v1', dimensions: 1 };
  async embedDocuments(texts: string[]): Promise<number[][]> { return texts.map(() => [1]); }
}

async function serviceFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-touch-nonblocking-'));
  roots.push(root);
  const paths = resolveMemoryPaths(root, root);
  await writeFile(paths.bootstrap, '# Agent Core Memory Foundation\n');
  const service = await MemoryService.initialize(root, root, new NullEmbedder(), { experience: { enabled: true } });
  owners.push(service);
  const records = [record('vehicle-a'), record('vehicle-b')];
  const internal = service as any;
  await internal.store.transact([], ({ records: existing }: { records: MemoryRecord[] }) => ({
    records: [...existing, ...records], touchedIds: records.map(row => row.id), stateWrites: [], result: null,
  }));
  await internal.reload();
  return { service, internal };
}

/** Guards src/memory/service.ts search(): touch() must be fired, not awaited, so one slow
 * full-store mutate() never blocks the search response (see commit 7db5946). */
it('returns search results without waiting for the per-result touch() write to settle', async () => {
  const { service, internal } = await serviceFixture();
  const gate = new Promise<MemoryRecord>(() => { /* never resolves for the life of this test */ });
  vi.spyOn(internal, 'touch').mockReturnValue(gate);

  const searchPromise = service.search('automobile', { limit: 5 });
  const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 1000));
  const winner = await Promise.race([searchPromise, timeout]);

  expect(winner).not.toBe('timeout');
  const results = winner as Awaited<ReturnType<typeof service.search>>;
  expect(results.length).toBeGreaterThan(0);
  expect(internal.touch).toHaveBeenCalled();
});
