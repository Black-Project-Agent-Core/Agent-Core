import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const windowsIt = process.platform === 'win32' ? it : it.skip;
const repoRoot = path.resolve(import.meta.dirname, '..');
const bootstrap = path.join(repoRoot, 'scripts', 'windows', 'agent-core-bootstrap.ps1');
const roots: string[] = [];

async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function powershellPath() {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function npmPath() {
  return path.join(path.dirname(process.execPath), 'npm.cmd');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Core portable bootstrap', () => {
  windowsIt('publishes a mutation-free portable contract with verified dependency sources', () => {
    expect(existsSync(bootstrap)).toBe(true);
    const result = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',bootstrap,'-ContractOnly'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout.trim());
    expect(path.resolve(body.root)).toBe(repoRoot);
    expect(body.minimumNodeVersion).toBe('24.15.0');
    expect(body.preferredNodeVersion).toBe('24.16.0');
    expect(body.tunnelClientVersion).toBe('0.0.13');
    expect(body.nodeBaseUrl).toBe('https://nodejs.org/dist');
    expect(body.tunnelReleaseBaseUrl).toContain('github.com/openai/tunnel-client/releases/download/v0.0.13');
  });

  windowsIt('rebinds a relocated root while preserving durable state and discarding stale lifecycle state', async () => {
    const root = await tempDir('agent-core-relocated-');
    const localAppData = await tempDir('agent-core-localapp-');
    await mkdir(path.join(root, 'runtime', 'tray'), { recursive: true });
    await mkdir(path.join(root, 'runtime', 'bootstrap'), { recursive: true });
    for (const dir of ['data','memory','execution']) await mkdir(path.join(root, 'runtime', dir), { recursive: true });
    await mkdir(path.join(root, 'secrets'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ engines: { node: '>=24.15.0' } }), 'utf8');
    await writeFile(path.join(root, 'runtime', 'data', 'durable.txt'), 'data', 'utf8');
    await writeFile(path.join(root, 'runtime', 'memory', 'durable.txt'), 'memory', 'utf8');
    await writeFile(path.join(root, 'runtime', 'execution', 'durable.txt'), 'execution', 'utf8');
    await writeFile(path.join(root, 'secrets', 'durable.txt'), 'secret', 'utf8');
    await writeFile(path.join(root, 'runtime', 'tray', 'state.json'), JSON.stringify({ services: { agentCore: { pid: 12345 } } }), 'utf8');
    await writeFile(path.join(root, 'runtime', 'tray', 'exit.request'), 'exit', 'utf8');
    await writeFile(path.join(root, 'runtime', 'bootstrap', 'install-state.json'), JSON.stringify({ schemaVersion: 1, root: 'E:\\Old\\Agent-Core', machine: 'OLD' }), 'utf8');

    const result = spawnSync(powershellPath(), ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',bootstrap,'-PrepareOnly','-NoDownload','-Root',root,'-LocalAppDataRoot',localAppData,'-NodeExeOverride',process.execPath,'-NpmExeOverride',npmPath(),'-TunnelExeOverride',process.execPath], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout.trim());
    expect(body.relocated).toBe(true);
    expect(path.resolve(body.root)).toBe(path.resolve(root));
    expect(existsSync(path.join(root, 'runtime', 'tray', 'state.json'))).toBe(false);
    expect(existsSync(path.join(root, 'runtime', 'tray', 'exit.request'))).toBe(false);
    for (const rel of ['runtime/data/durable.txt','runtime/memory/durable.txt','runtime/execution/durable.txt','secrets/durable.txt']) expect(readFileSync(path.join(root, rel), 'utf8')).toBeTruthy();
    expect(path.resolve((await readFile(path.join(localAppData, 'AgentCore', 'root.txt'), 'utf8')).trim())).toBe(path.resolve(root));
  });
});
