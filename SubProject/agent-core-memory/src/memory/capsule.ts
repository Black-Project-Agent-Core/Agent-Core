import { z } from 'zod';
import { insufficientBudget,measureBudgeted,stableDisclosureJson } from './disclosure.js';
import type { Budgeted } from './disclosure.js';
import { taskCapsuleSchema } from './experience-types.js';
import type { CheckpointTrigger,EpisodeEvent,EpisodeHeader,SourceRef,TaskCapsule,WorkingItem } from './experience-types.js';

/** Critical resolved history remains mandatory; present operational kinds cannot be omitted by a false flag. */
export function isMandatoryWorkingItem(item:WorkingItem):boolean {
  return item.critical || item.state==='active' && (['goal','constraint','decision','blocker','obligation','next-action','changed-file','important-id'].includes(item.kind)
    || item.kind==='current-state' && item.verification.status==='verified');
}
/** Current assertions require a current ref; historical strategies and resolved state keep exact old lineage. */
export function isCurrentWorkingAssertion(item:WorkingItem):boolean {
  return item.state==='active' && item.kind!=='successful-strategy' && item.kind!=='failed-path';
}
export function uniqueSourceRefs(refs:SourceRef[]):SourceRef[] {
  return [...new Map(refs.map(ref=>[stableDisclosureJson(ref),ref])).values()];
}
export function workingItemRefs(item:WorkingItem):SourceRef[] {return uniqueSourceRefs([...item.sourceRefs,...item.verification.evidence]);}
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const metricsSchema=z.strictObject({payloadBytes:z.number().int().nonnegative(),estimatedTokens:z.number().int().nonnegative(),tokenEstimator:z.literal('unicode-codepoints/4-v1')});
export const budgetedCapsuleSchema=z.strictObject({status:z.enum(['ok','partial']),data:taskCapsuleSchema,metrics:metricsSchema,warnings:z.array(z.string())});
/** Pure deterministic computation runs after the scoped snapshot releases the store lock. No paraphrase or model call. */
export function renderTaskCapsule(input:{id:string;header:EpisodeHeader;generatedAt:string;trigger:CheckpointTrigger;
  workingState:WorkingItem[];events:EpisodeEvent[];episodeRef:SourceRef;maxBytes:number;warnings?:string[]}):Budgeted<TaskCapsule> {
  const criticalItems=input.workingState.filter(isMandatoryWorkingItem),lastSequence=new Map<string,number>();
  for(const event of input.events)for(const change of event.stateChanges)lastSequence.set(change.op==='upsert'?change.item.id:change.itemId,event.sequence);
  const supporting=input.workingState.filter(item=>!isMandatoryWorkingItem(item)).sort((a,b)=>compare(a.kind,b.kind)
    || (lastSequence.get(b.id)??0)-(lastSequence.get(a.id)??0) || compare(a.id,b.id));
  const page=(selected:WorkingItem[])=>{
    const ids=new Set(selected.map(item=>item.id)),omittedSupportingItemIds=supporting.filter(item=>!ids.has(item.id)).map(item=>item.id);
    const capsule:TaskCapsule={schemaVersion:1,id:input.id,taskId:input.header.taskId,episodeId:input.header.id,episodeRevision:input.header.revision,
      generatedAt:input.generatedAt,generator:'deterministic-v1',trigger:input.trigger,criticalItems,supportingItems:selected,
      sourceRefs:uniqueSourceRefs([input.episodeRef,...[...criticalItems,...selected].flatMap(workingItemRefs)]),omittedSupportingItemIds};
    return measureBudgeted<TaskCapsule>({status:omittedSupportingItemIds.length||input.warnings?.length?'partial':'ok',data:capsule,
      warnings:[...new Set(['memory-is-advisory',...(input.warnings??[]),...(omittedSupportingItemIds.length?['supporting-items-omitted']:[])])]});
  };
  let result=page([]);
  if(result.metrics.payloadBytes>input.maxBytes)return insufficientBudget(result.metrics.payloadBytes,['memory-is-advisory','mandatory-capsule-over-budget']);
  const selected:WorkingItem[]=[];
  for(const item of supporting){const candidate=page([...selected,item]);if(candidate.metrics.payloadBytes<=input.maxBytes){selected.push(item);result=candidate;}}
  return result;
}
