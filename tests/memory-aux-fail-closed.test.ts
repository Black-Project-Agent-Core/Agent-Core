import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';
import { MemoryService } from '../src/memory/service.js';
import { isolatedMemoryDependencies, memoryRoot, strictMemoryConfig } from './helpers/memory-fixture.js';
import { makeWorkflowProjectionRecord, makeWorkflowProjectionSnapshot, workflowHash } from '../src/memory/file-native/workflow-projection.js';
import { acquireMemoryRecoveryLease, restoreWorkflowBackup } from '../src/memory/file-native/recovery-coordinator.js';

const failure=vi.hoisted(()=>({file:'',code:'',directory:'',directoryCode:''}));
vi.mock('node:fs/promises',async(importOriginal)=>{
  const original=await importOriginal<typeof import('node:fs/promises')>();
  return{...original,
    readFile:async(...args:Parameters<typeof original.readFile>)=>{
      if(failure.code&&String(args[0])===failure.file)throw Object.assign(new Error('synthetic-private-record-detail'),{code:failure.code});
      return original.readFile(...args);
    },
    readdir:async(...args:Parameters<typeof original.readdir>)=>{
      if(failure.directoryCode&&String(args[0])===failure.directory)throw Object.assign(new Error('synthetic-private-directory-detail'),{code:failure.directoryCode});
      return original.readdir(...args);
    },
  };
});

const roots:string[]=[],services:MemoryService[]=[];
async function fixture(){
  const root=await memoryRoot('aux-fail-closed');roots.push(root);
  const config=await strictMemoryConfig(root),service=new MemoryService(config,undefined,isolatedMemoryDependencies(config));services.push(service);
  return{root,config,service,aux:new FileNativeAuxStore(config.fileNative),scope:{principalId:'fixture-principal',projectId:root}};
}
afterEach(async()=>{
  failure.file='';failure.code='';failure.directory='';failure.directoryCode='';
  await Promise.all(services.splice(0).map(service=>service.close()));
  await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:20})));
});

