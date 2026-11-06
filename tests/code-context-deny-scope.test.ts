import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as contextSearch from '../src/code-intelligence/context-search.js';

// The names `release` and `runtime` are excluded only directly under the workspace root. Below the root they are
// ordinary folders that code_orient indexes, so a script or module that happens to live in one stays searchable.
// `bin` and `obj` (build output) stay excluded everywhere, and so does any folder under the protected name.

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'code-context-deny-scope-'));
  contextSearch.clearCodeContextIndexCache();
});

afterEach(async () => {
  contextSearch.clearCodeContextIndexCache();
  await rm(root, { recursive: true, force: true });
});

async function write(relative: string, text: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
}

function pathsFor(text: string): Promise<string[]> {
  return contextSearch
    .searchCodeContext({ root, query: text })
    .then(result => result.hits.map(hit => hit.path));
}

describe('code_orient deny scope: release and runtime are excluded at the top level only', () => {
  it('finds a script under a nested release folder', async () => {
    await write('scripts/release/x.mjs', 'export const quokkaRelease = 1;\n');
    expect(await pathsFor('quokkaRelease')).toEqual(['scripts/release/x.mjs']);
  });

  it('finds a module under a nested runtime folder', async () => {
    await write('src/runtime/engine.ts', 'export const zebraRuntime = 1;\n');
    expect(await pathsFor('zebraRuntime')).toEqual(['src/runtime/engine.ts']);
  });

  it('still excludes release and runtime folders directly under the root', async () => {
    await write('release/notes.ts', 'export const tulipRelease = 1;\n');
    await write('runtime/state.ts', 'export const maplePlumRuntime = 1;\n');
    expect(await pathsFor('tulipRelease')).toEqual([]);
    expect(await pathsFor('maplePlumRuntime')).toEqual([]);
  });

  it('still excludes a runtime folder inside the protected DO NOT TOUCH folder', async () => {
    await write('DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/runtime/vault.ts', 'export const cedarVault = 1;\n');
    expect(await pathsFor('cedarVault')).toEqual([]);
  });

  it('excludes a runtime folder under a parent folder that holds the install', async () => {
    await write('Agent Core/runtime/state.ts', 'export const parentRuntimeMarker = 1;\n');
    expect(await pathsFor('parentRuntimeMarker')).toEqual([]);
  });

  it('excludes a runtime folder inside a worktree', async () => {
    await write('.worktrees/x/runtime/state.ts', 'export const worktreeRuntimeMarker = 1;\n');
    expect(await pathsFor('worktreeRuntimeMarker')).toEqual([]);
  });

  it('excludes an upper-case RUNTIME folder below the top level', async () => {
    await write('Agent Core/RUNTIME/state.ts', 'export const upperRuntimeMarker = 1;\n');
    expect(await pathsFor('upperRuntimeMarker')).toEqual([]);
  });

  it('excludes a release folder under a parent folder that holds the install', async () => {
    await write('Agent Core/release/notes.ts', 'export const parentReleaseMarker = 1;\n');
    expect(await pathsFor('parentReleaseMarker')).toEqual([]);
  });

  it('refuses a search root whose path passes through a runtime folder outside the repository', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'deny-scope-outside-'));
    try {
      const state = path.join(outside, 'Install', 'runtime', 'memory');
      await mkdir(state, { recursive: true });
      await expect(contextSearch.assertSearchRoot(state, root)).rejects.toThrow('CODE_CONTEXT_ROOT_DENIED');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('still excludes bin and obj folders anywhere in the tree', async () => {
    await write('src/bin/tool.ts', 'export const amberBin = 1;\n');
    await write('src/obj/part.ts', 'export const indigoObj = 1;\n');
    expect(await pathsFor('amberBin')).toEqual([]);
    expect(await pathsFor('indigoObj')).toEqual([]);
  });
});
