import {applyTemporalTransition,temporalTransitionInputSchema} from './temporal.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {archiveJsonKey,type ArchiveManifest} from './archive.js';
import {uniqueSourceRefs} from './capsule.js';
import {findConsolidationCandidates} from './consolidation.js';
import {disclosureDigest,memorySemanticRevision,MemoryControllerError,semanticMemoryValue,stableDisclosureJson} from './disclosure.js';
import type {ControllerScope,MemoryControllerErrorCode} from './disclosure.js';
import {digestSchema,isoInstantSchema,recordExperienceSchema,safeIdSchema,sourceRefSchema} from './experience-types.js';
import type {SourceRef} from './experience-types.js';
import type {MemoryEpisodes,PromotionContext} from './episodes.js';
import type {MemoryIndex} from './index.js';
import {normalizeRecord,v2MetadataSchema} from './note-format.js';
import {scanMemorySafety} from './safety.js';
import type {FileMemoryStore} from './store.js';
import {fingerprintText} from './transaction.js';
import type {MemoryRecord,MemoryRecordV2} from './types.js';

const identity=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const text=z.string().min(1).refine(value=>/\S/.test(value)&&Array.from(value).length<=200_000);
const refs=z.array(sourceRefSchema).max(64);
const link=z.strictObject({targetId:safeIdSchema,type:z.enum(['related','supports','contradicts','derived-from']).optional(),strength:z.number().min(0).max(1).optional(),reason:text.optional()});
/** Full proposed semantic value; engine owns IDs, timestamps, workspace and audit history. */
const valueSchema=z.strictObject({content:text,title:z.string().optional(),keywords:z.array(z.string()).max(64).optional(),context:z.string().optional(),tags:z.array(z.string()).max(64).optional(),category:z.string().optional(),links:z.array(link).max(32).optional(),source:v2MetadataSchema.shape.source,provenance:v2MetadataSchema.shape.provenance,expiresAt:isoInstantSchema.optional(),experience:recordExperienceSchema});
const base={actionId:safeIdSchema,inputRefs:refs.min(1),reason:text};
const target=sourceRefSchema.refine(ref=>ref.kind==='memory');
const actionSchema=z.discriminatedUnion('kind',[
 z.strictObject({...base,kind:z.literal('create'),value:valueSchema}),
 z.strictObject({...base,kind:z.literal('amend'),target,value:valueSchema}),
 z.strictObject({...base,kind:z.literal('merge'),target:target.optional(),value:valueSchema,assertions:z.array(z.strictObject({text,inputRefs:refs.min(1)})).min(1).max(1000)}),
 z.strictObject({...base,kind:z.literal('retain')}),z.strictObject({...base,kind:z.literal('conflict')}),
 z.strictObject({...base,kind:z.literal('supersede'),...temporalTransitionInputSchema.shape}),
]);
const proposalSchema=z.strictObject({actions:z.array(actionSchema).min(1).max(100)}).refine(p=>new Set(p.actions.map(a=>a.actionId)).size===p.actions.length);
const inputSchema=z.strictObject({episodeId:safeIdSchema,expectedRevision:z.number().int().positive(),operationId:identity,proposal:z.unknown()});
const applySchema=z.strictObject({planId:safeIdSchema,expectedPlanDigest:digestSchema,operationId:identity});
export type ConsolidationInput=z.infer<typeof inputSchema>;
export type ApplyConsolidationInput=z.infer<typeof applySchema>;
export type ConsolidationProposal=z.infer<typeof proposalSchema>;
type ProposalAction=ConsolidationProposal['actions'][number];
const ownerSchema=z.strictObject({rootId:safeIdSchema,workspaceKey:z.string(),taskId:identity});
const transitionAuditSchema=z.strictObject({before:z.array(sourceRefSchema).length(2),after:z.array(sourceRefSchema).length(2),evidence:refs.min(1),effectiveAt:isoInstantSchema,recordedAt:isoInstantSchema,reason:text,outcome:z.enum(['superseded','conflicted'])});
const transitionSchema=z.strictObject({outcome:z.enum(['superseded','conflicted']),records:z.tuple([v2MetadataSchema,v2MetadataSchema]),audit:transitionAuditSchema});
const preparedActionSchema=z.strictObject({actionId:safeIdSchema,kind:z.enum(['create','amend','merge','retain','conflict','supersede']),transition:transitionSchema.optional(),inputRefs:z.array(sourceRefSchema),reason:text,convergedIntoActionId:safeIdSchema.optional(),target:sourceRefSchema.optional(),record:v2MetadataSchema.optional(),assertions:z.array(z.strictObject({text,inputRefs:refs.min(1)})).optional(),automatic:z.boolean()});
const candidateSchema=z.strictObject({leftId:safeIdSchema,rightId:safeIdSchema,semanticSimilarity:z.number(),lexicalJaccard:z.number(),combinedScore:z.number(),recommendation:z.enum(['review-merge','review-overlap'])});
const planSchema=z.strictObject({schemaVersion:z.literal(1),id:safeIdSchema,digest:digestSchema,episodeId:safeIdSchema,episodeRevision:z.number().int().positive(),scope:ownerSchema,createdAt:isoInstantSchema,
 readSet:z.array(z.strictObject({source:sourceRefSchema,requireCurrent:z.boolean()})),actions:z.array(preparedActionSchema),warnings:z.array(z.string()),candidates:z.array(candidateSchema),reviewRequired:z.boolean(),snapshotDigest:digestSchema,status:z.enum(['pending','applied','stale','rejected'])});
