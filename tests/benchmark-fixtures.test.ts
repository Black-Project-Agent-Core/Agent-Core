import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ExecutionService } from '../src/execution/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { parseVaultSegment } from '../src/memory/file-native/vault-codec.js';
import { validateDirectMemoryDocument } from '../src/memory/file-native/supabase-direct.js';
import { benchmarkMemoryConfig, BenchmarkMemoryTransport } from '../scripts/benchmark-memory-fixture.mjs';
import { benchmarkCount, parseArgs as memoryArgs, seedVault } from '../scripts/benchmark-memory.mjs';
import { ControlledRunner, independentBenchmarkNodes, parseArgs as executionArgs } from '../scripts/benchmark-execution.mjs';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 30 })));
});
const python = path.join(process.cwd(), '.tools', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3');

describe('isolated certification benchmark fixtures', () => {
  it('seeds valid semantic documents whose two-hop graph exceeds the production recall bound', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'benchmark-seed-contract-')); roots.push(root);
    await seedVault(root, 1502, 1500);
    const entries = new Map();
    for (const file of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith('.md')) continue;
      const absolute = path.join(file.parentPath, file.name);
      const segment = parseVaultSegment(await readFile(absolute, 'utf8'), path.relative(root, absolute).replaceAll('\\', '/'));
      for (const entry of segment.entries) {
        validateDirectMemoryDocument({ principalId: segment.principalId, projectId: segment.projectId, entry,
          revisions: [{ memoryId: entry.memoryId, revisionId: entry.revisionId, revisionNo: 1, valueText: entry.valueText, valueHash: entry.valueHash, validFrom: entry.createdAt, createdAt: entry.createdAt }] },
        { principalId: segment.principalId, projectId: segment.projectId });
        entries.set(entry.memoryId, entry);
      }
    }
    expect(entries.size).toBe(1502);
    expect([...entries.values()].reduce((total, entry) => total + entry.relations.length, 0)).toBe(3000);
    const hub = [...entries.values()].find(entry => entry.canonicalKey === 'benchmark.hot');
    const visited = new Set([hub.memoryId]);
    let frontier = [hub.memoryId];
    for (let hop = 0; hop < 2; hop++) {
      const next = [];
      for (const id of frontier) for (const relation of entries.get(id).relations) {
        if (!visited.has(relation.targetMemoryId)) { visited.add(relation.targetMemoryId); next.push(relation.targetMemoryId); }
      }
      frontier = next;
    }
    expect(visited.size - 1).toBe(1500);
    expect(visited.size - 1).toBeGreaterThan(loadConfig({}, root).memory.graphNodeCap);
  });

  it('keeps all memory writes isolated while selecting real private tools and refusing process memory configuration', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'benchmark-config-')); roots.push(root);
    vi.stubEnv('AGENT_CORE_MEMORY_SUPABASE_URL', 'https://do-not-contact.invalid');
    vi.stubEnv('AGENT_CORE_MEMORY_VAULT_ROOT', 'runtime/private-vault');
    const config = await benchmarkMemoryConfig(root);
    expect(config.hardLifecycleMode).toBe('enforce');
    expect(config.supabaseDirect.url).toBe('https://benchmark.invalid');
    expect(config.supabaseSecond.enabled).toBe(false);
    expect(config.remote.enabled).toBe(false);
    for (const key of ['memoryRoot', 'vaultRoot', 'graphRoot', 'transactionRoot', 'syncRoot']) {
      expect(path.relative(root, config.fileNative[key])).toMatch(/^runtime[\\/]/);
    }
    expect(config.fileNative.pythonPath).toBe(python);
    expect(config.fileNative.rgPath).toContain(path.join('.tools', 'ripgrep'));
    expect(memoryArgs([]).targetP95Ms).toBe(150);
    expect(executionArgs([])).toMatchObject({ dagTargetMs: 50, dispatchTargetMs: 100, wakeTargetMs: 250 });
  });

  it('does not fabricate Supabase writes, scope reads, or healthy responses during an outage', async () => {
    const transport = new BenchmarkMemoryTransport();
    const memoryId = randomUUID(), revisionId = randomUUID();
    const scope = { principalId: 'benchmark-a', projectId: 'isolated-a' };
    const entry = { memoryId, revisionId, revisionNo: 1, canonicalKey: 'bench.valid', kind: 'fact', state: 'active',
      importance: 0.5, pinned: false, enforcement: 'none', valueText: 'fixture value', valueHash: 'hash', createdAt: 1, updatedAt: 1, relations: [] };
    const document = { ...scope, entry, revisions: [{ memoryId, revisionId, revisionNo: 1, valueText: entry.valueText, valueHash: 'hash', validFrom: 1, createdAt: 1 }] };
    await expect(transport.call('upsert', { ...scope, document: { ...document, entry: { ...entry, memoryId: 'invalid' } } })).rejects.toMatchObject({ code: 'MEMORY_SUPABASE_RESPONSE_INVALID' });
    const receipt = await transport.call('upsert', { ...scope, document, expectedVersion: null });
    expect(receipt).toMatchObject({ applied: true });
    await expect(transport.call('upsert', { ...scope, document, expectedVersion: null })).rejects.toMatchObject({ code: 'MEMORY_SUPABASE_WRITE_CONFLICT' });
    expect(await transport.call('get', { ...scope, memoryId })).toEqual(document);
    expect(await transport.call('get', { ...scope, principalId: 'benchmark-b', memoryId })).toBeNull();
    transport.offline = true;
    await expect(transport.call('health', {})).rejects.toMatchObject({ code: 'MEMORY_SUPABASE_NETWORK_ERROR' });
  });

  it.skipIf(!existsSync(python))('runs real Graphify recall and closes strict lifecycles without network access', async () => {
    const fetch = vi.fn(() => { throw new Error('A benchmark must not contact a remote service'); });
    vi.stubGlobal('fetch', fetch);
    const result = await benchmarkCount(41, { samples: 3, warmup: 0, targetP95Ms: 150, keep: true });
    roots.push(result.root);
    expect(result).toMatchObject({ activeItems: 41, relationEdges: 80, integrity: 'file-native:ok', integrityDegraded: false,
      hardLifecycleMode: 'enforce', closedLifecycles: 3, lexicalSearchTermMatches: 1, fixtureSync: { documentCount: 42, upsert: 42 } });
    expect(result.environment.remoteCertification).toBe(false);
    expect(result.ingest.graphProjectionMs).toBeGreaterThan(0);
    expect(result.preflightHits).toBeGreaterThan(0);
    const graphRoot = path.join(result.root, 'runtime', 'memory', 'graph');
    expect(JSON.parse(await readFile(path.join(graphRoot, 'projection.json'), 'utf8')).snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(path.join(graphRoot, 'graph.json'), 'utf8')).nodes).toHaveLength(42);
    const lifecycleRoot = path.join(result.root, 'runtime', 'memory', 'vault', '.agent-core', 'state', 'lifecycles');
    const records = await Promise.all((await readdir(lifecycleRoot)).filter(file => file.endsWith('.json')).map(file => readFile(path.join(lifecycleRoot, file), 'utf8').then(JSON.parse)));
    expect(records).toHaveLength(3);
    expect(records.every(record => record.postflightState === 'CLOSED' && record.localDurableHash)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  }, 90_000);

  it('launches four explicitly independent output probes and releases claims on cancellation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'benchmark-execution-contract-')); roots.push(root);
    const work = path.join(root, 'work'); await mkdir(work);
    const config = loadConfig({}, root).execution;
    const runner = new ControlledRunner();
    const service = new ExecutionService({ ...config, enabled: true, maxConcurrency: 4 }, new WorkspacePolicy([root]), { runner });
    const scope = { principalId: 'benchmark', projectId: root };
    try {
      await service.open();
      const created = await service.create(scope, { objective: 'Measure bounded output dispatch', maxConcurrency: 4, nodes: independentBenchmarkNodes(work, 8) });
      await service.start(scope, created.runId);
      expect(runner.starts).toHaveLength(4);
      expect(runner.maxActive).toBe(4);
      await service.cancel(scope, created.runId);
      expect(runner.active).toBe(0);
      const release = await service.acquireWorkspaceClaim(scope, { writes: [work] });
      await release();
    } finally { await service.close(); }
  }, 30_000);
});
