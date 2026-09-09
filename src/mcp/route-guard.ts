import type { VerifiedKey } from '../auth/key-types.js';
import { MemoryHardLifecycleError } from '../memory/hard-lifecycle.js';
import { AgentCoreRouteError } from '../runtime/route-context-store.js';
import type { RuntimeServices } from '../runtime/services.js';

export function validateOperationalRoute(
  runtime: RuntimeServices,
  key: VerifiedKey,
  routeContextId: string,
  toolName: string,
) {
  return runtime.routes.validate(routeContextId, key.id, toolName);
}

export function routeErrorResult(error: unknown) {
  const workflowError = error instanceof Error && 'code' in error && typeof error.code === 'string' && error.code.startsWith('WORKFLOW_');
  if (!(error instanceof AgentCoreRouteError) && !(error instanceof MemoryHardLifecycleError) && !workflowError) return null;
  const details = 'details' in error ? error.details : undefined;
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        error: {
          code: error.code,
          message: error.message,
          ...(details ? { details } : {}),
        },
      }, null, 2),
    }],
    isError: true as const,
  };
}
