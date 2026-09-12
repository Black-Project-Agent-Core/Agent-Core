import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { EngineeringDiscovery, collectEngineeringInventory, discoverEngineering, engineeringDiscoveryResultSchema, engineeringImpactResultSchema } from '../src/workflow/engineering-discovery.js';
import { analyzeEngineeringImpact, engineeringVirtualFileSystem } from '../src/workflow/engineering-parser.js';
import { classifyWorkflowOperation, workflowOperationInput } from '../src/mcp/workflow-guard.js';

const fixtures: string[] = [];
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-engineering-')); fixtures.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content, 'utf8');
  }
  return { root, workspace: new WorkspacePolicy([root]) };
}
afterEach(async () => {
  for (const root of fixtures.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('agent-core-engineering-')) throw new Error('Fixture cleanup outside owned temporary root');
    await rm(root, { recursive: true, force: true });
  }
});

describe('engineering source discovery', () => {
  it('captures untracked implementation and native runtime source without private/runtime/build data', async () => {
    const options = await fixture({
      'src/runtime/service.ts': 'export function existing() {}',
      'SubProject/Example/runtime/native/main.rs': 'fn main() {}',
      'SubProject/Example/runtime/state.json': '{"private":true}',
      'runtime/memory/state.json': '{"secret":true}',
      'secrets/credential.json': '{"private":true}',
      '.env': 'PASSWORD=private', '.env.example': 'PASSWORD=',
      'dist/runtime.js': 'private build', 'node_modules/example/index.js': 'private dependency',
      'referensi/donor.ts': 'private donor', '.git/config': 'private git',
      'src/reports/format.ts': 'export function report() {}',
    });
    const inventory = await collectEngineeringInventory(options);
    expect(inventory.entries.map(entry => path.relative(options.root, entry.path).replaceAll('\\', '/'))).toEqual([
      '.env.example', 'src/reports/format.ts', 'src/runtime/service.ts', 'SubProject/Example/runtime/native/main.rs',
    ]);
    expect(inventory.coverage.complete).toBe(true);
    expect(inventory.coverage.exclusions).toContain('runtime');
    expect(inventory.documents.has(path.join(options.root, '.env'))).toBe(false);
  });

  it('changes inventory identity when a new caller appears, independent of Git tracking', async () => {
    const options = await fixture({ 'src/function.ts': 'export function run() {}' });
    const first = await collectEngineeringInventory(options);
    await writeFile(path.join(options.root, 'src', 'caller.ts'), 'import { run } from "./function.js"; run();');
    const second = await collectEngineeringInventory(options);
    expect(second.coverage.inventoryHash).not.toBe(first.coverage.inventoryHash);
    expect(second.entries).toHaveLength(2);
  });

  it('distinguishes a complete empty search from a result limit or oversized source gap', async () => {
    const options = await fixture({ 'a.ts': 'needle\nneedle', 'b.ts': 'export const value = 123456789;' });
    const inventory = await collectEngineeringInventory(options);
    const empty = discoverEngineering({ inventory, query: 'absent' });
    expect(empty.matches).toEqual([]); expect(empty.coverage.complete).toBe(true);
    const limited = discoverEngineering({ inventory, query: 'needle', maxMatches: 1 });
    expect(limited.matches).toHaveLength(1); expect(limited.coverage.truncated).toBe(true); expect(limited.coverage.complete).toBe(false);
    expect(limited.coverage.gaps.some(gap => gap.reason === 'MATCH_LIMIT')).toBe(true);
    const oversized = await collectEngineeringInventory({ ...options, maxFileBytes: 20 });
    expect(oversized.coverage.complete).toBe(false);
    expect(oversized.coverage.gaps.some(gap => gap.reason === 'FILE_BYTE_LIMIT')).toBe(true);
    const capped = await collectEngineeringInventory({ ...options, maxFiles: 1 });
    expect(capped.coverage.truncated).toBe(true); expect(capped.entries).toHaveLength(1);
  });

  it('records native facilities and declared versus installed package facts without loading package code', async () => {
    const options = await fixture({
      'package.json': JSON.stringify({ dependencies: { fixture: '^1.0.0', absent: '2.0.0' } }),
      'node_modules/fixture/package.json': JSON.stringify({ name: 'fixture', version: '1.2.0', main: 'index.js' }),
      'node_modules/fixture/index.js': 'throw new Error("PACKAGE_CODE_MUST_NOT_EXECUTE")',
      'src/app.ts': 'export const platform = "node";',
    });
    const service = new EngineeringDiscovery(options), first = await service.discover(options.root, 'platform');
    expect(engineeringDiscoveryResultSchema.safeParse(first).success).toBe(true);
    expect(first.facilities.nodeVersion).toBe(process.version); expect(first.facilities.builtins).toContain('node:fs');
    expect(first.facilities.dependencies.find(item => item.name === 'fixture')).toMatchObject({ declaredVersion: '^1.0.0', installedVersion: '1.2.0' });
    expect(first.facilities.dependencies.find(item => item.name === 'absent')?.installedVersion).toBeUndefined();
    await writeFile(path.join(options.root, 'node_modules', 'fixture', 'package.json'), JSON.stringify({ name: 'fixture', version: '1.3.0' }));
    const second = await service.collect(options.root);
    expect(second.coverage.inventoryHash).not.toBe(first.coverage.inventoryHash);
    expect(await readFile(path.join(options.root, 'node_modules', 'fixture', 'index.js'), 'utf8')).toContain('MUST_NOT_EXECUTE');
  });

  it('redacts credential-looking source previews while retaining the source hash', async () => {
    const options = await fixture({ 'src/example.ts': 'const text = "Bearer abcdefghijklmnopqrstuv";' });
    const inventory = await collectEngineeringInventory(options), result = discoverEngineering({ inventory, query: 'Bearer' });
    expect(result.matches[0]?.preview).toContain('[REDACTED:BEARER]');
    expect(result.matches[0]?.preview).not.toContain('abcdefghijklmnopqrstuv');
    expect(result.matches[0]?.sourceHash).toBe(inventory.entries[0]?.hash);
  });
});

