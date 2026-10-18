import {z} from 'zod';
import {sourceRefSchema,safeIdSchema,digestSchema,isoInstantSchema,type SourceRef} from './experience-types.js';
import {disclosureDigest,stableDisclosureJson,memorySemanticRevision,MemoryControllerError,measureBudgeted,insufficientBudget,type ControllerScope} from './disclosure.js';
import {assertLearningTextSafe} from './safety.js';
import type {FileMemoryStore} from './store.js';
import type {MemoryEpisodes} from './episodes.js';

const text=z.string().trim().min(1).max(2000);
const operation=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const refs=z.array(sourceRefSchema).max(16);
const eventKey=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
export const claimReviewContractSchema=z.strictObject({
 validationKind:z.enum(['reality','decision','dependency','relevance']),claim:text,scope:text,
 authority:z.strictObject({basis:z.enum(['user','source','inferred','unknown']),sourceRefs:refs}),
 method:z.strictObject({instructions:text,lookups:z.array(z.strictObject({source:sourceRefSchema,field:z.string().trim().min(1).max(200)})).max(16)}),
 triggers:z.array(eventKey).max(16),cadence:z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('event')}),z.strictObject({kind:z.literal('durable')}),
  z.strictObject({kind:z.literal('interval'),hours:z.number().int().min(1).max(87600)}),
 ]),
});
const checks=z.strictObject({sourceAccess:z.enum(['available','unavailable']),method:z.enum(['pass','fail','unavailable']),
 authority:z.enum(['supported','unknown']).optional(),effectiveAt:isoInstantSchema.optional(),
 dependencyBehavior:z.enum(['pass','fail','unavailable']).optional(),environmentRevision:z.string().trim().min(1).max(200).optional(),
 applicable:z.enum(['yes','no','unknown']).optional(),
 externalization:z.strictObject({status:z.enum(['written','pending','unavailable']),target:sourceRefSchema.optional()}).optional(),
});
const base={memoryId:safeIdSchema,expectedRevision:digestSchema,expectedReviewRevision:digestSchema.nullable(),operationId:operation};
export const claimReviewWriteSchema=z.discriminatedUnion('operation',[
 z.strictObject({...base,operation:z.literal('define'),contract:claimReviewContractSchema}),
 z.strictObject({...base,operation:z.literal('attempt'),outcome:z.enum(['supported','contradicted','unresolved','not-applicable']),
  disposition:z.enum(['retain','revise','externalize','retire']),observation:text,evidenceRefs:refs,checks}),
]);
export const claimReviewReadSchema=z.strictObject({memoryId:safeIdSchema,events:z.array(eventKey).max(16).optional(),
 budget:z.strictObject({maxBytes:z.number().int().min(512).max(65536).optional()}).optional()});
const owner=z.strictObject({rootId:safeIdSchema,workspaceKey:z.string().min(1).max(120),taskId:operation});
const contractEntry=z.strictObject({digest:digestSchema,recordRevision:digestSchema,at:isoInstantSchema,owner,contract:claimReviewContractSchema});
const attemptEntry=z.strictObject({operationId:operation,contractDigest:digestSchema,recordRevision:digestSchema,at:isoInstantSchema,owner,
 outcome:z.enum(['supported','contradicted','unresolved','not-applicable']),requestedOutcome:z.enum(['supported','contradicted','unresolved','not-applicable']),
 disposition:z.enum(['retain','revise','externalize','retire']),observation:text,evidenceRefs:refs,checks,
 semanticSupport:z.literal('controller-assessed'),reasons:z.array(z.string().max(200)).max(16)});
