import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';

// A launcher hidden in the tray has no window for CloseMainWindow, so the official restart
// signals a named exit event first. These tests only touch a unique event name, never the
// live Local\AgentCoreDesktop.Exit event of a running launcher.
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });

async function runRequestLauncherExit(body: (name: string) => string) {
  const root = await mkdtemp(path.join(tmpdir(), 'launcher-exit-')); roots.push(root);
  const script = path.resolve('scripts/windows/Restart-Agent-Core.ps1');
  const runner = path.join(root, 'test.ps1');
  const name = `Local\\AgentCoreExitTest-${randomUUID()}`;
  await writeFile(runner, `$source = '${script.replaceAll("'", "''")}'\n$tokens=$null; $errors=$null\n` +
    `$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)\n` +
    `$function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Request-LauncherExit'},$true)\n` +
    `if(!$function){throw 'Missing launcher exit request'}\nInvoke-Expression $function.Extent.Text\n${body(name)}\n`);
  return execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runner],
    { windowsHide: true, encoding: 'utf8' }).trim();
}

it.runIf(process.platform === 'win32')('signals a launcher that listens on the exit event', async () => {
  const output = await runRequestLauncherExit(name =>
    `$listener = New-Object Threading.EventWaitHandle($false,[Threading.EventResetMode]::AutoReset,'${name}')\n` +
    `$sent = Request-LauncherExit -Name '${name}'\n` +
    `$received = $listener.WaitOne(2000)\n$listener.Dispose()\nWrite-Output "$sent $received"`);
  expect(output).toBe('True True');
});

it.runIf(process.platform === 'win32')('reports no signal when the launcher build has no exit event', async () => {
  const output = await runRequestLauncherExit(name => `Write-Output (Request-LauncherExit -Name '${name}')`);
  expect(output).toBe('False');
});
