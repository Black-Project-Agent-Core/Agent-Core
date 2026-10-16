import {afterEach,expect,test} from 'vitest';
import {createControllerMemoryDispatcher,MemoryService} from '../../../src/memory/facade.js';
import {resumeControllerTask} from '../../../src/memory/examples/controller-continuation.js';
import {setup,cleanup,start,append,item,checkpoint} from './helpers/memory-capsule.js';
afterEach(cleanup);
test('allowlisted transport binds scope in host and refuses arbitrary methods, fields and scope injection',async()=>{
 const {A}=await setup();const dispatch=createControllerMemoryDispatcher(A);
 expect((await dispatch({method:'memory_capabilities',input:{}})).advisory).toBe(true);
 for(const request of [{method:'constructor',input:{}},{method:'memory_task_context',scope:{workspaceKey:'other'},input:{}},{method:'memory_task_context',input:{taskId:'other'}},{method:'memory_capabilities',input:{root:'/tmp'}}])await expect(dispatch(request)).rejects.toThrow('MEMORY_INPUT_INVALID');
});
test('fresh controller learns exact obligations, next action and old success via public dispatcher only; negative mandatory oracle fails',async()=>{
 const {A,dir,scope}=await setup();let header=await A.startEpisode(start);const evidence=await A.captureEvidence({operationId:'success-evidence',source:{kind:'controller-text',text:'Why: bounded CAS. How: replay operation. Reuse: isolated local root.'}});
 const required=[item('hard-rule','constraint','Never release before review'),item('pending-review','obligation','Get independent review'),item('next-check','next-action','Run ERR_T9 src/Case.ts 🧠'),item('old-success','successful-strategy','Replay succeeded with operation CAS',true,[evidence.source])];
 header={...header,revision:(await A.appendEvent(append(header,'mandatory-state',required))).revision};await A.checkpoint(checkpoint(header));
 const B=createControllerMemoryDispatcher((await MemoryService.initialize(dir,dir)).controller({...scope,controllerId:'B'}));const resumed=await resumeControllerTask(B);
 const oracle=(value:typeof resumed)=>{for(const expected of required)expect(value.workingState.find(x=>x.id===expected.id)).toEqual(expected);expect(value.evidence.some(x=>x.text==='Why: bounded CAS. How: replay operation. Reuse: isolated local root.')).toBe(true);};oracle(resumed);expect(()=>oracle({...resumed,workingState:resumed.workingState.filter(x=>x.id!=='hard-rule')})).toThrow();
});
test('stale capsule fallback reads current paged episode instead of using old next action',async()=>{
 const {A,B}=await setup();let header=await A.startEpisode(start);header={...header,revision:(await A.appendEvent(append(header,'old-next',[item('next-check','next-action','Old action')]))).revision};await A.checkpoint(checkpoint(header));
 const correction=append(header,'current-next',[item('next-check','next-action','Current user correction: inspect first')]);correction.event.kind='correction';await A.appendEvent(correction);
 const resumed=await resumeControllerTask(createControllerMemoryDispatcher(B));expect(resumed.usedFallback).toBe(true);expect(resumed.workingState.find(x=>x.id==='next-check')?.text).toBe('Current user correction: inspect first');
});
test('adapter meters the final envelope at minimum and maximum supported budgets',async()=>{
 const {A,service}=await setup();await service.remember({content:'Adapter Unicode 🧠 '.repeat(100),provenance:{workspace:'agent-core',files:[]}});const dispatch=createControllerMemoryDispatcher(A);
 for(const maxBytes of [512,700,1024,8192,65536]){const response=await dispatch({method:'memory_recall',input:{budget:{maxBytes}}});const serialized=JSON.stringify(response);expect(response.metrics.payloadBytes).toBe(Buffer.byteLength(serialized));expect(response.metrics.estimatedTokens).toBe(Math.ceil(Array.from(serialized).length/4));expect(response.metrics.payloadBytes).toBeLessThanOrEqual(maxBytes);expect(response.result.metrics).toBeDefined();}
});
test('too-small adapter requests do not falsely record exposure or publish a checkpoint',async()=>{
 let calls=0;const session={recall(){calls++;return {status:'ok',data:{text:'x'.repeat(400)},metrics:{payloadBytes:500,estimatedTokens:125,tokenEstimator:'unicode-codepoints/4-v1'},warnings:[]};}} as any;
 session.checkpoint=session.recall;const dispatch=createControllerMemoryDispatcher(session);
 const checkpointResponse=await dispatch({method:'memory_checkpoint',input:{episodeId:'synthetic-episode',expectedRevision:1,operationId:'small-checkpoint',trigger:'explicit',budget:{maxBytes:512}}});expect(checkpointResponse.result.status).toBe('insufficient-budget');expect(calls).toBe(0);
 const response=await dispatch({method:'memory_recall',input:{budget:{maxBytes:512}}});expect(response.result.status).toBe('insufficient-budget');expect(calls).toBe(0);
 await expect(dispatch({method:'memory_recall',input:{budget:{maxBytes:512},scope:'injected'}})).rejects.toThrow('MEMORY_INPUT_INVALID');
});
