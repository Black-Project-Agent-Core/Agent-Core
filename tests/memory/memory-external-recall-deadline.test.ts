import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../../src/memory/initialize.js';
import {registerMemoryExperienceTools} from '../../src/memory/mcp/experience-tools.js';

const roots:string[]=[];
const scope={taskId:'recall-task',workspaceKey:'agent-core',controllerId:'agent-core-external'};
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
afterEach(async()=>{vi.useRealTimers();vi.restoreAllMocks();await Promise.all(roots.splice(0).map(root=>{
 if(!path.resolve(root).startsWith(path.join(os.tmpdir(),'external-recall-deadline-')))throw new Error('Unexpected fixture cleanup path');
 return rm(root,{recursive:true,force:true});
}));});
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'external-recall-deadline-'));roots.push(root);
 const entered=deferred<void>(),provider=deferred<number[][]>();
 const service=await initializeMemoryRoot({baseDir:root,memoryRoot:root,experience:{enabled:true},embedder:{
  identity:{provider:'fixture',model:'deadline',dimensions:3},
  embedDocuments:async texts=>{
   if(texts.length===1&&texts[0]==='deadline probe'){entered.resolve();return provider.promise;}
   return texts.map(()=>[1,0,0]);
  },
 }});
 await service.remember({title:'Recall fixture',content:'deadline probe data',provenance:{workspace:'agent-core',files:[]}});
 const callbacks=new Map<string,(args:any,ctx?:any)=>Promise<any>>();
 const bind=(resolve=async()=>scope,admit=async()=>{},mirror?:()=>Promise<void>)=>{
  registerMemoryExperienceTools({registerTool:(name:string,_:unknown,callback:any)=>callbacks.set(name,callback)} as any,service,resolve,mirror,admit);
  return (signal?:AbortSignal)=>callbacks.get('memory_v2_read')!({action:'recall',scope:{taskId:scope.taskId},payload:{query:'deadline probe'}},{mcpReq:{signal}});
 };
 return{root,service,entered,provider,bind};
}

it('ends a hung external semantic recall at the total deadline without a late delivered receipt',async()=>{
 const f=await fixture();const call=f.bind();vi.useFakeTimers();let result:any;
 const pending=call().then(value=>{result=value;});
 await f.entered.promise;
 try{
  await vi.advanceTimersByTimeAsync(15_001);
  expect(result?.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).code).toBe('MEMORY_RECALL_DEADLINE');
 }finally{vi.useRealTimers();f.provider.resolve([[1,0,0]]);await pending;}
 const ledger=await readFile(path.join(f.root,'state/retrieval-ledger.jsonl'),'utf8').catch(()=> '');
 expect(ledger).not.toContain('recall-task');
});

it('includes authoritative scope lookup in the same external recall deadline',async()=>{
 const f=await fixture(),lookup=deferred<typeof scope>();const call=f.bind(()=>lookup.promise);
 vi.useFakeTimers();let result:any;const pending=call().then(value=>{result=value;});
 try{
  await vi.advanceTimersByTimeAsync(15_001);
  expect(result?.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).code).toBe('MEMORY_RECALL_DEADLINE');
 }finally{vi.useRealTimers();lookup.resolve(scope);f.provider.resolve([[1,0,0]]);await pending;}
 const ledger=await readFile(path.join(f.root,'state/retrieval-ledger.jsonl'),'utf8').catch(()=> '');
 expect(ledger).not.toContain('recall-task');
});

it('aborts one external waiter promptly while another caller retains the shared query flight',async()=>{
 const f=await fixture(),abort=new AbortController(),call=f.bind();let cancelled:any;
 const stopped=call(abort.signal).then(result=>{cancelled=result;});await f.entered.promise;
 const other=f.service.controller({...scope,taskId:'other-task',controllerId:'test'}).recall({query:'deadline probe'});
 // The second real caller joins the provider flight; its completion stays independent.
 abort.abort();await new Promise(resolve=>setTimeout(resolve,30));
 try{
  expect(cancelled?.isError).toBe(true);
  expect(JSON.parse(cancelled.content[0].text).code).toBe('MEMORY_DISCLOSURE_CANCELLED');
 }finally{f.provider.resolve([[1,0,0]]);await stopped;await other;}
 expect((await other).status).not.toBe('insufficient-budget');
 const ledger=await readFile(path.join(f.root,'state/retrieval-ledger.jsonl'),'utf8').catch(()=> '');
 expect(ledger).not.toContain('recall-task');
});
it('returns the committed disclosure while an optional Learning mirror is slow',async()=>{
 const f=await fixture(),mirrorEntered=deferred<void>(),mirror=deferred<void>(),mirrorDone=deferred<void>();
 const call=f.bind(undefined,undefined,async()=>{mirrorEntered.resolve();await mirror.promise;mirrorDone.resolve();});
 vi.useFakeTimers();let result:any;const pending=call().then(value=>{result=value;});
 await f.entered.promise;f.provider.resolve([[1,0,0]]);await mirrorEntered.promise;
 try{
  await vi.advanceTimersByTimeAsync(15_001);
  expect(result?.isError).not.toBe(true);expect(JSON.parse(result.content[0].text).result.data.hits.length).toBeGreaterThan(0);
 }finally{vi.useRealTimers();mirror.resolve();await mirrorDone.promise;await pending;}
 const ledger=await readFile(path.join(f.root,'state/retrieval-ledger.jsonl'),'utf8');expect(ledger).toContain('recall-task');
});
it('refuses a late ledger admission after the caller cancelled while commit was queued',async()=>{
 const f=await fixture(),entered=deferred<void>(),gate=deferred<void>(),drained=deferred<void>(),abort=new AbortController();
 const original=f.service.recordControllerDisclosure.bind(f.service);
 vi.spyOn(f.service,'recordControllerDisclosure').mockImplementation(async(...args)=>{
  entered.resolve();await gate.promise;try{return await original(...args);}finally{drained.resolve();}
 });
 const pending=f.bind()(abort.signal);await f.entered.promise;f.provider.resolve([[1,0,0]]);await entered.promise;
 abort.abort();const result=await pending;expect(result.isError).toBe(true);
 gate.resolve();await drained.promise;
 const ledger=await readFile(path.join(f.root,'state/retrieval-ledger.jsonl'),'utf8').catch(()=> '');expect(ledger).not.toContain('recall-task');
});
