import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { SemanticIdeService } from '../src/semantic-ide/service.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function rootFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-semantic-grafel-'));
  roots.push(root);
  await writeFile(path.join(root, 'sample.ts'), 'export function sample() { return 1; }\n', 'utf8');
  return root;
}
function config(root: string) {
  return {
    enabled: true,
    projectRoot: root,
    runtimeDir: path.join(root, '.semantic-runtime'),
    startupTimeoutMs: 15_000,
    callTimeoutMs: 15_000,
    typescriptServerPath: path.join(repoRoot, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
    typescriptTsserverPath: path.join(repoRoot, 'node_modules', 'typescript-lsp-runtime', 'lib', 'tsserver.js'),
  };
}
describe('Semantic IDE Grafel coordination', () => {
  it('requests Grafel reindex after a successful semantic mutation', async () => {
    const root = await rootFixture();
    const calls: any[] = [];
    const codeIntelligence = {
      resolveWorkspace: async () => ({ workspace: 'fixture', cwd: root }),
      indexWorkspace: async (input: any) => {
        calls.push(input);
        return { requested: true, index: 'queued' };
      },
    } as any;
    const service = await SemanticIdeService.initialize(config(root), codeIntelligence);
    try {
      const result = await service.refactor('replaceBody', {
        workspace: 'fixture',
        relativePath: 'sample.ts',
        namePath: 'sample',
        body: 'export function sample() { return 2; }',
      }) as any;
      expect(result.grafel).toMatchObject({ markedDirty: true, reindexRequested: true });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ workspace: 'fixture' });
      expect(await readFile(path.join(root, 'sample.ts'), 'utf8')).toContain('return 2');
    } finally {
      await service.close();
    }
  });

  it('keeps a successful semantic mutation when Grafel is unavailable and reports sync truthfully', async () => {
    const root = await rootFixture();
    const codeIntelligence = {
      resolveWorkspace: async () => ({ workspace: 'fixture', cwd: root }),
      indexWorkspace: async () => { throw new Error('synthetic-grafel-unavailable'); },
    } as any;
    const service = await SemanticIdeService.initialize(config(root), codeIntelligence);
    try {
      const result = await service.refactor('replaceBody', {
        workspace: 'fixture',
        relativePath: 'sample.ts',
        namePath: 'sample',
        body: 'export function sample() { return 3; }',
      }) as any;
      expect(result.mutation.changedFiles).toBe(1);
      expect(result.grafel.markedDirty).toBe(false);
      expect(result.grafel.reindexRequested).toBe(false);
      expect(result.grafel.unavailable).toMatch(/synthetic-grafel-unavailable/);
      expect(await readFile(path.join(root, 'sample.ts'), 'utf8')).toContain('return 3');
    } finally {
      await service.close();
    }
  });
});
