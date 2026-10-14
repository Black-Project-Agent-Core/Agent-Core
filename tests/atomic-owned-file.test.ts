import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeOwnedFileAtomic } from '../src/persistence/atomic-file.js';
import { NamedActionStore } from '../src/phone/named-actions.js';

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-atomic-owned-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('owned atomic persistence', () => {
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