import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { SemanticIdeService } from '../src/semantic-ide/service.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fakeServer = path.join(repoRoot, 'tests', 'fixtures', 'semantic-fake-lsp.mjs');
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-semantic-routing-'));
  roots.push(root);
  await writeFile(path.join(root, 'one.foo'), 'function one() {}\n', 'utf8');
  await writeFile(path.join(root, 'two.bar'), 'function two() {}\n', 'utf8');
  return root;
}
function config(root: string) {
  return {
    enabled: true,
    projectRoot: root,
    runtimeDir: path.join(root, '.runtime'),
    startupTimeoutMs: 5_000,
    callTimeoutMs: 5_000,
    typescriptServerPath: path.join(repoRoot, 'node_modules', 'typescript-language-server', 'lib', 'cli.mjs'),
    typescriptTsserverPath: path.join(repoRoot, 'node_modules', 'typescript-lsp-runtime', 'lib', 'tsserver.js'),
    servers: [
      {
        id: 'foo-lsp',
        extensions: ['.foo'],
        languageIds: { '.foo': 'foo' },
        command: process.execPath,
        args: [fakeServer, 'foo'],
      },
      {
        id: 'bar-lsp',
        extensions: ['.bar'],
        languageIds: { '.bar': 'bar' },
        command: process.execPath,
        args: [fakeServer, 'bar'],
      },
      {
        id: 'restart-lsp',
        extensions: ['.retry'],
        languageIds: { '.retry': 'retry' },
        command: process.execPath,
        args: [fakeServer, 'restart-once', path.join(root, '.restart-marker')],
      },
      {
        id: 'crash-lsp',
        extensions: ['.boom'],
        languageIds: { '.boom': 'boom' },
        command: process.execPath,
        args: [fakeServer, 'crash'],
      },
    ],
  };
}

describe('Semantic IDE language routing', () => {
  it('keeps two language servers isolated by file type', async () => {
    const root = await makeRoot();
    const service = await SemanticIdeService.initialize(config(root));
    try {
      const foo = await service.symbol('overview', { relativePath: 'one.foo' }) as any;
      const bar = await service.symbol('overview', { relativePath: 'two.bar' }) as any;
      expect(foo.results.items[0]?.name).toBe('fooSymbol');
      expect(bar.results.items[0]?.name).toBe('barSymbol');
      const health = await service.health();
      const ids = health.activeServers.map(item => item.id).sort();
      expect(ids).toEqual(['bar-lsp', 'foo-lsp']);
    } finally {
      await service.close();
    }
  });

  it('fails soft for an unsupported language instead of using the wrong server', async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, 'three.unknown'), 'x\n', 'utf8');
    const service = await SemanticIdeService.initialize(config(root));
    try {
      await expect(service.symbol('overview', { relativePath: 'three.unknown' }))
        .rejects.toThrow(/SEMANTIC_LANGUAGE_NOT_CONFIGURED/);
    } finally {
      await service.close();
    }
  });

  it('requires a concrete worktree for ref-scoped LSP calls', async () => {
    const root = await makeRoot();
    const fakeCodeIntelligence = {
      resolveWorkspace: async (input: any) => ({
        workspace: input.workspace ?? 'fixture',
        cwd: root,
        ref: input.ref,
        worktreePath: input.worktreePath,
      }),
    } as any;
    const service = await SemanticIdeService.initialize(config(root), fakeCodeIntelligence);
    try {
      await expect(service.symbol('overview', { relativePath: 'one.foo', ref: 'feature/demo' }))
        .rejects.toThrow(/SEMANTIC_REF_REQUIRES_WORKTREE/);
    } finally {
      await service.close();
    }
  });
});

describe('Semantic IDE workspace boundaries', () => {
  it('routes registered workspace calls to the concrete workspace path and fails closed on unknown names', async () => {
    const root = await makeRoot();
    const fakeCodeIntelligence = {
      resolveWorkspace: async (input: any) => {
        if (input.workspace !== 'fixture') throw new Error('CODE_WORKSPACE_NOT_REGISTERED');
        return { workspace: 'fixture', cwd: root };
      },
    } as any;
    const service = await SemanticIdeService.initialize(config(root), fakeCodeIntelligence);
    try {
      const result = await service.symbol('overview', { workspace: 'fixture', relativePath: 'one.foo' }) as any;
      expect(result.context.root).toBe(root);
      await expect(service.symbol('overview', { workspace: 'missing', relativePath: 'one.foo' }))
        .rejects.toThrow(/CODE_WORKSPACE_NOT_REGISTERED/);
    } finally {
      await service.close();
    }
  });

  it('rejects protected workspace roots', async () => {
    const base = await makeRoot();
    const protectedRoot = path.join(base, 'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT', 'repo');
    await import('node:fs/promises').then(fs => fs.mkdir(protectedRoot, { recursive: true }));
    const fakeCodeIntelligence = {
      resolveWorkspace: async () => ({ workspace: 'protected', cwd: protectedRoot }),
    } as any;
    const service = await SemanticIdeService.initialize(config(base), fakeCodeIntelligence);
    try {
      await expect(service.symbol('status', { workspace: 'protected' }))
        .rejects.toThrow(/SEMANTIC_PROTECTED_PATH/);
    } finally {
      await service.close();
    }
  });
});

describe('Semantic IDE provider recovery', () => {
  it('restarts once after a confirmed provider exit and then completes the request', async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, 'once.retry'), 'function once() {}\n', 'utf8');
    const service = await SemanticIdeService.initialize(config(root));
    try {
      const result = await service.symbol('overview', { relativePath: 'once.retry' }) as any;
      expect(result.results.items[0]?.name).toBe('restart-onceSymbol');
      const health = await service.health();
      expect(health.activeServers.find(item => item.id === 'restart-lsp')?.state).toBe('running');
    } finally {
      await service.close();
    }
  });

  it('does not loop when the replacement provider also exits', async () => {
    const root = await makeRoot();
    await writeFile(path.join(root, 'always.boom'), 'function boom() {}\n', 'utf8');
    const service = await SemanticIdeService.initialize(config(root));
    try {
      await expect(service.symbol('overview', { relativePath: 'always.boom' }))
        .rejects.toThrow(/SEMANTIC_IDE_SERVER_EXITED|SEMANTIC_IDE_SERVER_NOT_RUNNING/);
    } finally {
      await service.close();
    }
  });
});