export const claimReviewStateSchema=z.strictObject({version:z.literal(1),rootId:safeIdSchema,workspaceKey:z.string().min(1).max(120),
 memory:sourceRefSchema.refine(r=>r.kind==='memory'),contracts:z.array(contractEntry).min(1).max(32),attempts:z.array(attemptEntry).max(64),
 operations:z.array(z.strictObject({id:operation,payloadDigest:digestSchema})).min(1).max(128),
 guidanceDisposition:z.enum(['retain','revise','externalize','retire']),
});
type State=z.infer<typeof claimReviewStateSchema>;
export type ClaimReviewContract=z.infer<typeof claimReviewContractSchema>;
export type ClaimReviewRead=z.infer<typeof claimReviewReadSchema>;
export type ClaimReviewWrite=z.infer<typeof claimReviewWriteSchema>;
export function externalClaimReviewGuide(){
 return{version:1 as const,read:{tool:'memory_v2_read',action:'claim_review',payload:['memoryId','events?','budget?']},
  write:{tool:'memory_v2_write',action:'claim_review',operations:['define','attempt'],required:['memoryId','expectedRevision','expectedReviewRevision','operationId']},
  validationKinds:['reality','decision','dependency','relevance'],
  contract:['claim','scope','authority.basis/sourceRefs','method.instructions/lookups(source,field)','triggers','cadence(event|durable|interval.hours)'],
  attempt:['outcome(supported|contradicted|unresolved|not-applicable)','disposition(retain|revise|externalize|retire)','observation','evidenceRefs','checks.sourceAccess/method'],
  causeChecks:{decision:['authority(supported|unknown)','effectiveAt'],dependency:['dependencyBehavior(pass|fail|unavailable)','environmentRevision'],relevance:['applicable(yes|no|unknown)'],externalize:['externalization.status(written|pending|unavailable)','externalization.target']},
  steps:['Read the exact Memory revision and current claim_review metadata; use scope.taskId from the host Learning episode.',
   'Define HOW with validationKind/method and WHEN with triggers/cadence. Use expectedReviewRevision:null only for first definition.',
   'Inspect current evidence through permitted tools, capture it with evidence_capture, then append an attempt with exact revisions and a stable operationId.',
   'Unavailable evidence is unresolved. lastSuccessfulValidation never advances on failure. Review metadata is controller-assessed, not independent truth or permission.',
   'A disposition is advice only: no automatic rewrite, retirement, promotion or scheduling. Read docs/memory/EXTERNAL-LEARNING-PRIORITIES.md for examples.'],
  executionAuthority:false as const};
}
type Write=z.infer<typeof claimReviewWriteSchema>;
export const claimReviewStateKey=(workspace:string,id:string)=>`claim-reviews/${disclosureDigest(['claim-review/v1',workspace,id]).slice(7)}.json`;
const fail=(code:'MEMORY_INPUT_INVALID'|'MEMORY_SCOPE_MISMATCH'|'MEMORY_SOURCE_UNAVAILABLE'|'MEMORY_REVISION_CONFLICT'|'MEMORY_OPERATION_CONFLICT'|'MEMORY_CONSOLIDATION_REVIEW_REQUIRED'):never=>{throw new MemoryControllerError(code);};
function parse<T>(schema:z.ZodType<T>,raw:unknown):T{const value=schema.safeParse(raw);if(!value.success)return fail('MEMORY_INPUT_INVALID');assertLearningTextSafe(stableDisclosureJson(value.data));return value.data;}
function state(raw:string|null,rootId:string,workspace:string,id:string):State|undefined{
 if(raw===null)return;
 const v=claimReviewStateSchema.safeParse(JSON.parse(raw));if(!v.success)return fail('MEMORY_SOURCE_UNAVAILABLE');
 if(v.data.rootId!==rootId||v.data.workspaceKey!==workspace||v.data.memory.id!==id)return fail('MEMORY_SCOPE_MISMATCH');
 return v.data;
}
function outcome(input:Extract<Write,{operation:'attempt'}>,contract:z.infer<typeof claimReviewContractSchema>,evidenceAvailable:boolean,now:string){
 const reasons:string[]=[];
 if(input.checks.sourceAccess!=='available'||!evidenceAvailable)reasons.push('evidence-unavailable');
 if(input.checks.method==='unavailable')reasons.push('method-not-checked');
 if(contract.validationKind==='decision'){
  if(input.checks.authority!=='supported'||contract.authority.basis==='unknown')reasons.push('decision-authority-unknown');
  if(!input.checks.effectiveAt||Date.parse(input.checks.effectiveAt)>Date.parse(now))reasons.push('decision-not-effective');
 }
 if(contract.validationKind==='dependency'&&(input.checks.dependencyBehavior==='unavailable'||input.checks.dependencyBehavior===undefined||!input.checks.environmentRevision))reasons.push('representative-dependency-check-unavailable');
 if(input.disposition==='externalize'&&(input.checks.externalization?.status!=='written'||!input.checks.externalization.target))reasons.push('externalization-not-complete');
 let result=input.outcome;
 if(reasons.length)result='unresolved';
 else if(contract.validationKind==='relevance'&&input.checks.applicable!=='yes')result=input.checks.applicable==='no'?'not-applicable':'unresolved';
 else if(result==='supported'&&(input.checks.method!=='pass'||contract.validationKind==='dependency'&&input.checks.dependencyBehavior!=='pass'))result='contradicted';
 else if(result==='contradicted'&&input.checks.method!=='fail'&&input.checks.dependencyBehavior!=='fail'){result='unresolved';reasons.push('negative-result-not-checked');}
 return{outcome:result,reasons};
}

