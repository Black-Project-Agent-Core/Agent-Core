import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { scoreControlledOutcome, type ControlledOutcomeScore } from './controlled-outcome.js';
export const RETRIEVAL_EVALUATOR_REVISION = 'agent-core-retrieval-hit-at-k/v1';
export const MAX_RETRIEVAL_ARTIFACT_BYTES = 8 * 1024 * 1024;
const id = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/);
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ids = (max:number) => z.array(id).max(max).refine(values=>new Set(values).size===values.length);
const cohortSchema = z.strictObject({
  schemaVersion:z.literal(1),domain:z.literal('memory-retrieval-hit-at-k'),revision:id,corpusRevision:id,
  topK:integer.min(1).max(100),minimumSamples:integer.min(1).max(10_000),
  queries:z.array(z.strictObject({id,expectedIds:ids(64).min(1)})).min(1).max(10_000),
});
const observationsSchema = z.strictObject({
  schemaVersion:z.literal(1),experimentId:id,cohortDigest:z.string().regex(/^sha256:[0-9a-f]{64}$/),corpusRevision:id,
  evaluatorRevision:z.literal(RETRIEVAL_EVALUATOR_REVISION),candidateRevision:id,baselineRevision:id,
  testsPassed:z.boolean(),attributionComplete:z.boolean(),eligibleIdentityVerified:z.boolean(),substantiveActions:integer,
  results:z.array(z.strictObject({queryId:id,baselineIds:ids(100),candidateIds:ids(100)})).min(1).max(10_000),
});
export interface RetrievalEvaluationReport extends ControlledOutcomeScore {
  schemaVersion:1; evaluatorRevision:string; inputsDigest:string; cohortDigest:string; observationsDigest:string;
  experimentId?:string; cohortRevision?:string; corpusRevision?:string; candidateRevision?:string; baselineRevision?:string; topK?:number;
}
const hash=(bytes:Uint8Array):string=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export function retrievalInputDigests(cohort:Uint8Array,observations:Uint8Array) {
  const cohortDigest=hash(cohort),observationsDigest=hash(observations);
  return {cohortDigest,observationsDigest,inputsDigest:hash(Buffer.from('agent-core-retrieval-input/v1\0'+cohortDigest+'\0'+observationsDigest))};
}
/** Consumes already-recorded retrieval results. It never queries or mutates live memory. */
export function evaluateRetrieval(cohortBytes:Uint8Array,observationBytes:Uint8Array):RetrievalEvaluationReport {
  const base={schemaVersion:1 as const,evaluatorRevision:RETRIEVAL_EVALUATOR_REVISION,...retrievalInputDigests(cohortBytes,observationBytes)};
  const reject=(reasonCode:string):RetrievalEvaluationReport=>({...base,correct:false,objective:null,reasonCode,metrics:{}});
  if(cohortBytes.byteLength>MAX_RETRIEVAL_ARTIFACT_BYTES||observationBytes.byteLength>MAX_RETRIEVAL_ARTIFACT_BYTES)return reject('artifact-too-large');
  let c: z.infer<typeof cohortSchema>, o:z.infer<typeof observationsSchema>;
  try { c=cohortSchema.parse(JSON.parse(Buffer.from(cohortBytes).toString('utf8')));
    o=observationsSchema.parse(JSON.parse(Buffer.from(observationBytes).toString('utf8')));
  } catch { return reject('invalid-artifact'); }
  if(o.cohortDigest!==base.cohortDigest)return reject('cohort-digest-mismatch');
  if(o.corpusRevision!==c.corpusRevision)return reject('corpus-revision-mismatch');
  const queryIds=new Set(c.queries.map(q=>q.id)),byId=new Map(o.results.map(row=>[row.queryId,row]));
  if(queryIds.size!==c.queries.length||byId.size!==o.results.length||o.results.length!==c.queries.length
    || o.results.some(row=>!queryIds.has(row.queryId)))return reject('cohort-membership-invalid');
  let candidateSuccesses=0,baselineSuccesses=0;
  for(const query of c.queries){
    const row=byId.get(query.id)!;const expected=new Set(query.expectedIds);
    if(row.candidateIds.slice(0,c.topK).some(value=>expected.has(value)))candidateSuccesses++;
    if(row.baselineIds.slice(0,c.topK).some(value=>expected.has(value)))baselineSuccesses++;
  }
  const score=scoreControlledOutcome({testsPassed:o.testsPassed,attributionComplete:o.attributionComplete,
    eligibleIdentityVerified:o.eligibleIdentityVerified,substantiveActions:o.substantiveActions,minimumSamples:c.minimumSamples,
    candidate:{successes:candidateSuccesses,opportunities:c.queries.length},baseline:{successes:baselineSuccesses,opportunities:c.queries.length}});
  return {...base,...score,experimentId:o.experimentId,cohortRevision:c.revision,corpusRevision:c.corpusRevision,
    candidateRevision:o.candidateRevision,baselineRevision:o.baselineRevision,topK:c.topK};
}
