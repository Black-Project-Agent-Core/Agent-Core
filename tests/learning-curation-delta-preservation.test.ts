import { afterEach, expect, test, vi } from 'vitest';
import { LearningService } from '../src/learning/service.js';
import { memorySemanticRevision } from '../SubProject/agent-core-memory/dist/memory/disclosure.js';
import { curationFixture, cleanupCuration } from './helpers/learning-curation.js';
afterEach(()=>{vi.restoreAllMocks();return cleanupCuration();});
test('partial sink failure preserves siblings and retries unresolved entries after restart once',async()=>{
 const {learning,memory,config,delta,binding,candidate}=await curationFixture();
 const unrelated=await Promise.all(['One','Two','Three'].map(content=>memory.remember({content,provenance:{workspace:'agent-core',files:[]}})));
 const original=memory.remember.bind(memory);let fail=true;
 vi.spyOn(memory,'remember').mockImplementation(async input=>{if(fail&&input.content==='Second accepted lesson'){fail=false;throw Error('synthetic sink failure');}return original(input);});
 const second={kind:'add-lesson' as const,candidate:{...candidate,content:'Second accepted lesson'}};
 const result=await learning.reviewDelta({...delta,entries:[...delta.entries,second]},false,binding);
 expect(result.outcomes.map(value=>value.status)).toEqual(['captured','sink-failed']);expect(result.summary.complete).toBe(false);
 const reopened=await LearningService.initialize(config,memory);
 expect((await reopened.reviewDelta({...delta,entries:[second]},false,binding)).summary.complete).toBe(true);
 expect((await memory.list()).filter(record=>record.content===candidate.content)).toHaveLength(1);
 expect((await memory.list()).filter(record=>record.content===second.candidate.content)).toHaveLength(1);
 for(const record of unrelated){const after=await memory.read(record.id,false);expect(after).toEqual(record);expect(memorySemanticRevision(after!)).toBe(memorySemanticRevision(record));}
});
test('counterexample proposal survives reopen and two controllers share one checkpoint outcome',async()=>{
 const {learning,memory,config,delta,binding,candidate}=await curationFixture();
 const targetRecord=await memory.remember({content:'Unchanged knowledge',provenance:{workspace:'agent-core',files:[]}});
 const request={...delta,entries:[{kind:'add-counterexample' as const,target:{id:targetRecord.id,revision:memorySemanticRevision(targetRecord)},candidate}]};
 await learning.reviewDelta(request,false,binding);const reopened=await LearningService.initialize(config,memory);
 await reopened.reviewDelta(request,true,binding);const status:any=await reopened.status();
 expect(Object.keys(status.state.reviewDecisions[delta.checkpointKey].candidateResults)).toHaveLength(1);
 expect(status.pendingReviewCount).toBe(1);expect(status.state.procedures).toEqual([]);expect(await memory.read(targetRecord.id,false)).toEqual(targetRecord);
});
test('one unavailable target read preserves an accepted sibling and keeps the review incomplete',async()=>{
 const {learning,memory,delta,binding,candidate}=await curationFixture();
 const record=await memory.remember({content:'Target read fails transiently',provenance:{workspace:'agent-core',files:[]}});
 const read=memory.read.bind(memory);vi.spyOn(memory,'read').mockImplementation(async(id,track)=>{if(id===record.id)throw Error('synthetic target unavailable');return read(id,track);});
 const result=await learning.reviewDelta({...delta,entries:[...delta.entries,{kind:'add-counterexample',target:{id:record.id,revision:memorySemanticRevision(record)},candidate}]},false,binding);
 expect(result.outcomes.map(value=>value.status)).toEqual(['captured','rejected']);expect(result.summary.complete).toBe(false);
 expect((await memory.list()).filter(value=>value.content===candidate.content)).toHaveLength(1);
});
