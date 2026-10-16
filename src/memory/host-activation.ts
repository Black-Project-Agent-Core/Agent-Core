import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {HISTORICAL_MEMORY_ROOT_RELATIVE,HISTORICAL_ACTIVATION_RELATIVE,HISTORICAL_ACTIVATION_LOCK_RELATIVE,
  MEMORY_ACTIVATION_RELATIVE,MEMORY_ROOT_RELATIVE,MEMORY_BACKUPS_RELATIVE,
  memoryHostPath,memoryPathExists,readExperienceRootIdentity,readMemoryActivation,withMemoryActivationLock} from './host-runtime.js';
import {initializeMemoryRoot} from './initialize.js';

interface ActivationOptions {operation:'fresh'|'relocate'|'metadata';dryRun?:boolean}
interface FileIdentity {path:string;bytes:number;sha256:string}
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const control=(relative:string)=>relative==='state/host'||relative.startsWith('state/host/')
  ||relative==='state/backups'||relative.startsWith('state/backups/');
/** Controller metadata/backups are excluded from canonical record-byte comparisons only. */
async function inventory(root:string,prefix='',skipControl=false):Promise<FileIdentity[]>{
  const rows:FileIdentity[]=[];
  for(const entry of await readdir(root,{withFileTypes:true})){
    const relative=prefix?prefix+'/'+entry.name:entry.name;
    if(skipControl&&control(relative))continue;
    if(!prefix&&entry.name==='.memory.lock')throw Error('MEMORY_WRITER_ACTIVE');
    if(!prefix&&entry.name==='.memory.lock.target')continue;
    const file=path.join(root,entry.name),info=await lstat(file);
    if(info.isSymbolicLink()||(!info.isDirectory()&&!info.isFile()))throw Error('MEMORY_ENTRY_UNSAFE:'+relative);
    if(info.isDirectory())rows.push(...await inventory(file,relative,skipControl));
    else{const bytes=await readFile(file);rows.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});}
  }
  return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
async function publish(file:string,value:unknown):Promise<void>{
  await mkdir(path.dirname(file),{recursive:true});
  const temporary=file+'.tmp-'+randomUUID();
  await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  await rename(temporary,file);
}
/** Preserve exact entries while leaving the held host lock and backup directory stable.
 * A preparing marker makes interrupted multi-entry relocation fail closed. */
