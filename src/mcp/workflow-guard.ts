import type { VerifiedKey } from '../auth/key-types.js';
import { canonicalFileNativeProjectId } from '../memory/file-native/paths.js';
import { classifyMeaningfulWork } from '../memory/meaningful-work.js';
import { AgentCoreRouteError, type RouteContext } from '../runtime/route-context-store.js';
import { WorkspaceProjectError } from '../runtime/workspace.js';
import type { RuntimeServices } from '../runtime/services.js';
import { persistentPrincipalId } from './project-scope.js';
import type { WorkflowAuthorizeInput } from '../workflow/types.js';

export function workflowOperationInput(toolName: string, input: Record<string, unknown> = {}): WorkflowAuthorizeInput {
  const classification = classifyMeaningfulWork(toolName, input);
  const paths = [input.path, input.source, input.destination,
    ...(Array.isArray(input.paths) ? input.paths : [])].filter((p): p is string => typeof p === 'string');
  const readOnly = ['read_only', 'github_read_only', 'shell_read_only'].includes(classification.mutationClass);
  return {
    toolName: readOnly ? 'read_file' : toolName,
    ...(paths.length ? { paths } : {}),
    ...(typeof input.command === 'string' ? { command: input.command } : {}),
    ...(typeof input.stepId === 'string' ? { stepId: input.stepId } : {}),
    ...(typeof input.planVersion === 'number' ? { planVersion: input.planVersion } : {}),
    viaExecution: toolName.startsWith('execution_'),
  };
}

export function workflowScope(runtime: RuntimeServices, principalId: string, projectId: string, taskId: string) {
  return { principalId, projectId: canonicalFileNativeProjectId(runtime.memory.config.fileNative, projectId), taskId };
}

export function routeWorkflowScope(runtime: RuntimeServices, key: VerifiedKey, route: RouteContext) {
  const taskId = route.workflow?.taskId ?? route.continuityTaskId;
  if (!taskId) throw Object.assign(new Error('Route has no persisted workflow task; obtain a new capability_route'), { code: 'WORKFLOW_CONTEXT_REQUIRED' });
  return workflowScope(runtime, persistentPrincipalId(runtime, key), route.projectId ?? runtime.workspace.resolveProjectRoot(), taskId);
}

export async function authorizeRouteWorkflow(runtime: RuntimeServices, key: VerifiedKey, route: RouteContext,
  toolName: string, input: Record<string, unknown> = {}): Promise<void> {
  const classification = classifyMeaningfulWork(toolName, input);
  if (!classification.meaningful) return;
  // These operations establish evidence/plan state; their own service validates
  // task ownership and version. They must stay usable while implementation waits.
  if (toolName === 'workflow_plan' || toolName === 'craft_source') return;
  // ExecutionService establishes the immutable run binding and validates again
  // under claims. It also owns safe replay of a completed attempt's pending
  // receipt before checking the updated target baseline.
  if (['execution_create','execution_start','execution_add_nodes','execution_retry'].includes(toolName)) return;
  if (!route.workflow && !route.continuityTaskId) {
    if (runtime.memory.config.hardLifecycleMode === 'enforce') routeWorkflowScope(runtime, key, route);
    return;
  }
  const scope = routeWorkflowScope(runtime, key, route);
  try { await runtime.workflow.authorize(scope, workflowOperationInput(toolName, input)); }
  catch (error) {
    if (error instanceof WorkspaceProjectError && error.code === 'WORKSPACE_PROJECT_MISMATCH') {
      throw new AgentCoreRouteError('ROUTE_PROJECT_MISMATCH', error.message, { projectId: route.projectId });
    }
    throw error;
  }
}
