import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';

/** Never replace a failed atomic rename with an in-place credential overwrite. */
export async function persistOAuthSnapshot(destination: string, serialized: string): Promise<void> {
  await writeOwnedFileAtomic(destination, serialized, { mode: 0o600 });
}
