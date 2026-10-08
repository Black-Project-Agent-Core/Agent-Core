import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { MemoryEmbedder } from './embedder.js';
import { MemoryService as LegacyMemoryService } from './service.js';
import type { MemoryService as ExperienceMemoryService } from '../../SubProject/agent-core-memory/dist/index.js';

export interface AgentCoreMemoryRuntime {
  service: LegacyMemoryService;
  experience?: ExperienceMemoryService;
  mode: 'legacy' | 'experience-v2';
  root: string;
}
const candidateRel = 'runtime/memory-v2';
const legacyBackupPattern = /^runtime\/backups\/memory-v1-final-before-v2-20261008(?:-retry-[0-9]{14}-[a-f0-9]{8})?\/manifest\.json$/;
const activationRel = 'runtime/memory-v2-activation.json';
const bad = (reason: string): never => { throw new Error('MEMORY_V2_ACTIVATION_INVALID:' + reason); };
export async function initializeAgentCoreMemory(
  projectRoot: string,
  legacyMemoryDir: string,
  embedder?: MemoryEmbedder,
): Promise<AgentCoreMemoryRuntime> {
  const markerPath = path.join(projectRoot,activationRel);
  let markerText: string | null;
  try { markerText = await readFile(markerPath,'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    markerText = null;
  }
  if (markerText === null) {
    return { service:await LegacyMemoryService.initialize(projectRoot,legacyMemoryDir,embedder),
      mode:'legacy',root:legacyMemoryDir };
  }
  let marker: Record<string, unknown>;
  try {marker = JSON.parse(markerText) as Record<string, unknown>;}
  catch {return bad('UNREADABLE_MARKER');}
  if (marker.schemaVersion !== 1 || marker.mode !== 'experience-v2'
    || marker.root !== candidateRel || typeof marker.backup !== 'string'
    || !legacyBackupPattern.test(marker.backup)
    || typeof marker.legacyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(marker.legacyDigest)) return bad('UNAUTHORIZED_MARKER');
  const backup = JSON.parse(await readFile(path.join(projectRoot,...marker.backup.split('/')),'utf8')) as {snapshotDigest?:string;fileCount?:number};
  if (backup.snapshotDigest !== marker.legacyDigest || !Number.isSafeInteger(backup.fileCount) || Number(backup.fileCount) < 2) return bad('BACKUP_MISMATCH');
  // Import only after the host-owned activation marker is installed. The legacy writer
  // is not initialized in this branch; format-v1 and v2 never co-write one root.
  const { MemoryService } = await import('../../SubProject/agent-core-memory/dist/index.js');
  const root = path.join(projectRoot,...candidateRel.split('/'));
  const engine = await MemoryService.initialize(projectRoot,root,embedder as any,{experience:{enabled:true}});
  if (engine.controller({workspaceKey:'agent-core',taskId:'activation-status',controllerId:'agent-core-host'}).capabilities().writeMode !== 'experience-v2') return bad('ENGINE_NOT_ENABLED');
  return {service:engine as unknown as LegacyMemoryService,experience:engine,mode:'experience-v2',root};
}
