import {afterEach,expect,test} from 'vitest';
import {MemoryService} from '../src/index.js';
import {assessTaskContinuity} from '../src/memory/controller-session.js';
import {setup,cleanup,start,append,item,checkpoint,bounded,expandAll} from './helpers/memory-capsule.js';
afterEach(cleanup);
test('continuity assessment prioritizes expansion, stale evidence, checkpoint and ready without outcome claims',()=>{
 const base:any={detail:'full',episodeRef:{kind:'episode',id:'synthetic',revision:'sha256:'+'1'.repeat(64)},freshness:'current',needsCheckpoint:false,capsule:{}};
 expect(assessTaskContinuity(base)).toEqual({status:'ready',reasons:[]});
 expect(assessTaskContinuity({...base,capsule:undefined,freshness:'unknown',needsCheckpoint:true}).status).toBe('checkpoint-required');
 for(const freshness of ['unknown','stale'])expect(assessTaskContinuity({...base,freshness}).status).toBe('revalidate-required');
 expect(assessTaskContinuity({...base,capsule:undefined,capsuleRef:base.episodeRef,freshness:'unknown'}).status).toBe('revalidate-required');
 expect(assessTaskContinuity({...base,capsule:undefined,capsuleRef:base.episodeRef}).status).toBe('checkpoint-required');
 expect(assessTaskContinuity({...base,needsCheckpoint:true}).status).toBe('checkpoint-required');
 expect(assessTaskContinuity({...base,detail:'handle-only',freshness:'stale'}).status).toBe('expand-required');
});
test('fresh controller preserves uncheckpointed goal and projects checkpoint requirement',async()=>{
 const {A,dir,scope}=await setup();const header=await A.startEpisode(start);
 const B=(await MemoryService.initialize(dir,dir)).controller({...scope,controllerId:'fresh-controller'});
 const before=await B.getTaskContext();expect(before.data?.continuity?.status).toBe('checkpoint-required');expect(before.data?.episode).toEqual(header);
 const expanded=JSON.parse((await expandAll(B,before.data!.episodeRef)).text);expect(expanded.workingState.some((i:any)=>i.text===start.goal)).toBe(true);
 expect(await B.getTaskContext()).toEqual(before);
});
test('handoff restart preserves critical items and source refs, bounded handle and exact checkpoint replay',async()=>{
 const {A,dir,scope}=await setup();let h=await A.startEpisode(start);const source=(await A.captureEvidence({operationId:'continuity-source',source:{kind:'controller-text',text:'Synthetic independent evidence'}})).source;
 const critical=[item('constraint-id','constraint','Preserve boundary '+ 'x'.repeat(200),true,[source]),item('blocker-id','blocker','Inspect dependency',true,[source]),item('next-action-id','next-action','Run scoped verification',true,[source])];
 h={...h,revision:(await A.appendEvent(append(h,'critical-update',critical,[source]))).revision};
 const input=checkpoint(h,'handoff-checkpoint');const saved=await A.checkpoint(input);
 const B=(await MemoryService.initialize(dir,dir)).controller({...scope,controllerId:'handoff-controller'});
 expect(await B.checkpoint(input)).toEqual(saved);const context=await B.getTaskContext();expect(context.data?.continuity?.status).toBe('ready');
 for(const expected of critical)expect(context.data?.capsule?.criticalItems.find(i=>i.id===expected.id)).toEqual(expected);
 for(const budget of [512,1024,8192]){const read=await B.getTaskContext({budget:{maxBytes:budget}});bounded(read,budget);if(budget===512){expect(read.data?.continuity?.status).not.toBe('ready');expect(read.status==='insufficient-budget'||read.data?.detail==='handle-only').toBe(true);}}
 const foreign=(await MemoryService.initialize(dir,dir)).controller({...scope,taskId:'other-task'});await expect(foreign.appendEvent(append(h,'foreign'))).rejects.toThrow('MEMORY_SCOPE_MISMATCH');
});
test.each(['paused','completed'] as const)('%s context is advisory and never resumes or writes',async status=>{
 const {A}=await setup();let h=await A.startEpisode(start);h=await A.setEpisodeStatus({episodeId:h.id,expectedRevision:h.revision,operationId:'stop-status',status,reason:'User stop or completed task',sourceRefs:[]});
 const input=checkpoint(h);await A.checkpoint(input);const before=await A.getTaskContext();expect(before.data?.episode?.status).toBe(status);expect(before.data?.continuity?.status).toBe('ready');expect(await A.getTaskContext()).toEqual(before);
});

test('unavailable existing checkpoint is revalidation work, never mistaken for a fresh task',async()=>{
 const {writeFile}=await import('node:fs/promises');const {default:path}=await import('node:path');const {A,dir}=await setup();const h=await A.startEpisode(start);await A.checkpoint(checkpoint(h));const before=await A.getTaskContext();const ref=before.data!.capsuleRef!;
 await writeFile(path.join(dir,'archive/manifests',ref.id+'.json'),'{}');const context=await A.getTaskContext();expect(context.data?.continuity?.status).toBe('revalidate-required');expect(context.data?.capsuleRef).toEqual(ref);expect(context.data?.episodeRef).toEqual(before.data?.episodeRef);expect(context.warnings).toContain('capsule-unavailable');expect(context.data?.capsule).toBeUndefined();
});
