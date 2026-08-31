import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CapabilityRegistry } from '../src/capabilities/registry-service.js';
import { writeRegistryGeneration } from '../src/capabilities/registry-writer.js';
import type { CapabilityRecord } from '../src/capabilities/types.js';

const roots: string[] = [];

async function registryFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-ranking-quality-'));
  roots.push(root);
  const records = JSON.parse(await readFile(new URL('./fixtures/quality/routing-capabilities.json', import.meta.url), 'utf8')) as CapabilityRecord[];
  await writeRegistryGeneration(root, records, { catalogSha: records[0]!.catalogSha, generatedAt: '2026-08-31T00:00:00.000Z' });
  return CapabilityRegistry.open(root);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('capability ranking quality', () => {
  it('does not recommend native-ready skills that have no lexical match', async () => {
    const registry = await registryFixture();
    const recommendations = registry.recommend('Refactor frontend dashboard visual hierarchy spacing');
    expect(recommendations.map((item) => item.id)).toEqual(['frontend-quality']);
  });

  it('matches whole lexical tokens so get does not spuriously match budget', async () => {
    const registry = await registryFixture();
    const recommendations = registry.recommend('Get API documentation reference');
    expect(recommendations[0]?.id).toBe('docs-helper');
    expect(recommendations.map((item) => item.id)).not.toContain('budget-analysis');
  });

  it('ignores generic action verbs when they are the only capability overlap', async () => {
    const registry = await registryFixture();
    expect(registry.recommend('Review project status and summarize findings')).toEqual([]);
  });
});
