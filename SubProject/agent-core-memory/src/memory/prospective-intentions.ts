import {z} from 'zod';
import {workingStateChangeSchema,type WorkingItem,type WorkingStateChange,type SourceRef} from './experience-types.js';

export const INTENTION_PREFIX='agent-core-intention/v1\n';
const instant=z.iso.datetime({offset:true});
const eventKey=z.string().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const intentionSchema=z.strictObject({
 summary:z.string().min(1).max(2000).refine(value=>/\S/.test(value)),
 cue:z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('at-or-after'),instant}),
  z.strictObject({kind:z.literal('observed-event'),key:eventKey}),
 ]),expiresAt:instant.optional(),
});
export type ProspectiveIntention=z.infer<typeof intentionSchema>;
export interface IntentionEvaluation {
 items:Array<{itemId:string;status:'waiting'|'eligible'|'expired'|'resolved'|'unknown'}>;
 truncated:boolean;advisory:true;
}
export const intentionObservationSchema=z.strictObject({now:z.string().max(100),eventKeys:z.array(eventKey).max(64),limit:z.number().int().min(1).max(64).optional()});
export type IntentionObservation=z.infer<typeof intentionObservationSchema>;
export function encodeIntention(value:ProspectiveIntention):string {
 const text=INTENTION_PREFIX+JSON.stringify(intentionSchema.parse(value));
 if(Buffer.byteLength(text,'utf8')>4096)throw new Error('MEMORY_INTENTION_TOO_LARGE');
 return text;
}
export function decodeIntention(text:string):{status:'valid';value:ProspectiveIntention}|{status:'ordinary'|'invalid'} {
 if(!text.startsWith(INTENTION_PREFIX))return {status:'ordinary'};
 if(Buffer.byteLength(text,'utf8')>4096)return {status:'invalid'};
 try{return {status:'valid',value:intentionSchema.parse(JSON.parse(text.slice(INTENTION_PREFIX.length)))}}catch{return {status:'invalid'}}
}
/** Observations are advisory. This pure projection never schedules, resolves or authorizes an action. */
export function evaluateIntentions(items:readonly WorkingItem[],observation:{now:string;eventKeys:readonly string[]},limit:number):IntentionEvaluation {
 const parsed=intentionObservationSchema.parse({...observation,limit});
 const obligations=items.filter(item=>item.kind==='obligation');
 if(obligations.length>64)throw new Error('MEMORY_INTENTION_INPUT_LIMIT');
 const values=obligations.map(item=>({item,decoded:decodeIntention(item.text)})).filter(({decoded})=>decoded.status!=='ordinary').sort((a,b)=>a.item.id<b.item.id?-1:a.item.id>b.item.id?1:0);
 const time=instant.safeParse(parsed.now),now=time.success?Date.parse(time.data):NaN;
 const keys=new Set(parsed.eventKeys);
 return {items:values.slice(0,limit).map(({item,decoded})=>{
  let status:IntentionEvaluation['items'][number]['status']='unknown';
  if(item.state==='resolved')status='resolved';
  else if(decoded.status==='valid'&&Number.isFinite(now)){
   const value=decoded.value;
   if(value.expiresAt!==undefined&&now>Date.parse(value.expiresAt))status='expired';
   else status=(value.cue.kind==='at-or-after'?now>=Date.parse(value.cue.instant):keys.has(value.cue.key))?'eligible':'waiting';
  }
  return {itemId:item.id,status};
 }),truncated:values.length>limit,advisory:true};
}
export function intentionUpsert(itemId:string,value:ProspectiveIntention,sourceRefs:SourceRef[]):WorkingStateChange {
 return workingStateChangeSchema.parse({op:'upsert',item:{id:itemId,kind:'obligation',text:encodeIntention(value),critical:true,state:'active',sourceRefs,verification:{status:'unverified',evidence:[]}}});
}
