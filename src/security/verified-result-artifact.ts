// Native bounded byte-reference verification inspired by AgentOS output/CAS reads (Apache-2.0).
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import * as z from 'zod/v4';
import { resolveModuleProjectRoot } from '../portability/paths.js';
import { assertSameFileIdentity } from './file-identity.js';
import { openRegularFile } from '../rdc/utils/files/safe-regular-file.js';

export const RESULT_ARTIFACT_MAX_BYTES = 128 * 1024 * 1024;
export const RESULT_ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_BYTES = 24 * 1024;
export const expectedResultIntegritySchema = z.strictObject({
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  storedBytes: z.number().int().min(1).max(RESULT_ARTIFACT_MAX_BYTES),
});
export type ExpectedResultIntegrity = z.infer<typeof expectedResultIntegritySchema>;
export function resultArtifactIntegrity(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > RESULT_ARTIFACT_MAX_BYTES) throw new Error('RESULT_ARTIFACT_SIZE_INVALID');
  return { version: 1 as const, algorithm: 'sha256' as const,
    digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'), storedBytes: bytes.length };
}
export function ownedResultArtifactRoot(): string {
  return path.join(resolveModuleProjectRoot(import.meta.url), 'runtime', 'tool-results');
}
function inside(file: string, root: string): boolean {
  const relative = path.relative(root, file);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}
async function safePath(file: string, root: string): Promise<void> {
  if (!inside(file, root) || path.extname(file).toLowerCase() !== '.json') throw new Error('RESULT_ARTIFACT_PATH_REFUSED');
  let current = path.parse(file).root;
  for (const segment of file.slice(current.length).split(path.sep)) {
    current = path.join(current, segment);
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) throw new Error('RESULT_ARTIFACT_LINK_REFUSED');
    if (current !== file && !stats.isDirectory()) throw new Error('RESULT_ARTIFACT_PARENT_INVALID');
  }
  if (!inside(await realpath(file), await realpath(root))) throw new Error('RESULT_ARTIFACT_REALPATH_REFUSED');
}
/** Full validation and snapshot from one descriptor. Internal storageRoot is never accepted from MCP options. */
export async function readVerifiedResultBytes(filePath: string, raw: unknown, storageRoot = ownedResultArtifactRoot()): Promise<Buffer> {
  const expected = expectedResultIntegritySchema.parse(raw);
  if (!path.isAbsolute(filePath) || !path.isAbsolute(storageRoot)) throw new Error('RESULT_ARTIFACT_ABSOLUTE_PATH_REQUIRED');
  const file = path.resolve(filePath), root = path.resolve(storageRoot);
  await safePath(file, root);
  const pre = await lstat(file, { bigint: true });
  const guarded = await openRegularFile(file, { followSymlinks: false });
  try {
    const opened = await guarded.handle.stat({ bigint: true });
    assertSameFileIdentity(pre, opened, 'result artifact');
    if (opened.size !== BigInt(expected.storedBytes)) throw new Error('RESULT_ARTIFACT_SIZE_MISMATCH');
    if (Date.now() - Number(opened.mtimeMs) > RESULT_ARTIFACT_TTL_MS) throw new Error('RESULT_ARTIFACT_EXPIRED');
    const chunks: Buffer[] = []; let total = 0;
    for (;;) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, expected.storedBytes - total + 1));
      const { bytesRead } = await guarded.handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > expected.storedBytes || total > RESULT_ARTIFACT_MAX_BYTES) throw new Error('RESULT_ARTIFACT_GREW');
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await guarded.handle.stat({ bigint: true }), current = await lstat(file, { bigint: true });
    assertSameFileIdentity(opened, after, 'result artifact');
    assertSameFileIdentity(after, current, 'result artifact');
    if (current.isSymbolicLink() || opened.size !== after.size || after.size !== current.size
      || pre.size !== after.size || pre.mtimeNs !== after.mtimeNs || opened.mtimeNs !== after.mtimeNs
      || current.mtimeNs !== after.mtimeNs || opened.ctimeNs !== after.ctimeNs)
      throw new Error('RESULT_ARTIFACT_CHANGED_DURING_READ');
    await safePath(file, root);
    const bytes = Buffer.concat(chunks, total);
    if (total !== expected.storedBytes || resultArtifactIntegrity(bytes).digest !== expected.digest)
      throw new Error('RESULT_ARTIFACT_INTEGRITY_MISMATCH');
    return bytes;
  } finally { await guarded.close(); }
}
/** Pagination sees only the verified immutable byte snapshot, not a pathname reopen. */
export async function readVerifiedResultPage(file: string, expected: unknown, offset = 0, length = 1000) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || length < 1 || length > 10000)
    throw new Error('RESULT_ARTIFACT_PAGE_INVALID');
  const bytes = await readVerifiedResultBytes(file, expected);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  try { JSON.parse(text); } catch { throw new Error('RESULT_ARTIFACT_JSON_INVALID'); }
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  const first = offset < 0 ? Math.max(0, lines + offset) : Math.min(offset, lines);
  const last = offset < 0 ? lines : Math.min(lines, first + length);
  let from = 0, to = text.length, line = 0;
  for (let i = 0; i < text.length; i++) {
    if (line === first) { from = i; break; }
    if (text.charCodeAt(i) === 10) line++;
    from = i + 1;
  }
  line = first;
  for (let i = from; i < text.length; i++) {
    if (line >= last) { to = i; break; }
    if (text.charCodeAt(i) === 10) line++;
  }
  if (first >= lines) from = to = text.length;
  const page = Buffer.from(text.slice(from, to), 'utf8');
  let end = Math.min(PAGE_BYTES, page.length);
  while (end < page.length && end > 0 && (page[end] & 0xc0) === 0x80) end--;
  const truncated = end < page.length || last < lines;
  return { content: '[verified-byte-snapshot: sha256 equality, not signer/semantic verification; lines '
    + first + '..' + last + '/' + lines + '; truncated=' + truncated + ']\n' + page.subarray(0, end).toString('utf8'),
    mimeType: 'application/json', metadata: { isImage: false } };
}
