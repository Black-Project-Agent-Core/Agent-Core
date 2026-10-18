import { afterEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixture, proposalInput } from './skill-proposal-fixture.js';

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: vi.fn(actual.open) };
});

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const hash = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
async function reader(root: string, listSkills: () => Promise<any[]> = async () => []) {
  // Missing feature yields a normal assertion failure during the initial RED run.
  const module = await import('../src/learning/proposal-documents.js').catch(() => ({} as any));
  return module.createProposalDocuments?.(root, { listSkills });
}
async function documentFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'proposal-documents-')); roots.push(root);
  await mkdir(path.join(root, 'docs/proposals'), { recursive: true });
  const text = '# Improve recall\n\nStatus: HOLD\n\nKeep **literal** code:\n```ts\nconst x = "<script>";\n```\n';
  await writeFile(path.join(root, 'docs/proposals/improve-recall.md'), text);
  return { root, text };
}

test('lists readable documents and exact revisions without changing disk', async () => {
  const { root, text } = await documentFixture();
  await writeFile(path.join(root, 'docs/proposals/README.md'), '# Proposal guide\n');
  const docs = await reader(root); const before = await readdir(path.join(root, 'docs/proposals'));
  const result = await docs?.list();
  expect(result?.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ title: 'Improve recall', kind: 'improvement', status: 'HOLD', documentDigest: hash(text), readStatus: 'available' });
  const opened = await docs.read({ id: result.items[0].id, revisionDigest: result.items[0].revisionDigest, documentDigest: hash(text) });
  expect(opened.text).toBe(text);
  expect(opened.path).toBe(path.join(root, 'docs/proposals/improve-recall.md'));
  expect(result.guides).toHaveLength(1);
  expect(await readdir(path.join(root, 'docs/proposals'))).toEqual(before);
});

test('refuses a changed document and never resolves caller-controlled paths', async () => {
  const { root, text } = await documentFixture(); const docs = await reader(root);
  const item = (await docs?.list())?.items[0]; expect(item).toBeDefined();
  await writeFile(path.join(root, 'docs/proposals/improve-recall.md'), text + 'New revision\n');
  await expect(docs.read({ id: item.id, revisionDigest: item.revisionDigest, documentDigest: item.documentDigest })).rejects.toThrow('PROPOSAL_DOCUMENT_CHANGED');
  await expect(docs.read({ id: '../private.md', revisionDigest: hash(text), documentDigest: hash(text) })).rejects.toThrow('PROPOSAL_DOCUMENT_INPUT_INVALID');
});

test('keeps unknown status explicit, bounds input and does not recurse arbitrary directories', async () => {
  const { root } = await documentFixture();
  await writeFile(path.join(root, 'docs/proposals/unknown.md'), '# Unknown\nThe body discusses an APPROVE decision, not a status.');
  await writeFile(path.join(root, 'docs/proposals/oversize.md'), '# Large\n' + 'a'.repeat(262145));
  await mkdir(path.join(root, 'docs/proposals/nested/deeper'), { recursive: true });
  await writeFile(path.join(root, 'docs/proposals/nested/deeper/not-visible.md'), '# Private nested\n');
  const result = await (await reader(root))?.list();
  expect(result?.items.find((item: any) => item.title === 'Unknown')?.status).toBe('unknown');
  expect(result.items.some((item: any) => item.title === 'Private nested')).toBe(false);
  expect(result.warnings).toContain('proposal-document-size-limit');
});

test('reads explicit inline bold status metadata without treating prose as status', async () => {
  const { root } = await documentFixture();
  await writeFile(path.join(root, 'docs/proposals/inline.md'), '# Inline status\n\nTanggal: 2026-10-19. **Status: PROPOSED — awaiting review**\n');
  await writeFile(path.join(root, 'docs/proposals/prose.md'), '# Prose only\n\nThe narrative says Status: APPROVED but is not metadata.\n');
  const result = await (await reader(root)).list();
  expect(result.items.find((item: any) => item.title === 'Inline status')?.status).toBe('PROPOSED — awaiting review');
  expect(result.items.find((item: any) => item.title === 'Prose only')?.status).toBe('unknown');
});

