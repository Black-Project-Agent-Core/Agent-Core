import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const cliRoot=process.env.AGENT_CORE_TEST_CLI_ROOT||root;
const roots:string[]=[];
afterEach(async()=>{for(const p of roots.splice(0))await rm(p,{recursive:true,force:true});});
const run=(name:string,args:string[])=>spawnSync(process.execPath,[path.join(cliRoot,'scripts/memory/evaluation',name),...args],{cwd:root,encoding:'utf8',windowsHide:true});
for(const name of ['evaluate-retrieval.mjs','verify-retrieval.mjs'])it(`${name} has read-only help`,()=>{
  const r=run(name,['--help']);expect(r.status,r.stderr).toBe(0);expect(r.stdout).toContain('Usage');
});
async function fixture(){
  const dir=await mkdtemp(path.join(root,'runtime/tmp/retrieval-cli-'));roots.push(dir);
  const cohort={schemaVersion:1,domain:'memory-retrieval-hit-at-k',revision:'cohort-v1',corpusRevision:'corpus-v1',topK:1,minimumSamples:2,
    queries:[{id:'q1',expectedIds:['memory-1']},{id:'q2',expectedIds:['memory-2']}]};
  const c=JSON.stringify(cohort);const observations={schemaVersion:1,experimentId:'cli-fixture',
    cohortDigest:'sha256:'+createHash('sha256').update(c).digest('hex'),corpusRevision:'corpus-v1',
    evaluatorRevision:'agent-core-retrieval-hit-at-k/v1',candidateRevision:'candidate-v1',baselineRevision:'baseline-v1',
    testsPassed:true,attributionComplete:true,eligibleIdentityVerified:true,substantiveActions:1,
    results:[{queryId:'q1',baselineIds:[],candidateIds:['memory-1']},{queryId:'q2',baselineIds:[],candidateIds:[]}]};
  const cohortFile=path.join(dir,'cohort.json'),observationFile=path.join(dir,'observations.json'),output=path.join(dir,'report');
  await writeFile(cohortFile,c);await writeFile(observationFile,JSON.stringify(observations));
  return {dir,cohortFile,observationFile,output,args:['--cohort',cohortFile,'--observations',observationFile,'--output',output]};
}
it('creates immutable evidence and an unapproved review candidate without persisting memory',async()=>{
  const f=await fixture();const r=run('evaluate-retrieval.mjs',f.args);expect(r.status,r.stderr).toBe(0);
  const score=JSON.parse(await readFile(path.join(f.output,'score.json'),'utf8'));
  const verified=JSON.parse(await readFile(path.join(f.output,'verification.json'),'utf8'));
  const candidate=JSON.parse(await readFile(path.join(f.output,'review-candidate.json'),'utf8'));
  expect(score.objective).toBe(0.5);expect(verified.verdict).toBe('pass');expect(candidate.verified).toBe(false);
  expect(candidate.evaluation.verification.inputsDigest).toBe(score.inputsDigest);
  const before=await readFile(path.join(f.output,'score.json'));
  const repeated=run('evaluate-retrieval.mjs',f.args);expect(repeated.status).not.toBe(0);
  expect(await readFile(path.join(f.output,'score.json'))).toEqual(before);
});
it('standalone verifier rejects tampered score and supports independent rerun',async()=>{
  const f=await fixture();const first=run('evaluate-retrieval.mjs',f.args);expect(first.status,first.stderr).toBe(0);
  const scorePath=path.join(f.output,'score.json');
  const args=['--cohort',path.join(f.output,'cohort.json'),'--observations',path.join(f.output,'observations.json'),'--score',scorePath];
  const good=run('verify-retrieval.mjs',args);expect(good.status,good.stderr).toBe(0);expect(JSON.parse(good.stdout).verdict).toBe('pass');
  const score=JSON.parse(await readFile(scorePath,'utf8'));score.objective=0.9;await writeFile(scorePath,JSON.stringify(score));
  const bad=run('verify-retrieval.mjs',args);expect(bad.status).not.toBe(0);expect(JSON.parse(bad.stdout).verdict).toBe('fail');
});
it('rejects absent input and duplicate argument names explicitly',()=>{
  expect(run('evaluate-retrieval.mjs',[]).status).not.toBe(0);
  expect(run('evaluate-retrieval.mjs',['--cohort','x','--cohort','y']).status).not.toBe(0);
});
