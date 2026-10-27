import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, rename, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectProjectStructure, synchronizeProjectStructure, withProjectStructureMutation } from '../src/portability/project-structure.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) || !path.basename(root).startsWith('project-structure-'))
      throw new Error('Unsafe test cleanup');
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'project-structure-'));
  roots.push(root);
  await mkdir(path.join(root, 'docs'));
  await writeFile(path.join(root, 'docs/PATH-GOVERNANCE.md'), '# Paths\n');
  await writeFile(path.join(root, 'docs/PROJECT-STRUCTURE.md'), [
    '# Folder map', '', '<!-- DIRECTORY-POLICY:START -->', '```json',
    JSON.stringify({ version: 1, owners: [{ purpose: 'documentation', path: 'docs' }], directoryIntents: [] }),
    '```', '<!-- DIRECTORY-POLICY:END -->', '', '<!-- DIRECTORY-SNAPSHOT:START -->',
    'Old snapshot deliberately does not list the new folder.', '<!-- DIRECTORY-SNAPSHOT:END -->', '',
  ].join('\n'));
  return root;
}

it('path:check fails on a stale folder map instead of accepting an undocumented new home', async () => {
  const root = await fixture();
  await mkdir(path.join(root, 'docs/new-home'));
  const run = spawnSync(process.execPath, [path.join(projectRoot, 'scripts/portability/check-path-policy.mjs'), '--root', root], { encoding: 'utf8' });
  expect(run.status, run.stdout + run.stderr).not.toBe(0);
  expect(run.stdout + run.stderr).toMatch(/project.structure|structure.*(stale|drift|undeclared)/i);
  expect(await readFile(path.join(root, 'docs/PROJECT-STRUCTURE.md'), 'utf8')).toContain('Old snapshot');
});

it('synchronizes the generated block only and then detects out-of-band folder changes without blessing them', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  const before = await readFile(path.join(root, 'docs/PROJECT-STRUCTURE.md'), 'utf8');
  expect(before).toContain('docs/');
  expect(before).toContain('# Folder map');
  expect((await inspectProjectStructure(root)).issues).toEqual([]);
  await mkdir(path.join(root, 'docs/undeclared'));
  expect((await inspectProjectStructure(root)).issues.join(' ')).toMatch(/undeclared.*docs\/undeclared/);
  await expect(synchronizeProjectStructure(root)).rejects.toThrow(/undeclared/);
  expect(await readFile(path.join(root, 'docs/PROJECT-STRUCTURE.md'), 'utf8')).toBe(before);
});

async function intent(root: string, entries: unknown[]) {
  const file = path.join(root, 'docs/PROJECT-STRUCTURE.md');
  const text = await readFile(file, 'utf8');
  const policy = { version: 1, owners: [{ purpose: 'documentation', path: 'docs' }], directoryIntents: entries };
  await writeFile(file, text.replace(/```json\n[\s\S]*?\n```/, '```json\n' + JSON.stringify(policy) + '\n```'));
}

it('creates a declared recursive subtree and immediately synchronizes its actual directories', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  await intent(root, [{ path: 'docs/manual/chapters', purpose: 'manual-chapters', owner: 'docs' }]);
  const target = path.join(root, 'docs/manual/chapters');
  await withProjectStructureMutation(root, { kind: 'create-directory', destination: target }, () => mkdir(target, { recursive: true }));
  const text = await readFile(path.join(root, 'docs/PROJECT-STRUCTURE.md'), 'utf8');
  expect(text).toContain('manual/');
  expect(text).toContain('chapters/');
  expect((await inspectProjectStructure(root)).issues).toEqual([]);
});

it('refuses undeclared creation before its callback has a filesystem side effect', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  const target = path.join(root, 'docs/other');
  let ran = false;
  await expect(withProjectStructureMutation(root, { kind: 'create-directory', destination: target }, async () => {
    ran = true; await mkdir(target);
  })).rejects.toThrow(/undeclared/);
  expect(ran).toBe(false);
});

it('refuses copied sibling names even when the caller invents a different declared purpose', async () => {
  const root = await fixture();
  await intent(root, [{ path: 'docs/reports', purpose: 'reports', owner: 'docs' }]);
  await mkdir(path.join(root, 'docs/reports'));
  await synchronizeProjectStructure(root);
  await intent(root, [{ path: 'docs/reports', purpose: 'reports', owner: 'docs' },
    { path: 'docs/reports-copy', purpose: 'reports-again', owner: 'docs' }]);
  const target = path.join(root, 'docs/reports-copy');
  await expect(withProjectStructureMutation(root, { kind: 'create-directory', destination: target }, () => mkdir(target))).rejects.toThrow(/duplicate.*reports-copy/);
  expect((await inspectProjectStructure(root)).issues).toEqual([]);
});

it('refuses one purpose being declared at two homes instead of accepting a new name', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  await intent(root, [{ path: 'docs/another', purpose: 'documentation', owner: 'docs' }]);
  let ran = false;
  await expect(withProjectStructureMutation(root, { kind: 'create-directory', destination: path.join(root, 'docs/another') }, async () => { ran = true; })).rejects.toThrow(/duplicate purpose.*reuse docs/);
  expect(ran).toBe(false);
});

