import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { readFile, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { FileNativeMemoryBackend } from '../src/memory/file-native/backend.js';
import { GraphifyAdapter } from '../src/memory/file-native/graphify-adapter.js';
import { validateMemoryLifecycleBeforeOperation } from '../src/mcp/memory-lifecycle-guard.js';
import { isolatedMemoryDependencies, memoryRoot, strictMemoryConfig } from './helpers/memory-fixture.js';

const roots:string[]=[];
afterEach(async()=>{
  vi.restoreAllMocks();
  for(const root of roots.splice(0)){
    if(!path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(root).startsWith('ac-strict-readiness-'))throw new Error('Fixture escaped temp');
    await rm(root,{recursive:true,force:true,maxRetries:3});
  }
});

async function fixture(realGraph=false){
  const root=await memoryRoot('strict-readiness');roots.push(root);
  const config=await strictMemoryConfig(root),dependencies=isolatedMemoryDependencies(config);
  if(realGraph)dependencies.graphify=new GraphifyAdapter(config.fileNative,{
    pythonPath:path.resolve('.tools','python','python.exe'),
    bridgePath:path.resolve('scripts','memory','graphify-bridge.py'),
  });
  const backend=new FileNativeMemoryBackend(config,dependencies);await backend.ensureReady();
  const scope={principalId:randomUUID(),projectId:root};
  const preflight=(task='Analyze the project')=>backend.preflight({scope,routeContextId:randomUUID(),task,expiresAt:Date.now()+60_000});
  return{root,config,dependencies,backend,scope,preflight};
}

describe('strict component readiness before substantive work',()=>{
  it('defaults to enforcement while explicit diagnostic modes stay opt-in',()=>{
    expect(loadConfig({},os.tmpdir()).memory.hardLifecycleMode).toBe('enforce');
    expect(loadConfig({AGENT_CORE_MEMORY_HARD_LIFECYCLE_MODE:'advisory'},os.tmpdir()).memory.hardLifecycleMode).toBe('advisory');
  });

  it('accepts an empty healthy vault after actually building and checking Graphify',async()=>{
    const f=await fixture(true),result=await f.preflight();
    expect(result.recalled).toEqual([]);
    expect(await f.backend.status(f.scope)).toMatchObject({healthy:true,graphify:{healthy:true},supabaseDirect:{healthy:true}});
    expect(f.dependencies.supabaseDirectTransport.healthCalls).toBeGreaterThan(0);
  });

  it('fails preflight when Supabase is unavailable rather than treating recall as empty',async()=>{
    const f=await fixture();f.dependencies.supabaseDirectTransport.offline=true;
    await expect(f.preflight()).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED',details:{causeCode:'MEMORY_SUPABASE_NETWORK_ERROR'}});
    expect(await f.backend.aux.list('contexts')).toEqual([]);
    f.dependencies.supabaseDirectTransport.offline=false;
    expect((await f.preflight()).recalled).toEqual([]);
  });

  it('rejects missing Supabase configuration even when local components are healthy',async()=>{
    const f=await fixture();f.config.supabaseDirect.enabled=false;
    const localOnly=new FileNativeMemoryBackend(f.config,f.dependencies);
    await expect(localOnly.preflight({scope:f.scope,routeContextId:randomUUID(),task:'Analyze',expiresAt:Date.now()+60_000})).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED',details:{causeCode:'MEMORY_SUPABASE_NOT_CONFIGURED'}});
  });

  it('blocks a broken Graphify installation and leaves its recovery diagnostics available',async()=>{
    const f=await fixture();
    f.dependencies.graphify!.ensureFresh=async()=>{throw new Error('MEMORY_GRAPHIFY_RUNTIME_UNAVAILABLE');};
    f.dependencies.graphify!.health=async()=>({healthy:false,checkedAt:Date.now(),errorCode:'MEMORY_GRAPHIFY_RUNTIME_UNAVAILABLE'});
    await expect(f.preflight()).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED',details:{causeCode:'MEMORY_GRAPHIFY_RUNTIME_UNAVAILABLE'}});
    expect(await f.backend.status(f.scope)).toMatchObject({healthy:false,graphify:{healthy:false}});
  });

  it('rejects malformed vault segments before opening a lifecycle',async()=>{
    const f=await fixture();await mkdir(path.join(f.config.fileNative.vaultRoot,'General'),{recursive:true});
    await writeFile(path.join(f.config.fileNative.vaultRoot,'General','broken.md'),'not a memory segment');
    await expect(f.preflight()).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED'});
    expect(await f.backend.aux.list('contexts')).toEqual([]);
  });

  it('checks read-only analysis before execution and keeps diagnostics accessible without a context',async()=>{
    const f=await fixture(),runtime={memory:{config:f.config},workspace:{resolveProjectRoot:()=>f.root}} as any;
    const key={id:f.scope.principalId} as any,route={routeContextId:randomUUID(),projectId:f.root} as any;
    await expect(validateMemoryLifecycleBeforeOperation(runtime,key,route,'read_file',{path:'src/index.ts'})).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED'});
    expect(await validateMemoryLifecycleBeforeOperation(runtime,key,route,'memory_status')).toMatchObject({required:false,valid:true});
  });

  it('invalidates an existing context after a canonical memory changes',async()=>{
    const f=await fixture(),pre=await f.preflight(),context=await f.backend.getContext(f.scope,pre.contextId);
    await f.backend.commit({scope:f.scope,canonicalKey:'decision:freshness',kind:'decision',value:'Use the new deployment directory.'});
    await expect(f.backend.validateLifecycleContext({scope:f.scope,contextId:pre.contextId,routeContextId:context!.routeContextId})).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED'});
    const refreshed=await f.preflight('deployment directory');expect(refreshed.recalled).toHaveLength(1);
  });

  it('uses a bounded remote health receipt and rechecks after it expires',async()=>{
    const f=await fixture(),pre=await f.preflight(),context=await f.backend.getContext(f.scope,pre.contextId);
    const input={scope:f.scope,contextId:pre.contextId,routeContextId:context!.routeContextId};
    const checked=f.dependencies.supabaseDirectTransport.healthCalls;
    await f.backend.validateLifecycleContext(input);await f.backend.validateLifecycleContext(input);
    expect(f.dependencies.supabaseDirectTransport.healthCalls).toBe(checked);
    f.dependencies.supabaseDirectTransport.offline=true;
    vi.spyOn(Date,'now').mockReturnValue(Date.now()+6_000);
    await expect(f.backend.validateLifecycleContext(input)).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED'});
  });

  it('rejects a stale context after an equal-size edit with restored modification time and recalls new bytes',async()=>{
    const f=await fixture();
    const saved=await f.backend.commit({scope:f.scope,canonicalKey:'decision:manual-policy',kind:'decision',value:'Use deployment policy A.'});
    const found=await f.backend.repo.findEntry(f.scope,saved.memoryId),file=path.join(f.config.fileNative.vaultRoot,found!.segment.relativePath);
    const stamp=new Date('2020-01-01T00:00:00.000Z');await utimes(file,stamp,stamp);
    const pre=await f.preflight('deployment policy'),context=await f.backend.getContext(f.scope,pre.contextId);
    expect(pre.recalled[0]!.valueText).toContain('policy A');
    const original=await readFile(file,'utf8'),before=await stat(file);await writeFile(file,original.replace('policy A','policy B'));await utimes(file,stamp,stamp);
    const after=await stat(file);expect(after.size).toBe(before.size);expect(after.mtimeMs).toBe(before.mtimeMs);
    await expect(f.backend.validateLifecycleContext({scope:f.scope,contextId:pre.contextId,routeContextId:context!.routeContextId})).rejects.toMatchObject({code:'MEMORY_PREFLIGHT_REQUIRED'});
    await f.backend.syncDirectMemory(f.scope);
    const refreshed=await f.preflight('deployment policy');expect(refreshed.recalled[0]!.valueText).toContain('policy B');
  });

  it('does not let a changed objective bypass unfinished analysis finalization',async()=>{
    const f=await fixture(),pre=await f.preflight(),context=await f.backend.getContext(f.scope,pre.contextId);
    await f.backend.markLifecycleMeaningfulWork({scope:f.scope,contextId:pre.contextId,routeContextId:context!.routeContextId,toolName:'read_file',reasonCode:'read_only_analysis'});
    await expect(f.preflight('An entirely different objective')).rejects.toMatchObject({code:'MEMORY_POSTFLIGHT_REQUIRED'});
    expect(await f.backend.findPendingLifecycle({scope:f.scope})).toHaveLength(1);
  });

  it('blocks a pre-opened context while another context has pending work and releases it after closure',async()=>{
    const f=await fixture(),first=await f.preflight('Analyze the deployment'),second=await f.preflight('Review the cache');
    const firstContext=await f.backend.getContext(f.scope,first.contextId),secondContext=await f.backend.getContext(f.scope,second.contextId);
    const firstInput={scope:f.scope,contextId:first.contextId,routeContextId:firstContext!.routeContextId};
    const secondInput={scope:f.scope,contextId:second.contextId,routeContextId:secondContext!.routeContextId};
    await f.backend.markLifecycleMeaningfulWork({...firstInput,toolName:'read_file',reasonCode:'read_only_analysis'});
    await expect(f.backend.validateLifecycleContext(secondInput)).rejects.toMatchObject({code:'MEMORY_POSTFLIGHT_REQUIRED',details:{pendingCount:1}});

    // Concurrent operations sharing the active context may still continue.
    const sameContext=await Promise.all([f.backend.validateLifecycleContext(firstInput),f.backend.validateLifecycleContext(firstInput)]);
    expect(sameContext.map(record=>record.contextId)).toEqual([first.contextId,first.contextId]);
    await f.backend.applyPostflight({...firstInput,reasonCodes:['TRANSIENT_OPERATION'],evidenceRefs:[]});
    expect(await f.backend.prepareLifecycleClosure(firstInput)).toMatchObject({postflightState:'CLOSED'});
    await expect(f.backend.validateLifecycleContext(secondInput)).resolves.toMatchObject({contextId:second.contextId,postflightState:'OPEN'});
  });

  it('records already-authorized late completion and permits recovery despite another pending context',async()=>{
    const f=await fixture(),first=await f.preflight('Inspect the deployment'),second=await f.preflight('Inspect the logs');
    const firstContext=await f.backend.getContext(f.scope,first.contextId),secondContext=await f.backend.getContext(f.scope,second.contextId);
    const firstInput={scope:f.scope,contextId:first.contextId,routeContextId:firstContext!.routeContextId};
    const secondInput={scope:f.scope,contextId:second.contextId,routeContextId:secondContext!.routeContextId};
    await f.backend.validateLifecycleContext(secondInput);
    await f.backend.markLifecycleMeaningfulWork({...firstInput,toolName:'read_file',reasonCode:'read_only_analysis'});
    expect(await f.backend.markLifecycleMeaningfulWork({...secondInput,toolName:'read_file',reasonCode:'read_only_analysis'})).toMatchObject({postflightState:'POSTFLIGHT_PENDING',meaningfulWorkCount:1});
    for(const input of [firstInput,secondInput]){
      await f.backend.applyPostflight({...input,reasonCodes:['TRANSIENT_OPERATION'],evidenceRefs:[]});
      expect(await f.backend.prepareLifecycleClosure(input)).toMatchObject({postflightState:'CLOSED'});
    }
    expect(await f.backend.findPendingLifecycle({scope:f.scope})).toEqual([]);
  });
});
