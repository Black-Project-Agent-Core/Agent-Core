import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as z from 'zod/v4';
import { digest, jsonBytes, readArtifact, writeExclusive } from './report-io.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision=z.string().min(1).max(200);
const hashSchema=z.strictObject(Object.fromEntries(['controlled-outcome','retrieval-evaluation','retrieval-verifier','evaluate-retrieval','report-io','report-bundle'].map(n=>[n,sha])));
const bindingSchema=z.strictObject({inputsDigest:sha,evaluatorRevision:revision,verifierRevision:revision,implementationHashes:hashSchema});
const names=['cohort.json','observations.json','score.json','verification.json','provenance.json','review-candidate.json'];
const outcomeSchema=z.strictObject({correct:z.boolean(),verifierVerdict:z.enum(['pass','fail']),eligible:z.boolean()})
  .refine(o=>o.eligible===(o.correct&&o.verifierVerdict==='pass'));
const manifestSchema=z.strictObject({schemaVersion:z.literal(1),kind:z.literal('agent-core-retrieval-report'),
  reportId:z.string().regex(/^retrieval-[a-f0-9]{64}$/),...bindingSchema.shape,cohortDigest:sha,observationsDigest:sha,outcome:outcomeSchema,
  members:z.array(z.strictObject({name:z.enum(names),bytes:z.number().int().min(0).max(8*1024*1024),digest:sha})).min(5).max(6)});
