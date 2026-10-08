import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve('scripts/inspect/adoption-plan-readiness.mjs');
const cleanups: string[] = [];

afterEach(async () => {
  while (cleanups.length) await rm(cleanups.pop()!, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-plan-readiness-'));
  cleanups.push(root);
  return root;
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function run(plan: string, reference?: string) {
  const args = [SCRIPT, plan, '--json'];
  if (reference) args.push('--reference', reference);
  return spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
}

async function makeGitReference(root: string): Promise<string> {
  const repo = path.join(root, 'reference');
  await mkdir(repo);
  execFileSync('git', ['-C', repo, 'init', '-q']);
  const git = (args: string[]) => execFileSync(
    'git',
    ['-c', `safe.directory=${repo}`, '-C', repo, ...args],
    { encoding: 'utf8', windowsHide: true },
  );
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Agent Core Test']);
  await writeFile(path.join(repo, 'source.txt'), 'source\n');
  git(['add', 'source.txt']);
  git(['commit', '-q', '-m', 'fixture']);
  git(['remote', 'add', 'origin', 'https://example.test/reference.git']);
  return repo;
}

function completePlan(head: string, reference: string): string {
  return `# Fixture Steal/Use Integration Plan

Status: **PROPOSAL — USER REVIEW REQUIRED — NO IMPLEMENTATION**

Reference: \`${reference}\`
Upstream: \`https://example.test/reference.git\`
Observed branch/ref: \`main\` / \`${head}\`.
License: MIT.

## FIX-P1 — fixture adoption

**ADOPT.**
Owner: existing \`src/rdc\`.
Target: \`scripts/inspect/adoption-plan-readiness.mjs\`.
### FIX-P1 targeted acceptance
1. fixture evidence.

## Explicitly rejected/deferred families
- duplicate runtime: REJECTED.

## Integration boundary
Public compatibility is additive; run \`release:compat\` if a public schema changes.
Activation/restart remains a separate explicit step after qualification.
Release impact: patch unless public behavior changes.

## Reference disposition
**RETAIN** until the proposal is resolved.
`;
}

describe('adoption-plan-readiness inspector', () => {
  it('returns ready JSON without modifying an explicit complete plan or clean reference', async () => {
    const root = await tempDir();
    const reference = await makeGitReference(root);
    const git = (args: string[]) => execFileSync(
      'git',
      ['-c', `safe.directory=${reference}`, '-C', reference, ...args],
      { encoding: 'utf8', windowsHide: true },
    );
    const head = git(['rev-parse', 'HEAD']).trim();
    const plan = path.join(root, 'plan.md');
    const content = completePlan(head, reference);
    await writeFile(plan, content);
    const beforePlan = digest(await readFile(plan, 'utf8'));
    const beforeGit = git(['status', '--porcelain']);

    const result = run(plan, reference);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('ready');
    expect(report.reference.status).toBe('complete');
    expect(report.reference.dirty).toBe(false);
    expect(report.mutationsPerformed).toBe(false);
    expect(digest(await readFile(plan, 'utf8'))).toBe(beforePlan);
    expect(git(['status', '--porcelain'])).toBe(beforeGit);
  });

  it('reports missing readiness evidence precisely while keeping stdout parseable JSON', async () => {
    const root = await tempDir();
    const plan = path.join(root, 'plan.md');
    await writeFile(plan, '# Incomplete\n\nStatus: **PROPOSAL**\n');
    const result = run(plan);
    expect(result.status).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('incomplete');
    expect(report.missing).toContain('source-pin');
    expect(report.missing).toContain('acceptance');
    expect(report.missing).toContain('reference-disposition');
    expect(result.stderr).toContain('adoption-plan-readiness: incomplete');
  });

  it('marks unreadable/non-git reference evidence incomplete instead of assuming readiness', async () => {
    const root = await tempDir();
    const reference = path.join(root, 'not-git');
    await mkdir(reference);
    const plan = path.join(root, 'plan.md');
    await writeFile(plan, completePlan('a'.repeat(40), reference));
    const result = run(plan, reference);
    expect(result.status).toBe(2);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('incomplete');
    expect(report.reference.status).toBe('incomplete');
    expect(report.missing).toContain('reference-git-evidence');
    expect(report.mutationsPerformed).toBe(false);
  });
});