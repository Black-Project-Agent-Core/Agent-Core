import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileNativeAuxStore, MemoryAuxReadError } from '../src/memory/file-native/aux-store.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { SupabaseDirectError, SupabaseDirectMemory, type DirectMemoryDocument, type SupabaseDirectTransport } from '../src/memory/file-native/supabase-direct.js';
import { serializeVaultSegment } from '../src/memory/file-native/vault-codec.js';
import type { VaultMemoryEntry } from '../src/memory/file-native/types.js';
import type { MemoryScope } from '../src/memory/types.js';

const roots:string[]=[],scope={principalId:'receipt-principal',projectId:'receipt-project'},url='https://receipt-fixture.supabase.co';
const category='supabase-direct-receipts';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const targetId=hash(url);
const receiptKey=(s:MemoryScope,id:string)=>hash([targetId,s.principalId,s.projectId??'',id]);
function barrier(){let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return{promise,release};}

async function fixture(count=18,duplicates=false){
  const root=await mkdtemp(path.join(os.tmpdir(),'ac-receipt-fixture-'));roots.push(root);
  const paths=resolveFileNativeMemoryPaths(root),repo=new FileNativeMemoryRepository(paths),aux=new FileNativeAuxStore(paths);
  const entries:VaultMemoryEntry[]=Array.from({length:count},(_,i)=>({memoryId:randomUUID(),revisionId:randomUUID(),revisionNo:1,canonicalKey:`decision:receipt-${i}`,kind:'decision',state:'active',importance:.5,pinned:false,enforcement:'soft',valueText:`Receipt fixture choice ${i}.`,valueHash:hash(`Receipt fixture choice ${i}.`),createdAt:1000,updatedAt:1000,relations:[]}));
  if(duplicates){entries[2]!.memoryId=entries[0]!.memoryId;entries[8]!.memoryId=entries[0]!.memoryId;}
  async function segment(s:MemoryScope,name:string,items=entries){
    const relativePath=`Decisions/${name}.md`;
    await mkdir(path.dirname(path.join(paths.vaultRoot,relativePath)),{recursive:true});
    await writeFile(path.join(paths.vaultRoot,relativePath),serializeVaultSegment({schemaVersion:1,fileId:name,relativePath,contextFamily:'decision',principalId:s.principalId,projectId:s.projectId??'',topicKey:'receipts',segmentNo:1,createdAt:new Date(1000).toISOString(),updatedAt:new Date(1000).toISOString(),entries:items}));
  }
  await segment(scope,'a-primary');
  const remote=new Map<string,{document:DirectMemoryDocument;version:string}>(),upserts:Array<{memoryId:string;scope:MemoryScope;expectedVersion:unknown;version:string;value:string}>=[];
  const hooks:{beforeUpsert?:(doc:DirectMemoryDocument)=>Promise<void>}={};
  let activeWrites=0,maxActiveWrites=0;
  const transport:SupabaseDirectTransport={async call(operation,payload){
    if(operation==='health')return{schemaVersion:1};
    if(operation!=='upsert')throw new Error(`Unexpected fixture operation ${operation}`);
    const doc=payload.document as DirectMemoryDocument,key=receiptKey(doc,doc.entry.memoryId);
    activeWrites++;maxActiveWrites=Math.max(maxActiveWrites,activeWrites);
    try{
      await hooks.beforeUpsert?.(doc);
      if((remote.get(key)?.version??null)!==payload.expectedVersion)throw new SupabaseDirectError('MEMORY_SUPABASE_WRITE_CONFLICT');
      const version=randomUUID();remote.set(key,{document:structuredClone(doc),version});
      upserts.push({memoryId:doc.entry.memoryId,scope:{principalId:doc.principalId,projectId:doc.projectId},expectedVersion:payload.expectedVersion,version,value:doc.entry.valueText});
      return{applied:true,version};
    }finally{activeWrites--;}
  }};
  const direct=new SupabaseDirectMemory(paths,repo,aux,transport,url);
  return{root,paths,repo,aux,direct,entries,segment,remote,upserts,hooks,keys:entries.map(e=>receiptKey(scope,e.memoryId)),maxActiveWrites:()=>maxActiveWrites};
}

afterEach(async()=>{
  vi.restoreAllMocks();
  for(const root of roots.splice(0)){
    const resolved=path.resolve(root);
    if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(resolved).startsWith('ac-receipt-fixture-'))throw new Error('Unsafe receipt fixture cleanup');
    await rm(resolved,{recursive:true,force:true,maxRetries:3});
  }
});

