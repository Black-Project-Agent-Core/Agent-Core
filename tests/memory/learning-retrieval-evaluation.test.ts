import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { evaluateRetrieval } from '../../src/memory/evaluation/retrieval-evaluation.js';
import { verifyRetrieval } from '../../src/memory/evaluation/retrieval-verifier.js';
const hash=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value));
const combined=(a:Uint8Array,b:Uint8Array)=>hash(Buffer.from('agent-core-retrieval-input/v1\0'+hash(a)+'\0'+hash(b)));
function fixture(){
  const cohort={schemaVersion:1,domain:'memory-retrieval-hit-at-k',revision:'cohort-v1',corpusRevision:'corpus-v1',topK:1,minimumSamples:20,
    queries:Array.from({length:40},(_,i)=>({id:'q'+i,expectedIds:['memory-'+i]}))};
  const c=encode(cohort);
  const observations={schemaVersion:1,experimentId:'fixture-comparison',cohortDigest:hash(c),corpusRevision:'corpus-v1',
    evaluatorRevision:'agent-core-retrieval-hit-at-k/v1',candidateRevision:'candidate-v1',baselineRevision:'baseline-v1',
    testsPassed:true,attributionComplete:true,eligibleIdentityVerified:true,substantiveActions:4,
    results:cohort.queries.map((q,i)=>({queryId:q.id,baselineIds:i<8?q.expectedIds:[],candidateIds:i<15?q.expectedIds:[]}))};
  return {cohort,observations,c,o:encode(observations)};
}
async function subjects(){
  return {evaluate:evaluateRetrieval,verify:verifyRetrieval};
}
it('uses real fixed query membership and independently reproduces 15/40 minus 8/40',async()=>{
  const {evaluate,verify}=await subjects(),f=fixture(),result=evaluate(f.c,f.o);
  expect(result.correct).toBe(true);expect(result.objective).toBeCloseTo(0.175,12);
  expect(result.inputsDigest).toBe(combined(f.c,f.o));expect(verify(f.c,f.o,result).verdict).toBe('pass');
});
for(const name of ['testsPassed','attributionComplete','eligibleIdentityVerified','substantiveActions'])it(`independently rejects forged success after ${name} fails`,async()=>{
  const {evaluate,verify}=await subjects(),f=fixture(),good=evaluate(f.c,f.o);
  const changed=encode({...f.observations,[name]:name==='substantiveActions'?0:false});
  const forged={...good,inputsDigest:combined(f.c,changed),observationsDigest:hash(changed)};
  expect(evaluate(f.c,changed).correct).toBe(false);expect(verify(f.c,changed,forged).verdict).toBe('fail');
});
for(const label of ['missing','duplicate','foreign'])it(`rejects ${label} query identity rather than changing denominators`,async()=>{
  const {evaluate,verify}=await subjects(),f=fixture(),good=evaluate(f.c,f.o);
  const rows=f.observations.results.slice();
  if(label==='missing') rows.pop();if(label==='duplicate')rows[1]=rows[0];if(label==='foreign')rows[1]={...rows[1],queryId:'foreign'};
  const changed=encode({...f.observations,results:rows});
  expect(evaluate(f.c,changed).correct).toBe(false);
  expect(verify(f.c,changed,{...good,inputsDigest:combined(f.c,changed),observationsDigest:hash(changed)}).verdict).toBe('fail');
});
for(const [label,patch] of [
  ['forged objective',{objective:0.9}],['impossible count',{metrics:{candidateSuccesses:99,candidateSamples:40}}],
  ['stale inputs',{inputsDigest:'sha256:'+'b'.repeat(64)}],['wrong evaluator',{evaluatorRevision:'other-v2'}],
  ['false correctness',{correct:false}],['string objective',{objective:'0.175'}],
] as const)it(`independent verifier refuses ${label}`,async()=>{
  const {evaluate,verify}=await subjects(),f=fixture();expect(verify(f.c,f.o,{...evaluate(f.c,f.o),...patch}).verdict).toBe('fail');
});
for(const value of [0,1.5,'20',true])it(`does not coerce cohort minimum ${String(value)}`,async()=>{
  const {evaluate}=await subjects(),f=fixture(),c=encode({...f.cohort,minimumSamples:value});
  expect(evaluate(c,encode({...f.observations,cohortDigest:hash(c)})).correct).toBe(false);
});
it('detects changed cohort/corpus and duplicate result IDs',async()=>{
  const {evaluate}=await subjects(),f=fixture();
  for(const patch of [{cohortDigest:'sha256:'+'f'.repeat(64)},{corpusRevision:'different'},
    {results:f.observations.results.map((r,i)=>i? r:{...r,candidateIds:['memory-0','memory-0']})}])
    expect(evaluate(f.c,encode({...f.observations,...patch})).correct).toBe(false);
});
it('allows valid zero/negative differences without calling them improvements',async()=>{
  const {evaluate,verify}=await subjects(),f=fixture();
  for(const limit of [0,8]){
    const o=encode({...f.observations,results:f.observations.results.map((r,i)=>({...r,candidateIds:i<limit?['memory-'+i]:[]}))});
    const result=evaluate(f.c,o);expect(result.correct).toBe(true);expect(result.objective).toBeLessThanOrEqual(0);
    expect(verify(f.c,o,result).verdict).toBe('pass');
  }
});
it('rejects malformed JSON and unexpected fields without running or fetching anything',async()=>{
  const {evaluate,verify}=await subjects(),f=fixture();
  expect(evaluate(Buffer.from('not-json'),f.o).correct).toBe(false);
  expect(evaluate(f.c,encode({...f.observations,command:'not-allowed'})).correct).toBe(false);
  expect(verify(f.c,f.o,{correct:true,objective:0.175}).verdict).toBe('fail');
});
