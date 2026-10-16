// Fixture-only orchestration, deliberately not a production migration API.
// It exercises the real lock, archive, checksum, journal, and activation primitives.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FileMemoryStore } from '../../../../src/memory/store.js';
import { resolveMemoryPaths } from '../../../../src/memory/paths.js';
import { withMemoryProcessLock } from '../../../../src/memory/lock.js';
import { fingerprintFile, fingerprintText, MemoryTransactionCoordinator, type MemoryTransactionMutation } from '../../../../src/memory/transaction.js';
import { buildArchiveMutations, readArchivedMemory, readArchiveManifest, readArchiveObject } from '../../../../src/memory/archive.js';
import { upgradeLegacySnapshot } from '../../../../src/memory/migration.js';
import { memorySemanticRevision } from '../../../../src/memory/disclosure.js';
import { serializeCanonicalNote } from '../../../../src/memory/note-format.js';
import { readMemoryRevisions } from '../../../../src/memory/revisions.js';
import { experienceManifestSchema, type SourceRef } from '../../../../src/memory/experience-types.js';
import type { MemoryRecordV1 } from '../../../../src/memory/types.js';

export async function syntheticCopyUpgrade(sourceRoot:string,targetRoot:string,stop?:'incomplete'|'copied') {
 const source=resolveMemoryPaths(sourceRoot,sourceRoot), target=resolveMemoryPaths(targetRoot,targetRoot);
 const stable=await withMemoryProcessLock(source.lock,async()=>{
   await new MemoryTransactionCoordinator(source.state).recover();
   const loaded=await new FileMemoryStore(source).loadAll();
   if(!loaded.complete||loaded.records.some(record=>record.version!==1))throw new Error('SYNTHETIC_SOURCE_INVALID');
   const records=loaded.records as MemoryRecordV1[];
   const files=new Map<string,string>();
   for(const name of ['00-agent-core-memory.md',...records.filter(r=>!r.pinned).map(r=>`notes/${r.id}.md`),
     ...records.filter(r=>!r.pinned).map(r=>`state/revisions/${r.id}.json`),'state/feedback.json','state/retrieval-ledger.jsonl','state/retrieval-use-receipts.jsonl']) {
     const bytes=await readFile(path.join(source.root,name),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
     if(bytes!==null)files.set(name,bytes);
   }
   const history=[];
   for(const record of records) {
     const available=await readMemoryRevisions(source,record.id,8);
     if(available.warning)throw new Error('SYNTHETIC_HISTORY_INVALID');
     history.push(...available.revisions.map(revision=>revision.record));
   }
   const digest=`sha256:${fingerprintText(JSON.stringify([...files].map(([name,bytes])=>[name,fingerprintText(bytes)]).sort()))}`;
   return {records,history,files,digest};
 });
 return withMemoryProcessLock(target.lock,async()=>{
   const tx=new MemoryTransactionCoordinator(target.state);await tx.recover();
   const upgraded=upgradeLegacySnapshot(stable.records.filter(record=>!record.pinned));
   const retained=[...stable.records,...stable.history,...upgraded];
   const refs:SourceRef[]=[...new Map(retained.map(record=>{const ref:SourceRef={kind:'memory',id:record.id,revision:memorySemanticRevision(record)};return [`${ref.id}:${ref.revision}`,ref];})).values()];
   const audit={schemaVersion:1,id:'synthetic-upgrade-source',purpose:'available-legacy-evidence',sourceRefs:refs,
     details:{historyCompleteness:'available-only',files:[...stable.files].map(([name,bytes])=>({name,digest:`sha256:${fingerprintText(bytes)}`})),availableHistoricalSnapshots:stable.history.length}};
   const auditBytes=JSON.stringify(audit)+'\n';const auditRef:SourceRef={kind:'manifest',id:audit.id,revision:`sha256:${fingerprintText(auditBytes)}`};
   const existing=await readFile(target.experienceManifest,'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   const manifest=existing?experienceManifestSchema.parse(JSON.parse(existing)):{schemaVersion:1 as const,formatVersion:2 as const,rootId:'synthetic-copy-target',generation:1,status:'incomplete' as const,
     origin:{sourceDigest:stable.digest,sourceCount:upgraded.length,historyCompleteness:'available-only' as const,sourceRefs:[auditRef]}};
   if(manifest.origin?.sourceDigest!==stable.digest)throw new Error('SYNTHETIC_SOURCE_CHANGED');
   if(!existing) {
     const loaded=await new FileMemoryStore(target).loadAll();if(!loaded.complete||loaded.records.some(r=>!r.pinned))throw new Error('SYNTHETIC_TARGET_NOT_EMPTY');
     await tx.commit([{targetPath:target.experienceManifest,content:JSON.stringify(manifest)+'\n',expectedFingerprint:null}]);
   }
   if(stop==='incomplete')return {complete:false,refs,auditRef,sourceDigest:stable.digest};
   if(manifest.status!=='complete') {
     const mutations:MemoryTransactionMutation[]=await buildArchiveMutations(target,retained);
     const targets=new Set(mutations.map(m=>m.targetPath));
     const add=async(targetPath:string,content:string)=>{
       if(targets.has(targetPath))return;targets.add(targetPath);
       const expectedFingerprint=await fingerprintFile(targetPath);
       if(targetPath.startsWith(path.join(target.root,'archive')+path.sep) && expectedFingerprint!==null && expectedFingerprint!==fingerprintText(content))throw new Error('SYNTHETIC_IMMUTABLE_CONFLICT');
       mutations.push({targetPath,content,expectedFingerprint});
     };
     for(const [name,bytes] of stable.files) {
       await add(path.join(target.archiveObjects,fingerprintText(bytes)),bytes);
       if(name==='00-agent-core-memory.md'||name==='state/feedback.json'||name.startsWith('state/revisions/'))await add(path.join(target.root,name),bytes);
     }
     await add(path.join(target.archiveManifests,`${audit.id}.json`),auditBytes);
     for(const record of upgraded)await add(path.join(target.notes,`${record.id}.md`),serializeCanonicalNote(record));
     await tx.commit(mutations);
   }
   if(stop==='copied')return {complete:false,refs,auditRef,sourceDigest:stable.digest};
   // Read back through production readers before publishing completed activation last.
   for(const ref of refs)await readArchivedMemory(target,ref);
   await readArchiveManifest(target,auditRef);
   for(const [,bytes] of stable.files)if(await readArchiveObject(target,`sha256:${fingerprintText(bytes)}`)!==bytes)throw new Error('SYNTHETIC_SOURCE_BYTES_CHANGED');
   const loaded=await new FileMemoryStore(target).loadAll();
   if(!loaded.complete||loaded.records.filter(r=>!r.pinned).length!==upgraded.length)throw new Error('SYNTHETIC_COUNT_MISMATCH');
   for(const record of upgraded)if(memorySemanticRevision(loaded.records.find(r=>r.id===record.id)!)!==memorySemanticRevision(record))throw new Error('SYNTHETIC_RECORD_MISMATCH');
   if(manifest.status!=='complete')await tx.commit([{targetPath:target.experienceManifest,content:JSON.stringify({...manifest,status:'complete'})+'\n',expectedFingerprint:await fingerprintFile(target.experienceManifest)}]);
   return {complete:true,refs,auditRef,sourceDigest:stable.digest};
 });
}
