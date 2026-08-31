import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryService } from '../src/memory/service.js';

const roots: string[] = [];
const services: MemoryService[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-memory-ranking-quality-'));
  roots.push(value);
  return value;
}

function serviceFor(rootDir: string): MemoryService {
  const service = new MemoryService({
    ...loadConfig({}, rootDir).memory,
    enabled: true,
    dbPath: path.join(rootDir, 'memory.sqlite'),
    graphMaxHops: 4,
    temporalNeighborWindowMs: 1,
  });
  services.push(service);
  return service;
}

afterEach(async () => {
  await Promise.all(services.splice(0).map(async (service) => {
    try { await service.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

describe('memory durable ranking quality', () => {
  it('keeps an old pinned active decision ahead of fresh low-importance observation chatter', async () => {
    const rootDir = await root();
    const service = serviceFor(rootDir);
    const scope = { principalId: 'quality-principal', projectId: 'quality-project' };

    const decision = await service.commit({
      scope,
      canonicalKey: 'decision.package.format',
      kind: 'decision',
      value: 'Package format decision requires ZIP64 for large release bundles.',
      importance: 1,
      pinned: true,
      sourceType: 'quality-test',
    });
    for (let index = 0; index < 3; index += 1) {
      await service.commit({
        scope,
        canonicalKey: `observation.package.note.${index}`,
        kind: 'observation',
        value: `Package format ZIP64 release bundle chatter ${index}.`,
        importance: 0.3,
        sourceType: 'quality-test',
      });
    }

    await service.close();
    services.splice(services.indexOf(service), 1);
    const db = new DatabaseSync(path.join(rootDir, 'memory.sqlite'));
    try {
      const agedAt = Date.now() - (120 * 24 * 60 * 60 * 1000);
      db.prepare('UPDATE memory_items SET updated_at = ?, last_accessed_at = ?, access_count = 0 WHERE id = ?')
        .run(agedAt, agedAt, decision.memoryId);
    } finally {
      db.close();
    }

    const reopened = serviceFor(rootDir);
    const result = await reopened.search({
      scope,
      query: 'package format ZIP64 release bundle',
      limit: 10,
    });

    expect(result.hits[0]?.memoryId).toBe(decision.memoryId);
    expect(result.hits[0]).toMatchObject({ kind: 'decision', pinned: true, state: 'active' });
  });
});
