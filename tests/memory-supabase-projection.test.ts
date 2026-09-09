import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { SupabaseDirectMemory, type DirectMemoryDocument, type SupabaseDirectTransport } from '../src/memory/file-native/supabase-direct.js';
import { parseVaultSegment, serializeVaultSegment } from '../src/memory/file-native/vault-codec.js';
import type { VaultMemoryEntry } from '../src/memory/file-native/types.js';

const observations=vi.hoisted(()=>({directories:[] as string[],files:[] as string[],blockedDirectory:'',blockedFile:'',fileError:'EIO',afterRead:undefined as undefined|((file:string)=>Promise<void>),afterDirectoryRead:undefined as undefined|((file:string)=>Promise<void>)}));
vi.mock('node:fs/promises',async importOriginal=>{
  const original=await importOriginal<typeof import('node:fs/promises')>();
  return{...original,
    readdir:async(...args:any[])=>{
      observations.directories.push(String(args[0]));
      if(String(args[0])===observations.blockedDirectory)return Promise.reject(Object.assign(new Error('fixture directory error'),{code:'EIO'}));
      const result=await(original.readdir as any)(...args);await observations.afterDirectoryRead?.(String(args[0]));return result;
    },
    readFile:async(...args:any[])=>{
      observations.files.push(String(args[0]));
      if(String(args[0])===observations.blockedFile)return Promise.reject(Object.assign(new Error('fixture read error'),{code:observations.fileError}));
      const result=await(original.readFile as any)(...args);await observations.afterRead?.(String(args[0]));return result;
    },
  };
});
const roots:string[]=[],scope={principalId:'projection-fixture',projectId:'projection-project'};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const directDocuments=(direct:SupabaseDirectMemory)=>(direct as unknown as {documents(scope:typeof scope):Promise<DirectMemoryDocument[]>}).documents(scope);
function resetObservations(){observations.directories=[];observations.files=[];}
async function fixture(count=128){
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-projection-fixture-'));roots.push(root);
  const paths=resolveFileNativeMemoryPaths(root),entries:VaultMemoryEntry[]=[];
  for(let i=0;i<count;i++)entries.push({memoryId:randomUUID(),revisionId:randomUUID(),revisionNo:1,canonicalKey:`decision:projection-${i}`,kind:'decision',state:'active',importance:.5,pinned:false,enforcement:'soft',valueText:`Use fixture choice ${i}.`,valueHash:digest(`Use fixture choice ${i}.`),createdAt:1000,updatedAt:1000,relations:[]});
  await mkdir(path.join(paths.vaultRoot,'Decisions'),{recursive:true});
  for(let start=0;start<count;start+=64){
    const relativePath=`Decisions/part-${String(start/64).padStart(5,'0')}.md`;
    await writeFile(path.join(paths.vaultRoot,relativePath),serializeVaultSegment({schemaVersion:1,fileId:`part-${start}`,relativePath,contextFamily:'decision',...scope,topicKey:'projection',segmentNo:start/64+1,createdAt:new Date(1000).toISOString(),updatedAt:new Date(1000).toISOString(),entries:entries.slice(start,start+64)}));
  }
  const repo=new FileNativeMemoryRepository(paths),aux=new FileNativeAuxStore(paths),remote=new Map<string,DirectMemoryDocument>(),operations:string[]=[];
  const transport:SupabaseDirectTransport={async call(operation,payload){operations.push(operation);if(operation==='health')return{schemaVersion:1,workflowSchemaVersion:1};if(operation==='get')return remote.get(String(payload.memoryId))??null;if(operation==='upsert'){const doc=payload.document as DirectMemoryDocument;remote.set(doc.entry.memoryId,structuredClone(doc));return{applied:true,version:randomUUID()};}throw new Error('Unexpected fixture operation');}};
  return{root,paths,entries,repo,aux,remote,operations,direct:new SupabaseDirectMemory(paths,repo,aux,transport,'https://fixture.supabase.co')};
}
afterEach(async()=>{
  observations.blockedDirectory='';observations.blockedFile='';observations.fileError='EIO';observations.afterRead=undefined;observations.afterDirectoryRead=undefined;resetObservations();
  for(const root of roots.splice(0)){
    if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(root).startsWith('ac-projection-fixture-'))throw new Error('Unsafe projection fixture cleanup');
    await rm(root,{recursive:true,force:true,maxRetries:3});
  }
});

