import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMemoryStore } from '../../src/memory/store.js';
import { resolveMemoryPaths } from '../../src/memory/paths.js';
import { normalizeRecord, serializeCanonicalNote } from '../../src/memory/note-format.js';
import { stableFileRevision } from '../../src/security/file-identity.js';

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
it('reuses unchanged canonical notes without stale edits, leaked mutations or missing/deleted notes', async () => {
  const root = await mkdtemp(path.join(fileURLToPath(new URL('../../runtime/tmp/', import.meta.url)), 'memory-cache-'));
  roots.push(root);
  const paths = resolveMemoryPaths(root);
  await mkdir(paths.notes, { recursive: true });
  await writeFile(paths.bootstrap, '# Agent Core foundation\n');
  const note = path.join(paths.notes, 'cached-note.md');
  const record = normalizeRecord({ version: 1, id: 'cached-note', createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z' }, 'first');
  await writeFile(note, serializeCanonicalNote(record));
  const store = new FileMemoryStore(paths);
  const first = await store.loadAll();
  first.records.find(item => item.id === record.id)!.content = 'caller mutation';
  reads.markdown = 0;
  expect((await store.loadAll()).records.find(item => item.id === record.id)?.content).toBe('first');
  if (stableFileRevision(await stat(note, { bigint: true }))) expect(reads.markdown).toBe(0);
  const before = await stat(note);
  await writeFile(note, serializeCanonicalNote({ ...record, content: 'other' }));
  await utimes(note, before.atime, before.mtime);
  expect((await store.loadAll()).records.find(item => item.id === record.id)?.content).toBe('other');
  await rm(note);
  expect((await store.loadAll()).records.some(item => item.id === record.id)).toBe(false);
  await rm(paths.bootstrap);
  expect((await store.loadAll()).complete).toBe(false);
});
