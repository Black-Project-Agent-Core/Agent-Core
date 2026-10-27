import { expect, it } from 'vitest';
import { searchMemories } from '../../src/memory/retrieval.js';
import type { MemoryRecord } from '../../src/memory/types.js';

const stamp = '2026-10-23T00:00:00.000Z';
function record(id: string, content: string, workspace = 'fixture'): MemoryRecord {
  return { version: 1, id, content, keywords: [], context: 'General', tags: [],
    category: 'Uncategorized', links: [], createdAt: stamp, updatedAt: stamp,
    lastAccessedAt: null, retrievalCount: 0, evolutionHistory: [], pinned: false,
    provenance: { workspace, files: [] } };
}

it('does not treat sentence periods as identifiers and preserves actual path/code identity and workspace isolation', () => {
  const cases = [
    { query: 'Document the DONOR-FIXTURE-284 verified offset contract.',
      right: 'DONOR-FIXTURE-284 verified offset contract uses n => n + 2',
      wrong: 'DONOR-FIXTURE-285 verified offset contract uses n => n + 2' },
    { query: 'Inspect src/memory/controller-session.ts.', right: 'src/memory/controller-session.ts',
      wrong: 'src/cache/controller-session.ts' },
    { query: 'Inspect MemoryService.assembleContext.', right: 'MemoryService.assembleContext',
      wrong: 'MemoryService.readContext' },
    { query: 'Inspect C:\\Projects\\Alpha\\config.json.', right: 'C:\\Projects\\Alpha\\config.json',
      wrong: 'C:\\Projects\\Beta\\config.json' },
    { query: 'Inspect ERR_CACHE_404.', right: 'ERR_CACHE_404', wrong: 'ERR_CACHE_403' },
    { query: 'Inspect DONOR-FIXTURE-284 in src/memory/controller-session.ts.',
      right: 'DONOR-FIXTURE-284 in src/memory/controller-session.ts',
      wrong: 'DONOR-FIXTURE-284 in src/cache/controller-session.ts' },
  ];
  for (const { query, right, wrong } of cases) {
    const records = [record('right', right), record('wrong-identity', wrong), record('foreign', right, 'other')];
    expect(searchMemories(records, query, { rankingProfile: 'fusion', workspace: 'fixture',
      limit: 5, maxNeighbors: 0 }, undefined, 50, Date.parse(stamp)).map(item => item.record.id), query).toEqual(['right']);
  }
});
