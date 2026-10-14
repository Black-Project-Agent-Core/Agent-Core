import * as z from 'zod/v4';
import {isDeepStrictEqual} from 'node:util';
import {outcomeDigest,type OutcomeSuite} from './outcome-contract.js';

export const DIAGNOSTICS_VERSION='memory-diagnostics/v1';
const id=z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const instant=z.iso.datetime({offset:true});
const ids=z.array(id).max(64).refine(v=>new Set(v).size===v.length,'Duplicate identity');
const fact=z.strictObject({id,value:z.string().min(1).max(8192),sourceId:id});
export const diagnosticAnswerSchema=z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('facts'),facts:z.array(fact).max(64)}),z.strictObject({kind:z.literal('abstain')})]);
export const diagnosticStepSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('capture'),...fact.shape,effectiveAt:instant,trust:z.enum(['verified-fixture','untrusted-fixture']),supersedes:id.optional()}),
 z.strictObject({kind:z.literal('reopen')}),
 z.strictObject({kind:z.literal('recall'),query:z.string().min(1).max(2048),asOf:instant.optional()}),
 z.strictObject({kind:z.literal('answer'),answerMode:z.enum(['current','historical','abstain'])}),
 z.strictObject({kind:z.literal('review-consolidation'),operationId:id,candidateId:id,taskEvidenceIds:ids,decision:z.enum(['proposal-only','accept-verified','reject'])}),
]);
const checkpoint=z.strictObject({afterStep:z.number().int().min(0).max(31),expectedCurrentIds:ids,expectedHistoricalIds:ids,forbiddenPromotions:ids,
 expectedSupport:z.array(z.strictObject({candidateId:id,independentTaskCount:z.number().int().min(0).max(64)})).max(64),expectedSources:z.array(z.strictObject({id,sourceIds:ids.min(1)})).max(64)});
export const diagnosticCaseSchema=z.strictObject({caseId:id,diagnosticFamily:z.enum(['recall-extraction','recall-multi-session','recall-update','recall-temporal','recall-abstention','integrity-interference','integrity-misinformation','integrity-repeated-consolidation','integrity-reconsolidation']),steps:z.array(diagnosticStepSchema).min(1).max(32),
 oracle:z.strictObject({expectedPreservedIds:ids,expectedRetrievedIds:ids,expectedAnswer:diagnosticAnswerSchema,forbiddenIds:ids}),integrity:z.strictObject({checkpoints:z.array(checkpoint).min(1).max(32)}).optional()});