export type ConsolidationPlan=Omit<z.infer<typeof planSchema>,'actions'> & {actions:Array<Omit<z.infer<typeof preparedActionSchema>,'record'|'transition'> & {record?:MemoryRecordV2;transition?:import('./temporal.js').TemporalTransitionPlan}>};
function actionOutputs(action:ConsolidationPlan['actions'][number]):Array<{record:MemoryRecordV2;target?:SourceRef}>{return action.transition?action.transition.records.map((record,i)=>({record,target:action.transition!.audit.before[i]})):action.record?[{record:action.record,target:action.target}]:[];}
const receiptResultSchema=z.strictObject({planId:safeIdSchema,receiptId:safeIdSchema,canonicalRefs:z.array(sourceRefSchema),episodeRevision:z.number().int().positive(),auditRef:sourceRefSchema,duplicate:z.boolean(),indexStatus:z.enum(['current','degraded'])});
export type PromotionReceipt=z.infer<typeof receiptResultSchema>;
const reviewSchema=z.strictObject({digest:digestSchema,reviewer:text,reason:text});
export type ConsolidationReview=z.infer<typeof reviewSchema>;
/** Host configuration, never controller proposal data. Approval is not semantic proof. */
export interface ConsolidationPolicy {allowExactDuplicates?:boolean;review?:(plan:ConsolidationPlan)=>Promise<ConsolidationReview|null>}
const dependenciesSchema=z.array(z.tuple([z.string(),digestSchema.nullable()]));
const savedSchema=z.strictObject({plan:planSchema,dependencies:dependenciesSchema,activationDigest:digestSchema,eligibleIds:z.array(safeIdSchema),receipt:receiptResultSchema.optional()});
type Saved=z.infer<typeof savedSchema>;
const operationSchema=z.strictObject({schemaVersion:z.literal(1),owner:ownerSchema,method:z.enum(['prepareConsolidation','applyConsolidation']),operationId:identity,payloadDigest:digestSchema,result:z.unknown()});
/** Internal transfer validator; no additional host authority. */
export const promotionPersistenceSchemas = { saved:savedSchema, operation:operationSchema };
/** Reference inspection view only; persisted bytes are never rewritten.
 * A saved/returned plan describes future transition outputs. Its audit.after
 * refs become retained sources only when the applied receipt/archive publishes
 * them. Inputs, lineage, saved receipts and applied audit outputs stay required. */
