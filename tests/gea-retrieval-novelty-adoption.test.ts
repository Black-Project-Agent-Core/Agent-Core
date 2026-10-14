import { expect, it } from 'vitest';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { input, load, report, temp, run, readJSON } from './helpers/retrieval-report-fixtures.js';
async function setup(vectors:boolean[][],neighbors=2){
  const {deriveRetrievalProfile}=await load('retrieval-profile');
  const size=vectors[0].length;
  const evidence=vectors.map((v,i)=>{const d=input(Array(size).fill(false),v,{experimentId:'e'+i,candidateRevision:'c'+i});
    return {id:'r'+i,status:'evaluable',profile:deriveRetrievalProfile(d.c,d.o,d.score,{reportId:'p'+i})};});
  const manifest:any={schemaVersion:1,protocol:{id:'novelty-fixture',splits:{train:[],validation:vectors[0].map((_,i)=>'q'+i),holdout:[]},trainingExposure:{status:'not-established',evidenceRefs:[]}},
    runs:evidence.map((e,i)=>({id:e.id,iteration:i,checkpoint:'c'+i,status:'evaluable',split:'validation',report:'report-'+i})),analysis:{novelty:{neighbors}}};
  return {manifest,evidence};
}
async function analyze(m:any,e:any){const {summarizeRetrievalNovelty}=await load('retrieval-novelty');return summarizeRetrievalNovelty(m,e);}
for(const [name,vectors,expected] of [
  ['identical',[[true,false],[true,false]],0],
  ['disjoint',[[true,false],[false,true]],1],
  ['partial',[[true,true],[true,false]],1-1/Math.sqrt(2)],
] as const)it(`computes exact ${name} case-vector cosine novelty`,async()=>{
  const {manifest,evidence}=await setup(vectors.map(x=>[...x]));const r=await analyze(manifest,evidence);
  expect(r.rows).toHaveLength(2);expect(r.rows[0].status).toBe('available');expect(r.rows[0].novelty).toBeCloseTo(expected,14);
  expect(r.rows[0].performanceNovelty).toBeCloseTo(evidence[0].profile.candidateRate*Math.sqrt(expected),14);
  expect(r.rows[0].actualNeighborCount).toBe(1);expect(r.rows[0].vectorDigest).toMatch(/^sha256:/);
  expect(r).toMatchObject({algorithmRevision:'agent-core-task-novelty/v1',selectsParents:false,launchesExperiments:false,mutatesMemory:false,automaticApproval:false});
});
it('zero direction is unavailable, not maximally novel; a singleton has no neighbor',async()=>{
  const f=await setup([[false,false],[true,false]]),r=await analyze(f.manifest,f.evidence);
  expect(r.rows[0]).toMatchObject({status:'unavailable',reason:'zero-success-vector',novelty:null});
  expect(r.rows[1]).toMatchObject({status:'unavailable',reason:'no-scorable-neighbor',actualNeighborCount:0});
  const g=await setup([[true,false]]);expect((await analyze(g.manifest,g.evidence)).rows[0].status).toBe('unavailable');
});
it('chooses closest K neighbors with deterministic run-ID ties and no mutation',async()=>{
  const f=await setup([[true,false],[true,false],[false,true],[false,true]],1),before=JSON.stringify(f);
  const r=await analyze(f.manifest,f.evidence);expect(r.rows[0].neighbors).toEqual([{runId:'r1',distance:0}]);
  expect(r.rows[2].neighbors).toEqual([{runId:'r3',distance:0}]);expect(JSON.stringify(f)).toBe(before);
  expect(await analyze(f.manifest,[...f.evidence].reverse())).toEqual(r);
});
for(const field of ['baselineRevision','cohortDigest','evaluatorRevision','verifierRevision'])it(`separates incompatible ${field}`,async()=>{
  const f=await setup([[true,false],[false,true]]);(f.evidence[1].profile as any)[field]=field.endsWith('Digest')?'sha256:'+'9'.repeat(64):'other-v1';
  const r=await analyze(f.manifest,f.evidence);expect(r.groups).toHaveLength(2);expect(r.rows.every((r:any)=>r.status==='unavailable')).toBe(true);
});
it('keeps missing/failed/incomplete/invalid attempts visible and unscored',async()=>{
  const f=await setup([[true,false],[false,true]]);f.evidence.pop();
  for(const status of ['failed','incomplete','invalid']){f.manifest.runs.push({id:status,iteration:2,checkpoint:status,status});(f.evidence as any[]).push({id:status,status});}
  const r=await analyze(f.manifest,f.evidence);expect(r.rows).toHaveLength(5);expect(r.rows.filter((r:any)=>r.status==='unavailable')).toHaveLength(5);
  expect(r.rows.find((r:any)=>r.runId==='r1')).toMatchObject({runStatus:'invalid',reason:'missing-run-evidence'});
});
for(const n of [0,11,1.5,-1])it(`rejects neighbor bound ${n}`,async()=>{const f=await setup([[true]],n);await expect(analyze(f.manifest,f.evidence)).rejects.toThrow();});
it('requires explicit novelty config and rejects duplicate run/profile IDs and invalid membership',async()=>{
  const f=await setup([[true,false],[false,true]]);delete f.manifest.analysis;await expect(analyze(f.manifest,f.evidence)).rejects.toThrow('NOVELTY_ANALYSIS_CONFIG_REQUIRED');
  f.manifest.analysis={novelty:{neighbors:1}};f.manifest.runs[1].id='r0';await expect(analyze(f.manifest,f.evidence)).rejects.toThrow();
  f.manifest.runs[1].id='r1';f.evidence[1].profile.reportId='p0';await expect(analyze(f.manifest,f.evidence)).rejects.toThrow('DUPLICATE_REPORT_ID');
  f.evidence[1].profile.reportId='p1';f.evidence[1].profile.cases.pop();await expect(analyze(f.manifest,f.evidence)).rejects.toThrow();
});
it('refuses excessive pair work instead of sampling or returning a false success',async()=>{
  const f=await setup([Array(4100).fill(true)]);const p=f.evidence[0].profile;
  f.evidence=Array.from({length:100},(_,i)=>({id:'r'+i,status:'evaluable',profile:{...p,reportId:'p'+i}}));
  f.manifest.runs=f.evidence.map((e,i)=>({id:e.id,iteration:i,checkpoint:'c'+i,status:'evaluable',split:'validation',report:'p'+i}));
  await expect(analyze(f.manifest,f.evidence)).rejects.toThrow('NOVELTY_PAIR_WORK_LIMIT');
});
it('CLI --novelty reads verified bundles, emits numeric provenance and refuses overwrite',async()=>{
  const a=await report(input([false,false],[true,false],{experimentId:'a'})),b=await report(input([false,false],[false,true],{experimentId:'b'}));
  expect(a.result.status).toBe(0);expect(b.result.status).toBe(0);
  const f=await setup([[true,false],[false,true]],10),dir=await temp(),spec=path.join(dir,'spec.json'),out=path.join(dir,'novelty.json');
  f.manifest.runs[0].report=a.output;f.manifest.runs[1].report=b.output;await writeFile(spec,JSON.stringify(f.manifest));const before=await readFile(spec);
  const r=run('analyze-retrieval.mjs',['--novelty',spec,'--output',out]);expect(r.status,r.stderr).toBe(0);
  const result=await readJSON(out);expect(result.rows[0].novelty).toBe(1);expect(result.source.manifestDigest).toMatch(/^sha256:/);
  expect(result.numericProvenance.entries.some((x:any)=>x.sources.some((s:any)=>s.source.includes('novelty')&&s.kind==='analysis-derived'))).toBe(true);
  expect(await readFile(spec)).toEqual(before);expect(run('analyze-retrieval.mjs',['--novelty',spec,'--output',out]).status).toBe(2);
  expect(run('analyze-retrieval.mjs',['--novelty',spec,'--series',spec,'--output',path.join(dir,'bad.json')]).status).toBe(2);
});
