import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function runBash(script: string, env: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', script], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('Codespaces root lifecycle lock', () => {
  it('serializes competing root repair lifecycles and releases cleanly', async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'agent-core-root-lock-'));
    const lockFile = path.join(temp, 'lifecycle.lock');
    const env = { AGENT_CORE_CODESPACE_LIFECYCLE_LOCK_FILE: lockFile };

    const holder = runBash(`
      source scripts/codespace/common.sh
      acquire_codespace_lifecycle_lock 1
      printf 'holder-acquired\\n'
      sleep 0.4
    `, env);

    await new Promise((resolve) => setTimeout(resolve, 80));
    const blocked = await runBash(`
      source scripts/codespace/common.sh
      acquire_codespace_lifecycle_lock 0.05
    `, env);
    expect(blocked.code).not.toBe(0);

    const held = await holder;
    expect(held.code).toBe(0);
    expect(held.stdout).toContain('holder-acquired');

    const afterRelease = await runBash(`
      source scripts/codespace/common.sh
      acquire_codespace_lifecycle_lock 0.5
      printf 'reacquired\\n'
    `, env);
    expect(afterRelease.code).toBe(0);
    expect(afterRelease.stdout).toContain('reacquired');
  });

  it('does not leak the root lifecycle lock into detached long-lived children', async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), 'agent-core-root-lock-child-'));
    const lockFile = path.join(temp, 'lifecycle.lock');
    const env = { AGENT_CORE_CODESPACE_LIFECYCLE_LOCK_FILE: lockFile };

    const launcher = await runBash(`
      source scripts/codespace/common.sh
      acquire_codespace_lifecycle_lock 1
      run_without_codespace_lifecycle_lock bash -c 'sleep 0.6 >/dev/null 2>&1 &'
      printf 'launcher-exit\n'
    `, env);
    expect(launcher.code).toBe(0);

    const contender = await runBash(`
      source scripts/codespace/common.sh
      acquire_codespace_lifecycle_lock 0.15
      printf 'lock-free\n'
    `, env);
    expect(contender.code).toBe(0);
    expect(contender.stdout).toContain('lock-free');
  });


  it('preserves child stderr while dropping the inherited lock descriptor', async () => {
    const result = await runBash(`
      source scripts/codespace/common.sh
      run_without_codespace_lifecycle_lock bash -c 'printf "child-error\\n" >&2'
    `);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('child-error');
  });

});
