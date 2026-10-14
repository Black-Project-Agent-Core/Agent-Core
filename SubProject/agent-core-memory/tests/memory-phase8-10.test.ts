import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { MemoryEmbedder } from '../src/memory/embedder.js';
import { MemoryService } from '../src/memory/service.js';

const roots: string[] = [];

class FakeEmbedder implements MemoryEmbedder {
  readonly identity = { provider: 'fake', model: 'audit-v1', dimensions: 3 };
  fail = false;

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (this.fail) throw new Error('fake embedder unavailable');
    return texts.map((text) => {
      const normalized = text.toLowerCase();
      if (normalized.includes('semantic-group')) return [1, 0, 0];
      if (normalized.includes('different-topic')) return [0, 1, 0];
      return [0, 0, 1];
    });
  }
}
async function createMemoryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-audit-'));
  roots.push(root);
  await mkdir(path.join(root, 'notes'), { recursive: true });
  await writeFile(
    path.join(root, '00-agent-core-memory.md'),
    '# Test Agent Core Foundational Memory\n',
    'utf8',
  );
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('memory phases 8-10', () => {
  it('uses semantic vectors, conservative evolution, and proposal-only consolidation', async () => {
    const root = await createMemoryRoot();
    const embedder = new FakeEmbedder();
    const memory = await MemoryService.initialize(process.cwd(), root, embedder);

    const first = await memory.remember({ content: 'semantic-group first durable fact' });
    const second = await memory.remember({ content: 'semantic-group second durable fact' });
    expect(memory.health().embedding).toBe('available');
    expect(memory.health().intelligence).toBe('available');
    expect(second.content).toBe('semantic-group second durable fact');
    expect(second.links.some((link) => link.targetId === first.id && link.type === 'related')).toBe(true);

    const results = await memory.search('semantic-group');
    expect(results.some((item) => item.components.semanticSimilarity > 0)).toBe(true);

    const beforeCount = (await memory.list()).length;
    const candidates = await memory.consolidate({ semanticThreshold: 0.8, lexicalThreshold: 1 });
    expect(candidates.some((item) =>
      new Set([item.leftId, item.rightId]).has(first.id)
      && new Set([item.leftId, item.rightId]).has(second.id)
    )).toBe(true);
    expect((await memory.list()).length).toBe(beforeCount);
    expect((await memory.read(first.id, false))?.content).toBe('semantic-group first durable fact');
    expect((await memory.read(second.id, false))?.content).toBe('semantic-group second durable fact');

    const restarted = await MemoryService.initialize(process.cwd(), root, embedder);
    expect((await restarted.read(first.id, false))?.content).toBe('semantic-group first durable fact');
    expect((await restarted.read(second.id, false))?.content).toBe('semantic-group second durable fact');
    expect(restarted.health().embedding).toBe('available');
  });
  it('falls back to deterministic retrieval when query embedding fails', async () => {
    const root = await createMemoryRoot();
    const embedder = new FakeEmbedder();
    const memory = await MemoryService.initialize(process.cwd(), root, embedder);
    const record = await memory.remember({
      content: 'semantic-group fallback searchable fact',
      keywords: ['fallback'],
    });

    embedder.fail = true;
    const results = await memory.search('fallback', { rankingProfile: 'bm25' });

    expect(results.some((item) => item.record.id === record.id)).toBe(true);
    expect(results.find((item) => item.record.id === record.id)?.components.bm25Lexical).toBeGreaterThan(0);
    expect(memory.health().embedding).toBe('degraded');
    expect(memory.health().status).toBe('degraded');
    expect(memory.health().canonicalStore).toBe('available');

    embedder.fail = false;
    const recovered = await memory.search('fallback');
    expect(recovered.some((item) => item.record.id === record.id)).toBe(true);
    expect(memory.health().embedding).toBe('available');
    expect(memory.health().status).toBe('available');
  });
});
