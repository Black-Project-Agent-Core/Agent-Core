import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const windowsIt = process.platform === 'win32' ? it : it.skip;
const repoRoot = path.resolve(import.meta.dirname, '..');
const windowsDir = path.join(repoRoot, 'scripts', 'windows');
const packScript = path.join(windowsDir, 'agent-core-pack.ps1');
const extractScript = path.join(windowsDir, 'agent-core-extract.ps1');
const packBat = path.join(repoRoot, 'Pack-Agent-Core.bat');
const extractBat = path.join(repoRoot, 'Extract-Agent-Core.bat');
const roots: string[] = [];
const children: ChildProcess[] = [];

function powershellPath() {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
afterEach(async () => {
  for (const child of children.splice(0)) { if (child.exitCode === null) child.kill(); }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Core safe portable transfer', () => {
  windowsIt('publishes separate one-click pack and extract entrypoints', () => {
    for (const file of [packScript, extractScript, packBat, extractBat]) expect(existsSync(file)).toBe(true);
    const pack = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',packScript,'-ContractOnly'], { encoding: 'utf8' });
    expect(pack.status).toBe(0);
    const body = JSON.parse(pack.stdout.trim());
    expect(body.archiveRoot).toBe('Agent-Core');
    expect(body.restartAfterPack).toBe(true);
    expect(body.checksumSidecar).toBe(true);
    expect(body.exclusions).toEqual(expect.arrayContaining(['node_modules','.worktrees','runtime/tray','runtime/launcher','runtime/tools']));
    const packBatSource = readFileSync(packBat, 'utf8');
    const extractBatSource = readFileSync(extractBat, 'utf8');
    expect(packBatSource).toContain('agent-core-pack.ps1');
    expect(extractBatSource).toContain('agent-core-extract.ps1');
    expect(packBatSource).toContain('-NonInteractive');
    expect(extractBatSource).toContain('-NonInteractive');
    expect(packBatSource).toContain('AGENT_CORE_NO_PAUSE');
    expect(extractBatSource).toContain('AGENT_CORE_NO_PAUSE');
  });

  windowsIt('runs the pack BAT end-to-end in an isolated portable root', async () => {
    const outer = await tempDir('agent-core-pack-bat-');
    const root = path.join(outer, 'Agent-Core');
    await mkdir(path.join(root, 'scripts', 'windows'), { recursive: true });
    await mkdir(path.join(root, 'runtime', 'data'), { recursive: true });
    for (const name of ['Pack-Agent-Core.bat','Extract-Agent-Core.bat']) await writeFile(path.join(root, name), readFileSync(path.join(repoRoot, name), 'utf8'), 'utf8');
    for (const name of ['agent-core-pack.ps1','agent-core-extract.ps1']) await writeFile(path.join(root, 'scripts', 'windows', name), readFileSync(path.join(windowsDir, name), 'utf8'), 'utf8');
    const marker = path.join(root, 'runtime', 'data', 'restarted.txt');
    await writeFile(path.join(root, 'scripts', 'windows', 'agent-core-launcher.ps1'), `Set-Content -LiteralPath '${marker.replaceAll("'", "''")}' -Value restarted\nexit 0`, 'utf8');
    await writeFile(path.join(root, 'payload.txt'), 'portable', 'utf8');
    const result = spawnSync(path.join(root, 'Pack-Agent-Core.bat'), [], { encoding: 'utf8', shell: true, timeout: 15_000, env: { ...process.env, AGENT_CORE_NO_PAUSE: '1' } });
    expect(result.status, `stdout=${result.stdout} stderr=${result.stderr}`).toBe(0);
    expect(existsSync(marker)).toBe(true);
    const entries = await readdir(outer);
    const transferName = entries.find((name) => name.startsWith('Agent-Core-Transfer-'));
    expect(transferName).toBeTruthy();
    expect(existsSync(path.join(outer, transferName!, 'Extract-Agent-Core.bat'))).toBe(true);
  }, 20_000);

  windowsIt('runs the extract BAT end-to-end from a standalone transfer folder', async () => {
    const outer = await tempDir('agent-core-extract-bat-');
    const transfer = path.join(outer, 'Transfer');
    const source = path.join(outer, 'Source');
    await mkdir(transfer, { recursive: true });
    await mkdir(path.join(source, 'Agent-Core', 'scripts', 'windows'), { recursive: true });
    await writeFile(path.join(transfer, 'Extract-Agent-Core.bat'), readFileSync(extractBat, 'utf8'), 'utf8');
    await writeFile(path.join(transfer, 'agent-core-extract.ps1'), readFileSync(extractScript, 'utf8'), 'utf8');
    await writeFile(path.join(source, 'Agent-Core', 'Start-Agent-Core.bat'), '@echo off', 'utf8');
    await writeFile(path.join(source, 'Agent-Core', 'scripts', 'windows', 'agent-core-bootstrap.ps1'), 'Write-Output bootstrap', 'utf8');
    await writeFile(path.join(source, 'Agent-Core', 'scripts', 'windows', 'agent-core-launcher.ps1'), `$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\\..'))\nSet-Content -LiteralPath (Join-Path $root 'launched.txt') -Value yes\nexit 0`, 'utf8');
    const archive = path.join(transfer, 'Agent-Core-Portable-bat-test.zip');
    const zip = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command', `Compress-Archive -Path '${path.join(source,'Agent-Core').replaceAll("'","''")}' -DestinationPath '${archive.replaceAll("'","''")}' -Force`], { encoding: 'utf8' });
    expect(zip.status).toBe(0);
    const hash = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command', `(Get-FileHash -Algorithm SHA256 -LiteralPath '${archive.replaceAll("'","''")}').Hash.ToLowerInvariant()`], { encoding: 'utf8' }).stdout.trim();
    await writeFile(`${archive}.sha256`, `${hash}  ${path.basename(archive)}\n`, 'utf8');
    const result = spawnSync(path.join(transfer, 'Extract-Agent-Core.bat'), [], { encoding: 'utf8', shell: true, timeout: 15_000, env: { ...process.env, AGENT_CORE_NO_PAUSE: '1' } });
    expect(result.status, `stdout=${result.stdout} stderr=${result.stderr}`).toBe(0);
    expect(existsSync(path.join(transfer, 'Agent-Core', 'launched.txt'))).toBe(true);
  }, 20_000);

  windowsIt('blocks launcher bootstrap while a package lock is active', async () => {
    const transfer = path.join(repoRoot, 'runtime', 'transfer');
    await mkdir(transfer, { recursive: true });
    const lock = path.join(transfer, 'pack.lock');
    await writeFile(lock, JSON.stringify({ schemaVersion: 1, active: true }), 'utf8');
    try {
      const launcher = path.join(windowsDir, 'agent-core-launcher.ps1');
      const result = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',launcher,'-BootstrapOnly'], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain('portable package operation is active');
    } finally {
      await rm(lock, { force: true });
    }
  });

  windowsIt('creates a checksum-protected archive without machine-local runtime state', async () => {
    const root = await tempDir('agent-core-pack-root-');
    const out = await tempDir('agent-core-pack-out-');
    for (const rel of ['runtime/data','runtime/memory','runtime/execution','runtime/tray','runtime/launcher','runtime/tools','node_modules','scripts/windows']) {
      await mkdir(path.join(root, rel), { recursive: true });
    }
    await writeFile(path.join(root, 'runtime/data/oauth.json'), '{"durable":true}', 'utf8');
    await writeFile(path.join(root, 'runtime/memory/memory.sqlite'), 'memory', 'utf8');
    await writeFile(path.join(root, 'runtime/execution/execution.sqlite'), 'execution', 'utf8');
    await writeFile(path.join(root, 'runtime/tray/state.json'), 'stale', 'utf8');
    await writeFile(path.join(root, 'runtime/launcher/cache.txt'), 'cache', 'utf8');
    await writeFile(path.join(root, 'runtime/tools/tool.txt'), 'machine', 'utf8');
    await writeFile(path.join(root, 'node_modules/module.txt'), 'machine', 'utf8');
    await writeFile(path.join(root, 'Start-Agent-Core.bat'), '@echo off', 'utf8');
    await writeFile(path.join(root, 'Extract-Agent-Core.bat'), '@echo off', 'utf8');
    await writeFile(path.join(root, 'scripts/windows/agent-core-extract.ps1'), 'Write-Output extract', 'utf8');

    const result = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',packScript,'-Root',root,'-OutputDirectory',out,'-NoRestart','-SkipProcessStop'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const body = JSON.parse(result.stdout.trim());
    expect(existsSync(body.archivePath)).toBe(true);
    expect(existsSync(body.checksumPath)).toBe(true);
    expect(existsSync(path.join(body.transferDirectory, 'Extract-Agent-Core.bat'))).toBe(true);
    expect(existsSync(path.join(body.transferDirectory, 'agent-core-extract.ps1'))).toBe(true);

    const extracted = await tempDir('agent-core-pack-inspect-');
    const expand = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-Command', `Expand-Archive -LiteralPath '${String(body.archivePath).replaceAll("'", "''")}' -DestinationPath '${extracted.replaceAll("'", "''")}' -Force`], { encoding: 'utf8' });
    expect(expand.status).toBe(0);
    expect(existsSync(path.join(extracted, 'Agent-Core/runtime/data/oauth.json'))).toBe(true);
    expect(existsSync(path.join(extracted, 'Agent-Core/runtime/memory/memory.sqlite'))).toBe(true);
    expect(existsSync(path.join(extracted, 'Agent-Core/runtime/execution/execution.sqlite'))).toBe(true);
    for (const rel of ['runtime/tray/state.json','runtime/launcher/cache.txt','runtime/tools/tool.txt','node_modules/module.txt']) {
      expect(existsSync(path.join(extracted, 'Agent-Core', rel))).toBe(false);
    }
  }, 20_000);

  windowsIt('stops a root-owned Agent Core process during packing and restarts the launcher afterward', async () => {
    const root = await tempDir('agent-core-pack-process-root-');
    const out = await tempDir('agent-core-pack-process-out-');
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await mkdir(path.join(root, 'scripts', 'windows'), { recursive: true });
    await mkdir(path.join(root, 'runtime', 'data'), { recursive: true });
    const agentEntry = path.join(root, 'dist', 'index.js');
    await writeFile(agentEntry, "setInterval(()=>{},1000);", 'utf8');
    await writeFile(path.join(root, 'Extract-Agent-Core.bat'), '@echo off', 'utf8');
    await writeFile(path.join(root, 'scripts', 'windows', 'agent-core-extract.ps1'), 'Write-Output extract', 'utf8');
    const restartMarker = path.join(root, 'runtime', 'data', 'restart.marker');
    const childPidMarker = path.join(root, 'runtime', 'data', 'restart-child.pid');
    await writeFile(path.join(root, 'scripts', 'windows', 'agent-core-launcher.ps1'), [
      `$p = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo','-NoProfile','-Command','Start-Sleep -Seconds 30') -WindowStyle Hidden -PassThru`,
      `Set-Content -LiteralPath '${childPidMarker.replaceAll("'", "''")}' -Value $p.Id`,
      `Set-Content -LiteralPath '${restartMarker.replaceAll("'", "''")}' -Value restarted`,
      'exit 0',
    ].join('\n'), 'utf8');
    const child = spawn(process.execPath, [agentEntry], { cwd: root, stdio: 'ignore' });
    children.push(child);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const result = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',packScript,'-Root',root,'-OutputDirectory',out], { encoding: 'utf8', timeout: 12_000 });
    expect(result.status).toBe(0);
    const body = JSON.parse(result.stdout.trim());
    expect(body.stoppedProcesses).toBeGreaterThanOrEqual(1);
    expect(body.restarted).toBe('started');
    expect(existsSync(restartMarker)).toBe(true);
    expect(() => process.kill(child.pid!, 0)).toThrow();
    const restartChildPid = Number(readFileSync(childPidMarker, 'utf8').trim());
    expect(() => process.kill(restartChildPid, 0)).not.toThrow();
    process.kill(restartChildPid);
  }, 15_000);

  windowsIt('extracts only a verified Agent-Core package and preserves a clean destination boundary', async () => {
    const source = await tempDir('agent-core-extract-source-');
    const transfer = await tempDir('agent-core-extract-transfer-');
    const destination = path.join(await tempDir('agent-core-extract-dest-'), 'Agent-Core');
    await mkdir(path.join(source, 'Agent-Core', 'scripts', 'windows'), { recursive: true });
    await writeFile(path.join(source, 'Agent-Core', 'Start-Agent-Core.bat'), '@echo off', 'utf8');
    await writeFile(path.join(source, 'Agent-Core', 'scripts', 'windows', 'agent-core-bootstrap.ps1'), 'Write-Output bootstrap', 'utf8');
    await writeFile(path.join(source, 'Agent-Core', 'scripts', 'windows', 'agent-core-launcher.ps1'), [
      `$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\\..'))`,
      `$p = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo','-NoProfile','-Command','Start-Sleep -Seconds 30') -WindowStyle Hidden -PassThru`,
      `[IO.File]::WriteAllText((Join-Path $root 'launcher-child.pid'), [string]$p.Id)`,
      'exit 0',
    ].join('\n'), 'utf8');
    const archive = path.join(transfer, 'Agent-Core-Portable-test.zip');
    const zip = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-Command', `Compress-Archive -Path '${path.join(source, 'Agent-Core').replaceAll("'", "''")}' -DestinationPath '${archive.replaceAll("'", "''")}' -Force`], { encoding: 'utf8' });
    expect(zip.status).toBe(0);
    const hash = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-Command', `(Get-FileHash -Algorithm SHA256 -LiteralPath '${archive.replaceAll("'", "''")}').Hash.ToLowerInvariant()`], { encoding: 'utf8' }).stdout.trim();
    await writeFile(`${archive}.sha256`, `${hash}  ${path.basename(archive)}\n`, 'utf8');

    const result = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',extractScript,'-ArchivePath',archive,'-Destination',destination,'-NoLaunch'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const body = JSON.parse(result.stdout.trim());
    expect(path.resolve(body.destination)).toBe(path.resolve(destination));
    expect(body.checksumVerified).toBe(true);
    expect(existsSync(path.join(destination, 'Start-Agent-Core.bat'))).toBe(true);

    const launchDestination = path.join(await tempDir('agent-core-extract-launch-'), 'Agent-Core');
    const launched = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',extractScript,'-ArchivePath',archive,'-Destination',launchDestination], { encoding: 'utf8', timeout: 10_000 });
    expect(launched.status).toBe(0);
    const launchChildPid = Number(readFileSync(path.join(launchDestination, 'launcher-child.pid'), 'utf8').trim());
    expect(() => process.kill(launchChildPid, 0)).not.toThrow();
    process.kill(launchChildPid);

    await writeFile(`${archive}.sha256`, `${'0'.repeat(64)}  ${path.basename(archive)}\n`, 'utf8');
    const corruptDestination = path.join(await tempDir('agent-core-extract-corrupt-'), 'Agent-Core');
    const corrupt = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',extractScript,'-ArchivePath',archive,'-Destination',corruptDestination,'-NoLaunch'], { encoding: 'utf8' });
    expect(corrupt.status).not.toBe(0);
    expect(existsSync(corruptDestination)).toBe(false);
  }, 20_000);
});
