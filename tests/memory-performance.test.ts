import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { memoryFixture } from './helpers/memory-fixture.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });

describe('deterministic memory performance boundaries', () => {
  it('keeps the production graph and recall defaults bounded exactly as the master contract requires', () => {
    const config = loadConfig({}, process.cwd()).memory;
    expect(config.graphNodeCap).toBe(1000);
    expect(config.graphEdgeCap).toBe(10_000);
    expect(config.graphMaxHops).toBe(2);
    expect(config.recallItemBudget).toBeGreaterThan(0);
    expect(config.recallCharacterBudget).toBeGreaterThan(0);
  });

  it('caps a large vault recall at the item and character budget without changing deterministic ordering', async () => {
    const f = await memoryFixture('performance', { AGENT_CORE_MEMORY_RECALL_ITEM_BUDGET: '8', AGENT_CORE_MEMORY_RECALL_CHARACTER_BUDGET: '2000' });
    roots.push(f.root);
    const scope = { principalId: 'p-perf', projectId: f.root };
    for (let index = 0; index < 40; index += 1) {
      await f.service.commit({
        scope,
        canonicalKey: `perf.node.${String(index).padStart(4, '0')}`,
        kind: 'fact',
        value: `deterministic recall boundary sample ${String(index).padStart(4, '0')} ${'detail '.repeat(20)}`,
        sourceType: 'test',
        metadata: { contextFamily: 'general', topicKey: 'performance' },
      });
    }

    const first = await f.service.search({ scope, query: 'deterministic recall boundary sample' });
    const second = await f.service.search({ scope, query: 'deterministic recall boundary sample' });

    expect(first.hits.length).toBeLessThanOrEqual(f.config.recallItemBudget);
    expect(first.hits.reduce((sum, hit) => sum + hit.valueText.length, 0)).toBeLessThanOrEqual(f.config.recallCharacterBudget);
    expect(first.hits.map((hit) => hit.memoryId)).toEqual(second.hits.map((hit) => hit.memoryId));
    expect(first.hits.map((hit) => hit.whyMatched.finalScore)).toEqual(second.hits.map((hit) => hit.whyMatched.finalScore));
    expect(first.snapshotHash).toBe(second.snapshotHash);
    await f.service.close();
  }, 120_000);
});
