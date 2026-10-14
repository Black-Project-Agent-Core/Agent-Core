import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileCheckpointService } from '../src/rdc/checkpoints/service.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-checkpoint-'));
  roots.push(root);
  return { root, service: new FileCheckpointService(root, path.join(root, 'runtime', 'checkpoints')) };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('file checkpoint service', () => {
  it('restores exact bytes and preserves a branch after rewind', async () => {
    const { root, service } = await fixture();
    const file = path.join(root, 'sample.txt');
    await writeFile(file, 'one', 'utf8');
    const first = await service.create([file], 'first');
    await writeFile(file, 'two', 'utf8');
    const second = await service.create([file], 'second');
    await writeFile(file, 'three', 'utf8');

    const preview = await service.previewRestore(first.id);
    expect(preview.changes).toHaveLength(1);
    await service.restore(first.id, preview.previewDigest);
    expect(await readFile(file, 'utf8')).toBe('one');

    await writeFile(file, 'branch', 'utf8');
    const branch = await service.create([file], 'branch');
    const list = await service.list();
    const firstRow = list.find(row => row.id === first.id)!;
    expect(firstRow.children).toEqual(expect.arrayContaining([second.id, branch.id]));
  });

  it('restores absence and rejects a stale restore preview', async () => {
    const { root, service } = await fixture();
    const file = path.join(root, 'created-later.txt');
    const absent = await service.create([file], 'absent');
    await writeFile(file, 'created', 'utf8');
    const preview = await service.previewRestore(absent.id);
    await writeFile(file, 'changed-after-preview', 'utf8');
    await expect(service.restore(absent.id, preview.previewDigest)).rejects.toThrow(/CHECKPOINT_RESTORE_PREVIEW_STALE/);

    const fresh = await service.previewRestore(absent.id);
    await service.restore(absent.id, fresh.previewDigest);
    await expect(readFile(file, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses protected paths', async () => {
    const { root, service } = await fixture();
    const protectedDir = path.join(root, 'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT');
    await mkdir(protectedDir, { recursive: true });
    const file = path.join(protectedDir, 'reference.txt');
    await writeFile(file, 'reference', 'utf8');
    await expect(service.create([file], 'protected')).rejects.toThrow(/CHECKPOINT_PATH_NOT_AUTHORIZED/);
  });
});
