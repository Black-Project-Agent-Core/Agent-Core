import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeOwnedFileAtomic } from '../src/persistence/atomic-file.js';
import { NamedActionStore } from '../src/phone/named-actions.js';

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const temporary = path.resolve(import.meta.dirname, '..', 'runtime', 'tmp');
  await mkdir(temporary, { recursive: true });
  const root = await mkdtemp(path.join(temporary, 'agent-core-atomic-owned-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('owned atomic persistence', () => {
  it('preserves original bytes and cleans staged data when final validation rejects', async () => {
    const root = await tempRoot();
    const file = path.join(root, 'USER.md');
    await writeOwnedFileAtomic(file, 'manual original');
    await expect(writeOwnedFileAtomic(file, 'replacement', {
      beforeReplace: () => { throw new Error('SOURCE_CHANGED'); },
    })).rejects.toThrow('SOURCE_CHANGED');
    expect(await readFile(file, 'utf8')).toBe('manual original');
    expect(await readdir(root)).toEqual(['USER.md']);
  });

  it('revalidates before each replace retry so a changed source is not overwritten', async () => {
    const root = await tempRoot();
    const file = path.join(root, 'USER.md');
    await writeOwnedFileAtomic(file, 'manual original');
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }));
    syncBuiltinESMExports();
    let checks = 0;
    await expect(writeOwnedFileAtomic(file, 'replacement', { retryDelayMs: 0, beforeReplace: () => {
      if (++checks === 2) throw new Error('SOURCE_CHANGED');
    } })).rejects.toThrow('SOURCE_CHANGED');
    expect(await readFile(file, 'utf8')).toBe('manual original');
    expect(checks).toBe(2);
    expect(await readdir(root)).toEqual(['USER.md']);
  });
  it('keeps concurrent writes whole and leaves no temp residue', async () => {
    const root = await tempRoot();
    const file = path.join(root, 'state.json');
    const payloads = Array.from({ length: 16 }, (_, index) => JSON.stringify({ index, value: 'x'.repeat(index + 1) }));

    await Promise.all(payloads.map(payload => writeOwnedFileAtomic(file, payload, { mode: 0o600 })));

    const final = await readFile(file, 'utf8');
    expect(payloads).toContain(final);
    const entries = await readdir(root);
    expect(entries.filter(name => name.includes('.tmp-'))).toEqual([]);
  });

  it('migrates phone named-action persistence without deterministic PID temp files', async () => {
    const root = await tempRoot();
    const store = new NamedActionStore(root, 'device:1');

    await Promise.all([
      store.put('one', 10, 20, true),
      store.put('two', 30, 40, false),
      store.put('three', 50, 60, true),
    ]);

    const entries = await readdir(root);
    expect(entries.some(name => name.endsWith('.tmp'))).toBe(false);
    const actionsFile = entries.find(name => name.startsWith('actions-') && name.endsWith('.json'));
    expect(actionsFile).toBeTruthy();
    const parsed = JSON.parse(await readFile(path.join(root, actionsFile!), 'utf8'));
    expect(Object.keys(parsed).length).toBeGreaterThanOrEqual(1);
  });
});
