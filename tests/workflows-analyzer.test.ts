import { mkdir, mkdtemp, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript-lsp-runtime';
import { analyzeSources, collectAllowedSources, WORKFLOW_SOURCE_LIMITS } from '../src/workflows/analyzer.js';

// Count real parser executions; all fixtures still run TypeScript's actual parser.
vi.mock('typescript-lsp-runtime', async importOriginal => {
  const actual = await importOriginal<typeof import('typescript-lsp-runtime')>();
  return { default: { ...actual.default, createSourceFile: vi.fn(actual.default.createSourceFile) } };
});

const roots: string[] = [];
async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-workflows-'));
  roots.push(root);
  for (const [name, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), source);
  }
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('deterministic Workflows source analysis', () => {
  it('connects system and Memory from imports, re-exports and literal dynamic imports with source lines', async () => {
    const root = await fixture({
      'src/index.ts': '// import "./fake.js";\nimport { run } from "./mcp/server.js";\nexport * from "./memory/host.js";\nconst view = import("./ui/view.js");',
      'src/mcp/server.ts': 'export const run = 1;',
      'src/memory/host.ts': 'export * from "../../SubProject/agent-core-memory/dist/index.js";',
      'src/ui/view.tsx': 'export const view = <div />;',
      'SubProject/agent-core-memory/src/index.ts': 'export * from "./memory/service.js";',
      'SubProject/agent-core-memory/src/memory/service.ts': 'export const memory = true;',
    });
    const graph = await analyzeSources(root);
    expect(graph.schemaVersion).toBe(1);
    expect(graph.files).toBe(6);
    expect(graph.edges).toHaveLength(5);
    expect(graph.unknowns).toBe(0);
    expect(graph.edges.flatMap(edge => edge.evidence)).toEqual(expect.arrayContaining([
      { path: 'src/index.ts', line: 2 }, { path: 'src/index.ts', line: 3 }, { path: 'src/index.ts', line: 4 },
      { path: 'src/memory/host.ts', line: 1 },
    ]));
    expect(graph.nodes.some(node => node.kind === 'memory')).toBe(true);
    expect(graph.edges.some(edge => edge.from.startsWith('system/') && edge.to.startsWith('memory/'))).toBe(true);
    expect(graph.limitations.join(' ')).toContain('dist');
  });

  it('hashes source content deterministically, ignoring timestamps and excluded files', async () => {
    const root = await fixture({ 'src/index.ts': 'export const value = 1;' });
    const first = await analyzeSources(root);
    await utimes(path.join(root, 'src/index.ts'), new Date(0), new Date(0));
    await writeFile(path.join(root, '.env'), 'private=value');
    expect(await analyzeSources(root)).toEqual(first);
    await writeFile(path.join(root, 'src/index.ts'), 'export const value = 2;');
    expect((await analyzeSources(root)).fingerprint).not.toBe(first.fingerprint);
  });

  it('excludes runtime, secrets, no-go paths, tests, assets, declarations and non-source roots', async () => {
    const excluded = [
      'runtime/live.ts', 'secrets/key.ts', 'src/runtime/live.ts', 'src/secrets/key.ts', 'src/.env.ts',
      'src/DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/private.ts', 'src/tests/example.ts',
      'src/launcher.tests/ExampleTests.cs', 'src/module.test.ts', 'src/module.spec.tsx',
      'src/types.d.ts', 'src/assets/asset.ts', 'src/node_modules/library/index.ts', 'src/.hidden/file.ts',
      'SubProject/other/src/index.ts', 'src/browser.js', 'src/dist/generated.ts',
    ];
    const root = await fixture({ 'src/index.ts': '', ...Object.fromEntries(excluded.map(name => [name, 'secret-content'])) });
    const graph = await analyzeSources(root);
    expect(graph.files).toBe(1);
    expect(graph.nodes.flatMap(node => node.paths)).toEqual(['src/index.ts']);
    expect(JSON.stringify(graph)).not.toContain('secret-content');
  });

  it('rejects symlink sources, symlink source roots and import paths outside the allowlist', async () => {
    const outside = await fixture({ 'outside.ts': 'export const secret = 1;', 'private/file.ts': '' });
    const root = await fixture({ 'src/index.ts': 'import "../outside.ts";\nimport "./linked.ts";' });
    await symlink(path.join(outside, 'outside.ts'), path.join(root, 'src/linked.ts'));
    await symlink(path.join(outside, 'private'), path.join(root, 'src/linked-dir'), 'dir');
    await mkdir(path.join(root, 'SubProject'), { recursive: true });
    await symlink(outside, path.join(root, 'SubProject/agent-core-memory'), 'dir');
    const graph = await analyzeSources(root);
    expect(graph.files).toBe(1);
    expect(graph.edges).toEqual([]);
    expect(graph.unknowns).toBe(2);
    expect(graph.limitations.join(' ')).toMatch(/symlink/i);
    await symlink(root, path.join(outside, 'project-link'), 'dir');
    await expect(analyzeSources(path.join(outside, 'project-link'))).rejects.toThrow(/symlink/i);
  });

  it('reports unresolved, external, dynamic and unsupported C# evidence without fabricating edges', async () => {
    const root = await fixture({
      'src/index.ts': 'import "node:fs";\nimport "./missing.js";\nconst value = import(name);\n// import "./fake.js"',
      'src/launcher/Program.cs': 'using Agent.Memory; class Program {}',
    });
    const graph = await analyzeSources(root);
    expect(graph.files).toBe(2);
    expect(graph.edges).toEqual([]);
    expect(graph.unknowns).toBe(4);
    expect(graph.limitations.join(' ')).toMatch(/1 C#.*unsupported/i);
  });

  it('bounds subsystem nodes, evidence and oversized input while retaining both source families', async () => {
    const files: Record<string, string> = { 'src/index.ts': '' };
    for (let index = 0; index < 80; index++) files[`src/module-${index}/index.ts`] = 'import "../index.js";\n'.repeat(30);
    files['SubProject/agent-core-memory/src/index.ts'] = '';
    files['src/oversized.ts'] = 'x'.repeat(WORKFLOW_SOURCE_LIMITS.maxFileBytes + 1);
    const graph = await analyzeSources(await fixture(files));
    expect(graph.files).toBe(82);
    expect(graph.nodes.length).toBeLessThanOrEqual(60);
    expect(graph.nodes.some(node => node.id.startsWith('memory/'))).toBe(true);
    expect(graph.edges.every(edge => edge.evidence.length <= WORKFLOW_SOURCE_LIMITS.maxEvidencePerEdge)).toBe(true);
    expect(graph.nodes.every(node => node.paths.length <= WORKFLOW_SOURCE_LIMITS.maxPathsPerNode)).toBe(true);
    expect(graph.limitations.join(' ')).toMatch(/oversized/i);
  });

  it('caps collected file count and total bytes deterministically', async () => {
    const manyFiles = Object.fromEntries(Array.from({ length: WORKFLOW_SOURCE_LIMITS.maxFiles + 1 }, (_, index) => [`src/file-${String(index).padStart(4, '0')}.ts`, '']));
    const manyRoot = await fixture(manyFiles);
    const first = await collectAllowedSources(manyRoot);
    expect(first.sources).toHaveLength(WORKFLOW_SOURCE_LIMITS.maxFiles);
    expect(await collectAllowedSources(manyRoot)).toEqual(first);
    expect(first.limitations.join(' ')).toContain('file/byte limit');
    const largeFiles = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`src/file-${index}.ts`, ' '.repeat(WORKFLOW_SOURCE_LIMITS.maxFileBytes)]));
    const large = await collectAllowedSources(await fixture(largeFiles));
    expect(large.sources).toHaveLength(16);
    expect(large.limitations.join(' ')).toContain('file/byte limit');
  });

  it('keeps other files usable when one source exhausts parser depth', async () => {
    const root = await fixture({
      'src/index.ts': 'import "./mcp/server.js";',
      'src/mcp/server.ts': 'export const value = 1;',
      'src/deep.ts': '('.repeat(12_000) + '1' + ')'.repeat(12_000),
    });
    const graph = await analyzeSources(root);
    expect(graph.edges).toHaveLength(1);
    expect(graph.unknowns).toBe(1);
    expect(graph.limitations.join(' ')).toMatch(/parse|syntax/i);
  });

  it('reports missing allowlisted source roots instead of suggesting a complete scan', async () => {
    const root = await fixture({ 'other/unused.ts': '' });
    const graph = await analyzeSources(root);
    expect(graph.files).toBe(0);
    expect(graph.limitations.join(' ')).toContain('unavailable source root');
  });

  it('reuses only current-root content-hash parser results and detects same-size, same-mtime edits', async () => {
    const files = {
      'src/index.ts': 'import "./mcp/server.js";',
      'src/mcp/server.ts': 'export const value = 1;',
      'src/net/server.ts': 'export const value = 1;',
    };
    const root = await fixture(files);
    const before = await stat(path.join(root, 'src/index.ts'));
    vi.mocked(ts.createSourceFile).mockClear();
    const first = await analyzeSources(root);
    expect(ts.createSourceFile).toHaveBeenCalledTimes(3);
    expect(await analyzeSources(root)).toEqual(first);
    expect(ts.createSourceFile).toHaveBeenCalledTimes(3);
    await writeFile(path.join(root, 'src/index.ts'), 'import "./net/server.js";');
    await utimes(path.join(root, 'src/index.ts'), before.atime, before.mtime);
    const changed = await analyzeSources(root);
    expect(ts.createSourceFile).toHaveBeenCalledTimes(4);
    expect(changed.fingerprint).not.toBe(first.fingerprint);
    expect(changed.edges[0].to).toBe('system/net');
    await analyzeSources(await fixture(files));
    expect(ts.createSourceFile).toHaveBeenCalledTimes(7);
  });
});
