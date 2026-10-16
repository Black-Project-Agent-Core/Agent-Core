import { expect, it } from 'vitest';
import { input, load } from './helpers/retrieval-report-fixtures.js';
const manifest=()=>({schemaVersion:1,protocol:{id:'protocol-v1',splits:{train:[],validation:['q0','q1','q2','q3'],holdout:[]},
  trainingExposure:{status:'not-established',evidenceRefs:[]}},runs:[
  {id:'r0',iteration:0,checkpoint:'initial',split:'validation',status:'evaluable',report:'first'},
  {id:'r1',iteration:1,checkpoint:'final',split:'validation',status:'evaluable',report:'second'}]});
async function profiles(patch:any={}){const {deriveRetrievalProfile}=await load('retrieval-profile');
  const a=input(),b=input(undefined,[true,true,true,true],{experimentId:'later',candidateRevision:'candidate-v2',...patch});
  return [deriveRetrievalProfile(a.c,a.o,a.score),deriveRetrievalProfile(b.c,b.o,b.score)];}
it('retains every checkpoint and exposes unknown resource and training exposure',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles();
  const r=summarizeRetrievalSeries(manifest(),[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]);
  expect(r.mode).toBe('trajectory');expect(r.rows).toHaveLength(2);expect(r.rows[0].profile.counts.regressed).toBe(2);
  expect(r.rows[0].resources['task.wallMs']).toBeNull();expect(r.trainingExposure.status).toBe('not-established');
  expect(r.groups).toHaveLength(1);expect(r.groups[0].independentReplicates).toEqual([]);
});
it('a single report is labeled single checkpoint, not a trajectory',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a]=await profiles(),m=manifest();m.runs.pop();
  expect(summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a}]).mode).toBe('single-checkpoint');
});
it('high final scores do not erase failed and incomplete attempts',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[,b]=await profiles(),m:any=manifest();
  m.runs[0].status='failed';m.runs.push({id:'r2',iteration:2,checkpoint:'interrupted',status:'incomplete'});
  const r=summarizeRetrievalSeries(m,[{id:'r0',status:'failed',reason:'hard-tests-failed'},{id:'r1',status:'evaluable',profile:b},{id:'r2',status:'incomplete'}]);
  expect(r.rows).toHaveLength(3);expect(r.statusCounts).toMatchObject({failed:1,incomplete:1,evaluable:1});
});
it('different baseline identities become separate groups, not one leaderboard',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles({baselineRevision:'other-baseline'});
  const r=summarizeRetrievalSeries(manifest(),[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]);
  expect(r.groups).toHaveLength(2);expect(r.comparable).toBe(false);expect(r.winner).toBeUndefined();
});
for(const mode of ['overlap','duplicate-run','duplicate-report','decreasing-cumulative','cost-no-evidence','false-holdout'])it(`refuses ${mode}`,async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  const evidence=[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}];
  if(mode==='overlap')m.protocol.splits.train=['q0'];
  if(mode==='duplicate-run')m.runs[1].id='r0';
  if(mode==='duplicate-report')evidence[1].profile=a;
  if(mode==='decreasing-cumulative'){m.runs[0].cumulativeResources=[{dimension:'task.toolCalls',value:10,evidenceRefs:['source:counter']}];m.runs[1].cumulativeResources=[{dimension:'task.toolCalls',value:9,evidenceRefs:['source:counter']}];}
  if(mode==='cost-no-evidence')m.runs[0].resources=[{dimension:'task.wallMs',value:10,evidenceRefs:[]}];
  if(mode==='false-holdout')m.runs[0].split='holdout';
  expect(()=>summarizeRetrievalSeries(m,evidence)).toThrow();
});
it('reports sourced cost, budget overrun and unknown human supervision separately',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  m.budgets={basis:'per-run',limits:{'task.wallMs':5}};m.runs[0].resources=[{dimension:'task.wallMs',value:10,evidenceRefs:['source:timer']}];
  const r=summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]);
  expect(r.rows[0].resources['task.wallMs']).toEqual({value:10,evidenceRefs:['source:timer']});
  expect(r.rows[0].outOfBudget).toEqual([{dimension:'task.wallMs',observed:10,limit:5}]);
  expect(r.rows[0].humanModalities).toBeNull();expect(r.rows[1].resources['task.wallMs']).toBeNull();
});
it('dispersion requires distinct explicitly attested independent seeds at the same checkpoint',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),{deriveRetrievalProfile}=await load('retrieval-profile');
  const f=input(),g=input(undefined,[true,true,true,true],{experimentId:'seed-b'}),m:any=manifest();
  for(let i=0;i<2;i++)Object.assign(m.runs[i],{iteration:0,checkpoint:'same',seed:'seed-'+i,independentSeed:true,seedEvidenceRefs:['source:seed-design']});
  const result=summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:deriveRetrievalProfile(f.c,f.o,f.score)},
    {id:'r1',status:'evaluable',profile:deriveRetrievalProfile(g.c,g.o,g.score)}]);
  expect(result.groups[0].independentReplicates[0]).toMatchObject({seedCount:2,candidateMean:0.75,candidatePopulationStdDev:0.25});
  expect(result.statisticalSignificance).toBe('not-established');
});
it('missing supplied evidence is an invalid row, never silently removed',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a]=await profiles();
  const r=summarizeRetrievalSeries(manifest(),[{id:'r0',status:'evaluable',profile:a}]);
  expect(r.rows).toHaveLength(2);expect(r.rows[1]).toMatchObject({id:'r1',status:'invalid',reason:'missing-run-evidence'});
});

