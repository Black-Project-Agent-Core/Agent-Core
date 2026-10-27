import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectSkillStorageLayout } from '../scripts/portability/skill-storage-layout.mjs';

const fixtures: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-storage-policy-'));
  fixtures.push(root);
  return root;
}
async function directory(root: string, relative: string) {
  const target = path.join(root, relative);
  await mkdir(target, { recursive: true });
  return target;
}
async function artifact(root: string, relative: string) {
  const target = await directory(root, relative);
  await writeFile(path.join(target, 'SKILL.md'), '---\nname: sample\ndescription: sample\n---\n');
}
afterEach(async () => {
  for (const root of fixtures.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)
      || !path.basename(root).startsWith('skill-storage-policy-')) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});

it('accepts separate source, active, history, staged and export ownership without treating managed copies as clutter', async () => {
  const root = await fixture();
  await artifact(root, 'runtime/skills/capability-packs/sample');
  await artifact(root, 'runtime/skills/catalog/sample');
  for (const role of ['history', 'staged'])
    await artifact(root, 'runtime/skills/revisions/sample/' + role + '/' + 'a'.repeat(64));
  for (const role of ['.staging', 'packages', 'proposals', 'tooling', 'exports/claude', 'exports/codex'])
    await directory(root, 'runtime/skills/' + role);
  await writeFile(path.join(root, 'runtime/skills/capability-packs/README.md'), 'Ownership guide');
  expect(await inspectSkillStorageLayout(root)).toEqual({ sourceSkillCount: 1, catalogSkillCount: 1, issues: [] });
  expect(await readdir(root)).toEqual(['runtime']);
});

it('rejects source folders and new runtime roles beside their established homes', async () => {
  const root = await fixture();
  await artifact(root, 'bundled-skills/sample');
  await artifact(root, 'runtime/skills/sample');
  await directory(root, 'runtime/skills/exports/custom');
  const result = await inspectSkillStorageLayout(root);
  expect(result.issues.map(issue => issue.path)).toEqual([
    'bundled-skills', 'runtime/skills/exports/custom', 'runtime/skills/sample',
  ]);
});

it('rejects parallel roots and ad hoc backups inside the revision owner', async () => {
  const root = await fixture();
  await artifact(root, 'skills/sample');
  await directory(root, 'runtime/skills/revisions/sample/backup');
  await directory(root, 'runtime/skills/revisions/sample/history/latest');
  expect((await inspectSkillStorageLayout(root)).issues.map(issue => issue.path)).toEqual([
    'runtime/skills/revisions/sample/backup', 'runtime/skills/revisions/sample/history/latest', 'skills',
  ]);
});

it('rejects nested collections masquerading as an artifact', async () => {
  const root = await fixture();
  await artifact(root, 'runtime/skills/capability-packs/sample/sample');
  expect((await inspectSkillStorageLayout(root)).issues).toEqual([
    expect.objectContaining({ path: 'runtime/skills/capability-packs/sample' }),
  ]);
});

it('does not follow a junction or symlink to an alternate source home', async () => {
  const root = await fixture();
  const outside = await directory(root, 'external');
  await directory(root, 'runtime/skills');
  await symlink(outside, path.join(root, 'runtime/skills/capability-packs'), process.platform === 'win32' ? 'junction' : 'dir');
  expect((await inspectSkillStorageLayout(root)).issues.map(issue => issue.path)).toContain('runtime/skills/capability-packs');
});

