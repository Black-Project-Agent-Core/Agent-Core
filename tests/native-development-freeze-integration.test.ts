import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configManager } from '../src/rdc/config-manager.js';
import { nativeDevelopmentFreeze } from '../src/rdc/mutation-coordinator.js';
import { FileCheckpointService } from '../src/rdc/checkpoints/service.js';
import { handleEditBlock } from '../src/rdc/tools/edit.js';
import { createDirectory, moveFile, writeFile as toolWriteFile, writePdf } from '../src/rdc/tools/filesystem.js';
import { readSemanticSource, writeSemanticSourceAtomic } from '../src/semantic-ide/source-io.js';
import { applyWorkspacePlans, planWorkspaceEdit } from '../src/semantic-ide/transaction.js';

let root: string;
const samePath = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function freeze(target: string) {
  return vi.spyOn(nativeDevelopmentFreeze, 'assertWritable').mockImplementation(async candidate => {
    if (samePath(candidate) === samePath(target)) throw new Error('NATIVE_AGENT_FROZEN');
  });
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'native-freeze-integration-'));
  vi.spyOn(configManager, 'getConfig').mockResolvedValue({ allowedDirectories: [root] });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it.each(['rewrite', 'append'] as const)('blocks %s before file changes or checkpoint hooks', async mode => {
  const file = path.join(root, 'sample.txt');
  await writeFile(file, 'before');
  const guard = freeze(file), beforeWrite = vi.fn();
  await expect(toolWriteFile(file, 'after', mode, beforeWrite)).rejects.toThrow('NATIVE_AGENT_FROZEN');
  expect(await readFile(file, 'utf8')).toBe('before');
  expect(beforeWrite).not.toHaveBeenCalled();
  const next = guard.mock.calls[0][1];
  expect(typeof next === 'function' ? await next() : next).toBe(mode === 'append' ? 'beforeafter' : 'after');
});

it('blocks text edit through the ordinary edit handler', async () => {
  const file = path.join(root, 'sample.txt');
  await writeFile(file, 'before\n');
  freeze(file);
  await expect(handleEditBlock({ file_path: file, old_string: 'before', new_string: 'after' }))
    .rejects.toThrow('NATIVE_AGENT_FROZEN');
  expect(await readFile(file, 'utf8')).toBe('before\n');
});

it.each(['source', 'destination'] as const)('blocks a move when its %s is frozen', async frozen => {
  const source = path.join(root, 'source.txt'), destination = path.join(root, 'destination.txt');
  await writeFile(source, 'source');
  await writeFile(destination, 'destination');
  freeze(frozen === 'source' ? source : destination);
  const beforeMove = vi.fn();
  await expect(moveFile(source, destination, beforeMove)).rejects.toThrow('NATIVE_AGENT_FROZEN');
  expect(await readFile(source, 'utf8')).toBe('source');
  expect(await readFile(destination, 'utf8')).toBe('destination');
  expect(beforeMove).not.toHaveBeenCalled();
});

it('blocks the PDF output before attempting PDF parsing or changing either file', async () => {
  const source = path.join(root, 'source.pdf'), destination = path.join(root, 'destination.pdf');
  await writeFile(source, 'invalid PDF fixture');
  await writeFile(destination, 'preserve output');
  freeze(destination);
  await expect(writePdf(source, [], destination)).rejects.toThrow('NATIVE_AGENT_FROZEN');
  expect(await readFile(source, 'utf8')).toBe('invalid PDF fixture');
  expect(await readFile(destination, 'utf8')).toBe('preserve output');
});

it('blocks directory creation before creating any directory', async () => {
  const directory = path.join(root, 'new-directory');
  freeze(directory);
  await expect(createDirectory(directory)).rejects.toThrow('NATIVE_AGENT_FROZEN');
  expect(await readdir(root)).toEqual([]);
});

it.each([false, true])('validates every semantic target before any write (custom writer: %s)', async custom => {
  const first = path.join(root, 'first.ts'), second = path.join(root, 'second.ts');
  await writeFile(first, 'const first = 1;\n');
  await writeFile(second, 'const second = 2;\n');
  const plans = await planWorkspaceEdit(root, { changes: Object.fromEntries([first, second].map(file => [
    pathToFileURL(file).href,
    [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, newText: 'let' }],
  ])) });
  const guard = freeze(second), writer = vi.fn(async (file: string, content: string) => writeFile(file, content));
  expect(await applyWorkspacePlans(plans, { dryRun: true })).toMatchObject({ dryRun: true, changedFiles: 2 });
  expect(guard).not.toHaveBeenCalled();
  await expect(applyWorkspacePlans(plans, custom ? { atomicWriter: writer } : {})).rejects.toThrow('NATIVE_AGENT_FROZEN');
  expect(writer).not.toHaveBeenCalled();
  expect(await readFile(first, 'utf8')).toBe('const first = 1;\n');
  expect(await readFile(second, 'utf8')).toBe('const second = 2;\n');
});

it('blocks direct semantic atomic writes before creating a temporary file', async () => {
  const file = path.join(root, 'sample.ts');
  await writeFile(file, 'const before = 1;\n');
  const source = await readSemanticSource(root, file);
  freeze(file);
  await expect(writeSemanticSourceAtomic(root, file, 'const after = 2;\n', source)).rejects.toThrow('NATIVE_AGENT_FROZEN');
  expect(await readFile(file, 'utf8')).toBe(source.text);
  expect(await readdir(root)).toEqual(['sample.ts']);
});

it('allows checkpoint capture and preview but refuses restore before changing any target or checkpoint state', async () => {
  const first = path.join(root, 'first.txt'), second = path.join(root, 'second.txt');
  await writeFile(first, 'first');
  await writeFile(second, 'second');
  const guard = freeze(second);
  const storage = path.join(root, 'checkpoints'), service = new FileCheckpointService(root, storage);
  const checkpoint = await service.create([first, second], 'before');
  await writeFile(first, 'changed first');
  await writeFile(second, 'changed second');
  const preview = await service.previewRestore(checkpoint.id);
  expect(preview.changes).toHaveLength(2);
  expect(guard).not.toHaveBeenCalled();
  const stateBefore = await readFile(path.join(storage, 'state.json'), 'utf8');
  await expect(service.restore(checkpoint.id, preview.previewDigest)).rejects.toThrow('NATIVE_AGENT_FROZEN');
  expect(await readFile(first, 'utf8')).toBe('changed first');
  expect(await readFile(second, 'utf8')).toBe('changed second');
  expect(await readFile(path.join(storage, 'state.json'), 'utf8')).toBe(stateBefore);
});
