import {afterEach,expect,test} from 'vitest';
import {MemoryService} from '../SubProject/agent-core-memory/src/index.js';
import {setup,cleanup,start} from '../SubProject/agent-core-memory/tests/helpers/memory-capsule.js';
import {intentionUpsert,evaluateIntentions} from '../SubProject/agent-core-memory/src/memory/prospective-intentions.js';
afterEach(cleanup);
const value={summary:'Inspect authorized synthetic result',cue:{kind:'at-or-after' as const,instant:'2026-10-11T02:00:00Z'}};
const upsert=(header:any,operationId:string,change:any)=>({episodeId:header.id,expectedRevision:header.revision,operationId,event:{kind:'observation' as const,summary:'Explicit intention update',sourceRefs:[],stateChanges:[change]}});
async function current(session:any){const context=await session.getTaskContext();const page=await session.expand({source:context.data.episodeRef,view:'episode',budget:{maxBytes:65536}});return JSON.parse(page.data.text);}
test('cancel_and_reschedule_survive_reopen',async()=>{
 const {A,dir,scope}=await setup();let header=await A.startEpisode(start);
 let result=await A.appendEvent(upsert(header,'intention-create',intentionUpsert('pending-review',value,[])));header={...header,revision:result.revision};
 const B=(await MemoryService.initialize(dir,dir)).controller({...scope,controllerId:'resumed-controller'});
 const before=await current(B);expect(evaluateIntentions(before.workingState,{now:'2026-10-11T02:00:00Z',eventKeys:[]},64).items[0].status).toBe('eligible');
 const reschedule=upsert(header,'intention-reschedule',intentionUpsert('pending-review',{...value,cue:{kind:'at-or-after',instant:'2026-10-12T02:00:00Z'}},[]));
 result=await B.appendEvent({...reschedule,event:{...reschedule.event,kind:'correction'}});header={...header,revision:result.revision};
 const latest=await current(B);expect(latest.header.revision).toBeGreaterThan(before.header.revision);
 expect(latest.workingState.filter((x:any)=>x.id==='pending-review')).toHaveLength(1);
 expect(evaluateIntentions(latest.workingState,{now:'2026-10-11T02:00:00Z',eventKeys:[]},64).items[0].status).toBe('waiting');
 await B.appendEvent(upsert(header,'intention-cancel',{op:'resolve',itemId:'pending-review',reason:'User cancelled this synthetic obligation',sourceRefs:[result.eventRef]}));
 const C=(await MemoryService.initialize(dir,dir)).controller(scope),cancelled=await current(C);
 expect(evaluateIntentions(cancelled.workingState,{now:'2026-10-12T02:00:00Z',eventKeys:[]},64).items[0].status).toBe('resolved');
 expect(cancelled.events.at(-1).stateChanges[0].reason).toContain('cancelled');
});
test('same_operation_is_idempotent',async()=>{
 const {A}=await setup();const header=await A.startEpisode(start),request=upsert(header,'intention-create',intentionUpsert('pending-review',value,[]));
 const result=await A.appendEvent(request),replay=await A.appendEvent(request);
 expect(replay.duplicate).toBe(true);expect(replay.eventRef).toEqual(result.eventRef);
 await expect(A.appendEvent({...request,event:{...request.event,summary:'Changed payload'}})).rejects.toThrow('MEMORY_OPERATION_CONFLICT');
 await expect(A.appendEvent({...request,operationId:'stale-update'})).rejects.toThrow();
 await expect(A.setEpisodeStatus({episodeId:header.id,expectedRevision:result.revision,operationId:'complete-active',status:'completed',reason:'Attempted premature completion',sourceRefs:[]})).rejects.toThrow();
 const snapshot=await current(A);expect(snapshot.header.eventCount).toBe(2);expect(snapshot.workingState.find((x:any)=>x.id==='pending-review').state).toBe('active');
});