describe('Supabase canonical projection work',()=>{
  it('projects an isolated representative vault with current revision identity and scope',async()=>{
    const count=process.env.AGENT_CORE_PROJECTION_MEASURE==='1'?2048:128,f=await fixture(count),measurements=[];
    for(let pass=0;pass<3;pass++){
      resetObservations();const start=performance.now(),documents=await directDocuments(f.direct),elapsedMs=performance.now()-start;
      expect(documents).toHaveLength(count);
      expect(documents.map(doc=>doc.entry.memoryId)).toEqual(f.entries.map(entry=>entry.memoryId));
      expect(documents.every(doc=>doc.principalId===scope.principalId&&doc.projectId===scope.projectId&&doc.revisions.length===1&&doc.revisions[0]?.revisionId===doc.entry.revisionId)).toBe(true);
      expect(observations.directories.some(file=>file.includes(`${path.sep}.agent-core${path.sep}history${path.sep}`))).toBe(false);
      measurements.push({phase:'documents',pass,elapsedMs:Number(elapsedMs.toFixed(3)),historyDirectoryReads:observations.directories.filter(file=>file.includes(`${path.sep}.agent-core${path.sep}history`)).length,canonicalReads:observations.files.filter(file=>file.endsWith('.md')).length});
    }
    resetObservations();const start=performance.now();expect(await f.direct.pending(scope)).toBe(count);
    measurements.push({phase:'pending',elapsedMs:Number((performance.now()-start).toFixed(3)),historyDirectoryReads:observations.directories.filter(file=>file.includes(`${path.sep}.agent-core${path.sep}history`)).length,receiptReads:observations.files.filter(file=>file.includes('supabase-direct-receipts')).length});
    if(process.env.AGENT_CORE_PROJECTION_REPORT)await writeFile(process.env.AGENT_CORE_PROJECTION_REPORT,JSON.stringify({count,segments:count/64,measurements},null,2)+'\n');
  });

  it('reads existing history freshly, preserves single-memory results, and opens only scoped history directories',async()=>{
    const f=await fixture(),entry=f.entries[0]!;
    await f.repo.revise({scope,memoryId:entry.memoryId,value:'Use the revised fixture choice.'});
    const historyRoot=path.join(f.paths.vaultRoot,'.agent-core','history'),directory=path.join(historyRoot,entry.memoryId);
    const foreign=path.join(historyRoot,'foreign-memory');await mkdir(foreign);await writeFile(path.join(foreign,'malformed.md'),'not a revision');
    observations.blockedDirectory=foreign;resetObservations();
    const first=await directDocuments(f.direct);
    expect(first[0]!.revisions).toEqual(await f.repo.listRevisions(scope,entry.memoryId));
    expect(first[0]!.revisions).toHaveLength(2);
    expect(observations.directories).not.toContain(foreign);
    const file=path.join(directory,(await readdir(directory))[0]!),prior=JSON.parse(await readFile(file,'utf8'));
    await writeFile(file,JSON.stringify({...prior,valueText:'An externally corrected historical observation.'}));
    const second=await directDocuments(f.direct);
    expect(second[0]!.revisions[0]!.valueText).toBe('An externally corrected historical observation.');
    expect(digest(second)).not.toBe(digest(first));
  });

  it.each(['ENOENT','EIO'])('rejects %s from a listed revision without omitting prior history',async code=>{
    const f=await fixture(1),entry=f.entries[0]!;await f.repo.revise({scope,memoryId:entry.memoryId,value:'Updated fixture choice.'});
    const directory=path.join(f.paths.vaultRoot,'.agent-core','history',entry.memoryId);
    observations.blockedFile=path.join(directory,(await readdir(directory))[0]!);observations.fileError=code;
    await expect(directDocuments(f.direct)).rejects.toThrow('MEMORY_REVISION_HISTORY_READ_FAILED');
    await expect(f.repo.listRevisions(scope,entry.memoryId)).rejects.toThrow('MEMORY_REVISION_HISTORY_READ_FAILED');
    await expect(f.direct.sync(scope)).resolves.toMatchObject({state:'pending',pendingItems:-1});
    expect(f.operations).not.toContain('upsert');
  });

  it('rejects malformed revision bytes and unavailable history enumeration',async()=>{
    const f=await fixture(1),entry=f.entries[0]!;await f.repo.revise({scope,memoryId:entry.memoryId,value:'Updated fixture choice.'});
    const root=path.join(f.paths.vaultRoot,'.agent-core','history'),directory=path.join(root,entry.memoryId),file=path.join(directory,(await readdir(directory))[0]!);
    const text=await readFile(file,'utf8');await writeFile(file,'synthetic private invalid revision');
    await expect(directDocuments(f.direct)).rejects.toThrow('MEMORY_REVISION_HISTORY_INVALID');
    await writeFile(file,text);observations.blockedDirectory=root;
    await expect(directDocuments(f.direct)).rejects.toThrow('MEMORY_REVISION_HISTORY_READ_FAILED');
  });

  it('detects a new history directory introduced during a projection pass',async()=>{
    const f=await fixture(2),root=path.join(f.paths.vaultRoot,'.agent-core','history');await mkdir(root,{recursive:true});
    observations.afterDirectoryRead=async file=>{
      if(file!==root)return;observations.afterDirectoryRead=undefined;
      await mkdir(path.join(root,f.entries[0]!.memoryId));
    };
    await expect(directDocuments(f.direct)).rejects.toThrow('MEMORY_REVISION_HISTORY_CHANGED');
    await expect(directDocuments(f.direct)).resolves.toHaveLength(2);
  });

  it('detects a new revision file introduced while reading an existing history directory',async()=>{
    const f=await fixture(1),entry=f.entries[0]!;await f.repo.revise({scope,memoryId:entry.memoryId,value:'Updated fixture choice.'});
    const directory=path.join(f.paths.vaultRoot,'.agent-core','history',entry.memoryId),file=path.join(directory,(await readdir(directory))[0]!);
    const text=await readFile(file,'utf8');observations.afterRead=async current=>{if(current!==file)return;observations.afterRead=undefined;await writeFile(path.join(directory,'new-revision.md'),text);};
    await expect(directDocuments(f.direct)).rejects.toThrow('MEMORY_REVISION_HISTORY_CHANGED');
  });

  it('rejects redirected history directories without reading their target',async()=>{
    const f=await fixture(1),historyRoot=path.join(f.paths.vaultRoot,'.agent-core','history'),target=path.join(f.root,'outside-history');
    await mkdir(historyRoot,{recursive:true});await mkdir(target);await writeFile(path.join(target,'private.md'),'private outside bytes');
    await symlink(target,path.join(historyRoot,f.entries[0]!.memoryId),process.platform==='win32'?'junction':'dir');resetObservations();
    await expect(directDocuments(f.direct)).rejects.toThrow('MEMORY_REVISION_HISTORY_PATH_INVALID');
    expect(observations.files.some(file=>file.includes('private.md'))).toBe(false);
  });

  it('continues reading fresh receipts and remote documents even after a successful local pass',async()=>{
    const f=await fixture(2);await expect(f.direct.sync(scope)).resolves.toEqual({state:'synced',pendingItems:0});
    const writes=f.operations.filter(operation=>operation==='upsert').length;resetObservations();
    expect(await f.direct.pending(scope)).toBe(0);
    expect(observations.files.filter(file=>file.includes('supabase-direct-receipts'))).toHaveLength(2);
    await expect(f.direct.sync(scope)).resolves.toEqual({state:'synced',pendingItems:0});
    expect(f.operations.filter(operation=>operation==='upsert')).toHaveLength(writes);
    const receipts=path.join(f.aux.root,'supabase-direct-receipts'),file=path.join(receipts,(await readdir(receipts))[0]!);
    await writeFile(file,'malformed receipt');await expect(f.direct.pending(scope)).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID'});
    const first=f.entries[0]!;f.remote.delete(first.memoryId);
    await expect(f.direct.verifyMemoryDocuments(scope)).rejects.toThrow('MEMORY_SUPABASE_DOCUMENT_MISMATCH');
  });

  it('preserves first-in-file and first-path revision identity for duplicate memory IDs',async()=>{
    const f=await fixture(1),file=path.join(f.paths.vaultRoot,'Decisions','part-00000.md'),original=parseVaultSegment(await readFile(file,'utf8'),'Decisions/part-00000.md');
    const duplicate={...original.entries[0]!,revisionId:randomUUID(),valueText:'Later duplicate must not redefine the revision lookup.'};
    await writeFile(file,serializeVaultSegment({...original,entries:[...original.entries,duplicate]}));
    const later={...original,relativePath:'Decisions/part-00001.md',fileId:'later-part',segmentNo:2,entries:[duplicate]};
    await writeFile(path.join(f.paths.vaultRoot,later.relativePath),serializeVaultSegment(later));
    const documents=await directDocuments(f.direct),expected=await f.repo.listRevisions(scope,f.entries[0]!.memoryId);
    expect(documents).toHaveLength(3);expect(documents[1]!.entry.valueText).toBe(duplicate.valueText);
    expect(documents.map(doc=>doc.revisions)).toEqual([expected,expected,expected]);
    expect(documents[1]!.revisions[0]!.revisionId).toBe(f.entries[0]!.revisionId);
  });

  it('preserves empty revision lookup when the first duplicate belongs to another principal',async()=>{
    const f=await fixture(1),file=path.join(f.paths.vaultRoot,'Decisions','part-00000.md'),original=parseVaultSegment(await readFile(file,'utf8'),'Decisions/part-00000.md');
    const foreign={...original,relativePath:'Decisions/foreign-first.md',fileId:'foreign-part',principalId:'another-principal'};
    await writeFile(path.join(f.paths.vaultRoot,foreign.relativePath),serializeVaultSegment(foreign));
    expect(await f.repo.listRevisions(scope,f.entries[0]!.memoryId)).toEqual([]);
    const documents=await directDocuments(f.direct);expect(documents).toHaveLength(1);expect(documents[0]!.revisions).toEqual([]);
  });

  it.each(['principalId','projectId'] as const)('rejects a segment whose %s changes after its validated snapshot',async field=>{
    const f=await fixture(1),snapshot=await f.repo.readSnapshot({verifyContent:true}),file=path.join(f.paths.vaultRoot,'Decisions','part-00000.md');
    const original=parseVaultSegment(await readFile(file,'utf8'),'Decisions/part-00000.md');
    await writeFile(file,serializeVaultSegment({...original,[field]:'different-scope'}));
    await expect(f.repo.readScopedRevisionBatch(scope,snapshot)).rejects.toThrow('MEMORY_REVISION_SCOPE_CHANGED');
  });
});
