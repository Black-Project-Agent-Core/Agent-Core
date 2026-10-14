import path from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import type { MemoryEmbedder } from './embedder.js';
import { MemoryService as LegacyMemoryService } from './service.js';
import { withMemoryProcessLock } from './lock.js';
import type { MemoryService as ExperienceMemoryService } from '../../SubProject/agent-core-memory/dist/index.js';

export interface AgentCoreMemoryRuntime {
  service: LegacyMemoryService;
  experience?: ExperienceMemoryService;
  mode: 'legacy' | 'experience-v2';
  root: string;
}
export const MEMORY_ROOT_RELATIVE = 'runtime/memory';
export const HISTORICAL_MEMORY_ROOT_RELATIVE = 'runtime/memory-v2';
// The filename identifies the engine activation protocol, not the storage root.
export const MEMORY_ACTIVATION_RELATIVE = 'runtime/memory-v2-activation.json';
const legacyBackupPattern = /^runtime\/backups\/memory-v1-final-before-v2-20261008(?:-retry-[0-9]{14}-[a-f0-9]{8})?\/manifest\.json$/;
const bad = (reason: string): never => { throw new Error('MEMORY_V2_ACTIVATION_INVALID:' + reason); };

export async function memoryHostPath(projectRoot: string, relative: string): Promise<string> {
  let current = path.resolve(projectRoot);
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..' || part.includes('\\')) return bad('UNSAFE_PATH');
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) return bad('SYMLINK_PATH'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return current;
}
export async function memoryPathExists(file: string): Promise<boolean> {
  try { await lstat(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export async function withMemoryActivationLock<T>(projectRoot: string, action: () => Promise<T>): Promise<T> {
  return withMemoryProcessLock(await memoryHostPath(projectRoot, 'runtime/.memory-activation.lock'), action, 30_000);
}
export async function readExperienceRootIdentity(root: string): Promise<string> {
  let text: string;
  try { text = await readFile(await memoryHostPath(root, 'state/experience-manifest.json'), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return bad('EXPERIENCE_MANIFEST_REQUIRED'); throw error; }
  const { experienceManifestSchema } = await import('../../SubProject/agent-core-memory/dist/memory/experience-types.js');
  let manifest;
  try { manifest = experienceManifestSchema.parse(JSON.parse(text)); }
  catch { return bad('EXPERIENCE_MANIFEST_INVALID'); }
  if (manifest.status !== 'complete') return bad('EXPERIENCE_MANIFEST_INCOMPLETE');
  return manifest.rootId;
}

/** Read-only validation, shared by startup and deliberate offline activation. */
export async function readMemoryActivation(projectRoot: string): Promise<Record<string, unknown> | null> {
  const markerPath = await memoryHostPath(projectRoot, MEMORY_ACTIVATION_RELATIVE);
  let markerText: string;
  try { markerText = await readFile(markerPath, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
  let marker: Record<string, unknown>;
  try {
    const value = JSON.parse(markerText);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return bad('UNREADABLE_MARKER');
    marker = value;
  } catch { return bad('UNREADABLE_MARKER'); }
  const historical = marker.schemaVersion === 1 && marker.root === HISTORICAL_MEMORY_ROOT_RELATIVE;
  const canonical = marker.schemaVersion === 2 && marker.root === MEMORY_ROOT_RELATIVE
    && marker.status === 'complete' && ['fresh', 'relocated'].includes(String(marker.origin))
    && typeof marker.rootId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(marker.rootId);
  if (marker.mode !== 'experience-v2' || (!historical && !canonical)) return bad('UNAUTHORIZED_OR_INCOMPLETE_MARKER');
  if (historical || marker.origin === 'relocated') {
    if (typeof marker.backup !== 'string' || !legacyBackupPattern.test(marker.backup)
      || typeof marker.legacyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(marker.legacyDigest)) return bad('UNAUTHORIZED_MARKER');
    let backup;
    try { backup = JSON.parse(await readFile(await memoryHostPath(projectRoot, marker.backup), 'utf8')); }
    catch { return bad('BACKUP_UNREADABLE'); }
    if (!backup || backup.snapshotDigest !== marker.legacyDigest || !Number.isSafeInteger(backup.fileCount)
      || backup.fileCount < 2) return bad('BACKUP_MISMATCH');
  }
  const root = await memoryHostPath(projectRoot, String(marker.root));
  const rootId = await readExperienceRootIdentity(root);
  if ((canonical && marker.rootId !== rootId)
    || (historical && marker.sourceRootId !== undefined && marker.sourceRootId !== rootId)) return bad('ROOT_IDENTITY_MISMATCH');
  if (canonical && await memoryPathExists(await memoryHostPath(projectRoot, HISTORICAL_MEMORY_ROOT_RELATIVE))) return bad('HISTORICAL_ROOT_REQUIRES_REVIEW');
  if (historical && await memoryPathExists(await memoryHostPath(projectRoot, MEMORY_ROOT_RELATIVE + '/state/experience-manifest.json'))) return bad('MULTIPLE_EXPERIENCE_ROOTS');
  return marker;
}

export async function initializeAgentCoreMemory(
  projectRoot: string,
  legacyMemoryDir: string,
  embedder?: MemoryEmbedder,
): Promise<AgentCoreMemoryRuntime> {
  return withMemoryActivationLock(projectRoot, async () => {
    const marker = await readMemoryActivation(projectRoot);
    if (marker === null) {
      if (await memoryPathExists(await memoryHostPath(projectRoot, HISTORICAL_MEMORY_ROOT_RELATIVE))) return bad('HISTORICAL_ROOT_REQUIRES_REVIEW');
      for (const root of new Set([path.resolve(legacyMemoryDir), path.join(projectRoot, MEMORY_ROOT_RELATIVE)])) {
        for (const relative of ['state/experience-manifest.json', 'archive', 'state/episodes', 'state/episode-tasks', 'state/capsules', 'state/operations', 'state/consolidation']) {
          if (await memoryPathExists(await memoryHostPath(root, relative))) return bad('ACTIVATION_REQUIRED');
        }
      }
      return {service: await LegacyMemoryService.initialize(projectRoot, legacyMemoryDir, embedder), mode: 'legacy', root: legacyMemoryDir};
    }
    const root = await memoryHostPath(projectRoot, String(marker.root));
    if (marker.schemaVersion === 2 && path.resolve(legacyMemoryDir) !== root) return bad('CONFIGURED_ROOT_CONFLICT');
    // Historical markers remain compatible until an explicit offline relocation.
    // Never initialize the legacy writer when an experience root is selected.
    const { MemoryService } = await import('../../SubProject/agent-core-memory/dist/index.js');
    const { createLearningConsolidationHost } = await import('../learning/memory-sink.js');
    const learningHost = createLearningConsolidationHost(projectRoot);
    const engine = await MemoryService.initialize(projectRoot, root, embedder as any, {experience: {enabled: true}, consolidation: learningHost.policy});
    if (engine.health().canonicalStore === 'error' || !engine.health().canonicalComplete
      || engine.controller({workspaceKey: 'agent-core', taskId: 'activation-status', controllerId: 'agent-core-host'}).capabilities().writeMode !== 'experience-v2') return bad('ENGINE_NOT_ENABLED');
    learningHost.bind(engine);
    return {service: engine as unknown as LegacyMemoryService, experience: engine, mode: 'experience-v2', root};
  });
}
