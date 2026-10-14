import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LearningStateStore } from '../src/learning/state.js';
import { resolveLearningPaths } from '../src/learning/paths.js';
import { MemoryService } from '../src/memory/service.js';
import { SkillService } from '../src/skills/service.js';

const roots: string[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createMemoryService(prefix: string): Promise<{ project: string; memoryRoot: string; memory: MemoryService }> {
  const project = await tempRoot(prefix);
  const memoryRoot = path.join(project, 'memory');
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(memoryRoot, '00-agent-core-memory.md'), '# Agent Core Test Foundation\n', 'utf8');
  return { project, memoryRoot, memory: await MemoryService.initialize(project, memoryRoot) };
}

async function writeSkill(root: string, name: string, body: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'SKILL.md'), [
    '---',
    'name: ' + name,
    'description: ' + name + ' test skill',
    'license: MIT',
    '---',
    '',
    body,
    '',
  ].join('\n'), 'utf8');
}

describe('GRAPHITI-P1 + CODEMEM-P1/P2 + TDB-P2 Memory contracts', () => {
  it('preserves temporal evidence, suppresses expired neighbors, pages snapshot-safely, and records bounded retrieval evidence', async () => {
    const { memoryRoot, memory } = await createMemoryService('agent-core-graphiti-codemem-');

    const target = await memory.remember({
      content: 'unrelated archival neighbor payload',
      category: 'neighbor',
      provenance: { workspace: 'agent-core', files: [] },
    });
    const source = await memory.remember({
      content: 'private-query-needle-9385 source fact',
      category: 'source',
      provenance: { workspace: 'agent-core', files: [] },
      links: [{
        targetId: target.id,
        type: 'related',
        strength: 0.7,
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-01-02T00:00:00.000Z',
        referenceTime: '2026-01-01T12:00:00.000Z',
        evidenceRefs: ['memory:' + target.id, 'source:fixture-one'],
      }],
    });

    await memory.batch([{
      op: 'link',
      id: source.id,
      link: {
        targetId: target.id,
        type: 'related',
        strength: 0.9,
        evidenceRefs: ['source:fixture-two'],
      },
    }]);

    const reread = await memory.read(source.id, false);
    expect(reread?.links).toHaveLength(1);
    expect(reread?.links[0]).toMatchObject({
      targetId: target.id,
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-01-02T00:00:00.000Z',
      referenceTime: '2026-01-01T12:00:00.000Z',
      strength: 0.9,
    });
    expect(reread?.links[0]?.evidenceRefs).toEqual(expect.arrayContaining([
      'memory:' + target.id,
      'source:fixture-one',
      'source:fixture-two',
    ]));

    const results = await memory.search('private-query-needle-9385', {
      rankingProfile: 'bm25',
      limit: 1,
      maxNeighbors: 2,
      workspace: 'agent-core',
    });
    expect(results[0]?.record.id).toBe(source.id);
    expect(results.some(item => item.record.id === target.id)).toBe(false);

    const ledger = await readFile(path.join(memoryRoot, 'state', 'retrieval-ledger.jsonl'), 'utf8');
    expect(ledger).not.toContain('private-query-needle-9385');
    expect(ledger).toContain('"surface":"memory_search"');
    expect(ledger).toContain('"deliveryStatus":"returned-to-controller"');

    await memory.feedback(source.id, 'post-retrieval-helpful', 'helpful');
    const diagnostics = await memory.retrievalDiagnostics({ workspace: 'agent-core', limit: 20 });
    expect(diagnostics.lifecycle.requestedAttempts).toBeGreaterThanOrEqual(1);
    expect(diagnostics.lifecycle.returnedToControllerAttempts).toBeGreaterThanOrEqual(1);
    expect(diagnostics.evidenceCompleteness.explicitFeedbackEvents).toBeGreaterThanOrEqual(1);
    expect(diagnostics.findings.helpful).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(diagnostics.limitations)).toMatch(/not model use|observational/i);

    const firstPage = await memory.page({ workspace: 'agent-core', limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPage = await memory.page({
      workspace: 'agent-core',
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(new Set([
      ...firstPage.items.map(item => item.id),
      ...secondPage.items.map(item => item.id),
    ]).size).toBe(firstPage.items.length + secondPage.items.length);

    const tampered = firstPage.nextCursor!.slice(0, -1)
      + (firstPage.nextCursor!.endsWith('A') ? 'B' : 'A');
    await expect(memory.page({ workspace: 'agent-core', cursor: tampered }))
      .rejects.toThrow('MEMORY_PAGE_CURSOR_INVALID');

    await memory.remember({
      content: 'snapshot drift record',
      category: 'page',
      provenance: { workspace: 'agent-core', files: [] },
    });
    await expect(memory.page({ workspace: 'agent-core', cursor: firstPage.nextCursor }))
      .rejects.toThrow('MEMORY_PAGE_CURSOR_STALE');
  });
});

describe('CODEMEM-P3 portable canonical Memory transfer', () => {
  it('previews without mutation, applies atomically, remaps links, and makes repeat import idempotent', async () => {
    const sourceEnv = await createMemoryService('agent-core-transfer-source-');
    const target = await sourceEnv.memory.remember({
      content: 'portable target record',
      category: 'portable',
      provenance: { workspace: 'agent-core', files: [] },
    });
    const source = await sourceEnv.memory.remember({
      content: 'portable source record',
      category: 'portable',
      provenance: { workspace: 'agent-core', files: [] },
      links: [{
        targetId: target.id,
        type: 'supports',
        strength: 0.8,
        evidenceRefs: ['memory:' + target.id],
      }],
    });

    const payload = await sourceEnv.memory.exportTransfer('agent-core');
    expect(payload.records).toHaveLength(2);
    expect(payload.records.some(record => record.sourceId === source.id)).toBe(true);

    const destinationEnv = await createMemoryService('agent-core-transfer-destination-');
    const before = await destinationEnv.memory.list();
    expect(before).toHaveLength(1);
    expect(before[0]?.pinned).toBe(true);

    const preview = await destinationEnv.memory.importTransfer(payload, { mode: 'preview' });
    expect(preview.mode).toBe('preview');
    expect(preview.creates).toHaveLength(2);
    expect(preview.rejected).toEqual([]);
    expect(await destinationEnv.memory.list()).toHaveLength(1);

    const applied = await destinationEnv.memory.importTransfer(payload, {
      mode: 'apply',
      confirmation: 'APPLY_MEMORY_IMPORT',
    });
    expect(applied.committed).toBe(true);
    expect(applied.createdIds).toHaveLength(2);

    const imported = (await destinationEnv.memory.list('agent-core')).filter(record => !record.pinned);
    expect(imported).toHaveLength(2);
    const importedSource = imported.find(record => record.content === 'portable source record');
    const importedTarget = imported.find(record => record.content === 'portable target record');
    expect(importedSource?.links[0]?.targetId).toBe(importedTarget?.id);
    expect(importedSource?.links[0]?.evidenceRefs).toContain('memory:' + importedTarget?.id);
    expect(importedSource?.provenance?.importKey).toMatch(/^sha256:[0-9a-f]{64}$/);

    const repeat = await destinationEnv.memory.importTransfer(payload, { mode: 'preview' });
    expect(repeat.creates).toHaveLength(0);
    expect(repeat.duplicates).toHaveLength(2);
    expect((await destinationEnv.memory.list()).filter(record => record.pinned)).toHaveLength(1);

    await expect(destinationEnv.memory.importTransfer(
      { ...payload, version: 'unsupported' },
      { mode: 'preview' },
    )).rejects.toThrow('MEMORY_TRANSFER_VERSION_INVALID');
  });
});

describe('TDB-P1 Learning state serialized transactions', () => {
  it('prevents lost same-file updates across store instances and enforces field ownership', async () => {
    const root = await tempRoot('agent-core-learning-state-');
    const paths = resolveLearningPaths(root);
    const left = new LearningStateStore(paths);
    const right = new LearningStateStore(paths);

    const calls = Array.from({ length: 20 }, (_, index) => {
      const store = index % 2 === 0 ? left : right;
      return store.mutate('checkpoint', current => ({
        state: {
          ...current,
          checkpointCount: current.checkpointCount + 1,
          sinceReview: current.sinceReview + 1,
          lastCheckpointAt: new Date(Date.UTC(2026, 8, 27, 10, 0, index)).toISOString(),
          recentIdempotency: [...current.recentIdempotency, {
            key: 'concurrent-' + index,
            at: new Date(Date.UTC(2026, 8, 27, 10, 0, index)).toISOString(),
          }],
        },
        result: index,
      }));
    });
    await Promise.all(calls);

    const final = await left.load();
    expect(final.checkpointCount).toBe(20);
    expect(final.sinceReview).toBe(20);
    expect(final.recentIdempotency).toHaveLength(20);

    await expect(left.mutate('checkpoint', current => ({
      state: { ...current, lastReviewAt: '2026-09-27T10:30:00.000Z' },
      result: null,
    }))).rejects.toThrow('LEARNING_STATE_OWNER_VIOLATION');
    expect((await left.load()).lastReviewAt).toBeNull();
  });
});

describe('CC-P4 Skill artifact source provenance', () => {
  it('persists source identity across revisions and requires explicit confirmation for lineage change', async () => {
    const project = await tempRoot('agent-core-skill-provenance-');
    const sourceA = path.join(project, 'source-a');
    const sourceB = path.join(project, 'source-b');
    await writeSkill(sourceA, 'provenance-skill', '# Source A');
    await writeSkill(sourceB, 'provenance-skill', '# Source B');

    const service = await SkillService.initialize(project, async value => path.resolve(value));
    const imported = await service.import(sourceA);
    expect(imported.sourceProvenance?.sourceKind).toBe('directory');
    expect(imported.sourceProvenance?.identity?.repositoryId).toMatch(/^sha256:/);

    const staged = await service.stageRevision(sourceB, ['evidence:source-change']);
    expect(staged.sourceProvenance?.identity?.repositoryId)
      .not.toBe(imported.sourceProvenance?.identity?.repositoryId);

    const revisions = await service.listRevisions('provenance-skill');
    expect(revisions.active.sourceProvenance?.identity?.repositoryId)
      .toBe(imported.sourceProvenance?.identity?.repositoryId);
    expect(revisions.staged[0]?.sourceProvenance?.identity?.repositoryId)
      .toBe(staged.sourceProvenance?.identity?.repositoryId);

    await expect(service.promoteRevision(
      'provenance-skill',
      staged.digest,
      imported.digest,
      'PROMOTE_SKILL_REVISION',
    )).rejects.toThrow('SKILL_REVISION_SOURCE_CHANGE_CONFIRMATION_REQUIRED');

    const promoted = await service.promoteRevision(
      'provenance-skill',
      staged.digest,
      imported.digest,
      'PROMOTE_SKILL_REVISION',
      'CONFIRM_SKILL_SOURCE_CHANGE',
    );
    expect(promoted.sourceLineageChanged).toBe(true);
    expect(promoted.active.sourceProvenance?.identity?.repositoryId)
      .toBe(staged.sourceProvenance?.identity?.repositoryId);

    const after = await service.listRevisions('provenance-skill');
    expect(after.history[0]?.sourceProvenance?.identity?.repositoryId)
      .toBe(imported.sourceProvenance?.identity?.repositoryId);
  });
});
