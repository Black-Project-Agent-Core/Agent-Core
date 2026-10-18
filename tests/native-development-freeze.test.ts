import { createHash } from 'node:crypto';
import { link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeDevelopmentFreeze } from '../src/native-development-freeze.js';

const roots: string[] = [];
const hash = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const nativeText = 'export const native = "frozen";\n';
const section = '// NATIVE START\nconst native = "frozen";\n// NATIVE END';
const sharedText = 'const external = 1;\n' + section + '\n';

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('native-freeze-')) {
      throw new Error('Refusing cleanup outside the isolated fixture');
    }
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'native-freeze-'));
  roots.push(directory);
  const root = path.join(directory, 'project');
  const manifestPath = path.join(root, 'scripts/governance/native-freeze.json');
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  const native = path.join(root, 'src/agent-native.ts');
  const shared = path.join(root, 'src/shared.ts');
  const manifest = { version: 1, files: { 'src/agent-native.ts': hash(nativeText) }, sections: {
    'src/shared.ts': [{ start: '// NATIVE START', end: '// NATIVE END', sha256: hash(section) }],
  } };
  await writeFile(native, nativeText);
  await writeFile(shared, sharedText);
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { directory, root, manifestPath, manifest, native, shared, guard: new NativeDevelopmentFreeze(root) };
}

describe('Native development freeze', () => {
  it('blocks Native writes, ancestor moves, compiled outputs, and governance changes', async () => {
    const f = await fixture();
    for (const target of [f.native, path.dirname(f.native), f.root,
      path.join(f.root, 'dist/agent-native.js'), path.join(f.root, 'dist/shared.js'),
      f.manifestPath, path.join(f.root, 'src/native-development-freeze.ts'),
      path.join(f.root, 'src/rdc/mutation-coordinator.ts')]) {
      await expect(f.guard.assertWritable(target, nativeText)).rejects.toThrow('NATIVE_AGENT_FROZEN');
    }
  });

  it('resolves a directory symlink alias before admitting a Native write', async () => {
    const f = await fixture();
    const alias = path.join(f.directory, 'alias');
    await symlink(path.join(f.root, 'src'), alias, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(f.guard.assertWritable(path.join(alias, 'agent-native.ts'), 'changed'))
      .rejects.toThrow('NATIVE_AGENT_FROZEN');
  });

  it('rejects new Native owners while retaining the existing shared Learning owners', async () => {
    const f = await fixture();
    const target = path.join(f.root, 'src/agent-new-native.ts');
    await expect(f.guard.assertWritable(target, 'new Native')).rejects.toThrow('NATIVE_AGENT_FROZEN');
    await expect(f.guard.assertWritable(path.join(f.root, 'src/agent-learning-loop.ts'), 'external Learning'))
      .resolves.toBeUndefined();
    await writeFile(target, 'new Native');
    await expect(f.guard.verify()).rejects.toThrow('new Native owner');
  });

  it.skipIf(process.platform !== 'win32')('blocks Windows case aliases and alternate data streams', async () => {
    const f = await fixture();
    await expect(f.guard.assertWritable(f.native.toUpperCase(), 'changed')).rejects.toThrow('NATIVE_AGENT_FROZEN');
    await expect(f.guard.assertWritable(f.native + ':alternate', 'changed')).rejects.toThrow('NATIVE_AGENT_FROZEN');
  });

  it('rejects a hard-link alias outside the project without blocking unrelated hard links', async () => {
    const f = await fixture();
    const alias = path.join(f.directory, 'native-alias.ts');
    await link(f.native, alias);
    await expect(f.guard.assertWritable(alias, 'changed')).rejects.toThrow('NATIVE_AGENT_FROZEN');
    const external = path.join(f.directory, 'external.ts');
    await writeFile(external, 'external');
    await link(external, path.join(f.directory, 'external-alias.ts'));
    await expect(f.guard.assertWritable(external, 'changed')).resolves.toBeUndefined();
  });

  it('allows an external-only shared edit and verifies the retained Native section', async () => {
    const f = await fixture();
    const next = sharedText.replace('external = 1', 'external = 2');
    await expect(f.guard.assertWritable(f.shared, next)).resolves.toBeUndefined();
    await writeFile(f.shared, next);
    await expect(f.guard.verify()).resolves.toEqual({ files: 1, sections: 1 });
    await expect(f.guard.assertWritable(f.shared)).rejects.toThrow('NATIVE_AGENT_FROZEN');
  });

  it.each([
    sharedText.replace('native = "frozen"', 'native = "changed"'),
    sharedText.replace(section, ''),
    sharedText + '\n// NATIVE START',
    sharedText + '\n// NATIVE END',
    '// NATIVE END\n// NATIVE START',
  ])('rejects changed, removed, duplicated, or reordered protected sections (%#)', async next => {
    const f = await fixture();
    await expect(f.guard.assertWritable(f.shared, next)).rejects.toThrow('NATIVE_AGENT_FROZEN');
  });

  it('allows reads, new snapshots, unrelated project files, and outside-project writes', async () => {
    const f = await fixture();
    expect(await readFile(f.native, 'utf8')).toBe(nativeText);
    for (const target of [path.join(f.root, 'runtime/checkpoints/native.snapshot'),
      path.join(f.root, 'src/external.ts'), path.join(f.directory, 'outside/result.txt')]) {
      await expect(f.guard.assertWritable(target, nativeText)).resolves.toBeUndefined();
    }
  });

  it.each([null, { version: 2 }, { version: 1, files: {}, sections: {} },
    { version: 1, files: { '../escape.ts': hash(nativeText) }, sections: {} },
    { version: 1, files: { 'src/native.ts': 'invalid-hash' }, sections: {} },
  ])('fails closed inside the project when the baseline is missing or invalid (%#)', async manifest => {
    const f = await fixture();
    if (manifest === null) await rm(f.manifestPath);
    else await writeFile(f.manifestPath, JSON.stringify(manifest));
    await expect(f.guard.assertWritable(path.join(f.root, 'src/external.ts'), 'external'))
      .rejects.toThrow('NATIVE_AGENT_FROZEN');
    await expect(f.guard.assertWritable(path.join(f.directory, 'outside.txt'), 'outside')).resolves.toBeUndefined();
  });

  it.each(['changed', 'missing'])('verification rejects a %s Native file', async state => {
    const f = await fixture();
    if (state === 'missing') await rm(f.native);
    else await writeFile(f.native, 'modified');
    await expect(f.guard.verify()).rejects.toThrow('NATIVE_AGENT_FROZEN');
  });

  it('normalizes CRLF for full files and protected sections', async () => {
    const f = await fixture();
    await writeFile(f.native, nativeText.replaceAll('\n', '\r\n'));
    await writeFile(f.shared, sharedText.replaceAll('\n', '\r\n'));
    await expect(f.guard.verify()).resolves.toEqual({ files: 1, sections: 1 });
    await expect(f.guard.assertWritable(f.shared, sharedText.replaceAll('\n', '\r\n'))).resolves.toBeUndefined();
  });
});
