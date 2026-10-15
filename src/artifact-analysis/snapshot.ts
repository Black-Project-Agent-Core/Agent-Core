import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { validatePath } from '../rdc/tools/filesystem.js';
import { openRegularFile } from '../rdc/utils/files/safe-regular-file.js';
import { assertSameFileIdentity } from '../security/file-identity.js';
import { assertReadActive } from '../rdc/utils/withTimeout.js';
import { decideToolEvidenceCapture } from '../security/evidence-capture-policy.js';
import { ARTIFACT_LIMITS, type ArtifactFormat, type StaticInput } from './contracts.js';

const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
function acceptableAbsolute(file: string) {
  if (!path.isAbsolute(file) || file.startsWith('\\\\') || file.includes('\0')
    || /^\\\\[?.]\\/.test(file)) throw new Error('ARTIFACT_PATH_REFUSED');
}
async function safePath(file: string, signal?: AbortSignal) {
  acceptableAbsolute(file);
  const absolute = path.resolve(file);
  const root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    assertReadActive(signal);
    current = path.join(current, part);
    const meta = await lstat(current);
    if (meta.isSymbolicLink()) throw new Error('ARTIFACT_REPARSE_REFUSED');
    if (process.platform === 'win32' && (meta as any).isSymbolicLink?.()) throw new Error('ARTIFACT_REPARSE_REFUSED');
  }
  const allowed = await validatePath(absolute);
  if (path.resolve(allowed).toLowerCase() !== absolute.toLowerCase()) throw new Error('ARTIFACT_PATH_ALIAS');
  return absolute;
}
const selectedAllowed = (value: string) =>
  Boolean(value && !path.isAbsolute(value) && !value.includes('\0')
    && !value.split(/[\\/]/).some(part => part === '..' || part === '')
    && !value.startsWith('\\') && !value.startsWith('/'));
async function boundedFile(file: string, max: number, signal?: AbortSignal) {
  await safePath(file, signal);
  const evidence = decideToolEvidenceCapture('read_file', { path: file });
  if (evidence.disposition !== 'full' || evidence.policyState === 'invalid')
    throw new Error('ARTIFACT_EVIDENCE_POLICY_REFUSED');
  const guarded = await openRegularFile(file, { followSymlinks: false, signal });
  try {
    const expected = await guarded.handle.stat({ bigint: true });
    const size = guarded.stats.size;
    if (!Number.isSafeInteger(size) || size > max) throw new Error('ARTIFACT_RESOURCE_LIMIT');
    const result = Buffer.alloc(size);
    let cursor = 0;
    while (cursor < size) {
      assertReadActive(signal);
      const { bytesRead } = await guarded.handle.read(result, cursor, Math.min(64 * 1024, size - cursor), cursor);
      if (!bytesRead) throw new Error('ARTIFACT_SOURCE_SHORT_READ');
      cursor += bytesRead;
    }
    assertReadActive(signal);
    const post = await guarded.handle.stat({ bigint: true });
    assertSameFileIdentity(expected, post, 'artifact-snapshot');
    if (post.size !== expected.size || post.mtimeNs !== expected.mtimeNs) throw new Error('ARTIFACT_SOURCE_CHANGED');
    return result;
  } finally { await guarded.close(); }
}
export async function captureArtifact(target: string, format: ArtifactFormat, selected: string[],
  signal?: AbortSignal): Promise<StaticInput> {
  if (selected.length > ARTIFACT_LIMITS.maxSelected || new Set(selected).size !== selected.length
    || selected.some(value => !selectedAllowed(value))) throw new Error('ARTIFACT_SELECTION_INVALID');
  const resolved = await safePath(target, signal);
  if (format !== 'directory-js') {
    const archive = await boundedFile(resolved, ARTIFACT_LIMITS.maxArtifactBytes, signal);
    return { format, files: [], archive,
      sha256: hash(archive), scopeDigest: hash(Buffer.from(JSON.stringify({ format, selected }))), omissions: 0 };
  }
  const rootMeta = await lstat(resolved, { bigint: true });
  if (!rootMeta.isDirectory()) throw new Error('ARTIFACT_NOT_DIRECTORY');
  const files: StaticInput['files'] = [];
  let total = 0;
  let omissions = 0;
  let inventory = 0;
  let exhausted = false;
  async function walk(dir: string, depth: number) {
    assertReadActive(signal);
    if (exhausted) return;
    if (depth > ARTIFACT_LIMITS.maxDepth) { omissions++; return; }
    const children = (await readdir(dir, { withFileTypes: true }))
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of children) {
      assertReadActive(signal);
      inventory++;
      if (inventory > ARTIFACT_LIMITS.maxInventory) { omissions++; exhausted = true; return; }
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { omissions++; continue; }
      if (entry.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!entry.isFile()) { omissions++; continue; }
      const rel = path.relative(resolved, full).split(path.sep).join('/');
      files.push({ relative: rel, size: (await lstat(full)).size });
    }
  }
  await walk(resolved, 0);
  const byName = new Map(files.map(item => [item.relative.toLowerCase(), item]));
  for (const name of selected) {
    assertReadActive(signal);
    const relative = name.replaceAll('\\', '/');
    const file = byName.get(relative.toLowerCase());
    if (!file || file.relative !== relative) throw new Error('ARTIFACT_SELECTED_MEMBER_UNAVAILABLE');
    if (file.size > ARTIFACT_LIMITS.maxSourceBytes) { omissions++; continue; }
    total += file.size;
    if (total > ARTIFACT_LIMITS.maxTotalSourceBytes) { omissions++; break; }
    file.bytes = await boundedFile(path.join(resolved, ...relative.split('/')), ARTIFACT_LIMITS.maxSourceBytes, signal);
  }
  const rootAfter = await lstat(resolved, { bigint: true });
  assertSameFileIdentity(rootMeta, rootAfter, 'artifact-directory-root');
  if (rootMeta.mtimeNs !== rootAfter.mtimeNs) throw new Error('ARTIFACT_DIRECTORY_CHANGED');
  const scopeDigest = hash(Buffer.from(JSON.stringify(files.map(item =>
    ({ relative: item.relative, size: item.size, sha256: item.bytes ? hash(item.bytes) : null })))));
  return { format, files, scopeDigest, sha256: scopeDigest, omissions };
}