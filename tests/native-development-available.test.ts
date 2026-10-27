import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configManager } from '../src/rdc/config-manager.js';
import { writeFile as toolWriteFile } from '../src/rdc/tools/filesystem.js';
import { readSemanticSource, writeSemanticSourceAtomic } from '../src/semantic-ide/source-io.js';
import { FileCheckpointService } from '../src/rdc/checkpoints/service.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'native-development-'));
  vi.spyOn(configManager, 'getConfig').mockResolvedValue({ allowedDirectories: [root] });
  await mkdir(path.join(root, 'src'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it('allows authorized Native source writes, semantic edits and checkpoint restore through existing owners', async () => {
  const file = path.join(root, 'src', 'agent-fixture.ts');
  await toolWriteFile(file, 'export const value = 1;\n');
  const checkpoints = new FileCheckpointService(root, path.join(root, 'checkpoints'));
  const checkpoint = await checkpoints.create([file], 'before edit');
  const source = await readSemanticSource(root, file);
  await writeSemanticSourceAtomic(root, file, 'export const value = 2;\n', source);
  expect(await readFile(file, 'utf8')).toContain('value = 2');
  const preview = await checkpoints.previewRestore(checkpoint.id);
  await checkpoints.restore(checkpoint.id, preview.previewDigest);
  expect(await readFile(file, 'utf8')).toBe('export const value = 1;\n');
});

it('retains allowed-directory and semantic workspace boundaries', async () => {
  const outside = path.join(root, '..', 'native-source-outside-' + path.basename(root) + '.ts');
  await expect(toolWriteFile(outside, 'not allowed')).rejects.toThrow();
  const own = path.join(root, 'src', 'agent-fixture.ts');
  await writeFile(own, 'export const value = 1;\n');
  const source = await readSemanticSource(root, own);
  await expect(writeSemanticSourceAtomic(path.join(root, 'src'), path.join(root, 'outside.ts'), 'not allowed', source)).rejects.toThrow();
});