export function promotionTransferReferenceView(raw:unknown,kind:'saved'|'prepare-operation'):unknown {
 const value=kind==='saved'?savedSchema.parse(raw):operationSchema.parse(raw);
 if(kind==='prepare-operation'&&'method'in value&&value.method!=='prepareConsolidation')throw new Error('MEMORY_SOURCE_UNAVAILABLE');
 const plan=kind==='saved'?(value as Saved).plan:planSchema.parse((value as z.infer<typeof operationSchema>).result);
 if(plan.digest!==planDigest(plan as ConsolidationPlan))fail('MEMORY_SOURCE_UNAVAILABLE');
 if(kind==='saved'){
  const saved=value as Saved;
  if(plan.snapshotDigest!==disclosureDigest([saved.dependencies,saved.activationDigest,saved.eligibleIds]))fail('MEMORY_SOURCE_UNAVAILABLE');
 }
 for(const action of plan.actions)if(action.transition){
  const {records,audit}=action.transition;
  const projected=records.map(record=>({kind:'memory' as const,id:record.id,revision:memorySemanticRevision(record as MemoryRecordV2)}));
  if(action.kind!=='supersede'||records[0].id===records[1].id||records.some(record=>record.pinned||record.provenance?.workspace!==plan.scope.workspaceKey)
    ||audit.before.some((ref,i)=>ref.kind!=='memory'||ref.id!==records[i]!.id)
    ||stableDisclosureJson(audit.after)!==stableDisclosureJson(projected))fail('MEMORY_SOURCE_UNAVAILABLE');
 }
 const inspection=structuredClone(value) as any;
 const inspectedPlan=structuredClone(plan) as any;
 for(const action of inspectedPlan.actions)if(action.transition)delete action.transition.audit.after;
 if(kind==='saved')inspection.plan=inspectedPlan;else inspection.result=inspectedPlan;
 return inspection;
}
const json=(value:unknown)=>stableDisclosureJson(value)+'\n';
const bytesDigest=(value:string)=>`sha256:${fingerprintText(value)}`;
function fail(code:MemoryControllerErrorCode):never {throw new MemoryControllerError(code);}
function parse<T>(schema:z.ZodType<T>,raw:unknown):T {const result=schema.safeParse(raw);if(!result.success)fail('MEMORY_CONSOLIDATION_INVALID');return result.data!;}
function safe(value:unknown):void {
 const strings:string[]=[];
 const walk=(item:unknown):void=>{if(typeof item==='string')strings.push(item);else if(Array.isArray(item))item.forEach(walk);else if(item&&typeof item==='object')Object.entries(item).forEach(([key,value])=>{strings.push(key);walk(value);});};walk(value);
 if(strings.some(s=>s.includes('\0')||Buffer.from(s,'utf8').toString('utf8')!==s)||scanMemorySafety(strings.join('\n')).length)fail('MEMORY_CONSOLIDATION_INVALID');
}
function planDigest(plan:Omit<ConsolidationPlan,'digest'>|ConsolidationPlan):string {const {status,...body}=plan;delete (body as Partial<ConsolidationPlan>).digest;return disclosureDigest(['consolidation-plan/v1',body]);}
function opKey(owner:PromotionContext['owner'],method:string,id:string){return `operations/${disclosureDigest(['promotion-operation/v1',owner,method,id]).slice(7)}.json`;}
const planKey=(id:string)=>`consolidation/${id}.json`;
function assertScope(actual:unknown,expected:unknown){if(stableDisclosureJson(actual)!==stableDisclosureJson(expected))fail('MEMORY_SCOPE_MISMATCH');}
function replay<T>(content:string|null,owner:PromotionContext['owner'],method:'prepareConsolidation'|'applyConsolidation',id:string,payload:string,schema:z.ZodType<T>):T|undefined{
 if(content===null)return;
 let receipt;try{receipt=operationSchema.parse(JSON.parse(content));}catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
 assertScope(receipt.owner,owner);if(receipt.method!==method||receipt.operationId!==id||receipt.payloadDigest!==payload)fail('MEMORY_OPERATION_CONFLICT');
 try{return schema.parse(receipt.result);}catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
}
function operation(owner:PromotionContext['owner'],method:string,operationId:string,payloadDigest:string,result:unknown){return json({schemaVersion:1,owner,method,operationId,payloadDigest,result});}
function semanticValue(record:MemoryRecordV2):unknown {
 // Strict equality includes every applicability/epistemic/validity field. Only lineage is additive.
 const {sourceRefs,...experience}=record.experience;
 return {title:record.title,content:record.content,keywords:record.keywords,context:record.context,tags:record.tags,category:record.category,links:record.links,source:record.source,provenance:record.provenance,expiresAt:record.expiresAt,experience};
}
/** Controller proposals cannot claim a verifier ran; persistence parsing remains unchanged. */
function assertControllerVerification(verification:MemoryRecordV2['experience']['verification']):void {
 if(verification.status==='verified'||verification.method!==undefined||verification.verifierRevision!==undefined||verification.verifiedAt!==undefined)fail('MEMORY_CONSOLIDATION_INVALID');
}
/** Check action lineage, never unrelated scoped candidates in the complete plan read set. */
async function assertActionHypotheses(p:PromotionContext,lineage:SourceRef[],record:MemoryRecordV2):Promise<void> {
 for(const ref of lineage.filter(ref=>ref.kind==='memory')){
  const source=await p.memory(ref);
  if(source.version===2&&source.experience.epistemic==='hypothesis'&&record.experience.epistemic!=='hypothesis')fail('MEMORY_CONSOLIDATION_INVALID');
 }
}
/** Internal evidence selector for existing immutable promotion audits.
 * The full sourceRefs graph remains authoritative for access/CAS. Comparison
 * candidates and implicit episode baselines are not evidence for the actions.
 */
