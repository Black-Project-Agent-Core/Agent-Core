import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

interface ExecutionRuntimeLeaseRecord {
  pid: number;
  token: string;
  startedAt: number;
}

export class ExecutionRuntimeLeaseError extends Error {
  constructor(public readonly code: 'EXECUTION_RUNTIME_ACTIVE' | 'EXECUTION_RUNTIME_LEASE_INVALID', message: string) {
    super(message);
    this.name = 'ExecutionRuntimeLeaseError';
  }
}

export function executionRuntimeLeasePath(stateRoot: string): string {
  return path.join(path.resolve(stateRoot), 'leases', 'runtime.lease.json');
}

function validRecord(value: unknown): value is ExecutionRuntimeLeaseRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Number.isSafeInteger(record.pid) && Number(record.pid) > 0
    && typeof record.token === 'string' && record.token.length >= 8
    && typeof record.startedAt === 'number' && Number.isFinite(record.startedAt) && record.startedAt >= 0;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readRecord(leasePath: string): Promise<ExecutionRuntimeLeaseRecord | null> {
  try {
    const text = await readFile(leasePath, 'utf8');
    // An empty file is a released lease: release() truncates when it may not unlink the record.
    if (!text.trim()) return null;
    const parsed = JSON.parse(text) as unknown;
    if (!validRecord(parsed)) throw new ExecutionRuntimeLeaseError('EXECUTION_RUNTIME_LEASE_INVALID', 'Execution runtime lease is malformed');
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

const UNLINK_BLOCKED_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

function isUnlinkBlocked(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return Boolean(code && UNLINK_BLOCKED_CODES.has(code));
}

/**
 * Drop a lease whose holder is gone.
 *
 * Unlinking is preferred, because the caller then re-runs the atomic `wx` create. When the file
 * cannot be unlinked the runtime must still recover: after the project folder moves between
 * machines, drives or Windows accounts, a lease written by an account that no longer resolves
 * keeps an inherited ACL granting `BUILTIN\Users` write but not delete. Refusing to continue there
 * strands the execution runtime permanently on a record whose process died long ago.
 *
 * The fallback claims the lease by overwriting it in place and reading it back, so two racing
 * claimers cannot both believe they won: the last writer observes its own token, the other does
 * not and retries.
 *
 * @returns true when this caller now holds the lease under `replacement`; false when the caller
 * should retry the atomic create.
 */
/**
 * Best-effort removal of a stale lease for callers that only need it gone, never held. A lease that
 * cannot be unlinked is left in place: its pid is already dead, so `acquire()` reclaims it later.
 */
async function dropStaleLease(leasePath: string, expected: ExecutionRuntimeLeaseRecord): Promise<void> {
  const latest = await readRecord(leasePath);
  if (!latest) return;
  if (latest.pid !== expected.pid || latest.token !== expected.token || latest.startedAt !== expected.startedAt) {
    return;
  }
  try {
    await rm(leasePath, { force: true });
  } catch (error) {
    if (!isUnlinkBlocked(error)) throw error;
  }
}

async function reclaimStaleLease(
  leasePath: string,
  expected: ExecutionRuntimeLeaseRecord | null,
  replacement: ExecutionRuntimeLeaseRecord,
): Promise<boolean> {
  const latest = await readRecord(leasePath);
  if (Boolean(latest) !== Boolean(expected)) return false;
  if (latest && expected && (latest.pid !== expected.pid || latest.token !== expected.token || latest.startedAt !== expected.startedAt)) {
    return false;
  }
  try {
    await rm(leasePath, { force: true });
    return false;
  } catch (error) {
    if (!isUnlinkBlocked(error)) throw error;
  }

  const handle = await open(leasePath, 'r+');
  try {
    await handle.truncate(0);
    await handle.write(`${JSON.stringify(replacement)}\n`, 0, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  const confirmed = await readRecord(leasePath);
  return confirmed?.token === replacement.token;
}

export class ExecutionRuntimeLease {
  private released = false;

  private constructor(
    readonly stateRoot: string,
    readonly leasePath: string,
    readonly token: string,
  ) {}

  static async acquire(stateRoot: string): Promise<ExecutionRuntimeLease> {
    const resolvedStateRoot = path.resolve(stateRoot);
    const leasePath = executionRuntimeLeasePath(resolvedStateRoot);
    await mkdir(path.dirname(leasePath), { recursive: true });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = randomUUID();
      const record: ExecutionRuntimeLeaseRecord = { pid: process.pid, token, startedAt: Date.now() };
      try {
        const handle = await open(leasePath, 'wx');
        try {
          await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        return new ExecutionRuntimeLease(resolvedStateRoot, leasePath, token);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const current = await readRecord(leasePath);
        if (current && pidAlive(current.pid)) {
          throw new ExecutionRuntimeLeaseError(
            'EXECUTION_RUNTIME_ACTIVE',
            `Execution runtime is active for ${resolvedStateRoot}`,
          );
        }
        if (await reclaimStaleLease(leasePath, current, record)) {
          return new ExecutionRuntimeLease(resolvedStateRoot, leasePath, token);
        }
      }
    }
    throw new ExecutionRuntimeLeaseError('EXECUTION_RUNTIME_ACTIVE', `Execution runtime lease could not be acquired for ${resolvedStateRoot}`);
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    const current = await readRecord(this.leasePath).catch(() => null);
    if (!current || current.token !== this.token || current.pid !== process.pid) return;
    try {
      await rm(this.leasePath, { force: true });
      return;
    } catch (error) {
      if (!isUnlinkBlocked(error)) throw error;
    }
    // The record may be written but not unlinked. Leaving our own pid behind would make the very
    // next acquire() - and assertExecutionRuntimeStopped - report a runtime that is already gone,
    // so the file is emptied instead; readRecord() treats that as no holder.
    const handle = await open(this.leasePath, 'r+');
    try {
      await handle.truncate(0);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

export async function assertExecutionRuntimeStopped(stateRoot: string): Promise<void> {
  const leasePath = executionRuntimeLeasePath(stateRoot);
  const current = await readRecord(leasePath);
  if (!current) return;
  if (pidAlive(current.pid)) {
    throw new ExecutionRuntimeLeaseError('EXECUTION_RUNTIME_ACTIVE', `Execution runtime is active for ${path.resolve(stateRoot)}`);
  }
  await dropStaleLease(leasePath, current);
}