describe('engineering local parser boundary', () => {
  it('provides closed immutable virtual filesystem callbacks with no unspecified real-FS fallback', () => {
    const known = path.resolve(os.tmpdir(), 'virtual', 'known.ts'), unknown = path.resolve(os.tmpdir(), 'not-captured', 'hidden.ts');
    const documents = new Map([[known, 'export const value = 1;']]), filesystem = engineeringVirtualFileSystem(documents);
    documents.set(unknown, 'secret'); documents.set(known, 'changed');
    expect(filesystem.readFile?.(known)).toBe('export const value = 1;');
    expect(filesystem.readFile?.(unknown)).toBeNull(); expect(filesystem.fileExists?.(unknown)).toBe(false);
    expect(filesystem.directoryExists?.(path.dirname(unknown))).toBe(false);
    expect(filesystem.getAccessibleEntries?.(path.dirname(unknown))).toEqual({ files: [], directories: [] });
    expect(filesystem.realpath?.(unknown)).toBeTypeOf('string');
    expect(() => filesystem.writeFile?.(known, 'changed')).toThrow('cannot write');
  });

  it('resolves imported/reexported and function-value aliases without confusing same-name functions', async () => {
    const options = await fixture({
      'package.json': '{"type":"module"}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@logic/*': ['./src/*'] } } }),
      'src/target.ts': 'export function work(value: number) { return value + 1; }',
      'src/barrel.ts': 'export { work as shipped } from "./target.js";',
      'src/caller.ts': 'import { shipped as renamed } from "@logic/barrel.js";\nrenamed(1);\nconst alias = renamed;\nalias(2);',
      'src/same-line.ts': 'import { work } from "./target.js"; work(4);',
      'src/decoy.ts': 'export function work(value: number) { return value - 1; }\nwork(3);',
    });
    const inventory = await collectEngineeringInventory(options), target = path.join(options.root, 'src', 'target.ts');
    const result = await analyzeEngineeringImpact(inventory, [target]);
    expect(engineeringImpactResultSchema.safeParse(result).success).toBe(true);
    expect(result.coverage.gaps).toEqual([]);
    const symbol = result.symbols.find(item => item.name === 'work' && item.path === target);
    expect(symbol).toBeDefined();
    const calls = result.callers.filter(item => item.symbolId === symbol!.id && item.kind === 'call');
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: path.join(options.root, 'src', 'caller.ts'), line: 2 }),
      expect.objectContaining({ path: path.join(options.root, 'src', 'caller.ts'), line: 4 }),
    ]));
    expect(calls.some(item => item.path.endsWith('decoy.ts'))).toBe(false);
    const sameLine = result.callers.filter(item => item.symbolId === symbol!.id && item.path.endsWith('same-line.ts'));
    expect(sameLine).toHaveLength(1); expect(sameLine[0]?.kind).toBe('call');
    expect(result.analysisLevel).toBe('semantic_tsjs');
  }, 60_000);

  it('reports dynamic and unsupported-language boundaries without treating them as all-callers proof', async () => {
    const options = await fixture({
      'src/target.ts': 'export function work() {}',
      'src/dynamic.ts': 'declare const registry: any; declare const key: string; registry[key]();',
      'src/other.py': 'def work():\n    return 1\nwork()\n',
    });
    const inventory = await collectEngineeringInventory(options);
    const result = await analyzeEngineeringImpact(inventory, ['src/target.ts', 'src/other.py']);
    expect(result.analysisLevel).toBe('mixed');
    expect(result.limitations.some(item => item.reason === 'DYNAMIC_MEMBER_CALL')).toBe(true);
    expect(result.limitations.some(item => item.reason === 'UNSUPPORTED_LANGUAGE_LEXICAL_ONLY')).toBe(true);
    expect(result.limitations.some(item => item.reason === 'STATIC_CAPTURE_ONLY_DYNAMIC_AND_EXTERNAL_CONSUMERS_NOT_PROVEN')).toBe(true);
    expect(result.callers.some(item => item.path.endsWith('other.py') && item.kind === 'reference')).toBe(true);
  }, 60_000);

  it('reports bounded parser coverage as incomplete and rejects escaped targets', async () => {
    const options = await fixture({ 'src/target.ts': 'export function work(value: number) { return value + 1; }\nwork(1);' });
    const inventory = await collectEngineeringInventory(options);
    const result = await analyzeEngineeringImpact(inventory, ['src/target.ts'], { maxIdentifiers: 1 });
    expect(result.coverage.complete).toBe(false); expect(result.coverage.truncated).toBe(true);
    expect(result.coverage.gaps.some(item => item.reason === 'IDENTIFIER_LIMIT')).toBe(true);
    await expect(analyzeEngineeringImpact(inventory, ['../outside.ts'])).rejects.toMatchObject({ code: 'WORKFLOW_ENGINEERING_TARGET_OUTSIDE_SCOPE' });
  }, 60_000);

  it('distinguishes a safely missing new target from a target hidden by the inventory policy', async () => {
    const options = await fixture({ 'src/seam.ts': 'export const integration = true;', 'dist/existing.js': 'generated();' });
    const inventory = await collectEngineeringInventory(options);
    const fresh = await analyzeEngineeringImpact(inventory, ['src/new.ts', 'src/seam.ts']);
    expect(fresh.coverage.complete).toBe(true);
    expect(fresh.limitations).toContainEqual({ path: path.join(options.root, 'src', 'new.ts'), reason: 'TARGET_MISSING_NEW_PATH' });
    const excluded = await analyzeEngineeringImpact(inventory, ['dist/new.js']);
    expect(excluded.coverage.complete).toBe(false);
    expect(excluded.coverage.gaps.some(item => item.reason === 'TARGET_NOT_CAPTURED')).toBe(true);
    expect(excluded.limitations.some(item => item.reason === 'TARGET_MISSING_NEW_PATH')).toBe(false);
    const directory = await analyzeEngineeringImpact(inventory, ['src']);
    expect(directory.coverage.complete).toBe(true);
    expect(directory.limitations.some(item => item.reason === 'TARGET_DIRECTORY_SCOPE')).toBe(true);
    expect(directory.symbols.some(item => item.name === 'integration')).toBe(true);
  }, 60_000);

  it('permits explicit document targets as non-code without admitting excluded private documents', async () => {
    const options = await fixture({ 'README.md': '# Existing project', 'src/seam.ts': 'export const seam = true;', 'secrets/private.md': '# private', '.env.md': 'password=private', 'protected.md': '# operator only' });
    const inventory = await collectEngineeringInventory({ ...options, protectedRoots: [path.join(options.root, 'protected.md')] });
    const result = await analyzeEngineeringImpact(inventory, ['README.md', 'src/seam.ts']);
    expect(result.coverage.complete).toBe(true);
    expect(result.limitations).toContainEqual({ path: path.join(options.root, 'README.md'), reason: 'NON_CODE_TARGET_SOURCE_READ_REQUIRED' });
    expect(result.symbols.some(item => item.path.endsWith('README.md'))).toBe(false);
    for (const target of ['secrets/private.md', '.env.md', 'protected.md']) {
      const denied = await analyzeEngineeringImpact(inventory, [target]);
      expect(denied.coverage.complete).toBe(false);
      expect(denied.limitations.some(item => item.reason === 'NON_CODE_TARGET_SOURCE_READ_REQUIRED')).toBe(false);
    }
  }, 60_000);
});

describe('engineering operation classification', () => {
  it('does not normalize a multi-command mutation into a read-only ls operation', () => {
    const operation = workflowOperationInput('execute_command', { command: 'ls\nRemove-Item src/file.ts' });
    expect(operation.toolName).toBe('execute_command');
    expect(classifyWorkflowOperation('execute_command', { command: 'ls\nRemove-Item src/file.ts' }).mutationClass).toBe('shell_mutation_or_unknown');
    expect(workflowOperationInput('execute_command', { command: 'git status --short' }).toolName).toBe('read_file');
  });

  it('rejects mutation payloads disguised as reads or diagnostics and unknown GitHub reads', () => {
    expect(() => workflowOperationInput('read_file', { path: 'src/a.ts', content: 'replace' })).toThrow('conflicts');
    expect(classifyWorkflowOperation('agent_core_status', { command: 'Set-Content src/a.ts x' }).meaningful).toBe(true);
    expect(() => workflowOperationInput('github_git', { operation: 'overwrite' })).toThrow('conflicts');
    expect(classifyWorkflowOperation('agent_core_status').meaningful).toBe(false);
    expect(workflowOperationInput('read_file', { path: 'src/a.ts' }).toolName).toBe('read_file');
  });
});
