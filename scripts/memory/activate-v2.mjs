import path from 'node:path';
import fs from 'node:fs/promises';
import net from 'node:net';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {freezeLegacy} from './freeze-v1.mjs';
import {reconcileFinalLegacy} from './reconcile-final-v1.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const old=path.join(root,'runtime','memory'),stage=path.join(root,'runtime','memory-v2-candidate-20261008');
const dest=path.join(root,'runtime','memory-v2'),marker=path.join(root,'runtime','memory-v2-activation.json');
let backupRel;
const hash=b=>createHash('sha256').update(b).digest('hex');
const exists=async p=>await fs.access(p).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e});
async function portOpen(port){return new Promise(done=>{const socket=net.createConnection({host:'127.0.0.1',port});
 const finish=value=>{socket.destroy();done(value)};socket.once('connect',()=>finish(true));
 socket.once('error',()=>finish(false));socket.setTimeout(1200,()=>finish(false));});}
async function walk(dir,prefix=''){const output=[];
 for(const ent of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix?prefix+'/'+ent.name:ent.name;
  if(rel==='.memory.lock'||rel==='.memory.lock.target')continue;
  const current=path.join(dir,ent.name),stat=await fs.lstat(current);
  if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))throw Error('MEMORY_ENTRY_UNSAFE');
  if(stat.isDirectory()){output.push(...await walk(current,rel));continue;}
  output.push({path:rel,bytes:stat.size,sha256:hash(await fs.readFile(current))});
 }return output.sort((a,b)=>a.path.localeCompare(b.path));
}
const port=Number(process.env.AGENT_CORE_PORT||8765);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_LOCAL_PORT');
if(await portOpen(port))throw Error('AGENT_CORE_RUNNING_STOP_LAUNCHER_FIRST');
const phase=step=>console.log(JSON.stringify({kind:'memory-v2-activation-phase',step}));
if(await exists(marker))throw Error('V2_ACTIVATION_MARKER_ALREADY_EXISTS');
// Preflight the complete transfer before freezing a mutable legacy root.
const stageProof=JSON.parse(await fs.readFile(path.join(root,'runtime','backups','memory-v1-pre-v2-20261008','staging-report.json'),'utf8'));
if(stageProof.oldRecords!==122||stageProof.withFoundation!==123||stageProof.archivedV1Records!==122)
 throw Error('V2_STAGING_COUNT_OR_ARCHIVE_MISMATCH');
const api=await import(pathToFileURL(path.join(root,'SubProject','agent-core-memory','dist','index.js')).href);
const policyData=JSON.parse(await fs.readFile(path.join(root,'runtime','backups',
 'memory-v1-pre-v2-20261008','transfer-scope-policy.json'),'utf8'));
if(policyData.schemaVersion!==1||policyData.allowUnscoped!==true||
 !Array.isArray(policyData.allowedWorkspaces)||policyData.allowedWorkspaces.length<1||
 policyData.allowedWorkspaces.some(x=>typeof x!=='string'||!x.trim()||x.length>200)||
 new Set(policyData.allowedWorkspaces).size!==policyData.allowedWorkspaces.length)
 throw Error('V2_MIGRATION_SCOPE_POLICY_INVALID');
const policy={allowedWorkspaces:policyData.allowedWorkspaces,allowUnscoped:true};
phase('verify-staged-snapshot');
const bundle=await api.exportMemoryTransferV2(stage,{...policy,completeness:'complete',chunkBytes:65536});
const preview=api.previewMemoryTransferV2(bundle,policy);
if(preview.completeness!=='complete'||preview.recordCount<122||preview.unresolvedRefs.length)
 throw Error('V2_COMPLETE_EXPORT_PREVIEW_FAILED');