const sidecarSchema=z.strictObject({version:z.literal(DIAGNOSTICS_VERSION),suiteDigest:digest,cases:z.array(diagnosticCaseSchema).min(1)});
export type DiagnosticCase=z.infer<typeof diagnosticCaseSchema>;
export type DiagnosticSuite=z.infer<typeof sidecarSchema>;
export type DiagnosticAnswer=z.infer<typeof diagnosticAnswerSchema>;
export const diagnosticRefSchema=z.strictObject({id,memoryId:id,revision:digest,sourceId:id,digest});
const evidenceRef=z.string().regex(/^diagnostic:evidence\/diagnostics\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.json#sha256:[a-f0-9]{64}$/);
export const diagnosticObservationSchema=z.strictObject({caseId:id,runId:id,taskId:id,traceDigest:digest,preservedRefs:z.array(diagnosticRefSchema).max(64),retrievedRefs:z.array(diagnosticRefSchema).max(64),useReceiptRefs:z.array(evidenceRef).max(64),answer:diagnosticAnswerSchema,evidenceRefs:z.array(evidenceRef).max(128)});
export type DiagnosticObservation=z.infer<typeof diagnosticObservationSchema>;
export interface DiagnosticDimension{status:'PASS'|'FAIL'|'UNKNOWN';evidenceRefs:string[]}
export interface DiagnosticScores{preservation:DiagnosticDimension;retrieval:DiagnosticDimension;controllerUse:DiagnosticDimension;outcome:DiagnosticDimension}
export interface IntegrityScores{stability:DiagnosticDimension;validUpdate:DiagnosticDimension;history:DiagnosticDimension;sourceFidelity:DiagnosticDimension;supportDeduplication:DiagnosticDimension}
export function validateDiagnosticCase(input:unknown):DiagnosticCase{
 diagnosticCaseSchema.parse(input);const item=structuredClone(input) as DiagnosticCase;
 const captures=item.steps.filter(s=>s.kind==='capture'),facts=new Map(captures.map(s=>[s.id,s]));
 if(facts.size!==captures.length||captures.length>64)throw Error('DIAGNOSTIC_DUPLICATE_FACT');
 if(item.caseId.length>160||captures.some(c=>!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(c.id)))throw Error('DIAGNOSTIC_OWNER_ID_BOUND');
 const sources=new Set(captures.map(s=>s.sourceId)),seen=new Set<string>(),operations=new Map<string,string>();
 for(const step of item.steps){if(step.kind==='capture'){if(step.supersedes&&(!seen.has(step.supersedes)||step.supersedes===step.id))throw Error('DIAGNOSTIC_INVALID_PREDECESSOR');seen.add(step.id);}if(step.kind==='review-consolidation'){if(!facts.has(step.candidateId))throw Error('DIAGNOSTIC_MISSING_CANDIDATE');if(step.operationId.length>180)throw Error('DIAGNOSTIC_OWNER_ID_BOUND');const prior=operations.get(step.operationId);if(prior&&prior!==JSON.stringify(step))throw Error('DIAGNOSTIC_OPERATION_CONFLICT');operations.set(step.operationId,JSON.stringify(step));}}
 const known=(values:string[])=>{if(values.some(value=>!facts.has(value)))throw Error('DIAGNOSTIC_UNKNOWN_FACT');};
 known([...item.oracle.expectedPreservedIds,...item.oracle.expectedRetrievedIds,...item.oracle.forbiddenIds]);
 if(item.oracle.expectedAnswer.kind==='facts'){
  if(new Set(item.oracle.expectedAnswer.facts.map(f=>f.id)).size!==item.oracle.expectedAnswer.facts.length)throw Error('DIAGNOSTIC_DUPLICATE_ANSWER');
  for(const expected of item.oracle.expectedAnswer.facts){const capture=facts.get(expected.id);if(!capture||capture.value!==expected.value||capture.sourceId!==expected.sourceId||!sources.has(expected.sourceId)||capture.trust!=='verified-fixture')throw Error('DIAGNOSTIC_ANSWER_SOURCE_MISMATCH');}
 }
 const checkpoints=item.integrity?.checkpoints??[];
 if(new Set(checkpoints.map(c=>c.afterStep)).size!==checkpoints.length)throw Error('DIAGNOSTIC_DUPLICATE_CHECKPOINT');
 for(const c of checkpoints){
  if(c.afterStep>=item.steps.length)throw Error('DIAGNOSTIC_CHECKPOINT_RANGE');
  const available=new Set(item.steps.slice(0,c.afterStep+1).filter(s=>s.kind==='capture').map(s=>s.id));
  const refs=[...c.expectedCurrentIds,...c.expectedHistoricalIds,...c.forbiddenPromotions,...c.expectedSupport.map(s=>s.candidateId),...c.expectedSources.map(s=>s.id)];
  known(refs);if(refs.some(v=>!available.has(v)))throw Error('DIAGNOSTIC_CHECKPOINT_FUTURE');
  if(c.expectedCurrentIds.some(v=>c.forbiddenPromotions.includes(v)||c.expectedHistoricalIds.includes(v)))throw Error('DIAGNOSTIC_CHECKPOINT_CONTRADICTION');
  if(new Set(c.expectedSupport.map(s=>s.candidateId)).size!==c.expectedSupport.length||new Set(c.expectedSources.map(s=>s.id)).size!==c.expectedSources.length)throw Error('DIAGNOSTIC_DUPLICATE_ASSERTION');
  for(const s of c.expectedSources)if(s.sourceIds.some(v=>!sources.has(v)))throw Error('DIAGNOSTIC_UNKNOWN_SOURCE');
 }
 return item;
}
export function parseOutcomeDiagnostics(raw:unknown,suite:OutcomeSuite):DiagnosticSuite{
 sidecarSchema.parse(raw);const sidecar=structuredClone(raw) as DiagnosticSuite;
 if(sidecar.suiteDigest!==outcomeDigest(suite))throw Error('DIAGNOSTIC_SUITE_DIGEST_MISMATCH');
 const expected=suite.cases.filter(c=>c.partition==='heldout').map(c=>c.id),actual=sidecar.cases.map(c=>c.caseId);
 if(actual.length!==expected.length||new Set(actual).size!==actual.length||expected.some(id=>!actual.includes(id)))throw Error('DIAGNOSTIC_CASE_MEMBERSHIP');
 sidecar.cases.forEach(validateDiagnosticCase);return sidecar;
}
const dimension=(status:DiagnosticDimension['status'],evidenceRefs:string[]):DiagnosticDimension=>({status,evidenceRefs});
/** Evidence must be resolved before scoring; omitted evidence is UNKNOWN, never a pass. */
export function evaluateDiagnosticObservation(spec:DiagnosticCase,row:DiagnosticObservation,evidence?:ReadonlyMap<string,Uint8Array>):DiagnosticScores{
 const refs=row.evidenceRefs;const unknown=()=>dimension('UNKNOWN',[]);
 if(!evidence)return{preservation:unknown(),retrieval:unknown(),controllerUse:unknown(),outcome:unknown()};
 const get=(suffix:string)=>{const ref=refs.find(ref=>ref.includes('/'+suffix+'.json#'));if(!ref)return null;const match=/^diagnostic:([^#]+)#(.+)$/.exec(ref)!;const data=evidence.get(match[1]!);if(!data||outcomeDigest(Buffer.from(data).toString())!==match[2])return null;return JSON.parse(Buffer.from(data).toString());};
 const final=get('final'),answer=get('answer'),trace=get('trace');
 const preserved=final?.records?.map((r:any)=>r.ref.id),retrieved=final?.retrieved?.map((r:any)=>r.id);
 const same=isDeepStrictEqual;
 const required=(actual:string[],expected:string[])=>expected.every(v=>actual.includes(v))&&!spec.oracle.forbiddenIds.some(v=>actual.includes(v));
 let use:DiagnosticDimension=unknown();
 if(row.useReceiptRefs.length){let valid=true;for(const ref of row.useReceiptRefs){const match=/^diagnostic:([^#]+)#(.+)$/.exec(ref);const data=match&&evidence.get(match[1]!);if(!data||outcomeDigest(Buffer.from(data).toString())!==match![2]){valid=false;continue;}const r=JSON.parse(Buffer.from(data).toString());const hit=row.retrievedRefs.find(v=>v.memoryId===r.memoryId&&v.revision===r.revision);valid&&=Boolean(hit&&r.taskId===row.taskId&&r.actionDigest===outcomeDigest(row.answer)&&r.verdict==='pass'&&r.ownerReceipt?.taskId===row.taskId&&r.ownerReceipt?.memoryId===r.memoryId&&r.ownerReceipt?.result==='success'&&r.ownerReceipt?.evidenceValidation==='resolved'&&r.ownerReceipt?.applicability==='applied');}use=dimension(valid?'PASS':'FAIL',row.useReceiptRefs);}
 return{preservation:final?dimension(required(preserved,spec.oracle.expectedPreservedIds)?'PASS':'FAIL',refs):unknown(),retrieval:final?dimension(required(retrieved,spec.oracle.expectedRetrievedIds)&&retrieved.length===spec.oracle.expectedRetrievedIds.length?'PASS':'FAIL',refs):unknown(),controllerUse:use,outcome:answer&&trace?dimension(same(answer.answer,spec.oracle.expectedAnswer)?'PASS':'FAIL',refs):unknown()};
}

export async function evaluateDiagnosticsReport(suite:OutcomeSuite,sidecar:DiagnosticSuite,rows:DiagnosticObservation[],evidence:ReadonlyMap<string,Uint8Array>,phase:'baseline'|'compare'){
 const {verifyDiagnosticEvidence}=await import('./outcome-diagnostics-verifier.js');
 const expected=suite.expectedRunIds[phase],seen=new Set(rows.map(row=>row.runId));
 const runs=rows.map(row=>{const spec=sidecar.cases.find(c=>c.caseId===row.caseId);if(!spec)throw Error('DIAGNOSTIC_FOREIGN_CASE');const result=verifyDiagnosticEvidence(Buffer.from(JSON.stringify(spec)),Buffer.from(JSON.stringify(row)),evidence);return{runId:row.runId,diagnosticFamily:spec.diagnosticFamily,scores:result.complete?evaluateDiagnosticObservation(spec,row,evidence):result.scores,integrity:result.integrity,complete:result.complete,reasons:result.reasons};});
 const missingRunIds=expected.filter(id=>!seen.has(id)),complete=missingRunIds.length===0&&rows.length===expected.length&&seen.size===rows.length&&rows.every(row=>expected.includes(row.runId))&&runs.every(run=>run.complete);
 const hardFailure=runs.some(run=>run.reasons.length||run.integrity&&Object.values(run.integrity).some(value=>value.status!=='PASS'));
 return{version:'memory-diagnostic-report/v1',phase,suiteDigest:outcomeDigest(suite),sidecarDigest:outcomeDigest(sidecar),observationsDigest:outcomeDigest(rows),expectedRunIds:expected,missingRunIds,complete,integrityStatus:hardFailure?'FAIL':complete?'PASS':'UNKNOWN',runs,benefitProven:false,efficiencyBenchmark:'DEFERRED',live:'NOT RUN'};
}