export function promotionEpistemicRefs(manifest:ArchiveManifest):SourceRef[] {
 const schema=z.strictObject({owner:ownerSchema,planId:safeIdSchema,planDigest:digestSchema,
  actions:z.array(preparedActionSchema).min(1).max(100),canonicalRefs:z.array(sourceRefSchema),
  review:reviewSchema.optional(),automation:z.literal('exact-duplicate-or-retained-only').optional()});
 const parsed=schema.safeParse(manifest.details);
 if(!parsed.success)fail('MEMORY_SOURCE_UNAVAILABLE');
 const details=parsed.data,outputs:SourceRef[]=[];
 const seen=new Map<string,z.infer<typeof preparedActionSchema>>();
 for(const action of details.actions){
  if(seen.has(action.actionId)||!action.inputRefs.length)fail('MEMORY_SOURCE_UNAVAILABLE');
  const outputOwner=action.convergedIntoActionId?seen.get(action.convergedIntoActionId):undefined;
  seen.set(action.actionId,action);
  if(action.kind==='supersede'){
   const t=action.transition;if(!t||action.record||action.target||action.assertions||action.convergedIntoActionId||action.automatic||t.outcome!==t.audit.outcome||action.reason!==t.audit.reason)fail('MEMORY_SOURCE_UNAVAILABLE');
   const expectedLink=t.outcome==='superseded'?'supersedes':'contradicts';
   if(!t.records[1].links.some(link=>link.type===expectedLink&&link.targetId===t.records[0].id&&link.validFrom===t.audit.effectiveAt&&link.createdAt===t.audit.recordedAt&&link.reason===t.audit.reason.trim()))fail('MEMORY_SOURCE_UNAVAILABLE');
   if(t.outcome==='superseded'&&(t.records[0].experience.validity.state!=='known'||t.records[0].experience.validity.to?.precision!=='instant'||t.records[0].experience.validity.to.value!==t.audit.effectiveAt||t.records[1].experience.validity.state!=='known'||t.records[1].experience.validity.from?.precision!=='instant'||t.records[1].experience.validity.from.value!==t.audit.effectiveAt))fail('MEMORY_SOURCE_UNAVAILABLE');
   let after:SourceRef[];try{after=t.records.map(record=>{if(typeof record.content!=='string')fail('MEMORY_SOURCE_UNAVAILABLE');return{kind:'memory' as const,id:record.id,revision:memorySemanticRevision(normalizeRecord(record,record.content))};});}catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
   if(stableDisclosureJson(after)!==stableDisclosureJson(t.audit.after)||t.audit.before.some((ref,i)=>ref.kind!=='memory'||ref.id!==t.records[i].id)||t.records[0].id===t.records[1].id)fail('MEMORY_SOURCE_UNAVAILABLE');
   outputs.push(...after);continue;
  }
  if(action.transition)fail('MEMORY_SOURCE_UNAVAILABLE');
  if(action.kind==='retain'||action.kind==='conflict'){
   if(action.record||action.target||action.assertions||action.convergedIntoActionId||!action.automatic)fail('MEMORY_SOURCE_UNAVAILABLE');
   continue;
  }
  if(action.convergedIntoActionId){
   // The writer only converges creates onto an earlier, new output-owning action.
   // A dangling marker, cycle or chain cannot stand in for missing output bytes.
   if(action.kind!=='create'||action.record||action.target||action.assertions||!action.automatic||!outputOwner?.record||outputOwner.target||outputOwner.convergedIntoActionId)fail('MEMORY_SOURCE_UNAVAILABLE');
   continue;
  }
  if(!action.record||(action.kind==='amend'&&!action.target)||
   (action.target&&(action.target.kind!=='memory'||action.target.id!==action.record.id))||
   (action.kind==='merge'?!action.assertions?.length:action.assertions!==undefined))fail('MEMORY_SOURCE_UNAVAILABLE');
  if(typeof action.record.content!=='string')fail('MEMORY_SOURCE_UNAVAILABLE');
  let record:MemoryRecord;
  try{record=normalizeRecord(action.record,action.record.content);}catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
  outputs.push({kind:'memory',id:record.id,revision:memorySemanticRevision(record)});
 }
 const sorted=(refs:SourceRef[])=>refs.map(stableDisclosureJson).sort();
 if(stableDisclosureJson(sorted(outputs))!==stableDisclosureJson(sorted(details.canonicalRefs)))fail('MEMORY_SOURCE_UNAVAILABLE');
 const refs=uniqueSourceRefs([...outputs,...details.actions.flatMap(action=>[
  ...action.inputRefs,...(action.transition?[...action.transition.audit.before,...action.transition.audit.evidence,...action.transition.records.flatMap(r=>[...r.experience.sourceRefs,...r.experience.verification.evidence])]:[]),...(action.target?[action.target]:[]),...(action.assertions??[]).flatMap(assertion=>assertion.inputRefs),
  ...(action.record?[...action.record.experience.sourceRefs,...action.record.experience.verification.evidence]:[]),
 ])]);
 const complete=new Set(manifest.sourceRefs.map(stableDisclosureJson));
 if(refs.some(ref=>!complete.has(stableDisclosureJson(ref))))fail('MEMORY_SOURCE_UNAVAILABLE');
 return refs;
}
function recordFor(action:Extract<ProposalAction,{value:unknown}>,p:PromotionContext,now:string,prior?:MemoryRecord):MemoryRecordV2 {
 const value=action.value;
 assertControllerVerification(value.experience.verification);
 if(value.experience.sourceRefs.length>64||value.experience.verification.evidence.length>64)fail('MEMORY_CONSOLIDATION_INVALID');
 if(value.provenance?.workspace&&value.provenance.workspace!==p.owner.workspaceKey)fail('MEMORY_SCOPE_MISMATCH');
 const candidate={...(prior?structuredClone(prior):{version:2,id:randomUUID(),createdAt:now,lastAccessedAt:null,retrievalCount:0,evolutionHistory:[],pinned:false}),
  title:value.title,content:value.content,keywords:value.keywords??[],context:value.context??'',tags:value.tags??[],category:value.category??'general',links:(value.links??[]).map(l=>({...l,type:l.type??'related',strength:l.strength??0.5,createdAt:now})),source:value.source,
  provenance:{...value.provenance,workspace:p.owner.workspaceKey,files:value.provenance?.files??[]},expiresAt:value.expiresAt,updatedAt:now,
  experience:{...structuredClone(value.experience),sourceRefs:uniqueSourceRefs([...value.experience.sourceRefs,...action.inputRefs,...(prior?.version===2?prior.experience.sourceRefs:[])])}};
 try{return normalizeRecord(candidate,value.content) as MemoryRecordV2;}catch{return fail('MEMORY_CONSOLIDATION_INVALID');}
}

