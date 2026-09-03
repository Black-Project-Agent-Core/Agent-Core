import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitWorkingTreeCodeIntelligenceSource } from '../src/implementation/git-working-tree-source.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];

class FakeGitVisibleFiles {
  files: string[] = [];
  async listWorkingTreeFiles(_input: { cwd: string }) { return [...this.files]; }
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-working-tree-source-'));
  roots.push(root);
  const git = new FakeGitVisibleFiles();
  const source = new GitWorkingTreeCodeIntelligenceSource(
    new WorkspacePolicy([root]),
    git,
    { maxFiles: 100 },
  );
  return { root, git, source };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('GitWorkingTreeCodeIntelligenceSource', () => {
  it('produces a stable SHA-256 fingerprint from sorted Git-visible working-tree bytes', async () => {
    const f = await setup();
    await mkdir(path.join(f.root, 'src'));
    await writeFile(path.join(f.root, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(path.join(f.root, 'b.ts'), 'export const b = 2;\n');
    f.git.files = ['src/a.ts', 'b.ts'];
    const first = await f.source.fingerprint(f.root);
    f.git.files = ['b.ts', 'src/a.ts'];
    const second = await f.source.fingerprint(f.root);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });
  it('changes fingerprint when tracked working-tree bytes change without requiring a commit', async () => {
    const f = await setup();
    await writeFile(path.join(f.root, 'a.ts'), 'export const a = 1;\n');
    f.git.files = ['a.ts'];
    const before = await f.source.fingerprint(f.root);
    await writeFile(path.join(f.root, 'a.ts'), 'export const a = 2;\n');
    const after = await f.source.fingerprint(f.root);
    expect(after).not.toBe(before);
  });

  it('ignores files outside the Git-visible set and fails closed above its file bound', async () => {
    const f = await setup();
    await writeFile(path.join(f.root, 'a.ts'), 'export const a = 1;\n');
    await writeFile(path.join(f.root, 'ignored.secret'), 'token=do-not-index\n');
    f.git.files = ['a.ts'];
    const before = await f.source.fingerprint(f.root);
    await writeFile(path.join(f.root, 'ignored.secret'), 'token=changed-but-still-invisible\n');
    expect(await f.source.fingerprint(f.root)).toBe(before);

    f.git.files = Array.from({ length: 101 }, (_, index) => `file-${index}.ts`);
    await expect(f.source.fingerprint(f.root)).resolves.toBeNull();
  });

  it('searches only Git-visible text files with bounded evidence and repo-relative paths', async () => {
    const f = await setup();
    await mkdir(path.join(f.root, 'src'));
    await writeFile(path.join(f.root, 'src', 'one.ts'), 'export function Needle() {}\n');
    await writeFile(path.join(f.root, 'hidden.ts'), 'Needle hidden\n');
    f.git.files = ['src/one.ts'];
    const hits = await f.source.searchContent({ projectRoot: f.root, query: 'needle', maxResults: 5 });
    expect(hits).toEqual([expect.objectContaining({
      path: 'src/one.ts', line: 1, evidenceType: 'search_hit',
    })]);
    expect(JSON.stringify(hits)).not.toContain('hidden.ts');
  });
});

it('distinguishes a Git-listed missing path from an actually empty visible tree', async () => {
  const f = await setup();
  f.git.files = ['deleted.ts'];
  const missing = await f.source.fingerprint(f.root);
  f.git.files = [];
  const empty = await f.source.fingerprint(f.root);
  expect(missing).toMatch(/^[0-9a-f]{64}$/);
  expect(missing).not.toBe(empty);
});
