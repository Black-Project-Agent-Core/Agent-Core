import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const frozenName='runtime/memory/state/backups/legacy/memory-v1-final-before-v2-20261008';
async function files(dir,prefix=''){const rows=[];
 for(const ent of await fs.readdir(dir,{withFileTypes:true})){
  const rel=prefix?prefix+'/'+ent.name:ent.name;
  if(rel==='.memory.lock'||rel==='.memory.lock.target'||rel==='state/host'||rel==='state/backups')continue;
  const p=path.join(dir,ent.name),stat=await fs.lstat(p);
  if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile()))throw Error('MEMORY_SOURCE_ENTRY_UNSAFE:'+rel);
  if(stat.isDirectory()){rows.push(...await files(p,rel));continue;}
  rows.push({path:rel,bytes:stat.size,sha256:sha(await fs.readFile(p))});
 }return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
function stableSemantic(v){
 const {lastAccessedAt,retrievalCount,evolutionHistory,...rest}=v;
 return JSON.stringify(rest);
}
export async function freezeLegacy(root){
 const old=path.join(root,'runtime','memory'),
  originalRel='runtime/memory/state/backups/legacy/memory-v1-pre-v2-20261008/manifest.json',
  originalPath=path.join(root,...originalRel.split('/'));
 const baseline=JSON.parse(await fs.readFile(originalPath,'utf8'));
 const [{withMemoryProcessLock},{parseCanonicalNote}]=await Promise.all([
  import(pathToFileURL(path.join(root,'dist','memory','lock.js')).href),
  import(pathToFileURL(path.join(root,'dist','memory','note-format.js')).href)]);
 let selectedName=frozenName;
 let folder=path.join(root,...selectedName.split('/'));
 const initial=path.join(root,'runtime','memory','state','backups','legacy','memory-v1-pre-v2-20261008','memory');
 const already=await fs.access(folder).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e;});
 if(already){
  // Exact same completed freeze can be reused after a failed pre-activation attempt.
  // An incomplete/mismatched freeze must be investigated, not overwritten.
  const saved=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));
  const frozen=await files(path.join(folder,'memory'));
  const latest=await withMemoryProcessLock(path.join(old,'.memory.lock'),()=>files(old),30000);
  if(saved.snapshotDigest!==sha(Buffer.from(JSON.stringify(frozen))) ||
    frozen.length!==saved.fileCount)throw Error('FINAL_V1_BACKUP_CORRUPT');
  const delta=JSON.parse(await fs.readFile(path.join(folder,'freeze-delta.json'),'utf8'));
  if(delta.finalDigest!==saved.snapshotDigest || delta.baseline!==baseline.snapshotDigest)
    throw Error('FINAL_V1_DELTA_CONFLICT');
  if(JSON.stringify(frozen)===JSON.stringify(latest)){
    return {root:folder,manifest:path.join(folder,'manifest.json'),relativeManifest:selectedName+'/manifest.json',
      baseline,final:saved,retrievalDelta:delta.retrievalDelta};
  }
  // The legacy writer may append retrieval evidence after a failed activation.
  // Preserve the prior immutable final snapshot and version a new one. The full
  // source-vs-baseline semantic/append-only checks below still apply.
  const stamp=new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
  selectedName=frozenName+'-retry-'+stamp+'-'+randomUUID().slice(0,8);
  folder=path.join(root,...selectedName.split('/'));
 }
 await fs.mkdir(folder,{recursive:true});
 const result=await withMemoryProcessLock(path.join(old,'.memory.lock'),async()=>{
  const items=await files(old), prior=new Map(baseline.files.map(x=>[x.path,x]));
  const initial=path.join(root,'runtime','memory','state','backups','legacy','memory-v1-pre-v2-20261008','memory');
  const altered=[];
  for(const item of items){
   const before=prior.get(item.path);
   if(!before||before.bytes!==item.bytes||before.sha256!==item.sha256)altered.push(item.path);
   const target=path.join(folder,'memory',...item.path.split('/'));
   await fs.mkdir(path.dirname(target),{recursive:true});
   const data=await fs.readFile(path.join(old,...item.path.split('/')));
   if(sha(data)!==item.sha256)throw Error('LEGACY_SOURCE_DRIFT_DURING_FREEZE');
   await fs.writeFile(target,data,{flag:'wx',mode:0o600});
  }
  const copy=await files(path.join(folder,'memory'));
  if(JSON.stringify(copy)!==JSON.stringify(items))throw Error('FINAL_BACKUP_VERIFY_FAILED');
  const report={fileCount:items.length,snapshotDigest:sha(Buffer.from(JSON.stringify(items))),
   capturedAt:new Date().toISOString(),baselineSnapshotDigest:baseline.snapshotDigest,files:items,alteredFiles:altered};
  await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return report;
 },30000);
 const baselinePaths=new Set(baseline.files.map(x=>x.path));
 const currentPaths=new Set(result.files.map(x=>x.path));
 const missing=[...baselinePaths].filter(x=>!currentPaths.has(x));
 if(missing.length||result.files.length!==baseline.fileCount)throw Error('LEGACY_NOTES_OR_FILES_ADDED_OR_REMOVED_REBASE_REQUIRED');
 const retrievalDelta=[];
 for(const rel of result.alteredFiles){
  if(rel==='state/retrieval-ledger.jsonl'){
   const oldText=(await fs.readFile(path.join(root,'runtime','memory','state','backups','legacy','memory-v1-pre-v2-20261008','memory',...rel.split('/')),'utf8')).split('\n').filter(Boolean);
   const newText=(await fs.readFile(path.join(folder,'memory',...rel.split('/')),'utf8')).split('\n').filter(Boolean);
   if(newText.length<oldText.length||!oldText.every((line,i)=>line===newText[i]))throw Error('LEDGER_NOT_APPEND_ONLY_REBASE_REQUIRED');
   continue;
  }
  if(!/^notes\/[A-Za-z0-9][A-Za-z0-9._-]+\.md$/.test(rel))throw Error('LEGACY_NON_ACCESS_DRIFT_REBASE_REQUIRED:'+rel);
  const before=parseCanonicalNote(await fs.readFile(path.join(initial,...rel.split('/')),'utf8'));
  const now=parseCanonicalNote(await fs.readFile(path.join(folder,'memory',...rel.split('/')),'utf8'));
  if(stableSemantic(before)!==stableSemantic(now)||now.retrievalCount<before.retrievalCount)
   throw Error('LEGACY_SEMANTIC_CHANGED_REBASE_REQUIRED:'+rel);
  const expectedEvents=before.evolutionHistory,newEvents=now.evolutionHistory;
  const prefix=newEvents.length>=expectedEvents.length&&expectedEvents.every((e,i)=>JSON.stringify(e)===JSON.stringify(newEvents[i]));
  if(!prefix||newEvents.slice(expectedEvents.length).some(x=>x.kind!=='retrieved'))
    throw Error('LEGACY_EVENTS_CHANGED_REBASE_REQUIRED:'+rel);
  retrievalDelta.push({id:before.id,beforeCount:before.retrievalCount,afterCount:now.retrievalCount,
    beforeLastAccess:before.lastAccessedAt,afterLastAccess:now.lastAccessedAt,appendedEvents:newEvents.slice(expectedEvents.length)});
 }
 const manifestPath=path.join(folder,'manifest.json');
 await fs.writeFile(path.join(folder,'freeze-delta.json'),JSON.stringify({kind:'access-only-delta',baseline:baseline.snapshotDigest,
   finalDigest:result.snapshotDigest,alteredFiles:result.alteredFiles,retrievalDelta},null,2)+'\n',{flag:'wx',mode:0o600});
 return {root:folder,manifest:manifestPath,relativeManifest:selectedName+'/manifest.json',
   baseline,final:result,retrievalDelta};
}
export {files as listMemoryFiles};
