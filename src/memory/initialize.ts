import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {resolveModuleProjectRoot} from '../portability/paths.js';
import type { MemoryEmbedder } from './embedder.js';
import { resolveMemoryPaths } from './paths.js';
import { MemoryService, type MemoryServiceOptions } from './service.js';
import { withMemoryProcessLock } from './lock.js';
import { assertContainedPath } from './transaction.js';
import {validateRelevancePolicy} from './relevance.js';

export interface MemoryRootOptions extends MemoryServiceOptions {
  baseDir?: string;
  memoryRoot?: string;
  embedder?: MemoryEmbedder;
  foundationTitle?: string;
}

export async function initializeMemoryRoot(
  options: MemoryRootOptions = {},
): Promise<MemoryService> {
  const relevancePolicy=options.controllerRelevancePolicy===undefined ? undefined : validateRelevancePolicy(options.controllerRelevancePolicy);
  const baseDir = path.resolve(options.baseDir ?? resolveModuleProjectRoot(import.meta.url));
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
  return MemoryService.initialize(baseDir, paths.root, options.embedder, {hostActivation:options.hostActivation,experience:options.experience,consolidation:options.consolidation,indexGranularity:options.indexGranularity,
    ...(options.queryCache ? { queryCache: { ...options.queryCache } } : {}),
    ...(relevancePolicy ? {controllerRelevancePolicy:relevancePolicy} : {})});
}
