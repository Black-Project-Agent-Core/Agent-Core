import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ExecutionService } from '../src/execution/service.js';
import {
  ExecutionRuntimeLease,
  ExecutionRuntimeLeaseError,
  assertExecutionRuntimeStopped,
  executionRuntimeLeasePath,
} from '../src/execution/runtime-lease.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];
const windowsIt = process.platform === 'win32' ? it : it.skip;

/**
 * Reproduce the condition a moved project folder leaves behind: the lease file is readable and
 * writable, but its directory does not grant delete-child, so it cannot be unlinked. Restricting
 * the directory rather than the file matches production, where deletion is refused by the parent's
 * inherited ACL rather than by a deny ACE on the file.
 */
function currentAccount(): string {
  const probe = spawnSync('whoami.exe', { encoding: 'utf8' });
  return probe.status === 0 ? probe.stdout.trim() : '';
}

function denyDeleteChild(directory: string, account: string): boolean {
  const args = [directory, '/inheritance:r', '/grant', `${account}:(OI)(CI)(R,W)`];
  return spawnSync('icacls.exe', args, { encoding: 'utf8' }).status === 0;
}

function resetAcl(directory: string): void {
  spawnSync('icacls.exe', [directory, '/reset', '/t'], { encoding: 'utf8' });
}

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

async function fixture(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-execution-lease-${label}-`));
  roots.push(root);
  const stateRoot = path.join(root, 'runtime', 'execution', 'state');
  const leasePath = executionRuntimeLeasePath(stateRoot);
  await mkdir(path.dirname(leasePath), { recursive: true });
  return { root, stateRoot, leasePath };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('execution runtime lease', () => {
  it('fails closed while a live execution runtime owns the database', async () => {
    const f = await fixture('live');
    const first = await ExecutionRuntimeLease.acquire(f.stateRoot);
    await expect(ExecutionRuntimeLease.acquire(f.stateRoot)).rejects.toMatchObject<Partial<ExecutionRuntimeLeaseError>>({
      code: 'EXECUTION_RUNTIME_ACTIVE',
    });
    await expect(assertExecutionRuntimeStopped(f.stateRoot)).rejects.toMatchObject({ code: 'EXECUTION_RUNTIME_ACTIVE' });
    await first.release();
    await expect(assertExecutionRuntimeStopped(f.stateRoot)).resolves.toBeUndefined();
  });

  it('reclaims a stale dead-pid lease and replaces it with the current owner', async () => {
    const f = await fixture('stale');
    await writeFile(f.leasePath, `${JSON.stringify({ pid: 2_147_000_000, token: 'stale-token', startedAt: 1 })}\n`, { encoding: 'utf8', flag: 'wx' });
    const lease = await ExecutionRuntimeLease.acquire(f.stateRoot);
    const record = JSON.parse(await readFile(f.leasePath, 'utf8')) as Record<string, unknown>;
    expect(record.pid).toBe(process.pid);
    expect(record.token).toBe(lease.token);
    await lease.release();
  });

  windowsIt('reclaims a stale lease that cannot be unlinked instead of stranding the runtime', async () => {
    const f = await fixture('undeletable');
    const leaseDir = path.dirname(f.leasePath);
    await writeFile(f.leasePath, `${JSON.stringify({ pid: 2_147_000_000, token: 'stale-token', startedAt: 1 })}
`, { encoding: 'utf8', flag: 'wx' });
    const account = currentAccount();
    expect(account, 'whoami must resolve the current account for this fixture').not.toBe('');
    expect(denyDeleteChild(leaseDir, account), 'icacls must restrict the lease directory').toBe(true);
    try {
      // The fixture only means anything if the lease truly cannot be unlinked.
      await expect(rm(f.leasePath)).rejects.toBeTruthy();

      const lease = await ExecutionRuntimeLease.acquire(f.stateRoot);
      const record = JSON.parse(await readFile(f.leasePath, 'utf8')) as Record<string, unknown>;
      expect(record.pid).toBe(process.pid);
      expect(record.token).toBe(lease.token);

      // Shutdown must not fail just because the record still cannot be unlinked.
      await expect(lease.release()).resolves.toBeUndefined();
      await expect(assertExecutionRuntimeStopped(f.stateRoot)).resolves.toBeUndefined();
    } finally {
      resetAcl(leaseDir);
    }
  });

  it('does not remove a lease file if ownership token changed before release', async () => {
    const f = await fixture('foreign-token');
    const lease = await ExecutionRuntimeLease.acquire(f.stateRoot);
    await writeFile(f.leasePath, `${JSON.stringify({ pid: process.pid, token: 'foreign-token', startedAt: Date.now() })}\n`, 'utf8');
    await lease.release();
    expect(await exists(f.leasePath)).toBe(true);
  });

  it('ExecutionService owns the lease only while the service is open', async () => {
    const f = await fixture('service');
    const defaults = loadConfig({}, f.root).execution;
    const service = new ExecutionService({
      ...defaults,
      stateRoot: f.stateRoot,
      logRoot: path.join(f.root, 'runtime', 'execution', 'runs'),
    }, new WorkspacePolicy([f.root]));

    await service.open();
    expect(await exists(f.leasePath)).toBe(true);
    await expect(assertExecutionRuntimeStopped(f.stateRoot)).rejects.toMatchObject({ code: 'EXECUTION_RUNTIME_ACTIVE' });
    await service.close();
    expect(await exists(f.leasePath)).toBe(false);
    await expect(assertExecutionRuntimeStopped(f.stateRoot)).resolves.toBeUndefined();
  });
});
