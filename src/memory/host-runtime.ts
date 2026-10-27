import path from 'node:path';
import {lstat,readFile} from 'node:fs/promises';
import type {MemoryEmbedder} from './embedder.js';
import {MemoryService} from './service.js';
import {cognitiveOptionsFromEnv} from './cognitive-config.js';
import {withMemoryProcessLock} from './lock.js';
import {experienceManifestSchema} from './experience-types.js';
import {redactSensitiveString} from '../security/redaction.js';

export interface AgentCoreMemoryRuntime {
  service:MemoryService;
  experience:MemoryService;
  mode:'experience-v2';
  root:string;
}
export const MEMORY_ROOT_RELATIVE='runtime/memory';
export const HISTORICAL_MEMORY_ROOT_RELATIVE='runtime/memory-v2';
export const MEMORY_ACTIVATION_RELATIVE='runtime/memory/state/host/activation.json';
export const MEMORY_ACTIVATION_LOCK_RELATIVE='runtime/memory/state/host/activation.lock';
export const MEMORY_BACKUPS_RELATIVE='runtime/memory/state/backups';
/** Compatibility inputs only; never new startup state or a second writer. */
export const HISTORICAL_ACTIVATION_RELATIVE='runtime/memory-v2-activation.json';
export const HISTORICAL_ACTIVATION_LOCK_RELATIVE='runtime/.memory-activation.lock';
const backupPattern=/^runtime\/(?:backups|memory\/state\/backups\/legacy)\/memory-v1-final-before-v2-20261008(?:-retry-[0-9]{14}-[a-f0-9]{8})?\/manifest\.json$/;
const bad=(reason:string):never=>{throw new Error('MEMORY_V2_ACTIVATION_INVALID:'+reason);};
export async function memoryHostPath(projectRoot:string,relative:string):Promise<string>{
  let current=path.resolve(projectRoot);
  for(const part of relative.split('/')){
    if(!part||part==='.'||part==='..'||part.includes('\\')||path.isAbsolute(part)||part.includes(':'))return bad('UNSAFE_PATH');
    current=path.join(current,part);
    try{if((await lstat(current)).isSymbolicLink())return bad('SYMLINK_PATH');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  return current;
}
export async function memoryPathExists(file:string):Promise<boolean>{
  try{await lstat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
}
export async function withMemoryActivationLock<T>(projectRoot:string,action:()=>Promise<T>):Promise<T>{
  // A historical writer must be stopped/reconciled explicitly; never steal its lock.
  if(await memoryPathExists(await memoryHostPath(projectRoot,HISTORICAL_ACTIVATION_LOCK_RELATIVE)))return bad('HISTORICAL_ACTIVATION_LOCK_REQUIRES_REVIEW');
  return withMemoryProcessLock(await memoryHostPath(projectRoot,MEMORY_ACTIVATION_LOCK_RELATIVE),action,30_000);
}
export async function readExperienceRootIdentity(root:string):Promise<string>{
  let raw:string;
  try{raw=await readFile(await memoryHostPath(root,'state/experience-manifest.json'),'utf8');}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return bad('EXPERIENCE_MANIFEST_REQUIRED');throw error;}
  let manifest;
  try{manifest=experienceManifestSchema.parse(JSON.parse(raw));}catch{return bad('EXPERIENCE_MANIFEST_INVALID');}
  if(manifest.status!=='complete')return bad('EXPERIENCE_MANIFEST_INCOMPLETE');
  return manifest.rootId;
}
/** Read-only old/new marker validation; migration is always explicit and offline. */
export async function readMemoryActivation(projectRoot:string):Promise<Record<string,unknown>|null>{
  const current=await memoryHostPath(projectRoot,MEMORY_ACTIVATION_RELATIVE);
  const historical=await memoryHostPath(projectRoot,HISTORICAL_ACTIVATION_RELATIVE);
  const hasCurrent=await memoryPathExists(current),hasHistorical=await memoryPathExists(historical);
  if(hasCurrent&&hasHistorical)return bad('MULTIPLE_ACTIVATION_MARKERS');
  if(!hasCurrent&&!hasHistorical)return null;
  let marker:Record<string,unknown>;
  try{const value=JSON.parse(await readFile(hasCurrent?current:historical,'utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value))return bad('UNREADABLE_MARKER');marker=value;
  }catch{return bad('UNREADABLE_MARKER');}
  const oldRoot=marker.schemaVersion===1&&marker.root===HISTORICAL_MEMORY_ROOT_RELATIVE;
  const canonical=marker.schemaVersion===2&&marker.root===MEMORY_ROOT_RELATIVE&&marker.status==='complete'
    &&['fresh','relocated'].includes(String(marker.origin))
    &&typeof marker.rootId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/.test(marker.rootId);
  if(marker.mode!=='experience-v2'||(!oldRoot&&!canonical))return bad('UNAUTHORIZED_OR_INCOMPLETE_MARKER');
  if(oldRoot||marker.origin==='relocated'||marker.backup!==undefined){
    if(typeof marker.backup!=='string'||!backupPattern.test(marker.backup)||typeof marker.legacyDigest!=='string'||!/^[a-f0-9]{64}$/.test(marker.legacyDigest))return bad('UNAUTHORIZED_MARKER');
    let backup;
    try{backup=JSON.parse(await readFile(await memoryHostPath(projectRoot,marker.backup),'utf8'));}catch{return bad('BACKUP_UNREADABLE');}
    if(!backup||backup.snapshotDigest!==marker.legacyDigest||!Number.isSafeInteger(backup.fileCount)||backup.fileCount<2)return bad('BACKUP_MISMATCH');
  }
  const root=await memoryHostPath(projectRoot,String(marker.root)),rootId=await readExperienceRootIdentity(root);
  if((canonical&&marker.rootId!==rootId)||(oldRoot&&marker.sourceRootId!==undefined&&marker.sourceRootId!==rootId))return bad('ROOT_IDENTITY_MISMATCH');
  if(canonical&&await memoryPathExists(await memoryHostPath(projectRoot,HISTORICAL_MEMORY_ROOT_RELATIVE)))return bad('HISTORICAL_ROOT_REQUIRES_REVIEW');
  if(oldRoot&&await memoryPathExists(await memoryHostPath(projectRoot,MEMORY_ROOT_RELATIVE+'/state/experience-manifest.json')))return bad('MULTIPLE_EXPERIENCE_ROOTS');
  return marker;
}
export async function initializeAgentCoreMemory(projectRoot:string,memoryDir:string,embedder?:MemoryEmbedder):Promise<AgentCoreMemoryRuntime>{
  const marker=await readMemoryActivation(projectRoot);
  if(!marker){
    if(await memoryPathExists(await memoryHostPath(projectRoot,HISTORICAL_MEMORY_ROOT_RELATIVE)))return bad('HISTORICAL_ROOT_REQUIRES_REVIEW');
    return bad('ACTIVATION_REQUIRED');
  }
  if(marker.root!==MEMORY_ROOT_RELATIVE||await memoryPathExists(await memoryHostPath(projectRoot,HISTORICAL_ACTIVATION_RELATIVE)))return bad('OFFLINE_LAYOUT_MIGRATION_REQUIRED');
  const root=await memoryHostPath(projectRoot,MEMORY_ROOT_RELATIVE);
  if(path.resolve(memoryDir)!==root)return bad('CONFIGURED_ROOT_CONFLICT');
  return withMemoryActivationLock(projectRoot,async()=>{
    await readMemoryActivation(projectRoot);
    const {createLearningConsolidationHost}=await import('./learning-sink.js');
    const learningHost=createLearningConsolidationHost(projectRoot);
    // Cognitive upgrades stay off unless AGENT_CORE_MEMORY_COGNITIVE names them (unknown names are ignored).
    const service=await MemoryService.initialize(projectRoot,root,embedder,{experience:{enabled:true},consolidation:learningHost.policy,cognitive:cognitiveOptionsFromEnv(process.env).options});
    if(service.health().canonicalStore==='error'||!service.health().canonicalComplete
      ||service.controller({workspaceKey:'agent-core',taskId:'activation-status',controllerId:'agent-core-host'}).capabilities().writeMode!=='experience-v2'){
      const detail=redactSensitiveString(service.getIssues().slice(0,3).map(issue=>issue.message).join('; ')).slice(0,1000);
      service.dispose();
      return bad('ENGINE_NOT_ENABLED'+(detail?':'+detail:''));
    }
    learningHost.bind(service);
    return {service,experience:service,mode:'experience-v2',root};
  });
}