it('does not follow a linked parent to inspect an otherwise valid source collection', async () => {
  const root = await fixture();
  await artifact(root, 'external/capability-packs/sample');
  await directory(root, 'runtime');
  await symlink(path.join(root, 'external'), path.join(root, 'runtime/skills'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await inspectSkillStorageLayout(root);
  expect(result.sourceSkillCount).toBe(0);
  expect(result.issues).toEqual([expect.objectContaining({ path: 'runtime/skills' })]);
});

it('reports files occupying directory roles and leaves unrelated plain files alone', async () => {
  const root = await fixture();
  await directory(root, 'runtime/skills');
  await writeFile(path.join(root, 'runtime/skills/catalog'), 'wrong role');
  await writeFile(path.join(root, 'skills'), 'ordinary file, not a storage folder');
  expect((await inspectSkillStorageLayout(root)).issues.map(issue => issue.path)).toEqual(['runtime/skills/catalog']);
});

it('makes the existing path check reject misplaced storage before a build', async () => {
  const root = await fixture();
  await directory(root, 'docs');
  await writeFile(path.join(root, 'docs/PATH-GOVERNANCE.md'), 'Fixture with no path exceptions');
  await artifact(root, 'runtime/skills/authoring-copy');
  const checker = fileURLToPath(new URL('../scripts/portability/check-path-policy.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [checker, '--root', root], { encoding: 'utf8' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('[skill-storage-ownership]');
  expect(result.stderr).toContain('runtime/skills/authoring-copy');
});

it('rejects entrypoints at collection roots and files occupying revision snapshot positions', async () => {
  const root = await fixture();
  for (const relative of ['runtime/skills/capability-packs', 'runtime/skills/catalog'])
    await artifact(root, relative);
  const history = await directory(root, 'runtime/skills/revisions/sample/history');
  await writeFile(path.join(history, 'a'.repeat(64)), 'not a revision directory');
  expect((await inspectSkillStorageLayout(root)).issues.map(issue => issue.path)).toEqual([
    'runtime/skills/capability-packs/SKILL.md', 'runtime/skills/catalog/SKILL.md',
    'runtime/skills/revisions/sample/history/' + 'a'.repeat(64),
  ]);
});

it('rejects a renamed folder copy whose declared Skill owner has not changed', async () => {
  const root = await fixture();
  await artifact(root, 'runtime/skills/capability-packs/sample');
  await artifact(root, 'runtime/skills/capability-packs/sample-copy');
  await writeFile(path.join(root, 'runtime/skills/capability-packs/sample-copy/SKILL.md'), '---\nname: "sample"\ndescription: copied\n---\n');
  const result = await inspectSkillStorageLayout(root);
  expect(result.sourceSkillCount).toBe(1);
  expect(result.issues).toEqual([expect.objectContaining({ path: 'runtime/skills/capability-packs/sample-copy' })]);
});

it('rejects recreating bundled-skills even when its payload is valid', async () => {
  const root = await fixture();
  await artifact(root, 'bundled-skills/capability-packs/sample');
  const result = await inspectSkillStorageLayout(root);
  expect(result.sourceSkillCount).toBe(0);
  expect(result.issues).toEqual([expect.objectContaining({ path: 'bundled-skills' })]);
});

it('versions the original home source without exposing catalog or private runtime data', async () => {
  const root = await fixture();
  expect(spawnSync('git', ['init', '--quiet', root], { encoding: 'utf8' }).status).toBe(0);
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  await writeFile(path.join(root, '.gitignore'), ignore);
  await artifact(root, 'runtime/skills/capability-packs/sample');
  await artifact(root, 'runtime/skills/catalog/sample');
  await writeFile(path.join(root, 'runtime/skills/README.md'), 'Canonical home');
  for (const relative of ['runtime/skills/capability-packs/sample/SKILL.md', 'runtime/skills/README.md'])
    expect(spawnSync('git', ['check-ignore', '--no-index', '-q', relative], { cwd: root }).status, relative).toBe(1);
  for (const relative of ['runtime/memory/private.json', 'runtime/skills/catalog/sample/SKILL.md', 'runtime/skills/revisions/sample/history/state.json',
    'runtime/skills/tooling/config.json', 'runtime/skills/capability-packs/sample/.env', 'runtime/skills/capability-packs/sample/node_modules/x.js'])
    expect(spawnSync('git', ['check-ignore', '--no-index', '-q', relative], { cwd: root }).status, relative).toBe(0);
});
