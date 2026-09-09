import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryService } from '../src/memory/service.js';
import { backdateVaultEntry, memoryConfig, memoryRoot } from './helpers/memory-fixture.js';

const roots: string[] = [];
const services: MemoryService[] = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map(async (service) => { try { await service.close(); } catch {} }));
  await Promise.all(roots.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

describe('memory durable ranking quality', () => {
  it('keeps an old pinned active decision ahead of fresh low-importance observation chatter', async () => {
    const rootDir = await memoryRoot('ranking-quality');
    roots.push(rootDir);
    const config = { ...await memoryConfig(rootDir), graphMaxHops: 4, temporalNeighborWindowMs: 1 };
    const service = new MemoryService(config);
    services.push(service);
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
    await backdateVaultEntry(config.fileNative.vaultRoot, decision.memoryId, Date.now() - (120 * 24 * 60 * 60 * 1000));

    const reopened = new MemoryService(config);
    services.push(reopened);
    const result = await reopened.search({ scope, query: 'package format ZIP64 release bundle', limit: 10 });

    expect(result.hits[0]?.memoryId).toBe(decision.memoryId);
    expect(result.hits[0]).toMatchObject({ kind: 'decision', pinned: true, state: 'active' });
  });
});
