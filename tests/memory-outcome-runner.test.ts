import path from 'node:path';
import {mkdir,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {runOutcomeSuite,freezeOutcomeSnapshot,resolveOutcomeRead,parseOutcomeArguments} from '../scripts/verify/memory-outcome-eval.mjs';
import {outcomeFixtureSnapshot,outcomeFixtureSuite,outcomeFixtureDevelopment} from './helpers/memory-outcome-fixture.js';
import {sealOutcomePreregistration} from '../scripts/verify/memory-outcome-preregistration.mjs';
import {OutcomeMemoryAdapter} from '../scripts/verify/memory-outcome-adapter.mjs';
import {workflowCase,taskReviewDecision} from '../scripts/verify/cumulative-workflow-support.mjs';
const roots:string[]=[];
async function fixture(){const base=path.resolve('runtime/tmp');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'outcome-runner-'));roots.push(root);return root;}
afterEach(async()=>{vi.unstubAllGlobals();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
describe('offline outcome runner isolation',()=>{
 it('preserves extracted pure fixture and task review accounting',()=>{
  expect(workflowCase('engineering',1).oracle.tests).toHaveLength(5);
  expect(workflowCase('research',1).oracle.facts).toHaveLength(3);
  expect(taskReviewDecision({reviewDecisions:{key:{taskId:'task',complete:true,status:'captured'}},pendingReviews:[{taskId:'task'}]},'task').complete).toBe(false);
 });
 it('refuses legacy continue and unknown options',()=>{
  expect(()=>parseOutcomeArguments(['--continue','old'])).toThrow(/LEGACY_CONTINUE_REFUSED/);
  expect(()=>parseOutcomeArguments(['--provider','x'])).toThrow(/UNKNOWN_OPTION/);
 });
 it('offline entrypoint cannot label scripted rows as live controllers',async()=>{
  const root=await fixture(),suitePath=await outcomeFixtureSuite(root);const suite=JSON.parse(await readFile(suitePath,'utf8'));suite.mode='live';suite.driver='real-controller';await writeFile(suitePath,JSON.stringify(suite));
  await expect(runOutcomeSuite({suitePath,phase:'baseline',output:path.join(root,'output')})).rejects.toThrow(/OFFLINE_MODE_REQUIRED/);
 });
 it('accepts a separate sealed preregistration argument for comparisons',()=>{
  expect(parseOutcomeArguments(['--suite','suite','--phase','compare','--output','new','--baseline','prior','--candidate-snapshot','candidate','--preregistration','seal.json'])).toMatchObject({phase:'compare',preregistrationPath:path.resolve('seal.json')});
 });
 it('rejects oracle reads, symlinks and neighboring roots',async()=>{
  const root=await fixture(),work=path.join(root,'work'),oracle=path.join(root,'oracle');await mkdir(work);await mkdir(oracle);
  await writeFile(path.join(oracle,'answer.json'),'private oracle');await writeFile(path.join(work,'input.txt'),'input');
  await symlink(path.join(oracle,'answer.json'),path.join(work,'link.txt'));
  await expect(resolveOutcomeRead(work,path.join(oracle,'answer.json'))).rejects.toThrow(/SCOPE_REFUSED/);
  await expect(resolveOutcomeRead(work,path.join(work,'link.txt'))).rejects.toThrow(/SYMLINK_REFUSED/);
  expect(await resolveOutcomeRead(work,path.join(work,'input.txt'))).toBe('input');
 });
 it('baseline never loads live config and creates exactly 48 isolated rows',async()=>{
  const root=await fixture();vi.stubGlobal('fetch',()=>{throw Error('NETWORK_FORBIDDEN');});
  const snapshot=path.join(root,'snapshot');await freezeOutcomeSnapshot(process.cwd(),snapshot,'test-built-snapshot');
  const output=path.join(root,'baseline'),suitePath=await outcomeFixtureSuite(root);
  const sentinel=path.join(root,'production-sentinel');await writeFile(sentinel,'unchanged');
  const rows=await runOutcomeSuite({suitePath,phase:'baseline',output,baselineSnapshot:snapshot});
  expect(rows).toHaveLength(48);expect(rows.every((row:any)=>row.counters.inferenceCalls===0)).toBe(true);
  expect(rows.filter((row:any)=>row.arm==='current').every((row:any)=>row.adapter.policy==='baseline-v1'&&row.adapter.engineMode==='experience-v2')).toBe(true);
  expect(await readFile(sentinel,'utf8')).toBe('unchanged');
  await expect(runOutcomeSuite({suitePath,phase:'baseline',output,baselineSnapshot:snapshot})).rejects.toThrow(/OUTPUT_EXISTS/);
 },120000);
 it('old one-argument factory cannot masquerade as fusion candidate',async()=>{
  const root=await fixture(),snapshot=path.join(root,'snapshot');const seal=await freezeOutcomeSnapshot(process.cwd(),snapshot,'test-built-snapshot');
  const adapter=new OutcomeMemoryAdapter();await adapter.initialize(path.join(root,'run'),{content:'latest events',kind:'procedure'},{engineMode:'experience-v2',activation:'synthetic-v2',policy:'fusion-feedback-v1',snapshotRoot:snapshot,...seal});
  const original=adapter.runtime.experience.controller.bind(adapter.runtime.experience);adapter.runtime.experience.controller=(scope:any)=>original(scope,'baseline-v1');
  expect(()=>adapter.session('candidate-policy','native')).toThrow(/BLOCKED:CANDIDATE_POLICY_UNAVAILABLE/);
 });
 it('compare preserves sealed baseline and verifies all72 explicit-policy rows',async()=>{
  const root=await fixture(),suitePath=await outcomeFixtureSuite(root);
  const current=await outcomeFixtureSnapshot(root),candidate=await outcomeFixtureSnapshot(root,'memory-plans02-05-candidate');
  const baseline=path.join(root,'baseline'),comparison=path.join(root,'compare');
  await runOutcomeSuite({suitePath,phase:'baseline',output:baseline,baselineSnapshot:current.snapshot});
  const before=await readFile(path.join(baseline,'results/observations.json'));
  const rows=await runOutcomeSuite({suitePath,phase:'compare',output:comparison,baselinePath:baseline,candidateSnapshot:candidate.snapshot});
  expect(rows).toHaveLength(72);expect(rows.filter((row:any)=>row.arm==='candidate').every((row:any)=>row.adapter.policy==='fusion-feedback-v1')).toBe(true);
  expect(await readFile(path.join(baseline,'results/observations.json'))).toEqual(before);
  expect(JSON.parse(await readFile(path.join(comparison,'report/report.json'),'utf8'))).toMatchObject({complete:true,benefitProven:false,candidateStatus:'BLOCKED'});
  expect(JSON.parse(await readFile(path.join(comparison,'logs/baseline-commands.json'),'utf8'))[0].exitCode).toBe(0);
  const developmentPath=await outcomeFixtureDevelopment(suitePath,rows.filter((row:any)=>row.arm!=='candidate'),path.join(root,'development.json'));
  const preregistrationPath=path.join(root,'preregistration-seal.json');
  await sealOutcomePreregistration({baselinePath:baseline,developmentPath,output:preregistrationPath,observedAt:'2026-10-08T00:00:00Z',registeredAt:'2026-10-09T00:00:00Z'});
  const registeredOutput=path.join(root,'registered-compare');
  await runOutcomeSuite({suitePath,phase:'compare',output:registeredOutput,baselinePath:baseline,candidateSnapshot:candidate.snapshot,preregistrationPath});
  expect(JSON.parse(await readFile(path.join(registeredOutput,'report/report.json'),'utf8'))).toMatchObject({complete:true,preregistration:{status:'PASS'},candidateAccepted:false,benefitProven:false});
  expect(await readFile(path.join(registeredOutput,'fixtures/frozen-suite.json'))).toEqual(await readFile(path.join(baseline,'fixtures/suite.json')));
  expect(await readFile(path.join(baseline,'results/observations.json'))).toEqual(before);
  const baselineRow=rows.find((row:any)=>row.arm==='current');const artifact=baselineRow.artifactRef.split(':')[1].split('#')[0];await writeFile(path.join(baseline,artifact),'tampered');
  await expect(runOutcomeSuite({suitePath,phase:'compare',output:path.join(root,'tampered-compare'),baselinePath:baseline,candidateSnapshot:candidate.snapshot})).rejects.toThrow(/BASELINE_ARTIFACT_DRIFT/);
 },120000);
 it('rejects empty or failed baseline command ledgers before candidate opening',async()=>{
  const root=await fixture(),suitePath=await outcomeFixtureSuite(root),baseline=path.join(root,'baseline');
  for(const dir of ['fixtures','results','report','logs'])await mkdir(path.join(baseline,dir),{recursive:true});
  await writeFile(path.join(baseline,'fixtures/suite.json'),await readFile(suitePath));await writeFile(path.join(baseline,'results/observations.json'),'[]');await writeFile(path.join(baseline,'report/report.json'),JSON.stringify({complete:true}));
  for(const commands of [[],[{command:'prior',status:'FAIL',exitCode:7}],[{command:'prior',status:'PASS',exitCode:7}]]){
   await writeFile(path.join(baseline,'logs/commands.json'),JSON.stringify(commands));
   await expect(runOutcomeSuite({suitePath,phase:'compare',output:path.join(root,'output'),baselinePath:baseline,candidateSnapshot:path.join(root,'candidate')})).rejects.toThrow(/BASELINE_EXECUTION_INCOMPLETE/);
  }
 });
 it('preserves a blocked partial run under independently replayable canonical names',async()=>{
  const root=await fixture(),suitePath=await outcomeFixtureSuite(root),current=await outcomeFixtureSnapshot(root),output=path.join(root,'blocked');
  const fault=vi.spyOn(OutcomeMemoryAdapter.prototype,'execute').mockRejectedValueOnce(Error('SYNTHETIC_EIO'));
  try{await expect(runOutcomeSuite({suitePath,phase:'baseline',output,baselineSnapshot:current.snapshot})).rejects.toThrow(/SYNTHETIC_EIO/);}finally{fault.mockRestore();}
  expect(JSON.parse(await readFile(path.join(output,'results/observations.json'),'utf8'))).toEqual([]);
  expect(JSON.parse(await readFile(path.join(output,'report/report.json'),'utf8'))).toMatchObject({complete:false,candidateStatus:'BLOCKED',benefitProven:false});
  expect(JSON.parse(await readFile(path.join(output,'logs/commands.json'),'utf8'))[0]).toMatchObject({status:'BLOCKED',exitCode:2});
 });
 it('blocks modified compiled snapshot before any recall',async()=>{
  const root=await fixture(),snapshot=path.join(root,'snapshot'),suitePath=await outcomeFixtureSuite(root);await freezeOutcomeSnapshot(process.cwd(),snapshot,'test-built-snapshot');
  await writeFile(path.join(snapshot,'dist/memory/host-runtime.js'),'tampered');
  await expect(runOutcomeSuite({suitePath,phase:'baseline',output:path.join(root,'run'),baselineSnapshot:snapshot})).rejects.toThrow(/SNAPSHOT_DIGEST_MISMATCH/);
 });
});
