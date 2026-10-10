import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MemoryEmbedder } from './memory/embedder.js';
import { resolveMemoryPaths } from './memory/paths.js';
import { MemoryService, type MemoryServiceOptions } from './memory/service.js';
import { withMemoryProcessLock } from './memory/lock.js';
import { assertContainedPath } from './memory/transaction.js';

export interface StandaloneMemoryOptions extends MemoryServiceOptions {
  baseDir?: string;
  memoryRoot?: string;
  embedder?: MemoryEmbedder;
  foundationTitle?: string;
}

export async function initializeStandaloneMemory(
  options: StandaloneMemoryOptions = {},
): Promise<MemoryService> {
  const baseDir = path.resolve(options.baseDir ?? process.cwd());
  const paths = resolveMemoryPaths(baseDir, options.memoryRoot);
  await assertContainedPath(paths.root,paths.bootstrap);
  await mkdir(paths.root, { recursive: true });
  await withMemoryProcessLock(paths.lock,async () => {
    await assertContainedPath(paths.root,paths.bootstrap);
    try { await access(paths.bootstrap); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const title = options.foundationTitle?.trim() || 'Agent Core Memory Foundation';
      await writeFile(paths.bootstrap, `# ${title}\n`, { encoding: 'utf8', flag: 'wx', mode:0o600 });
    }
  });
  return MemoryService.initialize(baseDir, paths.root, options.embedder, {experience:options.experience,consolidation:options.consolidation});
}
