import { mkdtemp, mkdir, writeFile, rm, stat, utimes, readFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { validateExecutionDag } from '../src/execution/dag.js';
import { beginExecutionProvenance, finishExecutionProvenance, executionApplicability, executionInputPaths } from '../src/execution/provenance.js';
import { ExecutionResourceClaims } from '../src/execution/resource-claims.js';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'execution-provenance-'));
  roots.push(root);
  const source = path.join(root, 'src');
  const output = path.join(root, 'out.txt');
  await mkdir(source);
  await writeFile(path.join(source, 'entry.ts'), 'export const value = 1;');
  const workspace = new WorkspacePolicy([root]);
  const node = (await validateExecutionDag([{ id: 'build', purpose: 'build source', command: 'Write-Output verified', cwd: root,
    inputs: [source], resources: { reads: [source], writes: [output] }, expectedArtifacts: [{ path: output, hash: 'sha256' }] }], { workspace })).nodes[0]!;
  const identity = { runId: 'run', attemptId: 'attempt-1', attemptNo: 1 };
  const initial = await beginExecutionProvenance(workspace, node, identity);
  await writeFile(output, 'deterministic output');
  const provenance = await finishExecutionProvenance(workspace, node, initial);
  return { root, source, output, workspace, node, identity, provenance };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe('attempt-bound content evidence', () => {
  it('detects changed inputs even when mtime and output remain unchanged, and accepts unchanged bytes at a different time', async () => {
    const f = await fixture();
    expect(await executionApplicability(f.workspace, f.node, f.provenance, f.identity)).toBe('current');
    const file = path.join(f.source, 'entry.ts');
    const before = await stat(file);
    await utimes(file, before.atime, new Date(1));
    expect(await executionApplicability(f.workspace, f.node, f.provenance, f.identity)).toBe('current');
    await writeFile(file, 'export const value = 2;');
    await utimes(file, before.atime, before.mtime);
    expect(await executionApplicability(f.workspace, f.node, f.provenance, f.identity)).toBe('inputs_changed');
    expect(await readFile(f.output, 'utf8')).toBe('deterministic output');
  });

  it('binds directory membership, output bytes, command, toolchain config and attempt identity', async () => {
    const f = await fixture();
    await writeFile(path.join(f.source, 'extra.ts'), 'new source');
    expect(await executionApplicability(f.workspace, f.node, f.provenance, f.identity)).toBe('inputs_changed');
    await rm(path.join(f.source, 'extra.ts'));
    await writeFile(f.output, 'different output');
    expect(await executionApplicability(f.workspace, f.node, f.provenance, f.identity)).toBe('outputs_changed');
    expect(await executionApplicability(f.workspace, { ...f.node, command: 'Write-Output changed' }, f.provenance, f.identity)).toBe('inputs_changed');
    expect(await executionApplicability(f.workspace, f.node, f.provenance, { ...f.identity, attemptId: 'attempt-2' })).toBe('identity_mismatch');
    expect(await executionApplicability(f.workspace, f.node, undefined, f.identity)).toBe('legacy_unbound');
  });

  it('rejects undeclared input changes during an attempt, while recording deliberate input/output edits', async () => {
    const f = await fixture();
    const initial = await beginExecutionProvenance(f.workspace, f.node, f.identity);
    const file = path.join(f.source, 'entry.ts');
    await writeFile(file, 'edited unexpectedly');
    const changed = await finishExecutionProvenance(f.workspace, f.node, initial);
    expect(changed.inputsStableDuringAttempt).toBe(false);
    const editingNode = { ...f.node, resources: { reads: [f.source], writes: [file] } };
    const editing = await beginExecutionProvenance(f.workspace, editingNode, f.identity);
    await writeFile(file, 'edited intentionally');
    const result = await finishExecutionProvenance(f.workspace, editingNode, editing);
    expect(result.inputsStableDuringAttempt).toBe(true);
    expect(await executionApplicability(f.workspace, editingNode, result, f.identity)).toBe('current');
  });

  it('automatically binds dependency/config manifests including missing files', async () => {
    const f = await fixture();
    expect(f.provenance.inputManifest.some(entry => entry.path.endsWith('package-lock.json') && entry.kind === 'missing')).toBe(true);
    await writeFile(path.join(f.root, 'package-lock.json'), '{"lockfileVersion":3}');
    expect(await executionApplicability(f.workspace, f.node, f.provenance, f.identity)).toBe('inputs_changed');
  });

  it('bounds automatic manifests to the nested execution project while preserving explicit shared toolchains', async () => {
    const f = await fixture();
    const project = path.join(f.root, 'fixture');
    const cwd = path.join(project, 'src');
    const sharedToolchain = path.join(f.root, 'shared-toolchain.txt');
    await mkdir(cwd, { recursive: true });
    await writeFile(sharedToolchain, 'compiler version 1');
    const node = { ...f.node, cwd, inputs: [], toolchain: [sharedToolchain], resources: undefined, expectedArtifacts: [] };
    expect(executionInputPaths(f.workspace, f.node, f.root)).toEqual(executionInputPaths(f.workspace, f.node));
    const initial = await beginExecutionProvenance(f.workspace, node, f.identity, project);
    const provenance = await finishExecutionProvenance(f.workspace, node, initial);
    const applicability = () => executionApplicability(f.workspace, node, provenance, f.identity, undefined, undefined, undefined, project);

    expect(provenance.inputPaths).toContain(path.join(cwd, 'package.json'));
    expect(provenance.inputPaths).toContain(path.join(project, 'package.json'));
    expect(provenance.inputPaths).not.toContain(path.join(f.root, 'package.json'));
    expect(provenance.inputPaths).toContain(sharedToolchain);
    await writeFile(path.join(f.root, 'package.json'), '{"name":"unrelated-parent"}');
    expect(await applicability()).toBe('current');
    await writeFile(path.join(project, 'package.json'), '{"name":"fixture"}');
    expect(await applicability()).toBe('inputs_changed');
    await rm(path.join(project, 'package.json'));
    await writeFile(sharedToolchain, 'compiler version 2');
    expect(await applicability()).toBe('inputs_changed');
    expect(() => executionInputPaths(f.workspace, { ...node, cwd: f.root }, project)).toThrow(/WORKSPACE_PROJECT_MISMATCH/);
    for (const unsafe of [
      { ...node, inputs: [sharedToolchain] },
      { ...node, resources: { reads: [sharedToolchain] } },
      { ...node, resources: { writes: [sharedToolchain] } },
      { ...node, expectedArtifacts: [{ path: sharedToolchain, kind: 'file' as const, required: true, hash: 'sha256' as const }] },
    ]) {
      await expect(beginExecutionProvenance(f.workspace, unsafe, f.identity, project)).rejects.toThrow(/WORKSPACE_PROJECT_MISMATCH/);
    }
  });

  it('coordinates shared reads, overlapping writes, root fallback and junction aliases across runs', async () => {
    const f = await fixture();
    const claims = new ExecutionResourceClaims();
    const read = await claims.resolve(f.workspace, f.root, { reads: [f.source] });
    const write = await claims.resolve(f.workspace, f.root, { writes: [path.join(f.source, 'entry.ts')] });
    expect(claims.acquire('run-a/node', read)).toBe(true);
    expect(claims.acquire('run-b/node', read)).toBe(true);
    expect(claims.acquire('run-c/node', write)).toBe(false);
    claims.release('run-a/node'); claims.release('run-b/node');
    expect(claims.acquire('run-c/node', write)).toBe(true);
    expect(claims.acquire('unknown/node', await claims.resolve(f.workspace, f.root))).toBe(false);
    const alias = path.join(f.root, 'alias');
    await symlink(f.source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(claims.acquire('alias/node', await claims.resolve(f.workspace, f.root, { reads: [alias] }))).toBe(false);
    claims.release('run-c/node');
    expect(claims.acquire('unknown/node', await claims.resolve(f.workspace, f.root))).toBe(true);
  });

  it('holds filesystem-root claims against descendant writes and reads in either acquisition order', async () => {
    const f = await fixture();
    const filesystemRoot = path.parse(f.root).root;
    const workspace = new WorkspacePolicy([filesystemRoot]);
    const resolver = new ExecutionResourceClaims();
    const rootRead = await resolver.resolve(workspace, f.root, { reads: [filesystemRoot] });
    const rootWrite = await resolver.resolve(workspace, f.root, { writes: [filesystemRoot] });
    const childRead = await resolver.resolve(workspace, f.root, { reads: [f.source] });
    const childWrite = await resolver.resolve(workspace, f.root, { writes: [path.join(f.source, 'entry.ts')] });
    for (const [first, second] of [
      [rootWrite, childRead], [childRead, rootWrite], [rootWrite, childWrite],
      [childWrite, rootWrite], [rootRead, childWrite], [childWrite, rootRead],
    ]) {
      const claims = new ExecutionResourceClaims();
      expect(claims.acquire('first', first!)).toBe(true);
      expect(claims.acquire('second', second!)).toBe(false);
      claims.release('first');
      expect(claims.acquire('second', second!)).toBe(true);
    }
    expect(resolver.acquire('root-reader', rootRead)).toBe(true);
    expect(resolver.acquire('child-reader', childRead)).toBe(true);
  });

  it('keeps sibling paths independent and named resources matched only by their exact names', async () => {
    const f = await fixture();
    const claims = new ExecutionResourceClaims();
    const sourceWrite = await claims.resolve(f.workspace, f.root, { writes: [f.source] });
    const siblingWrite = await claims.resolve(f.workspace, f.root, { writes: [path.join(f.root, 'src-other', 'entry.ts')] });
    expect(claims.acquire('source-writer', sourceWrite)).toBe(true);
    expect(claims.acquire('sibling-writer', siblingWrite)).toBe(true);
    const named = { kind: 'named' as const, mode: 'write' as const, key: sourceWrite[0]!.key };
    expect(claims.acquire('named', [named])).toBe(true);
    expect(claims.acquire('same-name', [named])).toBe(false);
    expect(claims.acquire('child-name', [{ ...named, key: path.join(named.key, 'child') }])).toBe(true);
  });
});
