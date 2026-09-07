import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..');
const windowsDir = path.join(repoRoot, 'scripts', 'windows');
const helperPath = path.join(windowsDir, 'agent-core-allowlist.ps1');
const launcherPath = path.join(windowsDir, 'agent-core-launcher.ps1');
const trayPath = path.join(windowsDir, 'agent-core-tray.ps1');
const windowsIt = process.platform === 'win32' ? it : it.skip;

function psLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

describe('Agent Core Windows filesystem allow-list', () => {
  windowsIt('keeps Agent Core root implicit while ignoring comments, relative entries, and case-insensitive duplicates', () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'agent-core-allowlist-'));
    try {
      const allowList = path.join(temp, 'allow.txt');
      writeFileSync(allowList, [
        '# operator choices',
        '',
        'C:\\',
        'c:\\',
        'relative\\folder',
        'F:\\',
      ].join('\r\n'), 'utf8');

      const command = [
        "$WarningPreference='SilentlyContinue'",
        `. ${psLiteral(helperPath)}`,
        `$roots = @(Resolve-AgentCoreAllowedRoots -Root ${psLiteral(repoRoot)} -AllowListPath ${psLiteral(allowList)})`,
        '$roots | ConvertTo-Json -Compress',
      ].join('; ');
      const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
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

  it('wires launcher and tray to the same editable allow-list resolver', () => {
    const launcher = readFileSync(launcherPath, 'utf8');
    const tray = readFileSync(trayPath, 'utf8');
    for (const source of [launcher, tray]) {
      expect(source).toContain('agent-core-allowlist.ps1');
      expect(source).toContain('Agent-Core-Allowlist.txt');
      expect(source).toContain('Resolve-AgentCoreAllowedRoots');
    }
    expect(launcher).not.toMatch(/AGENT_CORE_ALLOWED_ROOTS\s*=\s*\$root\b/);
    expect(tray).not.toMatch(/AGENT_CORE_ALLOWED_ROOTS\s*=\s*\[string\]\$Config\.root\b/);
  });
});
