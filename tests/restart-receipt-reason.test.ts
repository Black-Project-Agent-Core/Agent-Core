import { mkdtemp, mkdir, copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

// A restart receipt must say why a run failed. The worker (Restart-Agent-Core.ps1) and the wrapper
// (Invoke-Agent-Core-Restart.ps1) never read each other, so the contract between them is checked here:
// the static tests run everywhere, the behavioural tests need Windows PowerShell.

const WORKER = path.resolve('scripts/windows/Restart-Agent-Core.ps1');
const WRAPPER = path.resolve('scripts/windows/Invoke-Agent-Core-Restart.ps1');
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function scratch() { const root = await mkdtemp(path.join(tmpdir(), 'restart-reason-')); roots.push(root); return root; }
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
// `*>` in Windows PowerShell 5.1 writes UTF-16 with a BOM, which is what the real logs are.
const utf16 = (text: string) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

describe('restart worker and wrapper agree on the final line and the failure line', () => {
  it('the worker always prints a final status line, from the finally block, before it exits', async () => {
    const worker = await readFile(WORKER, 'utf8');
    expect(worker).toMatch(/finally \{[\s\S]*Write-Host \('Selesai: ' \+ \$\(if \(\$exitCode -eq 0\) \{ 'ok' \} else \{ 'gagal' \}\)\)\s*\}\s*exit \$exitCode/);
    expect(worker).toContain('Write-Host "GAGAL: $($_.Exception.Message)"');
  });

  it('the wrapper reads exactly those markers and uses the reason in the receipt', async () => {
    const wrapper = await readFile(WRAPPER, 'utf8');
    expect(wrapper).toContain("StartsWith('GAGAL:'");
    expect(wrapper).toContain("StartsWith('Selesai:'");
    expect(wrapper).toMatch(/finally \{\s*if \(\$null -eq \$workerError\) \{[\s\S]*?Get-WorkerFailureReason[\s\S]*?\$receipt = \[ordered\]@\{/);
    expect(wrapper).toContain('error = $workerError');
  });
});

describe.runIf(process.platform === 'win32')('Get-WorkerFailureReason', () => {
  async function reasons(cases: Array<{ log: Buffer | null; exit: number }>): Promise<string[]> {
    const root = await scratch();
    const lines: string[] = [];
    for (const [index, item] of cases.entries()) {
      const log = path.join(root, `case-${index}.log`);
      if (item.log) await writeFile(log, item.log);
      lines.push(`$r = Get-WorkerFailureReason -LogPath ${q(log)} -ExitCode ${item.exit}`, `Write-Output ('R:' + $(if ($null -eq $r) { 'NULL' } else { $r }))`);
    }
    const runner = path.join(root, 'run.ps1');
    await writeFile(runner, [
      `Set-StrictMode -Version Latest`, `$ErrorActionPreference = 'Stop'`,
      `$ast = [System.Management.Automation.Language.Parser]::ParseFile(${q(WRAPPER)}, [ref]$null, [ref]$null)`,
      `$fn = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-WorkerFailureReason' }, $true)`,
      `if (-not $fn) { throw 'Get-WorkerFailureReason missing' }`, `Invoke-Expression $fn.Extent.Text`, ...lines,
    ].join('\n'));
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', runner], { windowsHide: true, encoding: 'utf8' });
    return out.split(/\r?\n/).filter(l => l.startsWith('R:')).map(l => l.slice(2));
  }

  it('returns the last GAGAL line for a failed run, whatever the log encoding', async () => {
    const got = await reasons([
      { log: utf16('Target: x\nMeminta shutdown normal PID 1...\nGAGAL: Identitas PID 7 (node.exe) tidak terbaca.\nSelesai: gagal\n'), exit: 1 },
      { log: utf16('GAGAL: pertama\nGAGAL: kedua\nSelesai: gagal\n'), exit: 1 },
      { log: Buffer.from('GAGAL: tanpa BOM\nSelesai: gagal\n', 'utf8'), exit: 1 },
    ]);
    expect(got).toEqual(['Identitas PID 7 (node.exe) tidak terbaca.', 'kedua', 'tanpa BOM']);
  });

  it('says so when a failed run ended without a final line, without a reason, or without a log (the 2026-10-17 shape)', async () => {
    const got = await reasons([
      { log: utf16('Target: x\nMeminta shutdown normal PID 21684...\nMembuka Agent Core satu kali...\n'), exit: 1 },
      { log: utf16('Membuka Agent Core satu kali...\nSelesai: gagal\n'), exit: 1 },
      { log: utf16('GAGAL: \nSelesai: gagal\n'), exit: 1 },
      { log: null, exit: 1 },
    ]);
    expect(got).toEqual([
      'worker berakhir tanpa baris akhir (exit 1)',
      'worker melaporkan gagal tanpa baris GAGAL (exit 1)',
      'worker melaporkan GAGAL tanpa pesan (exit 1)',
      'worker berakhir tanpa baris akhir (exit 1)',
    ]);
  });

  it('returns nothing for a successful run', async () => {
    expect(await reasons([{ log: utf16('Satu jendela Agent Core terbuka (PID 9).\nSelesai: ok\n'), exit: 0 }])).toEqual(['NULL']);
  });
});

describe.runIf(process.platform === 'win32')('a real failing worker run feeds a real reason to the wrapper', () => {
  it('ends with GAGAL and Selesai: gagal, and the wrapper helper turns that log into the reason', async () => {
    // A copy of the worker inside a throwaway root that has no Agent Core.exe: it fails before touching anything.
    const root = await scratch();
    await mkdir(path.join(root, 'scripts', 'windows'), { recursive: true });
    const worker = path.join(root, 'scripts', 'windows', 'Restart-Agent-Core.ps1');
    await copyFile(WORKER, worker);
    const log = path.join(root, 'worker.log');
    const runner = path.join(root, 'run.ps1');
    await writeFile(runner, [
      `Set-StrictMode -Version Latest`,
      `& powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ${q(worker)} *> ${q(log)}`,
      `$code = $LASTEXITCODE`,
      `$ast = [System.Management.Automation.Language.Parser]::ParseFile(${q(WRAPPER)}, [ref]$null, [ref]$null)`,
      `$fn = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Get-WorkerFailureReason' }, $true)`,
      `Invoke-Expression $fn.Extent.Text`,
      `Write-Output ('EXIT:' + $code)`,
      `Write-Output ('REASON:' + (Get-WorkerFailureReason -LogPath ${q(log)} -ExitCode $code))`,
    ].join('\n'));
    const run = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', runner], { windowsHide: true, encoding: 'utf8' });
    expect(run.stdout).toContain('EXIT:1');
    expect(run.stdout).toMatch(/REASON:EXE tidak ditemukan:/);
    const lines = (await readFile(log)).toString('utf16le').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    expect(lines.at(-1)).toBe('Selesai: gagal');
    expect(lines.some(l => l.startsWith('GAGAL: EXE tidak ditemukan:'))).toBe(true);
  });
});
