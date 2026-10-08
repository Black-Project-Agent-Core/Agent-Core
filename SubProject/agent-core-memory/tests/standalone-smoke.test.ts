import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeStandaloneMemory } from '../src/index.js';

const created: string[] = [];
afterEach(async () => {
  await Promise.all(created.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('Agent Core Memory standalone extraction', () => {
  it('persists and recalls canonical memory across service restarts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-'));
    created.push(root);
    const first = await initializeStandaloneMemory({ baseDir: root });
    const saved = await first.remember({
      title: 'Standalone smoke',
      content: 'The memory engine persists canonical records and recalls them after restart.',
      category: 'test',
      tags: ['standalone', 'memory'],
    });
    const initial = await first.search('persists canonical records', {
      limit: 5,
      maxNeighbors: 0,
    });
    expect(initial.some(item => item.record.id === saved.id)).toBe(true);

    const second = await initializeStandaloneMemory({ baseDir: root });
    const loaded = await second.read(saved.id, false);
    expect(loaded?.content).toContain('persists canonical records');

    const health = await second.refreshHealth();
    expect(health.status).toBe('available');
  });
});
