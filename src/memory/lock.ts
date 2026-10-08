import { lstat, mkdir, readFile, unlink } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { lock as acquireProperLock } from 'proper-lockfile';

interface LegacyLockOwner {
  pid: number;
  token: string;
  hostname: string;
  acquiredAt: string;
}

const STALE_MS = 120_000;
const UPDATE_MS = 15_000;
const RETRY_CAP_MS = 25;

interface MemoryLockLease {
  release: () => Promise<void>;
  compromise: () => Error | null;
}

// proper-lockfile owns cross-process exclusion, but its internal lock table is
// process-global and is not safe for multiple concurrent contenders for the
// same logical lock inside one Node process during stale-lock recovery. A tiny
// per-process queue removes that same-process race while preserving
// proper-lockfile as the cross-process authority.
const localLockTails = new Map<string, Promise<void>>();

function normalizeLocalLockKey(lockPath: string): string {
  const resolved = path.resolve(lockPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

async function acquireLocalLock(lockPath: string): Promise<() => void> {
  const key = normalizeLocalLockKey(lockPath);
  const previous = localLockTails.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  localLockTails.set(key, current);

  await previous;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseCurrent();
    if (localLockTails.get(key) === current) localLockTails.delete(key);
  };
}

function busy(): Error {
  return Object.assign(new Error('Memory store is busy in another process'), {
    code: 'MEMORY_STORE_BUSY',
  });
}

function parseLegacyOwner(raw: string): LegacyLockOwner | null {
  try {
    const value = JSON.parse(raw) as Partial<LegacyLockOwner> & { ownerToken?: string };
    const token = typeof value.token === 'string' ? value.token : value.ownerToken;
    if (typeof value.pid !== 'number'
      || typeof token !== 'string'
      || typeof value.hostname !== 'string'
      || !Number.isFinite(Date.parse(value.acquiredAt ?? ''))) return null;
    return {
      pid: value.pid,
      token,
      hostname: value.hostname,
      acquiredAt: value.acquiredAt!,
    };
  } catch {
    return null;
  }
}
function localProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function legacyLockIsBusy(owner: LegacyLockOwner | null, mtimeMs: number): boolean {
  if (owner?.hostname === hostname()) return localProcessAlive(owner.pid);
  const ageBase = owner ? Date.parse(owner.acquiredAt) : mtimeMs;
  return Date.now() - ageBase < STALE_MS;
}

async function prepareLegacyLock(lockPath: string): Promise<void> {
  let info;
  try {
    info = await lstat(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (info.isDirectory()) return;

  let owner: LegacyLockOwner | null = null;
  try { owner = parseLegacyOwner(await readFile(lockPath, 'utf8')); } catch { /* unreadable legacy record */ }
  if (legacyLockIsBusy(owner, info.mtimeMs)) throw busy();

  try {
    await unlink(lockPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (code === 'ENOENT' || code === 'EPERM' || code === 'EISDIR' || code === 'EACCES') return;
    throw error;
  }
}
function compromised(error: Error): Error {
  return Object.assign(new Error('Memory store lock lease was compromised'), {
    code: 'MEMORY_LOCK_COMPROMISED',
    cause: error,
  });
}

async function acquire(lockPath: string, timeoutMs: number): Promise<MemoryLockLease> {
  const deadline = Date.now() + timeoutMs;
  for (let wait = 1;; wait = Math.min(wait * 2, RETRY_CAP_MS)) {
    await prepareLegacyLock(lockPath);
    try {
      let compromiseError: Error | null = null;
      const release = await acquireProperLock(`${lockPath}.target`, {
        realpath: false,
        lockfilePath: lockPath,
        stale: STALE_MS,
        update: UPDATE_MS,
        retries: 0,
        onCompromised: (error) => {
          compromiseError ??= compromised(error);
        },
      });
      return { release, compromise: () => compromiseError };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!['ELOCKED', 'EEXIST', 'EPERM', 'EACCES', 'EBUSY', 'ENOENT', 'ENOTDIR'].includes(code)) {
        throw error;
      }
      if (Date.now() >= deadline) throw busy();
      await delay(wait * (1 + Math.random()));
    }
  }
}

export async function withMemoryProcessLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
  timeoutMs = 5_000,
): Promise<T> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const releaseLocal = await acquireLocalLock(lockPath);
  try {
    const lease = await acquire(lockPath, timeoutMs);
    let completed = false;
    let result!: T;
    let operationError: unknown;
    let releaseError: unknown;
    try {
      result = await operation();
      completed = true;
    } catch (error) {
      operationError = error;
    }
    try {
      await lease.release();
    } catch (error) {
      releaseError = error;
    }
    const compromiseError = lease.compromise();
    if (!completed) throw operationError;
    if (compromiseError) throw compromiseError;
    if (releaseError) throw releaseError;
    return result;
  } finally {
    releaseLocal();
  }
}
