import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {HISTORICAL_MEMORY_ROOT_RELATIVE,MEMORY_ACTIVATION_RELATIVE,MEMORY_ROOT_RELATIVE,
  memoryHostPath,memoryPathExists,readExperienceRootIdentity,readMemoryActivation,withMemoryActivationLock} from './host-runtime.js';

interface ActivationOptions {operation:'fresh'|'relocate';dryRun?:boolean}
interface FileIdentity {path:string;bytes:number;sha256:string}
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');

async function inventory(root:string,prefix=''):Promise<FileIdentity[]> {
  const rows:FileIdentity[]=[];
  for(const entry of await readdir(root,{withFileTypes:true})) {
    if(!prefix && entry.name==='.memory.lock')throw Error('MEMORY_WRITER_ACTIVE');
    if(!prefix && entry.name==='.memory.lock.target')continue;
    const relative=prefix?prefix+'/'+entry.name:entry.name;
    const file=path.join(root,entry.name),info=await lstat(file);
    if(info.isSymbolicLink()||(!info.isDirectory()&&!info.isFile()))throw Error('MEMORY_ENTRY_UNSAFE:'+relative);
    if(info.isDirectory())rows.push(...await inventory(file,relative));
    else {const bytes=await readFile(file);rows.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});}
  }
  return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
async function publish(file:string,value:unknown):Promise<void> {
  const temporary=file+'.tmp-'+randomUUID();
  await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  await rename(temporary,file);
}

/** Offline host operation only. The CLI checks the configured listener; stop all other Memory writers first.
 * No implicit migration, deletion, or recovery: an interrupted activation remains visibly blocked. */
export async function activateCanonicalMemory(projectRoot:string,options:ActivationOptions) {
  if(!['fresh','relocate'].includes(options.operation))throw Error('UNKNOWN_MEMORY_ACTIVATION_OPERATION');
  const canonical=await memoryHostPath(projectRoot,MEMORY_ROOT_RELATIVE);
  const historical=await memoryHostPath(projectRoot,HISTORICAL_MEMORY_ROOT_RELATIVE);
  const markerPath=await memoryHostPath(projectRoot,MEMORY_ACTIVATION_RELATIVE);
  const inspect=async()=>{
    if(options.operation==='fresh') {
      if(await memoryPathExists(markerPath))throw Error('ACTIVATION_ALREADY_EXISTS');
      if(await memoryPathExists(canonical)||await memoryPathExists(historical))throw Error('FRESH_ROOT_REQUIRED');
      return null;
    }
    const marker=await readMemoryActivation(projectRoot);
    if(!marker||marker.schemaVersion!==1)throw Error('HISTORICAL_ACTIVATION_REQUIRED');
    const backupPath=await memoryHostPath(projectRoot,String(marker.backup));
    const backup=JSON.parse(await readFile(backupPath,'utf8'));
    const backupFiles=await inventory(await memoryHostPath(projectRoot,path.posix.dirname(String(marker.backup))+'/memory'));
    if(backupFiles.length!==backup.fileCount||sha(JSON.stringify(backupFiles))!==marker.legacyDigest)throw Error('LEGACY_BACKUP_CONTENT_MISMATCH');
    const hasLegacy=await memoryPathExists(canonical);
    if(hasLegacy && sha(JSON.stringify(await inventory(canonical)))!==marker.legacyDigest)throw Error('LEGACY_ROOT_CHANGED_REVIEW_REQUIRED');
    const sourceFiles=await inventory(historical);
    return {marker,hasLegacy,sourceFiles,rootId:await readExperienceRootIdentity(historical)};
  };
  // A preview is genuinely read-only, including no creation of lock directories.
  if(options.dryRun) {
    const preview=await inspect();
    return {operation:options.operation,dryRun:true,root:canonical,rootId:preview?.rootId,preservedLegacy:undefined as string|undefined};
  }
  return withMemoryActivationLock(projectRoot,async()=>{
    const prior=await inspect();
    let rootId:string,preservedLegacy:string|undefined,recoveryRelative:string|undefined;
    if(prior===null) {
      // Publish a fail-closed intent before the owner creates any files. Startup
      // shares this lock and cannot select a legacy writer during initialization.
      await writeFile(markerPath,JSON.stringify({schemaVersion:2,mode:'experience-v2',root:MEMORY_ROOT_RELATIVE,status:'preparing',origin:'fresh'})+'\n',{flag:'wx',mode:0o600});
      await mkdir(canonical,{recursive:false});
      const {initializeStandaloneMemory}=await import('../../SubProject/agent-core-memory/dist/index.js');
      const service=await initializeStandaloneMemory({baseDir:projectRoot,memoryRoot:canonical,experience:{enabled:true}});
      try {
        if(service.health().canonicalStore==='error'||!service.health().canonicalComplete)throw Error('CANONICAL_MEMORY_INITIALIZATION_FAILED');
        rootId=await readExperienceRootIdentity(canonical);
      } finally {service.dispose();}
    } else {
      recoveryRelative='runtime/backups/memory-canonical-relocation-'+randomUUID();
      const recovery=await memoryHostPath(projectRoot,recoveryRelative);
      await mkdir(recovery,{recursive:true});
      await writeFile(path.join(recovery,'previous-activation.json'),JSON.stringify(prior.marker,null,2)+'\n',{flag:'wx',mode:0o600});
      await writeFile(path.join(recovery,'source-inventory.json'),JSON.stringify(prior.sourceFiles,null,2)+'\n',{flag:'wx',mode:0o600});
      preservedLegacy=prior.hasLegacy?recoveryRelative+'/legacy-memory':undefined;
      await publish(markerPath,{...prior.marker,schemaVersion:2,root:MEMORY_ROOT_RELATIVE,status:'preparing',origin:'relocated',rootId:prior.rootId,recovery:recoveryRelative});
      if(prior.hasLegacy)await rename(canonical,path.join(recovery,'legacy-memory'));
      // Same engine/format: move the directory unchanged. IDs, evidence,
      // revisions and relations retain their original bytes and identity.
      await rename(historical,canonical);
      if(JSON.stringify(await inventory(canonical))!==JSON.stringify(prior.sourceFiles))throw Error('RELOCATED_ROOT_CONTENT_MISMATCH');
      rootId=await readExperienceRootIdentity(canonical);
      if(rootId!==prior.rootId)throw Error('RELOCATED_ROOT_IDENTITY_MISMATCH');
    }
    await publish(markerPath,{...(prior?.marker??{}),schemaVersion:2,mode:'experience-v2',root:MEMORY_ROOT_RELATIVE,
      status:'complete',origin:prior?'relocated':'fresh',rootId,activatedAt:new Date().toISOString(),
      ...(preservedLegacy?{preservedLegacy}:{}),...(prior?{relocatedFrom:HISTORICAL_MEMORY_ROOT_RELATIVE,recovery:recoveryRelative}:{})});
    await readMemoryActivation(projectRoot);
    return {operation:options.operation,dryRun:false,root:canonical,rootId,preservedLegacy};
  });
}
