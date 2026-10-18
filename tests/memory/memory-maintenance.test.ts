import { mkdtemp, mkdir, readFile, rm, unlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { MemoryEmbedder } from '../../src/memory/embedder.js';
import { MemoryIndex } from '../../src/memory/index.js';
import { withMemoryProcessLock } from '../../src/memory/lock.js';
import { parseCanonicalNote, serializeCanonicalNote } from '../../src/memory/note-format.js';
import { notePath, resolveMemoryPaths } from '../../src/memory/paths.js';
import { MemoryService } from '../../src/memory/service.js';
import * as schemas from '../../src/memory/mcp/schemas.js';
import { startAgentCoreService } from '../../src/index.js';

const roots: string[] = [];

class MarkerEmbedder implements MemoryEmbedder {
  readonly identity = { provider: 'fake', model: 'maintenance-v1', dimensions: 3 };
  fail = false;

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (this.fail) throw new Error('fake embedder unavailable');
    return texts.map((text) => {
      const value = text.toLowerCase();
      if (value.includes('changed-semantic')) return [0, 1, 0];
      if (value.includes('group-a')) return [1, 0, 0];
      if (value.includes('group-b')) return [0.6, 0.8, 0];
      return [0, 0, 1];
    });
  }
}
async function createMemoryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-maintenance-'));
  roots.push(root);
  await mkdir(path.join(root, 'notes'), { recursive: true });
  await writeFile(path.join(root, '00-agent-core-memory.md'), '# Agent Core Maintenance Foundation\n', 'utf8');
  return root;
}

async function createService(embedder?: MemoryEmbedder): Promise<{ root: string; memory: MemoryService }> {
  const root = await createMemoryRoot();
  return { root, memory: await MemoryService.initialize(process.cwd(), root, embedder) };
}

