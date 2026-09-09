import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const windowsDir = path.join(repoRoot, 'scripts', 'windows');
const helperPath = path.join(windowsDir, 'agent-core-allowlist.ps1');
const nativeControllerPath = path.join(repoRoot, 'SubProject', 'Agent-Code', 'src-tauri', 'src', 'agent_core.rs');
const windowsIt = process.platform === 'win32' ? it : it.skip;

function psLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

describe('Agent Core Windows filesystem allow-list', () => {
  windowsIt('keeps Agent Core root implicit while ignoring comments, relative entries, separators, and case-insensitive duplicates', () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'agent-core-allowlist-'));
    try {
      const allowList = path.join(temp, 'allow.txt');
      writeFileSync(allowList, [
        '# operator choices',
        '',
        'C:\\',
        'c:\\',
        'relative\\folder',
        'D:\\one;D:\\two',
        'F:\\',
      ].join('\r\n'), 'utf8');

      const command = [
        "$WarningPreference='SilentlyContinue'",
        `. ${psLiteral(helperPath)}`,
        `$roots = @(Resolve-AgentCoreAllowedRoots -Root ${psLiteral(repoRoot)} -AllowListPath ${psLiteral(allowList)})`,
        '$roots | ConvertTo-Json -Compress',
      ].join('; ');
      const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const roots = JSON.parse(result.stdout.trim()) as string[];
      expect(roots.map((item) => path.resolve(item))).toEqual([
        path.resolve(repoRoot),
        path.resolve('C:\\'),
        path.resolve('F:\\'),
      ]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('lets the Agent Code native controller own allow-list injection with no launcher or tray script left to wire', () => {
    const controller = readFileSync(nativeControllerPath, 'utf8');
    expect(controller).toContain('Agent-Core-Allowlist.txt');
    expect(controller).toContain('fn resolve_allowed_roots');
    expect(controller).toContain('AGENT_CORE_ALLOWED_ROOTS');
    expect(controller).not.toMatch(/agent-core-launcher\.ps1|agent-core-tray\.ps1/i);

    for (const removed of [
      'agent-core-launcher.ps1',
      'agent-core-tray.ps1',
      'launch-agent-core-hidden.vbs',
      'install-agent-core-autostart.ps1',
      'uninstall-agent-core-autostart.ps1',
      'Install-Agent-Core-Tray.bat',
      'Uninstall-Agent-Core-Tray.bat',
    ]) {
      expect(existsSync(path.join(windowsDir, removed)), `${removed} must not exist`).toBe(false);
    }
  });
});
