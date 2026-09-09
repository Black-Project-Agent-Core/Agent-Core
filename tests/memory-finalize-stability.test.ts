import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileNativeMemoryBackend } from '../src/memory/file-native/backend.js';
import { GraphifyAdapter } from '../src/memory/file-native/graphify-adapter.js';
import { SupabaseDirectError, type SupabaseDirectTransport } from '../src/memory/file-native/supabase-direct.js';
import { registerMemoryTurnTools } from '../src/mcp/memory-turn-tools.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { createHttpHandler } from '../src/http/app.js';
import { FileKeyStore } from '../src/auth/key-store.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';
import { RouteContextStore } from '../src/runtime/route-context-store.js';
import { memoryConfig, memoryRoot } from './helpers/memory-fixture.js';

const roots:string[]=[];
const servers:Server[]=[],runtimes:RuntimeServices[]=[],loggers:FileAuditLogger[]=[];
afterEach(async()=>{
  for(const server of servers.splice(0))await new Promise<void>(resolve=>server.close(()=>resolve()));
  for(const runtime of runtimes.splice(0)){await runtime.execution.close();await runtime.memory.close();}
  for(const logger of loggers.splice(0))await logger.close();
  vi.restoreAllMocks();
  for(const root of roots.splice(0)){
    if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(root).startsWith('ac-finalize-stability-'))throw new Error('Fixture path escaped temp');
    await rm(root,{recursive:true,force:true,maxRetries:3});
  }
});

async function fixture(){
  const root=await memoryRoot('finalize-stability');roots.push(root);
  const config=await memoryConfig(root,{
    AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED:'true',
    AGENT_CORE_MEMORY_SUPABASE_URL:'https://fixture.supabase.co',
    AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY:'sb_secret_fixture_only',
  });
  vi.spyOn(GraphifyAdapter.prototype,'update').mockResolvedValue({nodes:0,edges:0,graphPath:path.join(root,'graph.json')});
  const remote={offline:false,writes:0,documents:new Map<string,unknown>()};
  const transport:SupabaseDirectTransport={async call(operation,payload){
    if(remote.offline)throw new SupabaseDirectError('MEMORY_SUPABASE_NETWORK_ERROR');
    if(operation==='health')return{schemaVersion:1};
    if(operation==='search')return[];
    if(operation==='get')return remote.documents.get(String(payload.memoryId))??null;
    const doc=payload.document as {entry:{memoryId:string}};
    remote.documents.set(doc.entry.memoryId,structuredClone(doc));remote.writes++;
    return{applied:true,version:randomUUID()};
  }};
  const backend=new FileNativeMemoryBackend(config,{supabaseDirectTransport:transport});await backend.ensureReady();
  const keyStore=new FileKeyStore(path.join(root,'keys')),principal=await keyStore.create('fixture-owner');
  const scope={principalId:principal.metadata.id,projectId:root},routeContextId=randomUUID();
  const preflight=await backend.preflight({scope,routeContextId,task:'Verify durable task closure',expiresAt:Date.now()+60000});
  const route={routeContextId,projectId:root,memorySnapshot:{memoryContextId:preflight.contextId}};
  function tool(memory=backend){
    let handler:(args:any)=>Promise<any>;
    registerMemoryTurnTools({registerTool(_name:string,_definition:unknown,callback:typeof handler){handler=callback;}} as any,
      {memory,routes:{getOwned:()=>route},workspace:{resolveProjectRoot:()=>root}} as any,{id:scope.principalId} as any);
    return async(args:Record<string,unknown>)=>{
      const raw=await handler!({routeContextId,...args});return{raw,body:JSON.parse(raw.content[0].text)};
    };
  }
  return{root,config,backend,remote,transport,scope,routeContextId,contextId:preflight.contextId,tool,keyStore,principal};
}

async function httpRuntime(f:Awaited<ReturnType<typeof fixture>>,allowedRoots=[f.root]){
  const runtime=createRuntimeServices(allowedRoots,path.join(f.root,'capabilities'),undefined,f.config,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,{supabaseDirectTransport:f.transport});runtimes.push(runtime);
  const logger=new FileAuditLogger(path.join(f.root,'logs'));loggers.push(logger);
  const server=createServer(createHttpHandler({keyStore:f.keyStore,auditLogger:logger,mcpHandler:createMcpHttpHandler(runtime)}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
  async function call(args:Record<string,unknown>,key=f.principal.key,name='memory_turn_finalize'){
    const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args}})});
    const raw=await response.json() as any;return{raw,body:JSON.parse(raw.result.content[0].text)};
  }
  return{runtime,call,server};
}

