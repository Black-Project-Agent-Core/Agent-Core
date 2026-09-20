import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertRegularFile,
  readRegularFileBounded,
  regularFileGuardState,
} from '../src/rdc/utils/files/safe-regular-file.js';
import { readFileFromDisk, readFileInternal } from '../src/rdc/tools/filesystem.js';

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-safe-file-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('safe regular-file I/O', () => {
  it('reads an exact byte bound without falsely reporting truncation', async () => {
    const root = await fixture();
    const file = path.join(root, 'exact.txt');
    await writeFile(file, '1234', 'utf8');

    const result = await readRegularFileBounded(file, 4);
    expect(result.buffer.toString('utf8')).toBe('1234');
    expect(result.size).toBe(4);
    expect(result.truncated).toBe(false);
    expect(regularFileGuardState()).toEqual({ activeOpens: 0, waiting: 0 });
  });

  it('reports over-limit content truthfully while returning only the bounded prefix', async () => {
    const root = await fixture();
    const file = path.join(root, 'over.txt');
    await writeFile(file, '12345', 'utf8');

    const result = await readRegularFileBounded(file, 4);
    expect(result.buffer.toString('utf8')).toBe('1234');
    expect(result.size).toBe(5);
    expect(result.truncated).toBe(true);
    expect(regularFileGuardState()).toEqual({ activeOpens: 0, waiting: 0 });
  });

  it('refuses non-regular paths before content handlers can open them', async () => {
    const root = await fixture();
    const dir = path.join(root, 'not-a-file');
    await mkdir(dir);

    await expect(assertRegularFile(dir)).rejects.toThrow(/SAFE_REGULAR_FILE_REFUSED/);
    expect(regularFileGuardState()).toEqual({ activeOpens: 0, waiting: 0 });
  });

  it('keeps normal read_file pagination and internal exact-text reads compatible', async () => {
    const root = await fixture();
    const file = path.join(root, 'sample.txt');
    await writeFile(file, 'one\ntwo\nthree\n', 'utf8');

    const publicRead = await readFileFromDisk(file, { offset: 1, length: 1 });
    expect(String(publicRead.content)).toContain('two');

    const internalRead = await readFileInternal(file, 0, Number.MAX_SAFE_INTEGER);
    expect(internalRead).toBe('one\ntwo\nthree\n');
    expect(regularFileGuardState()).toEqual({ activeOpens: 0, waiting: 0 });
  });

  it('preserves the existing directory fallback instead of misclassifying directories as files', async () => {
    const root = await fixture();
    const dir = path.join(root, 'folder');
    await mkdir(dir);
    await writeFile(path.join(dir, 'child.txt'), 'ok', 'utf8');

    const result = await readFileFromDisk(dir, { offset: 0, length: 10 });
    expect(result.metadata?.isDirectory).toBe(true);
    expect(String(result.content)).toContain('child.txt');
  });
});
