import * as z from 'zod/v4';
import { profileComparisonKey, summarizeRetrievalProfile, validateRetrievalProfile, type RetrievalProfile } from './retrieval-profile.js';
const id=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/);
const ref=z.string().min(2).max(1000).regex(/^(file|source|verification|tool|activity|memory|grafel|user-correction):\S/);
const refs=z.array(ref).max(16),ids=z.array(id).max(10000).refine(a=>new Set(a).size===a.length);
const description=z.string().trim().min(1).max(1000);
const policyItem=z.strictObject({id,description});
const uniquePolicyItems=(items:z.infer<typeof policyItem>[])=>new Set(items.map(item=>item.id)).size===items.length;
const protocolDeclaration=z.strictObject({version:z.literal(1),
  acceptanceCriteria:z.array(policyItem).min(1).max(16).refine(uniquePolicyItems),
  stoppingRules:z.array(policyItem).min(1).max(16).refine(uniquePolicyItems),evidenceRefs:refs.min(1)});
const observedStop=z.strictObject({ruleId:id,evidenceRefs:refs.min(1)});
const evaluatorRole=z.enum(['update','final-report']);
const evaluatorIdentity=z.strictObject({role:evaluatorRole,id,revision:id.optional()});
const reliabilityEvidence=z.strictObject({
  kind:z.enum(['repeated-judge-runs','verifiable-subset','human-reviewed-subset']),
  evaluatorRole,
  runIds:z.array(id).min(2).max(32).optional(),
  subsetIds:z.array(id).min(1).max(100).optional(),
  evidenceRefs:refs.min(1),
}).refine(value=>value.kind==='repeated-judge-runs'?Boolean(value.runIds?.length):Boolean(value.subsetIds?.length));
const evaluatorPolicyDeclaration=z.strictObject({
  version:z.literal(1),
  evaluators:z.array(evaluatorIdentity).min(1).max(2)
    .refine(items=>new Set(items.map(item=>item.role)).size===items.length),
  independenceAttestation:z.strictObject({
    status:z.literal('operator-attested-distinct'),
    evidenceRefs:refs.min(1),
  }).optional(),
  reliabilityEvidence:z.array(reliabilityEvidence).max(16).optional(),
});
const mechanismControl=z.strictObject({
  kind:z.enum(['ablation','replay','regression-control']),
  comparedRunId:id,
  evidenceRefs:refs.min(1),
  description,
});
const failureSurface=z.strictObject({id,description,evidenceRefs:refs.min(1)});
const mechanismAttribution=z.strictObject({
  version:z.literal(1),
  components:z.array(id).min(1).max(16).refine(items=>new Set(items).size===items.length),
  controls:z.array(mechanismControl).max(32)
    .refine(items=>new Set(items.map(item=>item.kind+'\0'+item.comparedRunId)).size===items.length).optional(),
  failureSurfaces:z.array(failureSurface).max(16)
    .refine(items=>new Set(items.map(item=>item.id)).size===items.length).optional(),
});
export const resourceDimensions=['task.wallMs','task.toolCalls','task.inputTokens','task.outputTokens','evaluator.wallMs',
  'evaluator.toolCalls','evaluator.inputTokens','evaluator.outputTokens','human.interventions','disk.bytes','writes.bytes'] as const;
export const diversityFeatureIds=['candidateRate','objective','regressionFraction','failureSurfaceCount',
  ...resourceDimensions.map(item=>'resource.'+item)] as string[];
const diversityFeature=z.string().refine(value=>diversityFeatureIds.includes(value),'unsupported diversity feature');
const diversityDimension=z.strictObject({id:diversityFeature,min:z.number().finite(),max:z.number().finite(),bins:z.number().int().min(1).max(100)})
  .refine(value=>value.max>value.min,'diversity max must be greater than min');
const diversityAnalysis=z.strictObject({fitness:z.enum(['candidateRate','objective']),
  dimensions:z.array(diversityDimension).min(1).max(8).refine(items=>new Set(items.map(item=>item.id)).size===items.length)});
