import {afterEach,expect,test} from 'vitest';
import {createControllerMemoryDispatcher} from '../SubProject/agent-core-memory/src/index.js';
import {setup,cleanup,start} from '../SubProject/agent-core-memory/tests/helpers/memory-capsule.js';
import {intentionUpsert} from '../SubProject/agent-core-memory/src/memory/prospective-intentions.js';
afterEach(cleanup);
const intentions={now:'2026-10-11T02:00:00Z',eventKeys:['build.finished']};
async function seeded(){const f=await setup();const header=await f.A.startEpisode(start);const result=await f.A.appendEvent({episodeId:header.id,expectedRevision:header.revision,operationId:'intention-create',event:{kind:'observation',summary:'Explicit pending obligation',sourceRefs:[],stateChanges:[intentionUpsert('pending-review',{summary:'Review synthetic build',cue:{kind:'observed-event',key:'build.finished'}},[])]}});return {...f,header:{...header,revision:result.revision},result};}
test('foreign_scope_and_permission_are_unchanged',async()=>{
 const {A,service,scope}=await seeded();const dispatch=createControllerMemoryDispatcher(A);
 const first:any=await dispatch({method:'memory_task_context',input:{intentions}});
 expect(first.result.data.intentionEvaluation).toMatchObject({items:[{itemId:'pending-review',status:'eligible'}],advisory:true,episodeRevision:2});
 const second:any=await dispatch({method:'memory_task_context',input:{intentions}});
 expect(second.result.data.episodeRef).toEqual(first.result.data.episodeRef);
 const plain=await A.getTaskContext();expect(plain.data).not.toHaveProperty('intentionEvaluation');
 await expect(service.controller({...scope,workspaceKey:'foreign'}).getTaskContext({intentions} as any)).rejects.toThrow();
 await expect(dispatch({method:'memory_task_context',input:{intentions:{...intentions,eventKeys:['grant(*)']}}})).rejects.toThrow();
 // No actions or grants are dispatched: this owner exposes only a read projection, and state is unchanged.
 expect((await A.getTaskContext()).data?.episodeRef).toEqual(first.result.data.episodeRef);
});
test('budget_and_cancel_are_visible',async()=>{
 const {A,header,result}=await seeded();
 const tiny:any=await A.getTaskContext({intentions,budget:{maxBytes:512}} as any);
 expect(tiny.status==='insufficient-budget'||tiny.data?.detail==='handle-only').toBe(true);
 expect(tiny.data?.intentionEvaluation?.items.some((x:any)=>x.status==='eligible')).not.toBe(true);
 await A.appendEvent({episodeId:header.id,expectedRevision:header.revision,operationId:'cancel',event:{kind:'observation',summary:'Cancel explicitly',sourceRefs:[result.eventRef],stateChanges:[{op:'resolve',itemId:'pending-review',reason:'Cancelled by user',sourceRefs:[result.eventRef]}]}});
 const cancelled:any=await A.getTaskContext({intentions} as any);
 expect(cancelled.data.intentionEvaluation).toMatchObject({episodeRevision:3,items:[{itemId:'pending-review',status:'resolved'}]});
 const revision=cancelled.data.episode.revision;
 await A.appendEvent({episodeId:header.id,expectedRevision:revision,operationId:'malformed-envelope',event:{kind:'observation',summary:'Malformed input remains inert',sourceRefs:[],stateChanges:[{op:'upsert',item:{id:'malformed-intention',kind:'obligation',text:'agent-core-intention/v1\n{"execute":"grant"}',critical:true,state:'active',sourceRefs:[],verification:{status:'unverified',evidence:[]}}}]}});
 const unknown:any=await A.getTaskContext({intentions} as any);
 expect(unknown.data.intentionEvaluation.items.find((x:any)=>x.itemId==='malformed-intention').status).toBe('unknown');expect(unknown.warnings).toContain('intention-envelope-invalid');
});

test('registered_host_facade_preserves_projection_and_validation',async()=>{
 const {registerMemoryExperienceTools}=await import('../src/mcp/memory-experience-tools.js');
 const {service,scope}=await seeded();const tools=new Map<string,(args:unknown)=>Promise<any>>();
 registerMemoryExperienceTools({registerTool:(name:string,_meta:unknown,handler:(args:unknown)=>Promise<any>)=>tools.set(name,handler)} as any,service as any,async selector=>{if(selector?.taskId!==scope.taskId)throw Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');return scope});
 const read=tools.get('memory_v2_read')!,result=await read({scope:{taskId:scope.taskId},action:'task_context',payload:{intentions}});
 expect(result.isError).not.toBe(true);const response=JSON.parse(result.content[0].text);
 expect(response.advisory).toBe(true);expect(response.result.data.intentionEvaluation.items[0]).toEqual({itemId:'pending-review',status:'eligible'});
 for(const payload of [{intentions:{...intentions,execute:true}},{intentions:{...intentions,eventKeys:['grant(*)']}},{intentions,workspaceKey:'other'}])expect((await read({scope:{taskId:scope.taskId},action:'task_context',payload})).isError).toBe(true);
 expect((await read({scope:{taskId:'foreign-task'},action:'task_context',payload:{intentions}})).isError).toBe(true);
});