phase('freeze-original-v1');
const frozen=await freezeLegacy(root);
const backup=frozen.final;
backupRel=frozen.relativeManifest;
const {withMemoryProcessLock}=await import(pathToFileURL(path.join(root,'dist','memory','lock.js')).href);
// A completed restore is bound to the exact destination and export digest.
 // Re-exporting produces a new transfer identity, so never replay it blindly.
 // Preserve an interrupted root if and only if all transferable bytes match
 // the reviewed source snapshot; otherwise fail closed for manual inspection.
let interruptedBackup=null;
if(await exists(dest)){
 phase('audit-previous-v2-restore');
 const previous=await api.exportMemoryTransferV2(dest,{...policy,completeness:'complete',chunkBytes:65536});
 const expected=new Map(bundle.manifest.entries.map(e=>[e.path,e.digest+':'+e.bytes]));
 const actual=new Map(previous.manifest.entries.map(e=>[e.path,e.digest+':'+e.bytes]));
 if(bundle.manifest.sourceRootId!==previous.manifest.sourceRootId||
   bundle.manifest.recordCount!==previous.manifest.recordCount||
   expected.size!==actual.size||[...expected].some(([key,value])=>actual.get(key)!==value))
   throw Error('V2_INTERRUPTED_ROOT_DRIFT_REVIEW_REQUIRED');
 const archiveName='memory-v2-interrupted-'+new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)
   +'-'+randomUUID().slice(0,8);
 const archivePath=path.join(root,'runtime','backups',archiveName);
 await fs.rename(dest,archivePath);
 interruptedBackup=archivePath;
 const audit={kind:'verified-interrupted-v2-root',origin:'runtime/memory-v2',
   archivedAt:new Date().toISOString(),archivedRoot:archiveName,
   sourceRootId:previous.manifest.sourceRootId,records:previous.manifest.recordCount,
   transferFileCount:actual.size,allTransferFileDigestsMatched:true,
   sourceBackup:backupRel,reason:'exact-destination-transfer-replay-is-not-authorized'};
 await fs.writeFile(archivePath+'.audit.json',JSON.stringify(audit,null,2)+'\n',{flag:'wx',mode:0o600});
}
phase('restore-v2-final-root');
const receipt=await api.importMemoryTransferV2(bundle,dest,policy);
if(receipt.status!=='complete'||receipt.duplicate)throw Error('V2_FINAL_RESTORE_FAILED');
const service=await api.MemoryService.initialize(root,dest,undefined,{experience:{enabled:true}});
const notes=await service.list();
if(notes.length!==preview.recordCount+1||notes.filter(n=>n.version===2).length!==preview.recordCount)throw Error('V2_FINAL_NOTES_MISMATCH');
phase('reconcile-final-v1-access-metadata');
const synchronized=await reconcileFinalLegacy(root,dest,frozen);
await withMemoryProcessLock(path.join(old,'.memory.lock'),async()=>{
 const live=await walk(old);
 if(live.length!==backup.fileCount||hash(Buffer.from(JSON.stringify(live)))!==backup.snapshotDigest)
  throw Error('LEGACY_CHANGED_AFTER_FREEZE_REBASE_REQUIRED');
},30000);
const files=await walk(dest),finalDigest=hash(Buffer.from(JSON.stringify(files)));
phase('verify-and-publish-activation');
const selection={schemaVersion:1,mode:'experience-v2',root:'runtime/memory-v2',backup:backupRel,
 legacyDigest:backup.snapshotDigest,originalCount:123,sourceCommit:'b266f62ba11b54859185cede8e61c43c4e28cb9a',
 sourceRootId:preview.sourceRootId,finalDigest,activatedAt:new Date().toISOString()};
const temp=marker+'.tmp-'+randomUUID();
await fs.writeFile(temp,JSON.stringify(selection,null,2)+'\n',{flag:'wx',mode:0o600});
await fs.rename(temp,marker);
console.log(JSON.stringify({activated:true,manualRestartRequired:true,root:dest,records:notes.length,
 originalBackupIntact:true,marker,finalDigest,synchronized,
 interruptedBackup,restoredFromExistingBundle:receipt.duplicate}));
