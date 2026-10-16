import { createHash } from 'node:crypto';
// Deliberately independent of the scorer and its Zod schemas: recheck hard conditions and arithmetic.
const EVALUATOR='agent-core-retrieval-hit-at-k/v1';
export const RETRIEVAL_VERIFIER_REVISION='agent-core-retrieval-independent/v1';
type ObjectValue=Record<string,unknown>;
function requireCondition(ok:unknown,code:string):asserts ok { if(!ok)throw new Error(code); }
function exact(value:unknown,keys:string[]):asserts value is ObjectValue {
  requireCondition(value!==null&&typeof value==='object'&&!Array.isArray(value),'invalid-object');
  const present=Object.keys(value);
  requireCondition(present.length===keys.length&&keys.every(key=>Object.hasOwn(value,key)),'invalid-fields');
}
function identifier(value:unknown):asserts value is string {
  requireCondition(typeof value==='string'&&value.length<=200&&/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/.test(value),'invalid-identity');
}
function integer(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number {
  requireCondition(typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max,'invalid-count');return value;
}
function identifiers(value:unknown,max:number,min=0):string[] {
  requireCondition(Array.isArray(value)&&value.length>=min&&value.length<=max,'invalid-id-list');
  value.forEach(identifier);requireCondition(new Set(value).size===value.length,'duplicate-id');return value;
}
const hash=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export interface RetrievalVerification {
  method:'recomputed';verdict:'pass'|'fail';verifierRevision:string;evaluatorRevision:string;inputsDigest:string;
  cohortDigest:string;observationsDigest:string;hardConditionsPassed:boolean;objective:number|null;reasons:string[];
}
export function verifyRetrieval(cohortBytes:Uint8Array,observationBytes:Uint8Array,reported:unknown):RetrievalVerification {
  const cohortDigest=hash(cohortBytes),observationsDigest=hash(observationBytes);
  const inputsDigest=hash(Buffer.from('agent-core-retrieval-input/v1\0'+cohortDigest+'\0'+observationsDigest));
  const reasons:string[]=[];let hardConditionsPassed=false;let objective:number|null=null;
  try {
    requireCondition(cohortBytes.byteLength<=8*1024*1024&&observationBytes.byteLength<=8*1024*1024,'artifact-too-large');
    const c:unknown=JSON.parse(Buffer.from(cohortBytes).toString('utf8'));
    const o:unknown=JSON.parse(Buffer.from(observationBytes).toString('utf8'));
    exact(c,['schemaVersion','domain','revision','corpusRevision','topK','minimumSamples','queries']);
    exact(o,['schemaVersion','experimentId','cohortDigest','corpusRevision','evaluatorRevision','candidateRevision','baselineRevision','testsPassed','attributionComplete','eligibleIdentityVerified','substantiveActions','results']);
    requireCondition(c.schemaVersion===1&&o.schemaVersion===1&&c.domain==='memory-retrieval-hit-at-k','unsupported-contract');
    for(const value of [c.revision,c.corpusRevision,o.experimentId,o.corpusRevision,o.candidateRevision,o.baselineRevision])identifier(value);
    requireCondition(o.evaluatorRevision===EVALUATOR,'evaluator-revision-mismatch');
    requireCondition(o.cohortDigest===cohortDigest&&o.corpusRevision===c.corpusRevision,'cohort-or-corpus-mismatch');
    const topK=integer(c.topK,1,100),minimum=integer(c.minimumSamples,1,10_000);
    requireCondition(o.testsPassed===true,'hard-tests-failed');
    requireCondition(o.attributionComplete===true,'attribution-incomplete');
    requireCondition(o.eligibleIdentityVerified===true,'identity-unverified');
    const actions=integer(o.substantiveActions,1);
    requireCondition(Array.isArray(c.queries)&&c.queries.length>=minimum&&c.queries.length<=10_000,'insufficient-cohort');
    requireCondition(Array.isArray(o.results)&&o.results.length===c.queries.length,'cohort-membership-invalid');
    const expected=new Map<string,Set<string>>();
    for(const query of c.queries){exact(query,['id','expectedIds']);identifier(query.id);
      requireCondition(!expected.has(query.id),'duplicate-query');expected.set(query.id,new Set(identifiers(query.expectedIds,64,1)));}
    const seen=new Set<string>();let candidateHits=0,baselineHits=0;
    for(const row of o.results){
      exact(row,['queryId','baselineIds','candidateIds']);identifier(row.queryId);
      requireCondition(expected.has(row.queryId)&&!seen.has(row.queryId),'cohort-membership-invalid');seen.add(row.queryId);
      const baseline=identifiers(row.baselineIds,100),candidate=identifiers(row.candidateIds,100),wanted=expected.get(row.queryId)!;
      let b=false,t=false;for(let i=0;i<topK;i++){if(i<baseline.length&&wanted.has(baseline[i]))b=true;if(i<candidate.length&&wanted.has(candidate[i]))t=true;}
      if(b)baselineHits++;if(t)candidateHits++;
    }
    requireCondition(seen.size===expected.size,'cohort-membership-invalid');
    hardConditionsPassed=true;
    const n=c.queries.length;
    objective=(candidateHits-baselineHits)/n;
    exact(reported,['schemaVersion','evaluatorRevision','inputsDigest','cohortDigest','observationsDigest','experimentId','cohortRevision','corpusRevision','candidateRevision','baselineRevision','topK','correct','objective','reasonCode','metrics']);
    requireCondition(reported.schemaVersion===1&&reported.correct===true&&reported.reasonCode==='evaluated','reported-correctness-invalid');
    requireCondition(reported.evaluatorRevision===EVALUATOR&&reported.inputsDigest===inputsDigest&&reported.cohortDigest===cohortDigest&&reported.observationsDigest===observationsDigest,'reported-digest-or-evaluator-mismatch');
    for(const [key,wanted] of Object.entries({experimentId:o.experimentId,cohortRevision:c.revision,corpusRevision:c.corpusRevision,candidateRevision:o.candidateRevision,baselineRevision:o.baselineRevision,topK}))
      requireCondition(reported[key]===wanted,'reported-identity-mismatch');
    requireCondition(typeof reported.objective==='number'&&Number.isFinite(reported.objective)&&Math.abs(reported.objective-objective)<=1e-12,'objective-does-not-reproduce');
    const metrics={candidateSuccesses:candidateHits,baselineSuccesses:baselineHits,candidateSamples:n,baselineSamples:n,
      candidateRate:candidateHits/n,baselineRate:baselineHits/n,minimumSamples:minimum,substantiveActions:actions};
    exact(reported.metrics,Object.keys(metrics));
    for(const [key,wanted] of Object.entries(metrics)){
      const actual=reported.metrics[key];
      requireCondition(typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-wanted)<=1e-12,'metrics-do-not-reproduce');
    }
  } catch(error) {
    reasons.push(error instanceof SyntaxError?'invalid-json':error instanceof Error&&/^[a-z-]+$/.test(error.message)?error.message:'verification-error');
  }
  return {method:'recomputed',verdict:reasons.length?'fail':'pass',verifierRevision:RETRIEVAL_VERIFIER_REVISION,
    evaluatorRevision:EVALUATOR,inputsDigest,cohortDigest,observationsDigest,hardConditionsPassed,objective,reasons};
}
