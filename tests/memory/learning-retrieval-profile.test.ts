import { expect, it } from 'vitest';
import { bytes, hash, input, load } from './helpers/retrieval-report-fixtures.js';
import { evaluateRetrieval } from '../../src/memory/evaluation/retrieval-evaluation.js';
it('reveals different regressions behind equal scalar deltas',async()=>{
  const {deriveRetrievalProfile}=await load('retrieval-profile');
  const a=input(),b=input(undefined,[true,true,false,false]);
  expect(a.score.objective).toBe(0);expect(b.score.objective).toBe(0);
  const x=deriveRetrievalProfile(a.c,a.o,a.score),y=deriveRetrievalProfile(b.c,b.o,b.score);
  expect(x.counts).toEqual({retained:0,regressed:2,improved:2,'still-missed':0});
  expect(y.counts).toEqual({retained:2,regressed:0,improved:0,'still-missed':2});
  expect(x.regressionFraction).toEqual({numerator:2,denominator:2,value:1});
});
for(const [b,c,counts] of [
  [[true,true],[true,true],{retained:2,regressed:0,improved:0,'still-missed':0}],
  [[false,false],[false,false],{retained:0,regressed:0,improved:0,'still-missed':2}],
  [[false,false],[true,false],{retained:0,regressed:0,improved:1,'still-missed':1}],
] as const)it(`partitions all cases for ${JSON.stringify(counts)}`,async()=>{
  const {deriveRetrievalProfile}=await load('retrieval-profile'),f=input([...b],[...c]);
  const p=deriveRetrievalProfile(f.c,f.o,f.score);expect(p.counts).toEqual(counts);
  expect(Object.values(p.counts).reduce((a:any,v:any)=>a+v,0)).toBe(b.length);
  expect(p.counts.improved-p.counts.regressed).toBe(f.score.metrics.candidateSuccesses-f.score.metrics.baselineSuccesses);
  if(!b.some(Boolean))expect(p.regressionFraction.value).toBeNull();
});
it('bounds safe ID lists while hashing the complete sorted membership',async()=>{
  const {deriveRetrievalProfile,summarizeRetrievalProfile}=await load('retrieval-profile'),f=input();
  const p=deriveRetrievalProfile(f.c,f.o,f.score),s=summarizeRetrievalProfile(p,1);
  expect(s.transitions.regressed).toMatchObject({count:2,queryIds:['q0'],omitted:1,digest:hash(bytes(['q0','q1']))});
  expect(s.cases).toBeUndefined();expect(JSON.stringify(s)).not.toContain('expectedIds');
});
it('sorting observations cannot change transitions or complete-list digests',async()=>{
  const {deriveRetrievalProfile,summarizeRetrievalProfile}=await load('retrieval-profile'),f=input();
  const reordered=bytes({...f.observation,results:[...f.observation.results].reverse()});
  const a=summarizeRetrievalProfile(deriveRetrievalProfile(f.c,f.o,f.score));
  const b=summarizeRetrievalProfile(deriveRetrievalProfile(f.c,reordered,evaluateRetrieval(f.c,reordered)));
  expect(a.transitions).toEqual(b.transitions);
});
for(const mode of ['duplicate-query','duplicate-result','mixed-corpus','forged-score','failed-hard-test'])it(`refuses profile from ${mode}`,async()=>{
  const {deriveRetrievalProfile}=await load('retrieval-profile'),f=input();
  if(mode==='duplicate-query')f.cohort.queries[1].id=f.cohort.queries[0].id;
  const c=bytes(f.cohort);f.observation.cohortDigest=hash(c);
  if(mode==='duplicate-result')f.observation.results[1].queryId=f.observation.results[0].queryId;
  if(mode==='mixed-corpus')f.observation.corpusRevision='different';
  if(mode==='failed-hard-test')f.observation.testsPassed=false;
  const o=bytes(f.observation),s=evaluateRetrieval(c,o);if(mode==='forged-score')s.objective=0.9;
  expect(()=>deriveRetrievalProfile(c,o,s)).toThrow();
});
for(const limit of [-1,0,1.5,1001])it(`refuses invalid list limit ${limit}`,async()=>{
  const {deriveRetrievalProfile,summarizeRetrievalProfile}=await load('retrieval-profile'),f=input();
  expect(()=>summarizeRetrievalProfile(deriveRetrievalProfile(f.c,f.o,f.score),limit)).toThrow();
});
