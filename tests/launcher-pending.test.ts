import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture(valid: boolean) {
  const root = await mkdtemp(path.join(tmpdir(), 'launcher-stage-')); roots.push(root);
  const pending = path.join(root, 'runtime', 'launcher', 'pending'); await mkdir(pending, { recursive: true });
  await writeFile(path.join(root, 'Agent Core.exe'), 'MZ-original');
  await writeFile(path.join(pending, 'Agent Core.exe'), 'MZ-modified');
  await writeFile(path.join(pending, 'sha256.txt'), valid ? createHash('sha256').update('MZ-modified').digest('hex') : '0'.repeat(64));
  const script = path.resolve('scripts/windows/Restart-Agent-Core.ps1');
  const runner = path.join(root, 'test.ps1');
  await writeFile(runner, `$source = '${script.replaceAll("'", "''")}'\n$tokens=$null; $errors=$null\n` +
    `$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)\n` +
    `$function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Install-PendingLauncher'},$true)\n` +
    `if(!$function){throw 'Missing staged launcher activation'}\nInvoke-Expression $function.Extent.Text\nInstall-PendingLauncher -ProjectRoot '${root.replaceAll("'", "''")}'\n`);
  return { root, pending, runner };
}
it.runIf(process.platform === 'win32')('activates the verified pending launcher with a recoverable original', async () => {
  const f = await fixture(true);
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f.runner], { windowsHide: true });
  expect(await readFile(path.join(f.root, 'Agent Core.exe'), 'utf8')).toBe('MZ-modified');
  const { readdir } = await import('node:fs/promises');
  const backups = await readdir(path.join(f.root, 'runtime', 'launcher', 'backups'));
  expect(backups).toHaveLength(1);
  expect(await readFile(path.join(f.root, 'runtime', 'launcher', 'backups', backups[0]!), 'utf8')).toBe('MZ-original');
  expect(await readFile(path.join(f.pending, 'sha256.txt'), 'utf8').catch(() => null)).toBeNull();
});
it.runIf(process.platform === 'win32')('refuses a mismatched stage without replacing the launcher', async () => {
  const f = await fixture(false);
  expect(() => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f.runner], { windowsHide: true, stdio: 'pipe' })).toThrow();
  expect(await readFile(path.join(f.root, 'Agent Core.exe'), 'utf8')).toBe('MZ-original');
});
