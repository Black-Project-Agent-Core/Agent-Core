import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { SemanticIdeService } from '../src/semantic-ide/service.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots: string[] = [];
async function project(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-semantic-provider-'));
  roots.push(root);
  await writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Node', noEmit: true },
    include: ['*.ts'],
  }), 'utf8');
  await writeFile(path.join(root, 'a.ts'), [
    'export interface Runner { run(): string; }',
    'export function used() { return 1; }',
    'export function unused() { return 2; }',
    '',
  ].join('\n'), 'utf8');
  await writeFile(path.join(root, 'b.ts'), [
    "import { used, type Runner } from './a';",
    'export class Impl implements Runner {',
    '  run() { return String(used()); }',
    '}',
    '',
  ].join('\n'), 'utf8');
  await writeFile(path.join(root, 'bad.ts'), 'const bad: string = 123;\n', 'utf8');
  await writeFile(path.join(root, 'huge.ts'), [
    'export class Huge {',
    '  method() {',
    `    const payload = '${'x'.repeat(6000)}';`,
    '    return payload.length;',
    '  }',
    '}',
    '',
  ].join('\n'), 'utf8');
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
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE TypeScript provider', () => {
  it('serves overview, find, references, declaration/implementation and diagnostics', async () => {
    const root = await project();
    const service = await SemanticIdeService.initialize(config(root));
    try {
      const overview = await service.symbol('overview', { relativePath: 'a.ts', depth: 3 }) as any;
      expect(overview.results.items.some((item: any) => item.name === 'used')).toBe(true);
      const found = await service.symbol('find', { relativePath: 'a.ts', query: 'Runner/run' }) as any;
      expect(found.results.items.some((item: any) => item.namePath === 'Runner/run')).toBe(true);
      await service.symbol('restart', {});
      const foundAfterRestart = await service.symbol('find', { relativePath: 'a.ts', query: 'Runner/run' }) as any;
      expect(foundAfterRestart.results.items.some((item: any) => item.namePath === 'Runner/run')).toBe(true);
      await service.symbol('overview', { relativePath: 'b.ts', depth: 3 });
      const refs = await service.symbol('refs', { relativePath: 'a.ts', namePath: 'used' }) as any;
      expect(refs.results.items.some((item: any) => item.relativePath === 'b.ts')).toBe(true);
      const impl = await service.symbol('impl', { relativePath: 'a.ts', namePath: 'Runner/run' }) as any;
      expect(impl.results.total).toBeGreaterThan(0);
      const decl = await service.symbol('decl', { relativePath: 'b.ts', namePath: 'Impl/run' }) as any;
      expect(decl.results.total).toBeGreaterThan(0);
      const diagnostics = await service.symbol('diag', { relativePath: 'bad.ts', severity: 1 }) as any;
      expect(diagnostics.results.total).toBeGreaterThan(0);
      const budgeted = await service.symbol('overview', {
        relativePath: 'huge.ts', depth: 3, includeBody: true, maxAnswerChars: 1000,
      }) as any;
      expect(JSON.stringify(budgeted.results.items).length).toBeLessThanOrEqual(1000);
      expect(budgeted.results.items[0]?.body).toBeUndefined();
      const health = await service.health();
      expect(health.status).toBe('available');
      expect(health.activeServers[0]?.capabilities?.renameProvider).toBeTruthy();
    } finally {
      await service.close();
    }
  });

  it('previews semantic rename without writes, applies it across files, and safe-deletes only unreferenced symbols', async () => {
    const root = await project();
    const service = await SemanticIdeService.initialize(config(root));
    try {
      const beforeA = await readFile(path.join(root, 'a.ts'), 'utf8');
      const beforeB = await readFile(path.join(root, 'b.ts'), 'utf8');
      await service.symbol('overview', { relativePath: 'b.ts', depth: 3 });
      const preview = await service.refactor('rename', {
        relativePath: 'a.ts', namePath: 'used', newName: 'renamed', dryRun: true,
      }) as any;
      expect(preview.mutation.dryRun).toBe(true);
      expect(preview.mutation.changedFiles).toBeGreaterThanOrEqual(2);
      expect(preview.mutation.files.every((file: any) => file.ranges.length > 0)).toBe(true);
      expect(await readFile(path.join(root, 'a.ts'), 'utf8')).toBe(beforeA);
      expect(await readFile(path.join(root, 'b.ts'), 'utf8')).toBe(beforeB);
      const applied = await service.refactor('rename', {
        relativePath: 'a.ts', namePath: 'used', newName: 'renamed',
      }) as any;
      expect(applied.mutation.changedFiles).toBeGreaterThanOrEqual(2);
      expect(await readFile(path.join(root, 'a.ts'), 'utf8')).toContain('function renamed');
      expect(await readFile(path.join(root, 'b.ts'), 'utf8')).toContain('renamed()');

      const refused = await service.refactor('safeRemove', {
        relativePath: 'a.ts', namePath: 'renamed',
      }) as any;
      expect(refused).toMatchObject({ refused: true, reason: 'SEMANTIC_SYMBOL_REFERENCED' });

      const deleted = await service.refactor('safeRemove', {
        relativePath: 'a.ts', namePath: 'unused',
      }) as any;
      expect(deleted.mutation.changedFiles).toBe(1);
      expect(await readFile(path.join(root, 'a.ts'), 'utf8')).not.toContain('function unused');
    } finally {
      await service.close();
    }
  });
});
