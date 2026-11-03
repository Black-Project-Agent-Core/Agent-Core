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

// A Codex app-server broker or an MCP server started by a coding agent uses the bundled Node with a script under
// runtime\npm-prefix, inside this checkout. It is a client of Core, and waiting for it blocked every restart.
type Row = { id: number; parent: number; name: string; path?: string; command?: string; created?: number };
async function ancestry(rows: Row[], ids: number[]): Promise<string[]> {
  const temp = await mkdtemp(path.join(tmpdir(), 'restart-ancestry-')); roots.push(temp);
  const script = path.resolve('scripts/windows/Restart-Agent-Core.ps1');
  const root = 'C:\\Fake\\Agent-Core';
  const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
  const table = rows.map(r => `$byId[${r.id}] = [pscustomobject]@{ ProcessId=${r.id}; ParentProcessId=${r.parent}; Name=${quote(r.name)}; ` +
    `ExecutablePath=${quote(r.path ?? '')}; CommandLine=${quote(r.command ?? '')}; CreationDate=[datetime]'2026-11-03T00:00:00' + [timespan]::FromSeconds(${r.created ?? r.id}) }`).join('\n');
  const runner = path.join(temp, 'test.ps1');
  await writeFile(runner, `$source = ${quote(script)}\n$tokens=$null; $errors=$null\n` +
    `$ast=[System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)\n` +
    `foreach($name in 'Test-ExternalNodeScript','Test-CoreRootProcess','Test-AgentHostProcess','Test-AgentHostDescendant'){\n` +
    `  $function=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)\n` +
    `  if(!$function){throw "Missing $name"}\n  Invoke-Expression $function.Extent.Text\n}\n` +
    `$root=${quote(root)}; $exePath="$root\\Agent Core.exe"; $nodePath="$root\\runtime\\node\\node.exe"; $coreEntry="$root\\dist\\index.js"\n` +
    `$tunnelPath="$root\\tunnel-client\\tunnel-client.exe"; $runtimePrefixes=@(); $profilePaths=@()\n` +
    `$agentHostNames = @('codex.exe','claude.exe')\n$byId=@{}\n${table}\n` +
    ids.map(id => `Write-Output (Test-AgentHostDescendant $byId[${id}] $byId)`).join('\n') + '\n');
  return execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runner],
    { windowsHide: true, encoding: 'utf8' }).trim().split(/\r?\n/);
}

it.runIf(process.platform === 'win32')('counts a bundled-Node client of a coding agent as external, and Core descendants and orphans as owned', async () => {
  const node = 'C:\\Fake\\Agent-Core\\runtime\\node\\node.exe';
  const npm = 'C:/Fake/Agent-Core/runtime/npm-prefix/node_modules';
  const rows: Row[] = [
    { id: 1, parent: 0, name: 'node.exe', path: node, command: `"${node}" "F:\\AI Agent\\plugins\\cache\\codex\\scripts\\app-server-broker.mjs" serve --endpoint pipe:` },
    { id: 2, parent: 1, name: 'bash.exe' },
    { id: 3, parent: 2, name: 'sh.exe' },
    { id: 10, parent: 3, name: 'node.exe', path: node, command: `${node} ${npm}/@openai/codex/bin/codex.js app-server` },
    { id: 11, parent: 10, name: 'codex.exe' },
    { id: 12, parent: 11, name: 'node.exe', path: node, command: `"${node}" ${npm}/context-mode/server.bundle.mjs` },
    { id: 20, parent: 0, name: 'Agent Core.exe', path: 'C:\\Fake\\Agent-Core\\Agent Core.exe', command: 'Agent Core.exe' },
    { id: 21, parent: 20, name: 'node.exe', path: node, command: `${node} C:\\Fake\\Agent-Core\\dist\\index.js` },
    { id: 22, parent: 21, name: 'powershell.exe' },
    { id: 23, parent: 22, name: 'node.exe', path: node, command: `${node} vitest.mjs run` },
    { id: 24, parent: 20, name: 'bash.exe' },
    { id: 25, parent: 24, name: 'node.exe', path: node, command: `${node} ${npm}/some-tool/index.js` },
    { id: 30, parent: 999, name: 'node.exe', path: node, command: `${node} ${npm}/typescript-language-server/lib/cli.mjs` },
    { id: 31, parent: 2, name: 'node.exe', path: node, command: `${node} ${npm}/reused/index.js`, created: 1 },
    { id: 40, parent: 41, name: 'node.exe', path: node, command: `${node} ${npm}/typescript-language-server/lib/cli.mjs` },
    { id: 41, parent: 42, name: 'bash.exe', created: 1 },
  ];
  // external: the broker's app-server and the MCP server under codex.exe. owned: a test run under Core, a tool Core
  // started through a shell, an orphan whose parent is gone, a child whose parent is younger than it (a reused PID),
  // and a helper under a shell whose Core has already exited (a shell is no proof of a coding-agent client).
  expect(await ancestry(rows, [10, 12, 23, 25, 30, 31, 40])).toEqual(['True', 'True', 'False', 'False', 'False', 'False', 'False']);
});

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
