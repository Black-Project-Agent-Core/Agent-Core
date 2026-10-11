import {z} from 'zod';
import {sourceRefSchema,recordExperienceSchema,type SourceRef,type RecordExperience} from './experience-types.js';
import {stableDisclosureJson} from './disclosure.js';
import {uniqueSourceRefs} from './capsule.js';
import type {ConsolidationProposal} from './promotion.js';
const text=z.string().min(1).refine(value=>/\S/.test(value)&&!value.includes('\0')&&Buffer.from(value,'utf8').toString('utf8')===value);
const schema=z.strictObject({schemaVersion:z.literal(1),projectKey:z.string().trim().min(1).max(120),
  claims:z.array(z.strictObject({text,refs:z.array(sourceRefSchema).min(1).max(32)})).min(1).max(16),gaps:z.array(text).max(32)});
export type ProjectSynthesis=z.infer<typeof schema>;
export function projectSynthesisRefs(value:ProjectSynthesis):SourceRef[]{return uniqueSourceRefs(value.claims.flatMap(claim=>claim.refs));}
export function encodeProjectSynthesis(value:ProjectSynthesis):string {
  const parsed=schema.parse(value),encoded=stableDisclosureJson(parsed);
  if(projectSynthesisRefs(parsed).length>32||Buffer.byteLength(encoded,'utf8')>8192)throw new Error('MEMORY_SYNTHESIS_INVALID');
  return encoded;
}
export function decodeProjectSynthesis(content:string):ProjectSynthesis|null {
  try{if(Buffer.byteLength(content,'utf8')>8192)return null;const parsed=schema.parse(JSON.parse(content));encodeProjectSynthesis(parsed);return parsed;}catch{return null;}
}
export function buildProjectSynthesisAction(input:{actionId:string;value:ProjectSynthesis;experience:RecordExperience;target?:SourceRef}):ConsolidationProposal['actions'][number] {
  const content=encodeProjectSynthesis(input.value),refs=projectSynthesisRefs(input.value),experience=recordExperienceSchema.parse(input.experience);
  if(experience.verification.status==='verified'||experience.verification.method!==undefined||experience.verification.verifierRevision!==undefined||experience.verification.verifiedAt!==undefined
    ||(input.target&&(input.target.kind!=='memory'||refs.some(ref=>ref.kind==='memory'&&ref.id===input.target!.id))))throw new Error('MEMORY_SYNTHESIS_INVALID');
  const keys=new Set(refs.map(stableDisclosureJson));
  if(experience.verification.evidence.some(ref=>!keys.has(stableDisclosureJson(ref))))throw new Error('MEMORY_SYNTHESIS_INVALID');
  return {actionId:input.actionId,kind:input.target?'amend':'create',...(input.target?{target:input.target}:{}),inputRefs:refs,
    reason:'Preserve bounded project synthesis with exact claim evidence',value:{category:'project-synthesis',content,experience:{...experience,sourceRefs:refs}}} as ConsolidationProposal['actions'][number];
}
export async function checkProjectSynthesisDependencies(value:ProjectSynthesis,resolve:(ref:SourceRef)=>Promise<'current'|'stale'|'unavailable'>):Promise<{status:'current'|'stale'|'unknown';invalidRefs:SourceRef[]}> {
  const parsed=decodeProjectSynthesis(encodeProjectSynthesis(value))!,invalidRefs:SourceRef[]=[];let stale=false,unknown=false;
  for(const ref of projectSynthesisRefs(parsed)){
    let status:'current'|'stale'|'unavailable';try{status=await resolve(ref);}catch{status='unavailable';}
    if(status!=='current'){invalidRefs.push(ref);stale ||= status==='stale';unknown ||= status!=='stale';}
  }
  return {status:stale?'stale':unknown?'unknown':'current',invalidRefs};
}