it('reports declared acceptance and stopping policy without claiming compliance',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  m.protocol.declaration={version:1,acceptanceCriteria:[{id:'accept-rate',description:'Candidate rate must meet the reviewed threshold.'}],
    stoppingRules:[{id:'budget-stop',description:'Stop when the reviewed tool-call budget is exhausted.'}],
    evidenceRefs:['source:reviewed-protocol']};
  m.runs[0].observedStop={ruleId:'budget-stop',evidenceRefs:['verification:r0-stop']};
  const r=summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]);
  expect(r.protocolPolicy).toMatchObject({status:'declared',version:1,compliance:'not-established'});
  expect(r.rows[0].observedStop).toEqual({status:'observed-not-verified',ruleId:'budget-stop',evidenceRefs:['verification:r0-stop']});
  expect(r.rows[1].observedStop).toEqual({status:'not-established'});
});
it('keeps legacy manifests explicit about unspecified policy',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles();
  const r=summarizeRetrievalSeries(manifest(),[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]);
  expect(r.protocolPolicy).toEqual({status:'not-specified',compliance:'not-established'});
  expect(r.rows.every((row:any)=>row.observedStop.status==='not-established')).toBe(true);
});

for(const mode of ['unknown-stop-rule','unsafe-policy-ref','oversized-description'])it(`refuses protocol policy ${mode}`,async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  m.protocol.declaration={version:1,acceptanceCriteria:[{id:'accept-rate',description:'Reviewed threshold.'}],
    stoppingRules:[{id:'budget-stop',description:'Reviewed stopping rule.'}],evidenceRefs:['source:reviewed-protocol']};
  if(mode==='unknown-stop-rule')m.runs[0].observedStop={ruleId:'missing-rule',evidenceRefs:['verification:r0-stop']};
  if(mode==='unsafe-policy-ref')m.protocol.declaration.evidenceRefs=['https://example.invalid/protocol'];
  if(mode==='oversized-description')m.protocol.declaration.acceptanceCriteria[0].description='x'.repeat(1001);
  expect(()=>summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}])).toThrow();
});

