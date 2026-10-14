import { mkdtemp, mkdir, readFile, writeFile, rm, utimes, symlink } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { readVerifiedResultBytes } from '../src/security/verified-result-artifact.js';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { applyResultBudget } from '../src/mcp/result-budget.js';
import { handleReadFile } from '../src/rdc/handlers/filesystem-handlers.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const owned = path.join(root, 'runtime', 'tool-results');
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const integrity = (s: string) => ({ digest: 'sha256:' + createHash('sha256').update(s).digest('hex'), storedBytes: Buffer.byteLength(s) });
async function fixture() {
  await mkdir(owned, { recursive: true }); const dir = await mkdtemp(path.join(owned, 'integrity-test-')); dirs.push(dir);
  const s = JSON.stringify({ lines: ['alpha', '漢字🧪', 'omega'] }, null, 2);
  const file = path.join(dir, 'result.json'); await writeFile(file, s); return { dir, file, s, expected: integrity(s) };
}
it('spills once with the digest and length of actual redacted pretty-JSON bytes', async () => {
  const f = await fixture(); const r: any = await applyResultBudget('list_processes', {
    content: [{ type: 'text', text: 'api_key=secret_value\n' + '漢字🧪'.repeat(5000) }], isError: true,
  }, { storageDir: f.dir, budgetChars: 16384 });
  const meta = r._meta.resultBudget, stored = await readFile(meta.artifact, 'utf8');
  expect(meta.artifactIntegrity).toMatchObject({ version: 1, algorithm: 'sha256', ...integrity(stored) });
  expect(stored).not.toContain('secret_value'); expect(r.isError).toBe(true);
  expect(r.content[0].text).toContain('expectedIntegrity'); expect(r.content[0].text).toContain(integrity(stored).digest);
});
it('real read handler verifies complete bytes before paginating Unicode text', async () => {
  const f = await fixture(); const r: any = await handleReadFile({ path: f.file, offset: 2, length: 2, options: { expectedIntegrity: f.expected } });
  expect(r.isError).not.toBe(true); expect(JSON.stringify(r)).toContain('verified-byte-snapshot');
});
it.each(['same-size', 'short', 'long', 'missing', 'expired', 'wrong-hash', 'wrong-size'])
('refuses %s artifacts without returning unverified contents', async mode => {
  const f = await fixture();
  if (mode === 'same-size') await writeFile(f.file, f.s.replace('alpha', 'other'));
  if (mode === 'short') await writeFile(f.file, f.s.slice(0, -1));
  if (mode === 'long') await writeFile(f.file, f.s + ' ');
  if (mode === 'missing') await rm(f.file);
  if (mode === 'expired') { const past = new Date(Date.now() - 2 * 86400000); await utimes(f.file, past, past); }
  if (mode === 'wrong-hash') f.expected.digest = 'sha256:' + '0'.repeat(64);
  if (mode === 'wrong-size') f.expected.storedBytes++;
  const r: any = await handleReadFile({ path: f.file, options: { expectedIntegrity: f.expected } });
  expect(r.isError).toBe(true); expect(JSON.stringify(r)).not.toContain('omega');
});
it.each(['url', 'directory', 'outside', 'unknown-field', 'negative-size', 'oversized', 'huge-offset', 'huge-length', 'projection'])
('refuses invalid verified read mode: %s', async mode => {
  const f = await fixture(); const args: any = { path: f.file, options: { expectedIntegrity: { ...f.expected } } };
  if (mode === 'url') { args.path = 'http://127.0.0.1:1/unreachable'; args.isUrl = true; }
  if (mode === 'directory') args.path = f.dir;
  if (mode === 'outside') args.path = path.join(root, 'package.json');
  if (mode === 'unknown-field') args.options.expectedIntegrity.other = true;
  if (mode === 'negative-size') args.options.expectedIntegrity.storedBytes = -1;
  if (mode === 'oversized') args.options.expectedIntegrity.storedBytes = 128 * 1024 * 1024 + 1;
  if (mode === 'huge-offset') args.offset = Number.MAX_SAFE_INTEGER + 1;
  if (mode === 'huge-length') args.length = 10000000;
  if (mode === 'projection') args.options.projection = 'markdown';
  const r: any = await handleReadFile(args); expect(r.isError).toBe(true);
});
it('opened-byte guard rejects junction traversal on a system-temp fixture volume', async () => {
  // Core intentionally redirects TEMP/home to the project volume; junction fixtures need the system volume.
  const base = process.platform === 'win32' && process.env.SystemRoot ? path.join(process.env.SystemRoot, 'Temp') : os.tmpdir();
  const dir = await mkdtemp(path.join(base, 'agent-core-artifact-links-')); dirs.push(dir);
  const target = path.join(dir, 'target'), alias = path.join(dir, 'alias'), s = JSON.stringify({ value: 'safe' });
  await mkdir(target); await writeFile(path.join(target, 'result.json'), s);
  if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/c', 'mklink', '/J', alias, target], { windowsHide: true });
  else await symlink(target, alias, 'dir');
  await expect(readVerifiedResultBytes(path.join(alias, 'result.json'), integrity(s), dir)).rejects.toThrow(/LINK_REFUSED/);
});
it('bounds negative-offset pages of extremely long lines', async () => {
  const f = await fixture(), s = JSON.stringify({ text: '🧪'.repeat(50000) }); await writeFile(f.file, s);
  const r: any = await handleReadFile({ path: f.file, offset: -1, length: 1000, options: { expectedIntegrity: integrity(s) } });
  expect(r.isError).not.toBe(true); expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThan(256 * 1024);
  expect(JSON.stringify(r)).toContain('truncated'); expect(JSON.stringify(r)).not.toContain('\ufffd');
});
it('preserves normal read and fail-soft spill semantics', async () => {
  const f = await fixture();
  const normal: any = await handleReadFile({ path: f.file }); expect(normal.isError).not.toBe(true);
  const r: any = await applyResultBudget('list_processes', { content: [{ type: 'text', text: 'x'.repeat(20000) }], isError: false },
    { budgetChars: 16384, storageDir: f.file });
  expect(r.isError).toBe(false); expect(r._meta.resultBudget.spilled).toBe(false);
  expect(r._meta.resultBudget.artifactIntegrity).toBeUndefined();
});
it('refuses changed bytes during an opened-descriptor read', async () => {
  const f = await fixture(); const regular = await import('../src/rdc/utils/files/safe-regular-file.js');
  const original = regular.openRegularFile;
  const { vi } = await import('vitest');
  const spy = vi.spyOn(regular, 'openRegularFile').mockImplementation(async (...args) => {
    const opened = await original(...args), read = opened.handle.read.bind(opened.handle); let changed = false;
    vi.spyOn(opened.handle, 'read').mockImplementation(async (...input: any[]) => {
      const result = await (read as any)(...input);
      if (!changed && result.bytesRead) { changed = true; await writeFile(f.file, f.s + ' '); }
      return result;
    });
    return opened;
  });
  try { await expect(readVerifiedResultBytes(f.file, f.expected)).rejects.toThrow(/GREW|CHANGED|MISMATCH/); }
  finally { spy.mockRestore(); vi.restoreAllMocks(); }
});
it('does not expose hash-matching bytes that are invalid JSON or invalid UTF-8', async () => {
  const f = await fixture();
  for (const bytes of [Buffer.from('not JSON'), Buffer.from([255, 254])]) {
    await writeFile(f.file, bytes);
    const expected = { digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), storedBytes: bytes.length };
    const r: any = await handleReadFile({ path: f.file, options: { expectedIntegrity: expected } });
    expect(r.isError).toBe(true);
  }
});
