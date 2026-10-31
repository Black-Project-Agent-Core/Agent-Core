import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const RETRYABLE_REPLACE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const DEFAULT_REPLACE_ATTEMPTS = 10;
const DEFAULT_RETRY_DELAY_MS = 50;

export interface OwnedAtomicWriteOptions {
  mode?: number;
  replaceAttempts?: number;
  retryDelayMs?: number;
  /** Revalidate the caller's source and destination immediately before every replace attempt. */
  beforeReplace?: () => Promise<void> | void;
}

async function assertOwnedDestination(destination: string): Promise<void> {
  try {
    const stats = await lstat(destination);
    if (stats.isSymbolicLink()) {
      throw new Error(`ATOMIC_OWNED_FILE_SYMLINK_REFUSED: ${destination}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
}

async function replaceWithRetry(
  temporary: string,
  destination: string,
  attempts: number,
  delayMs: number,
  beforeReplace?: () => Promise<void> | void,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await beforeReplace?.();
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !RETRYABLE_REPLACE_CODES.has(code) || attempt === attempts - 1) throw error;
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export async function writeOwnedFileAtomic(
  destination: string,
  data: string | Uint8Array,
  options: OwnedAtomicWriteOptions = {},
): Promise<void> {
  const resolved = path.resolve(destination);
  const directory = path.dirname(resolved);
  const mode = options.mode ?? 0o600;
  const attempts = Math.max(1, options.replaceAttempts ?? DEFAULT_REPLACE_ATTEMPTS);
  const delayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);

  await mkdir(directory, { recursive: true });
  await assertOwnedDestination(resolved);

  const temporary = path.join(
    directory,
    `.${path.basename(resolved)}.tmp-${process.pid}-${randomUUID()}`,
  );

  let handle;
  try {
    handle = await open(temporary, 'wx', mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = undefined;

    if (process.platform !== 'win32') {
      await chmod(temporary, mode);
    }
    await replaceWithRetry(temporary, resolved, attempts, delayMs, options.beforeReplace);
    try {
      const directoryHandle = await open(directory, 'r');
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    } catch {
      // Directory fsync is best-effort and not consistently supported on Windows.
    }
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
