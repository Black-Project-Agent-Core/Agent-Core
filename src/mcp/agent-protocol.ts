import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSameFileIdentity } from '../security/file-identity.js';

const AGENTS_PATH = fileURLToPath(new URL('../../AGENTS.md', import.meta.url));
const BUNDLE_MARKER = '\n\nINSTRUCTION BUNDLE REVISION: sha256:';
const MAX_ENTRY_BYTES = 8_192 - Buffer.byteLength(BUNDLE_MARKER) - 64;

function readRegular(file: string, cap: number): Buffer {
  const before = lstatSync(file, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()) throw new Error('Contract path must be a regular file');
  if (path.relative(realpathSync(file), file)) throw new Error('Contract path contains a link');
  if (before.size > BigInt(cap)) throw new Error(`Contract file exceeds ${cap} byte limit`);
  const fd = openSync(file, 'r');
  try {
    const opened = fstatSync(fd, { bigint: true });
    assertSameFileIdentity(before, opened, 'contract');
    const buffer = Buffer.alloc(cap + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    if (size > cap) throw new Error(`Contract file exceeds ${cap} byte limit`);
    const bytes = buffer.subarray(0, size);
    for (const current of [fstatSync(fd, { bigint: true }), lstatSync(file, { bigint: true })]) {
      assertSameFileIdentity(before, current, 'contract');
      if (current.isSymbolicLink() || !current.isFile() || before.size !== current.size
        || before.mtimeNs !== current.mtimeNs || before.ctimeNs !== current.ctimeNs) throw new Error('Contract changed during reading');
    }
    if (path.relative(realpathSync(file), file)) throw new Error('Contract path contains a link');
    return bytes;
  } finally { closeSync(fd); }
}

export function loadAgentProtocol(agentsPath = AGENTS_PATH): string {
  const selectedPath = path.resolve(agentsPath);
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(readRegular(selectedPath, MAX_ENTRY_BYTES)).trim();
    if (!content) throw new Error('Contract is empty');
    const references = new Set<string>();
    for (const match of content.matchAll(/\[[^\]\r\n]*\]\(([^)\r\n]+)\)/g)) {
      const target = match[1]!;
      if (/^[a-z]+:/i.test(target) || !/(?:^|\/)docs\/instructions(?:\/|$)/.test(target.replaceAll('\\', '/'))) continue;
      if (!/^docs\/instructions\/[a-z0-9-]+\.md$/.test(target)) throw new Error('Invalid contract reference path');
      references.add(target);
    }
    if (references.size > 32) throw new Error('Contract references exceed limit 32');
    const root = path.dirname(selectedPath), hash = createHash('sha256');
    for (const reference of [...references].sort()) {
      for (const relative of ['docs', 'docs/instructions']) {
        const directory = path.join(root, relative), info = lstatSync(directory);
        if (info.isSymbolicLink() || !info.isDirectory() || path.relative(realpathSync(directory), directory))
          throw new Error('Contract reference directory path contains a link or is invalid');
      }
      const bytes = readRegular(path.join(root, reference), 8_192);
      hash.update(reference).update('\0').update(bytes).update('\0');
    }
    return content + BUNDLE_MARKER + hash.digest('hex');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Mandatory Agent Core contract could not be read: ${selectedPath}: ${reason}`);
  }
}
