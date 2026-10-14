import {z} from 'zod';
import {normalizeRecord} from './note-format.js';
import {isoInstantSchema,recordExperience,timeValueSchema,sourceRefSchema} from './experience-types.js';
import type {SourceRef,TimeValue,TemporalAssertion} from './experience-types.js';
import {memorySemanticRevision,MemoryControllerError,stableDisclosureJson} from './disclosure.js';
import {isMemoryLinkActive} from './relations.js';
import type {MemoryRecord,MemoryRecordV2} from './types.js';

/** Exact times require an explicit zone. Partial/unknown input is never guessed. */
export function parseTimeValue(value:string,timezone?:string):TimeValue {
 const exact=isoInstantSchema.safeParse(value);if(exact.success)return{precision:'instant',value:exact.data};
 for(const precision of ['day','month','year'] as const){const result=timeValueSchema.safeParse({precision,value,...(timezone?{timezone}:{})});if(result.success)return result.data;}
 return{precision:'unknown',text:value};
}
export function exactInstant(value:string):string {const parsed=isoInstantSchema.safeParse(value);if(!parsed.success)throw new MemoryControllerError('MEMORY_INPUT_INVALID');return parsed.data;}
export interface TemporalCandidate {record:MemoryRecord;certainty:'known'|'unknown';conflicted:boolean;invalidatedBy:SourceRef[]}
/** Current evidence only: callers pass current semantic revisions, not historical content competitors. */
export function selectTemporalCandidates(records:MemoryRecord[],referenceTime:string):TemporalCandidate[] {
 const at=Date.parse(exactInstant(referenceTime));
 // Only linked owners can invalidate or explicitly contradict a candidate. Keep
 // inactive links too: historical invalidatedBy describes retained relationships.
 const supersedingOwners=records.filter(owner=>owner.links.some(link=>link.type==='supersedes'));
 const contradictingOwners=records.filter(owner=>owner.links.some(link=>link.type==='contradicts'));
 const candidates:TemporalCandidate[]=[];
 for(const record of records){
  const experience=recordExperience(record),validity=experience.validity;
  let certainty:TemporalCandidate['certainty']='unknown';
  if(experience.temporal==='atemporal')certainty='known';
  else if(validity.state==='known'){
   if(validity.from?.precision==='instant'&&Date.parse(validity.from.value)>at)continue;
   if(validity.to?.precision==='instant'&&Date.parse(validity.to.value)<=at)continue;
   if([validity.from,validity.to].every(t=>t===null||t.precision==='instant'))certainty='known';
  }
  const invalidators=supersedingOwners.filter(owner=>owner.id!==record.id&&compatibleTransitionRecords(record,owner)&&owner.links.some(link=>link.type==='supersedes'&&link.targetId===record.id));
  if(invalidators.some(owner=>owner.links.some(link=>link.type==='supersedes'&&link.targetId===record.id&&isMemoryLinkActive(link,at))))continue;
  const conflicted=contradictingOwners.some(owner=>owner.links.some(link=>link.type==='contradicts'&&isMemoryLinkActive(link,at)&&((link.targetId===record.id&&sameClaimScope(owner,record))||(owner.id===record.id&&records.some(target=>target.id===link.targetId&&sameClaimScope(record,target))))));
  candidates.push({record,certainty,conflicted,invalidatedBy:invalidators.map(ref)});
 }
 return candidates.sort((a,b)=>Number(a.certainty==='unknown')-Number(b.certainty==='unknown')||a.record.id.localeCompare(b.record.id));
}
function sameClaimScope(a:MemoryRecord,b:MemoryRecord):boolean{return a.version===2&&b.version===2&&a.provenance?.workspace===b.provenance?.workspace&&a.experience.epistemic===b.experience.epistemic&&a.experience.kind===b.experience.kind;}
function compatibleTransitionRecords(a:MemoryRecord,b:MemoryRecord):boolean {return a.version===2&&b.version===2&&sameClaimScope(a,b)&&a.experience.temporal==='dynamic'&&b.experience.temporal==='dynamic';}
export const temporalTransitionInputSchema=z.strictObject({predecessor:sourceRefSchema.refine(r=>r.kind==='memory'),successor:sourceRefSchema.refine(r=>r.kind==='memory'),effectiveAt:isoInstantSchema,evidence:z.array(sourceRefSchema).min(1).max(64),reason:z.string().min(1)});
export type TemporalTransitionInput=z.infer<typeof temporalTransitionInputSchema>;
export interface ResolvedTemporalEvidence {source:SourceRef;temporalAssertion?:TemporalAssertion}
export interface TemporalTransitionPlan {outcome:'superseded'|'conflicted';records:[MemoryRecordV2,MemoryRecordV2];audit:{before:SourceRef[];after:SourceRef[];evidence:SourceRef[];effectiveAt:string;recordedAt:string;reason:string;outcome:'superseded'|'conflicted'}}
const same=(a:unknown,b:unknown)=>stableDisclosureJson(a)===stableDisclosureJson(b);
const ref=(record:MemoryRecord):SourceRef=>({kind:'memory',id:record.id,revision:memorySemanticRevision(record)});
function invalid():never{throw new MemoryControllerError('MEMORY_CONSOLIDATION_INVALID');}
/** Pure planned mutation. Resolution, visibility, host review and CAS belong to promotion. */
export function applyTemporalTransition(raw:TemporalTransitionInput,context:{records:MemoryRecord[];evidence:ResolvedTemporalEvidence[];referenceTime:string}):TemporalTransitionPlan {
 const parsed=temporalTransitionInputSchema.safeParse(raw);if(!parsed.success)invalid();const input=parsed.data;
 const now=exactInstant(context.referenceTime),at=Date.parse(input.effectiveAt);
 if(input.predecessor.id===input.successor.id)invalid();
 const resolve=(source:SourceRef)=>{const record=context.records.find(r=>r.id===source.id);if(!record||record.version!==2||record.pinned||!same(ref(record),source))invalid();return record;};
 const a=resolve(input.predecessor),b=resolve(input.successor);
 if(!a.provenance?.workspace||a.provenance.workspace!==b.provenance?.workspace)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
 if(a.experience.temporal!=='dynamic'||b.experience.temporal!=='dynamic'||a.experience.epistemic!==b.experience.epistemic||a.experience.kind!==b.experience.kind)invalid();
 const visited=new Set<string>(),pending=[a.id];while(pending.length){const id=pending.pop()!;if(id===b.id)invalid();if(visited.has(id))continue;visited.add(id);const node=context.records.find(r=>r.id===id);if(!node)invalid();pending.push(...node.links.filter(l=>l.type==='supersedes').map(l=>l.targetId));}
 const av=a.experience.validity,bv=b.experience.validity;
 if(av.state==='known'&&((av.from?.precision==='instant'&&at<Date.parse(av.from.value))||(av.to?.precision==='instant'&&at>Date.parse(av.to.value))))invalid();
 if(bv.state==='known'&&((bv.from?.precision==='instant'&&at!==Date.parse(bv.from.value))||(bv.to?.precision==='instant'&&at>=Date.parse(bv.to.value))))invalid();
 let supported=false;
 for(const source of input.evidence){const evidence=context.evidence.find(e=>same(e.source,source));if(!evidence)invalid();const assertion=evidence.temporalAssertion;if(!assertion)continue;
  if(!same(assertion.predecessor,input.predecessor)||!same(assertion.successor,input.successor)||assertion.effectiveAt!==input.effectiveAt)invalid();supported=true;
 }
 const equalStart=av.state==='known'&&av.from?.precision==='instant'&&Date.parse(av.from.value)===at;
 const outcome=supported&&!equalStart?'superseded':'conflicted';
 const records:[MemoryRecordV2,MemoryRecordV2]=[structuredClone(a),structuredClone(b)];
 if(outcome==='superseded'){
  records[0].experience.validity={state:'known',from:av.state==='known'?av.from:{precision:'unknown'},to:{precision:'instant',value:input.effectiveAt}};
  records[1].experience.validity={state:'known',from:{precision:'instant',value:input.effectiveAt},to:bv.state==='known'?bv.to:null};
 }
 const linkType=outcome==='superseded'?'supersedes':'contradicts';
 records[1].links=records[1].links.filter(link=>!(link.type===linkType&&link.targetId===a.id&&link.validFrom===input.effectiveAt&&link.validTo===undefined));
 records[1].links.push({type:linkType,targetId:a.id,strength:1,createdAt:now,validFrom:input.effectiveAt,reason:input.reason});
 for(const record of records){record.updatedAt=now;record.experience.sourceRefs=[...new Map([...record.experience.sourceRefs,...input.evidence].map(source=>[stableDisclosureJson(source),source])).values()];}
 for(let index=0;index<records.length;index++)records[index]=normalizeRecord(records[index],records[index].content) as MemoryRecordV2;
 return{outcome,records,audit:{before:[input.predecessor,input.successor],after:records.map(ref),evidence:input.evidence,effectiveAt:input.effectiveAt,recordedAt:now,reason:input.reason,outcome}};
}