async function relocateEntries(source:string,destination:string):Promise<void>{
  await mkdir(destination,{recursive:true});
  for(const entry of await readdir(source,{withFileTypes:true})){
    if(entry.name==='state'){
      const from=path.join(source,'state'),to=path.join(destination,'state');await mkdir(to,{recursive:true});
      for(const child of await readdir(from)){
        if(child==='host'||child==='backups')continue;
        const target=path.join(to,child);if(await memoryPathExists(target))throw Error('RELOCATION_DESTINATION_CONFLICT');
        await rename(path.join(from,child),target);
      }
      continue;
    }
    const target=path.join(destination,entry.name);if(await memoryPathExists(target))throw Error('RELOCATION_DESTINATION_CONFLICT');
    await rename(path.join(source,entry.name),target);
  }
}
async function inspectHistoricalBackups(projectRoot:string):Promise<void>{
  const root=await memoryHostPath(projectRoot,'runtime/backups');
  if(!await memoryPathExists(root))return;
  for(const entry of await readdir(root,{withFileTypes:true})){
    if(!/^memory(?:[-_]|$)/i.test(entry.name))continue;
    const source=await memoryHostPath(projectRoot,'runtime/backups/'+entry.name);
    const target=await memoryHostPath(projectRoot,MEMORY_BACKUPS_RELATIVE+'/legacy/'+entry.name);
    if(entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))throw Error('HISTORICAL_MEMORY_BACKUP_UNSAFE');
    if(entry.isDirectory())await inventory(source);
    else await readFile(source);
    if(await memoryPathExists(target))throw Error('BACKUP_DESTINATION_CONFLICT');
  }
}
/** Offline extension of the existing activation owner. No user-store migration runs at build/startup. */
export async function activateCanonicalMemory(projectRoot:string,options:ActivationOptions){
  if(!['fresh','relocate','metadata'].includes(options.operation))throw Error('UNKNOWN_MEMORY_ACTIVATION_OPERATION');
  const canonical=await memoryHostPath(projectRoot,MEMORY_ROOT_RELATIVE),historical=await memoryHostPath(projectRoot,HISTORICAL_MEMORY_ROOT_RELATIVE);
  const markerPath=await memoryHostPath(projectRoot,MEMORY_ACTIVATION_RELATIVE),oldMarker=await memoryHostPath(projectRoot,HISTORICAL_ACTIVATION_RELATIVE);
  const inspect=async(underLock=false)=>{
    if(options.operation==='fresh'){
      if(await memoryPathExists(markerPath)||await memoryPathExists(oldMarker))throw Error('ACTIVATION_ALREADY_EXISTS');
      if(await memoryPathExists(historical))throw Error('FRESH_ROOT_REQUIRED');
      if(await memoryPathExists(canonical)&&(!underLock||(await inventory(canonical,'',true)).length))throw Error('FRESH_ROOT_REQUIRED');
      return null;
    }
    const marker=await readMemoryActivation(projectRoot);
    if(!marker)throw Error('ACTIVATION_REQUIRED');
    await inspectHistoricalBackups(projectRoot);
    if(options.operation==='metadata'){
      if(marker.schemaVersion!==2||!await memoryPathExists(oldMarker))throw Error('HISTORICAL_CONTROL_LAYOUT_REQUIRED');
      return {marker,hasLegacy:false,sourceFiles:await inventory(canonical,'',true),rootId:await readExperienceRootIdentity(canonical)};
    }
    if(marker.schemaVersion!==1)throw Error('HISTORICAL_ACTIVATION_REQUIRED');
    const backup=JSON.parse(await readFile(await memoryHostPath(projectRoot,String(marker.backup)),'utf8'));
    const backupFiles=await inventory(await memoryHostPath(projectRoot,path.posix.dirname(String(marker.backup))+'/memory'));
    if(backupFiles.length!==backup.fileCount||sha(JSON.stringify(backupFiles))!==marker.legacyDigest)throw Error('LEGACY_BACKUP_CONTENT_MISMATCH');
    const priorFiles=await memoryPathExists(canonical)?await inventory(canonical,'',true):[];
    const hasLegacy=priorFiles.length>0;
    if(hasLegacy&&sha(JSON.stringify(priorFiles))!==marker.legacyDigest)throw Error('LEGACY_ROOT_CHANGED_REVIEW_REQUIRED');
    const sourceFiles=await inventory(historical);
    if(sourceFiles.some(file=>control(file.path)))throw Error('HISTORICAL_CONTROL_NAMESPACE_CONFLICT');
    return {marker,hasLegacy,sourceFiles,rootId:await readExperienceRootIdentity(historical)};
  };
  // Preflight errors and dry runs do not even create a control directory/lock.
  await inspect();
  if(await memoryPathExists(await memoryHostPath(projectRoot,HISTORICAL_ACTIVATION_LOCK_RELATIVE)))throw Error('HISTORICAL_ACTIVATION_LOCK_REQUIRES_REVIEW');
  if(options.dryRun){const prior=await inspect();return {operation:options.operation,dryRun:true,root:canonical,rootId:prior?.rootId,preservedLegacy:undefined as string|undefined};}
  return withMemoryActivationLock(projectRoot,async()=>{
    const prior=await inspect(true);
    const recoveryRelative=MEMORY_BACKUPS_RELATIVE+'/layout-'+randomUUID();
    const recovery=await memoryHostPath(projectRoot,recoveryRelative);await mkdir(recovery,{recursive:true});
    if(prior){
      await writeFile(path.join(recovery,'previous-activation.json'),JSON.stringify(prior.marker,null,2)+'\n',{flag:'wx',mode:0o600});
      await writeFile(path.join(recovery,'source-inventory.json'),JSON.stringify(prior.sourceFiles,null,2)+'\n',{flag:'wx',mode:0o600});
    }
    await publish(markerPath,{...(prior?.marker??{}),schemaVersion:2,mode:'experience-v2',root:MEMORY_ROOT_RELATIVE,status:'preparing',origin:prior?'relocated':'fresh',recovery:recoveryRelative});
    let rootId:string,preservedLegacy:string|undefined;
    if(!prior){
      const service=await initializeMemoryRoot({baseDir:projectRoot,memoryRoot:canonical,experience:{enabled:true},hostActivation:true});
      try{if(service.health().canonicalStore==='error'||!service.health().canonicalComplete)throw Error('CANONICAL_MEMORY_INITIALIZATION_FAILED');rootId=await readExperienceRootIdentity(canonical);}
      finally{service.dispose();}
    }else if(options.operation==='relocate'){
      preservedLegacy=prior.hasLegacy?recoveryRelative+'/legacy-memory':undefined;
      if(preservedLegacy)await relocateEntries(canonical,await memoryHostPath(projectRoot,preservedLegacy));
      await relocateEntries(historical,canonical);
      // Retain the empty original directory as an explicit recorded tombstone;
      // removing only empty directories is handled below, never recursive deletion.
      const {rmdir}=await import('node:fs/promises');
      const oldState=path.join(historical,'state');if(await memoryPathExists(oldState))await rmdir(oldState);
      await rmdir(historical);
      if(JSON.stringify(await inventory(canonical,'',true))!==JSON.stringify(prior.sourceFiles))throw Error('RELOCATED_ROOT_CONTENT_MISMATCH');
      rootId=await readExperienceRootIdentity(canonical);if(rootId!==prior.rootId)throw Error('RELOCATED_ROOT_IDENTITY_MISMATCH');
    }else{
      if(JSON.stringify(await inventory(canonical,'',true))!==JSON.stringify(prior.sourceFiles))throw Error('CANONICAL_ROOT_CHANGED_DURING_METADATA_MIGRATION');
      rootId=prior.rootId;
    }
    let backup=prior?.marker.backup;
    const backupMoves:Array<{from:string;to:string}>=[];
    if(prior){
      const oldBackups=await memoryHostPath(projectRoot,'runtime/backups');
      if(await memoryPathExists(oldBackups)){
        // Domain-owned historical backups only. Other subsystem backups are untouched.
        for(const entry of await readdir(oldBackups,{withFileTypes:true})){
          if(!/^memory(?:[-_]|$)/i.test(entry.name))continue;
          const fromRelative='runtime/backups/'+entry.name,toRelative=MEMORY_BACKUPS_RELATIVE+'/legacy/'+entry.name;
          const from=await memoryHostPath(projectRoot,fromRelative),target=await memoryHostPath(projectRoot,toRelative);
          if(entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))throw Error('HISTORICAL_MEMORY_BACKUP_UNSAFE');
          if(entry.isDirectory())await inventory(from);
          else await readFile(from);
          if(await memoryPathExists(target))throw Error('BACKUP_DESTINATION_CONFLICT');
          await mkdir(path.dirname(target),{recursive:true});await rename(from,target);
          backupMoves.push({from:fromRelative,to:toRelative});
          if(typeof backup==='string'&&backup.startsWith(fromRelative+'/'))backup=toRelative+backup.slice(fromRelative.length);
        }
      }
    }
    await writeFile(path.join(recovery,'backup-moves.json'),JSON.stringify(backupMoves,null,2)+'\n',{flag:'wx',mode:0o600});
    const remap=(value:unknown)=>{
      if(typeof value!=='string')return value;
      const move=backupMoves.find(entry=>value===entry.from||value.startsWith(entry.from+'/'));
      return move?move.to+value.slice(move.from.length):value;
    };
    // Archive old marker/unused lock target, never erase its recovery evidence.
    if(await memoryPathExists(oldMarker))await rename(oldMarker,path.join(recovery,'historical-activation.json'));
    const oldTarget=await memoryHostPath(projectRoot,HISTORICAL_ACTIVATION_LOCK_RELATIVE+'.target');
    if(await memoryPathExists(oldTarget))await rename(oldTarget,path.join(recovery,'historical-activation-lock.target'));
    await publish(markerPath,{...(prior?.marker??{}),schemaVersion:2,mode:'experience-v2',root:MEMORY_ROOT_RELATIVE,status:'complete',
      origin:options.operation==='metadata'?prior!.marker.origin:prior?'relocated':'fresh',hostLayoutVersion:1,...(options.operation==='metadata'?{metadataMigratedAt:new Date().toISOString()}:{}),rootId,activatedAt:new Date().toISOString(),recovery:recoveryRelative,
      ...(backup?{backup}:{}),...(preservedLegacy?{preservedLegacy}:prior?.marker.preservedLegacy?{preservedLegacy:remap(prior.marker.preservedLegacy)}:{}),...(options.operation==='relocate'?{relocatedFrom:HISTORICAL_MEMORY_ROOT_RELATIVE}:{})});
    await readMemoryActivation(projectRoot);
    return {operation:options.operation,dryRun:false,root:canonical,rootId,preservedLegacy,backupMoves};
  });
}
