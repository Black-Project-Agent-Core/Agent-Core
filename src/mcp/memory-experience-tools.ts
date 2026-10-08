import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MemoryService as V2MemoryService } from '../../SubProject/agent-core-memory/dist/index.js';

interface BoundIdentity { sessionId?: string; nativeTaskId?: string; nativeWorkspace?: string }
const readonlyActions = {
  capabilities:'memory_capabilities', recall:'memory_recall',
  expand:'memory_expand', task_context:'memory_task_context',
} as const;
const mutatingActions = {
  task_start:'memory_task_start', event_append:'memory_event_append',
  evidence_capture:'memory_evidence_capture', checkpoint:'memory_checkpoint',
  consolidation_preview:'memory_consolidation_preview', consolidation_apply:'memory_consolidation_apply',
  retention_set:'memory_retention_set', episode_status:'memory_episode_status',
} as const;
const input = z.strictObject({action:z.string().min(1).max(48),payload:z.record(z.string(),z.unknown()).optional()});
function errorResult(error: unknown) {
  const msg=error instanceof Error?error.message:'';
  const code=/^[A-Z][A-Z0-9_:-]{3,100}$/.test(msg)?msg:'MEMORY_EXPERIENCE_UNAVAILABLE';
  return {content:[{type:'text' as const,text:JSON.stringify({status:'error',code})}],isError:true};
}
export function registerMemoryExperienceTools(
  server:McpServer, memory:V2MemoryService, identity:BoundIdentity,
):void {
  const taskId=identity.nativeTaskId??identity.sessionId;
  const workspaceKey=identity.nativeWorkspace??'agent-core';
  const controllerId=identity.nativeTaskId?'agent-core-native':'agent-core-external';
  async function dispatch(action:string,payload:Record<string,unknown>,mode:'read'|'write'){
    if(!taskId)throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    const group=mode==='read'?readonlyActions:mutatingActions;
    if(!Object.hasOwn(group,action))throw new Error('MEMORY_INPUT_INVALID');
    const session=memory.controller({workspaceKey,taskId,controllerId,sessionId:identity.sessionId});
    if(session.capabilities().writeMode!=='experience-v2')throw new Error('MEMORY_EXPERIENCE_NOT_ENABLED');
    const {createControllerMemoryDispatcher}=await import('../../SubProject/agent-core-memory/dist/index.js');
    const method=(group as Record<string,string>)[action]!;
    const result=await createControllerMemoryDispatcher(session)({method,input:payload} as any);
    return {content:[{type:'text' as const,text:JSON.stringify(result)}]};
  }
  server.registerTool('memory_v2_read',{title:'Read Memory v2',
    description:'Read compact Memory, exact history, task capsule and capabilities.',
    inputSchema:input.shape,annotations:{title:'Read Memory v2',readOnlyHint:true,openWorldHint:false}
  },async (args:unknown)=>{try{const request=input.parse(args);return await dispatch(request.action,request.payload??{},'read');}catch(error){return errorResult(error);}});
  server.registerTool('memory_v2_write',{title:'Write Memory v2',
    description:'Record task episodes, checkpoint, review promotion and retention.',
    inputSchema:input.shape,annotations:{title:'Write Memory v2',readOnlyHint:false,openWorldHint:false}
  },async (args:unknown)=>{try{const request=input.parse(args);return await dispatch(request.action,request.payload??{},'write');}catch(error){return errorResult(error);}});
}
