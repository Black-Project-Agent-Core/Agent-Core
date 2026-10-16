// Transport-neutral protocol replay example. No model SDK, credentials, prior
// transcript, store internals, or authority inferred from remembered text.
import type {ControllerMemoryDispatcher,SourceRef,WorkingItem} from '../facade.js';
export async function resumeControllerTask(call:ControllerMemoryDispatcher) {
 const context=(await call({method:'memory_task_context',input:{budget:{maxBytes:8192}}})).result;
 if(context.status==='insufficient-budget')throw new Error('CONTINUATION_CONTEXT_BUDGET');
 const {data}=context;
 async function expand(source:SourceRef,view:'episode'|'evidence') {
  let text='',cursor:string|undefined;
  do {const result=(await call({method:'memory_expand',input:{source,view,budget:{maxBytes:8192},...(cursor?{cursor}:{})}})).result;
   if(result.status==='insufficient-budget')throw new Error('CONTINUATION_EXPANSION_BUDGET');
   if(result.data.availability!=='available')throw new Error('CONTINUATION_EVIDENCE_UNAVAILABLE');
   text+=result.data.text;cursor=result.data.nextCursor;
  }while(cursor);
  return text;
 }
 const usedFallback=data.freshness!=='current'||data.needsCheckpoint||!data.capsule;
 const workingState:WorkingItem[]=usedFallback?JSON.parse(await expand(data.episodeRef,'episode')).workingState:[...data.capsule!.criticalItems,...data.capsule!.supportingItems];
 const refs=new Map<string,SourceRef>();for(const item of workingState)if(item.kind==='successful-strategy')for(const ref of item.sourceRefs)if(ref.kind==='artifact')refs.set(JSON.stringify(ref),ref);
 const evidence=[];for(const source of refs.values())evidence.push({source,text:await expand(source,'evidence')});
 // A stale live source is still uncertain after opening retained bytes. This
 // example reports that fact; the host/controller must inspect live sources.
 return {workingState,evidence,usedFallback,sourceFreshness:data.freshness,advisory:true as const};
}
