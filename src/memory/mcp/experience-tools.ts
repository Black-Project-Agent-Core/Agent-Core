import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MemoryService as V2MemoryService } from '../facade.js';
import type { MemoryRetrievalAttempt } from '../retrieval-ledger.js';
import {ExternalRecallWait} from '../recall-wait.js';

import type { MemoryScopeResolver, MemoryTaskSelector } from './scope.js';
const readonlyActions = {
  capabilities:'memory_capabilities', recall:'memory_recall',
  expand:'memory_expand', task_context:'memory_task_context', ingestion_cursor:'memory_ingestion_cursor',
  claim_review:'memory_claim_review_read',
  recall_repair:'memory_recall_repair_read',derivation:'memory_derivation_read',
} as const;
const mutatingActions = {
  task_start:'memory_task_start', event_append:'memory_event_append',
  evidence_capture:'memory_evidence_capture', checkpoint:'memory_checkpoint',
  consolidation_preview:'memory_consolidation_preview', consolidation_apply:'memory_consolidation_apply',
  retention_set:'memory_retention_set', episode_status:'memory_episode_status',
  claim_review:'memory_claim_review_write',
  recall_repair:'memory_recall_repair_write',derivation:'memory_derivation_write',
} as const;
const input = z.strictObject({action:z.string().min(1).max(48),scope:z.strictObject({taskId:z.string().min(1).max(128)}).optional(),payload:z.record(z.string(),z.unknown()).optional()});
const forbiddenPayloadScope = new Set(['taskId','workspaceKey','ownerId','controllerId','sessionId','workspace','scope']);
function errorResult(error: unknown) {
  const msg=error instanceof Error?error.message:'';
  const candidate=(error as {code?:unknown})?.code;
  const code=error instanceof z.ZodError?'MEMORY_INPUT_INVALID':typeof candidate==='string' && /^MEMORY_[A-Z0-9_]+$/.test(candidate)?candidate:/^[A-Z][A-Z0-9_:-]{3,100}$/.test(msg)?msg:'MEMORY_EXPERIENCE_UNAVAILABLE';
  return {content:[{type:'text' as const,text:JSON.stringify({status:'error',code, ...(code==='MEMORY_CONTROLLER_SCOPE_UNAVAILABLE'?{hint:'Start controller_learning episode with a stable taskKey and registered workspace, then pass scope: { taskId: episode.id }. Native calls require a host task/workspace.'}: {})})}],isError:true};
}
export function registerMemoryExperienceTools(
  server:McpServer, memory:V2MemoryService, resolveScope:MemoryScopeResolver,
  onReturnedRecall?: (hits: ReadonlyArray<{
    id: string; retrievalEvidence: { attemptId: string; contentDigest: string };
  }>) => Promise<void>,
  assertExternalRecallScope?: (taskId:string,workspaceKey:string) => Promise<void>,
  assertExternalWriteScope?: (taskId:string,workspaceKey:string) => Promise<void>,
):void {
  const externalClaimReviews=Boolean(assertExternalRecallScope&&assertExternalWriteScope);
  async function dispatch(action:string,payload:Record<string,unknown>,mode:'read'|'write',selector?:MemoryTaskSelector,signal?:AbortSignal,wait?:ExternalRecallWait){
    const deadlineMs=Date.now()+15_000;
    const externalAction=['claim_review','recall_repair','derivation'].includes(action);
    if(externalAction&&!externalClaimReviews)throw new Error('MEMORY_INPUT_INVALID');
    const group=mode==='read'?readonlyActions:mutatingActions;
    if(!Object.hasOwn(group,action))throw new Error('MEMORY_INPUT_INVALID');
    if(Object.keys(payload).some(key=>forbiddenPayloadScope.has(key)))throw new Error('MEMORY_INPUT_INVALID');
    const scope=await resolveScope(selector);
    wait?.assertCurrent();
    if(!scope?.taskId?.trim() || !scope.workspaceKey?.trim() || !scope.controllerId?.trim())throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    // A workspace absent from the host registry is a scope mismatch, not an
    // invitation to infer an alternate workspace or disclose registry internals.
    let identity:ReturnType<typeof memory.registeredWorkspaceIdentity>;
    try {identity=memory.registeredWorkspaceIdentity(scope.workspaceKey);}
    catch {throw new Error('MEMORY_SCOPE_MISMATCH');}
    const assertCurrent=async()=>{
      wait?.assertCurrent();
      const fresh=await resolveScope(selector);
      wait?.assertCurrent();
      if(JSON.stringify(fresh)!==JSON.stringify(scope))throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
      let currentIdentity:ReturnType<typeof memory.registeredWorkspaceIdentity>;
      try {currentIdentity=memory.registeredWorkspaceIdentity(fresh.workspaceKey);}
      catch {throw new Error('MEMORY_SCOPE_MISMATCH');}
      if(currentIdentity.key!==identity.key)throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
      if(mode==='read'&&(action==='recall'||externalAction))await assertExternalRecallScope?.(scope.taskId,scope.workspaceKey);
      if(mode==='write'&&externalAction)await assertExternalWriteScope?.(scope.taskId,scope.workspaceKey);
    };
    if(mode==='read'&&action==='recall')await assertExternalRecallScope?.(scope.taskId,scope.workspaceKey);
    if(externalAction)await assertCurrent();
    const pending:MemoryRetrievalAttempt[]=[];
    const defer=mode==='read'&&action==='recall'
      ? async (attempt:MemoryRetrievalAttempt)=>{
        if(pending.length)throw new Error('MEMORY_DISCLOSURE_PROTOCOL_INVALID');
        pending.push(attempt);
      }:undefined;
    const session=memory.controller(scope,'baseline-v1',{scope,deadlineMs,signal,
      assertScopeCurrent:assertCurrent},defer);
    if(session.capabilities().writeMode!=='experience-v2')throw new Error('MEMORY_EXPERIENCE_NOT_ENABLED');
    const {createControllerMemoryDispatcher}=await import('../facade.js');
    const method=(group as Record<string,string>)[action]!;
    const result=await createControllerMemoryDispatcher(session)({method,input:payload} as any);
    wait?.assertCurrent();
    const serialized=JSON.stringify(result);
    const response={content:[{type:'text' as const,text:serialized}]};
    // An engine snapshot is not yet an MCP disclosure. Commit its existing
    // attempt only after the complete response is serializable and still bound.
    if(signal?.aborted)throw new Error('MEMORY_DISCLOSURE_CANCELLED');
    if(pending.length){
      await assertCurrent();
      if(signal?.aborted)throw new Error('MEMORY_DISCLOSURE_CANCELLED');
      wait?.assertCurrent();
      await memory.recordControllerDisclosure(pending[0]!,scope,wait?()=>wait.assertCurrent():undefined,wait?()=>wait.accept(response):undefined);
      wait?.assertCurrent();
    }
    return response;
  }
  server.registerTool('memory_v2_read',{title:'Read Memory v2',
    description:'Read compact Memory, exact history, task capsule continuity assessment, committed ingestion cursor and capabilities. Recall supports separate validAt and host-recorded knownAt; asOf remains a validAt alias. task_context optionally accepts intentions:{now,eventKeys,limit} for an advisory current-episode projection; it never schedules, executes or resolves an obligation. Continuity ready is fresh context, never task completion or permission to resume paused/completed work. External callers must pass scope.taskId from their host-bound Learning episode.'+(externalClaimReviews?' External recall has a 15s local wait budget; provider work may continue. action=claim_review reads cause-specific review metadata with payload:{memoryId,events?,budget?}; action=capabilities exposes its structured guide.':''),
    inputSchema:input.shape,annotations:{title:'Read Memory v2',readOnlyHint:true,openWorldHint:false}
  },async (args:unknown,ctx)=>{
   let wait:ExternalRecallWait|undefined;
   try{
    const request=input.parse(args);
    // Only the external host installs this admission port; Native keeps its existing path.
    if(request.action==='recall'&&assertExternalRecallScope)wait=new ExternalRecallWait(Date.now()+15_000,ctx?.mcpReq?.signal);
    const perform=async()=>{
    const response=await dispatch(request.action,request.payload??{},'read',request.scope,wait?.signal??ctx?.mcpReq?.signal,wait);
    // A cancelled MCP response is not an accepted external Memory disclosure.
    if (ctx?.mcpReq?.signal?.aborted) throw new Error('MEMORY_DISCLOSURE_CANCELLED');
    if(request.action==='recall' && onReturnedRecall) {
      // The dispatcher has finalized its byte budget and serialized this response.
      // Only actual returned hits, never omitted candidates, are eligible to mirror.
      const output=JSON.parse(response.content[0]!.text) as {
        result?:{status?:string;data?:{hits?:Array<{id:string;retrievalEvidence:{attemptId:string;contentDigest:string}}>}};
      };
      const hits=output.result?.status!=='insufficient-budget'?output.result?.data?.hits??[]:[];
      wait?.assertCurrent();
      if(hits.length && !ctx?.mcpReq?.signal?.aborted) try { await onReturnedRecall(hits); }
      catch { /* Canonical ledger remains authoritative; exact receipt may reconcile later. */ }
    }
    wait?.assertCurrent();
    return response;
    };
    return wait?await wait.run(perform):await perform();
  }catch(error){return errorResult(error);}finally{wait?.dispose();}});
  server.registerTool('memory_v2_write',{title:'Write Memory v2',
    description:'Record task episodes, checkpoint, review promotion and retention. External callers must pass scope.taskId from their host-bound Learning episode.'+(externalClaimReviews?' action=claim_review defines HOW/WHEN or appends a controller-assessed attempt; requires exact expectedRevision, expectedReviewRevision and stable operationId. Read capabilities guide first. Unavailable evidence stays unresolved; dispositions never rewrite facts or grant execution.':''),
    inputSchema:input.shape,annotations:{title:'Write Memory v2',readOnlyHint:false,openWorldHint:false}
  },async (args:unknown,ctx)=>{try{const request=input.parse(args);return await dispatch(request.action,request.payload??{},'write',request.scope,ctx?.mcpReq?.signal);}catch(error){return errorResult(error);}});
}
