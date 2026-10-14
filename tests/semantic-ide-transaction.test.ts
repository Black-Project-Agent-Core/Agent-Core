import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyWorkspaceEdit,
  applyWorkspacePlans,
  planWorkspaceEdit,
} from '../src/semantic-ide/transaction.js';

const roots: string[] = [];
async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-semantic-txn-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE workspace-edit transaction', () => {
  it('applies valid edits atomically and preserves CRLF line endings', async () => {
    const root = await fixture();
    const file = path.join(root, 'sample.ts');
    await writeFile(file, 'const one = 1;\r\nconst two = 2;\r\n', 'utf8');
    const edit = { changes: { [pathToFileURL(file).href]: [{
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } },
      newText: 'alpha\nbeta',
    }] } };
    const preview = await applyWorkspaceEdit(root, edit, true);
    expect(preview).toMatchObject({ dryRun: true, changedFiles: 1, changedEdits: 1 });
    expect(await readFile(file, 'utf8')).toContain('one');

    const applied = await applyWorkspaceEdit(root, edit, false);
    expect(applied.changedFiles).toBe(1);
    const output = await readFile(file, 'utf8');
    expect(output).toContain('alpha\r\nbeta');
    expect(output).not.toMatch(/(?<!\r)\n/);
  });

  it('rejects overlap, out-of-workspace, and protected-path targets before writing', async () => {
    const root = await fixture();
    const file = path.join(root, 'sample.ts');
    await writeFile(file, 'abcdef\n', 'utf8');
    const uri = pathToFileURL(file).href;
    await expect(planWorkspaceEdit(root, { changes: { [uri]: [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } }, newText: 'x' },
      { range: { start: { line: 0, character: 2 }, end: { line: 0, character: 4 } }, newText: 'y' },
    ] } })).rejects.toThrow(/SEMANTIC_EDIT_OVERLAP/);

    const outside = path.join(path.dirname(root), 'outside-semantic.ts');
    await writeFile(outside, 'x', 'utf8');
    await expect(planWorkspaceEdit(root, { changes: { [pathToFileURL(outside).href]: [] } }))
      .rejects.toThrow(/OUTSIDE_ROOT/);
    await rm(outside, { force: true });
    const protectedDir = path.join(root, 'DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT');
    await import('node:fs/promises').then(fs => fs.mkdir(protectedDir, { recursive: true }));
    const protectedFile = path.join(protectedDir, 'x.ts');
    await writeFile(protectedFile, 'x', 'utf8');
    await expect(planWorkspaceEdit(root, { changes: { [pathToFileURL(protectedFile).href]: [] } }))
      .rejects.toThrow(/SEMANTIC_PROTECTED_PATH/);
  });

  it('detects source drift between planning and apply with zero semantic mutation', async () => {
    const root = await fixture();
    const file = path.join(root, 'drift.ts');
    await writeFile(file, 'const before = 1;\n', 'utf8');
    const plans = await planWorkspaceEdit(root, { changes: { [pathToFileURL(file).href]: [{
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
      newText: 'after',
    }] } });
    await writeFile(file, 'const external = 2;\n', 'utf8');
    await expect(applyWorkspacePlans(plans)).rejects.toThrow(/SEMANTIC_SOURCE_DRIFT/);
    expect(await readFile(file, 'utf8')).toBe('const external = 2;\n');
  });

  it('rolls back already-applied files when a later write fails', async () => {
    const root = await fixture();
    const first = path.join(root, 'first.ts');
    const second = path.join(root, 'second.ts');
    await writeFile(first, 'const first = 1;\n', 'utf8');
    await writeFile(second, 'const second = 2;\n', 'utf8');
    const plans = await planWorkspaceEdit(root, { changes: {
      [pathToFileURL(first).href]: [{
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } },
        newText: 'changedFirst',
      }],
      [pathToFileURL(second).href]: [{
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 12 } },
        newText: 'changedSecond',
      }],
    } });

    let writes = 0;
    const writer = async (filePath: string, content: string) => {
      writes += 1;
      if (writes === 2) throw new Error('synthetic-write-failure');
      await writeFile(filePath, content, 'utf8');
    };
    await expect(applyWorkspacePlans(plans, { atomicWriter: writer }))
      .rejects.toThrow(/synthetic-write-failure/);
    expect(await readFile(first, 'utf8')).toBe('const first = 1;\n');
    expect(await readFile(second, 'utf8')).toBe('const second = 2;\n');
  });
});
