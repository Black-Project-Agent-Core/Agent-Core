import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function reconcileFinalLegacy(root,target,frozen){
 const backupRoot=path.join(frozen.root,'memory');
 const initialRoot=path.join(root,'runtime','memory','state','backups','legacy','memory-v1-pre-v2-20261008','memory');
 const {FileMemoryStore}=await import(pathToFileURL(path.join(root,'dist','memory','store.js')).href);
 const {resolveMemoryPaths}=await import(pathToFileURL(path.join(root,'dist','memory','paths.js')).href);
 const {parseCanonicalNote}=await import(pathToFileURL(path.join(root,'dist','memory','note-format.js')).href);
 const {withMemoryProcessLock}=await import(pathToFileURL(path.join(root,'dist','memory','lock.js')).href);
 const store=new FileMemoryStore(resolveMemoryPaths(root,target),{experience:{enabled:true}});
 const deltas=[];
 let appliedNotes=0;
 let replayedNotes=0;
 for(const rec of frozen.retrievalDelta){
  const id=rec.id;
  const note=parseCanonicalNote(await fs.readFile(path.join(backupRoot,'notes',id+'.md'),'utf8'));
  const prior=parseCanonicalNote(await fs.readFile(path.join(initialRoot,'notes',id+'.md'),'utf8'));
  if(prior.id!==note.id||prior.retrievalCount!==rec.beforeCount||note.retrievalCount!==rec.afterCount)
   throw Error('FINAL_V1_RETRIEVAL_DELTA_INCONSISTENT');
  deltas.push({id,metadata:note,events:rec.appendedEvents,
    beforeCount:rec.beforeCount,beforeLastAccess:rec.beforeLastAccess});
 }
 if(deltas.length){
  const result=await store.transact([],({records})=>{const touch=new Set();let replayed=0;
   const changed=records.map(record=>{
    const delta=deltas.find(d=>d.id===record.id);
    if(!delta)return record;
    if(record.version!==2)throw Error('FINAL_DELTA_V2_VERSION_CONFLICT:'+record.id);
    const tail=record.evolutionHistory.slice(-delta.events.length);
    const eventsPresent=delta.events.length===0||JSON.stringify(tail)===JSON.stringify(delta.events);
    if(record.retrievalCount===delta.metadata.retrievalCount &&
       record.lastAccessedAt===delta.metadata.lastAccessedAt && eventsPresent){replayed++;return record;}
    if(record.retrievalCount!==delta.beforeCount || record.lastAccessedAt!==delta.beforeLastAccess)
      throw Error('FINAL_DELTA_V2_CONFLICT:'+record.id);
    touch.add(record.id);
    return {...record,lastAccessedAt:delta.metadata.lastAccessedAt,
      retrievalCount:delta.metadata.retrievalCount,
      evolutionHistory:[...record.evolutionHistory,...delta.events]};
   });
   return {records:changed,touchedIds:[...touch],stateWrites:[],result:{updatedNotes:touch.size,alreadyApplied:replayed}};
  });
  if(result.result.updatedNotes+result.result.alreadyApplied!==deltas.length)
    throw Error('FINAL_V1_SYNC_NOT_APPLIED');
  appliedNotes=result.result.updatedNotes;
  replayedNotes=result.result.alreadyApplied;
 }
 const relative='state/retrieval-ledger.jsonl',original=path.join(initialRoot,...relative.split('/')),
  latest=path.join(backupRoot,...relative.split('/')),destination=path.join(target,...relative.split('/'));
 const expected=await fs.readFile(original),source=await fs.readFile(latest);
 await withMemoryProcessLock(path.join(target,'.memory.lock'),async()=>{
  const targetBytes=await fs.readFile(destination);
  if(sha(targetBytes)!==sha(source)){
   if(sha(targetBytes)!==sha(expected))throw Error('V2_LEDGER_BASELINE_NOT_IDENTICAL');
   const temp=destination+'.v1-final-'+process.pid+'.tmp';
   await fs.writeFile(temp,source,{flag:'wx',mode:0o600});
   await fs.rename(temp,destination);
  }
  if(sha(await fs.readFile(destination))!==sha(source))throw Error('V2_LEDGER_FROZEN_COPY_MISMATCH');
 },30000);
 return {accessNotesReconciled:appliedNotes,accessNotesAlreadyApplied:replayedNotes,
  ledgerBytes:source.length,ledgerSha256:sha(source),oldV1SnapshotRetained:true};
}
