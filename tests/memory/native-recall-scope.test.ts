import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryService } from '../../src/memory/service.js';
import { MemoryRetrievalLedger } from '../../src/memory/retrieval-ledger.js';
import { resolveMemoryPaths } from '../../src/memory/paths.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-recall-scope-'));
  roots.push(root);
  const memoryRoot = path.join(root, 'runtime', 'memory');
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(memoryRoot, '00-agent-core-memory.md'), '# Agent Core Memory Foundation\n\nIsolated scope fixture.\n');
  return { root, memoryRoot, memory: await MemoryService.initialize(root, memoryRoot) };
}

describe('Native scoped recall through the canonical Memory owner', () => {
  it('includes explicitly general knowledge without disclosing foreign or ordinary unscoped records', async () => {
    const { memory } = await fixture();
    const scoped = await memory.remember({ title: 'Scope needle workspace lesson', content: 'Scope needle current workspace detail.',
      provenance: { workspace: 'fixture', files: [] } });
    const general = await memory.remember({ title: 'Scope needle general lesson', content: 'Scope needle reusable general principle.', category: 'general' });
    const privateNote = await memory.remember({ title: 'Scope needle private note', content: 'Scope needle unclassified private detail.' });
    const foreign = await memory.remember({ title: 'Scope needle foreign lesson', content: 'Scope needle foreign project detail.', category: 'general',
      provenance: { workspace: 'other-project', files: [] } });
    const defaults = await memory.search('Scope needle', { workspace: 'fixture', limit: 20 });
    expect(defaults.map(hit => hit.record.id)).toContain(scoped.id);
    expect(defaults.map(hit => hit.record.id)).not.toContain(general.id);
    const included = await memory.search('Scope needle', { workspace: 'fixture', includeGeneral: true, limit: 20 });
    expect(included.map(hit => hit.record.id)).toEqual(expect.arrayContaining([scoped.id, general.id]));
    expect(included.map(hit => hit.record.id)).not.toEqual(expect.arrayContaining([privateNote.id]));
    expect(included.map(hit => hit.record.id)).not.toContain(foreign.id);
  });

  it('omits a tested lesson before ranking and exposure without reviving its superseded predecessor', async () => {
    const { root, memoryRoot, memory } = await fixture();
    const old = await memory.remember({ title: 'Omission needle old lesson', content: 'Omission needle old result is obsolete.',
      provenance: { workspace: 'fixture', files: [] } });
    const current = await memory.remember({ title: 'Omission needle current lesson', content: 'Omission needle current result replaces the old result.',
      provenance: { workspace: 'fixture', files: [] }, links: [{ targetId: old.id, type: 'supersedes', strength: 1 }] });
    const hits = await memory.search('Omission needle', { workspace: 'fixture', taskId: 'omission-task',
      excludeMemoryIds: [current.id], limit: 20 });
    expect(hits.map(hit => hit.record.id)).not.toContain(current.id);
    expect(hits.map(hit => hit.record.id)).not.toContain(old.id);
    const ledger = new MemoryRetrievalLedger(resolveMemoryPaths(root, memoryRoot));
    const attempt = ledger.list().find(row => row.taskId === 'omission-task');
    expect(attempt).toBeTruthy();
    expect(attempt!.exposures.map(row => row.memoryId)).not.toContain(current.id);
    expect(attempt!.exposures.map(row => row.memoryId)).not.toContain(old.id);
    expect((await memory.read(current.id, false))!.content).toBe(current.content);
    expect((await memory.read(current.id, false))!.retrievalCount).toBe(0);
  });

  it('rejects unbound and oversized omissions before any retrieval is disclosed', async () => {
    const { memory } = await fixture();
    await expect(memory.search('fixture', { excludeMemoryIds: ['lesson'] })).rejects.toThrow('MEMORY_SEARCH_EXCLUSIONS_INVALID');
    await expect(memory.search('fixture', { taskId: 'fixture-task', excludeMemoryIds: Array(13).fill('lesson') }))
      .rejects.toThrow('MEMORY_SEARCH_EXCLUSIONS_INVALID');
    expect(memory.retrievalLedgerStatus().attemptCount).toBe(0);
  });
});
