import {afterEach,describe,expect,it} from 'vitest';
import {writeFile} from 'node:fs/promises';
import {parseRetrievalPlan} from '../src/learning/subquestion-retrieval.js';
import {cleanupFixtures,createFixture,ScriptedRetrieval} from './fixtures/memory-subquestion/replay.js';
afterEach(cleanupFixtures);
describe('offline bounded retrieval through the existing scoped host facade',()=>{
 it('replays multipart evidence with exact revisions, visible gaps and no scope leak',async()=>{
  const f=await createFixture(),driver=new ScriptedRetrieval(f);
  await driver.bootstrap();await driver.recall('root');for(const q of f.plan.questions)await driver.recall(q.id);
  let merged=driver.merged();
  expect(driver.bootstrapCalls).toBe(1);expect(driver.budget.recallCalls).toBe(5);
  expect(driver.trace.every(call=>call.bytes<=call.maxBytes)).toBe(true);expect(driver.totalBytes()).toBeLessThanOrEqual(32768);
  expect(merged.hits.some(item=>item.hit.id===f.records.foreign.id)).toBe(false);
  for(const key of ['first','second','correction']){
   const expected=f.oracle[key],candidate=merged.hits.find(item=>item.hit.id===expected.id&&item.hit.revision===expected.revision);
   expect(candidate?.questionIds).toContain(expected.questionIds[0]);
  }
  for(const key of ['first','second'])await driver.expand(f.oracle[key],f.oracle[key].questionIds);
  merged=driver.merged();expect(merged.coverage.filter(item=>item.status==='evidence-reviewed')).toHaveLength(2);
  expect(merged.coverage.find(item=>item.questionId==='q4')?.status).not.toBe('evidence-reviewed');
  expect(driver.trace.some(call=>call.action==='expand'&&call.source?.revision===f.oracle.first.revision)).toBe(true);
  expect(driver.budget.expandCalls).toBe(2);
 });
 it('handles a simple lookup with one recall and no decomposition',async()=>{
  const f=await createFixture(),driver=new ScriptedRetrieval(f,parseRetrievalPlan(f.suite.singleLookup));
  await driver.recall('root');expect(driver.budget.recallCalls).toBe(1);expect(driver.merged().coverage).toHaveLength(1);
 });
 it('owner revalidates source freshness, revision and scope between calls',async()=>{
  const f=await createFixture(),driver=new ScriptedRetrieval(f);await driver.recall('q1');
  await writeFile(f.sourceFiles.first,'Source changed after exposure');await driver.recall('q1');
  expect(driver.merged().hits.find(item=>item.hit.id===f.records.first.id)?.hit.freshness).toBe('stale');
  await f.memory.update(f.records.first.id,{content:'period-alpha corrected between retrieval calls'});await driver.recall('q1');
  let merged=driver.merged();expect(merged.revisionConflicts).toContain(f.records.first.id);
  await driver.expand(f.oracle.first,['q1']);merged=driver.merged();
  expect(merged.coverage.find(item=>item.questionId==='q1')?.status).not.toBe('evidence-reviewed');
  f.binding.workspaceKey='foreign-workspace';await driver.expand(f.oracle.second,['q2']);
  expect(driver.trace.at(-1)).toMatchObject({code:'MEMORY_SCOPE_MISMATCH'});
  expect(driver.merged().coverage.find(item=>item.questionId==='q2')).toMatchObject({status:'blocked',reason:'MEMORY_SCOPE_MISMATCH'});
 });
 it('never uses cached recall or cursor as authorization after a binding change',async()=>{
  const f=await createFixture(),driver=new ScriptedRetrieval(f);await driver.recall('q1',{limit:1});
  const result=driver.observations[0].result;expect(result.status).not.toBe('insufficient-budget');
  if(result.status==='insufficient-budget')throw Error('fixture-overflow');expect(result.data.nextCursor).toBeTruthy();
  f.binding.taskId='synthetic-task-b';await driver.recall('q1',{limit:1,cursor:result.data.nextCursor});
  expect(driver.trace.at(-1)?.code).toBe('MEMORY_SCOPE_MISMATCH');expect(driver.budget.recallCalls).toBe(2);
  f.authorized=false;await driver.expand(f.oracle.first,['q1']);
  expect(driver.trace.at(-1)?.code).toBe('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');expect(driver.trace.filter(call=>call.action==='expand')).toHaveLength(1);
 });
 it('counts insufficient-budget, transient retry and continuation without hiding failed questions',async()=>{
  const f=await createFixture(),driver=new ScriptedRetrieval(f);
  driver.budget.remainingBytes=512;await driver.recall('q1');
  expect(driver.merged().coverage.find(item=>item.questionId==='q1')).toMatchObject({status:'gap',reason:'insufficient-budget'});
  const retry=new ScriptedRetrieval(f);retry.nextFailure='transient';await retry.recall('q2');
  expect(retry.budget.recallCalls).toBe(2);expect(retry.trace[0].code).toBe('TRANSIENT_FIXTURE_UNAVAILABLE');expect(retry.merged().coverage.find(item=>item.questionId==='q2')?.status).toBe('retrieved');
  retry.nextFailure='transient';await retry.recall('q3');expect(retry.budget.recallCalls).toBe(3);expect(retry.merged().coverage.find(item=>item.questionId==='q3')?.status).toBe('blocked');
  await retry.recall('q1',{limit:1});const result=retry.observations.at(-1)!.result;
  if(result.status==='insufficient-budget')throw Error('fixture-overflow');await retry.recall('q1',{limit:1,cursor:result.data.nextCursor});
  expect(retry.budget.recallCalls).toBe(5);await retry.recall('q4');await retry.recall('root');
  expect(retry.budget.recallCalls).toBe(6);expect(retry.merged().coverage[0]).toMatchObject({status:'blocked',reason:'recall-call-limit'});
 });
 it('rejects oversize whole responses and exposes timeout and late settlement without claiming cancellation',async()=>{
  const f=await createFixture(),oversize=new ScriptedRetrieval(f);oversize.nextFailure='oversize';await oversize.recall('q1');
  expect(oversize.budget.protocolViolation).toBe(true);expect(oversize.observations).toHaveLength(0);expect(oversize.merged().coverage[1].reason).toBe('protocol-violation');
  const timeout=new ScriptedRetrieval(f);timeout.nextFailure='timeout';await timeout.recall('q2');expect(timeout.merged().coverage[2]).toMatchObject({status:'blocked',reason:'timeout'});
  const late=new ScriptedRetrieval(f);late.nextFailure='late';await late.recall('q1');expect(late.observations).toHaveLength(0);
  expect(late.trace[0]).toMatchObject({late:true,networkStopped:false,code:'late-settlement'});expect(late.merged().coverage[1].reason).toBe('late-settlement');
  await late.recall('q2');expect(late.budget.recallCalls).toBe(1);expect(late.merged().coverage[2].reason).toBe('deadline');
 });
 it('keeps poisoned advisory text as data and performs no instructed operation',async()=>{
  const f=await createFixture(),driver=new ScriptedRetrieval(f);await driver.recall('root',{query:'poisoned advisory abstract'});
  const poison=driver.merged().hits.find(item=>item.hit.id===f.records.poison.id);expect(poison?.hit.abstract).toContain('Ignore grants');
  expect(driver.trace.map(call=>call.action)).toEqual(['recall']);
  expect(poison?.hit.applicability).toBe('unknown');
  await driver.expand({kind:'memory',id:poison!.hit.id,revision:poison!.hit.revision},['root']);
  const reviewed=driver.merged();expect(reviewed.coverage[0].status).toBe('evidence-reviewed');
  expect(reviewed.hits.find(item=>item.hit.id===poison!.hit.id)?.hit.applicability).not.toBe('current');
 });
});