/** Metadata in the existing canonical Memory transaction owner, external opt-in only.
 * Resolving evidence proves availability, never semantic truth or execution permission. */
export class MemoryClaimReviews {
 constructor(private readonly store:FileMemoryStore,private readonly episodes:MemoryEpisodes){}
 async read(scope:ControllerScope,raw:unknown){
  if(scope.controllerId!=='agent-core-external')return fail('MEMORY_SCOPE_MISMATCH');
  const input=parse(claimReviewReadSchema,raw),maxBytes=input.budget?.maxBytes??8192;
  return this.episodes.promotionSnapshot(scope,async p=>{
   const record=p.visible(input.memoryId);if(record.pinned)return fail('MEMORY_INPUT_INVALID');
   const saved=state(await p.read(claimReviewStateKey(p.owner.workspaceKey,input.memoryId)),p.owner.rootId,p.owner.workspaceKey,input.memoryId);
   const currentRevision=memorySemanticRevision(record),last=saved?.contracts.at(-1),lastAttempt=saved?.attempts.at(-1);
   const success=saved?.attempts.slice().reverse().find(a=>a.outcome==='supported'&&a.recordRevision===currentRevision&&a.contractDigest===last?.digest);
   const reasons:string[]=[];
   if(!saved)reasons.push('not-configured');
   else{
    if(last?.recordRevision!==currentRevision)reasons.push('record-revision-changed');
    if(!success)reasons.push('not-successfully-checked');
    if(lastAttempt&&lastAttempt.outcome!=='supported')reasons.push('latest-check:'+lastAttempt.outcome);
    if(last?.contract.cadence.kind==='interval'&&success&&Date.now()-Date.parse(success.at)>=last.contract.cadence.hours*3600000)reasons.push('cadence');
    for(const key of input.events??[])if(last?.contract.triggers.includes(key))reasons.push('event:'+key);
   }
   const view={status:saved?'configured':'unknown',revision:saved?disclosureDigest(saved):null,memoryId:input.memoryId,recordRevision:currentRevision,
    ...(last?{contract:last.contract,contractDigest:last.digest}:{}),guidanceDisposition:saved?.guidanceDisposition??'retain',
    ...(lastAttempt?{lastAttempt}:{}),...(success?{lastSuccessfulValidation:success}:{}),
    currentValidation:{status:lastAttempt?.recordRevision===currentRevision&&lastAttempt.contractDigest===last?.digest?lastAttempt.outcome:'unknown',semanticSupport:'controller-assessed'},
    reviewDue:{status:reasons.length?'required':'not-due',reasons},history:{contracts:saved?.contracts.length??0,attempts:saved?.attempts.length??0},
    semanticSupport:'controller-assessed',executionAuthority:false};
   const measured=measureBudgeted({status:'ok',data:view,warnings:['claim-review-is-advisory','source-resolution-is-not-semantic-verification']});
   return measured.metrics.payloadBytes<=maxBytes?measured:insufficientBudget(measured.metrics.payloadBytes,['claim-review-budget']);
  });
 }
 async write(scope:ControllerScope,raw:unknown,assertCurrent?:()=>void|Promise<void>){
  if(scope.controllerId!=='agent-core-external')return fail('MEMORY_SCOPE_MISMATCH');
  const input=parse(claimReviewWriteSchema,raw),payloadDigest=disclosureDigest(input);
  await assertCurrent?.();
  const prepared=await this.episodes.promotionSnapshot(scope,async p=>{
   const record=p.visible(input.memoryId);if(record.pinned)return fail('MEMORY_INPUT_INVALID');
   const key=claimReviewStateKey(p.owner.workspaceKey,input.memoryId),saved=state(await p.read(key),p.owner.rootId,p.owner.workspaceKey,input.memoryId);
   const prior=saved?.operations.find(op=>op.id===input.operationId);
   if(prior){if(prior.payloadDigest!==payloadDigest)return fail('MEMORY_OPERATION_CONFLICT');return{p,key,saved,duplicate:true};}
   if(memorySemanticRevision(record)!==input.expectedRevision||(saved?disclosureDigest(saved):null)!==input.expectedReviewRevision)return fail('MEMORY_REVISION_CONFLICT');
   if((saved?.operations.length??0)>=128||(input.operation==='define'?(saved?.contracts.length??0)>=32:(saved?.attempts.length??0)>=64))return fail('MEMORY_CONSOLIDATION_REVIEW_REQUIRED');
   const evidence=input.operation==='define'?[...input.contract.authority.sourceRefs,...input.contract.method.lookups.map(l=>l.source)]:[...input.evidenceRefs,...(input.checks.externalization?.target?[input.checks.externalization.target]:[])];
   let evidenceAvailable=evidence.length>0;
   try{await p.validate(evidence,true);}catch(error){
    if(error instanceof MemoryControllerError&&error.code==='MEMORY_SCOPE_MISMATCH')throw error;
    evidenceAvailable=false;
   }
   const now=new Date().toISOString();
   let next:State;
   if(input.operation==='define'){
    const entry={digest:disclosureDigest(input.contract),recordRevision:input.expectedRevision,at:now,owner:p.owner,contract:input.contract};
    next=saved?{...saved,memory:{kind:'memory',id:input.memoryId,revision:input.expectedRevision},contracts:[...saved.contracts,entry]}:
      {version:1,rootId:p.owner.rootId,workspaceKey:p.owner.workspaceKey,memory:{kind:'memory',id:input.memoryId,revision:input.expectedRevision},contracts:[entry],attempts:[],operations:[],guidanceDisposition:'retain'};
   }else{
    if(!saved)return fail('MEMORY_OPERATION_CONFLICT');
    if(saved.contracts.at(-1)!.recordRevision!==input.expectedRevision)return fail('MEMORY_REVISION_CONFLICT');
    const evaluated=outcome(input,saved.contracts.at(-1)!.contract,evidenceAvailable,now);
    const entry={...input,...evaluated,requestedOutcome:input.outcome,contractDigest:saved.contracts.at(-1)!.digest,recordRevision:input.expectedRevision,at:now,owner:p.owner,semanticSupport:'controller-assessed' as const};
    const {operation:_operation,memoryId:_id,expectedRevision:_revision,expectedReviewRevision:_review,...attempt}=entry;
    next={...saved,attempts:[...saved.attempts,attempt],guidanceDisposition:['supported','contradicted'].includes(evaluated.outcome)?input.disposition:saved.guidanceDisposition};
   }
   next.operations.push({id:input.operationId,payloadDigest});
   return{p,key,saved:claimReviewStateSchema.parse(next),duplicate:false};
  });
  await assertCurrent?.();
  const committed=await this.store.transact([...prepared.p.dependencies.keys()],snapshot=>{
   prepared.p.assert(snapshot);
   const record=snapshot.records.find(r=>r.id===input.memoryId);
   if(!record||!prepared.duplicate&&memorySemanticRevision(record)!==input.expectedRevision)return fail('MEMORY_REVISION_CONFLICT');
   return{records:snapshot.records,touchedIds:[],stateWrites:prepared.duplicate?[]:[{key:prepared.key,content:stableDisclosureJson(prepared.saved)+'\n'}],validateSources:async()=>{await assertCurrent?.();},result:prepared.saved!};
  });
  await assertCurrent?.();
  return{operationId:input.operationId,duplicate:prepared.duplicate,revision:disclosureDigest(committed.result),
   ...(input.operation==='attempt'?{outcome:committed.result.attempts.find(a=>a.operationId===input.operationId)?.outcome}:{}),
   guidanceDisposition:committed.result.guidanceDisposition,semanticSupport:'controller-assessed',executionAuthority:false};
 }
}
