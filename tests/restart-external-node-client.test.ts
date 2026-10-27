import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';

// The Claude Desktop stdio bridge runs a script outside this checkout with the bundled Node. It is an
// HTTP client of Core, so the official restart must not wait for it; a project script stays owned.
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });

async function classify(commandLines: string[]): Promise<string[]> {
  const temp = await mkdtemp(path.join(tmpdir(), 'restart-classify-')); roots.push(temp);
  const script = path.resolve('scripts/windows/Restart-Agent-Core.ps1');
  const root = 'C:\\Fake\\Agent-Core';
  const node = root + '\\runtime\\node\\node.exe';
  const runner = path.join(temp, 'test.ps1');
  const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
  await writeFile(runner, `$source = ${quote(script)}\n$tokens=$null; $errors=$null\n` +
    `$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)\n` +
    `foreach($name in 'Test-ExternalNodeScript','Test-ProjectProcess'){\n` +
    `  $function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)\n` +
    `  if(!$function){throw "Missing $name"}\n  Invoke-Expression $function.Extent.Text\n}\n` +
    `$root=${quote(root)}; $exePath="$root\\Agent Core.exe"; $nodePath=${quote(node)}; $coreEntry="$root\\dist\\index.js"\n` +
    `$tunnelPath="$root\\tunnel-client\\tunnel-client.exe"; $runtimePrefixes=@(); $profilePaths=@()\n` +
    commandLines.map(command => `Write-Output (Test-ProjectProcess ([pscustomobject]@{ Name='node.exe'; ExecutablePath=${quote(node)}; CommandLine=${quote(command)} }))`).join('\n') + '\n');
  return execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runner],
    { windowsHide: true, encoding: 'utf8' }).trim().split(/\r?\n/);
}

it.runIf(process.platform === 'win32')('treats the bundled Node running an outside script as an external client only', async () => {
  const node = 'C:\\Fake\\Agent-Core\\runtime\\node\\node.exe';
  expect(await classify([
    `${node} E:\\Agent-Core-Plugin\\setup\\agent-core-stdio-bridge.mjs`,
    `"${node}" "D:\\Other Tool\\bridge.mjs"`,
    `${node} C:\\Fake\\Agent-Core\\dist\\index.js`,
    `"${node}" "C:\\Fake\\Agent-Core\\runtime\\semantic-ide\\server.js" --stdio`,
    `${node} --max-old-space-size=4096 E:\\Elsewhere\\x.mjs`,
    `${node} dist\\index.js`,
    `${node}`,
  ])).toEqual(['False', 'False', 'True', 'True', 'True', 'True', 'True']);
});
