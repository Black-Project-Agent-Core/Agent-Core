import {z} from 'zod';
import type {Budgeted,MemoryHit,RecallPage,SourceRef} from './disclosure.js';

/** Controller-owned opt-in limits; this helper is never an authorization gate. */
export const RETRIEVAL_LIMITS=Object.freeze({questions:4,recallCalls:6,expandCalls:2,totalBytes:32768,callBytes:4096,minBytes:512,elapsedMs:15000});
export interface Subquestion {id:string;query:string}
export interface RetrievalPlan {version:1;rootQuery:string;questions:Subquestion[]}
const query=z.string().trim().refine(value=>Array.from(value).length>=1&&Array.from(value).length<=2000,'Query must contain 1–2000 characters');
export const retrievalPlanSchema=z.strictObject({version:z.literal(1),rootQuery:query,questions:z.array(z.strictObject({id:z.string().regex(/^q[1-4]$/),query})).max(RETRIEVAL_LIMITS.questions)})
 .refine(plan=>plan.questions.length!==1,'Decomposition requires 2–4 questions; single lookup has no subquestions')
 .refine(plan=>new Set(plan.questions.map(question=>question.id)).size===plan.questions.length,'Duplicate question ID')
 .refine(plan=>new Set(plan.questions.map(question=>question.query)).size===plan.questions.length,'Duplicate trimmed query');
/** Strict structure validation cannot detect every malicious instruction in prose. */
export function parseRetrievalPlan(input:unknown):RetrievalPlan {return retrievalPlanSchema.parse(input);}
export interface RetrievalBudget {
 recallCalls:number;expandCalls:number;remainingBytes:number;deadlineMs:number;protocolViolation:boolean;
 /** One outstanding reservation at most. Settle failed calls with zero bytes. */
 reservedBytes?:number;lastNowMs:number;
}
function finiteClock(nowMs:number):void {if(!Number.isFinite(nowMs)||nowMs<0)throw new Error('RETRIEVAL_CLOCK_INVALID');}
export function createRetrievalBudget(startMs:number):RetrievalBudget {
 finiteClock(startMs);
 return {recallCalls:0,expandCalls:0,remainingBytes:RETRIEVAL_LIMITS.totalBytes,deadlineMs:startMs+RETRIEVAL_LIMITS.elapsedMs,protocolViolation:false,lastNowMs:startMs};
}
export function reserveRetrievalCall(budget:RetrievalBudget,kind:'recall'|'expand',nowMs:number):{allowed:boolean;maxBytes:number;reason?:string} {
 finiteClock(nowMs);
 if(kind!=='recall'&&kind!=='expand')throw new Error('RETRIEVAL_CALL_INVALID');
 const denied=(reason:string)=>({allowed:false,maxBytes:0,reason});
 if(budget.protocolViolation)return denied('protocol-violation');
 if(nowMs<budget.lastNowMs)return denied('clock-regressed');
 budget.lastNowMs=nowMs;
 if(nowMs>=budget.deadlineMs)return denied('deadline');
 if(budget.reservedBytes!==undefined)return denied('call-in-flight');
 if(kind==='recall'&&budget.recallCalls>=RETRIEVAL_LIMITS.recallCalls)return denied('recall-call-limit');
 if(kind==='expand'&&budget.expandCalls>=RETRIEVAL_LIMITS.expandCalls)return denied('expand-call-limit');
 if(budget.remainingBytes<RETRIEVAL_LIMITS.minBytes)return denied('payload-budget');
 const maxBytes=Math.min(RETRIEVAL_LIMITS.callBytes,budget.remainingBytes);
 budget.reservedBytes=maxBytes;
 if(kind==='recall')budget.recallCalls++;else budget.expandCalls++;
 return {allowed:true,maxBytes};
}
/** Meter the complete response before admitting it to a transcript accumulator.
 * Over-cap responses must be rejected whole by the caller, never truncated.
 */
export function recordRetrievalBytes(budget:RetrievalBudget,bytes:number):void {
 if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('RETRIEVAL_BYTES_INVALID');
 if(budget.reservedBytes===undefined)throw new Error('RETRIEVAL_RESERVATION_REQUIRED');
 if(bytes>budget.reservedBytes||bytes>budget.remainingBytes)budget.protocolViolation=true;
 budget.remainingBytes=Math.max(0,budget.remainingBytes-bytes);
 delete budget.reservedBytes;
}

export interface RetrievalObservation {questionId:string;callId:string;result:Budgeted<RecallPage>}
export interface RetrievalOrigin {
 questionId:string;callId:string;retrievalEvidence:MemoryHit['retrievalEvidence'];score?:number;
 applicability:MemoryHit['applicability'];freshness:MemoryHit['freshness'];verification:MemoryHit['verification'];
}
export interface MergedRetrievalHit {hit:MemoryHit;questionIds:string[];callIds:string[];origins:RetrievalOrigin[]}
export interface QuestionCoverage {questionId:string;status:'unsearched'|'retrieved'|'evidence-reviewed'|'gap'|'blocked';reason?:string}
export interface MergedRetrieval {hits:MergedRetrievalHit[];coverage:QuestionCoverage[];revisionConflicts:string[]}
const verificationOrder:MemoryHit['verification'][]=['verified','supported','unverified'];
const freshnessOrder:MemoryHit['freshness'][]=['current','unknown','stale'];
const applicabilityOrder:MemoryHit['applicability'][]=['current','historical','unknown','superseded','conflicted'];
/** Pure transcript projection, not trusted current evidence or a scope/ACL cache.
 * Callers must provide observations from one host-bound root/workspace/task only.
 */