/** Preview and CAS commit use the existing episode/store/archive owners, with no nested writer lock. */
export class MemoryPromotion {
 constructor(private store:FileMemoryStore,private episodes:MemoryEpisodes,private index:MemoryIndex,private policy:ConsolidationPolicy,private refresh:()=>Promise<'current'|'degraded'>){}
 async prepare(scope:ControllerScope,raw:ConsolidationInput):Promise<ConsolidationPlan>{
  const input=parse(inputSchema,raw);let rawProposal=input.proposal;
  if(typeof rawProposal==='string'){try{rawProposal=JSON.parse(rawProposal);}catch{fail('MEMORY_CONSOLIDATION_INVALID');}}
  const proposal=parse(proposalSchema,rawProposal);safe({...input,proposal});
  const payload=disclosureDigest(['prepareConsolidation/v1',input.episodeId,proposal]);
  const prepared=await this.episodes.promotionSnapshot(scope,async p=>{
   if(proposal.actions.some(a=>a.kind==='supersede'))p.enableTemporal();
   const key=opKey(p.owner,'prepareConsolidation',input.operationId),prior=replay(await p.read(key),p.owner,'prepareConsolidation',input.operationId,payload,planSchema);
   if(prior){
    await p.validate(prior.readSet.map(entry=>entry.source));
    let saved;try{saved=savedSchema.parse(JSON.parse((await p.read(planKey(prior.id)))??''));}catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
    if(saved.receipt)await p.validate(saved.receipt.canonicalRefs);
    return{replay:prior as ConsolidationPlan};
   }
   const episode=await p.episode(input.episodeId);if(episode.header.revision!==input.expectedRevision)fail('MEMORY_REVISION_CONFLICT');
   const now=new Date().toISOString(),actions:ConsolidationPlan['actions']=[],readSet:ConsolidationPlan['readSet']=[{source:episode.ref,requireCurrent:true}];
   const eligible=p.eligible(p.records);
   const candidates:ConsolidationPlan['candidates']=[];
   // Candidate comparison/duplicate absence is part of the engine read set, not caller-supplied CAS.
   for(const record of eligible)readSet.push({source:{kind:'memory',id:record.id,revision:memorySemanticRevision(record)},requireCurrent:true});
   const targets=new Set<string>();
   for(const action of proposal.actions){
    const allRefs=uniqueSourceRefs([...action.inputRefs,...(action.kind==='supersede'?[action.predecessor,action.successor,...action.evidence]:[]),...('value'in action?[...action.value.experience.sourceRefs,...action.value.experience.verification.evidence]:[]),...('target'in action&&action.target?[action.target]:[]),...(action.kind==='merge'?action.assertions.flatMap(a=>a.inputRefs):[])]);
    if(allRefs.length>64)fail('MEMORY_CONSOLIDATION_INVALID');
    await p.validate(allRefs);if('value'in action&&action.value.experience.verification.status==='supported')await p.validate(action.value.experience.verification.evidence,true);
    const lineage=await p.lineage(allRefs);
    for(const ref of lineage)readSet.push({source:ref,requireCurrent:false});
    if(action.kind==='supersede'){
     await p.validate(action.evidence,true);
     const transition=applyTemporalTransition({predecessor:action.predecessor,successor:action.successor,effectiveAt:action.effectiveAt,evidence:action.evidence,reason:action.reason},{records:eligible,evidence:await p.temporalEvidence(action.evidence),referenceTime:now});
     for(const record of transition.records){if(targets.has(record.id))fail('MEMORY_CONSOLIDATION_INVALID');targets.add(record.id);await assertActionHypotheses(p,await p.epistemicLineage(allRefs),record);}
     actions.push({actionId:action.actionId,kind:'supersede',inputRefs:action.inputRefs,reason:action.reason,automatic:false,transition});continue;
    }
    if(action.kind==='retain'||action.kind==='conflict'){actions.push({...action,automatic:true});continue;}
    let existing:MemoryRecord|undefined;
    if('target'in action&&action.target){existing=p.visible(action.target.id);if(existing.pinned)fail('MEMORY_CONSOLIDATION_INVALID');if(memorySemanticRevision(existing)!==action.target.revision)fail('MEMORY_REVISION_CONFLICT');}
    let record=recordFor(action,p,now,existing);
    await assertActionHypotheses(p,await p.epistemicLineage(allRefs),record);
    if(action.kind==='merge'){
     if(action.assertions.map(a=>a.text).join('\n')!==record.content)fail('MEMORY_CONSOLIDATION_INVALID');
     const inputs=new Set(action.inputRefs.map(stableDisclosureJson));if(action.assertions.some(a=>a.inputRefs.some(ref=>!inputs.has(stableDisclosureJson(ref)))))fail('MEMORY_CONSOLIDATION_INVALID');
    }
    // Current link endpoints are dependencies too; supersession has no route through this phase.
    for(const l of record.links){const linked=p.visible(l.targetId);readSet.push({source:{kind:'memory',id:linked.id,revision:memorySemanticRevision(linked)},requireCurrent:true});}
    let automatic=false;
    const identical=action.kind==='create'?eligible.filter(r=>{try{return p.visible(r.id)===r;}catch{return false;}}).find(r=>r.version===2&&stableDisclosureJson(semanticValue(r))===stableDisclosureJson(semanticValue(record))):existing?.version===2&&stableDisclosureJson(semanticValue(existing))===stableDisclosureJson(semanticValue(record))?existing:undefined;
    if(identical&&identical.version===2){existing=identical;record={...structuredClone(identical),updatedAt:now,experience:{...structuredClone(identical.experience),sourceRefs:uniqueSourceRefs([...identical.experience.sourceRefs,...record.experience.sourceRefs])}};automatic=true;}
    const samePlan=action.kind==='create'&&!existing?actions.find(a=>a.record&&!a.target&&stableDisclosureJson(semanticValue(a.record))===stableDisclosureJson(semanticValue(record))):undefined;
    if(samePlan?.record){
     samePlan.record.experience.sourceRefs=uniqueSourceRefs([...samePlan.record.experience.sourceRefs,...record.experience.sourceRefs]);
     actions.push({actionId:action.actionId,kind:action.kind,inputRefs:action.inputRefs,reason:action.reason,automatic:true,convergedIntoActionId:samePlan.actionId});continue;
    }
    if(targets.has(record.id))fail('MEMORY_CONSOLIDATION_INVALID');targets.add(record.id);
    const targetRef=existing?{kind:'memory' as const,id:existing.id,revision:memorySemanticRevision(existing)}:undefined;
    actions.push({actionId:action.actionId,kind:action.kind,inputRefs:action.inputRefs,reason:action.reason,...(targetRef?{target:targetRef}:{}),record,automatic,...(action.kind==='merge'?{assertions:action.assertions}:{})});
   }
   const readMap=new Map<string,ConsolidationPlan['readSet'][number]>();for(const entry of readSet){const key=stableDisclosureJson(entry.source),before=readMap.get(key);readMap.set(key,{source:entry.source,requireCurrent:entry.requireCurrent||Boolean(before?.requireCurrent)});}
   const dependencies=[...p.dependencies].filter(([key])=>!key.startsWith('operations/')).map(([key,content])=>[key,content===null?null:bytesDigest(content)] as [string,string|null]);
   const activationDigest=disclosureDigest(p.activation),reviewRequired=actions.some(a=>a.transition||a.record&&(!a.automatic||!this.policy.allowExactDuplicates));
   const base={schemaVersion:1 as const,id:randomUUID(),episodeId:input.episodeId,episodeRevision:episode.header.revision,scope:p.owner,createdAt:now,readSet:[...readMap.values()],actions,warnings:['memory-is-advisory','source-resolution-is-not-semantic-verification',...(reviewRequired?['host-review-required']:[])],candidates,reviewRequired,snapshotDigest:disclosureDigest([dependencies,activationDigest,eligible.map(r=>r.id).sort()]),status:'pending' as const};
   const plan:ConsolidationPlan={...base,digest:planDigest(base)};
   return{p,key,plan,dependencies,activationDigest,eligibleIds:eligible.map(r=>r.id).sort(),eligible};
  });
  if('replay'in prepared)return prepared.replay!;
  const {p,key,plan,dependencies,activationDigest,eligibleIds,eligible}=prepared;
  // Optional index comparison runs after the scoped snapshot lock is released.
  plan.candidates=await findConsolidationCandidates(eligible,this.index);
  plan.digest=planDigest(plan);
  const saved={plan,dependencies,activationDigest,eligibleIds};
  const writes=[{key:planKey(plan.id),content:json(saved)},{key,content:operation(p.owner,'prepareConsolidation',input.operationId,payload,plan)}];
  return (await this.store.transact([...new Set([...p.dependencies.keys(),...writes.map(w=>w.key)])],snapshot=>{
   const prior=replay(snapshot.state.get(key)!.content,p.owner,'prepareConsolidation',input.operationId,payload,planSchema);
   if(prior)return{records:snapshot.records,touchedIds:[],stateWrites:[],result:prior as ConsolidationPlan};
   p.assert(snapshot);this.assertCurrent(plan,snapshot.records,p);
   if(stableDisclosureJson(p.eligible(snapshot.records).map(r=>r.id).sort())!==stableDisclosureJson(eligibleIds))fail('MEMORY_REVISION_CONFLICT');
   return{records:snapshot.records,touchedIds:[],stateWrites:writes,result:plan};
  })).result;
 }
 private assertCurrent(plan:ConsolidationPlan,records:MemoryRecord[],p:PromotionContext):void{
  for(const action of plan.actions)if(!action.transition&&action.target)p.visible(action.target.id);
  for(const entry of plan.readSet.filter(r=>r.requireCurrent&&r.source.kind==='memory')){const record=records.find(r=>r.id===entry.source.id);if(!record||memorySemanticRevision(record)!==entry.source.revision)fail('MEMORY_REVISION_CONFLICT');}
 }
 async apply(scope:ControllerScope,raw:ApplyConsolidationInput):Promise<PromotionReceipt>{
  const input=parse(applySchema,raw);safe(input);const payload=disclosureDigest(['applyConsolidation/v1',input.planId,input.expectedPlanDigest]);
  const prepared=await this.episodes.promotionSnapshot(scope,async p=>{
   const key=opKey(p.owner,'applyConsolidation',input.operationId),prior=replay(await p.read(key),p.owner,'applyConsolidation',input.operationId,payload,receiptResultSchema);
   if(prior)return{replay:prior};
   let saved;try{saved=savedSchema.parse(JSON.parse((await p.read(planKey(input.planId)))??''));}catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
   const plan=saved.plan as ConsolidationPlan;if(plan.actions.some(a=>a.kind==='supersede'))p.enableTemporal();assertScope(plan.scope,p.owner);
   if(plan.id!==input.planId||plan.digest!==planDigest(plan))fail('MEMORY_SOURCE_UNAVAILABLE');
   if(plan.digest!==input.expectedPlanDigest)fail('MEMORY_OPERATION_CONFLICT');
   if(saved.receipt)return{alreadyApplied:saved.receipt,p,key,plan,saved};
   if(plan.status!=='pending')fail('MEMORY_OPERATION_CONFLICT');
   if(disclosureDigest([saved.dependencies,saved.activationDigest,saved.eligibleIds])!==plan.snapshotDigest)fail('MEMORY_SOURCE_UNAVAILABLE');
   if(saved.activationDigest!==disclosureDigest(p.activation))fail('MEMORY_REVISION_CONFLICT');
   for(const [dependency,digest] of saved.dependencies){const content=await p.read(dependency);if((content===null?null:bytesDigest(content))!==digest)fail('MEMORY_REVISION_CONFLICT');}
   const episode=await p.episode(plan.episodeId);if(episode.header.revision!==plan.episodeRevision)fail('MEMORY_REVISION_CONFLICT');
   this.assertCurrent(plan,p.records,p);
   await p.validate(plan.readSet.map(r=>r.source));
   for(const action of plan.actions){
    if((action.kind==='supersede')!==Boolean(action.transition))fail('MEMORY_CONSOLIDATION_INVALID');
    if(action.transition&&(action.record||action.target||action.assertions||action.convergedIntoActionId||action.automatic))fail('MEMORY_CONSOLIDATION_INVALID');
    if(action.transition){
     const t=action.transition;
     const rebuilt=applyTemporalTransition({predecessor:t.audit.before[0]!,successor:t.audit.before[1]!,effectiveAt:t.audit.effectiveAt,evidence:t.audit.evidence,reason:action.reason},{records:p.eligible(p.records),evidence:await p.temporalEvidence(t.audit.evidence),referenceTime:t.audit.recordedAt});
     const comparable=(value:typeof rebuilt)=>({...value,records:value.records.map(semanticMemoryValue)});
     if(stableDisclosureJson(comparable(rebuilt))!==stableDisclosureJson(comparable(t)))fail('MEMORY_CONSOLIDATION_INVALID');
     for(const record of t.records)await assertActionHypotheses(p,await p.epistemicLineage([...action.inputRefs,...t.audit.before,...t.audit.evidence]),record);
     await p.validate(t.audit.evidence,true);continue;
    }
    if(!action.record)continue;
    // Recheck saved pending plans too, including previews produced by an older writer.
    assertControllerVerification(action.record.experience.verification);
    const refs=[...action.inputRefs,...action.record.experience.sourceRefs,...action.record.experience.verification.evidence,...(action.target?[action.target]:[]),...(action.assertions??[]).flatMap(assertion=>assertion.inputRefs)];
    await assertActionHypotheses(p,await p.epistemicLineage(refs),action.record);
    if(action.record.experience.verification.status==='supported')await p.validate(action.record.experience.verification.evidence,true);
   }
   const eligibleIds=p.eligible(p.records).map(r=>r.id).sort();
   if(stableDisclosureJson(eligibleIds)!==stableDisclosureJson(saved.eligibleIds))fail('MEMORY_REVISION_CONFLICT');
   return{p,key,plan,saved,episode};
  });
  if('replay'in prepared)return this.refreshed({...prepared.replay!,duplicate:true});
  if('alreadyApplied'in prepared){
   const {p,key,plan,alreadyApplied}=prepared;
   const receipt={...alreadyApplied!,duplicate:true};
   const result=await this.store.transact([...p.dependencies.keys()],snapshot=>{
    const prior=replay(snapshot.state.get(key)!.content,p.owner,'applyConsolidation',input.operationId,payload,receiptResultSchema);
    if(prior)return{records:snapshot.records,touchedIds:[],stateWrites:[],result:{...prior,duplicate:true}};
    p.assert(snapshot);
    return{records:snapshot.records,touchedIds:[],stateWrites:[{key,content:operation(p.owner,'applyConsolidation',input.operationId,payload,receipt)}],result:receipt};
   });
   return this.refreshed(result.result);
  }
  const {p,key,plan,saved,episode}=prepared;
  let review:ConsolidationReview|undefined;
  if(plan.actions.some(a=>a.transition||a.record&&(!a.automatic||!this.policy.allowExactDuplicates))){
   if(!this.policy.review)fail('MEMORY_CONSOLIDATION_REVIEW_REQUIRED');
   // Callback receives an isolated copy. Its mutations cannot alter reviewed/published bytes.
   const result=await this.policy.review(structuredClone(plan));const parsed=reviewSchema.safeParse(result);
   if(!parsed.success||parsed.data.digest!==plan.digest)fail('MEMORY_CONSOLIDATION_REVIEW_REQUIRED');review=parsed.data;safe(review);
  }
  const receiptId=randomUUID(),auditId=`promotion-${receiptId}`;
  const canonicalRefs=plan.actions.flatMap(action=>actionOutputs(action).map(({record})=>({kind:'memory' as const,id:record.id,revision:memorySemanticRevision(record)})));
  const audit={schemaVersion:1,id:auditId,purpose:'promotion',sourceRefs:uniqueSourceRefs([...plan.readSet.map(r=>r.source),...canonicalRefs]),details:{owner:p.owner,planId:plan.id,planDigest:plan.digest,actions:plan.actions,canonicalRefs,...(review?{review}:{automation:'exact-duplicate-or-retained-only'})}};
  const auditContent=json(audit),auditRef:SourceRef={kind:'manifest',id:auditId,revision:bytesDigest(auditContent)};
  const publication=episode.publish(input.operationId,auditRef),receipt:PromotionReceipt={planId:plan.id,receiptId,canonicalRefs,episodeRevision:publication.header.revision,auditRef,duplicate:false,indexStatus:'current'};
  const writes=[{key:archiveJsonKey(auditId),content:auditContent},...publication.writes,{key:planKey(plan.id),content:json({...saved,plan:{...plan,status:'applied'},receipt})},{key,content:operation(p.owner,'applyConsolidation',input.operationId,payload,receipt)}];
  const committed=await this.store.transact([...new Set([...p.dependencies.keys(),...writes.map(w=>w.key)])],snapshot=>{
   const prior=replay(snapshot.state.get(key)!.content,p.owner,'applyConsolidation',input.operationId,payload,receiptResultSchema);
   if(prior)return{records:snapshot.records,touchedIds:[],stateWrites:[],result:{...prior,duplicate:true}};
   // Concurrent callers with another operation ID converge through the plan's committed receipt.
   let latest:Saved;try{latest=savedSchema.parse(JSON.parse(snapshot.state.get(planKey(plan.id))!.content!));}catch{return fail('MEMORY_SOURCE_UNAVAILABLE');}
   if(latest.receipt){if(latest.plan.digest!==plan.digest)fail('MEMORY_OPERATION_CONFLICT');return{records:snapshot.records,touchedIds:[],stateWrites:[{key,content:operation(p.owner,'applyConsolidation',input.operationId,payload,latest.receipt)}],result:{...latest.receipt,duplicate:true}};}
   p.assert(snapshot);this.assertCurrent(plan,snapshot.records,p);
   if(stableDisclosureJson(p.eligible(snapshot.records).map(r=>r.id).sort())!==stableDisclosureJson(saved.eligibleIds))fail('MEMORY_REVISION_CONFLICT');
   const records=structuredClone(snapshot.records),touchedIds:string[]=[];
   for(const action of plan.actions)for(const output of actionOutputs(action)){const index=records.findIndex(r=>r.id===output.record.id);if(!output.target&&index!==-1)fail('MEMORY_REVISION_CONFLICT');if(output.target&&index===-1)fail('MEMORY_REVISION_CONFLICT');
    const record=structuredClone(output.record);if(index>=0){const current=records[index];record.lastAccessedAt=current.lastAccessedAt;record.retrievalCount=current.retrievalCount;record.evolutionHistory=current.evolutionHistory;records[index]=record;}else records.push(record);touchedIds.push(record.id);
   }
   return{records,touchedIds,stateWrites:writes,result:receipt};
  });
  return this.refreshed(committed.result);
 }
 private async refreshed(receipt:PromotionReceipt):Promise<PromotionReceipt>{try{return{...receipt,indexStatus:await this.refresh()};}catch{return{...receipt,indexStatus:'degraded'};}}
}
