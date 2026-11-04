import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.doUnmock('../scripts/release/release-lib.mjs');
  vi.resetModules();
  for (const root of roots.splice(0).reverse()) await fs.rm(root, { recursive: true, force: true });
});
async function fixtureRoot() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'release-compat-')));
  roots.push(root);
  return root;
}
async function isolated(root: string) {
  vi.resetModules();
  vi.doMock('../scripts/release/release-lib.mjs', () => ({ ROOT: root, CURRENT_LINE_BASELINE_REF: 'refs/agent-core/missing-fixture-baseline' }));
  return import('../scripts/release/release-compat.mjs');
}

it('recognizes the CLI through a junction without running it on import', async () => {
  const module = await import('../scripts/release/release-compat.mjs');
  expect(module.isMainModule).toBeTypeOf('function');
  const root = await fixtureRoot(), alias = `${root}-alias`;
  const entry = path.join(root, 'entry.mjs');
  await fs.writeFile(entry, 'export default 1;\n');
  await fs.symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  roots.push(alias);
  expect(module.isMainModule(pathToFileURL(entry).href, path.join(alias, 'entry.mjs'))).toBe(true);
  expect(module.isMainModule(pathToFileURL(entry).href, undefined)).toBe(false);
});

it('rejects options that have no value before attempting to inspect a build', async () => {
  const module = await import('../scripts/release/release-compat.mjs');
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const stat = vi.spyOn(fs, 'stat').mockRejectedValue(new Error('build must not be inspected'));
  for (const args of [
    ['--manifest-only', '--image-baseline'],
    ['--manifest-only', '--output'],
    ['--manifest-only', '--image-baseline', '--output', 'docs/memory/fixture.json'],
  ]) await expect(module.main(args)).rejects.toThrow(/requires a value/);
  expect(stat).not.toHaveBeenCalled();
});

it('refuses a missing baseline instead of treating every removed surface as added', async () => {
  const module = await isolated(await fixtureRoot());
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  await expect(module.main([])).rejects.toThrow(/git .*failed|not a git repository/i);
});

it('rejects an over-budget optional export before writing its artifact', async () => {
  const root = await fixtureRoot(), module = await isolated(root);
  for (const file of [...module.mcpFiles, ...module.schemaFiles]) {
    const absolute = path.join(root, file);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, '// fixture\n');
    await fs.utimes(absolute, 1, 1);
  }
  await fs.mkdir(path.join(root, 'dist/mcp'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs/memory'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(root, 'dist/mcp/server.js'), `
export function createAgentCoreMcpServer(_key, runtime) {
  const count = runtime.memoryExperience ? 82 : 80;
  const tools = {};
  for (let i = 0; i < count; i++) tools[i === 0 ? 'image_inspect' : 'tool_' + i] = {
    description: runtime.memoryExperience ? 'x'.repeat(2000) : 'fixture', annotations: {}
  };
  return { _registeredTools: tools };
}`);
  await fs.writeFile(path.join(root, 'dist/mcp/controller-learning-tools.js'), `
export function registerControllerLearningTools(server) {
  server._registeredTools.controller_learning = { description: 'fixture', annotations: {} };
}`);
  const output = 'docs/memory/oversized.json';
  const result = await module.builtManifestBudget({ output });
  expect(result.available).toBe(false);
  expect(result.error).toMatch(/budget|exceed/i);
  await expect(fs.access(path.join(root, output))).rejects.toThrow();
});

it('fails the budget verdict when an optional cohort exceeds its own limit', async () => {
  const { manifestBudgetExitCode } = await import('../scripts/release/release-compat.mjs');
  expect(manifestBudgetExitCode({ available: true, stale: false, exceeded: false,
    optionalCohorts: { withController: { exceeded: true } } })).toBe(2);
});
