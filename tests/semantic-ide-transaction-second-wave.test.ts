import { access, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { applyWorkspaceEdit, planWorkspaceEdit } from '../src/semantic-ide/transaction.js';

const roots: string[] = [];

async function temp(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE transaction hardening', () => {
  it('preserves UTF-16LE BOM while applying semantic edits', async () => {
    const root = await temp('agent-core-semantic-utf16-');
    const file = path.join(root, 'sample.ts');
    const text = 'const name = 1;\r\n';
    await writeFile(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));

    await applyWorkspaceEdit(root, {
      changes: {
        [pathToFileURL(file).href]: [{
          range: { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } },
          newText: 'value',
        }],
      },
    });

    const raw = await readFile(file);
    expect([...raw.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    expect(raw.subarray(2).toString('utf16le')).toBe('const value = 1;\r\n');
  });

  it('preserves an authorized in-workspace junction/symlink while writing through it', async () => {
    const root = await temp('agent-core-semantic-link-');
    const targetDir = path.join(root, 'target');
    const linkDir = path.join(root, 'alias');
    await mkdir(targetDir);
    await symlink(targetDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
    const targetFile = path.join(targetDir, 'sample.ts');
    const linkedFile = path.join(linkDir, 'sample.ts');
    await writeFile(targetFile, 'const one = 1;\n', 'utf8');

    await applyWorkspaceEdit(root, {
      changes: {
        [pathToFileURL(linkedFile).href]: [{
          range: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } },
          newText: 'two',
        }],
      },
    });

    expect((await lstat(linkDir)).isSymbolicLink()).toBe(true);
    expect(await readFile(targetFile, 'utf8')).toContain('const two = 1;');
  });

  it('refuses a junction/symlink whose real target escapes the authorized workspace', async () => {
    const root = await temp('agent-core-semantic-link-root-');
    const outside = await temp('agent-core-semantic-link-outside-');
    const outsideFile = path.join(outside, 'outside.ts');
    await writeFile(outsideFile, 'const outside = 1;\n', 'utf8');

    const linkDir = path.join(root, 'escape');
    await symlink(outside, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
    const escapedFile = path.join(linkDir, 'outside.ts');

    await expect(planWorkspaceEdit(root, {
      changes: {
        [pathToFileURL(escapedFile).href]: [{
          range: { start: { line: 0, character: 6 }, end: { line: 0, character: 13 } },
          newText: 'blocked',
        }],
      },
    })).rejects.toThrow(/SEMANTIC_(?:REALPATH_OUTSIDE_WORKSPACE|WORKSPACE_EDIT_OUTSIDE_ROOT)/);
  });

  it('previews and applies transactional RenameFile operations', async () => {
    const root = await temp('agent-core-semantic-renamefile-');
    const oldFile = path.join(root, 'old.ts');
    const newFile = path.join(root, 'new.ts');
    await writeFile(oldFile, 'export const moved = 1;\n', 'utf8');

    const edit = {
      documentChanges: [{
        kind: 'rename' as const,
        oldUri: pathToFileURL(oldFile).href,
        newUri: pathToFileURL(newFile).href,
      }],
    };

    const preview = await applyWorkspaceEdit(root, edit, true);
    expect(preview).toMatchObject({
      dryRun: true,
      changedFiles: 1,
      renamedFiles: [{ from: 'old.ts', to: 'new.ts' }],
    });
    await expect(access(oldFile)).resolves.toBeUndefined();
    await expect(access(newFile)).rejects.toBeTruthy();

    const applied = await applyWorkspaceEdit(root, edit, false);
    expect(applied.renamedFiles).toEqual([{ from: 'old.ts', to: 'new.ts' }]);
    await expect(access(oldFile)).rejects.toBeTruthy();
    expect(await readFile(newFile, 'utf8')).toContain('moved');
  });

  it('refuses RenameFile destination conflicts without overwrite semantics', async () => {
    const root = await temp('agent-core-semantic-rename-conflict-');
    const oldFile = path.join(root, 'old.ts');
    const newFile = path.join(root, 'new.ts');
    await writeFile(oldFile, 'old\n', 'utf8');
    await writeFile(newFile, 'new\n', 'utf8');

    await expect(planWorkspaceEdit(root, {
      documentChanges: [{
        kind: 'rename',
        oldUri: pathToFileURL(oldFile).href,
        newUri: pathToFileURL(newFile).href,
      }],
    })).rejects.toThrow(/SEMANTIC_RENAME_DESTINATION_EXISTS/);
  });
});
