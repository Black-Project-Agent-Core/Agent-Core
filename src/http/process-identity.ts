import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { boundedHealthProbe } from './health.js';

export interface ProcessIdentity {
  pid: number;
  startedAt: string;
  uptimeSeconds: number;
  /** Entry script relative to the project root, or null when it lives outside it. */
  entry: string | null;
}

export type BuildFreshness =
  | { distNewestModifiedAt: string; stale: boolean }
  /** Unknown is not fresh: the scan failed or there is no dist to compare. */
  | { stale: null; issue: string };

const MAX_SCANNED_FILES = 20_000;

export function describeProcess(
  root: string,
  input: { now?: number; uptimeSeconds?: number; pid?: number; argv1?: string | undefined } = {},
): ProcessIdentity {
  const now = input.now ?? Date.now();
  const uptimeSeconds = input.uptimeSeconds ?? process.uptime();
  const argv1 = 'argv1' in input ? input.argv1 : process.argv[1];
  const relative = argv1 ? path.relative(root, path.resolve(argv1)) : '';
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return {
    pid: input.pid ?? process.pid,
    startedAt: new Date(now - Math.round(uptimeSeconds * 1000)).toISOString(),
    uptimeSeconds: Math.round(uptimeSeconds),
    entry: inside ? relative.split(path.sep).join('/') : null,
  };
}

/** A file written after this process started means the code on disk is not what it loaded. */
export function judgeBuild(startedAtMs: number, distNewestMs: number | null): BuildFreshness {
  if (distNewestMs === null) return { stale: null, issue: 'DIST_NOT_FOUND' };
  return { distNewestModifiedAt: new Date(distNewestMs).toISOString(), stale: distNewestMs > startedAtMs };
}

/** Newest file mtime under `dir`, or null when it is missing or holds no files. Symlinks are skipped. */
export async function newestFileModifiedMs(dir: string): Promise<number | null> {
  let newest: number | null = null;
  let scanned = 0;
  const pending = [dir];
  while (pending.length) {
    const current = pending.pop()!;
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && current === dir) return null;
      throw error;
    }
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) files.push(full);
    }
    scanned += files.length;
    if (scanned > MAX_SCANNED_FILES) throw new Error('DIST_SCAN_LIMIT');
    for (const file of await Promise.all(files.map(item => stat(item)))) {
      if (newest === null || file.mtimeMs > newest) newest = file.mtimeMs;
    }
  }
  return newest;
}

/**
 * Answers "is the process I am talking to running the dist that is on disk now?".
 * The dist scan is bounded and cached by the same probe the other diagnostics use, so a slow disk
 * degrades this block to `stale: null` and never delays or fails liveness.
 */
export function createProcessIdentityReader(
  root: string,
  options: { cacheMs?: number; timeoutMs?: number } = {},
): () => Promise<{ process: ProcessIdentity; build: BuildFreshness }> {
  const first = describeProcess(root);
  const startedAtMs = Date.parse(first.startedAt);
  const scan = boundedHealthProbe(
    async () => ({ newest: await newestFileModifiedMs(path.join(root, 'dist')) }),
    { cacheMs: options.cacheMs ?? 5_000, timeoutMs: options.timeoutMs ?? 1_500 },
  );
  return async () => {
    const result = await scan();
    const build: BuildFreshness = 'newest' in result
      ? judgeBuild(startedAtMs, result.newest)
      : { stale: null, issue: result.issue };
    return {
      process: { ...first, uptimeSeconds: Math.round((Date.now() - startedAtMs) / 1000) },
      build,
    };
  };
}