const stabilityAnalysis=z.strictObject({absoluteTolerance:z.number().positive().max(1),zMultiplier:z.number().min(0).max(5),
  consecutiveWindows:z.number().int().min(1).max(20)});
export const paretoMetricIds = ['candidateRate', 'objective', 'regressionFraction', ...resourceDimensions.map(d => 'resource.' + d)];
export const paretoAnalysisSchema = z.strictObject({
  resourceBasis: z.enum(['per-run', 'cumulative']),
  objectives: z.array(z.strictObject({
    id: z.string().refine(value => paretoMetricIds.includes(value), 'unsupported Pareto metric'),
    direction: z.enum(['maximize', 'minimize']),
  })).min(2).max(8).refine(items => new Set(items.map(item => item.id)).size === items.length, 'duplicate Pareto objective'),
});
export const curveAnalysisSchema = z.strictObject({
  metric: z.enum(['candidateRate', 'objective', 'regressionFraction']),
  direction: z.enum(['maximize', 'minimize']),
  streams: z.array(z.strictObject({ id, runIds: z.array(id).min(1).max(100), evidenceRefs: refs.min(1) }))
    .min(1).max(16).refine(items => new Set(items.map(item => item.id)).size === items.length, 'duplicate curve stream')
    .refine(items => { const runs = items.flatMap(item => item.runIds); return runs.length <= 100 && new Set(runs).size === runs.length; }, 'duplicate curve run'),
});
const noveltyAnalysis = z.strictObject({ neighbors: z.number().int().min(1).max(10) });
const resourceContext = z.strictObject({ id, evidenceRefs: refs.min(1) });
const dimension=z.enum(resourceDimensions),amount=z.number().min(0).max(Number.MAX_SAFE_INTEGER);
const measurement=z.strictObject({dimension,value:amount,evidenceRefs:refs.min(1)})
  .refine(m=>m.dimension.endsWith('wallMs')||Number.isSafeInteger(m.value));
const measurements=z.array(measurement).max(resourceDimensions.length).refine(a=>new Set(a.map(x=>x.dimension)).size===a.length);
export const runStatuses=['attempted','invalid','failed','incomplete','evaluable'] as const;
const runSchema=z.strictObject({id,iteration:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),checkpoint:id,status:z.enum(runStatuses),
  split:z.enum(['validation','holdout']).optional(),report:z.string().min(1).max(2000).optional(),seed:id.optional(),
  independentSeed:z.boolean().optional(),seedEvidenceRefs:refs.optional(),resources:measurements.optional(),cumulativeResources:measurements.optional(),
  humanModalities:z.array(z.enum(['labeling','approval','correction','intervention','other'])).max(5).optional(),observedStop:observedStop.optional(),
  resourceContext:resourceContext.optional(), mechanismAttribution:mechanismAttribution.optional()})
  .refine(r=>!r.independentSeed||(Boolean(r.seed)&&Boolean(r.seedEvidenceRefs?.length)));
export const retrievalSeriesManifestSchema=z.strictObject({schemaVersion:z.literal(1),protocol:z.strictObject({id,
  splits:z.strictObject({train:ids,validation:ids,holdout:ids}),trainingExposure:z.strictObject({
    status:z.enum(['not-established','operator-attested-disjoint']),evidenceRefs:refs})
    .refine(v=>v.status==='not-established'||v.evidenceRefs.length>0),declaration:protocolDeclaration.optional(),
    evaluatorPolicy:evaluatorPolicyDeclaration.optional()}),runs:z.array(runSchema).min(1).max(100),
  budgets:z.strictObject({basis:z.enum(['per-run','cumulative']),limits:z.partialRecord(dimension,amount)}).optional(),
  analysis:z.strictObject({diversity:diversityAnalysis.optional(),stability:stabilityAnalysis.optional(),pareto:paretoAnalysisSchema.optional(),curve:curveAnalysisSchema.optional(),novelty:noveltyAnalysis.optional()}).optional()});
