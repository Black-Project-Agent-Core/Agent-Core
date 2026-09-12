import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import { MEMORY_ENFORCEMENTS, MEMORY_KINDS, MEMORY_RELATIONS, MEMORY_WRITE_REASON_CODES, type MemoryPostflightRequest } from '../memory/types.js';
import type { RuntimeServices } from '../runtime/services.js';
import { AgentCoreRouteError } from '../runtime/route-context-store.js';
import { persistentPrincipalId, resolvedMemoryProjectScope, resolvedRouteProject } from './project-scope.js';
import { workflowScope } from './workflow-guard.js';

export const MEMORY_TURN_TOOL_NAMES = ['memory_turn_finalize'] as const;
const memoryKind=z.enum(MEMORY_KINDS),enforcement=z.enum(MEMORY_ENFORCEMENTS),relation=z.enum(MEMORY_RELATIONS),reason=z.enum(MEMORY_WRITE_REASON_CODES);
const jsonValue=z.union([z.string().max(50_000),z.number(),z.boolean(),z.null(),z.array(z.unknown()).max(1000),z.record(z.string(),z.unknown())]);
const semanticProfile=z.object({
  title:z.string().max(2000).optional(),summary:z.string().max(2000).optional(),intent:z.string().max(2000).optional(),concepts:z.array(z.string().max(500)).max(32).optional(),entities:z.array(z.string().max(500)).max(32).optional(),constraints:z.array(z.string().max(500)).max(32).optional(),artifacts:z.array(z.string().max(500)).max(32).optional(),outcome:z.string().max(2000).optional(),failureMode:z.string().max(2000).optional(),solution:z.string().max(2000).optional(),futureRelevance:z.array(z.string().max(500)).max(32).optional(),
}).optional();
const candidate=z.object({
  canonicalKey:z.string().min(1).max(5000),kind:memoryKind,value:jsonValue,importance:z.number().min(0).max(1).optional(),pinned:z.boolean().optional(),enforcement:enforcement.optional(),sourceType:z.string().max(5000).optional(),sourceRef:z.string().max(5000).optional(),metadata:z.record(z.string(),z.unknown()).optional(),title:z.string().max(2000).optional(),semanticProfile,
}).optional();
const proposedRelation=z.object({targetMemoryId:z.string().min(1).max(5000),relation,evidenceRefs:z.array(z.string().min(1).max(5000)).max(64)});
const annotations={readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false} as const;
function textResult(value:unknown){return{content:[{type:'text' as const,text:JSON.stringify(value,null,2)}]};}
function errorResult(error:unknown){const message=error instanceof Error?error.message:String(error);const code=error instanceof Error&&'code'in error&&typeof(error as{code?:unknown}).code==='string'?(error as{code:string}).code:undefined;const details=error instanceof Error&&'details'in error?(error as{details:unknown}).details:undefined;return{content:[{type:'text' as const,text:JSON.stringify({finalized:false,error:{...(code?{code}:{}),message,...(details?{details}:{})}},null,2)}],isError:true as const};}

async function resolveFinalization(runtime:RuntimeServices,key:VerifiedKey,routeContextId:string){
  try{
    const {route}=resolvedRouteProject(runtime,key,routeContextId);
    return{scope:resolvedMemoryProjectScope(runtime,key,routeContextId),contextId:route.memorySnapshot?.memoryContextId,continuityTaskId:route.continuityTaskId};
  }catch(error){
    if(!(error instanceof AgentCoreRouteError)||!['ROUTE_NOT_FOUND','ROUTE_EXPIRED'].includes(error.code))throw error;
    // Recover only finalization authority. This does not recreate a route, lease,
    // capability grant, or permission to perform new substantive work.
    const principalId=persistentPrincipalId(runtime,key);
    const lifecycle=await runtime.memory.findLifecycleByRoute({principalId,routeContextId,projectIds:runtime.workspace.roots,authorityPrincipalId:key.id,includeDescendantProjects:true});
    if(!lifecycle)throw error;
    return{scope:{principalId,projectId:lifecycle.projectId},contextId:lifecycle.contextId,continuityTaskId:lifecycle.continuityTaskId};
  }
}

export function registerMemoryTurnTools(server:McpServer,runtime:RuntimeServices,key:VerifiedKey):void{
  server.registerTool('memory_turn_finalize',{
    title:'Finalize Memory Turn',
    description:'Mandatory per-turn postflight: persist a reuse-first memory decision (including NO_DURABLE_MEMORY), apply justified memory changes, synchronize memory, and close the lifecycle. A new durable root requires rootReason, FRESH_DURABLE_CONTEXT, and evidenceRefs. If synchronization fails, retry the same arguments and original routeContextId, including after restart or route expiry; successful memory changes are not repeated.',
    inputSchema:{
      routeContextId:z.string().uuid(),candidate,reasonCodes:z.array(reason).min(1).max(32),evidenceRefs:z.array(z.string().min(1).max(5000)).max(64).default([]),relatedMemoryIds:z.array(z.string().min(1).max(5000)).max(32).optional(),targetMemoryId:z.string().min(1).max(5000).optional(),branchParentMemoryId:z.string().min(1).max(5000).optional(),conflictWithMemoryId:z.string().min(1).max(5000).optional(),conflictType:z.string().min(1).max(5000).optional(),rootReason:z.string().min(1).max(2000).optional(),proposedRelations:z.array(proposedRelation).max(32).optional(),
    },annotations,
  },async(args)=>{
    try{
      const {scope,contextId,continuityTaskId}=await resolveFinalization(runtime,key,args.routeContextId);
      if(runtime.memory.config.enabled&&!contextId)throw new Error('MEMORY_PREFLIGHT_REQUIRED');
      if(continuityTaskId){
        const workflow=await runtime.workflow.status(workflowScope(runtime,scope.principalId,scope.projectId??runtime.workspace.resolveProjectRoot(),continuityTaskId));
        if(workflow?.planRequired)throw Object.assign(new Error('This planned task requires task_checkpoint with its current execution evidence or an explicit incomplete status'),{code:'WORKFLOW_CHECKPOINT_REQUIRED'});
      }
      const request:MemoryPostflightRequest={scope,routeContextId:args.routeContextId,continuityTaskId,contextId:contextId??undefined,candidate:args.candidate,reasonCodes:args.reasonCodes,evidenceRefs:args.evidenceRefs,relatedMemoryIds:args.relatedMemoryIds,targetMemoryId:args.targetMemoryId,branchParentMemoryId:args.branchParentMemoryId,conflictWithMemoryId:args.conflictWithMemoryId,conflictType:args.conflictType,rootReason:args.rootReason,proposedRelations:args.proposedRelations};
      const applied=await runtime.memory.applyPostflight(request);
      const closed=contextId?await runtime.memory.closeLifecycleDurably({scope,contextId,routeContextId:args.routeContextId,reason:'turn_finalize'}):null;
      const lifecycle=closed?.lifecycle;
      return textResult({finalized:true,decision:applied.decision,decisionRecordId:applied.decisionRecord.id,semanticMutation:applied.semanticMutation,memoryId:applied.memoryId??null,revisionId:applied.revisionId??null,createdEdges:applied.createdEdges,...(applied.supabaseSync?{supabaseSync:applied.supabaseSync}:{}),remoteDurability:closed?.remoteDurability??null,memoryLifecycle:lifecycle?{postflightState:lifecycle.postflightState,closedAt:lifecycle.closedAt??null,localDurableGeneration:lifecycle.localDurableGeneration??null,localDurableHash:lifecycle.localDurableHash??null}:null});
    }catch(error){return errorResult(error);}
  });
}
