import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { MemoryRepositoryIdentity } from './types.js';

const execFileAsync = promisify(execFile);
const sha256 = (value: string | Buffer): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function git(root: string, args: string[], allowFailure = false): Promise<{ ok: boolean; stdout: string }> {
  try {
    const safe = root.replace(/\\/g, '/');
    const { stdout } = await execFileAsync('git', ['-c', `safe.directory=${safe}`, '--no-optional-locks', '-C', root, ...args], {
      windowsHide: true, timeout: 10_000, maxBuffer: 4_000_000, encoding: 'utf8',
    });
    return { ok: true, stdout: String(stdout ?? '') };
  } catch (error) {
    if (allowFailure) return { ok: false, stdout: '' };
    throw error;
  }
}

function parsePorcelainZ(value: string): {
  entries: number;
  renamed: number;
  untracked: number;
  renamedPaths: string[];
  untrackedPaths: string[];
} {
  const fields = value.split('\0').filter(Boolean);
  let entries = 0, renamed = 0, untracked = 0;
  const renamedPaths: string[] = [];
  const untrackedPaths: string[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field.length < 3) continue;
    const status = field.slice(0, 2);
    const firstPath = field.slice(3).replace(/\\/g, '/');
    entries += 1;
    if (status === '??') {
      untracked += 1;
      if (firstPath) untrackedPaths.push(firstPath);
    }
    if (status.includes('R') || status.includes('C')) {
      renamed += 1;
      const secondPath = index + 1 < fields.length ? fields[index + 1].replace(/\\/g, '/') : '';
      renamedPaths.push(`${firstPath}\u0000${secondPath}`);
      if (secondPath) index += 1;
    }
  }
  return { entries, renamed, untracked, renamedPaths, untrackedPaths };
}

export async function captureRepositoryIdentity(root: string): Promise<MemoryRepositoryIdentity | undefined> {
  const absolute = path.resolve(root);
  const top = await git(absolute, ['rev-parse', '--show-toplevel'], true);
  if (!top.ok) {
    try {
      const resolved = await realpath(absolute);
      const repositoryId = sha256(`directory\0${process.platform === 'win32' ? resolved.toLowerCase() : resolved}`);
      return { kind: 'directory', repositoryId, worktreeId: repositoryId };
    } catch { return undefined; }
  }

  const repoRoot = path.resolve(top.stdout.trim());
  const [common, gitDir, head, ref, origin, roots, status] = await Promise.all([
    git(repoRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
    git(repoRoot, ['rev-parse', '--path-format=absolute', '--git-dir']),
    git(repoRoot, ['rev-parse', '--verify', 'HEAD'], true),
    git(repoRoot, ['symbolic-ref', '-q', '--short', 'HEAD'], true),
    git(repoRoot, ['config', '--get', 'remote.origin.url'], true),
    git(repoRoot, ['rev-list', '--max-parents=0', 'HEAD'], true),
    git(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
  ]);
  const rootCommits = roots.ok ? roots.stdout.trim().split(/\r?\n/).filter(Boolean).sort() : [];
  const originDigest = origin.ok && origin.stdout.trim() ? sha256(origin.stdout.trim()) : '';
  const repositoryId = sha256(JSON.stringify({ rootCommits, originDigest }));
  const commonDir = path.resolve(common.stdout.trim());
  const worktreeDir = path.resolve(gitDir.stdout.trim());
  const relativeAdmin = path.relative(commonDir, worktreeDir).replace(/\\/g, '/') || 'main';
  const worktreeId = sha256(JSON.stringify({ repositoryId, admin: relativeAdmin.toLowerCase() }));
  const statusStats = parsePorcelainZ(status.stdout);
  const checkpoint = {
    ...(head.ok && head.stdout.trim() ? { head: head.stdout.trim().slice(0, 64) } : {}),
    ...(ref.ok && ref.stdout.trim() ? { ref: ref.stdout.trim().slice(0, 240) } : {}),
    statusDigest: sha256(status.stdout),
    statusEntryCount: statusStats.entries,
    renamedCount: statusStats.renamed,
    untrackedCount: statusStats.untracked,
    renamedPathDigest: sha256(JSON.stringify(statusStats.renamedPaths)),
    untrackedPathDigest: sha256(JSON.stringify(statusStats.untrackedPaths)),
  };
  return { kind: 'git', repositoryId, worktreeId, checkpoint };
}
