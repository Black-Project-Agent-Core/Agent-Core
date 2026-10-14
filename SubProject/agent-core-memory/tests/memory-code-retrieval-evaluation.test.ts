import {expect,test} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {searchMemories} from '../src/memory/retrieval.js';
import {memorySemanticRevision} from '../src/memory/disclosure.js';
import {flattenRetrievalTokens,tokenizeRetrievalText} from '../src/memory/identifier-tokenizer.js';
import {tokenizeMemoryText} from '../src/memory/semantic-document.js';
import type {MemoryRecord} from '../src/memory/types.js';
const suite=JSON.parse(readFileSync(new URL('./fixtures/code-identifiers-v1/suite.json',import.meta.url),'utf8'));
const baseline=JSON.parse(readFileSync(new URL('./fixtures/code-identifiers-v1/baseline-results.json',import.meta.url),'utf8'));
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const time=Date.parse('2026-10-01T00:00:00Z');
const record=(r:{id:string;content:string}):MemoryRecord=>({version:1,...r,keywords:[],context:'General',tags:[],category:'Uncategorized',links:[],createdAt:'2024-01-01T00:00:00Z',updatedAt:'2024-01-01T00:00:00Z',lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false});
function validateFamilies(rows:any[]):void {
 const development=new Set(rows.filter(row=>row.partition==='development').map(row=>row.family));
 if(rows.some(row=>row.partition==='heldout'&&development.has(row.family)))throw new Error('family overlap');
}
function correctHit(hit:{id:string;revision:string},expected:MemoryRecord):boolean{return hit.id===expected.id&&hit.revision===memorySemanticRevision(expected);}
test('heldout_family_overlap_is_rejected',()=>{expect(()=>validateFamilies([...suite.rows,{...suite.rows[0],partition:'heldout'}])).toThrow('overlap');});
test('revision_mismatch_is_not_success',()=>{const r=record({id:'sample',content:'sample'});expect(correctHit({id:r.id,revision:'sha256:'+'0'.repeat(64)},r)).toBe(false);});

// Immutable functional gates; timing and performance acceptance were explicitly deferred.
const SEALED_SUITE = 'e666f9c6115fbebd779e70d39a841d1f015f2d7f10f3cf443e5f1d43fbc1a490';
function metrics(rows:any[],observations:any[]){
 if(rows.length!==observations.length||rows.some(row=>!observations.some(o=>o.family===row.family)))throw new Error('missing denominator');
 let tp=0,fp=0,tn=0,fn=0;
 const cases=rows.map(row=>{
  const observation=observations.find(o=>o.family===row.family)!;
  const expected=row.expectedId?record(row.records.find((r:any)=>r.id===row.expectedId)):undefined;
  const right=Boolean(expected&&observation.hits.some((hit:any)=>correctHit(hit,expected)));
  if(expected){if(right)tp++;else fn++;if(observation.hits.some((hit:any)=>!correctHit(hit,expected)))fp++;}
  else if(observation.hits.length)fp++;else tn++;
  return {family:row.family,expectedId:row.expectedId,hits:observation.hits,correct:right||!expected&&!observation.hits.length};
 });
 return {tp,fp,tn,fn,recallAt1:tp/(tp+fn||1),precisionAt1:tp/(tp+fp||1),mrr:tp/(tp+fn||1),denominator:rows.length,cases};
}
test('frozen_functional_paired_replay_preserves_all_case_denominators',()=>{
 expect(hash(suite)).toBe(SEALED_SUITE);validateFamilies(suite.rows);
 expect(()=>metrics(suite.rows,[])).toThrow('missing denominator');
 const groups:any[]=[];
 // Development is evaluated first; the sealed algorithm/gates cannot be changed for heldout.
 for(const partition of ['development','heldout']){
  const rows=suite.rows.filter((row:any)=>row.partition===partition);
  const candidate=rows.map((row:any)=>({family:row.family,hits:searchMemories(row.records.map(record),row.query,{rankingProfile:'fusion',maxNeighbors:0,limit:1},undefined,50,time).map(r=>({id:r.record.id,revision:memorySemanticRevision(r.record)}))}));
  const before=metrics(rows,baseline.rows.filter((row:any)=>row.partition===partition)),after=metrics(rows,candidate);
  expect(after.recallAt1).toBeGreaterThanOrEqual(before.recallAt1);expect(after.fp).toBeLessThanOrEqual(before.fp);expect(after.cases.every((row:any)=>row.correct)).toBe(true);
  const tokenCounts=rows.map((row:any)=>{const text=[row.query,...row.records.map((r:any)=>r.content)].join(' ');const old=tokenizeMemoryText(text).length,current=flattenRetrievalTokens(tokenizeRetrievalText(text)).length;return {family:row.family,baseline:old,candidate:current,multiplier:current/(old||1)};});
  groups.push({partition,baseline:before,candidate:after,tokenCounts});
 }
 const report={fixtureVersion:suite.version,fixtureDigest:SEALED_SUITE,baselineCommit:baseline.baselineCommit,groups,limits:{inputCodePoints:131072,emittedOccurrences:4096,tokenCodePoints:256},latency:{status:'NOT RUN',reason:'User deferred performance benchmarks'},liveBenefit:'UNPROVEN; synthetic lexical correctness only',exceptions:'Legacy/BM25 and pinned fusion do not promise wrong-code exclusion; separately exercised in memory-code-retrieval.test.ts'};
 if(process.env.MEMORY_CODE_EVAL_OUTPUT){mkdirSync(process.env.MEMORY_CODE_EVAL_OUTPUT,{recursive:true});writeFileSync(path.join(process.env.MEMORY_CODE_EVAL_OUTPUT,'results.json'),JSON.stringify(report,null,2)+'\n');}
});
