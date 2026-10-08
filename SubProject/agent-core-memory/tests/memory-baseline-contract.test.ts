import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeStandaloneMemory } from '../src/index.js';

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-baseline-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

// These assertions deliberately characterize v1 gaps. They do not claim that
// legacy search has bounded DTO serialization or historical fact selection.
describe('legacy memory baseline contract', () => {
  it('serializes the full record even when delivery contains only a budgeted preview', async () => {
    const memory = await initializeStandaloneMemory({ baseDir: await temporaryRoot() });
    const content = ('baseline serialization needle ' + 'Synthetic durable body. '.repeat(300)).trimEnd();
    const saved = await memory.remember({ title: 'Serialization fixture', content });
    const budgetChars = 500;
    const results = await memory.search('baseline serialization needle', {
      limit: 1,
      maxNeighbors: 0,
      budgetChars,
    });

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.record.id).toBe(saved.id);
    expect(result.delivery.detail).toBe('preview');
    expect(result.delivery.truncated).toBe(true);
    expect(result.delivery.content.length).toBeLessThan(content.length);
    const serialized = JSON.stringify(results);
    expect(JSON.parse(serialized)[0].record.content).toBe(content);
    expect(serialized.length).toBeGreaterThan(budgetChars);
  });

  it('applies current expiry filtering before an asOf query from before expiry', async () => {
    const memory = await initializeStandaloneMemory({ baseDir: await temporaryRoot() });
    const saved = await memory.remember({
      content: 'baseline expired historical fixture',
      expiresAt: '2001-01-01T00:00:00.000Z',
    });

    expect((await memory.read(saved.id, false))?.content).toBe(saved.content);
    const eligible = await memory.remember({content:'baseline expired historical fixture eligible control'});
    const results = await memory.search('baseline expired historical fixture', {
      asOf: '2000-01-01T00:00:00.000Z',
      maxNeighbors: 0,
      limit: 10,
    });
    expect(results.some(item => item.record.id === saved.id)).toBe(false);
    expect(results.some(item => item.record.id === eligible.id)).toBe(true);
  });

  it('applies currently active supersession before an asOf query from before the link interval', async () => {
    const memory = await initializeStandaloneMemory({ baseDir: await temporaryRoot() });
    const old = await memory.remember({ content: 'baseline superseded historical fixture' });
    const replacement = await memory.remember({
      content: 'baseline replacement fixture',
      links: [{
        targetId: old.id,
        type: 'supersedes',
        strength: 1,
        validFrom: '2001-01-01T00:00:00.000Z',
        validTo: '2099-01-01T00:00:00.000Z',
      }],
    });

    expect(replacement.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: old.id, type: 'supersedes' }),
    ]));
    expect((await memory.read(old.id, false))?.content).toBe(old.content);
    const eligible=await memory.remember({content:'baseline superseded historical fixture eligible control'});
    const results = await memory.search('baseline superseded historical fixture', {
      asOf: '2000-01-01T00:00:00.000Z',
      maxNeighbors: 0,
      limit: 10,
    });
    expect(results.some(item => item.record.id === old.id)).toBe(false);
    expect(results.some(item => item.record.id === eligible.id)).toBe(true);
  });

  it('applies current forgotten lifecycle to asOf search while retaining canonical content', async () => {
    const memory = await initializeStandaloneMemory({ baseDir: await temporaryRoot() });
    const saved = await memory.remember({ content: 'baseline forgotten historical fixture' });
    await memory.lifecycle(saved.id, 'baseline-forget-event', 'forget');

    expect((await memory.lifecycleState(saved.id)).forgotten).toBe(true);
    expect((await memory.read(saved.id, false))?.content).toBe(saved.content);
    const results = await memory.search('baseline forgotten historical fixture', {
      asOf: '2000-01-01T00:00:00.000Z',
      maxNeighbors: 0,
      limit: 10,
    });
    expect(results.some(item => item.record.id === saved.id)).toBe(false);
  });

  it('recalls a built standalone record after the writer process exits in a temporary root', async () => {
    const root = await temporaryRoot();
    const entry = new URL('../dist/index.js', import.meta.url).href;
    const writer = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const { initializeStandaloneMemory } = await import(process.argv[1]);
      const memory = await initializeStandaloneMemory({ baseDir: process.argv[2] });
      const saved = await memory.remember({ content: 'baseline child process durable fixture' });
      const results = await memory.search('baseline child process durable fixture', { maxNeighbors: 0 });
      assert(results.some(item => item.record.id === saved.id));
      console.log(JSON.stringify({ id: saved.id, content: saved.content }));
    `, entry, root], { encoding: 'utf8', timeout: 15_000 });
    expect(writer.error).toBeUndefined();
    expect(writer.stderr).toBe('');
    expect(writer.status, writer.stdout + writer.stderr).toBe(0);
    const saved = JSON.parse(writer.stdout.trim());

    const reader = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const { initializeStandaloneMemory } = await import(process.argv[1]);
      const memory = await initializeStandaloneMemory({ baseDir: process.argv[2] });
      const record = await memory.read(process.argv[3], false);
      assert.equal(record?.content, 'baseline child process durable fixture');
      const results = await memory.search('baseline child process durable fixture', { maxNeighbors: 0 });
      assert(results.some(item => item.record.id === record.id));
      assert.equal((await memory.refreshHealth()).status, 'available');
      console.log('process-restart-ok');
    `, entry, root, saved.id], { encoding: 'utf8', timeout: 15_000 });
    expect(reader.error).toBeUndefined();
    expect(reader.stderr).toBe('');
    expect(reader.status, reader.stdout + reader.stderr).toBe(0);
    expect(reader.stdout.trim()).toBe('process-restart-ok');
  });
});
