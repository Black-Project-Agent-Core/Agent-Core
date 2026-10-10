import path from 'node:path';
import { resolveModuleProjectRoot } from '../portability/paths.js';

const MODULE_PROJECT_ROOT = resolveModuleProjectRoot(import.meta.url);

export interface MemoryPaths {
  root: string;
  notes: string;
  index: string;
  state: string;
  revisions: string;
  bootstrap: string;
  lock: string;
  experienceManifest: string;
  archiveObjects: string;
  archiveManifests: string;
  episodes: string;
  operations: string;
}

export function resolveMemoryPaths(baseDir = MODULE_PROJECT_ROOT, memoryRoot?: string): MemoryPaths {
  const root = path.resolve(memoryRoot ?? path.join(baseDir, 'runtime', 'memory'));
  return {
    root,
    notes: path.join(root, 'notes'),
    index: path.join(root, 'index'),
    state: path.join(root, 'state'),
    revisions: path.join(root, 'state', 'revisions'),
    bootstrap: path.join(root, '00-agent-core-memory.md'),
    lock: path.join(root, '.memory.lock'),
    experienceManifest:path.join(root,'state','experience-manifest.json'),
    archiveObjects:path.join(root,'archive','objects'),
    archiveManifests:path.join(root,'archive','manifests'),
    episodes:path.join(root,'state','episodes'),
    operations:path.join(root,'state','operations'),
  };
}

export function notePath(paths: MemoryPaths, id: string): string {
  return path.join(paths.notes, `${id}.md`);
}
