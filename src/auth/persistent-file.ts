import { rename, rm, writeFile } from 'node:fs/promises';

const REPLACE_BLOCKED_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

export async function persistSerializedFile(temporaryPath: string, destinationPath: string, serialized: string): Promise<void> {
  try {
    await rename(temporaryPath, destinationPath);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!code || !REPLACE_BLOCKED_CODES.has(code)) throw error;
  }
  await writeFile(destinationPath, serialized, { encoding: 'utf8', mode: 0o600 });
  await rm(temporaryPath, { force: true }).catch(() => undefined);
}