const durable=()=>({candidate:{canonicalKey:'decision:ledger-closure',kind:'decision',value:'Close the ledger only after verified synchronization.'},reasonCodes:['FRESH_DURABLE_CONTEXT'],evidenceRefs:['test:verified-ledger'],rootReason:'Reusable operating decision for ledger closure'});

describe('durable memory finalization',()=>{
  it('keeps a failed sync pending and retries after restart without another mutation or decision',async()=>{
    const f=await fixture(),args=durable();f.remote.offline=true;
    const failed=await f.tool()(args);
    expect(failed.raw.isError).toBe(true);
    expect(failed.body).toMatchObject({finalized:false,error:{code:'MEMORY_POSTFLIGHT_REQUIRED',details:{mutationCommitted:true,syncPending:true}}});
    expect(await f.backend.getLifecycleContext(f.scope,f.contextId)).toMatchObject({postflightState:'POSTFLIGHT_PENDING'});
    expect((await f.backend.getLifecycleContext(f.scope,f.contextId))?.closedAt).toBeUndefined();
    const decisions=await f.backend.aux.list<any>('write-decisions');expect(decisions).toHaveLength(1);
    const saved=(await f.backend.export(f.scope)).items;expect(saved).toHaveLength(1);
    const revisionId=saved[0]!.revisionId;
    f.remote.offline=false;
    const restarted=new FileNativeMemoryBackend(f.config,{supabaseDirectTransport:f.transport});await restarted.ensureReady();
    const completed=await f.tool(restarted)(args);
    expect(completed.body).toMatchObject({finalized:true,decisionRecordId:decisions[0].id,revisionId,memoryLifecycle:{postflightState:'CLOSED'},supabaseSync:{state:'synced'}});
    const replay=await f.tool(restarted)(args);
    expect(replay.body.decisionRecordId).toBe(completed.body.decisionRecordId);
    expect(await restarted.listRevisions(f.scope,saved[0]!.memoryId)).toHaveLength(1);
    expect(await restarted.aux.list('write-decisions')).toHaveLength(1);
    expect(f.remote.writes).toBe(1);
  });

  it('does not close an analysis-only task while Supabase health fails even with no queued documents',async()=>{
    const f=await fixture(),args={reasonCodes:['NO_FUTURE_RELEVANCE'],evidenceRefs:[]};
    f.remote.offline=true;
    expect((await f.tool()(args)).body).toMatchObject({finalized:false,error:{code:'MEMORY_POSTFLIGHT_REQUIRED'}});
    expect(await f.backend.getLifecycleContext(f.scope,f.contextId)).toMatchObject({postflightState:'POSTFLIGHT_PENDING'});
    expect((await f.backend.export(f.scope)).items).toEqual([]);
    f.remote.offline=false;
    expect((await f.tool()(args)).body).toMatchObject({finalized:true,decision:'NO_DURABLE_MEMORY',semanticMutation:false});
    expect(await f.backend.aux.list('write-decisions')).toHaveLength(1);
  });

  it.each([
    [{rootReason:undefined},'MEMORY_POSTFLIGHT_ROOT_REASON_REQUIRED'],
    [{evidenceRefs:[]},'MEMORY_POSTFLIGHT_EVIDENCE_REQUIRED'],
    [{evidenceRefs:['   ']},'MEMORY_POSTFLIGHT_EVIDENCE_REQUIRED'],
  ])('rejects incomplete durable knowledge before recording a no-write decision: %j',async(patch,code)=>{
    const f=await fixture();
    expect((await f.tool()({...durable(),...patch})).body).toMatchObject({finalized:false,error:{message:code}});
    expect(await f.backend.aux.list('write-decisions')).toEqual([]);
    expect((await f.backend.export(f.scope)).items).toEqual([]);
    expect(await f.backend.getLifecycleContext(f.scope,f.contextId)).toMatchObject({postflightState:'OPEN'});
    expect((await f.tool()(durable())).body.finalized).toBe(true);
  });

  it('serializes simultaneous identical finalizations into one durable decision',async()=>{
    const f=await fixture(),finalize=f.tool();
    const results=await Promise.all([finalize(durable()),finalize(durable())]);
    expect(results.every(r=>r.body.finalized)).toBe(true);
    expect(results[0].body.decisionRecordId).toBe(results[1].body.decisionRecordId);
    expect(await f.backend.aux.list('write-decisions')).toHaveLength(1);
    expect((await f.backend.export(f.scope)).items).toHaveLength(1);
  });

  it('retries an existing-memory revision with its original decision and rejects a new request after closure',async()=>{
    const f=await fixture();
    const original=await f.backend.commit({scope:f.scope,canonicalKey:'decision:ledger-closure',kind:'decision',value:'Original ledger procedure.'});
    const args={...durable(),reasonCodes:['BELIEF_CHANGED']};f.remote.offline=true;
    expect((await f.tool()(args)).body.finalized).toBe(false);
    const decision=(await f.backend.aux.list<any>('write-decisions'))[0];
    expect(decision.decisionType).toBe('REVISE_EXISTING');
    expect(await f.backend.listRevisions(f.scope,original.memoryId)).toHaveLength(2);
    f.remote.offline=false;
    const retried=await f.tool()(args);
    expect(retried.body).toMatchObject({finalized:true,decision:'REVISE_EXISTING',decisionRecordId:decision.id});
    expect(await f.backend.listRevisions(f.scope,original.memoryId)).toHaveLength(2);
    const rejected=await f.tool()({...args,candidate:{...args.candidate,value:'A different request after closure.'}});
    expect(rejected.body).toMatchObject({finalized:false,error:{code:'MEMORY_LIFECYCLE_CONFLICT'}});
    expect(await f.backend.aux.list('write-decisions')).toHaveLength(1);
    expect(await f.backend.listRevisions(f.scope,original.memoryId)).toHaveLength(2);
  });

  it('retries graph repair after a committed decision without repeating semantic work',async()=>{
    const f=await fixture();
    vi.spyOn(f.backend as any,'refreshGraph').mockRejectedValueOnce(new Error('MEMORY_GRAPHIFY_BUILD_FAILED'));
    expect((await f.tool()(durable())).body.finalized).toBe(false);
    const first=(await f.backend.export(f.scope)).items[0]!;
    expect(await f.backend.getLifecycleContext(f.scope,f.contextId)).toMatchObject({postflightState:'POSTFLIGHT_PENDING'});
    const retried=await f.tool()(durable());
    expect(retried.body).toMatchObject({finalized:true,revisionId:first.revisionId});
    expect(await f.backend.aux.list('write-decisions')).toHaveLength(1);
    expect(await f.backend.listRevisions(f.scope,first.memoryId)).toHaveLength(1);
  });

  it.each(['after-decision','after-semantic-write','after-applied-decision','before-result-receipt'] as const)('replays the original persisted decision after interruption %s',async(stage)=>{
    const f=await fixture(),args=durable();
    if(stage==='after-decision'){
      const write=f.backend.recordWriteDecision.bind(f.backend);
      vi.spyOn(f.backend,'recordWriteDecision').mockImplementationOnce(async input=>{await write(input);throw new Error('fixture-interrupted');});
    }else if(stage==='after-semantic-write'){
      vi.spyOn(f.backend as any,'upsertDecisionMetadata').mockRejectedValueOnce(new Error('fixture-interrupted'));
    }else if(stage==='after-applied-decision'){
      const mark=f.backend.markWriteDecisionApplied.bind(f.backend);
      vi.spyOn(f.backend,'markWriteDecisionApplied').mockImplementationOnce(async(...input)=>{await mark(...input);throw new Error('fixture-interrupted');});
    }else{
      const put=f.backend.aux.put.bind(f.backend.aux);let interrupted=false;
      vi.spyOn(f.backend.aux,'put').mockImplementation(async(category,id,value)=>{
        if(category==='postflight-results'&&!interrupted){interrupted=true;throw new Error('fixture-interrupted');}
        return put(category,id,value);
      });
    }
    expect((await f.tool()(args)).body.finalized).toBe(false);
    expect(await f.backend.findPendingLifecycle({scope:f.scope})).toEqual(expect.arrayContaining([expect.objectContaining({contextId:f.contextId})]));
    const decisions=await f.backend.aux.list<any>('write-decisions');expect(decisions).toHaveLength(1);
    expect(decisions[0].decisionType).toBe('WRITE_NEW_ROOT');
    const restarted=new FileNativeMemoryBackend(f.config,{supabaseDirectTransport:f.transport});await restarted.ensureReady();
    if(stage==='after-applied-decision'||stage==='before-result-receipt')vi.spyOn(restarted.repo,'commit').mockRejectedValue(new Error('Successful semantic work must not be repeated'));
    const recovered=await f.tool(restarted)(args);
    expect(recovered.body).toMatchObject({finalized:true,decision:'WRITE_NEW_ROOT',decisionRecordId:decisions[0].id,semanticMutation:true});
    expect(await restarted.aux.list('write-decisions')).toHaveLength(1);
    expect((await restarted.export(f.scope)).items).toHaveLength(1);
    expect(await restarted.listRevisions(f.scope,recovered.body.memoryId)).toHaveLength(1);
  });

  it('does not duplicate a conflict when interrupted after its semantic mutation',async()=>{
    const f=await fixture();
    const prior=await f.backend.commit({scope:f.scope,canonicalKey:'decision:ledger-original',kind:'decision',value:'Use the original ledger.'});
    const args={...durable(),conflictWithMemoryId:prior.memoryId,conflictType:'contradictory_decision',reasonCodes:['CONFLICT_DETECTED'],proposedRelations:[{targetMemoryId:prior.memoryId,relation:'contradicts',evidenceRefs:['test:conflict']} ]};
    vi.spyOn(f.backend,'markWriteDecisionApplied').mockRejectedValueOnce(new Error('fixture-interrupted'));
    expect((await f.tool()(args)).body.finalized).toBe(false);
    const conflicts=await f.backend.listOpenConflicts(f.scope);expect(conflicts).toHaveLength(1);
    const restarted=new FileNativeMemoryBackend(f.config,{supabaseDirectTransport:f.transport});await restarted.ensureReady();
    expect((await f.tool(restarted)(args)).body).toMatchObject({finalized:true,decision:'OPEN_CONFLICT'});
    expect((await restarted.listOpenConflicts(f.scope)).map(c=>c.conflictId)).toEqual([conflicts[0]!.conflictId]);
    expect(await restarted.aux.list('write-decisions')).toHaveLength(1);
  });

  it('keeps another unfinished persisted plan pending even if a later decision was applied',async()=>{
    const f=await fixture();
    vi.spyOn(f.backend as any,'upsertDecisionMetadata').mockRejectedValueOnce(new Error('fixture-interrupted'));
    expect((await f.tool()(durable())).body.finalized).toBe(false);
    const later={...durable(),candidate:{...durable().candidate,canonicalKey:'decision:another-ledger-rule',value:'A second useful ledger rule.'}};
    expect((await f.tool()(later)).body).toMatchObject({finalized:false,error:{code:'MEMORY_POSTFLIGHT_REQUIRED',details:{postflightPlanPending:true}}});
    expect(await f.backend.getLifecycleContext(f.scope,f.contextId)).toMatchObject({postflightState:'POSTFLIGHT_PENDING'});
    expect((await f.tool()(durable())).body.finalized).toBe(true);
    expect(await f.backend.aux.list('write-decisions')).toHaveLength(2);
    expect((await f.backend.export(f.scope)).items).toHaveLength(2);
  });

  it('does not reopen a conflict resolved after an interrupted application',async()=>{
    const f=await fixture();
    const prior=await f.backend.commit({scope:f.scope,canonicalKey:'decision:resolved-original',kind:'decision',value:'Resolved original strategy.'});
    const args={...durable(),conflictWithMemoryId:prior.memoryId,conflictType:'contradictory_decision',reasonCodes:['CONFLICT_DETECTED'],proposedRelations:[{targetMemoryId:prior.memoryId,relation:'contradicts',evidenceRefs:['test:conflict']}]};
    vi.spyOn(f.backend,'markWriteDecisionApplied').mockRejectedValueOnce(new Error('fixture-interrupted'));
    expect((await f.tool()(args)).body.finalized).toBe(false);
    const conflict=(await f.backend.listOpenConflicts(f.scope))[0]!;
    await f.backend.aux.put('conflicts',conflict.conflictId,{...conflict,status:'resolved'});
    for(const id of [conflict.leftMemoryId,conflict.rightMemoryId])await f.backend.repo.setMemoryState(f.scope,id,'active','fixture.conflict_resolved',{});
    expect((await f.tool()(args)).body).toMatchObject({finalized:false,error:{code:'MEMORY_LIFECYCLE_CONFLICT'}});
    expect(await f.backend.listOpenConflicts(f.scope)).toEqual([]);
    expect((await f.backend.export(f.scope)).items.every(item=>item.state==='active')).toBe(true);
    expect(await f.backend.aux.list('conflicts')).toHaveLength(1);
  });

  it('requires Graphify readiness before closing a strict no-memory task',async()=>{
    const f=await fixture();f.config.hardLifecycleMode='enforce';
    const graph=vi.spyOn(GraphifyAdapter.prototype,'ensureFresh').mockRejectedValue(new Error('MEMORY_GRAPHIFY_RUNTIME_UNAVAILABLE'));
    const args={reasonCodes:['NO_FUTURE_RELEVANCE'],evidenceRefs:[]};
    expect((await f.tool()(args)).body).toMatchObject({finalized:false,error:{code:'MEMORY_POSTFLIGHT_REQUIRED'}});
    expect(await f.backend.getLifecycleContext(f.scope,f.contextId)).toMatchObject({postflightState:'POSTFLIGHT_PENDING'});
    graph.mockResolvedValue({healthy:true} as any);
    expect((await f.tool()(args)).body.finalized).toBe(true);
    expect(await f.backend.aux.list('write-decisions')).toHaveLength(1);
  });

  it('records a completion racing with closure as pending and requires a new covered-work decision',async()=>{
    const f=await fixture();let entered!:()=>void,release!:()=>void;
    const reached=new Promise<void>(resolve=>{entered=resolve;}),continueClosure=new Promise<void>(resolve=>{release=resolve;});
    const health=(f.backend as any).checkDirectHealth.bind(f.backend);
    vi.spyOn(f.backend as any,'checkDirectHealth').mockImplementationOnce(async()=>{entered();await continueClosure;return health(true);});
    const finalizing=f.tool()(durable());await reached;
    const completion=f.backend.markLifecycleMeaningfulWork({scope:f.scope,contextId:f.contextId,routeContextId:f.routeContextId,toolName:'edit_file',reasonCode:'completed-during-close'});
    release();expect((await finalizing).body.finalized).toBe(true);await completion;
    expect(await f.backend.getLifecycleContext(f.scope,f.contextId)).toMatchObject({postflightState:'POSTFLIGHT_PENDING',meaningfulWorkCount:1});
    await expect(f.backend.prepareLifecycleClosure({scope:f.scope,contextId:f.contextId,routeContextId:f.routeContextId})).rejects.toThrow('latest completed work');
    expect((await f.tool()(durable())).body.finalized).toBe(true);
    const decisions=await f.backend.aux.list<any>('write-decisions');expect(decisions).toHaveLength(2);
    expect(decisions.map(d=>d.coveredMeaningfulWorkCount).sort()).toEqual([0,1]);
    expect((await f.backend.export(f.scope)).items).toHaveLength(1);
  });

  it('recovers the original route through authenticated MCP after runtime restart without reopening tool authority',async()=>{
    const f=await fixture(),first=await httpRuntime(f),args={routeContextId:f.routeContextId,...durable()};
    first.runtime.routes.create(f.scope.principalId,{tier:'task_scoped',mode:'atomic_direct',domain:'general',confidence:1,risk:'low',recommendedCapabilities:[],requiredSkillLoads:[],allowedTools:[],verification:{required:false,suggestedTools:[]},reasonCodes:['fixture']},{reservation:{routeContextId:f.routeContextId,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()},projectId:f.root,memorySnapshot:{memoryContextId:f.contextId,memorySnapshotHash:'fixture',blockingGuardrailMemoryIds:[],blockingGuardrails:[],enforceHardGuardrails:false}});
    f.remote.offline=true;
    expect((await first.call(args)).body).toMatchObject({finalized:false,error:{code:'MEMORY_POSTFLIGHT_REQUIRED'}});
    const decisions=await f.backend.aux.list<any>('write-decisions');expect(decisions).toHaveLength(1);
    await new Promise<void>(resolve=>first.server.close(()=>resolve()));servers.splice(servers.indexOf(first.server),1);
    await first.runtime.execution.close();await first.runtime.memory.close();runtimes.splice(runtimes.indexOf(first.runtime),1);
    const restarted=await httpRuntime(f);
    expect(()=>restarted.runtime.routes.getOwned(f.routeContextId,f.scope.principalId)).toThrow('not found');
    expect((await restarted.call(args)).body).toMatchObject({finalized:false,error:{code:'MEMORY_POSTFLIGHT_REQUIRED'}});
    const stranger=await f.keyStore.create('unrelated-principal');
    expect((await restarted.call(args,stranger.key)).body).toMatchObject({finalized:false,error:{code:'ROUTE_NOT_FOUND'}});
    expect((await restarted.call({...args,routeContextId:randomUUID()})).body.error.code).toBe('ROUTE_NOT_FOUND');
    f.remote.offline=false;
    const recovered=await restarted.call(args);
    expect(recovered.body).toMatchObject({finalized:true,decisionRecordId:decisions[0].id,memoryLifecycle:{postflightState:'CLOSED'}});
    expect(await f.backend.aux.list('write-decisions')).toHaveLength(1);
    expect(await f.backend.listRevisions(f.scope,recovered.body.memoryId)).toHaveLength(1);
    expect(()=>restarted.runtime.routes.getOwned(f.routeContextId,f.scope.principalId)).toThrow('not found');
  });

  it('finalizes expired route and memory context authority without granting a fresh route',async()=>{
    const f=await fixture(),http=await httpRuntime(f);let now=Date.now();
    http.runtime.routes=new RouteContextStore({now:()=>now});
    http.runtime.routes.create(f.scope.principalId,{tier:'task_scoped',mode:'atomic_direct',domain:'general',confidence:1,risk:'low',recommendedCapabilities:[],requiredSkillLoads:[],allowedTools:[],verification:{required:false,suggestedTools:[]},reasonCodes:['fixture']},{reservation:{routeContextId:f.routeContextId,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+1000).toISOString()},projectId:f.root,memorySnapshot:{memoryContextId:f.contextId,memorySnapshotHash:'fixture',blockingGuardrailMemoryIds:[],blockingGuardrails:[],enforceHardGuardrails:false}});
    const lifecycle=await f.backend.getLifecycleContext(f.scope,f.contextId);
    await f.backend.aux.put('lifecycles',f.contextId,{...lifecycle,postflightState:'POSTFLIGHT_PENDING',expiresAt:Date.now()-1});
    now+=2000;
    expect((await http.call({routeContextId:f.routeContextId,reasonCodes:['NO_FUTURE_RELEVANCE'],evidenceRefs:[]})).body).toMatchObject({finalized:true,memoryLifecycle:{postflightState:'CLOSED'}});
    expect(()=>http.runtime.routes.getOwned(f.routeContextId,f.scope.principalId)).toThrow('not found');
  });

  it('uses only an unambiguous persisted project among allowed roots during recovery',async()=>{
    const f=await fixture(),other=path.join(f.root,'other-project');
    const multiple=await httpRuntime(f,[f.root,other]);
    expect((await multiple.call({routeContextId:f.routeContextId,reasonCodes:['NO_FUTURE_RELEVANCE'],evidenceRefs:[]})).body.finalized).toBe(true);
    const outside=await httpRuntime(f,[other]);
    expect((await outside.call({routeContextId:f.routeContextId,reasonCodes:['NO_FUTURE_RELEVANCE'],evidenceRefs:[]})).body.error.code).toBe('ROUTE_NOT_FOUND');
    const original=await f.backend.getLifecycleContext(f.scope,f.contextId);
    await f.backend.aux.put('lifecycles',randomUUID(),{...original,contextId:randomUUID(),projectId:other});
    expect((await multiple.call({routeContextId:f.routeContextId,reasonCodes:['NO_FUTURE_RELEVANCE'],evidenceRefs:[]})).body.error.code).toBe('MEMORY_LIFECYCLE_CONFLICT');
  });
});
