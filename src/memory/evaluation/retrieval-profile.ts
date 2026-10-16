import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { verifyRetrieval } from './retrieval-verifier.js';
import type { RetrievalEvaluationReport } from './retrieval-evaluation.js';
export const PROFILE_REVISION='agent-core-retrieval-profile/v1';
export const transitions=['retained','regressed','improved','still-missed'] as const;
export const reportHash=(value:unknown):string=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/);
const sha=z.string().regex(/^sha256:[a-f0-9]{64}$/),count=z.number().int().min(0).max(10000);
const countsSchema=z.strictObject({retained:count,regressed:count,improved:count,'still-missed':count});
const profileSchema=z.strictObject({schemaVersion:z.literal(1),profileRevision:z.literal(PROFILE_REVISION),reportId:id,
  inputsDigest:sha,cohortDigest:sha,corpusRevision:id,cohortRevision:id,baselineRevision:id,candidateRevision:id,experimentId:id,
  evaluatorRevision:id,verifierRevision:id,baselineResultsDigest:sha,topK:z.number().int().min(1).max(100),caseCount:count.min(1),
  implementationHashes:z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),sha).refine(v=>Object.keys(v).length<=16),
  objective:z.number().min(-1).max(1),baselineRate:z.number().min(0).max(1),candidateRate:z.number().min(0).max(1),counts:countsSchema,
  regressionFraction:z.strictObject({numerator:count,denominator:count,value:z.number().min(0).max(1).nullable()}),
  cases:z.array(z.strictObject({queryId:id,baselineHit:z.boolean(),candidateHit:z.boolean(),transition:z.enum(transitions)})).min(1).max(10000)});
export type RetrievalProfile=z.infer<typeof profileSchema>;
export function validateRetrievalProfile(value:unknown):RetrievalProfile{
  const p=profileSchema.parse(value),counts={retained:0,regressed:0,improved:0,'still-missed':0};
  if(new Set(p.cases.map(c=>c.queryId)).size!==p.caseCount||p.cases.length!==p.caseCount)throw new Error('PROFILE_MEMBERSHIP_INVALID');
  for(const c of p.cases){const transition=c.baselineHit?(c.candidateHit?'retained':'regressed'):(c.candidateHit?'improved':'still-missed');
    if(c.transition!==transition)throw new Error('PROFILE_TRANSITION_INVALID');counts[transition]++;}
  const baseline=counts.retained+counts.regressed,candidate=counts.retained+counts.improved;
  if(transitions.some(t=>p.counts[t]!==counts[t])||Math.abs(p.baselineRate-baseline/p.caseCount)>1e-12
    ||Math.abs(p.candidateRate-candidate/p.caseCount)>1e-12||Math.abs(p.objective-(candidate-baseline)/p.caseCount)>1e-12
    ||p.regressionFraction.numerator!==counts.regressed||p.regressionFraction.denominator!==baseline
    ||p.regressionFraction.value!==(baseline?counts.regressed/baseline:null))throw new Error('PROFILE_COUNTS_INVALID');
  return p;
}
export function deriveRetrievalProfile(cohortBytes:Uint8Array,observationBytes:Uint8Array,reported:unknown,
  binding:{reportId?:string;implementationHashes?:Record<string,string>}={}):RetrievalProfile{
  const verification=verifyRetrieval(cohortBytes,observationBytes,reported);
  if(verification.verdict!=='pass')throw new Error('PROFILE_REQUIRES_PASSING_RECOMPUTATION');
  const score=reported as RetrievalEvaluationReport;
  // Shape/membership/hard-condition checks above use the existing independent verifier.
  const c=JSON.parse(Buffer.from(cohortBytes).toString('utf8')) as {queries:{id:string;expectedIds:string[]}[];topK:number};
  const o=JSON.parse(Buffer.from(observationBytes).toString('utf8')) as {results:{queryId:string;baselineIds:string[];candidateIds:string[]}[]};
  const rows=new Map(o.results.map(r=>[r.queryId,r]));
  const counts={retained:0,regressed:0,improved:0,'still-missed':0};
  const cases=c.queries.map(q=>{const row=rows.get(q.id)!,expected=new Set(q.expectedIds);
    const baselineHit=row.baselineIds.slice(0,c.topK).some(id=>expected.has(id));
    const candidateHit=row.candidateIds.slice(0,c.topK).some(id=>expected.has(id));
    const transition=baselineHit?(candidateHit?'retained':'regressed'):(candidateHit?'improved':'still-missed');
    counts[transition]++;return {queryId:q.id,baselineHit,candidateHit,transition};
  }).sort((a,b)=>a.queryId<b.queryId?-1:a.queryId>b.queryId?1:0);
  const baseline=counts.retained+counts.regressed;
  const baselineResultsDigest=reportHash(cases.map(q=>({queryId:q.queryId,baselineIds:rows.get(q.queryId)!.baselineIds})));
  return validateRetrievalProfile({schemaVersion:1,profileRevision:PROFILE_REVISION,
    reportId:binding.reportId??'inputs-'+score.inputsDigest.slice(7),implementationHashes:binding.implementationHashes??{},
    inputsDigest:score.inputsDigest,cohortDigest:score.cohortDigest,corpusRevision:score.corpusRevision,cohortRevision:score.cohortRevision,
    baselineRevision:score.baselineRevision,candidateRevision:score.candidateRevision,experimentId:score.experimentId,
    evaluatorRevision:score.evaluatorRevision,verifierRevision:verification.verifierRevision,baselineResultsDigest,topK:c.topK,caseCount:cases.length,
    objective:score.objective,baselineRate:baseline/cases.length,candidateRate:(counts.retained+counts.improved)/cases.length,
    counts,regressionFraction:{numerator:counts.regressed,denominator:baseline,value:baseline?counts.regressed/baseline:null},cases});
}
export function boundedQueryIds(ids:string[],limit=100){
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000||ids.length>10000)throw new Error('INVALID_PROFILE_LIST_LIMIT');
  const sorted=[...ids].sort();return {count:sorted.length,queryIds:sorted.slice(0,limit),omitted:Math.max(0,sorted.length-limit),digest:reportHash(sorted)};
}
export function profileComparisonKey(value:RetrievalProfile):string{
  const p=validateRetrievalProfile(value);
  return reportHash({domain:'agent-core-retrieval-comparability/v1',cohortDigest:p.cohortDigest,corpusRevision:p.corpusRevision,
    topK:p.topK,baselineRevision:p.baselineRevision,baselineResultsDigest:p.baselineResultsDigest,evaluatorRevision:p.evaluatorRevision,
    verifierRevision:p.verifierRevision,implementationHashes:Object.fromEntries(Object.entries(p.implementationHashes).sort(([a],[b])=>a<b?-1:a>b?1:0))});
}
export function summarizeRetrievalProfile(value:RetrievalProfile,limit=100){
  const p=validateRetrievalProfile(value),{cases,...metadata}=p;
  return {...metadata,transitions:Object.fromEntries(transitions.map(t=>[t,boundedQueryIds(cases.filter(c=>c.transition===t).map(c=>c.queryId),limit)])),
    evidenceValidation:'recomputed-supplied-observations',statisticalSignificance:'not-established',causalAttribution:'not-established'};
}
