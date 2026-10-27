import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readOnlyGit, readOnlyGitArgs } from '../src/process/readonly-git.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function repo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'readonly-git-'));
  roots.push(root);
  const git = (...args: string[]) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], { windowsHide: true, encoding: 'utf8' });
  git('init');
  git('config', 'user.email', 'readonly-git@example.invalid');
  git('config', 'user.name', 'Readonly Git');
  await writeFile(path.join(root, 'a.txt'), 'one\n');
  await writeFile(path.join(root, 'ü.txt'), 'uno\n');
  git('add', '.');
  git('commit', '-m', 'baseline');
  return { root, git };
}

describe('read-only git helper', () => {
  it('builds an argv with the read-only configuration before the subcommand', () => {
    const argv = readOnlyGitArgs('E:\\some\\repo', ['status']);
    expect(argv).toEqual(expect.arrayContaining(['core.fsmonitor=false', 'core.quotePath=false', 'diff.autoRefreshIndex=false', '--no-optional-locks']));
    expect(argv.slice(-3)).toEqual(['-C', 'E:\\some\\repo', 'status']);
  });

  it('does not rewrite the index when only file timestamps changed', async () => {
    const { root } = await repo();
    const indexFile = path.join(root, '.git', 'index');
    await utimes(path.join(root, 'a.txt'), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000)); // stat-dirty, content identical
    const before = await readFile(indexFile);
    await readOnlyGit(root, ['diff']);
    await readOnlyGit(root, ['status', '--porcelain=v1']);
    expect((await readFile(indexFile)).equals(before)).toBe(true);
  });

  it('keeps a/ b/ prefixes and unquoted non-ASCII paths whatever the repository configures', async () => {
    const { root, git } = await repo();
    git('config', 'diff.mnemonicPrefix', 'true');
    await writeFile(path.join(root, 'ü.txt'), 'dos\n');
    const patch = await readOnlyGit(root, ['diff', '--unified=0', 'HEAD']);
    expect(patch).toContain('+++ b/ü.txt');
    expect(git('diff', '--unified=0', 'HEAD')).toMatch(/\+\+\+ "?w\//); // the plain call (w/ prefix, quoted octal path) is what would have lost the hunk
  });
});
