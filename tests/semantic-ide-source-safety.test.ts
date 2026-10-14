import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeSource, readSemanticSource, writeSemanticSourceAtomic } from '../src/semantic-ide/source-io.js';
import {
  applyWorkspaceEdit,
  applyWorkspacePlans,
  planWorkspaceEdit,
} from '../src/semantic-ide/transaction.js';

const roots: string[] = [];

async function unavailableFileSymlink(error: unknown, target: string, link: string): Promise<boolean> {
  const code = (error as NodeJS.ErrnoException).code ?? '';
  if (['EPERM', 'EACCES'].includes(code)) return true;
  // Independently reproduced on this host: valid regular-file target + absent link
  // is rejected by Windows itself with EISDIR before application code executes.
  if (process.platform !== 'win32' || code !== 'EISDIR') return false;
  return (await lstat(target)).isFile()
    && await lstat(link).then(() => false, cause => cause.code === 'ENOENT');
}

async function rootFixture(prefix = 'agent-core-semantic-source-') {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE source safety and encoding', () => {
  it('preserves UTF-8 BOM and UTF-16LE/BE encodings through semantic writes', async () => {
    const root = await rootFixture();
    const cases = [
      { name: 'utf8.ts', encoding: 'utf8' as const, bom: true },
      { name: 'utf16le.ts', encoding: 'utf16le' as const, bom: true },
      { name: 'utf16be.ts', encoding: 'utf16be' as const, bom: true },
    ];

    for (const item of cases) {
      const file = path.join(root, item.name);
      await writeFile(file, encodeSource('const value = 1;\n', item.encoding, item.bom));
      const source = await readSemanticSource(root, file);
      expect(source.encoding).toBe(item.encoding);
      expect(source.bom).toBe(true);
      await writeSemanticSourceAtomic(root, file, 'const value = 2;\n', source);
      const reread = await readSemanticSource(root, file);
      expect(reread.encoding).toBe(item.encoding);
      expect(reread.bom).toBe(true);
      expect(reread.text).toBe('const value = 2;\n');
    }
  });

  it('writes through an authorized symlink without replacing the link', async context => {
    const root = await rootFixture();
    const target = path.join(root, 'target.ts');
    const link = path.join(root, 'link.ts');
    await writeFile(target, 'const value = 1;\n', 'utf8');
    try {
      await symlink(target, link, 'file');
    } catch (error) {
      if (await unavailableFileSymlink(error, target, link)) {
        context.skip('Host rejects regular-file symlink creation: ' + (error as NodeJS.ErrnoException).code);
        return;
      }
      throw error;
    }

    await applyWorkspaceEdit(root, {
      changes: {
        [pathToFileURL(link).href]: [{
          range: { start: { line: 0, character: 14 }, end: { line: 0, character: 15 } },
          newText: '2',
        }],
      },
    });

    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('const value = 2;\n');
  });

  it('refuses a symlink whose real target escapes the authorized workspace', async context => {
    const root = await rootFixture();
    const outsideRoot = await rootFixture('agent-core-semantic-source-outside-');
    const outside = path.join(outsideRoot, 'outside.ts');
    const link = path.join(root, 'link.ts');
    await writeFile(outside, 'const value = 1;\n', 'utf8');
    try {
      await symlink(outside, link, 'file');
    } catch (error) {
      if (await unavailableFileSymlink(error, outside, link)) {
        context.skip('Host rejects regular-file symlink creation: ' + (error as NodeJS.ErrnoException).code);
        return;
      }
      throw error;
    }

    await expect(planWorkspaceEdit(root, {
      changes: {
        [pathToFileURL(link).href]: [{
          range: { start: { line: 0, character: 14 }, end: { line: 0, character: 15 } },
          newText: '9',
        }],
      },
    })).rejects.toThrow(/SEMANTIC_WORKSPACE_EDIT_OUTSIDE_ROOT/);
    expect(await readFile(outside, 'utf8')).toBe('const value = 1;\n');
  });

  it('rejects malformed far-past-EOF edit ranges instead of clamping them', async () => {
    const root = await rootFixture();
    const file = path.join(root, 'sample.ts');
    await writeFile(file, 'x\n', 'utf8');
    await expect(planWorkspaceEdit(root, {
      changes: {
        [pathToFileURL(file).href]: [{
          range: { start: { line: 99, character: 0 }, end: { line: 99, character: 0 } },
          newText: 'y',
        }],
      },
    })).rejects.toThrow(/SEMANTIC_EDIT_POSITION_OUT_OF_RANGE/);
  });
});

describe('Semantic IDE RenameFile transaction', () => {
  it('previews and applies RenameFile while reporting the resource operation', async () => {
    const root = await rootFixture();
    const oldPath = path.join(root, 'old.ts');
    const newPath = path.join(root, 'new.ts');
    await writeFile(oldPath, 'export const value = 1;\n', 'utf8');
    const edit = {
      documentChanges: [{
        kind: 'rename' as const,
        oldUri: pathToFileURL(oldPath).href,
        newUri: pathToFileURL(newPath).href,
      }],
    };

    const preview = await applyWorkspaceEdit(root, edit, true);
    expect(preview).toMatchObject({
      dryRun: true,
      changedFiles: 1,
      renamedFiles: [{ from: 'old.ts', to: 'new.ts' }],
    });
    expect(await readFile(oldPath, 'utf8')).toContain('value');

    const applied = await applyWorkspaceEdit(root, edit, false);
    expect(applied.renamedFiles).toEqual([{ from: 'old.ts', to: 'new.ts' }]);
    await expect(readFile(oldPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(newPath, 'utf8')).toContain('value');
  });

  it('refuses destination conflicts unless overwrite/ignore semantics are explicit', async () => {
    const root = await rootFixture();
    const oldPath = path.join(root, 'old.ts');
    const newPath = path.join(root, 'new.ts');
    await writeFile(oldPath, 'old\n', 'utf8');
    await writeFile(newPath, 'new\n', 'utf8');

    await expect(planWorkspaceEdit(root, {
      documentChanges: [{
        kind: 'rename',
        oldUri: pathToFileURL(oldPath).href,
        newUri: pathToFileURL(newPath).href,
      }],
    })).rejects.toThrow(/SEMANTIC_RENAME_DESTINATION_EXISTS/);
  });

  it('rolls back an earlier rename if a later planned rename detects source drift', async () => {
    const root = await rootFixture();
    const first = path.join(root, 'first.ts');
    const firstNew = path.join(root, 'first-new.ts');
    const second = path.join(root, 'second.ts');
    const secondNew = path.join(root, 'second-new.ts');
    await writeFile(first, 'first\n', 'utf8');
    await writeFile(second, 'second\n', 'utf8');

    const plans = await planWorkspaceEdit(root, {
      documentChanges: [
        { kind: 'rename', oldUri: pathToFileURL(first).href, newUri: pathToFileURL(firstNew).href },
        { kind: 'rename', oldUri: pathToFileURL(second).href, newUri: pathToFileURL(secondNew).href },
      ],
    });
    await writeFile(second, 'externally changed\n', 'utf8');

    await expect(applyWorkspacePlans(plans)).rejects.toThrow(/SEMANTIC_SOURCE_DRIFT/);
    expect(await readFile(first, 'utf8')).toBe('first\n');
    await expect(readFile(firstNew, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(second, 'utf8')).toBe('externally changed\n');
  });
});
