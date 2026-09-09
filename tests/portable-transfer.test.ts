import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const controllerRelative = path.join('SubProject', 'Agent-Code', 'Agent Code Native.exe');
const roots: string[] = [];
const children: ChildProcess[] = [];

function powershellPath() {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function runPowerShell(args: string[], timeout = 20_000) {
  return spawnSync(powershellPath(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {
    encoding: 'utf8',
    timeout,
  });
}

async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

async function seedPortableRoot(root: string) {
  await mkdir(path.join(root, 'scripts', 'windows'), { recursive: true });
  await mkdir(path.join(root, path.dirname(controllerRelative)), { recursive: true });
  await writeFile(path.join(root, controllerRelative), 'MZ', 'utf8');
  await writeFile(path.join(root, 'Extract-Agent-Core.bat'), readFileSync(extractBat, 'utf8'), 'utf8');
  await writeFile(path.join(root, 'scripts', 'windows', 'agent-core-extract.ps1'), readFileSync(extractScript, 'utf8'), 'utf8');
}

async function packageFrom(root: string, transfer: string) {
  const archive = path.join(transfer, 'Agent-Core-Portable-test.zip');
  const zip = runPowerShell([
    '-Command',
    `Compress-Archive -Path '${root.replaceAll("'", "''")}' -DestinationPath '${archive.replaceAll("'", "''")}' -Force`,
  ]);
  expect(zip.status, zip.stderr).toBe(0);
  const hash = createHash('sha256').update(readFileSync(archive)).digest('hex');
  await writeFile(`${archive}.sha256`, `${hash}  ${path.basename(archive)}\n`, 'utf8');
  return archive;
}

afterEach(async () => {
  await Promise.all(children.splice(0).map((child) => {
    if (child.exitCode !== null) return Promise.resolve();
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    return exited;
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Core safe portable transfer', () => {
  windowsIt('publishes pack and extract entrypoints that carry the Agent Code native controller and start nothing', () => {
    for (const file of [packScript, extractScript, packBat, extractBat]) expect(existsSync(file)).toBe(true);

    const pack = JSON.parse(runPowerShell(['-File', packScript, '-ContractOnly']).stdout.trim());
    expect(pack.archiveRoot).toBe('Agent-Core');
    expect(pack.checksumSidecar).toBe(true);
    expect(pack.requiresStoppedRuntime).toBe(true);
    expect(pack.controller).toBe(controllerRelative);
    expect(pack.exclusions).toEqual(expect.arrayContaining(['node_modules', '.worktrees', 'runtime/tray', 'runtime/launcher', 'runtime/tools', 'runtime/agent-code-controller']));

    const extract = JSON.parse(runPowerShell(['-File', extractScript, '-ContractOnly']).stdout.trim());
    expect(extract.archiveRoot).toBe('Agent-Core');
    expect(extract.checksumRequired).toBe(true);
    expect(extract.controller).toBe(controllerRelative);
    expect(extract.startsController).toBe(false);

    const packBatSource = readFileSync(packBat, 'utf8');
    const extractBatSource = readFileSync(extractBat, 'utf8');
    expect(packBatSource).toContain('agent-core-pack.ps1');
    expect(extractBatSource).toContain('agent-core-extract.ps1');
    expect(packBatSource).toContain('-NonInteractive');
    expect(extractBatSource).toContain('-NonInteractive');
    expect(packBatSource).toContain('AGENT_CORE_NO_PAUSE');
    expect(extractBatSource).toContain('AGENT_CORE_NO_PAUSE');

    for (const source of [readFileSync(packScript, 'utf8'), readFileSync(extractScript, 'utf8'), packBatSource, extractBatSource]) {
      expect(source).not.toMatch(/agent-core-launcher\.ps1|agent-core-tray\.ps1|launch-agent-core-hidden\.vbs|Start-Agent-Core/i);
    }
  });

  windowsIt('refuses to pack while Agent Core is still running for that root', async () => {
    const root = await tempDir('agent-core-pack-running-');
    const out = await tempDir('agent-core-pack-running-out-');
    await seedPortableRoot(root);
    await mkdir(path.join(root, 'dist'), { recursive: true });
    const agentEntry = path.join(root, 'dist', 'index.js');
    await writeFile(agentEntry, 'setInterval(()=>{},1000);', 'utf8');
    const child = spawn(process.execPath, [agentEntry], { cwd: os.tmpdir(), stdio: 'ignore' });
    children.push(child);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const result = runPowerShell(['-File', packScript, '-Root', root, '-OutputDirectory', out]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/still running for this root/);
    expect(await readdir(out)).toEqual([]);
  }, 25_000);

  windowsIt('refuses to pack a root without the Agent Code native controller', async () => {
    const root = await tempDir('agent-core-pack-nocontroller-');
    const out = await tempDir('agent-core-pack-nocontroller-out-');
    await mkdir(path.join(root, 'scripts', 'windows'), { recursive: true });
    const result = runPowerShell(['-File', packScript, '-Root', root, '-OutputDirectory', out]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/lifecycle controller is missing/);
  });

  windowsIt('refuses to pack while another package operation holds the lock', async () => {
    const root = await tempDir('agent-core-pack-locked-');
    const out = await tempDir('agent-core-pack-locked-out-');
    await seedPortableRoot(root);
    await mkdir(path.join(root, 'runtime', 'transfer'), { recursive: true });
    await writeFile(path.join(root, 'runtime', 'transfer', 'pack.lock'), JSON.stringify({ schemaVersion: 1, active: true }), 'utf8');

    const result = runPowerShell(['-File', packScript, '-Root', root, '-OutputDirectory', out]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/portable package operation is active/);
  });

  windowsIt('creates a checksum-protected archive without machine-local runtime state', async () => {
    const root = await tempDir('agent-core-pack-root-');
    const out = await tempDir('agent-core-pack-out-');
    await seedPortableRoot(root);
    for (const rel of ['runtime/data', 'runtime/memory/vault', 'runtime/execution', 'runtime/tray', 'runtime/launcher', 'runtime/tools', 'runtime/agent-code-controller', 'node_modules']) {
      await mkdir(path.join(root, rel), { recursive: true });
    }
    await writeFile(path.join(root, 'runtime/data/oauth.json'), '{"durable":true}', 'utf8');
    await writeFile(path.join(root, 'runtime/memory/vault/entry.json'), '{"durable":true}', 'utf8');
    await writeFile(path.join(root, 'runtime/execution/state.json'), '{"durable":true}', 'utf8');
    await writeFile(path.join(root, 'runtime/tray/state.json'), 'stale', 'utf8');
    await writeFile(path.join(root, 'runtime/launcher/cache.txt'), 'cache', 'utf8');
    await writeFile(path.join(root, 'runtime/tools/tool.txt'), 'machine', 'utf8');
    await writeFile(path.join(root, 'runtime/agent-code-controller/state.json'), 'machine', 'utf8');
    await writeFile(path.join(root, 'node_modules/module.txt'), 'machine', 'utf8');

    const result = runPowerShell(['-File', packScript, '-Root', root, '-OutputDirectory', out]);
    expect(result.status, `stdout=${result.stdout} stderr=${result.stderr}`).toBe(0);
    const body = JSON.parse(result.stdout.trim());
    expect(existsSync(body.archivePath)).toBe(true);
    expect(existsSync(body.checksumPath)).toBe(true);
    expect(existsSync(path.join(body.transferDirectory, 'Extract-Agent-Core.bat'))).toBe(true);
    expect(existsSync(path.join(body.transferDirectory, 'agent-core-extract.ps1'))).toBe(true);

    const extracted = await tempDir('agent-core-pack-inspect-');
    const expand = runPowerShell([
      '-Command',
      `Expand-Archive -LiteralPath '${String(body.archivePath).replaceAll("'", "''")}' -DestinationPath '${extracted.replaceAll("'", "''")}' -Force`,
    ]);
    expect(expand.status).toBe(0);
    for (const rel of ['runtime/data/oauth.json', 'runtime/memory/vault/entry.json', 'runtime/execution/state.json', controllerRelative]) {
      expect(existsSync(path.join(extracted, 'Agent-Core', rel)), `${rel} must survive packing`).toBe(true);
    }
    for (const rel of ['runtime/tray/state.json', 'runtime/launcher/cache.txt', 'runtime/tools/tool.txt', 'runtime/agent-code-controller/state.json', 'node_modules/module.txt']) {
      expect(existsSync(path.join(extracted, 'Agent-Core', rel)), `${rel} must stay machine-local`).toBe(false);
    }
  }, 25_000);

  windowsIt('extracts only a verified package, keeps a clean destination boundary, and starts no process', async () => {
    const outer = await tempDir('agent-core-extract-source-');
    const source = path.join(outer, 'Agent-Core');
    const transfer = await tempDir('agent-core-extract-transfer-');
    await seedPortableRoot(source);
    const archive = await packageFrom(source, transfer);

    const destination = path.join(await tempDir('agent-core-extract-dest-'), 'Agent-Core');
    const result = runPowerShell(['-File', extractScript, '-ArchivePath', archive, '-Destination', destination]);
    expect(result.status, `stdout=${result.stdout} stderr=${result.stderr}`).toBe(0);
    const body = JSON.parse(result.stdout.trim());
    expect(path.resolve(body.destination)).toBe(path.resolve(destination));
    expect(body.checksumVerified).toBe(true);
    expect(body.started).toBe(false);
    expect(path.resolve(body.controller)).toBe(path.join(destination, controllerRelative));
    expect(existsSync(path.join(destination, controllerRelative))).toBe(true);

    const occupied = path.join(await tempDir('agent-core-extract-occupied-'), 'Agent-Core');
    await mkdir(occupied, { recursive: true });
    await writeFile(path.join(occupied, 'existing.txt'), 'keep', 'utf8');
    const refused = runPowerShell(['-File', extractScript, '-ArchivePath', archive, '-Destination', occupied]);
    expect(refused.status).not.toBe(0);
    expect(existsSync(path.join(occupied, 'existing.txt'))).toBe(true);

    await writeFile(`${archive}.sha256`, `${'0'.repeat(64)}  ${path.basename(archive)}\n`, 'utf8');
    const corruptDestination = path.join(await tempDir('agent-core-extract-corrupt-'), 'Agent-Core');
    const corrupt = runPowerShell(['-File', extractScript, '-ArchivePath', archive, '-Destination', corruptDestination]);
    expect(corrupt.status).not.toBe(0);
    expect(existsSync(corruptDestination)).toBe(false);
  }, 25_000);

  windowsIt('rejects an archive that does not carry the Agent Code native controller', async () => {
    const outer = await tempDir('agent-core-extract-invalid-');
    const source = path.join(outer, 'Agent-Core');
    const transfer = await tempDir('agent-core-extract-invalid-transfer-');
    await mkdir(path.join(source, 'scripts', 'windows'), { recursive: true });
    await writeFile(path.join(source, 'payload.txt'), 'portable', 'utf8');
    const archive = await packageFrom(source, transfer);

    const destination = path.join(await tempDir('agent-core-extract-invalid-dest-'), 'Agent-Core');
    const result = runPowerShell(['-File', extractScript, '-ArchivePath', archive, '-Destination', destination]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/not a valid portable Agent Core package/);
    expect(existsSync(destination)).toBe(false);
  }, 25_000);

  windowsIt('runs the pack and extract BAT entrypoints end-to-end', async () => {
    const outer = await tempDir('agent-core-transfer-bat-');
    const root = path.join(outer, 'Agent-Core');
    await seedPortableRoot(root);
    await writeFile(path.join(root, 'Pack-Agent-Core.bat'), readFileSync(packBat, 'utf8'), 'utf8');
    await writeFile(path.join(root, 'scripts', 'windows', 'agent-core-pack.ps1'), readFileSync(packScript, 'utf8'), 'utf8');
    await writeFile(path.join(root, 'payload.txt'), 'portable', 'utf8');

    const packed = spawnSync(path.join(root, 'Pack-Agent-Core.bat'), [], {
      encoding: 'utf8', shell: true, timeout: 25_000, env: { ...process.env, AGENT_CORE_NO_PAUSE: '1' },
    });
    expect(packed.status, `stdout=${packed.stdout} stderr=${packed.stderr}`).toBe(0);
    const transferName = (await readdir(outer)).find((name) => name.startsWith('Agent-Core-Transfer-'));
    expect(transferName).toBeTruthy();
    const transfer = path.join(outer, transferName!);
    expect(existsSync(path.join(transfer, 'Extract-Agent-Core.bat'))).toBe(true);

    await rm(root, { recursive: true, force: true });
    const extracted = spawnSync(path.join(transfer, 'Extract-Agent-Core.bat'), [], {
      encoding: 'utf8', shell: true, timeout: 25_000, env: { ...process.env, AGENT_CORE_NO_PAUSE: '1' },
    });
    expect(extracted.status, `stdout=${extracted.stdout} stderr=${extracted.stderr}`).toBe(0);
    expect(existsSync(path.join(transfer, 'Agent-Core', controllerRelative))).toBe(true);
    expect(existsSync(path.join(transfer, 'Agent-Core', 'payload.txt'))).toBe(true);
  }, 40_000);
});
