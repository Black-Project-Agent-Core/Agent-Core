import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../src/memory/initialize.js';
import {ExternalControllerLearningService} from '../src/learning/external-controller.js';
import {LearningService} from '../src/learning/service.js';
const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots){if(!root.startsWith(path.join(os.tmpdir(),'external-continuity-')))throw new Error('Unexpected fixture');await rm(root,{recursive:true,force:true});}roots.length=0;});
async function fixture(){
 const root=await mkdtemp(path.join(os.tmpdir(),'external-continuity-'));roots.push(root);
 const memory=await initializeMemoryRoot({baseDir:root,memoryRoot:path.join(root,'runtime/memory'),experience:{enabled:true}});
 const learning=await LearningService.initialize({enabled:true,stateDir:path.join(root,'runtime/learning'),reviewInterval:5,curatorIntervalHours:24},memory);
 const external=await ExternalControllerLearningService.initialize({stateDir:path.join(root,'runtime/external'),memory,experience:memory,learning});
 const binding={ownerId:'fixture-owner',workspaceIdentityKey:'agent-core'};
 const start=(key:string,description?:string,session='session')=>(external.startEpisode as any)(session,{workspace:'agent-core',taskKey:key,...(description?{description}:{})},binding);
 const controller=(taskId:string)=>memory.controller({taskId,workspaceKey:'agent-core',controllerId:'agent-core-external'});
 return{root,memory,learning,external,start,controller};
}
it('links an explicitly described external task to one resumable Memory episode',async()=>{
 const f=await fixture(),task=await f.start('ship-report','Preserve source evidence and produce the report');
 const c=f.controller(task.id),context=await c.getTaskContext();
 expect(context.data?.episode?.taskId).toBe(task.id);
 expect(task.memoryTask.status).toBe('linked');
 const snapshot=await c.expand({source:context.data!.episodeRef,view:'episode'});
 expect(snapshot.data?.text).toContain('Preserve source evidence and produce the report');
 const resumed=await f.start('ship-report','New wording must not reset old work','reconnect');
 expect(resumed.id).toBe(task.id);
 expect((await c.getTaskContext()).data?.episodeRef).toEqual(context.data?.episodeRef);
});
it('retains constraint, failed path, next action and checkpoint across external reconnect',async()=>{
 const f=await fixture(),task=await f.start('continue-work','Finish the scoped repair');
 const c=f.controller(task.id),first=(await c.getTaskContext()).data!.episode!;
 const source=(await c.captureEvidence({operationId:'capture-input',source:{kind:'controller-text',text:'Keep the existing owner; retry only the missing range.'}})).source;
 const entries=[['scope-boundary','constraint','Do not touch Native'],['known-failure','failed-path','Do not repeat the committed operation'],['resume-action','next-action','Inspect receipt for operation 12']];
 const update={episodeId:first.id,expectedRevision:first.revision,operationId:'handoff-state',event:{kind:'checkpoint' as const,summary:'Explicit handoff',sourceRefs:[source],stateChanges:entries.map(([id,kind,text])=>({op:'upsert' as const,item:{id,kind,text,critical:true,state:'active',sourceRefs:[source],verification:{status:'unverified',evidence:[]}}}))}};
 const changed=await c.appendEvent(update as any);await c.appendEvent(update as any);
 await c.checkpoint({episodeId:first.id,expectedRevision:changed.revision,operationId:'handoff-checkpoint',trigger:'handoff'});
 await f.start('continue-work','ignored revised wording','reconnect');
 const invocation=await f.external.captureToolInvocationContext({invocationId:'resume-context',processSessionId:'fixture-process',sessionId:'reconnect',ownerId:'fixture-owner'});
 const result=await f.external.context('reconnect',{workspace:'agent-core'},'fixture-owner',invocation);
 expect(result.memoryTaskContext.data?.capsule?.criticalItems.map((item:any)=>item.text)).toEqual(expect.arrayContaining(entries.map(e=>e[2])));
 expect(result.memoryTaskContext.data?.continuity?.status).toBe('ready');
});
it.each(['paused','completed'] as const)('reads %s Memory without reopening or replacing its episode',async status=>{
 const f=await fixture(),task=await f.start('stopped-task','Retain the user stopping condition');
 const c=f.controller(task.id),header=(await c.getTaskContext()).data!.episode!;
 await c.setEpisodeStatus({episodeId:header.id,expectedRevision:header.revision,operationId:'user-stopped',status,reason:'Explicit user state',sourceRefs:[]});
 await f.start('stopped-task','Do not reopen','reconnect');
 expect((await c.getTaskContext()).data?.episode?.status).toBe(status);
});
it('does not attribute a delayed Memory link to the replacement external task',async()=>{
 const f=await fixture();let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{entered=r;});
 const original=f.memory.controller.bind(f.memory);
 vi.spyOn(f.memory,'controller').mockImplementation((...args:any[])=>{
  const c=original(...args as Parameters<typeof original>);
  return new Proxy(c,{get(target,key){if(key==='startEpisode')return async(input:any)=>{if(input.goal==='Delayed original task'){entered();await gate;}return target.startEpisode(input);};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});
 });
 const pending=f.start('task-a','Delayed original task');
 // Former implementation has no bridge, so it will complete without entering Memory.
 const reached=await Promise.race([ready.then(()=>true),pending.then(()=>false)]);
 expect(reached).toBe(true);
 const replacement=await f.start('task-b','Replacement task');release();const old=await pending;
 expect(old.memoryTask).toMatchObject({status:'unavailable',reason:'EXTERNAL_CONTINUITY_STALE_TASK'});
 expect((await f.external.getEpisode('session'))?.id).toBe(replacement.id);
 expect((await f.controller(replacement.id).getTaskContext()).data?.episode?.taskId).toBe(replacement.id);
});