export const REPORT_TRUST='recomputation of operator-supplied observations; not authentication or statistical significance';
const provenanceSchema=z.strictObject({schemaVersion:z.literal(1),observedAt:z.string().datetime(),reportId:manifestSchema.shape.reportId,
  ...bindingSchema.shape,cohortDigest:sha,observationsDigest:sha,trust:z.literal(REPORT_TRUST),reviewRequired:z.literal(true),memoryPersisted:z.literal(false)});
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
export function reportIdentity(value){const binding=bindingSchema.parse(value);return 'retrieval-'+digest(Buffer.from('agent-core-retrieval-report/v1\0'+canonical(binding))).slice(7);}
export async function implementationHashes(){
  const result={};for(const name of Object.keys(hashSchema.shape)){
    const file=['controlled-outcome','retrieval-evaluation','retrieval-verifier'].includes(name)?path.join(root,'dist/learning',name+'.js'):path.join(root,'scripts/learning',name+'.mjs');
    result[name]=digest(await readArtifact(file));
  }return result;
}
export function generatedClaim(score,reportId){
  return {candidateId:reportId,title:'Reviewed retrieval comparison '+reportId,
    content:`Report ${reportId}. Experiment ${score.experimentId}; candidate ${score.candidateRevision}; baseline ${score.baselineRevision}; cohort ${score.cohortRevision}; corpus ${score.corpusRevision}. Offline hit-at-${score.topK} comparison: observed candidate-minus-baseline rate ${score.objective}. This is not a statistical-significance claim.`};
}
const requireEqual=(a,b,code)=>{if(!isDeepStrictEqual(a,b))throw new Error(code);};
async function directoryMembers(dir){
  const entries=[];const handle=await fs.opendir(dir);
  for await(const entry of handle){
    if(entries.length>=7)throw new Error('REPORT_MEMBER_LIMIT');
    if(!entry.isFile()||entry.isSymbolicLink())throw new Error('NONREGULAR_REPORT_MEMBER');
    entries.push(entry.name);
  }return entries.sort();
}
function parseJSON(bytes,code){try{return JSON.parse(bytes.toString('utf8'));}catch{throw new Error(code);}}
function manifestBinding(m){return {inputsDigest:m.inputsDigest,evaluatorRevision:m.evaluatorRevision,verifierRevision:m.verifierRevision,implementationHashes:m.implementationHashes};}
export async function sealReportBundle(dir,metadata){
  const required=metadata.outcome.eligible?names:names.slice(0,5);
  requireEqual(await directoryMembers(dir),[...required].sort(),'UNEXPECTED_REPORT_MEMBER');
  const members=[];
  for(const name of required){const bytes=await readArtifact(path.join(dir,name));members.push({name,bytes:bytes.length,digest:digest(bytes)});}
  const manifest=manifestSchema.parse({schemaVersion:1,kind:'agent-core-retrieval-report',...metadata,members});
  if(manifest.reportId!==reportIdentity(manifestBinding(manifest)))throw new Error('REPORT_ID_MISMATCH');
  await writeExclusive(path.join(dir,'report-manifest.json'),jsonBytes(manifest));
  const checked=await verifyReportBundle(dir);
  if(!checked.complete)throw new Error('REPORT_COMPLETION_NOT_ESTABLISHED');
  return checked;
}
export function bundleSummary(report){
  const {status,complete,eligible,reportId,inputsDigest,memberCount,implementationMatchesCurrent}=report;
  return {status,complete,eligible,reportId,inputsDigest,memberCount,implementationMatchesCurrent,trust:REPORT_TRUST,reviewRequired:true,memoryPersisted:false};
}
export async function verifyReportBundle(directory){
  const dir=path.resolve(directory),before=await fs.lstat(dir,{bigint:true});
  if(!before.isDirectory()||before.isSymbolicLink())throw new Error('INVALID_REPORT_DIRECTORY');
  let marker;
  try{marker=await readArtifact(path.join(dir,'report-manifest.json'),32*1024);}catch(error){
    if(error.code==='ENOENT')return {status:'legacy-unsealed',complete:false,eligible:false};throw error;
  }
  const m=manifestSchema.parse(parseJSON(marker,'INVALID_REPORT_MANIFEST'));
  const required=m.outcome.eligible?names:names.slice(0,5);
  requireEqual(m.members.map(x=>x.name).sort(),[...required].sort(),'REPORT_MEMBER_SET_MISMATCH');
  requireEqual(await directoryMembers(dir),[...required,'report-manifest.json'].sort(),'UNEXPECTED_REPORT_MEMBER');
  if(reportIdentity(manifestBinding(m))!==m.reportId)throw new Error('REPORT_ID_MISMATCH');
  const artifacts={};
  for(const member of m.members){
    const content=await readArtifact(path.join(dir,member.name));
    if(content.length!==member.bytes||digest(content)!==member.digest)throw new Error('REPORT_MEMBER_DIGEST_MISMATCH');
    artifacts[member.name]=content;
  }
  const cohort=artifacts['cohort.json'],observations=artifacts['observations.json'];
  const score=parseJSON(artifacts['score.json'],'INVALID_SCORE_JSON'),verification=parseJSON(artifacts['verification.json'],'INVALID_VERIFICATION_JSON');
  const provenance=provenanceSchema.parse(parseJSON(artifacts['provenance.json'],'INVALID_PROVENANCE_JSON'));
  const {evaluateRetrieval}=await import('../../dist/learning/retrieval-evaluation.js');
  const {verifyRetrieval}=await import('../../dist/learning/retrieval-verifier.js');
  requireEqual(evaluateRetrieval(cohort,observations),score,'SCORE_DOES_NOT_REPRODUCE');
  requireEqual(verifyRetrieval(cohort,observations,score),verification,'VERIFICATION_DOES_NOT_REPRODUCE');
  for(const [key,value] of Object.entries({inputsDigest:score.inputsDigest,cohortDigest:score.cohortDigest,observationsDigest:score.observationsDigest,
    evaluatorRevision:score.evaluatorRevision,verifierRevision:verification.verifierRevision})){
    requireEqual(m[key],value,'REPORT_BINDING_MISMATCH');requireEqual(provenance[key],value,'PROVENANCE_BINDING_MISMATCH');
  }
  requireEqual(provenance.reportId,m.reportId,'PROVENANCE_ID_MISMATCH');
  requireEqual(provenance.implementationHashes,m.implementationHashes,'IMPLEMENTATION_BINDING_MISMATCH');
  requireEqual(m.outcome,{correct:score.correct,verifierVerdict:verification.verdict,eligible:score.correct&&verification.verdict==='pass'},'OUTCOME_MISMATCH');
  let candidate;
  if(m.outcome.eligible){
    candidate=parseJSON(artifacts['review-candidate.json'],'INVALID_CANDIDATE_JSON');
    const schema=z.strictObject({kind:z.literal('durable-fact'),title:z.string().max(200),content:z.string().max(50000),verified:z.literal(false),
      candidateId:manifestSchema.shape.reportId,auditRef:z.string().startsWith('file:').max(480),evidenceRefs:z.array(z.string()).length(1),evaluation:z.unknown()});
    schema.parse(candidate);
    requireEqual({candidateId:candidate.candidateId,title:candidate.title,content:candidate.content},generatedClaim(score,m.reportId),'CANDIDATE_IDENTITY_MISMATCH');
    requireEqual(candidate.evidenceRefs,[candidate.auditRef],'CANDIDATE_AUDIT_MISMATCH');
    if(!candidate.auditRef.endsWith('/provenance.json'))throw new Error('CANDIDATE_AUDIT_MISMATCH');
    const prefix=candidate.auditRef.slice(0,-'provenance.json'.length);
    const evidence=name=>({ref:prefix+name,digest:digest(artifacts[name]),observedAt:provenance.observedAt});
    const {validateEvaluationEnvelope}=await import('../../dist/learning/evaluation.js');
    const expected=validateEvaluationEnvelope({schemaVersion:1,mode:'rank',evaluatorRevision:score.evaluatorRevision,inputsDigest:score.inputsDigest,
      correct:true,objective:score.objective,metrics:score.metrics,evidence:['score.json','cohort.json','observations.json'].map(evidence),
      baselineRef:'verification:'+score.baselineRevision,attributionComplete:true,
      samples:{candidate:score.metrics.candidateSamples,baseline:score.metrics.baselineSamples,minimum:score.metrics.minimumSamples},
      verification:{method:'recomputed',verdict:'pass',verifierRevision:verification.verifierRevision,evaluatorRevision:verification.evaluatorRevision,
        inputsDigest:verification.inputsDigest,resultEvidence:evidence('verification.json')}});
    requireEqual(validateEvaluationEnvelope(candidate.evaluation),expected,'CANDIDATE_EVALUATION_MISMATCH');
  }
  for(const member of m.members)if(digest(await readArtifact(path.join(dir,member.name)))!==member.digest)throw new Error('REPORT_CHANGED_DURING_REPLAY');
  if(digest(await readArtifact(path.join(dir,'report-manifest.json'),32*1024))!==digest(marker))throw new Error('REPORT_CHANGED_DURING_REPLAY');
  const after=await fs.lstat(dir,{bigint:true});
  if(after.isSymbolicLink()||before.dev!==after.dev||before.ino!==after.ino||before.mtimeNs!==after.mtimeNs)throw new Error('REPORT_DIRECTORY_CHANGED');
  return {status:'complete',complete:true,eligible:m.outcome.eligible,reportId:m.reportId,inputsDigest:m.inputsDigest,memberCount:m.members.length,
    implementationMatchesCurrent:isDeepStrictEqual(m.implementationHashes,await implementationHashes()),manifestDigest:digest(marker),manifest:m,
    artifacts:{cohort,observations,score,verification,provenance,candidate}};
}
