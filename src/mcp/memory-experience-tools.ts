import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MemoryService as V2MemoryService } from '../../SubProject/agent-core-memory/dist/index.js';

import type { MemoryScopeResolver, MemoryTaskSelector } from './memory-scope.js';
const readonlyActions = {
  capabilities:'memory_capabilities', recall:'memory_recall',
  expand:'memory_expand', task_context:'memory_task_context', ingestion_cursor:'memory_ingestion_cursor',
} as const;
const mutatingActions = {
  task_start:'memory_task_start', event_append:'memory_event_append',
  evidence_capture:'memory_evidence_capture', checkpoint:'memory_checkpoint',
  consolidation_preview:'memory_consolidation_preview', consolidation_apply:'memory_consolidation_apply',
  retention_set:'memory_retention_set', episode_status:'memory_episode_status',
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
):void {
  async function dispatch(action:string,payload:Record<string,unknown>,mode:'read'|'write',selector?:MemoryTaskSelector){
    const group=mode==='read'?readonlyActions:mutatingActions;
    if(!Object.hasOwn(group,action))throw new Error('MEMORY_INPUT_INVALID');
    if(Object.keys(payload).some(key=>forbiddenPayloadScope.has(key)))throw new Error('MEMORY_INPUT_INVALID');
    const scope=await resolveScope(selector);
    if(!scope?.taskId?.trim() || !scope.workspaceKey?.trim() || !scope.controllerId?.trim())throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    const session=memory.controller(scope);
    if(session.capabilities().writeMode!=='experience-v2')throw new Error('MEMORY_EXPERIENCE_NOT_ENABLED');
    const {createControllerMemoryDispatcher}=await import('../../SubProject/agent-core-memory/dist/index.js');
    const method=(group as Record<string,string>)[action]!;
    const result=await createControllerMemoryDispatcher(session)({method,input:payload} as any);
    return {content:[{type:'text' as const,text:JSON.stringify(result)}]};
  }
  server.registerTool('memory_v2_read',{title:'Read Memory v2',
    description:'Read compact Memory, exact history, task capsule continuity assessment, committed ingestion cursor and capabilities. Recall supports separate validAt and host-recorded knownAt; asOf remains a validAt alias. task_context optionally accepts intentions:{now,eventKeys,limit} for an advisory current-episode projection; it never schedules, executes or resolves an obligation. Continuity ready is fresh context, never task completion or permission to resume paused/completed work. External callers must pass scope.taskId from their host-bound Learning episode.',
    inputSchema:input.shape,annotations:{title:'Read Memory v2',readOnlyHint:true,openWorldHint:false}
  },async (args:unknown)=>{try{const request=input.parse(args);return await dispatch(request.action,request.payload??{},'read',request.scope);}catch(error){return errorResult(error);}});
  server.registerTool('memory_v2_write',{title:'Write Memory v2',
    description:'Record task episodes, checkpoint, review promotion and retention. External callers must pass scope.taskId from their host-bound Learning episode.',
    inputSchema:input.shape,annotations:{title:'Write Memory v2',readOnlyHint:false,openWorldHint:false}
  },async (args:unknown)=>{try{const request=input.parse(args);return await dispatch(request.action,request.payload??{},'write',request.scope);}catch(error){return errorResult(error);}});
}
