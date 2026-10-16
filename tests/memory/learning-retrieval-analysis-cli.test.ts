import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { bytes, hash, input, readJSON, report, run, temp } from './helpers/retrieval-report-fixtures.js';
const manifest=(reports:string[])=>({schemaVersion:1,protocol:{id:'fixture-protocol',splits:{train:[],validation:['q0','q1','q2','q3'],holdout:[]},
  trainingExposure:{status:'not-established',evidenceRefs:[]}},runs:reports.map((report,i)=>({id:'r'+i,iteration:i,checkpoint:'c'+i,split:'validation',status:'evaluable',report}))});
it('analysis CLI has read-only help with five explicit modes',()=>{
  const r=run('analyze-retrieval.mjs',['--help']);expect(r.status,r.stderr).toBe(0);
  for(const mode of ['--profile','--series','--frontier','--diversity','--stability'])expect(r.stdout).toContain(mode);
});
it('writes a bounded regression sidecar without modifying the original bundle',async()=>{
  const f=await report(),output=path.join(f.dir,'profile.json');expect(f.result.status,f.result.stderr).toBe(0);
  const names=await readdir(f.output),before=await Promise.all(names.map(n=>readFile(path.join(f.output,n)).then(hash)));
  const r=run('analyze-retrieval.mjs',['--profile',f.output,'--output',output]);expect(r.status,r.stderr).toBe(0);
  const result=await readJSON(output);expect(result.counts).toMatchObject({regressed:2,improved:2});expect(result.objective).toBe(0);
  expect(result.cases).toBeUndefined();expect(result.source.manifestDigest).toMatch(/^sha256:/);
  expect(await Promise.all(names.map(n=>readFile(path.join(f.output,n)).then(hash)))).toEqual(before);
  expect(run('analyze-retrieval.mjs',['--profile',f.output,'--output',output]).status).toBe(2);
});
it('series keeps failed bundles while frontier refuses the invalid subset',async()=>{
  const a=await report(),b=await report(input(undefined,undefined,{testsPassed:false})),dir=await temp(),file=path.join(dir,'runs.json');
  await writeFile(file,bytes(manifest([a.output,b.output])));
  const r=run('analyze-retrieval.mjs',['--series',file,'--output',path.join(dir,'series.json')]);expect(r.status,r.stderr).toBe(0);
  expect((await readJSON(path.join(dir,'series.json'))).statusCounts).toMatchObject({evaluable:1,failed:1});
  expect(run('analyze-retrieval.mjs',['--frontier',file,'--output',path.join(dir,'frontier.json')]).status).toBe(2);
});
it('frontier reports a coverage-preserving shortlist from complete comparable bundles',async()=>{
  const a=await report(input([false,false,false,false],[true,false,false,false])),b=await report(input([false,false,false,false],[false,true,false,false],{experimentId:'specialist'}));
  const dir=await temp(),file=path.join(dir,'runs.json'),output=path.join(dir,'frontier.json');await writeFile(file,bytes(manifest([a.output,b.output])));
  const r=run('analyze-retrieval.mjs',['--frontier',file,'--output',output]);expect(r.status,r.stderr).toBe(0);
  const result=await readJSON(output);expect(result.shortlist).toHaveLength(2);expect(result.uncovered.count).toBe(2);
  expect(result.deploymentRecommendation).toBe(false);expect(result.coverageLoss).toBe(0);
});
it('rejects ambiguous modes and failed profiles without creating output',async()=>{
  const f=await report(input(undefined,undefined,{testsPassed:false})),output=path.join(f.dir,'not-written.json');
  expect(run('analyze-retrieval.mjs',['--profile',f.output,'--output',output]).status).toBe(2);
  expect(run('analyze-retrieval.mjs',['--profile',f.output,'--series',f.output,'--output',output]).status).toBe(2);
  expect(await readdir(f.dir)).not.toContain('not-written.json');
});

it('series CLI forwards bounded mechanism attribution evidence',async()=>{
  const a=await report();
  const b=await report(input(undefined,undefined,{experimentId:'second',candidateRevision:'candidate-v2'}));
  const dir=await temp(),file=path.join(dir,'runs-attribution.json'),output=path.join(dir,'series-attribution.json');
  const value:any=manifest([a.output,b.output]);
  value.runs[1].mechanismAttribution={version:1,components:['retrieval-policy'],controls:[
    {kind:'replay',comparedRunId:'r0',description:'Reviewed comparable replay.',evidenceRefs:['verification:replay']}]};
  await writeFile(file,bytes(value));
  const result=run('analyze-retrieval.mjs',['--series',file,'--output',output]);
  expect(result.status,result.stderr).toBe(0);
  const summary=await readJSON(output);
  expect(summary.mechanismAttribution[1]).toMatchObject({status:'structurally-comparable',causalAttribution:'not-established'});
});