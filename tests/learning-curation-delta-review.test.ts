import { afterEach, expect, test } from 'vitest';
import { memorySemanticRevision } from '../SubProject/agent-core-memory/dist/memory/disclosure.js';
import { curationFixture, cleanupCuration } from './helpers/learning-curation.js';
afterEach(cleanupCuration);
test('requires trusted task/workspace binding rather than delta-selected authority',async()=>{
 const {learning,delta,binding}=await curationFixture();
 await expect(learning.reviewDelta(delta)).rejects.toThrow('CURATION_BINDING');
 for(const edit of [{taskId:'foreign'},{workspace:'other'}])await expect(learning.reviewDelta({...delta,...edit},false,binding)).rejects.toThrow('CURATION_SCOPE');
 await expect(learning.reviewDelta({...delta,entries:[{...delta.entries[0],candidate:{...delta.entries[0].candidate,workspace:'other'}}]},false,binding)).rejects.toThrow('CURATION_SCOPE');
});
test('captures verified additive lesson once across replay and rejects altered operation identity',async()=>{
 const {learning,memory,delta,binding}=await curationFixture();
 expect((await learning.reviewDelta(delta,false,binding)).summary.status).toBe('captured');
 const before=await memory.list();expect((await learning.reviewDelta(delta,true,binding)).outcomes).toHaveLength(1);expect(await memory.list()).toEqual(before);
 await expect(learning.reviewDelta({...delta,entries:[{...delta.entries[0],candidate:{...delta.entries[0].candidate,content:'Different operation'}}]},false,binding)).rejects.toThrow('CURATION_OPERATION_CONFLICT');
});
test('counterexample current target stays pending with exact negative evidence and no target mutation',async()=>{
 const {learning,memory,delta,binding,candidate}=await curationFixture();
 const targetRecord=await memory.remember({content:'Original broad lesson',provenance:{workspace:'agent-core',files:[]}});
 const target={id:targetRecord.id,revision:memorySemanticRevision(targetRecord)};
 const result=await learning.reviewDelta({...delta,entries:[{kind:'add-counterexample',target,candidate:{...candidate,content:'Does not apply to remote evidence.'}}]},true,binding);
 expect(result.summary).toMatchObject({status:'awaiting-verification',complete:false});
 expect(result.outcomes[0]).toMatchObject({status:'proposal',curation:{kind:'add-counterexample',target,candidate:{content:'Does not apply to remote evidence.',evidenceRefs:candidate.evidenceRefs}}});
 expect(await memory.read(target.id,false)).toEqual(targetRecord);
 const status:any=await learning.status();expect(status.pendingReviewCount).toBe(1);expect(status.state.procedures).toEqual([]);
});
test('stale missing and cross-workspace targets reject before capture',async()=>{
 for(const mode of ['stale','missing','foreign']){
  const {learning,memory,delta,binding,candidate}=await curationFixture();const record=await memory.remember({content:'Target lesson',provenance:{workspace:mode==='foreign'?'foreign':'agent-core',files:[]}});
  const target={id:mode==='missing'?'nonexistent':record.id,revision:mode==='stale'?'sha256:'+'0'.repeat(64):memorySemanticRevision(record)};
  const before=await memory.list();const result=await learning.reviewDelta({...delta,entries:[{kind:'add-counterexample',target,candidate}]},true,binding);
  expect(result.outcomes[0].status).toBe('rejected');expect(await memory.list()).toEqual(before);
 }
});
test('declared verified and numeric feedback never substitute replayable evidence',async()=>{
 const {learning,memory,delta,binding,candidate}=await curationFixture();const before=await memory.list();
 const result=await learning.reviewDelta({...delta,entries:[{kind:'add-lesson',candidate:{...candidate,evidenceRefs:['source:unresolved']}}]},true,binding);
 expect(result.outcomes[0].status).toBe('proposal');expect(await memory.list()).toEqual(before);
 await expect(learning.reviewDelta({...delta,entries:[{kind:'add-lesson',candidate:{...candidate,helpful:1000} as any}]},true,binding)).rejects.toThrow();
});
test('MCP delta action derives authority from the active host episode and never payload scope',async()=>{
 const {registerLearningTools}=await import('../src/mcp/learning-tools.js');
 const {learning,delta,binding}=await curationFixture();let handle:any;
 const server={registerTool:(_name:string,_schema:any,handler:any)=>{handle=handler;}};
 const external={getEpisode:async()=>({id:binding.taskId,workspace:binding.workspace}),recordLearningReview:async()=>{},pendingSkillNotices:async()=>[]};
 registerLearningTools(server as any,learning,undefined,external as any,'host-session');
 const accepted=await handle({action:'review-delta',delta});expect(accepted.isError).not.toBe(true);expect(JSON.parse(accepted.content[0].text).summary.status).toBe('captured');
 const rejected=await handle({action:'review-delta',delta:{...delta,taskId:'foreign'},taskId:'foreign',workspace:'foreign'});expect(rejected.isError).toBe(true);
});
test('completed checkpoint rejects a new delta operation instead of silently accepting unrelated work',async()=>{
 const {learning,delta,binding}=await curationFixture();await learning.reviewDelta(delta,false,binding);
 await expect(learning.reviewDelta({...delta,operationId:'new-operation'},false,binding)).rejects.toThrow('CURATION_CHECKPOINT_COMPLETE');
});
test('operation IDs matching object property names persist as ordinary idempotent data',async()=>{
 const {learning,delta,binding}=await curationFixture();
 const request={...delta,operationId:'constructor'};
 const first=await learning.reviewDelta(request,false,binding);expect(first.summary.status).toBe('captured');
 expect((await learning.reviewDelta(request,false,binding)).outcomes).toEqual(first.outcomes);
});
test('checkpoint IDs matching object property names retain their own persisted delta decision',async()=>{
 const {learning,delta,binding}=await curationFixture();
 await learning.checkpoint({idempotencyKey:'__proto__',...binding,reason:'explicit-learn',evidenceRefs:delta.entries[0].candidate.evidenceRefs});
 const request={...delta,checkpointKey:'__proto__'};await learning.reviewDelta(request,false,binding);
 const status:any=await learning.status();expect(Object.hasOwn(status.state.reviewDecisions,'__proto__')).toBe(true);
});
