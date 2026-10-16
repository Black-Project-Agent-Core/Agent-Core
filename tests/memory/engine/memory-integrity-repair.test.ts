import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { bootstrapRecord, parseCanonicalNote, serializeCanonicalNote } from '../../../src/memory/note-format.js';
import { MemoryService } from '../../../src/memory/service.js';
const roots: string[] = [];
const valid = '# Agent Core Foundational Memory\n\nCanonical operating context.\n';
afterEach(async () => { for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true }); });
for (const [label, text] of Object.entries({ empty: '', nul: '\0'.repeat(20), mixed: valid + '\0', unrelated: '# @jridgewell/sourcemap-codec\nPackage README.', binary: valid + '\u0007' })) {
  it(`rejects ${label} foundation without fabricating healthy memory`, () => {
    expect(() => bootstrapRecord(text, '00-agent-core-memory.md')).toThrow(/foundation|canonical|binary/i);
  });
}
it('retains valid heading, Unicode, CRLF and optional BOM', () => {
  const result = bootstrapRecord('\uFEFF' + valid.replaceAll('\n', '\r\n') + 'Bahasa Indonesia — 日本語', '00-agent-core-memory.md');
  expect(result.id).toBe('agent-core-foundational'); expect(result.title).toBe('Agent Core Foundational Memory');
});
it('uses the same BOM-normalized offsets for metadata and content', () => {
  const record = { ...bootstrapRecord(valid, 'x'), id: 'bom-fixture', pinned: false, content: '# Beginning must survive' };
  expect(parseCanonicalNote('\uFEFF' + serializeCanonicalNote(record)).content).toBe(record.content);
});
it('rejects binary ordinary content before serialization', () => {
  const record = { ...bootstrapRecord(valid, 'x'), id: 'invalid-fixture', pinned: false, content: 'valid\0invalid' };
  expect(() => serializeCanonicalNote(record)).toThrow(/canonical|binary/i);
});
it('propagates post-start corruption through health and prevents writes; valid repair recovers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-integrity-')); roots.push(root);
  await mkdir(path.join(root, 'notes')); const file = path.join(root, '00-agent-core-memory.md');
  await writeFile(file, valid); const memory = await MemoryService.initialize(root, root);
  const kept = await memory.remember({ content: 'Keep healthy record.' });
  const keptPath = path.join(root, 'notes', `${kept.id}.md`); const bytes = await readFile(keptPath);
  await writeFile(file, valid + '\0');
  expect((await memory.refreshHealth()).canonicalStore).toBe('error');
  await expect(memory.remember({ content: 'Must not write during corruption.' })).rejects.toThrow();
  expect(await readFile(keptPath)).toEqual(bytes);
  await writeFile(file, valid); expect((await memory.refreshHealth()).canonicalStore).toBe('available');
  expect((await memory.read(kept.id, false))?.content).toBe('Keep healthy record.');
});
it('reports a binary ordinary note while preserving the healthy note', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-integrity-')); roots.push(root);
  await mkdir(path.join(root, 'notes')); await writeFile(path.join(root, '00-agent-core-memory.md'), valid);
  const memory = await MemoryService.initialize(root, root);
  const bad = await memory.remember({ content: 'Initially valid.' });
  const good = await memory.remember({ content: 'Healthy neighbor.' });
  const p = path.join(root, 'notes', `${bad.id}.md`); await writeFile(p, (await readFile(p, 'utf8')) + '\0');
  const health = await memory.refreshHealth(); expect(health.status).toBe('degraded');
  expect(memory.getIssues().some(issue => issue.path === p)).toBe(true);
  expect((await memory.read(good.id, false))?.content).toBe('Healthy neighbor.');
});
it('parses BOM metadata without adding a closing-header character to adjacent content', () => {
  const record = { ...bootstrapRecord(valid, 'x'), id: 'bom-adjacent', pinned: false, content: 'Immediately adjacent body.' };
  const serialized = serializeCanonicalNote(record).replace('-->\n\n', '-->');
  expect(parseCanonicalNote('\uFEFF' + serialized).content).toBe(record.content);
});
