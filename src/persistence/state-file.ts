import { readFile } from 'node:fs/promises';
import { writeOwnedFileAtomic } from './atomic-file.js';

/** Keep the previous valid JSON generation; never overwrite an unreadable source. `compact` drops indentation only. */
export async function writeStateFile(file: string, value: unknown, options: { compact?: boolean } = {}): Promise<void> {
  let previous: string | undefined;
  try {
    previous = await readFile(file, 'utf8');
    JSON.parse(previous);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('STATE_DEGRADED_WRITE_REFUSED', { cause: error });
  }
  if (previous !== undefined) await writeOwnedFileAtomic(file + '.last-good', previous);
  const serialized = (options.compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)) + '\n';
  await writeOwnedFileAtomic(file, serialized);
  if (await readFile(file, 'utf8') !== serialized) throw new Error('STATE_READBACK_MISMATCH');
  if (previous === undefined) await writeOwnedFileAtomic(file + '.last-good', serialized);
}

export async function isNewState(file: string, error: unknown): Promise<boolean> {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
  try { await readFile(file + '.last-good'); return false; }
  catch (backupError) { return (backupError as NodeJS.ErrnoException).code === 'ENOENT'; }
}
