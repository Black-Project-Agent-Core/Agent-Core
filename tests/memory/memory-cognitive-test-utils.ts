import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MemoryCognitiveOptions } from '../../src/memory/cognitive-config.js';
import { MemoryService } from '../../src/memory/service.js';
import type { MemoryRecord } from '../../src/memory/types.js';

export const STAMP = '2026-10-20T00:00:00.000Z';
export const NOW = Date.parse('2026-10-27T00:00:00.000Z');
const FOUNDATION = '# Agent Core Foundational Memory\n\nCanonical operating context.\n';

/** Plain in-memory record for pure-function tests. */
export function record(id: string, extra: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    version: 1,
    id,
    content: `content ${id}`,
    keywords: [],
    context: 'General',
    tags: [],
    category: 'general',
    links: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    lastAccessedAt: null,
    retrievalCount: 0,
    evolutionHistory: [],
    pinned: false,
    ...extra,
  } as MemoryRecord;
}

export function link(targetId: string, type: 'related' | 'supports' | 'supersedes' | 'contradicts' | 'derived-from', strength = 0.8) {
  return { targetId, type, strength, createdAt: STAMP };
}

/** Real service over a throwaway root; every root and service is released by `cleanup`. */
export function createCognitiveFixtures() {
  const roots: string[] = [];
  const services: MemoryService[] = [];
  return {
    async service(cognitive?: MemoryCognitiveOptions) {
      const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-cognitive-'));
      roots.push(root);
      await mkdir(path.join(root, 'notes'));
      await writeFile(path.join(root, '00-agent-core-memory.md'), FOUNDATION);
      const service = await MemoryService.initialize(root, root, undefined, cognitive ? { cognitive } : {});
      services.push(service);
      return { root, service };
    },
    async cleanup() {
      for (const service of services.splice(0)) service.dispose();
      for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
    },
  };
}
