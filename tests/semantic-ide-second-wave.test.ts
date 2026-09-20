import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageServerSession } from '../src/semantic-ide/language-server.js';
import { SemanticIdeService } from '../src/semantic-ide/service.js';
import type { SemanticLanguageServerDefinition } from '../src/semantic-ide/types.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureServer = path.join(repoRoot, 'tests', 'fixtures', 'semantic-second-wave-lsp.mjs');
const roots: string[] = [];

async function temp(prefix = 'agent-core-semantic-second-wave-'): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function config(root: string, servers: SemanticLanguageServerDefinition[]) {
  return {
    enabled: true,
    projectRoot: root,
    runtimeDir: path.join(root, '.runtime'),
    startupTimeoutMs: 5000,
    callTimeoutMs: 5000,
    typescriptServerPath: path.join(repoRoot, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
    typescriptTsserverPath: path.join(repoRoot, 'node_modules', 'typescript-lsp-runtime', 'lib', 'tsserver.js'),
    servers,
  };
}

function server(
  id: string,
  extension: string,
  mode: string,
  options: Partial<SemanticLanguageServerDefinition> = {},
  aux?: string,
): SemanticLanguageServerDefinition {
  return {
    id,
    extensions: [extension],
    languageIds: { [extension]: id.replace(/-lsp$/, '') },
    command: process.execPath,
    args: [fixtureServer, mode, ...(aux ? [aux] : [])],
    ...options,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE second-wave symbol precision', () => {
  it('normalizes overloads into stable indexed namePaths and enriches includeInfo via hover', async () => {
    const root = await temp();
    const file = path.join(root, 'sample.rich');
    await writeFile(file, [
      'function work() { return 1; }',
      'function work() { return "two"; }',
      '',
    ].join('\n'), 'utf8');

    const service = await SemanticIdeService.initialize(config(root, [
      server('rich-lsp', '.rich', 'rich', { adapter: 'csharp', readinessTimeoutMs: 1000 }),
    ]));
    try {
      const result = await service.symbol('overview', {
        relativePath: 'sample.rich',
        depth: 2,
        includeInfo: true,
      }) as any;
      expect(result.results.items.map((item: any) => item.namePath)).toEqual(['work[0]', 'work[1]']);
      expect(result.results.items.every((item: any) => item.name === 'work')).toBe(true);
      expect(result.results.items.every((item: any) => item.info === '**fixture hover info**')).toBe(true);
      expect(result.info).toMatchObject({ requested: true, enriched: 2, partial: false });

      const exact = await service.symbol('find', {
        relativePath: 'sample.rich',
        namePath: 'work[1]',
      }) as any;
      expect(exact.results.items).toHaveLength(1);
      expect(exact.results.items[0].namePath).toBe('work[1]');
    } finally {
      await service.close();
    }
  });

  it('drops provider locations outside the authorized workspace and reports the drop', async () => {
    const root = await temp();
    const outsideRoot = await temp('agent-core-semantic-outside-');
    const outsideFile = path.join(outsideRoot, 'outside.out');
    await writeFile(outsideFile, 'outside\n', 'utf8');
    await writeFile(path.join(root, 'sample.out'), 'function sample() {}\n', 'utf8');

    const service = await SemanticIdeService.initialize(config(root, [
      server('outside-lsp', '.out', 'outside-location', {}, outsideFile),
    ]));
    try {
      const result = await service.symbol('refs', {
        relativePath: 'sample.out',
        namePath: 'sample',
      }) as any;
      expect(result.results.total).toBe(1);
      expect(result.results.items[0].relativePath).toBe('sample.out');
      expect(result.droppedLocations).toMatchObject({ total: 1, outside: 1 });
    } finally {
      await service.close();
    }
  });
});

describe('Semantic IDE second-wave mutation/provider truth', () => {
  it('single-flights concurrent first-start requests for one provider session', async () => {
    const root = await temp();
    const logFile = path.join(root, 'startup.jsonl');
    const definition = server('singleflight-lsp', '.sf', 'basic', {}, logFile);
    const session = new LanguageServerSession(definition, root, 5000);
    try {
      await Promise.all([session.start(), session.start(), session.start()]);
      const rows = (await readFile(logFile, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
      const initializeCalls = rows.filter(row => row.direction === 'in' && row.message?.method === 'initialize');
      expect(initializeCalls).toHaveLength(1);
    } finally {
      await session.close();
    }
  });

  it('rejects provider symbol ranges that point beyond the canonical source', async () => {
    const root = await temp();
    await writeFile(path.join(root, 'broken.bad'), 'short\n', 'utf8');
    const service = await SemanticIdeService.initialize(config(root, [
      server('bad-lsp', '.bad', 'invalid-range'),
    ]));
    try {
      await expect(service.symbol('overview', { relativePath: 'broken.bad' }))
        .rejects.toThrow(/SEMANTIC_PROVIDER_RANGE_INVALID/);
    } finally {
      await service.close();
    }
  });

  it('applies RenameFile returned by the language server and resyncs the new path', async () => {
    const root = await temp();
    const oldFile = path.join(root, 'old.move');
    const newFile = path.join(root, 'renamed.move');
    await writeFile(oldFile, 'function sample() {}\n', 'utf8');

    const service = await SemanticIdeService.initialize(config(root, [
      server('move-lsp', '.move', 'rename-file'),
    ]));
    try {
      const preview = await service.refactor('rename', {
        relativePath: 'old.move',
        namePath: 'sample',
        newName: 'ignored-by-fixture',
        dryRun: true,
      }) as any;
      expect(preview.mutation.renamedFiles).toEqual([{ from: 'old.move', to: 'renamed.move' }]);
      await expect(access(oldFile)).resolves.toBeUndefined();

      const applied = await service.refactor('rename', {
        relativePath: 'old.move',
        namePath: 'sample',
        newName: 'ignored-by-fixture',
      }) as any;
      expect(applied.mutation.renamedFiles).toEqual([{ from: 'old.move', to: 'renamed.move' }]);
      await expect(access(oldFile)).rejects.toBeTruthy();
      expect(await readFile(newFile, 'utf8')).toContain('sample');
    } finally {
      await service.close();
    }
  });

  it('canonicalizes published diagnostics keys so equivalent file URIs resolve to one document', async () => {
    const root = await temp();
    const file = path.join(root, 'sample.diag');
    await writeFile(file, 'x\n', 'utf8');
    const definition = server('diag-lsp', '.diag', 'diagnostics');
    const session = new LanguageServerSession(definition, root, 5000);
    try {
      await session.start();
      const opened = await session.ensureDocument(file, 'diag');
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(session.diagnosticsFor(opened.uri)).toHaveLength(1);
      expect(session.diagnosticsGenerationFor(opened.uri)).toBeGreaterThanOrEqual(0);
    } finally {
      await session.close();
    }
  });

  it('reports missing required provider capabilities as degraded truth', async () => {
    const root = await temp();
    const definition = server('csharp', '.cs', 'missing-capability', {
      adapter: 'csharp',
      readinessTimeoutMs: 1000,
    });
    const session = new LanguageServerSession(definition, root, 5000);
    try {
      await session.start();
      expect(session.readiness).toBe('degraded');
      expect(session.capabilityIssues.join(' ')).toMatch(/renameProvider/);
      expect(() => session.assertCapability('renameProvider', 'textDocument/rename'))
        .toThrow(/SEMANTIC_PROVIDER_CAPABILITY_UNAVAILABLE/);
    } finally {
      await session.close();
    }
  });

  it('marks nested tsserver fatal evidence degraded and recovers on the next semantic operation', async () => {
    const root = await temp();
    await writeFile(path.join(root, 'sample.ts'), 'function sample() {}\n', 'utf8');
    const typescriptOverride = server('typescript', '.ts', 'fatal-typescript', {
      adapter: 'typescript',
      languageIds: { '.ts': 'typescript' },
      readinessTimeoutMs: 1000,
    });

    const service = await SemanticIdeService.initialize(config(root, [typescriptOverride]));
    try {
      const first = await service.symbol('overview', { relativePath: 'sample.ts' }) as any;
      expect(first.results.items[0]?.name).toBe('sample');
      let health = await service.health();
      expect(health.activeServers.find(item => item.id === 'typescript')?.readiness).toBe('degraded');

      const second = await service.symbol('overview', { relativePath: 'sample.ts' }) as any;
      expect(second.results.items[0]?.name).toBe('sample');
      health = await service.health();
      expect(health.activeServers.find(item => item.id === 'typescript')?.state).toBe('running');
    } finally {
      await service.close();
    }
  });
});
