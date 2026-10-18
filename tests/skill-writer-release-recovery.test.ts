import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import type { PathLike } from 'node:fs';
import path from 'node:path';
import { fixture } from './skill-proposal-fixture.js';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), rm: vi.fn(actual.rm) };
});
// Git discovery is unrelated to writer exclusion and can dominate this fixture's
// scheduling. Exercise real artifact I/O with the supported no-repository result.
vi.mock('../src/memory/repository-identity.js', () => ({ captureRepositoryIdentity: vi.fn(async () => undefined) }));
const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
beforeEach(() => {
  vi.mocked(fs.rename).mockImplementation(actual.rename);
  vi.mocked(fs.rm).mockImplementation(actual.rm);
});
afterEach(() => {
  vi.mocked(fs.rename).mockImplementation(actual.rename);
  vi.mocked(fs.rm).mockImplementation(actual.rm);
});

const name = 'writer-recovery';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const failure = (message: string, code: string) => Object.assign(new Error(message), { code });
const samePath = (a: PathLike, b: string) => path.resolve(String(a)) === path.resolve(b);
async function writeSkill(directory: string, body: string) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: Isolated writer recovery fixture\nlicense: Apache-2.0\n---\n\n${body}\n`);
  await fs.writeFile(path.join(directory, 'constraints.txt'), body + '\n');
}
async function revisionFixture() {
  const f = await fixture(), originalSource = path.join(f.root, 'original'), candidateSource = path.join(f.root, 'candidate');
  await writeSkill(originalSource, 'Preserve the original safeguards.');
  await writeSkill(candidateSource, 'Revised safeguards with a verified fallback.');
  const imported = await f.skills.import(originalSource);
  const staged = await f.skills.stageRevision(candidateSource, ['tool:isolated-writer-recovery']);
  const active = path.join(f.root, 'runtime/skills/catalog', name), staging = path.join(f.root, 'runtime/skills/.staging');
  const promote = () => f.skills.promoteRevision(name, staged.digest, imported.digest,
    'PROMOTE_SKILL_REVISION', 'CONFIRM_SKILL_SOURCE_CHANGE');
  const backups = async () => (await fs.readdir(staging)).filter(entry => entry.startsWith(`active-backup-${name}-`));
  return { ...f, imported, staged, active, staging, promote, backups };
}

test('serializes identical same-name imports instead of racing their catalog publication', async () => {
  const f = await fixture(), source = path.join(f.root, 'source');
  await writeSkill(source, 'One immutable input imported twice.');
  const active = path.join(f.root, 'runtime/skills/catalog', name), entered = deferred(), release = deferred();
  let publications = 0;
  vi.mocked(fs.rename).mockImplementation(async (from, to) => {
    if (samePath(to, active) && ++publications === 1) { entered.resolve(); await release.promise; }
    return actual.rename(from, to);
  });
  const first = f.skills.import(source);
  await entered.promise;
  const second = f.skills.import(source);
  // Old code can complete the second publication while the first is held. A
  // serialized writer waits; this bounded gate never waits for a second lock holder.
  try { await Promise.race([second.then(() => undefined, () => undefined), new Promise<void>(done => setTimeout(done, 200))]); }
  finally { release.resolve(); }
  const results = await Promise.allSettled([first, second]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
  const values = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  expect(values.map(value => value.status).sort()).toEqual(['duplicate', 'imported']);
  expect(new Set(values.map(value => value.digest)).size).toBe(1);
  expect((await f.skills.inspect(name)).digest).toBe(values[0].digest);
});

test('retains the original backup and reports recovery location when publication and restoration both fail', async () => {
  const f = await revisionFixture();
  vi.mocked(fs.rename).mockImplementation(async (from, to) => {
    if (samePath(to, f.active) && path.basename(String(from)).startsWith(`activate-${name}-`))
      throw failure('INJECTED_PUBLISH_FAILURE', 'EACCES');
    if (samePath(to, f.active) && path.basename(String(from)).startsWith(`active-backup-${name}-`))
      throw failure('INJECTED_RESTORE_FAILURE', 'EBUSY');
    return actual.rename(from, to);
  });
  const error = await f.promote().then(() => undefined, error => error as Error);
  expect.soft(error?.message).toMatch(/SKILL_REVISION_RESTORE_FAILED:publish=EACCES;restore=EBUSY;recovery=runtime\/skills\/\.staging\/active-backup-writer-recovery-/);
  const backups = await f.backups(); expect(backups).toHaveLength(1);
  const backup = path.join(f.staging, backups[0]);
  expect(await fs.readFile(path.join(backup, 'constraints.txt'), 'utf8')).toBe('Preserve the original safeguards.\n');
  expect(await fs.readFile(path.join(backup, 'SKILL.md'), 'utf8')).toContain('Preserve the original safeguards.');
  await expect(fs.lstat(f.active)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('restores the original active tree but still rejects the failed requested publication', async () => {
  const f = await revisionFixture();
  vi.mocked(fs.rename).mockImplementation(async (from, to) => {
    if (samePath(to, f.active) && path.basename(String(from)).startsWith(`activate-${name}-`))
      throw failure('INJECTED_PUBLISH_FAILURE', 'EACCES');
    return actual.rename(from, to);
  });
  await expect(f.promote()).rejects.toThrow('INJECTED_PUBLISH_FAILURE');
  expect((await f.skills.inspect(name)).digest).toBe(f.imported.digest);
  expect(await fs.readFile(path.join(f.active, 'constraints.txt'), 'utf8')).toBe('Preserve the original safeguards.\n');
  expect(await f.backups()).toEqual([]);
  expect((await f.skills.listRevisions(name)).staged.map(item => item.digest)).toContain(f.staged.digest);
});

test('reports an already committed activation honestly when backup cleanup fails without rolling it back', async () => {
  const f = await revisionFixture();
  vi.mocked(fs.rm).mockImplementation(async (file, options) => {
    if (path.dirname(String(file)) === f.staging && path.basename(String(file)).startsWith(`active-backup-${name}-`))
      throw failure('INJECTED_BACKUP_CLEANUP_FAILURE', 'EACCES');
    return actual.rm(file, options);
  });
  await expect(f.promote()).rejects.toThrow('SKILL_REVISION_ACTIVATED_CLEANUP_FAILED:phase=backup;cause=EACCES');
  expect((await f.skills.inspect(name)).digest).toBe(f.staged.digest);
  expect(await fs.readFile(path.join(f.active, 'constraints.txt'), 'utf8')).toBe('Revised safeguards with a verified fallback.\n');
  expect(await f.backups()).toHaveLength(1);
  expect((await f.skills.listRevisions(name)).history.map(item => item.digest)).toContain(f.imported.digest);
});