export function mergeRetrievalObservations(rawPlan:RetrievalPlan,observations:RetrievalObservation[]):MergedRetrieval {
 const plan=parseRetrievalPlan(rawPlan),ids=['root',...plan.questions.map(question=>question.id)];
 const grouped=new Map(ids.map(id=>[id,[] as RetrievalObservation[]]));
 for(const observation of observations){
  const group=grouped.get(observation.questionId);if(!group)throw new Error('RETRIEVAL_QUESTION_UNKNOWN');
  if(!observation.callId.trim())throw new Error('RETRIEVAL_CALL_ID_INVALID');
  group.push(observation);
 }
 const coverage:QuestionCoverage[]=ids.map(questionId=>{
  const group=grouped.get(questionId)!;if(!group.length)return {questionId,status:'unsearched'};
  const hasHits=group.some(observation=>observation.result.status!=='insufficient-budget'&&observation.result.data.hits.length>0);
  const insufficient=group.some(observation=>observation.result.status==='insufficient-budget');
  const partial=group.some(observation=>observation.result.status==='partial'||(observation.result.status!=='insufficient-budget'&&observation.result.data.completeness==='partial'));
  const reason=insufficient?'insufficient-budget':partial?'partial-recall':!hasHits?'no-candidates':undefined;
  return {questionId,status:hasHits?'retrieved':'gap',...(reason?{reason}:{})};
 });
 const queues=ids.map(questionId=>grouped.get(questionId)!.flatMap(observation=>observation.result.status==='insufficient-budget'?[]:observation.result.data.hits.map(hit=>({questionId,callId:observation.callId,hit}))));
 const hits:MergedRetrievalHit[]=[],bySource=new Map<string,MergedRetrievalHit>();
 // Round robin consumes source order without comparing query-local scores.
 for(let index=0;queues.some(queue=>index<queue.length);index++)for(const queue of queues){
  const entry=queue[index];if(!entry)continue;
  const {hit}=entry,key=JSON.stringify(['memory',hit.id,hit.revision]);
  let merged=bySource.get(key);
  if(!merged){merged={hit:structuredClone(hit),questionIds:[],callIds:[],origins:[]};bySource.set(key,merged);hits.push(merged);}
 }
 for(const queue of queues)for(const {questionId,callId,hit} of queue){
  const merged=bySource.get(JSON.stringify(['memory',hit.id,hit.revision]))!;
  if(!merged.questionIds.includes(questionId))merged.questionIds.push(questionId);
  if(!merged.callIds.includes(callId))merged.callIds.push(callId);
  merged.origins.push({questionId,callId,retrievalEvidence:{...hit.retrievalEvidence},...(hit.score!==undefined?{score:hit.score}:{}),applicability:hit.applicability,freshness:hit.freshness,verification:hit.verification});
  // Repeated exposure can never upgrade applicability, freshness or verification.
  if(verificationOrder.indexOf(hit.verification)>verificationOrder.indexOf(merged.hit.verification))merged.hit.verification=hit.verification;
  if(freshnessOrder.indexOf(hit.freshness)>freshnessOrder.indexOf(merged.hit.freshness))merged.hit.freshness=hit.freshness;
  if(applicabilityOrder.indexOf(hit.applicability)>applicabilityOrder.indexOf(merged.hit.applicability))merged.hit.applicability=hit.applicability;
 }
 const revisions=new Map<string,Set<string>>();for(const {hit} of hits){const set=revisions.get(hit.id)??new Set();set.add(hit.revision);revisions.set(hit.id,set);}
 const revisionConflicts=[...revisions].filter(([,values])=>values.size>1).map(([id])=>id);
 for(const merged of hits)if(revisionConflicts.includes(merged.hit.id)){
  merged.hit.applicability='conflicted';
  for(const questionId of merged.questionIds){const item=coverage.find(item=>item.questionId===questionId)!;item.reason=[...new Set([...(item.reason?.split(';')??[]),'revision-conflict'])].join(';');}
 }
 return {hits,coverage,revisionConflicts};
}
function questionCoverage(merged:MergedRetrieval,questionId:string):QuestionCoverage {
 const item=merged.coverage.find(item=>item.questionId===questionId);if(!item)throw new Error('RETRIEVAL_QUESTION_UNKNOWN');return item;
}
export function markQuestionBlocked(merged:MergedRetrieval,questionId:string,reason:string):MergedRetrieval {
 questionCoverage(merged,questionId);if(!reason.trim())throw new Error('RETRIEVAL_BLOCK_REASON_REQUIRED');
 return {...merged,coverage:merged.coverage.map(item=>item.questionId===questionId?{questionId,status:'blocked',reason}: {...item})};
}
/** Call only after exact-revision expansion was available and reviewed.
 * Review records inspection, never permission, truth, currentness or benefit.
 */
export function markEvidenceReviewed(merged:MergedRetrieval,source:SourceRef,questionIds:string[]):MergedRetrieval {
 for(const id of questionIds)questionCoverage(merged,id);
 const observed=source.kind==='memory'?merged.hits.find(item=>item.hit.id===source.id&&item.hit.revision===source.revision):undefined;
 if(!observed||questionIds.some(id=>!observed.questionIds.includes(id)))throw new Error('RETRIEVAL_SOURCE_NOT_OBSERVED');
 if(merged.revisionConflicts.includes(source.id))return merged;
 return {...merged,coverage:merged.coverage.map(item=>questionIds.includes(item.questionId)&&item.status!=='blocked'?{...item,status:'evidence-reviewed'}:{...item})};
}
