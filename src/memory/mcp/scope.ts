import { createHash } from 'node:crypto';
import type { ControllerScope } from '../facade.js';
export interface MemoryTaskSelector { taskId: string }
export type MemoryScopeResolver = (selector?: MemoryTaskSelector) => Promise<ControllerScope>;
/** A Learning namespace is owner-scoped transport continuity, never task identity. */
export function ownerScopedLearningSession(ownerId: string, transportSessionId: string): string {
  if (!ownerId?.trim() || ownerId !== ownerId.trim() || !transportSessionId?.trim()) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  return 'ext-owner-' + createHash('sha256').update(JSON.stringify([ownerId, transportSessionId]), 'utf8').digest('hex').slice(0, 48);
}
/** The value comes only from the authenticated host principal, never a request header/body. */
export function memoryCredentialOwner(principal: unknown): string | undefined {
  if (!principal || typeof principal !== 'object') return undefined;
  const id = (principal as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && id === id.trim()
    && !/[\x00-\x1f\x7f]/.test(id) ? id : undefined;
}

/** Host-owned identity binding. Request payloads never select a workspace or owner. */
export function createMemoryScopeResolver(runtime: {
  nativeTaskId?:string; nativeWorkspace?:string; controllerSessionId?:string; memoryOwner?:string;
  workspaceRegistry?:{registeredWorkspaceIdentity(workspace:string):{name:string}};
  externalControllerLearning?:{resolveMemoryTask(owner:string,taskId:string):Promise<Pick<ControllerScope,'taskId'|'workspaceKey'>>};
}):MemoryScopeResolver {
  const {workspaceRegistry,memoryOwner}=runtime;
  return async selector => {
    try {
      if (runtime.nativeTaskId) {
        if (!runtime.nativeWorkspace || !workspaceRegistry || (selector && selector.taskId !== runtime.nativeTaskId)) throw new Error('unavailable native task');
        const identity = workspaceRegistry.registeredWorkspaceIdentity(runtime.nativeWorkspace);
        return {taskId:runtime.nativeTaskId,workspaceKey:identity.name,controllerId:'agent-core-native',sessionId:runtime.controllerSessionId};
      }
      if (!memoryOwner || !selector?.taskId || !runtime.externalControllerLearning) throw new Error('unavailable external task');
      const scope=await runtime.externalControllerLearning.resolveMemoryTask(memoryOwner,selector.taskId);
      return {...scope,controllerId:'agent-core-external',sessionId:runtime.controllerSessionId};
    } catch {throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');}
  };
}