export type RetrievalSeriesManifest=z.infer<typeof retrievalSeriesManifestSchema>;
export type RunEvidence={id:string;status:typeof runStatuses[number];profile?:RetrievalProfile;reason?:string;manifestDigest?:string};
export function parseRetrievalSeriesManifest(value:unknown):RetrievalSeriesManifest{
  const m=retrievalSeriesManifestSchema.parse(value),splitIds=Object.values(m.protocol.splits).flat();
  if(new Set(splitIds).size!==splitIds.length)throw new Error('OVERLAPPING_PROTOCOL_SPLITS');
  if(new Set(m.runs.map(r=>r.id)).size!==m.runs.length)throw new Error('DUPLICATE_RUN_ID');
  const runIds=new Set(m.runs.map(r=>r.id));
  const stoppingRules=new Set(m.protocol.declaration?.stoppingRules.map(rule=>rule.id)??[]);
  const evaluatorPolicy=m.protocol.evaluatorPolicy;
  if(evaluatorPolicy?.independenceAttestation){
    const update=evaluatorPolicy.evaluators.find(item=>item.role==='update');
    const finalReport=evaluatorPolicy.evaluators.find(item=>item.role==='final-report');
    const sameIdentity=Boolean(update&&finalReport&&update.id===finalReport.id
      && (update.revision??null)===(finalReport.revision??null));
    if(sameIdentity)throw new Error('EVALUATOR_INDEPENDENCE_CONFLICT');
  }
  for(const run of m.runs){
    if(run.observedStop&&!m.protocol.declaration)throw new Error('STOP_OBSERVATION_WITHOUT_PROTOCOL_DECLARATION');
    if(run.observedStop&&!stoppingRules.has(run.observedStop.ruleId))throw new Error('UNKNOWN_STOP_RULE');
    for(const control of run.mechanismAttribution?.controls??[]){
      if(!runIds.has(control.comparedRunId))throw new Error('UNKNOWN_MECHANISM_CONTROL_RUN');
      if(control.comparedRunId===run.id)throw new Error('SELF_MECHANISM_CONTROL_REFERENCE');
    }
  }
  return m;
}
type ResourceValue={value:number;evidenceRefs:string[]}|null;
type SeriesRow={id:string;iteration:number;checkpoint:string;declaredStatus:string;status:typeof runStatuses[number];reason?:string;
  seed:string|null;split:string|null;independentSeed:boolean;seedEvidenceRefs:string[];manifestDigest:string|null;
  profile:ReturnType<typeof summarizeRetrievalProfile>|null;resources:Record<string,ResourceValue>;cumulativeResources:Record<string,ResourceValue>;
  humanModalities:string[]|null;observedStop:{status:'not-established'}|{status:'observed-not-verified';ruleId:string;evidenceRefs:string[]};
  outOfBudget:Array<{dimension:string;observed:number;limit:number}>};
const resourceMap=(values:z.infer<typeof measurements>=[]):Record<string,ResourceValue>=>Object.fromEntries(resourceDimensions.map(d=>{
  const item=values.find(v=>v.dimension===d);return [d,item?{value:item.value,evidenceRefs:item.evidenceRefs}:null];}));