describe('auxiliary memory state fails closed',()=>{
  it.each(['{"private":"synthetic-private-record-detail",','{}','{"postflightState":"POSTFLIGHT_PENDING"}'])('refuses a new objective when an existing pending lifecycle becomes malformed (%s)',async corruption=>{
    const f=await fixture(),routeContextId='route-prior-work';
    const first=await f.service.preflight({scope:f.scope,routeContextId,task:'Verify an existing endpoint',expiresAt:Date.now()+60_000});
    await f.service.markLifecycleMeaningfulWork({scope:f.scope,contextId:first.contextId,routeContextId,toolName:'read_file',reasonCode:'SOURCE_INSPECTED'});
    const lifecycleFile=path.join(f.aux.root,'lifecycles',`${first.contextId}.json`);
    expect(JSON.parse(await readFile(lifecycleFile,'utf8')).postflightState).toBe('POSTFLIGHT_PENDING');
    const next={scope:f.scope,routeContextId:'route-next-work',task:'Verify another endpoint',expiresAt:Date.now()+60_000};
    await expect(f.service.preflight(next)).rejects.toMatchObject({code:'MEMORY_POSTFLIGHT_REQUIRED'});
    const before=await readdir(path.join(f.aux.root,'contexts'));
    await writeFile(lifecycleFile,corruption);
    await expect(f.service.preflight(next)).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID'});
    expect(await readdir(path.join(f.aux.root,'contexts'))).toEqual(before);
    expect(await readFile(lifecycleFile,'utf8')).toBe(corruption);
  });

  it('preserves operational lifecycle fields and independently expires a legitimate context',async()=>{
    const f=await fixture(),routeContextId='route-expiry';
    const first=await f.service.preflight({scope:f.scope,routeContextId,task:'Read the current endpoint',expiresAt:Date.now()+60_000});
    const original=JSON.parse(await readFile(path.join(f.aux.root,'lifecycles',`${first.contextId}.json`),'utf8'));
    const record={...original,expiresAt:1,updatedAt:original.updatedAt+1000,localDurableGeneration:'fixture-generation',localDurableHash:'fixture-hash'};
    await f.aux.put('lifecycles',first.contextId,record);
    expect(await f.aux.get('lifecycles',first.contextId)).toEqual(record);
    expect(await f.aux.list('lifecycles')).toEqual([record]);
    await expect(f.service.validateLifecycleContext({scope:f.scope,contextId:first.contextId,routeContextId})).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED'});
  });

  it('rejects a pending lifecycle that loses only its operational project identity before opening another objective',async()=>{
    const f=await fixture(),routeContextId='route-project-scope';
    const first=await f.service.preflight({scope:f.scope,routeContextId,task:'Inspect an existing endpoint',expiresAt:Date.now()+60_000});
    await f.service.markLifecycleMeaningfulWork({scope:f.scope,contextId:first.contextId,routeContextId,toolName:'read_file',reasonCode:'SOURCE_INSPECTED'});
    const file=path.join(f.aux.root,'lifecycles',`${first.contextId}.json`),record=JSON.parse(await readFile(file,'utf8'));
    expect(record).toMatchObject({projectId:'agent-core://self',postflightState:'POSTFLIGHT_PENDING',meaningfulWorkCount:1});
    delete record.projectId;
    const corrupted=JSON.stringify(record),before=await readdir(path.join(f.aux.root,'contexts'));
    await writeFile(file,corrupted);
    await expect(f.service.preflight({scope:f.scope,routeContextId:'route-project-next',task:'Inspect another endpoint',expiresAt:Date.now()+60_000}))
      .rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID',category:'lifecycles',recordId:first.contextId});
    expect(await readdir(path.join(f.aux.root,'contexts'))).toEqual(before);
    expect(await readFile(file,'utf8')).toBe(corrupted);
  });

  it.each(['OPEN','POSTFLIGHT_PENDING'])('rejects a %s lifecycle with its expiry omitted',async state=>{
    const f=await fixture(),routeContextId='route-missing-expiry';
    const first=await f.service.preflight({scope:f.scope,routeContextId,task:'Inspect current source',expiresAt:Date.now()+60_000});
    if(state==='POSTFLIGHT_PENDING')await f.service.markLifecycleMeaningfulWork({scope:f.scope,contextId:first.contextId,routeContextId,toolName:'read_file',reasonCode:'SOURCE_INSPECTED'});
    const file=path.join(f.aux.root,'lifecycles',`${first.contextId}.json`),record=JSON.parse(await readFile(file,'utf8'));
    expect(record.postflightState).toBe(state);delete record.expiresAt;
    await writeFile(file,JSON.stringify(record));
    await expect(f.aux.get('lifecycles',first.contextId)).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID'});
    await expect(f.service.validateLifecycleContext({scope:f.scope,contextId:first.contextId,routeContextId})).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID'});
  });

  it('retains closed records without leases and restores canonical project scope with an expired lease',async()=>{
    const f=await fixture(),routeContextId='route-closed-restore';
    const first=await f.service.preflight({scope:f.scope,routeContextId,task:'Inspect historical source',expiresAt:Date.now()+60_000});
    const record=JSON.parse(await readFile(path.join(f.aux.root,'lifecycles',`${first.contextId}.json`),'utf8'));
    record.postflightState='CLOSED';record.closedAt=record.updatedAt;delete record.expiresAt;
    await f.aux.put('lifecycles',first.contextId,record);
    expect(await f.aux.get('lifecycles',first.contextId)).toEqual(record);
    const scope={principalId:record.principalId as string,projectId:record.projectId as string};
    const snapshot=makeWorkflowProjectionSnapshot(scope,[makeWorkflowProjectionRecord('lifecycles',first.contextId,record,scope)]);
    const restored=await fixture(),lease=await acquireMemoryRecoveryLease(restored.config.fileNative,'recovery');
    try{
      await restoreWorkflowBackup(restored.config.fileNative,{snapshot,memoryDocuments:[],generation:{state:'synced',generationId:snapshot.logicalStateHash,
        logicalStateHash:snapshot.logicalStateHash,remoteVersion:'00000000-0000-4000-8000-000000000001',recordCount:1}});
    }finally{await lease.release();}
    expect(await restored.aux.get('lifecycles',first.contextId)).toMatchObject({projectId:scope.projectId,expiresAt:0,postflightState:'CLOSED',
      localDurableGeneration:'supabase-workflow-v1:'+snapshot.logicalStateHash,localDurableHash:snapshot.logicalStateHash});
  });

  it.each(['principalId','contextId','routeContextId','objectiveHash','postflightState','meaningfulWorkCount','createdAt','updatedAt'])('rejects a lifecycle losing only %s',async field=>{
    const f=await fixture(),first=await f.service.preflight({scope:f.scope,routeContextId:'route-required-field',task:'Inspect current source',expiresAt:Date.now()+60_000});
    const file=path.join(f.aux.root,'lifecycles',`${first.contextId}.json`),record=JSON.parse(await readFile(file,'utf8'));
    delete record[field];await writeFile(file,JSON.stringify(record));
    await expect(f.aux.get('lifecycles',first.contextId)).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID'});
    await expect(f.aux.list('lifecycles')).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID'});
  });

  it('requires explicit local scope on every structured category while keeping explicit global scope valid',async()=>{
    const f=await fixture(),base={principalId:f.scope.principalId,projectId:'',createdAt:1},input={routeContextId:'route',status:'interrupted',summary:'Interrupted inspection'};
    const records:Record<string,Record<string,unknown>>={
      'lifecycles':{...base,contextId:'record',routeContextId:'route',objectiveHash:workflowHash('objective'),postflightState:'OPEN',meaningfulWorkCount:0,updatedAt:1,expiresAt:2},
      'continuity-tasks':{...base,taskId:'record',title:'Task',acceptanceCriteria:[],constraints:[],status:'running',priority:0,blockers:[],updatedAt:1},
      'continuity-turns':{...base,turnId:'record',taskId:'task',routeContextId:'route',state:'open'},
      'continuity-checkpoints':{...base,checkpointId:'record',taskId:'task',routeContextId:'route',phase:'interrupted',input,stateHash:workflowHash(input)},
      'continuity-frontier':{...base,frontierId:'record',sourceTaskId:'task',title:'Next task',rationale:'Follow-up',status:'candidate',dependencyTaskIds:[],priority:0,updatedAt:1},
      'write-decisions':{...base,id:'record',routeContextId:'route',decisionType:'NO_DURABLE_MEMORY',candidateHash:workflowHash(null),existingMemoryIds:[],reasonCodes:['TRANSIENT_OPERATION'],evidenceRefs:[],relationPlan:[]},
    };
    for(const [category,record]of Object.entries(records)){
      await f.aux.put(category,'record',record);expect(await f.aux.get(category,'record')).toEqual(record);
      delete record.projectId;await f.aux.put(category,'record',record);
      await expect(f.aux.get(category,'record')).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID',category});
      await expect(f.aux.list(category)).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID',category});
    }
  });

  it.each(['continuity-tasks','continuity-turns','continuity-checkpoints','continuity-frontier','write-decisions'])('rejects a structurally invalid %s record before it can be filtered by scope',async category=>{
    const f=await fixture();await f.aux.put(category,'invalid',{});
    await expect(f.aux.get(category,'invalid')).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID',category});
    await expect(f.aux.list(category)).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID',category});
  });

  it.each(['ENOENT','EACCES','EPERM','EIO'])('rejects a listed record with %s rather than returning a partial or empty list',async code=>{
    const f=await fixture();await f.aux.put('supabase-direct-receipts','a',{contentHash:'a'});await f.aux.put('supabase-direct-receipts','b',{contentHash:'b'});
    failure.file=path.join(f.aux.root,'supabase-direct-receipts','b.json');failure.code=code;
    const error=await f.aux.list('supabase-direct-receipts').catch(error=>error);
    expect(error).toMatchObject({code:'MEMORY_AUX_READ_FAILED',causeCode:code,category:'supabase-direct-receipts',recordId:'b'});
    expect(String(error)).not.toContain('synthetic-private');
    if(code==='ENOENT')await expect(f.aux.get('supabase-direct-receipts','b')).resolves.toBeNull();
    else await expect(f.aux.get('supabase-direct-receipts','b')).rejects.toMatchObject({code:'MEMORY_AUX_READ_FAILED',causeCode:code});
    failure.code='';expect(await f.aux.list('supabase-direct-receipts')).toEqual([{contentHash:'a'},{contentHash:'b'}]);
  });

  it('returns empty only for a missing category and reports inaccessible categories without filesystem detail',async()=>{
    const f=await fixture();expect(await f.aux.list('events')).toEqual([]);expect(await f.aux.get('events','absent')).toBeNull();
    await f.aux.put('events','existing',{eventId:'existing'});
    failure.directory=path.join(f.aux.root,'events');failure.directoryCode='EACCES';
    const error=await f.aux.list('events').catch(error=>error);
    expect(error).toMatchObject({code:'MEMORY_AUX_DIRECTORY_READ_FAILED',causeCode:'EACCES',category:'events'});
    expect(String(error)).not.toContain('synthetic-private');
  });

  it('sanitizes malformed JSON errors while retaining other categories legitimate objects and arrays',async()=>{
    const f=await fixture();await f.aux.put('events','a',{nested:{source:'fixture'},optional:null});await f.aux.put('events','b',[{type:'fixture'}]);
    expect(await f.aux.list('events')).toEqual([{nested:{source:'fixture'},optional:null},[{type:'fixture'}]]);
    await writeFile(path.join(f.aux.root,'events','b.json'),'synthetic-private-record-detail');
    for(const read of [()=>f.aux.get('events','b'),()=>f.aux.list('events')]){
      const error=await read().catch(error=>error);
      expect(error).toMatchObject({code:'MEMORY_AUX_RECORD_INVALID'});expect(String(error)).not.toContain('synthetic-private');
    }
  });

  it('reads the exact listed filename instead of a sanitized alias',async()=>{
    const f=await fixture();await f.aux.put('events','a_',{eventId:'a_'});
    await writeFile(path.join(f.aux.root,'events','a@.json'),'malformed');
    await expect(f.aux.list('events')).rejects.toMatchObject({code:'MEMORY_AUX_RECORD_INVALID',recordId:'a@'});
  });
});
