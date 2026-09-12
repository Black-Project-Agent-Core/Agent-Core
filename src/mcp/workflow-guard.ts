import type { VerifiedKey } from '../auth/key-types.js';
import { canonicalFileNativeProjectId } from '../memory/file-native/paths.js';
import { classifyMeaningfulWork } from '../memory/meaningful-work.js';
import { AgentCoreRouteError, type RouteContext } from '../runtime/route-context-store.js';
import { WorkspaceProjectError } from '../runtime/workspace.js';
import type { RuntimeServices } from '../runtime/services.js';
import { persistentPrincipalId } from './project-scope.js';
import type { WorkflowAuthorizeInput } from '../workflow/types.js';

const GITHUB_READ_OPERATIONS: Record<string, ReadonlySet<string>> = {
  github_repo: new Set(['get', 'list']), github_git: new Set(['ls_remote', 'remote_get_url']),
  github_issue: new Set(['list', 'get']), github_pr: new Set(['list', 'get']),
  github_actions: new Set(['list_workflows', 'list_runs', 'get_run']),
  github_release: new Set(['list', 'get', 'get_by_tag']), github_packages: new Set(['list', 'get_versions', 'npm_view']),
};
/** A claimed read/diagnostic name must not hide an actual command or mutation payload. */
export function classifyWorkflowOperation(toolName: string, input: Record<string, unknown> = {}): ReturnType<typeof classifyMeaningfulWork> {
  const classification = classifyMeaningfulWork(toolName, input);
  const command = typeof input.command === 'string' ? input.command : undefined;
  if (toolName === 'execute_command' && command && /[\x00-\x08\x0a-\x1f\x7f\u2028\u2029]/.test(command.normalize('NFKC'))) {
    return { meaningful: true, reasonCode: 'shell_control_characters', mutationClass: 'shell_mutation_or_unknown' };
  }
  const claimedRead = !classification.meaningful || ['read_only', 'github_read_only', 'shell_read_only'].includes(classification.mutationClass);
  const resources = input.resources && typeof input.resources === 'object' ? input.resources as Record<string, unknown> : undefined;
  const mutationFields = ['content', 'oldString', 'newString', 'destination', 'writePaths'].some(field => input[field] !== undefined)
    || Array.isArray(input.writes) && input.writes.length > 0
    || Array.isArray(resources?.writes) && resources.writes.length > 0
    || input.mutation === true || input.mutating === true;
  if (claimedRead && (mutationFields || command !== undefined && toolName !== 'execute_command')) {
    return { meaningful: true, reasonCode: 'conflicting_operation_payload', mutationClass: 'unknown_conservative' };
  }
  if (classification.mutationClass === 'github_read_only' && GITHUB_READ_OPERATIONS[toolName]
    && !GITHUB_READ_OPERATIONS[toolName].has(String(input.operation ?? ''))) {
    return { meaningful: true, reasonCode: 'unknown_read_operation', mutationClass: 'unknown_conservative' };
  }
  return classification;
}

export function workflowOperationInput(toolName: string, input: Record<string, unknown> = {}): WorkflowAuthorizeInput {
  const classification = classifyWorkflowOperation(toolName, input);
  if (classification.reasonCode === 'conflicting_operation_payload' || classification.reasonCode === 'unknown_read_operation') {
    throw Object.assign(new Error('Read-only or diagnostic identity conflicts with the supplied operation payload'), { code: 'WORKFLOW_OPERATION_CLASSIFICATION_CONFLICT' });
  }
  const paths = [input.path, input.source, input.destination, input.cwd,
    ...(Array.isArray(input.paths) ? input.paths : [])].filter((p): p is string => typeof p === 'string');
  const readOnly = ['read_only', 'github_read_only', 'shell_read_only'].includes(classification.mutationClass);
  return {
    toolName: readOnly ? 'read_file' : toolName,
    ...(paths.length ? { paths } : {}),
    ...(typeof input.command === 'string' ? { command: input.command } : {}),
    ...(typeof input.operation === 'string' ? { operation: input.operation } : {}),
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
  const classification = classifyWorkflowOperation(toolName, input);
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