test('refuses junction proposal directories even when leaf symlinks are unavailable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'proposal-junction-root-')); roots.push(root);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'proposal-junction-outside-')); roots.push(outside);
  await mkdir(path.join(root, 'docs')); await writeFile(path.join(outside, 'outside.md'), '# Outside content\n');
  await symlink(outside, path.join(root, 'docs/proposals'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await (await reader(root)).list();
  expect(result.items).toEqual([]); expect(result.guides).toEqual([]);
  expect(result.warnings).toContain('proposal-document-symlink-refused');
});

test('does not open documents larger than the remaining scan byte budget', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'proposal-scan-budget-')); roots.push(root);
  const directory = path.join(root, 'docs/proposals'); await mkdir(directory, { recursive: true });
  for (let i = 0; i < 8; i++) await writeFile(path.join(directory, `a-${i}.md`), '# Bounded\n' + 'x'.repeat(262000));
  const overBudget = path.join(directory, 'z-after-budget.md'); await writeFile(overBudget, '# Exceeds remaining\n' + 'x'.repeat(2000));
  const openSpy = vi.mocked(fs.open); openSpy.mockClear();
  const result = await (await reader(root)).list();
  expect(result.items).toHaveLength(8); expect(result.warnings).toContain('proposal-scan-byte-limit');
  expect(openSpy.mock.calls.some(([file]) => file === overBudget)).toBe(false);
});

test('refuses symlink documents and a symlinked proposal directory', async ({ skip }) => {
  const { root } = await documentFixture(); const outside = await mkdtemp(path.join(os.tmpdir(), 'proposal-outside-')); roots.push(outside);
  await writeFile(path.join(outside, 'outside.md'), '# Outside secret\n');
  try { await symlink(path.join(outside, 'outside.md'), path.join(root, 'docs/proposals/link.md')); }
  catch (error) { if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { skip(); return; } throw error; }
  const docs = await reader(root); const result = await docs?.list();
  expect(result?.items.some((item: any) => item.title === 'Outside secret')).toBe(false);
  expect(result.warnings).toContain('proposal-document-symlink-refused');
  const aliasRoot = await mkdtemp(path.join(os.tmpdir(), 'proposal-alias-')); roots.push(aliasRoot);
  await mkdir(path.join(aliasRoot, 'docs'));
  await symlink(outside, path.join(aliasRoot, 'docs/proposals'), 'junction');
  expect((await (await reader(aliasRoot)).list()).items).toEqual([]);
});

test('external publication keeps canonical native paths, revisions and decisions unchanged', async () => {
  const f = await fixture(); const item = await f.learning.upsertSkillProposal(proposalInput());
  const canonicalBefore = await readFile(item.path, 'utf8');
  const docs = await reader(f.root, () => f.learning.skillProposals());
  const legacy = (await docs.list()).items[0];
  expect(legacy).toMatchObject({ path: item.path, projection: 'legacy-runtime', readStatus: 'available' });
  expect((await docs.read({ id: legacy.id, revisionDigest: legacy.revisionDigest, documentDigest: legacy.documentDigest })).text).toBe(canonicalBefore);
  await expect(readdir(path.join(f.root, 'docs'))).rejects.toMatchObject({ code: 'ENOENT' });
  const publish = f.learning.publishExternalSkillProposal?.bind(f.learning);
  expect(publish).toBeTypeOf('function');
  const projected = await publish({ workspace: item.workspace, proposalId: item.id, revisionDigest: item.revisionDigest });
  expect(projected.path).toBe(path.join(f.root, 'docs/proposals/skills/agent-core/code-review.md'));
  expect(await readFile(projected.path, 'utf8')).toBe(canonicalBefore);
  expect(await readFile(item.path, 'utf8')).toBe(canonicalBefore);
  expect((await f.learning.skillProposals())[0]).toMatchObject({ id: item.id, path: item.path, revisionDigest: item.revisionDigest, decisions: [] });
  const card = (await docs.list()).items[0];
  expect(card).toMatchObject({ id: item.id, path: projected.path, revisionDigest: item.revisionDigest, readStatus: 'available' });
  await writeFile(projected.path, '# User edit\n');
  await expect(publish({ workspace: item.workspace, proposalId: item.id, revisionDigest: item.revisionDigest })).rejects.toThrow('SKILL_PROPOSAL_FILE_DRIFT');
  expect((await docs.list()).items[0].readStatus).toBe('drift');
  await expect(docs.read({ id: card.id, revisionDigest: card.revisionDigest, documentDigest: card.documentDigest })).rejects.toThrow('PROPOSAL_DOCUMENT_DRIFT');
});
