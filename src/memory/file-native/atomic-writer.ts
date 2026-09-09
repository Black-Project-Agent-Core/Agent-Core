import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ContentValidator = (content: string) => void | Promise<void>;

export function sha256Text(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function atomicReplaceValidated(
  targetPath: string,
  content: string,
  validator: ContentValidator,
): Promise<{ sha256: string }> {
  await validator(content);
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${randomUUID()}.tmp`);
  const handle = await open(tempPath, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return { sha256: sha256Text(content) };
}

export async function writeImmutableRevision(
  historyRoot: string,
  memoryId: string,
  revisionNo: number,
  revisionId: string,
  content: string,
): Promise<string> {
  const safe = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, '_');
  const dir = path.join(historyRoot, safe(memoryId));
  const target = path.join(dir, `${revisionNo}-${safe(revisionId)}.md`);
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('MEMORY_HISTORY_ALREADY_EXISTS');
    throw error;
  }
  return target;
}