it('reports evaluator independence only from supplied evidence',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  m.protocol.evaluatorPolicy={version:1,evaluators:[
    {role:'update',id:'judge-a',revision:'rev-1'},
    {role:'final-report',id:'judge-b',revision:'rev-1'},
  ],reliabilityEvidence:[{kind:'repeated-judge-runs',evaluatorRole:'final-report',
    runIds:['judge-run-1','judge-run-2'],evidenceRefs:['verification:judge-repeat']}]};
  const result=summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]);
  expect(result.evaluatorPolicy).toMatchObject({status:'declared',independence:'mechanically-distinct'});
  expect(result.evaluatorPolicy.reliability).toMatchObject({status:'evidence-supplied-not-validated'});
});
it('keeps evaluator independence and reliability unknown when undeclared',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles();
  const result=summarizeRetrievalSeries(manifest(),[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]);
  expect(result.evaluatorPolicy).toEqual({status:'not-specified',independence:'not-established',reliability:{status:'not-established'}});
});
it('refuses a distinctness attestation that contradicts identical evaluator identity',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  m.protocol.evaluatorPolicy={version:1,evaluators:[
    {role:'update',id:'judge-a',revision:'rev-1'},
    {role:'final-report',id:'judge-a',revision:'rev-1'},
  ],independenceAttestation:{status:'operator-attested-distinct',evidenceRefs:['user-correction:judge-boundary']}};
  expect(()=>summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]))
    .toThrow(/EVALUATOR_INDEPENDENCE_CONFLICT/);
});
it('requires bounded safe evidence for reliability claims',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  m.protocol.evaluatorPolicy={version:1,evaluators:[{role:'final-report',id:'judge-b'}],
    reliabilityEvidence:[{kind:'human-reviewed-subset',evaluatorRole:'final-report',subsetIds:['q0'],evidenceRefs:['https://unsafe.invalid']}]};
  expect(()=>summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}])).toThrow();
});

it('keeps mechanism attribution evidence distinct without claiming causality',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  m.runs[0].mechanismAttribution={version:1,components:['memory-retrieval'],controls:[],failureSurfaces:[
    {id:'missed-specialist',description:'A previously solved specialist query regressed.',evidenceRefs:['verification:regression-a']}]};
  m.runs[1].mechanismAttribution={version:1,components:['ranking-policy'],controls:[
    {kind:'replay',comparedRunId:'r0',description:'Same comparable cohort with the alternate component.',evidenceRefs:['verification:replay-b']}]};
  const result=summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}]);
  expect(result.mechanismAttribution[0]).toMatchObject({status:'evidence-supplied-not-validated',causalAttribution:'not-established'});
  expect(result.mechanismAttribution[1]).toMatchObject({status:'structurally-comparable',causalAttribution:'not-established'});
  expect(result.mechanismAttribution[0].components).not.toEqual(result.mechanismAttribution[1].components);
});
it('refuses mechanism controls that reference missing, self, or incomparable runs',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a,b]=await profiles(),m:any=manifest();
  m.runs[0].mechanismAttribution={version:1,components:['retrieval'],controls:[
    {kind:'ablation',comparedRunId:'missing',description:'missing',evidenceRefs:['source:missing']}]};
  expect(()=>summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}])).toThrow(/UNKNOWN_MECHANISM_CONTROL_RUN/);
  m.runs[0].mechanismAttribution.controls[0].comparedRunId='r0';
  expect(()=>summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:b}])).toThrow(/SELF_MECHANISM_CONTROL_REFERENCE/);
});
it('refuses mechanism controls across incompatible profile groups',async()=>{
  const {summarizeRetrievalSeries}=await load('retrieval-series'),[a]=await profiles(),[,different]=await profiles({baselineRevision:'other-baseline'}),m:any=manifest();
  m.runs[0].mechanismAttribution={version:1,components:['retrieval'],controls:[
    {kind:'regression-control',comparedRunId:'r1',description:'Reviewed incompatible control.',evidenceRefs:['verification:control']}]};
  expect(()=>summarizeRetrievalSeries(m,[{id:'r0',status:'evaluable',profile:a},{id:'r1',status:'evaluable',profile:different}]))
    .toThrow(/MECHANISM_CONTROL_INCOMPARABLE/);
});