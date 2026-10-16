import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import * as z from 'zod/v4';
import {proposeFixtureRelations,type RelatedEdgeProposal,type ReconsolidationFixture} from './reconsolidation-experiment.js';
import {evaluateRetrieval,type RetrievalEvaluationReport,RETRIEVAL_EVALUATOR_REVISION} from './evaluation/retrieval-evaluation.js';
import {verifyRetrieval} from './evaluation/retrieval-verifier.js';
const id=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/);
const suiteSchema=z.strictObject({schemaVersion:z.literal(1),revision:id,corpusRevision:id,cases:z.array(z.strictObject({
 id,input:z.unknown(),queries:z.array(z.strictObject({id,seedId:id})).min(1).max(32),
 oracle:z.strictObject({rejectInput:z.boolean(),allowedEdges:z.array(z.tuple([id,id])).max(8),expected:z.array(z.strictObject({queryId:id,expectedIds:z.array(id).min(1).max(32)})).min(1).max(32)}),
})).min(1).max(32)});
type Suite=z.infer<typeof suiteSchema>;
const json=(value:unknown)=>Buffer.from(JSON.stringify(value));
const hash=(value:Uint8Array)=>'sha256:'+createHash('sha256').update(value).digest('hex');
const digest=(value:unknown)=>hash(json(value));
function parseSuite(bytes:Uint8Array):Suite {
 if(bytes.byteLength>8*1024*1024)throw Error('RECONSOLIDATION_SUITE_TOO_LARGE');
 const suite=suiteSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))),caseIds=new Set<string>(),queryIds=new Set<string>();
 for(const c of suite.cases){
  if(caseIds.has(c.id))throw Error('RECONSOLIDATION_DUPLICATE_CASE');caseIds.add(c.id);
  const input=c.input as ReconsolidationFixture;
  if(!input||input.corpusRevision!==suite.corpusRevision||!Array.isArray(input.nodes)||c.queries.some(q=>!input.nodes.some(node=>node.id===q.seedId)))throw Error('RECONSOLIDATION_CORPUS_IDENTITY_INVALID');
  const expected=new Map(c.oracle.expected.map(q=>[q.queryId,q.expectedIds]));
  if(expected.size!==c.oracle.expected.length||expected.size!==c.queries.length)throw Error('RECONSOLIDATION_ORACLE_INCOMPLETE');
  for(const q of c.queries){if(queryIds.has(q.id)||!expected.has(q.id))throw Error('RECONSOLIDATION_ORACLE_INCOMPLETE');queryIds.add(q.id);}
 }
 return suite;
}
export interface ReconsolidationReport {
 mode:'scripted-offline';benefitProven:false;suiteDigest:string;proposalDigest:string;
 baselineRevision:string;candidateRevision:string;preservationPassed:boolean;unsupportedEdges:number;
 caseResults:Array<{id:string;rejected:boolean;guardPassed:boolean;reason?:string}>;
 retrievalResults:RetrievalEvaluationReport;decision:'reject'|'further-study';
}
export interface ReconsolidationBundle {
 report:ReconsolidationReport;proposals:Array<{caseId:string;edges:RelatedEdgeProposal[];error?:string}>;
 cohort:Record<string,unknown>;observations:Record<string,unknown>;
}
function cohortFor(suite:Suite){return {schemaVersion:1,domain:'memory-retrieval-hit-at-k',revision:suite.revision,corpusRevision:suite.corpusRevision,topK:2,minimumSamples:suite.cases.reduce((n,c)=>n+c.queries.length,0),queries:suite.cases.flatMap(c=>c.oracle.expected.map(q=>({id:q.queryId,expectedIds:q.expectedIds})))};}
/** Oracle is consumed only after candidate proposals and retrieval lists are fixed. */
export function runReconsolidationExperiment(suiteBytes:Uint8Array):ReconsolidationBundle {
 const suite=parseSuite(suiteBytes),original=digest(suite.cases.map(c=>c.input));
 const proposals=suite.cases.map(c=>{
  try{return {caseId:c.id,edges:[...proposeFixtureRelations(structuredClone(c.input) as ReconsolidationFixture)]}}catch(error){return {caseId:c.id,edges:[],error:error instanceof Error&&/^RECONSOLIDATION_[A-Z_]+$/.test(error.message)?error.message:'RECONSOLIDATION_INPUT_INVALID'}}
 });
 const baselineRevision='baseline:'+original.slice(7),candidateRevision='candidate:'+digest(proposals).slice(7);
 const rows=suite.cases.flatMap((c,i)=>c.queries.map(q=>({queryId:q.id,baselineIds:[q.seedId],candidateIds:[...new Set([q.seedId,...proposals[i].edges.filter(e=>e.sourceId===q.seedId).map(e=>e.targetId)])]})));
 const cohort=cohortFor(suite),cohortBytes=json(cohort);
 const caseResults=suite.cases.map((c,i)=>({id:c.id,rejected:!!proposals[i].error,guardPassed:!!proposals[i].error===c.oracle.rejectInput,...(proposals[i].error?{reason:proposals[i].error}:{})}));
 const unsupportedEdges=proposals.reduce((n,p,i)=>n+p.edges.filter(e=>!suite.cases[i].oracle.allowedEdges.some(([a,b])=>a===e.sourceId&&b===e.targetId)).length,0);
 const preservationPassed=original===digest(suite.cases.map(c=>c.input))&&caseResults.every(c=>c.guardPassed);
 const observations={schemaVersion:1,experimentId:'reconsolidation-offline-v1',cohortDigest:hash(cohortBytes),corpusRevision:suite.corpusRevision,evaluatorRevision:RETRIEVAL_EVALUATOR_REVISION,candidateRevision,baselineRevision,testsPassed:preservationPassed,attributionComplete:true,eligibleIdentityVerified:true,substantiveActions:suite.cases.length,results:rows};
 const retrievalResults=evaluateRetrieval(cohortBytes,json(observations)),checked=verifyRetrieval(cohortBytes,json(observations),retrievalResults);
 const decision=preservationPassed&&unsupportedEdges===0&&checked.verdict==='pass'&&(retrievalResults.objective??0)>0?'further-study':'reject';
 return {report:{mode:'scripted-offline',benefitProven:false,suiteDigest:hash(suiteBytes),proposalDigest:digest(proposals),baselineRevision,candidateRevision,preservationPassed,unsupportedEdges,caseResults,retrievalResults,decision},proposals,cohort,observations};
}
/** Rechecks candidate edges against exact feedback and a separately held oracle, then replays the independent retrieval verifier. */
export function verifyReconsolidationExperiment(suiteBytes:Uint8Array,bundle:ReconsolidationBundle):{verdict:'pass'|'fail';reasons:string[]} {
 const require=(ok:unknown,reason:string)=>{if(!ok)throw Error(reason)};
 try{
  const suite=parseSuite(suiteBytes),report=bundle.report;
  require(Object.keys(bundle).sort().join(',')==='cohort,observations,proposals,report','unexpected-bundle-fields');
  require(Object.keys(report).sort().join(',')==='baselineRevision,benefitProven,candidateRevision,caseResults,decision,mode,preservationPassed,proposalDigest,retrievalResults,suiteDigest,unsupportedEdges','unexpected-report-fields');
  require(report.mode==='scripted-offline'&&report.benefitProven===false,'invalid-mode-or-benefit');
  require(report.suiteDigest===hash(suiteBytes)&&report.proposalDigest===digest(bundle.proposals),'input-digest-mismatch');
  require(bundle.proposals.length===suite.cases.length&&report.caseResults.length===suite.cases.length,'missing-case');
  require(isDeepStrictEqual(bundle.cohort,cohortFor(suite)),'cohort-does-not-match-oracle');
  let unsupported=0,preserved=true;const expectedRows:unknown[]=[];
  for(let i=0;i<suite.cases.length;i++){
   const c=suite.cases[i],p=bundle.proposals[i],r=report.caseResults[i],input=c.input as ReconsolidationFixture;
   require(p.caseId===c.id&&r.id===c.id&&r.rejected===!!p.error&&r.guardPassed===(!!p.error===c.oracle.rejectInput),'case-status-mismatch');
   require(r.reason===p.error&&p.edges.length<=8&&(!p.error||p.edges.length===0),'invalid-rejected-proposal');
   preserved&&=r.guardPassed;
   const seen=new Set<string>();
   for(const e of p.edges){
    require(Object.keys(e).sort().join(',')==='sourceId,sourceRevision,targetId,targetRevision,type,verifierRevision','unexpected-edge-fields');
    const key=JSON.stringify([e.sourceId,e.targetId]);require(!seen.has(key)&&e.sourceId!==e.targetId&&e.type==='related','invalid-edge');seen.add(key);
    const source=input.nodes.find(n=>n.id===e.sourceId),target=input.nodes.find(n=>n.id===e.targetId);
    require(source&&target&&source.scopeKey===input.scopeKey&&target.scopeKey===input.scopeKey&&source.revision===e.sourceRevision&&target.revision===e.targetRevision,'edge-lineage-mismatch');
    const feedback=input.outcomes.filter(o=>o.sourceId===e.sourceId&&o.targetId===e.targetId);
    require(feedback.length===1&&feedback[0].verifiedUseful===true&&feedback[0].scopeKey===input.scopeKey&&feedback[0].sourceRevision===e.sourceRevision&&feedback[0].targetRevision===e.targetRevision&&feedback[0].verifierRevision===e.verifierRevision,'unverified-edge');
    if(!c.oracle.allowedEdges.some(([a,b])=>a===e.sourceId&&b===e.targetId))unsupported++;
   }
   for(const q of c.queries)expectedRows.push({queryId:q.id,baselineIds:[q.seedId],candidateIds:[...new Set([q.seedId,...p.edges.filter(e=>e.sourceId===q.seedId).map(e=>e.targetId)])]});
  }
  require(isDeepStrictEqual(bundle.observations.results,expectedRows),'retrieval-does-not-match-proposals');
  const baseline='baseline:'+digest(suite.cases.map(c=>c.input)).slice(7),candidate='candidate:'+digest(bundle.proposals).slice(7);
  require(report.baselineRevision===baseline&&report.candidateRevision===candidate&&bundle.observations.baselineRevision===baseline&&bundle.observations.candidateRevision===candidate,'snapshot-identity-mismatch');
  require(report.preservationPassed===preserved&&report.unsupportedEdges===unsupported,'integrity-score-mismatch');
  const checked=verifyRetrieval(json(bundle.cohort),json(bundle.observations),report.retrievalResults);
  const decision=preserved&&unsupported===0&&checked.verdict==='pass'&&(checked.objective??0)>0?'further-study':'reject';
  require(report.decision===decision,'decision-does-not-reproduce');
  require(checked.verdict==='pass'||(!preserved&&report.decision==='reject'),'retrieval-verification-failed');
  return {verdict:'pass',reasons:[]};
 }catch(error){return {verdict:'fail',reasons:[error instanceof Error?error.message:'invalid-experiment']}}
}