async function runLockChild(lockPath: string): Promise<{ enter: number; exit: number }> {
  const moduleUrl = pathToFileURL(path.resolve(process.cwd(), 'dist', 'memory', 'lock.js')).href;
  const script = `
    const [{ withMemoryProcessLock }] = await Promise.all([import(process.argv[1])]);
    const result = await withMemoryProcessLock(process.argv[2], async () => {
      const enter = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { enter, exit: Date.now() };
    }, 5000);
    process.stdout.write(JSON.stringify(result));
  `;
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, moduleUrl, lockPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) return reject(new Error(`lock child failed (${code}): ${stderr}`));
      try { resolve(JSON.parse(stdout)); }
      catch (error) { reject(error); }
    });
  });
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('memory maintenance regressions', () => {
  it('does not steal an aged legacy lock while its local owner PID is still alive', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-lock-'));
    roots.push(root);
    const lockPath = path.join(root, '.memory.lock');
    await writeFile(lockPath, JSON.stringify({
      pid: process.pid,
      token: 'live-owner',
      hostname: os.hostname(),
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
    }));

    await expect(withMemoryProcessLock(lockPath, async () => undefined, 40))
      .rejects.toMatchObject({ code: 'MEMORY_STORE_BUSY' });
  });
  it('serializes concurrent contenders when recovering a stale directory lock', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-lock-race-'));
    roots.push(root);
    const lockPath = path.join(root, '.memory.lock');
    await mkdir(lockPath);
    const stale = new Date(Date.now() - 120_000);
    await utimes(lockPath, stale, stale);

    let active = 0;
    let maxActive = 0;
    const contender = () => withMemoryProcessLock(lockPath, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active--;
    }, 2_000);

    await Promise.all(Array.from({ length: 8 }, () => contender()));
    expect(maxActive).toBe(1);
  });

  it('serializes the same lock across separate Node processes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-lock-process-'));
    roots.push(root);
    const lockPath = path.join(root, '.memory.lock');
    const intervals = await Promise.all(Array.from({ length: 4 }, () => runLockChild(lockPath)));
    const ordered = intervals.slice().sort((a, b) => a.enter - b.enter || a.exit - b.exit);
    for (let index = 1; index < ordered.length; index++) {
      expect(ordered[index].enter).toBeGreaterThanOrEqual(ordered[index - 1].exit);
    }
  }, 10_000);
  it('refreshes stale semantic vectors after an external canonical rewrite', async () => {
    const embedder = new MarkerEmbedder();
    const { root, memory } = await createService(embedder);
    const record = await memory.remember({ content: 'group-a original durable fact' });
    const filePath = notePath(resolveMemoryPaths(process.cwd(), root), record.id);
    const canonical = parseCanonicalNote(await readFile(filePath, 'utf8'));
    canonical.content = 'changed-semantic externally rewritten durable fact';
    canonical.updatedAt = new Date().toISOString();
    await writeFile(filePath, serializeCanonicalNote(canonical), 'utf8');
    const results = await memory.search('changed-semantic', { limit: 5, maxNeighbors: 0 });
    const found = results.find((item) => item.record.id === record.id);
    expect(found).toBeTruthy();
    expect(found!.components.semanticSimilarity).toBeCloseTo(1, 6);
  });

  it('preserves one bounded preview when the top Memory result is larger than budgetChars', async () => {
    const { memory } = await createService();
    const record = await memory.remember({
      content: `budget-marker ${'x'.repeat(8_000)} tail-marker`,
      keywords: ['budget-marker'],
      context: 'budget-marker',
    });

    const results = await memory.search('budget-marker', {
      limit: 1,
      maxNeighbors: 0,
      budgetChars: 2048,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.record.id).toBe(record.id);
    expect(results[0]?.delivery.detail).toBe('preview');
    expect(results[0]?.delivery.truncated).toBe(true);
    expect(results[0]?.delivery.content.length).toBeLessThan(record.content.length);
  });

  it('reports semanticSimilarity as a raw 0..1 similarity instead of a weighted score', async () => {
    const { memory } = await createService(new MarkerEmbedder());
    const record = await memory.remember({ content: 'group-a similarity contract' });
    const result = (await memory.search('group-a', { maxNeighbors: 0 }))
      .find((item) => item.record.id === record.id);
    expect(result).toBeTruthy();
    expect(result!.components.semanticSimilarity).toBeGreaterThanOrEqual(0);
    expect(result!.components.semanticSimilarity).toBeLessThanOrEqual(1);
    expect(result!.components.semanticSimilarity).toBeCloseTo(1, 6);
  });
  it('rejects persisted embeddings with the wrong vector shape', async () => {
    const embedder = new MarkerEmbedder();
    const { root, memory } = await createService(embedder);
    await memory.remember({ content: 'group-a persisted vector validation' });
    const paths = resolveMemoryPaths(process.cwd(), root);
    const indexPath = path.join(paths.index, 'index.json');
    const indexFile = JSON.parse(await readFile(indexPath, 'utf8')) as any;
    indexFile.entries[0].embedding = [1, 2];
    await writeFile(indexPath, `${JSON.stringify(indexFile, null, 2)}\n`, 'utf8');

    const index = new MemoryIndex(paths, embedder);
    await expect(index.load()).rejects.toThrow(/embedding/i);
  });

  it('makes automatic related relationships reciprocal and strengthens weak existing links', async () => {
    const embedder = new MarkerEmbedder();
    const { memory } = await createService(embedder);
    const first = await memory.remember({ content: 'group-a first relationship fact' });
    const second = await memory.remember({ content: 'group-a second relationship fact' });

    const firstAfterRemember = await memory.read(first.id, false);
    expect(firstAfterRemember?.links.some((link) => link.targetId === second.id && link.type === 'related')).toBe(true);

    await memory.update(second.id, {
      links: [{ targetId: first.id, type: 'related', strength: 0.1 }],
    });
    const evolved = await memory.evolve(second.id);
    const secondAfter = await memory.read(second.id, false);
    const strengthened = secondAfter?.links.find((link) => link.targetId === first.id && link.type === 'related');
    expect(evolved.applied).toBe(true);
    expect(strengthened?.strength).toBeGreaterThan(0.9);
  });
  it('uses overlap wording when consolidation has no directional supersession evidence', async () => {
    const { memory } = await createService(new MarkerEmbedder());
    const first = await memory.remember({ content: 'group-a alpha only' });
    const second = await memory.remember({ content: 'group-a beta only' });
    const candidate = (await memory.consolidate({ semanticThreshold: 0.8, lexicalThreshold: 1, limit: 20 }))
      .find((item) => new Set([item.leftId, item.rightId]).has(first.id)
        && new Set([item.leftId, item.rightId]).has(second.id));
    expect(candidate).toBeTruthy();
    expect(String(candidate!.recommendation)).toBe('review-overlap');
  });

  it('lets MCP callers omit link createdAt because the service owns link timestamps', () => {
    expect(() => schemas.memoryRemember.parse({
      content: 'schema timestamp ownership',
      links: [{ targetId: 'abc', type: 'related', strength: 0.5 }],
    })).not.toThrow();
  });

  it('enriches omitted metadata deterministically without an embedding provider', async () => {
    const { memory } = await createService();
    const created = await memory.remember({ content: 'portable metadata fallback for durable memory capture' });
    expect(created.keywords).toContain('portable');
    expect(created.tags.length).toBeGreaterThan(0);
    expect(created.context).not.toBe('General');
    expect(memory.health().embedding).toBe('not-configured');
  });

  it('preserves controller-supplied semantic metadata exactly when provided', async () => {
    const { memory } = await createService(new MarkerEmbedder());
    const created = await memory.remember({
      content: 'controller supplied metadata remains authoritative for this memory',
      keywords: ['controller-keyword'],
      context: 'Controller supplied factual context.',
      tags: ['controller-tag'],
      category: 'controller-category',
    });
    expect(created.keywords).toEqual(['controller-keyword']);
    expect(created.context).toBe('Controller supplied factual context.');
    expect(created.tags).toEqual(['controller-tag']);
    expect(created.category).toBe('controller-category');
  });

  it('repairs incoming links when a memory is deleted and keeps pinned memory protected', async () => {
    const { memory } = await createService();
    const target = await memory.remember({ content: 'delete target' });
    const source = await memory.remember({
      content: 'delete source',
      links: [{ targetId: target.id, type: 'related', strength: 0.7 }],
    });
    expect((await memory.read(source.id, false))?.links.some((link) => link.targetId === target.id)).toBe(true);
    await expect(memory.delete('agent-core-foundational')).rejects.toThrow(/Pinned foundational memory/);
    expect(await memory.delete(target.id)).toBe(true);
    expect((await memory.read(source.id, false))?.links.some((link) => link.targetId === target.id)).toBe(false);
  });
  it('reports post-start canonical corruption through the live /health path', async () => {
    const projectRoot = await createMemoryRoot();
    const {activateCanonicalMemory}=await import('../../src/memory/host-activation.js');
    await activateCanonicalMemory(projectRoot,{operation:'fresh'});
    const root=path.join(projectRoot,'runtime/memory');
    const dataDir = path.join(projectRoot, 'auth');
    const service = await startAgentCoreService({
      projectRoot,
      host: '127.0.0.1',
      port: 0,
      dataDir,
      memoryDir: root,
      memoryEmbedding: { provider: null, accountId: null, apiToken: null, model: null, dimensions: 768 },
      httpSecurity: { publicBaseUrl: null, protectedResourceUrl: null, trustProxy: false, allowedOrigins: [] },
      mcp: { protocolMode: 'dual' },
      // The host configuration requires an explicit research service config.
      webResearch: { enabled: false, exaApiKey: null, parallelApiKey: null, jinaApiKey: null,
        firecrawlApiKey: null, openAlexApiKey: null, pexelsApiKey: null, unsplashAccessKey: null,
        browserbaseApiKey: null, apifyToken: null, langfusePublicKey: null,
        langfuseSecretKey: null, langfuseBaseUrl: null, timeoutMs: 5_000 },
    });
    try {
      const initial = await fetch(`http://127.0.0.1:${service.port}/health`).then((response) => response.json()) as any;
      expect(initial.memory.status).toBe('available');
      await unlink(path.join(root, '00-agent-core-memory.md'));
      const after = await fetch(`http://127.0.0.1:${service.port}/health`).then((response) => response.json()) as any;
      expect(after.memory.status).toBe('error');
      expect(after.memory.canonicalStore).toBe('error');
    } finally {
      await service.close();
    }
  });

  it('surfaces malformed ordinary notes without destroying healthy canonical memories', async () => {
    const { root, memory } = await createService();
    const healthy = await memory.remember({ content: 'healthy durable record' });
    await writeFile(path.join(root, 'notes', 'broken.md'), 'not a canonical memory', 'utf8');
    const listed = await memory.list();
    expect(listed.some((record) => record.id === healthy.id)).toBe(true);
    expect(memory.health().status).toBe('degraded');
    expect(memory.getIssues().some((issue) => issue.path.endsWith('broken.md'))).toBe(true);
  });
  it('covers ordinary CRUD plus durable retrieval metadata', async () => {
    const { memory } = await createService();
    const created = await memory.remember({ content: 'crud original', tags: ['crud'] });
    expect(created.retrievalCount).toBe(0);
    const read = await memory.read(created.id, true);
    expect(read?.retrievalCount).toBe(1);
    expect(read?.lastAccessedAt).toBeTruthy();
    const updated = await memory.update(created.id, { content: 'crud updated' });
    expect(updated.content).toBe('crud updated');
    expect(updated.retrievalCount).toBe(1);
    expect(await memory.delete(created.id)).toBe(true);
    expect(await memory.read(created.id, false)).toBeNull();
  });

  it('previews deterministic evolution without mutating canonical notes or the derived index', async () => {
    const embedder = new MarkerEmbedder();
    const { root, memory } = await createService(embedder);
    const first = await memory.remember({
      content: 'group-a preview neighbor fact',
      keywords: ['neighbor-original'],
      context: 'Neighbor context stays unchanged.',
      tags: ['neighbor-tag'],
      category: 'preview-test',
    });
    const second = await memory.remember({
      content: 'group-a preview owner fact',
      keywords: [],
      context: 'General',
      tags: [],
      category: 'Uncategorized',
    });

    const paths = resolveMemoryPaths(process.cwd(), root);
    const firstPath = notePath(paths, first.id);
    const secondPath = notePath(paths, second.id);
    const indexPath = path.join(paths.index, 'index.json');
    const beforeFirst = await readFile(firstPath, 'utf8');
    const beforeSecond = await readFile(secondPath, 'utf8');
    const beforeIndex = await readFile(indexPath, 'utf8');
    const beforeFirstRecord = await memory.read(first.id, false);

    const preview = await memory.previewEvolution(second.id, 3);

    expect(preview.mode).toBe('preview');
    expect(preview.applied).toBe(false);
    expect(preview.changedFields).toEqual([]);
    expect(preview.reciprocalLinks).toEqual([]);
    expect(preview.neighbors.length).toBeGreaterThan(0);
    expect(preview.neighbors.length).toBeLessThanOrEqual(3);
    expect(preview.neighbors.some((neighbor) => neighbor.id === first.id)).toBe(true);
    const neighbor = preview.neighbors.find((item) => item.id === first.id)!;
    expect(neighbor.context).toBe('Neighbor context stays unchanged.');
    expect(neighbor.tags).toEqual(['neighbor-tag']);
    expect(neighbor.category).toBe('preview-test');
    expect(neighbor.similarity).toBeGreaterThanOrEqual(0);
    expect(neighbor.similarity).toBeLessThanOrEqual(1);

    expect(await readFile(firstPath, 'utf8')).toBe(beforeFirst);
    expect(await readFile(secondPath, 'utf8')).toBe(beforeSecond);
    expect(await readFile(indexPath, 'utf8')).toBe(beforeIndex);
    expect(await memory.read(first.id, false)).toEqual(beforeFirstRecord);
  });

  it('requires an already-current semantic index for preview and never repairs it implicitly', async () => {
    const embedder = new MarkerEmbedder();
    const { root, memory } = await createService(embedder);
    const record = await memory.remember({ content: 'group-a stale preview index fact' });
    const indexPath = path.join(resolveMemoryPaths(process.cwd(), root).index, 'index.json');
    await unlink(indexPath);

    await expect(memory.previewEvolution(record.id)).rejects.toThrow(/index|semantic/i);
    await expect(readFile(indexPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await memory.read(record.id, false))?.content).toBe('group-a stale preview index fact');
  });

  it('keeps neighbor metadata proposal-only until an explicit batch update is committed', async () => {
    const { memory } = await createService(new MarkerEmbedder());
    const neighbor = await memory.remember({
      content: 'group-a neighbor review fact',
      keywords: ['original-keyword'],
      context: 'Original neighbor context.',
      tags: ['original-tag'],
      category: 'original-category',
    });
    const owner = await memory.remember({ content: 'group-a owner review fact' });

    const preview = await memory.previewEvolution(owner.id, 5);
    expect(preview.neighbors.some((item) => item.id === neighbor.id)).toBe(true);
    const unchanged = await memory.read(neighbor.id, false);
    expect(unchanged?.keywords).toEqual(['original-keyword']);
    expect(unchanged?.context).toBe('Original neighbor context.');
    expect(unchanged?.tags).toEqual(['original-tag']);
    expect(unchanged?.category).toBe('original-category');

    const batch = await memory.batch([{
      op: 'update',
      id: neighbor.id,
      patch: {
        context: 'Explicitly reviewed neighbor context.',
        tags: ['reviewed-tag'],
      },
    }]);
    expect(batch.committed).toBe(true);
    expect(batch.indexRefreshes).toBe(1);
    const updated = await memory.read(neighbor.id, false);
    expect(updated?.context).toBe('Explicitly reviewed neighbor context.');
    expect(updated?.tags).toEqual(['reviewed-tag']);
  });

  it('rejects evolution preview without configured intelligence and preserves canonical memory', async () => {
    const { memory } = await createService();
    const record = await memory.remember({ content: 'preview without embedding remains canonical' });
    await expect(memory.previewEvolution(record.id)).rejects.toThrow(/intelligence is not configured/i);
    expect((await memory.read(record.id, false))?.content).toBe('preview without embedding remains canonical');
  });

  it('rejects missing and pinned preview targets without mutation', async () => {
    const { memory } = await createService(new MarkerEmbedder());
    await expect(memory.previewEvolution('does-not-exist')).rejects.toThrow(/Memory not found/i);
    await expect(memory.previewEvolution('agent-core-foundational')).rejects.toThrow(/Pinned foundational memory/i);
  });

  it('keeps explicit neighbor-review batch updates all-or-nothing on validation failure', async () => {
    const { memory } = await createService(new MarkerEmbedder());
    const neighbor = await memory.remember({
      content: 'group-a atomic neighbor review fact',
      context: 'Atomic original context.',
      tags: ['atomic-original'],
    });
    const before = await memory.read(neighbor.id, false);

    await expect(memory.batch([
      {
        op: 'update',
        id: neighbor.id,
        patch: { context: 'Should never partially commit.' },
      },
      {
        op: 'update',
        id: 'missing-atomic-target',
        patch: { tags: ['should-fail'] },
      },
    ])).rejects.toThrow(/Memory not found/i);

    expect(await memory.read(neighbor.id, false)).toEqual(before);
  });

  it('reports a missing derived index as degraded without invalidating canonical memory', async () => {
    const embedder = new MarkerEmbedder();
    const { root, memory } = await createService(embedder);
    await memory.remember({ content: 'group-a health index fact' });
    await unlink(path.join(root, 'index', 'index.json'));
    const health = await memory.refreshHealth();
    expect(health.status).toBe('degraded');
    expect(health.canonicalStore).toBe('available');
    expect(health.index).toBe('degraded');
    expect(health.embedding).toBe('degraded');
  });
});