it('serializes concurrent creations so both directories remain in the map', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  await intent(root, ['alpha', 'beta'].map(name => ({ path: 'docs/' + name, purpose: name, owner: 'docs' })));
  await Promise.all(['alpha', 'beta'].map(name => {
    const target = path.join(root, 'docs', name);
    return withProjectStructureMutation(root, { kind: 'create-directory', destination: target }, () => mkdir(target));
  }));
  const text = await readFile(path.join(root, 'docs/PROJECT-STRUCTURE.md'), 'utf8');
  expect(text).toContain('alpha/'); expect(text).toContain('beta/');
  expect((await inspectProjectStructure(root)).issues).toEqual([]);
});

it('does not let a regular-file move remove the canonical folder map', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  const source = path.join(root, 'docs/PROJECT-STRUCTURE.md'), destination = path.join(root, 'docs/old-map.md');
  await expect(withProjectStructureMutation(root, { kind: 'move', source, destination }, () => rename(source, destination))).rejects.toThrow(/canonical.*map|map.*relocat/i);
  await expect(access(source)).resolves.toBeUndefined();
});

it('rejects relocating the project root instead of treating its empty relative path as an external source', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  let ran = false;
  await expect(withProjectStructureMutation(root, { kind: 'move', source: root, destination: root + '-relocated' }, async () => { ran = true; })).rejects.toThrow(/root|canonical/i);
  expect(ran).toBe(false);
});

it('keeps the original Skill home protected even when a declaration omits the legacy alias list', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  const file = path.join(root, 'docs/PROJECT-STRUCTURE.md');
  const text = await readFile(file, 'utf8');
  await writeFile(file, text.replace(/```json\n[\s\S]*?\n```/, '```json\n' + JSON.stringify({ version: 1,
    owners: [{ purpose: 'documentation', path: 'docs' }, { purpose: 'invented-home', path: 'bundled-skills' }], directoryIntents: [] }) + '\n```'));
  let ran = false;
  await expect(withProjectStructureMutation(root, { kind: 'create-directory', destination: path.join(root, 'bundled-skills') }, async () => { ran = true; })).rejects.toThrow(/parallel.*runtime\/skills/);
  expect(ran).toBe(false);
});

it('refuses a casing-only second name at admission instead of producing duplicate map keys', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  let ran = false;
  await expect(withProjectStructureMutation(root, { kind: 'create-directory', destination: path.join(root, 'DOCS') }, async () => { ran = true; })).rejects.toThrow(/duplicate|casing/i);
  expect(ran).toBe(false);
});

it('does not read a map through a linked docs parent or create its lock outside the root', async () => {
  const root = await fixture(), other = await fixture();
  await rm(path.join(root, 'docs'), { recursive: true, force: true });
  await symlink(path.join(other, 'docs'), path.join(root, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
  expect((await inspectProjectStructure(root)).issues.join(' ')).toMatch(/parent.*link/i);
  await expect(synchronizeProjectStructure(root)).rejects.toThrow(/parent.*link/i);
  await expect(access(path.join(other, 'docs/.PROJECT-STRUCTURE.md.lock'))).rejects.toThrow();
});

it('exports a release source snapshot as a distinct managed role instead of disabling checks in installed packages', async () => {
  const root = await fixture();
  await synchronizeProjectStructure(root);
  await mkdir(path.join(root, 'source/src'), { recursive: true });
  const { finalizePackagedStructure } = await import('../scripts/release/packaging-policy.mjs');
  await finalizePackagedStructure(root);
  const text = await readFile(path.join(root, 'docs/PROJECT-STRUCTURE.md'), 'utf8');
  expect(text).toContain('packaged-source-snapshot');
  expect(text).toContain('source/  [snapshot source paket rilis; bukan rumah authoring]');
  expect((await inspectProjectStructure(root)).issues).toEqual([]);
  await mkdir(path.join(root, 'unrelated-home'));
  await expect(finalizePackagedStructure(root)).rejects.toThrow(/undeclared.*unrelated-home/);
});

it('keeps the live generated map mutable without excluding the source snapshot or architecture docs from integrity', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'docs/CODEBASE.md'), '# Architecture');
  await mkdir(path.join(root, 'source/docs'), { recursive: true });
  await writeFile(path.join(root, 'source/docs/PROJECT-STRUCTURE.md'), 'immutable source snapshot');
  const { buildIntegrityManifest } = await import('../scripts/release/integrity-manifest.mjs');
  const manifest = await buildIntegrityManifest(root, { product: 'Agent Core', version: '0.15.0' });
  expect(manifest.files.map((row: { path: string }) => row.path)).not.toContain('docs/PROJECT-STRUCTURE.md');
  expect(manifest.files.map((row: { path: string }) => row.path)).toContain('source/docs/PROJECT-STRUCTURE.md');
  expect(manifest.files.map((row: { path: string }) => row.path)).toContain('docs/CODEBASE.md');
});
