import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

async function fixture(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-execution-lease-${label}-`));
  roots.push(root);
  const dbPath = path.join(root, 'runtime', 'execution', 'execution.sqlite');
  await mkdir(path.dirname(dbPath), { recursive: true });
  return { root, dbPath, leasePath: executionRuntimeLeasePath(dbPath) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('execution runtime lease', () => {
  it('fails closed while a live execution runtime owns the database', async () => {
    const f = await fixture('live');
    const first = await ExecutionRuntimeLease.acquire(f.dbPath);
    await expect(ExecutionRuntimeLease.acquire(f.dbPath)).rejects.toMatchObject<Partial<ExecutionRuntimeLeaseError>>({
      code: 'EXECUTION_RUNTIME_ACTIVE',
    });
    await expect(assertExecutionRuntimeStopped(f.dbPath)).rejects.toMatchObject({ code: 'EXECUTION_RUNTIME_ACTIVE' });
    await first.release();
    await expect(assertExecutionRuntimeStopped(f.dbPath)).resolves.toBeUndefined();
  });

  it('reclaims a stale dead-pid lease and replaces it with the current owner', async () => {
    const f = await fixture('stale');
    await writeFile(f.leasePath, `${JSON.stringify({ pid: 2_147_000_000, token: 'stale-token', startedAt: 1 })}\n`, { encoding: 'utf8', flag: 'wx' });
    const lease = await ExecutionRuntimeLease.acquire(f.dbPath);
    const record = JSON.parse(await readFile(f.leasePath, 'utf8')) as Record<string, unknown>;
    expect(record.pid).toBe(process.pid);
    expect(record.token).toBe(lease.token);
    await lease.release();
  });

  it('does not remove a lease file if ownership token changed before release', async () => {
    const f = await fixture('foreign-token');
    const lease = await ExecutionRuntimeLease.acquire(f.dbPath);
    await writeFile(f.leasePath, `${JSON.stringify({ pid: process.pid, token: 'foreign-token', startedAt: Date.now() })}\n`, 'utf8');
    await lease.release();
    expect(await exists(f.leasePath)).toBe(true);
  });

  it('ExecutionService owns the lease only while the service is open', async () => {
    const f = await fixture('service');
    const defaults = loadConfig({}, f.root).execution;
    const service = new ExecutionService({
      ...defaults,
      dbPath: f.dbPath,
      logRoot: path.join(f.root, 'runtime', 'execution', 'runs'),
    }, new WorkspacePolicy([f.root]));

    await service.open();
    expect(await exists(f.leasePath)).toBe(true);
    await expect(assertExecutionRuntimeStopped(f.dbPath)).rejects.toMatchObject({ code: 'EXECUTION_RUNTIME_ACTIVE' });
    await service.close();
    expect(await exists(f.leasePath)).toBe(false);
    await expect(assertExecutionRuntimeStopped(f.dbPath)).resolves.toBeUndefined();
  });
});
