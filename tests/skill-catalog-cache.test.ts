import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, stat, utimes, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillService } from '../src/skills/service.js';
import { stableFileRevision } from '../src/security/file-identity.js';

const reads = vi.hoisted(() => ({ markdown: 0 }));
vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, readFile: (...args: any[]) => {
    if (String(args[0]).endsWith('.md')) reads.markdown++;
    return (fs.readFile as any)(...args);
  } };
});
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it('reuses unchanged Skill bytes and invalidates edits, additions, removals and same-size replacements', async () => {
  const root = await mkdtemp(path.join(fileURLToPath(new URL('../runtime/tmp/', import.meta.url)), 'skill-cache-'));
  roots.push(root);
  const service = await SkillService.initialize(root);
  const directory = path.join(root, 'runtime/skills/catalog/cached-skill');
  await mkdir(path.join(directory, 'references'), { recursive: true });
  const main = path.join(directory, 'SKILL.md'), reference = path.join(directory, 'references/detail.md');
  await writeFile(main, '---\nname: cached-skill\ndescription: Cached skill\n---\nRead the selected reference.');
  await writeFile(reference, 'first');
  const first = await service.inspect('cached-skill');
  reads.markdown = 0;
  await service.discover({ query: 'cached-skill' });
  await service.read('cached-skill', { expectedActiveDigest: first.digest, resourcePath: 'references/detail.md' });
  if (stableFileRevision(await stat(main, { bigint: true }))) expect(reads.markdown).toBe(0);
  const before = await stat(reference);
  await writeFile(reference, 'other');
  await utimes(reference, before.atime, before.mtime);
  const edited = await service.inspect('cached-skill');
  expect(edited.digest).not.toBe(first.digest);
  await expect(service.read('cached-skill', { expectedActiveDigest: first.digest })).rejects.toThrow('SKILL_ACTIVE_REVISION_CHANGED');
  await writeFile(path.join(directory, 'references/extra.md'), 'extra');
  const added = await service.inspect('cached-skill');
  expect(added.digest).not.toBe(edited.digest);
  await rm(path.join(directory, 'references/extra.md'));
  expect((await service.inspect('cached-skill')).digest).toBe(edited.digest);
  await writeFile(path.join(directory, 'replacement.md'), 'third');
  await rm(reference); await rename(path.join(directory, 'replacement.md'), reference);
  expect((await service.inspect('cached-skill')).digest).not.toBe(edited.digest);
  const summary = await service.inspect('cached-skill'); summary.allowedTools.push('invented');
  expect((await service.inspect('cached-skill')).allowedTools).not.toContain('invented');
});
