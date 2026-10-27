import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChangedSymbolReview } from '../src/code-intelligence/change-review.js';
import {
  collectSourceRepresentation,
  GraphIntegrityObserver,
} from '../src/code-intelligence/graph-observability.js';
import { registerCodeIntelligenceTools } from '../src/mcp/code-intelligence-tools.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}
async function gitRepo(): Promise<{ root: string; repo: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-graft-graphify-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  await mkdir(repo);
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'agent-core-test@example.invalid');
  git(repo, 'config', 'user.name', 'Agent Core Test');
  return { root, repo };
}

function evidence(entities: number, relationships: number) {
  return {
    available: true,
    reason: 'provider-graph-loaded',
    entities,
    relationships,
  };
}

describe('GRAPHIFY-P1 accepted-index integrity', () => {
  it('degrades same-source shrink until a fresh explicit reindex authorizes a new baseline', async () => {
    const { root, repo } = await gitRepo();
    await writeFile(path.join(repo, 'a.ts'), 'export const a = 1;\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'baseline');
    const observer = new GraphIntegrityObserver(path.join(root, 'integrity.json'));

    expect((await observer.observe({
      group: 'w', repo: 'repo', repoPath: repo, evidence: evidence(100, 200),
    })).state).toBe('accepted');
    const degraded = await observer.observe({
      group: 'w', repo: 'repo', repoPath: repo, evidence: evidence(90, 180),
    });
    expect(degraded).toMatchObject({
      state: 'degraded',
      reason: 'unexplained-structural-shrink',
      accepted: { entities: 100, relationships: 200 },
      current: { entities: 90, relationships: 180 },
    });

    await observer.authorizeIndex({ group: 'w', repo: 'repo', repoPath: repo });
    const accepted = await observer.observe({
      group: 'w', repo: 'repo', repoPath: repo, evidence: evidence(90, 180),
    });
    expect(accepted).toMatchObject({
      state: 'accepted',
      reason: 'same-source-shrink-explicitly-indexed',
      accepted: { entities: 90, relationships: 180 },
    });

    const authorizationConsumed = await observer.observe({
      group: 'w', repo: 'repo', repoPath: repo, evidence: evidence(80, 170),
    });
    expect(authorizationConsumed).toMatchObject({
      state: 'degraded',
      reason: 'unexplained-structural-shrink',
    });
  });

  it('requires an explicit index request before accepting a source-changed shrink', async () => {
    const { root, repo } = await gitRepo();
    const source = path.join(repo, 'a.ts');
    await writeFile(source, 'export const a = 1;\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'baseline');
    const observer = new GraphIntegrityObserver(path.join(root, 'integrity.json'));
    await observer.observe({
      group: 'w', repo: 'repo', repoPath: repo, evidence: evidence(100, 200),
    });

    await writeFile(source, 'export const a = 2;\n');
    const refused = await observer.observe({
      group: 'w', repo: 'repo', repoPath: repo, evidence: evidence(80, 160),
    });
    expect(refused).toMatchObject({
      state: 'unverified',
      reason: 'source-changed-shrink-requires-explicit-index',
    });
    await observer.authorizeIndex({ group: 'w', repo: 'repo', repoPath: repo });
    const accepted = await observer.observe({
      group: 'w', repo: 'repo', repoPath: repo, evidence: evidence(80, 160),
    });
    expect(accepted).toMatchObject({
      state: 'accepted',
      reason: 'source-changed-shrink-explicitly-indexed',
      accepted: { entities: 80, relationships: 160 },
    });
  });
});

describe('GRAPHIFY-P2 source representation', () => {
  it('separates represented, unrepresented, excluded, and unclassified files', async () => {
    const { repo } = await gitRepo();
    await mkdir(path.join(repo, 'src'));
    await mkdir(path.join(repo, 'scripts'));
    await mkdir(path.join(repo, 'ignored'));
    await writeFile(path.join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(path.join(repo, 'scripts', 'b.py'), 'x = 1\n');
    await writeFile(path.join(repo, 'ignored', 'c.ts'), 'export const c = 1;\n');
    await writeFile(path.join(repo, '.grafelignore'), '/ignored/\n');
    await writeFile(path.join(repo, 'README.md'), '# docs\n');
    await writeFile(path.join(repo, 'notes.unknownext'), 'opaque\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'coverage fixture');

    const probe = vi.fn(async (relativePath: string) => relativePath === 'src/a.ts');
    const result = await collectSourceRepresentation({
      root: repo,
      probe,
    });
    expect(result).toMatchObject({
      state: 'available',
      sourceCandidatesTotal: 2,
      represented: 1,
      unrepresented: 1,
      unknown: 0,
      truncated: false,
    });
    expect(result.intentionallyExcludedTotal).toBeGreaterThanOrEqual(2);
    expect(result.unclassifiedTotal).toBe(1);
    expect(result.sampleUnrepresented).toContain('scripts/b.py');
    expect(probe).not.toHaveBeenCalledWith('ignored/c.ts');
    expect(result.sampleUnclassified).toContain('notes.unknownext');
  });
});

function semanticFixture() {
  return {
    symbol: vi.fn(async (_action: string, input: any) => input.relativePath === 'src/box.ts'
      ? {
          results: {
            items: [{
              name: 'Box',
              namePath: 'Box',
              kind: 5,
              relativePath: 'src/box.ts',
              range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } },
              language: 'typescript',
              provider: 'typescript',
              members: [{
                name: 'target',
                namePath: 'Box/target',
                kind: 6,
                relativePath: 'src/box.ts',
                range: { start: { line: 2, character: 2 }, end: { line: 2, character: 24 } },
                language: 'typescript',
                provider: 'typescript',
              }],
            }],
          },
        }
      : { results: { items: [] } }),
  };
}

function providerFixture(repoRoot: string) {
  return {
    resolveWorkspace: vi.fn(async () => ({
      workspace: 'w',
      group: 'w',
      cwd: repoRoot,
      repo: 'agent-core',
      worktreePath: repoRoot,
    })),
    callProviderTool: vi.fn(async (name: string, args: any) => {
      if (name === 'grafel_find') {
        return {
          content: [],
          structuredContent: {
            results: [{
              id: 'agent-core::target',
              name: 'target',
              kind: 'Operation',
              source_file: 'src/box.ts',
            }],
          },
        };
      }
      if (name === 'grafel_impact_radius') {
        return {
          content: [],
          structuredContent: {
            affected: [
              {
                entity_id: 'agent-core::test-target',
                name: 'tests target',
                kind: 'Operation',
                source_file: 'tests/box.test.ts',
                hop_count: 1,
              },
              {
                entity_id: 'agent-core::consumer',
                name: 'consumer',
                kind: 'Operation',
                source_file: 'src/consumer.ts',
                hop_count: 1,
              },
            ],
            total_affected: 2,
            count: 2,
            truncated: false,
          },
        };
      }
      throw new Error(`Unexpected provider operation ${name} ${JSON.stringify(args)}`);
    }),
  };
}

async function reviewRepo() {
  const { repo } = await gitRepo();
  await mkdir(path.join(repo, 'src'));
  await mkdir(path.join(repo, 'tests'));
  await writeFile(path.join(repo, 'src', 'box.ts'), [
    'class Box {',
    '  keep() { return 1; }',
    '  target() { return 2; }',
    '}',
    '',
  ].join('\n'));
  await writeFile(path.join(repo, 'tests', 'box.test.ts'), [
    "import { describe, it } from 'vitest';",
    "describe('box', () => it('target', () => {}));",
    '',
  ].join('\n'));
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'baseline');

  await writeFile(path.join(repo, 'src', 'box.ts'), [
    'class Box {',
    '  keep() { return 1; }',
    '  target() { return 3; }',
    '}',
    '',
  ].join('\n'));
  await writeFile(path.join(repo, 'tests', 'box.test.ts'), [
    "import { describe, it } from 'vitest';",
    "describe('box changed', () => it('target', () => {}));",
    '',
  ].join('\n'));
  return repo;
}

describe('GRAFT-P1 changed-symbol review evidence', () => {
  it('seeds the innermost changed symbol and reports changed tests plus bounded evidence', async () => {
    const repo = await reviewRepo();
    const semantic = semanticFixture();
    const service = providerFixture(repo);
    const review = await buildChangedSymbolReview({
      service: service as any,
      semanticIde: semantic as any,
      context: { workspace: 'w', group: 'w', cwd: repo, repo: 'agent-core', worktreePath: repo },
      repo: 'agent-core',
      root: repo,
    });

    const target = review.seeds.find(seed => seed.name === 'target');
    expect(target).toMatchObject({
      path: 'src/box.ts',
      namePath: 'Box/target',
      wholeFile: false,
      entityId: 'agent-core::target',
      testEvidence: {
        state: 'changed',
        changedTestFiles: ['tests/box.test.ts'],
      },
    });
    expect(target?.dependents).toHaveLength(2);
    expect(target?.snippet?.join('\n')).toContain('return 3');
    expect(review.reviewers).toEqual([]);
    expect(review.sourceAuthority).toBe('exact-source+semantic-ide+grafel');
  });

  it('adds reviewEvidence to changeset impact without replacing provider fields', async () => {
    const repo = await reviewRepo();
    const service = providerFixture(repo);
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCodeIntelligenceTools(server, service as any, semanticFixture() as any);
    const registered = (server as any)._registeredTools ?? (server as any).registeredTools;
    const entry = registered instanceof Map ? registered.get('code_surface') : registered.code_surface;
    if (!entry?.handler) throw new Error('code_surface handler not registered');

    const result = await entry.handler({
      action: 'impact',
      scope: 'changeset',
      repo: 'agent-core',
      worktreePath: repo,
    });
    expect(result.isError).not.toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(2);
    expect(payload.affected).toHaveLength(2);
    expect(payload.reviewEvidence).toMatchObject({
      sourceAuthority: 'exact-source+semantic-ide+grafel',
    });
    expect(payload.reviewEvidence.seeds.some((seed: any) => seed.name === 'target')).toBe(true);
  });

  it('rejects option-like revisions before any git or provider call, so --output cannot write a file', async () => {
    const repo = await reviewRepo();
    const planted = path.join(repo, 'planted.txt');
    const service = providerFixture(repo);
    const context = { workspace: 'w', group: 'w', cwd: repo, repo: 'agent-core', worktreePath: repo };
    for (const range of [{ base: `--output=${planted}` }, { head: '-x' }, { base: 'HEAD', head: '--stat' }]) {
      await expect(buildChangedSymbolReview({ service: service as any, context, repo: 'agent-core', root: repo, ...range }))
        .rejects.toThrow('must not start with "-"');
    }
    await expect(stat(planted)).rejects.toThrow();

    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCodeIntelligenceTools(server, service as any, semanticFixture() as any);
    const registered = (server as any)._registeredTools ?? (server as any).registeredTools;
    const entry = registered instanceof Map ? registered.get('code_surface') : registered.code_surface;
    for (const args of [
      { action: 'impact', scope: 'changeset', repo: 'agent-core', worktreePath: repo, base: `--output=${planted}` },
      { action: 'diff', aspect: 'refs', repo: 'agent-core', worktreePath: repo, refA: 'HEAD', refB: '--stat' },
    ]) {
      const result = await entry.handler(args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must not start with "-"');
    }
    expect(service.callProviderTool).not.toHaveBeenCalled();
    await expect(stat(planted)).rejects.toThrow();
  });
});
