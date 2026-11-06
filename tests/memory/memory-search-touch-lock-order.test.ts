import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { MemoryEmbedder } from '../../src/memory/embedder.js';
import { legacyExperience } from '../../src/memory/experience-types.js';
import { withMemoryProcessLock } from '../../src/memory/lock.js';
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
  identity = { provider: 'synthetic', model: 'touch-lock-order-v1', dimensions: 1 };
  async embedDocuments(texts: string[]): Promise<number[][]> { return texts.map(() => [1]); }
}

async function serviceFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'memory-touch-lock-order-'));
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
  return { service, internal, lockPath: paths.lock };
}

/** Live finding 2026-11-06: each touch() is a full-store commit under the memory lock (about 7 s on the
 * production store). search() launched them before awaiting retrievalLedger.record(), which queues on the same
 * lock, so the response waited behind every touch and memory_search timed out. The ledger write must be
 * published before the recency touches take the lock. */
it('records the retrieval ledger and returns before slow recency touches take the memory lock', async () => {
  const { service, internal, lockPath } = await serviceFixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(internal.store, 'mutate').mockImplementation(() =>
    withMemoryProcessLock(lockPath, async () => { await gate; throw new Error('released'); }));

  const searchPromise = service.search('automobile', { limit: 5 });
  try {
    const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), 4000));
    const winner = await Promise.race([searchPromise, timeout]);

    expect(winner).not.toBe('timeout');
    expect((winner as Awaited<ReturnType<typeof service.search>>).length).toBeGreaterThan(0);
    expect(internal.retrievalLedger.status().attemptCount).toBeGreaterThan(0);
  } finally {
    release();
    await searchPromise.catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}, 20_000);