describe('Fresh bounded Supabase receipt reads',()=>{
  it('reads at most eight receipts together and reads every receipt once per pending operation',async()=>{
    const f=await fixture(),gate=barrier(),get=f.aux.get.bind(f.aux),calls:string[]=[];
    let active=0,maxActive=0;
    vi.spyOn(f.aux,'get').mockImplementation(async(c,id)=>{
      if(c!==category)return get(c,id);
      calls.push(id);active++;maxActive=Math.max(maxActive,active);
      try{await gate.promise;return await get(c,id);}finally{active--;}
    });
    const pending=f.direct.pending(scope);
    try{
      await vi.waitFor(()=>expect(calls).toHaveLength(8),{timeout:1000});
      expect(active).toBe(8);expect(maxActive).toBe(8);
    }finally{gate.release();await pending;}
    expect(await pending).toBe(18);expect(calls).toEqual(f.keys);expect(maxActive).toBe(8);
    calls.length=0;
    expect(await f.direct.pending(scope)).toBe(18);expect(calls).toEqual(f.keys);
  });

  it('drains read failures before releasing the scope queue and preserves the original successful write prefix',async()=>{
    const f=await fixture(),gate=barrier(),get=f.aux.get.bind(f.aux),calls:string[]=[];
    let rejectOnce=true,settled=false,prefixAtFailure:string[]|undefined;
    vi.spyOn(f.direct,'pending').mockResolvedValue(-1); // Isolate the existing failure diagnostic from the guarded sync pass.
    vi.spyOn(f.aux,'get').mockImplementation(async(c,id)=>{
      if(c!==category)return get(c,id);
      calls.push(id);
      if(id===f.keys[3]&&rejectOnce){rejectOnce=false;throw new MemoryAuxReadError('MEMORY_AUX_READ_FAILED',category,id,'EIO');}
      if(id===f.keys[7])await gate.promise;
      return get(c,id);
    });
    const failed=f.direct.sync(scope).finally(()=>{settled=true;prefixAtFailure=f.upserts.map(r=>r.memoryId);});
    const retry=f.direct.sync(scope);
    try{
      await vi.waitFor(()=>expect(calls).toHaveLength(8),{timeout:1000});
      expect(settled).toBe(false);expect(f.upserts).toHaveLength(0);
    }finally{gate.release();await Promise.all([failed,retry]);}
    expect(await failed).toMatchObject({state:'pending',pendingItems:-1,errorCode:'MEMORY_SUPABASE_SYNC_FAILED'});
    expect(prefixAtFailure).toEqual(f.entries.slice(0,3).map(e=>e.memoryId));
    expect(await retry).toEqual({state:'synced',pendingItems:0});
    expect(f.upserts.map(r=>r.memoryId)).toEqual(f.entries.map(e=>e.memoryId));
    expect(calls.slice(0,8)).toEqual(f.keys.slice(0,8));
    expect(calls.slice(8)).toEqual(f.keys);
    expect(f.maxActiveWrites()).toBe(1);
  });

  it('re-reads duplicate receipt identities after each serial CAS update within and across batches',async()=>{
    const f=await fixture(10,true),get=f.aux.get.bind(f.aux),calls:string[]=[];
    vi.spyOn(f.aux,'get').mockImplementation(async(c,id)=>{if(c===category)calls.push(id);return get(c,id);});
    expect(await f.direct.sync(scope)).toEqual({state:'synced',pendingItems:0});
    expect(calls).toEqual(f.keys);
    expect(f.upserts.map(r=>r.value)).toEqual(f.entries.map(e=>e.valueText));
    const duplicateWrites=f.upserts.filter(r=>r.memoryId===f.entries[0]!.memoryId);
    expect(duplicateWrites).toHaveLength(3);
    expect(duplicateWrites.map(r=>r.expectedVersion)).toEqual([null,duplicateWrites[0]!.version,duplicateWrites[1]!.version]);
    expect(f.maxActiveWrites()).toBe(1);
  });

  it('detects changed, removed and malformed receipt bytes on later calls without trusting an earlier pass',async()=>{
    const f=await fixture(9),get=f.aux.get.bind(f.aux),calls:string[]=[];
    expect(await f.direct.sync(scope)).toEqual({state:'synced',pendingItems:0});
    const originalFirstReceipt=await f.aux.get(category,f.keys[0]!);
    vi.spyOn(f.aux,'get').mockImplementation(async(c,id)=>{if(c===category)calls.push(id);return get(c,id);});
    expect(await f.direct.pending(scope)).toBe(0);expect(calls).toEqual(f.keys);calls.length=0;
    await f.aux.put(category,f.keys[0]!,{contentHash:'externally changed'});
    expect(await f.direct.pending(scope)).toBe(1);expect(calls).toEqual(f.keys);calls.length=0;
    await f.aux.delete(category,f.keys[0]!);
    expect(await f.direct.pending(scope)).toBe(1);expect(calls).toEqual(f.keys);
    await f.aux.put(category,f.keys[0]!,originalFirstReceipt);
    await writeFile(path.join(f.aux.root,category,`${f.keys[1]}.json`),'{invalid');
    await expect(f.direct.pending(scope)).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID',category,recordId:f.keys[1]});
    expect(await f.direct.sync(scope)).toMatchObject({state:'pending',pendingItems:-1,errorCode:'MEMORY_SUPABASE_SYNC_FAILED'});
  });

  it('keeps identical memory IDs isolated by principal and project during concurrent pending operations',async()=>{
    const f=await fixture(9),otherProject={...scope,projectId:'other-project'},otherPrincipal={...scope,principalId:'other-principal'};
    await f.segment(otherProject,'b-project');await f.segment(otherPrincipal,'c-principal');
    expect(await f.direct.sync(scope)).toEqual({state:'synced',pendingItems:0});
    const get=f.aux.get.bind(f.aux),calls:string[]=[];
    vi.spyOn(f.aux,'get').mockImplementation(async(c,id)=>{if(c===category)calls.push(id);return get(c,id);});
    expect(await Promise.all([f.direct.pending(scope),f.direct.pending(otherProject),f.direct.pending(otherPrincipal)])).toEqual([0,9,9]);
    const expected=[scope,otherProject,otherPrincipal].flatMap(s=>f.entries.map(e=>receiptKey(s,e.memoryId)));
    expect(calls.slice().sort()).toEqual(expected.sort());expect(new Set(calls).size).toBe(27);
    expect(f.upserts.every(r=>r.scope.principalId===scope.principalId&&r.scope.projectId===scope.projectId)).toBe(true);
  });
});
