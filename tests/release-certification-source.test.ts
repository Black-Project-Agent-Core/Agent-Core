import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCertifiedGate } from '../scripts/release/certify-core.mjs';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'certification-source-')); roots.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.name', 'Isolated test'); git('config', 'user.email', 'fixture@example.invalid');
  await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'src', 'index.ts'), 'export const value = 1;\n');
  git('add', '--', 'src/index.ts'); git('commit', '-m', 'isolated baseline');
  return { root, git, commit: git('rev-parse', 'HEAD') };
}
const gate = (code: string) => ({ id: 'source-consistency-fixture', command: process.execPath, args: ['-e', code], json: false });
describe('certification source consistency', () => {
  it('accepts an unchanged source and refuses a successful gate that edits source without changing HEAD', async () => {
    const f = await fixture();
    expect(() => runCertifiedGate(gate('process.exit(0)'), f.commit, f.root)).not.toThrow();
    expect(() => runCertifiedGate(gate('require("node:fs").appendFileSync("src/index.ts", "// changed\\n")'), f.commit, f.root))
      .toThrow('TRACKED_TREE_DIRTY');
    expect(f.git('rev-parse', 'HEAD')).toBe(f.commit);
  });
  it('refuses an untracked test introduced during a gate and a changed source commit', async () => {
    const f = await fixture();
    expect(() => runCertifiedGate(gate('require("node:fs").mkdirSync("tests");require("node:fs").writeFileSync("tests/new.test.ts", "new test")'), f.commit, f.root))
      .toThrow('UNTRACKED_INPUTS');
    f.git('add', '--', 'tests/new.test.ts'); f.git('commit', '-m', 'new input');
    expect(() => runCertifiedGate(gate('process.exit(0)'), f.commit, f.root)).toThrow('SOURCE_CHANGED_DURING_RUN');
  });
});