export function summarizeRetrievalSeries(value:unknown,evidence:RunEvidence[]){
  const m=parseRetrievalSeriesManifest(value);
  if(!Array.isArray(evidence)||evidence.length>100)throw new Error('RUN_EVIDENCE_LIMIT');
  const byId=new Map<string,RunEvidence>();
  for(const e of evidence){id.parse(e.id);z.enum(runStatuses).parse(e.status);
    if(byId.has(e.id)||!m.runs.some(r=>r.id===e.id))throw new Error('UNEXPECTED_RUN_EVIDENCE');
    if(e.reason!==undefined&&!/^[A-Za-z0-9_-]{1,200}$/.test(e.reason))throw new Error('INVALID_RUN_REASON');
    if(e.manifestDigest!==undefined&&!/^sha256:[a-f0-9]{64}$/.test(e.manifestDigest))throw new Error('INVALID_MANIFEST_DIGEST');byId.set(e.id,e);}
  const groups=new Map<string,SeriesRow[]>(),reportIds=new Set<string>(),cumulative=new Map<string,number>(),iterations=new Map<string,number>();
  const rows:SeriesRow[]=[];
  for(const run of m.runs){
    const stream=run.seed??'__unseeded__',priorIteration=iterations.get(stream);
    if(priorIteration!==undefined&&run.iteration<priorIteration)throw new Error('NONMONOTONE_ITERATION');iterations.set(stream,run.iteration);
    for(const item of run.cumulativeResources??[]){const key=stream+'\0'+item.dimension,prior=cumulative.get(key);
      if(prior!==undefined&&item.value<prior)throw new Error('NONMONOTONE_CUMULATIVE_RESOURCE');cumulative.set(key,item.value);}
    const observed=byId.get(run.id),resources=resourceMap(run.resources),cumulativeResources=resourceMap(run.cumulativeResources);
    const row:SeriesRow={id:run.id,iteration:run.iteration,checkpoint:run.checkpoint,declaredStatus:run.status,
      status:observed?.status??'invalid',reason:observed?.reason??(observed?undefined:'missing-run-evidence'),seed:run.seed??null,split:run.split??null,
      independentSeed:run.independentSeed===true,seedEvidenceRefs:run.seedEvidenceRefs??[],manifestDigest:observed?.manifestDigest??null,
      profile:null,resources,cumulativeResources,humanModalities:run.humanModalities??null,
      observedStop:run.observedStop?{status:'observed-not-verified',ruleId:run.observedStop.ruleId,evidenceRefs:run.observedStop.evidenceRefs}:{status:'not-established'},outOfBudget:[]};
    if(row.status==='evaluable'){
      if(!observed?.profile||!run.report){row.status='invalid';row.reason='missing-evaluable-artifact';}
      else{
        const p=validateRetrievalProfile(observed.profile);
        if(reportIds.has(p.reportId))throw new Error('DUPLICATE_REPORT_ID');reportIds.add(p.reportId);
        if(!run.split)throw new Error('MISSING_EVALUATION_SPLIT');
        const declared=new Set(m.protocol.splits[run.split]);
        if(declared.size!==p.caseCount||p.cases.some(c=>!declared.has(c.queryId)))throw new Error('SPLIT_COHORT_MISMATCH');
        row.profile=summarizeRetrievalProfile(p);const key=profileComparisonKey(p)+'/'+run.split;
        const group=groups.get(key)??[];group.push(row);groups.set(key,group);
      }
    }
    if(m.budgets){const measured=m.budgets.basis==='per-run'?resources:cumulativeResources;
      for(const [d,limit] of Object.entries(m.budgets.limits)){
        const amount=measured[d];if(amount&&amount.value>limit!)row.outOfBudget.push({dimension:d,observed:amount.value,limit:limit!});
      }}
    rows.push(row);
  }
  const mechanismAttribution=m.runs.map(run=>{
    const declaration=run.mechanismAttribution;
    if(!declaration)return {runId:run.id,status:'not-specified' as const,causalAttribution:'not-established' as const};
    const controls=(declaration.controls??[]).map(control=>{
      const comparedRun=m.runs.find(candidate=>candidate.id===control.comparedRunId)!;
      const ownProfile=byId.get(run.id)?.profile,comparedProfile=byId.get(control.comparedRunId)?.profile;
      let comparability:'not-established'|'structurally-comparable'='not-established';
      if(ownProfile&&comparedProfile){
        const compatible=run.split===comparedRun.split&&profileComparisonKey(validateRetrievalProfile(ownProfile))===profileComparisonKey(validateRetrievalProfile(comparedProfile));
        if(!compatible)throw new Error('MECHANISM_CONTROL_INCOMPARABLE');
        comparability='structurally-comparable';
      }
      return {...control,comparability};
    });
    return {runId:run.id,version:declaration.version,components:declaration.components,controls,
      failureSurfaces:declaration.failureSurfaces??[],status:controls.length&&controls.every(control=>control.comparability==='structurally-comparable')
        ?'structurally-comparable' as const:'evidence-supplied-not-validated' as const,causalAttribution:'not-established' as const};
  });
  const comparableGroups=[...groups].map(([key,group])=>{
    const checkpoints=new Map<string,SeriesRow[]>();
    for(const row of group)if(row.independentSeed&&row.seed&&row.profile){
      const key=JSON.stringify([row.iteration,row.checkpoint,row.profile.candidateRevision]);
      const values=checkpoints.get(key)??[];values.push(row);checkpoints.set(key,values);
    }
    const independentReplicates=[...checkpoints.values()].filter(values=>values.length>1&&new Set(values.map(v=>v.seed)).size===values.length).map(values=>{
      const rates=values.map(v=>v.profile!.candidateRate),mean=rates.reduce((a,b)=>a+b,0)/rates.length;
      return {iteration:values[0].iteration,checkpoint:values[0].checkpoint,candidateRevision:values[0].profile!.candidateRevision,
        seedCount:rates.length,seeds:values.map(v=>v.seed),candidateMean:mean,candidatePopulationStdDev:Math.sqrt(rates.reduce((a,b)=>a+(b-mean)**2,0)/rates.length),
        basis:'operator-attested-independent-seeds',evidenceRefs:[...new Set(values.flatMap(v=>v.seedEvidenceRefs))]};
    });return {key,runIds:group.map(r=>r.id),seedCount:new Set(group.map(r=>r.seed).filter(Boolean)).size,independentReplicates};
  });
  const protocolPolicy=m.protocol.declaration
    ?{status:'declared' as const,version:m.protocol.declaration.version,acceptanceCriteria:m.protocol.declaration.acceptanceCriteria,
      stoppingRules:m.protocol.declaration.stoppingRules,evidenceRefs:m.protocol.declaration.evidenceRefs,compliance:'not-established' as const}
    :{status:'not-specified' as const,compliance:'not-established' as const};
  const declaredEvaluators=m.protocol.evaluatorPolicy?.evaluators??[];
  const updateEvaluator=declaredEvaluators.find(item=>item.role==='update');
  const finalEvaluator=declaredEvaluators.find(item=>item.role==='final-report');
  const mechanicallyDistinct=Boolean(updateEvaluator&&finalEvaluator&&(
    updateEvaluator.id!==finalEvaluator.id
    || (updateEvaluator.revision!==undefined&&finalEvaluator.revision!==undefined&&updateEvaluator.revision!==finalEvaluator.revision)
  ));
  const evaluatorPolicy=m.protocol.evaluatorPolicy
    ?{status:'declared' as const,version:m.protocol.evaluatorPolicy.version,evaluators:declaredEvaluators,
      independence:mechanicallyDistinct?'mechanically-distinct' as const:
        m.protocol.evaluatorPolicy.independenceAttestation?'operator-attested-distinct' as const:'not-established' as const,
      independenceEvidenceRefs:m.protocol.evaluatorPolicy.independenceAttestation?.evidenceRefs??[],
      reliability:m.protocol.evaluatorPolicy.reliabilityEvidence?.length
        ?{status:'evidence-supplied-not-validated' as const,items:m.protocol.evaluatorPolicy.reliabilityEvidence}
        :{status:'not-established' as const}}
    :{status:'not-specified' as const,independence:'not-established' as const,reliability:{status:'not-established' as const}};
  return {schemaVersion:1,kind:'explicit-retrieval-series',protocol:m.protocol,protocolPolicy,evaluatorPolicy,
    mechanismAttribution,
    trainingExposure:m.protocol.trainingExposure,
    mode:reportIds.size>1?'trajectory':reportIds.size===1?'single-checkpoint':'no-evaluable-checkpoint',rows,groups:comparableGroups,
    comparable:comparableGroups.length<=1,statusCounts:Object.fromEntries(runStatuses.map(status=>[status,rows.filter(r=>r.status===status).length])),
    budgets:m.budgets??null,attemptHistory:'operator-supplied-not-proven-exhaustive',statisticalSignificance:'not-established',
    heldOutClaim:m.protocol.trainingExposure.status==='not-established'?'not-established':'operator-attested-disjoint-not-authenticated',
    resourceAccounting:'explicit-measurements-only',launchesExperiments:false};
}
