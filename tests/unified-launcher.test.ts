import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const windowsIt = process.platform === 'win32' ? it : it.skip;
const repoRoot = path.resolve(import.meta.dirname, '..');
const batPath = path.join(repoRoot, 'Start-Agent-Core.bat');
const launcherPath = path.join(repoRoot, 'scripts', 'windows', 'agent-core-launcher.ps1');
const bootstrapPath = path.join(repoRoot, 'scripts', 'windows', 'agent-core-bootstrap.ps1');
const agentCodeControllerPath = path.join(repoRoot, 'SubProject', 'Agent-Code', 'src-tauri', 'src', 'agent_core.rs');

function runContract(script: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', script, '-ContractOnly',
  ], { encoding: 'utf8', env: { ...process.env, ...env } });
}

describe('Agent Core unified launcher', () => {
  it('retires the BAT entrypoint and uses Agent Code as the public launcher control surface', () => {
    expect(existsSync(batPath)).toBe(false);
    expect(existsSync(agentCodeControllerPath)).toBe(true);
    const controller = readFileSync(agentCodeControllerPath, 'utf8');
    expect(controller).toContain('pub fn start_bundle');
    expect(controller).toContain('pub fn restart_agent_core');
    expect(controller).toContain('pub fn restart_tunnel');
    expect(controller).toContain('pub fn restart_all');
    expect(controller).toContain('pub fn reset_oauth');
    expect(controller).toContain('pub fn toggle_autostart');
    expect(controller).toContain('pub fn exit_agent_core');
    expect(controller).not.toMatch(/Start-Agent-Core\.bat/i);
    const launcher = readFileSync(launcherPath, 'utf8');
    expect(launcher).toContain('ControlledTakeover');
    expect(launcher).toContain('runtime\\launcher');
  });

  windowsIt('reports a script-relative portable contract without changing runtime state', () => {
    expect(existsSync(launcherPath)).toBe(true);
    const result = runContract(launcherPath);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const body = JSON.parse(result.stdout.trim());
    expect(path.resolve(body.root)).toBe(repoRoot);
    expect(path.resolve(body.trayScript)).toBe(path.join(repoRoot, 'scripts', 'windows', 'agent-core-tray.ps1'));
    expect(path.resolve(body.bootstrapScript)).toBe(bootstrapPath);
    expect(path.resolve(body.tunnelProfile)).toBe(path.join(repoRoot, 'tunnel-client', 'agent-core.yaml'));
    expect(path.resolve(body.dataDir)).toBe(path.join(repoRoot, 'runtime', 'data'));
    expect(body.launchMode).toBe('background-tray-bundle');
  });

  windowsIt('runs portable bootstrap in a relocated root without starting services', () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'agent-core-bootstrap-relocated-'));
    const localAppData = mkdtempSync(path.join(os.tmpdir(), 'agent-core-bootstrap-localapp-'));
    try {
      const windowsDir = path.join(temp, 'scripts', 'windows');
      mkdirSync(windowsDir, { recursive: true });
      const relocated = path.join(windowsDir, 'agent-core-launcher.ps1');
      copyFileSync(launcherPath, relocated);
      copyFileSync(bootstrapPath, path.join(windowsDir, 'agent-core-bootstrap.ps1'));
      copyFileSync(path.join(path.dirname(launcherPath), 'agent-core-allowlist.ps1'), path.join(windowsDir, 'agent-core-allowlist.ps1'));
      const result = spawnSync('powershell.exe', ['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',relocated,'-BootstrapOnly'], {
        encoding: 'utf8',
        env: { ...process.env, AGENT_CORE_NODE_EXE: process.execPath, AGENT_CORE_NPM_EXE: path.join(path.dirname(process.execPath), 'npm.cmd'), AGENT_CORE_TUNNEL_EXE: process.execPath, AGENT_CORE_LOCAL_APP_DATA_ROOT: localAppData, AGENT_CORE_BOOTSTRAP_NO_DOWNLOAD: '1' },
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const body = JSON.parse(result.stdout.trim());
      expect(path.resolve(body.root)).toBe(path.resolve(temp));
      expect(path.resolve(body.nodeExe)).toBe(path.resolve(process.execPath));
      expect(path.resolve(body.tunnelExe)).toBe(path.resolve(process.execPath));
      expect(path.resolve(readFileSync(path.join(localAppData, 'AgentCore', 'root.txt'), 'utf8').trim())).toBe(path.resolve(temp));
    } finally {
      rmSync(temp, { recursive: true, force: true });
      rmSync(localAppData, { recursive: true, force: true });
    }
  });

  windowsIt('rebinds root-derived paths when the launcher directory is relocated', () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'agent-core-relocated-'));
    try {
      const windowsDir = path.join(temp, 'scripts', 'windows');
      mkdirSync(windowsDir, { recursive: true });
      const relocated = path.join(windowsDir, 'agent-core-launcher.ps1');
      copyFileSync(launcherPath, relocated);
      copyFileSync(path.join(windowsDir === path.dirname(launcherPath) ? windowsDir : path.dirname(launcherPath), 'agent-core-allowlist.ps1'), path.join(windowsDir, 'agent-core-allowlist.ps1'));
      const result = runContract(relocated, {
        AGENT_CORE_TUNNEL_EXE: process.execPath,
        AGENT_CORE_NODE_EXE: process.execPath,
      });
      expect(result.status).toBe(0);
      const body = JSON.parse(result.stdout.trim());
      expect(path.resolve(body.root)).toBe(temp);
      expect(path.resolve(body.dataDir)).toBe(path.join(temp, 'runtime', 'data'));
      expect(path.resolve(body.tunnelProfile)).toBe(path.join(temp, 'tunnel-client', 'agent-core.yaml'));
      expect(path.resolve(body.tunnelExe)).toBe(path.resolve(process.execPath));
      expect(path.resolve(body.nodeExe)).toBe(path.resolve(process.execPath));
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe('Agent Core portable tunnel profile', () => {
  it('keeps tunnel secret references portable across project moves', () => {
    const templatePath = path.join(repoRoot, 'tunnel-client', 'agent-core.example.yaml');
    expect(existsSync(templatePath)).toBe(true);

    const profiles = [readFileSync(templatePath, 'utf8')];
    const operatorProfilePath = path.join(repoRoot, 'tunnel-client', 'agent-core.yaml');
    if (existsSync(operatorProfilePath)) {
      profiles.push(readFileSync(operatorProfilePath, 'utf8'));
    }

    for (const profile of profiles) {
      expect(profile).toContain('file:secrets/control-plane-api-key-restored.txt');
      expect(profile).not.toMatch(/file:[A-Z]:[\\/]/i);
    }
  });
});

