import { constants as fsConstants, type Stats } from 'node:fs';
import { open, stat, lstat, type FileHandle } from 'node:fs/promises';
import { assertSameFileIdentity } from '../../../security/file-identity.js';
import { assertReadActive, readCancellationError, runWithCallerAbortableTimeout } from '../withTimeout.js';

const DEFAULT_OPEN_TIMEOUT_MS = 5_000;
const MAX_ACTIVE_OPENS = 8;
const MAX_WAITERS = 128;
const MAX_REFUSAL_REPORTS_PER_KIND = 3;

let activeOpens = 0;
const waiters: Array<{
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  signal?: AbortSignal;
  onAbort?: () => void;
}> = [];
const refusalCounts = new Map<string, number>();

function classify(stats: Stats): string {
  if (stats.isFile()) return 'file';
  if (stats.isDirectory()) return 'directory';
  if (stats.isFIFO()) return 'fifo';
  if (stats.isSocket()) return 'socket';
  if (stats.isCharacterDevice()) return 'character-device';
  if (stats.isBlockDevice()) return 'block-device';
  if (stats.isSymbolicLink()) return 'symlink';
  return 'other';
}

function reportRefusal(kind: string): void {
  const count = (refusalCounts.get(kind) ?? 0) + 1;
  refusalCounts.set(kind, count);
  if (count <= MAX_REFUSAL_REPORTS_PER_KIND) {
    console.warn(`[safe-regular-file] refused non-regular path kind=${kind} count=${count}`);
  }
}

function refusal(kind: string): Error {
  reportRefusal(kind);
  const error = new Error(`SAFE_REGULAR_FILE_REFUSED: kind=${kind}`) as NodeJS.ErrnoException;
  error.code = 'ENOTFILE';
  return error;
}

function openTimeout(timeoutMs: number): Error {
  const error = new Error(`SAFE_REGULAR_FILE_OPEN_TIMEOUT: ${timeoutMs}ms`) as NodeJS.ErrnoException;
  error.code = 'ETIMEDOUT';
  return error;
}

function releaseSlot(): void {
  while (waiters.length) {
    const next = waiters.shift()!;
    clearTimeout(next.timer);
    if (next.onAbort) next.signal?.removeEventListener('abort', next.onAbort);
    if (next.signal?.aborted) { next.reject(readCancellationError()); continue; }
    next.resolve(releaseSlot);
    return;
  }
  activeOpens = Math.max(0, activeOpens - 1);
}

async function acquireSlot(timeoutMs: number, signal?: AbortSignal): Promise<() => void> {
  assertReadActive(signal);
  if (activeOpens < MAX_ACTIVE_OPENS) {
    activeOpens += 1;
    return releaseSlot;
  }
  if (waiters.length >= MAX_WAITERS) {
    throw new Error('SAFE_REGULAR_FILE_OPEN_BUDGET_EXHAUSTED');
  }
  return new Promise<() => void>((resolve, reject) => {
    const waiter = {
      resolve, reject, signal,
      onAbort: undefined as (() => void) | undefined,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) { waiters.splice(index, 1);
          if (waiter.onAbort) signal?.removeEventListener('abort', waiter.onAbort);
          reject(openTimeout(timeoutMs)); }
      }, timeoutMs),
    };
    waiter.timer.unref?.();
    waiters.push(waiter);
    if (signal) {
      waiter.onAbort = () => {
        const i = waiters.indexOf(waiter);
        if (i >= 0) { waiters.splice(i, 1); clearTimeout(waiter.timer);
          signal.removeEventListener('abort', waiter.onAbort!); reject(readCancellationError()); }
      };
      signal.addEventListener('abort', waiter.onAbort, { once: true });
      if (signal.aborted) waiter.onAbort();
    }
  });
}

export interface RegularFileOpenOptions {
  timeoutMs?: number;
  followSymlinks?: boolean;
  signal?: AbortSignal;
}

export interface GuardedRegularFile {
  handle: FileHandle;
  stats: Stats;
  close(): Promise<void>;
}

export async function openRegularFile(
  filePath: string,
  options: RegularFileOpenOptions = {},
): Promise<GuardedRegularFile> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
  const noFollow = options.followSymlinks === false;
  assertReadActive(options.signal);
  const pre = noFollow ? await lstat(filePath) : await stat(filePath);
  const preIdentity = noFollow ? await lstat(filePath, { bigint: true }) : undefined;
  if (!pre.isFile()) throw refusal(classify(pre));

  const release = await acquireSlot(timeoutMs, options.signal);
  try { assertReadActive(options.signal); } catch (error) { release(); throw error; }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NONBLOCK ?? 0);
  const openPromise = open(filePath, flags);

  let timer: NodeJS.Timeout | undefined;
  let openedHandle: FileHandle | undefined;
  try {
    openedHandle = await runWithCallerAbortableTimeout(
      () => openPromise, timeoutMs, 'Safe regular-file open', options.signal);

    if (timer) clearTimeout(timer);
    const openedStats = await openedHandle.stat();
    assertReadActive(options.signal);
    if (!openedStats.isFile()) throw refusal(classify(openedStats));

    if (noFollow) {
      const openedIdentity = await openedHandle.stat({ bigint: true });
      const post = await lstat(filePath);
      const postIdentity = await lstat(filePath, { bigint: true });
      if (!post.isFile()) throw refusal(classify(post));
      assertSameFileIdentity(preIdentity!, openedIdentity, filePath);
      assertSameFileIdentity(openedIdentity, postIdentity, filePath);
    }

    const handle = openedHandle;
    openedHandle = undefined;
    let closed = false;
    return {
      handle,
      stats: openedStats,
      async close() {
        if (closed) return;
        closed = true;
        try {
          await handle.close();
        } finally {
          release();
        }
      },
    };
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (!openedHandle && ['ETIMEDOUT', 'ABORT_ERR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
      void openPromise.then(async handle => {
        try { await handle.close(); } finally { release(); }
      }, () => release());
      throw error;
    }
    if (openedHandle) await openedHandle.close().catch(() => undefined);
    release();
    throw error;
  }
}

export async function assertRegularFile(
  filePath: string,
  options: RegularFileOpenOptions = {},
): Promise<Stats> {
  const guarded = await openRegularFile(filePath, options);
  try {
    return guarded.stats;
  } finally {
    await guarded.close();
  }
}

export async function readRegularFileBounded(
  filePath: string,
  maxBytes: number,
  options: RegularFileOpenOptions = {},
): Promise<{ buffer: Buffer; size: number; truncated: boolean }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('SAFE_REGULAR_FILE_MAX_BYTES_INVALID');
  const guarded = await openRegularFile(filePath, options);
  try {
    const size = guarded.stats.size;
    const readLength = Math.min(size, maxBytes + 1);
    const buffer = Buffer.alloc(readLength);
    assertReadActive(options.signal);
    const { bytesRead } = await guarded.handle.read(buffer, 0, readLength, 0);
    assertReadActive(options.signal);
    const truncated = bytesRead > maxBytes || size > maxBytes;
    return {
      buffer: buffer.subarray(0, Math.min(bytesRead, maxBytes)),
      size,
      truncated,
    };
  } finally {
    await guarded.close();
  }
}

export function regularFileGuardState(): { activeOpens: number; waiting: number } {
  return { activeOpens, waiting: waiters.length };
}
