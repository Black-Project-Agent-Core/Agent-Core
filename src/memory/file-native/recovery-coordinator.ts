import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import * as z from 'zod/v4';
import { atomicReplaceValidated } from './atomic-writer.js';
import type { FileNativeMemoryPaths } from './paths.js';
import { fileNativePrincipalNamespace, fileNativeProjectNamespace } from './paths.js';
import { validateDirectMemoryDocument, type WorkflowBackup } from './supabase-direct.js';
import { FileNativeAuxStore } from './aux-store.js';
import { FileNativeMemoryRepository, segmentInScope } from './vault-repository.js';
import { parseVaultSegment, serializeVaultSegment } from './vault-codec.js';
import { makeWorkflowProjectionRecord, makeWorkflowProjectionSnapshot, readWorkflowProjection, validateWorkflowProjectionDocument, workflowCanonicalJson, workflowHash } from './workflow-projection.js';
import { hydrateEngineeringSourceBlobs } from './workflow-source-projection.js';

const ticketSchema=z.strictObject({pid:z.number().int().positive(),token:z.string().uuid(),mode:z.enum(['reader','recovery']),number:z.number().int().nonnegative()});
type Ticket=z.infer<typeof ticketSchema>;
function alive(pid:number){try{process.kill(pid,0);return true;}catch(error){return(error as NodeJS.ErrnoException).code!=='ESRCH';}}
const fail=(code:string):never=>{throw new Error(code);};
async function exists(file:string){try{await lstat(file);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
export interface MemoryRecoveryLease { release():Promise<void> }

/** Readers are backend lifetimes. Recovery never races a cooperating live backend or another recovery. */
export async function acquireMemoryRecoveryLease(paths:FileNativeMemoryPaths,mode:'reader'|'recovery'):Promise<MemoryRecoveryLease>{
  const directory=path.join(paths.memoryRoot,'recovery','leases');await mkdir(directory,{recursive:true});
  const root=await realpath(directory),token=randomUUID(),file=path.join(root,`${token}.json`);
  const publish=async(number:number)=>atomicReplaceValidated(file,JSON.stringify({pid:process.pid,token,mode,number}),text=>{ticketSchema.parse(JSON.parse(text));});
  const tickets=async()=>{
    const out:Ticket[]=[];
    for(const name of await readdir(root)){
      if(!name.endsWith('.json'))continue;
      let text:string;try{text=await readFile(path.join(root,name),'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
      const parsed=ticketSchema.safeParse(JSON.parse(text));if(!parsed.success||name!==parsed.data.token+'.json')return fail('MEMORY_RECOVERY_LEASE_CORRUPT');
      if(alive(parsed.data.pid))out.push(parsed.data);
    }
    return out;
  };
  let released=false;
  const release=async()=>{if(!released){await rm(file,{force:true});released=true;}};
  await publish(0);
  try{
    if(mode==='reader'){
      if((await tickets()).some(t=>t.mode==='recovery'))return fail('MEMORY_RECOVERY_ACTIVE');
    }else{
      const number=1+Math.max(0,...(await tickets()).filter(t=>t.mode==='recovery').map(t=>t.number));
      if(!Number.isSafeInteger(number))return fail('MEMORY_RECOVERY_LEASE_CORRUPT');
      await publish(number);const deadline=Date.now()+5000;
      for(;;){
        const other=(await tickets()).filter(t=>t.token!==token);
        if(other.some(t=>t.mode==='reader'))return fail('MEMORY_RECOVERY_REQUIRES_STOPPED_RUNTIME');
        if(!other.some(t=>t.number===0||t.number<number||t.number===number&&t.token<token))break;
        if(Date.now()>deadline)return fail('MEMORY_RECOVERY_BUSY');
        await new Promise(resolve=>setTimeout(resolve,15));
      }
    }
    return{release};
  }catch(error){await release();throw error;}
}

const journalPath=(paths:FileNativeMemoryPaths)=>path.join(paths.memoryRoot,'recovery','workflow-restore.json');
const journalSchema=z.strictObject({schemaVersion:z.literal(1),transactionId:z.string().uuid(),scope:z.strictObject({principalId:z.string(),projectId:z.string()}),
  stage:z.string(),rollback:z.string(),generationId:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['prepared','old_moved','published'])});
type Journal=z.infer<typeof journalSchema>;
export async function assertNoMemoryRecoveryPending(paths:FileNativeMemoryPaths):Promise<void>{
  if(await exists(journalPath(paths)) || await exists(path.join(paths.memoryRoot,'recovery','workflow-classification.json')))return fail('MEMORY_RECOVERY_PENDING');
}
async function inventory(root:string):Promise<Map<string,string>>{
  const found=new Map<string,string>();
  if(!await exists(root))return found;
  const walk=async(dir:string)=>{for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name);if(entry.isSymbolicLink())return fail('MEMORY_RECOVERY_SYMLINK_UNSUPPORTED');
    if(entry.isDirectory())await walk(file);else if(entry.isFile())found.set(path.relative(root,file),createHash('sha256').update(await readFile(file)).digest('hex'));else return fail('MEMORY_RECOVERY_FILE_INVALID');
  }};
  if((await lstat(root)).isSymbolicLink())return fail('MEMORY_RECOVERY_SYMLINK_UNSUPPORTED');await walk(root);return found;
}
const sameInventory=(a:Map<string,string>,b:Map<string,string>)=>a.size===b.size&&[...a].every(([key,value])=>b.get(key)===value);
function validateJournalPaths(paths:FileNativeMemoryPaths,journal:Journal){
  const expectedStage=path.join(paths.memoryRoot,'recovery',`stage-${journal.transactionId}`),expectedRollback=path.join(paths.memoryRoot,'backups',`workflow-${journal.transactionId}`);
  if(path.resolve(journal.stage)!==path.resolve(expectedStage)||path.resolve(journal.rollback)!==path.resolve(expectedRollback))return fail('MEMORY_RECOVERY_PATH_INVALID');
}
async function writeJournal(paths:FileNativeMemoryPaths,journal:Journal){await atomicReplaceValidated(journalPath(paths),JSON.stringify(journal),text=>{validateJournalPaths(paths,journalSchema.parse(JSON.parse(text)));});}
async function validateStage(paths:FileNativeMemoryPaths,backup:WorkflowBackup,root:string){
  const candidate={...paths,vaultRoot:root},projection=await readWorkflowProjection(candidate,backup.snapshot);
  if(workflowCanonicalJson(projection.manifest.records)!==workflowCanonicalJson(backup.snapshot.manifest.records))return fail('MEMORY_RECOVERY_WORKFLOW_VERIFY_FAILED');
  const repo=new FileNativeMemoryRepository(candidate),snapshot=await repo.readSnapshot({verifyContent:true});
  if(snapshot.malformedFiles.length)return fail('MEMORY_RECOVERY_VAULT_INVALID');
  const localIds=snapshot.spines.filter(spine=>segmentInScope(candidate,spine,backup.snapshot)).flatMap(spine=>spine.memoryIds).sort();
  const restoredIds=backup.memoryDocuments.map(document=>document.entry.memoryId).sort();
  if(workflowCanonicalJson(localIds)!==workflowCanonicalJson(restoredIds))return fail('MEMORY_RECOVERY_LOCAL_CONFLICT');
  for(const document of backup.memoryDocuments){
    const found=await repo.findEntry(backup.snapshot,document.entry.memoryId,snapshot);
    if(!found)return fail('MEMORY_RECOVERY_MEMORY_MISSING');
    const revisions=await repo.listRevisions(backup.snapshot,document.entry.memoryId,snapshot);
    const restored={principalId:document.principalId,projectId:document.projectId,entry:found.entry,revisions};
    if(workflowHash(restored)!==workflowHash(document))return fail('MEMORY_RECOVERY_MEMORY_VERIFY_FAILED');
  }
}

/** Caller must hold the exclusive recovery lease for the entire staging and publication. */
export async function restoreWorkflowBackup(paths:FileNativeMemoryPaths,backup:WorkflowBackup,
  hooks:{afterOldMoved?:()=>Promise<void>}={}):Promise<{recordCount:number;memoryCount:number;rollbackPath:string}>{
  const memories=backup.memoryDocuments.map(doc=>validateDirectMemoryDocument(doc,backup.snapshot));
  for(const doc of memories){
    if(new Set(doc.revisions.map(r=>r.revisionId)).size!==doc.revisions.length||new Set(doc.revisions.map(r=>r.revisionNo)).size!==doc.revisions.length
      ||!doc.revisions.some(r=>r.revisionId===doc.entry.revisionId&&r.revisionNo===doc.entry.revisionNo&&r.valueHash===doc.entry.valueHash))return fail('MEMORY_RECOVERY_REVISIONS_INVALID');
  }
  const validated=makeWorkflowProjectionSnapshot(backup.snapshot,backup.snapshot.records.map(record=>makeWorkflowProjectionRecord(record.category,record.recordId,record.document,backup.snapshot)),
    memories.map(doc=>({memoryId:doc.entry.memoryId,contentHash:workflowHash(doc)})));
  if(validated.logicalStateHash!==backup.snapshot.logicalStateHash||validated.logicalStateHash!==backup.generation.generationId||validated.logicalStateHash!==backup.generation.logicalStateHash)return fail('MEMORY_RECOVERY_GENERATION_INVALID');
  let journal:Journal|undefined;
  if(await exists(journalPath(paths))){journal=journalSchema.parse(JSON.parse(await readFile(journalPath(paths),'utf8')));validateJournalPaths(paths,journal);
    if(journal.generationId!==backup.generation.generationId||journal.scope.principalId!==backup.snapshot.principalId||journal.scope.projectId!==backup.snapshot.projectId)return fail('MEMORY_RECOVERY_DIFFERENT_GENERATION');
  }
  if(!journal){
    const baseline=await inventory(paths.vaultRoot),transactionId=randomUUID();
    const stage=path.join(paths.memoryRoot,'recovery',`stage-${transactionId}`),rollback=path.join(paths.memoryRoot,'backups',`workflow-${transactionId}`);
    await mkdir(path.dirname(stage),{recursive:true});
    if(await exists(paths.vaultRoot))await cp(paths.vaultRoot,stage,{recursive:true,errorOnExist:true,force:false});else await mkdir(stage);
    if(!sameInventory(baseline,await inventory(stage)))return fail('MEMORY_RECOVERY_BACKUP_VERIFY_FAILED');
    const stagePaths={...paths,vaultRoot:stage},aux=new FileNativeAuxStore(stagePaths),repo=new FileNativeMemoryRepository(stagePaths);
    for(const record of backup.snapshot.records){
      const prior=await aux.get(record.category,record.recordId);
      if(prior&&makeWorkflowProjectionRecord(record.category,record.recordId,prior,backup.snapshot).contentHash!==record.contentHash)return fail('MEMORY_RECOVERY_LOCAL_CONFLICT');
      const document={...record.document,...(['lifecycles','continuity-turns'].includes(record.category)?{expiresAt:0}:{}),
        ...(record.category==='lifecycles'&&record.document.postflightState==='CLOSED'
          ?{localDurableGeneration:'supabase-workflow-v1:'+backup.generation.generationId,localDurableHash:backup.generation.logicalStateHash}:{})};
      validateWorkflowProjectionDocument(record.category,document);await aux.put(record.category,record.recordId,document);
    }
    for(const document of backup.memoryDocuments){
      const found=await repo.findEntry(backup.snapshot,document.entry.memoryId);
      if(found){if(workflowHash(found.entry)!==workflowHash(document.entry))return fail('MEMORY_RECOVERY_LOCAL_CONFLICT');}
      else{
        const current=await repo.scanSegments();
        if(current.malformedFiles.length||current.segments.some(segment=>segment.principalId===document.principalId&&segment.projectId===document.projectId&&segment.entries.some(entry=>entry.canonicalKey===document.entry.canonicalKey)))return fail('MEMORY_RECOVERY_LOCAL_CONFLICT');
        const relativePath=path.join('General','Restored',fileNativePrincipalNamespace(document.principalId),fileNativeProjectNamespace(document.projectId),`${document.entry.memoryId}.md`).replaceAll('\\','/');
        const content=serializeVaultSegment({schemaVersion:1,fileId:`restored-${document.entry.memoryId}`,relativePath,contextFamily:'general',principalId:document.principalId,
          projectId:document.projectId,topicKey:`restored-${document.entry.memoryId}`,segmentNo:1,createdAt:new Date(document.entry.createdAt).toISOString(),
          updatedAt:new Date(document.entry.updatedAt).toISOString(),entries:[document.entry]});
        await atomicReplaceValidated(path.join(stage,relativePath),content,text=>{parseVaultSegment(text,relativePath);});
      }
      for(const revision of document.revisions.filter(r=>r.revisionId!==document.entry.revisionId)){
        const file=path.join(stage,'.agent-core','history',document.entry.memoryId,`${revision.revisionNo}-${revision.revisionId}.md`);
        if(await exists(file)){if(workflowHash(JSON.parse(await readFile(file,'utf8')))!==workflowHash(revision))return fail('MEMORY_RECOVERY_LOCAL_CONFLICT');}
        else await atomicReplaceValidated(file,JSON.stringify(revision,null,2)+'\n',text=>{if(workflowHash(JSON.parse(text))!==workflowHash(revision))return fail('MEMORY_RECOVERY_REVISION_INVALID');});
      }
    }
    await validateStage(paths,backup,stage);
    if(!sameInventory(baseline,await inventory(paths.vaultRoot)))return fail('MEMORY_RECOVERY_LOCAL_CHANGED');
    journal={schemaVersion:1,transactionId,scope:{principalId:backup.snapshot.principalId,projectId:backup.snapshot.projectId},stage,rollback,generationId:backup.generation.generationId,state:'prepared'};
    await writeJournal(paths,journal);
  }
  if(journal.state==='prepared'){
    if(await exists(journal.stage))await validateStage(paths,backup,journal.stage);
    if(await exists(paths.vaultRoot)){
      if(await exists(journal.rollback))return fail('MEMORY_RECOVERY_AMBIGUOUS_STATE');
      await mkdir(path.dirname(journal.rollback),{recursive:true});await rename(paths.vaultRoot,journal.rollback);
    }
    journal.state='old_moved';await writeJournal(paths,journal);await hooks.afterOldMoved?.();
  }
  if(journal.state==='old_moved'){
    if(!await exists(paths.vaultRoot)){await validateStage(paths,backup,journal.stage);await rename(journal.stage,paths.vaultRoot);}
    await validateStage(paths,backup,paths.vaultRoot);journal.state='published';await writeJournal(paths,journal);
  }
  await validateStage(paths,backup,paths.vaultRoot);
  await hydrateEngineeringSourceBlobs(paths,backup.snapshot.records.map(record=>record.document));
  await rm(journalPath(paths),{force:true});
  return{recordCount:backup.snapshot.records.length,memoryCount:backup.memoryDocuments.length,rollbackPath:journal.rollback};
}
