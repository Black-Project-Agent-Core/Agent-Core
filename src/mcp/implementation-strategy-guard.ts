import type { VerifiedKey } from '../auth/key-types.js';
import {
  ImplementationStrategyError,
  type ImplementationStrategyErrorCode,
} from '../implementation/service.js';
import {
  classifyImplementationWork,
  type ImplementationWorkClassification,
} from '../implementation/meaningful-work.js';
import type { RouteContext } from '../runtime/route-context-store.js';
import type { RuntimeServices } from '../runtime/services.js';

export interface ImplementationStrategyGuardDecision {
  mode: 'disabled' | 'advisory' | 'enforce';
  required: boolean;
  valid: boolean;
  classification: ImplementationWorkClassification;
  leaseId?: string;
  advisoryCode?: ImplementationStrategyErrorCode;
}

function projectId(runtime: RuntimeServices, route: RouteContext): string {
  return route.projectId ?? runtime.workspace.resolveProjectRoot();
}

function missingStrategy(): ImplementationStrategyError {
  return new ImplementationStrategyError(
    'IMPLEMENTATION_STRATEGY_REQUIRED',
    'Implementation-bearing work requires a resolved strategy and scoped lease',
  );
}
export async function validateImplementationStrategyBeforeOperation(
  runtime: RuntimeServices,
  key: VerifiedKey,
  route: RouteContext,
  toolName: string,
  input: Record<string, unknown> = {},
): Promise<ImplementationStrategyGuardDecision> {
  const classification = classifyImplementationWork(toolName, input);
  const mode = runtime.implementationStrategy.config.mode;
  if (!classification.required || mode === 'disabled') {
    return { mode, required: false, valid: true, classification };
  }

  let failure: ImplementationStrategyError | undefined;
  const strategy = route.implementationStrategy;
  if (!strategy) {
    failure = missingStrategy();
  } else {
    try {
      const lease = runtime.implementationStrategy.validateLease({
        principalId: key.id,
        projectId: projectId(runtime, route),
        routeContextId: route.routeContextId,
        strategy,
      });
      return {
        mode,
        required: true,
        valid: true,
        classification,
        leaseId: lease.leaseId,
      };
    } catch (error) {
      failure = error instanceof ImplementationStrategyError
        ? error
        : new ImplementationStrategyError(
          'IMPLEMENTATION_STRATEGY_REQUIRED',
          'Implementation strategy validation failed',
        );
    }
  }

  if (mode === 'advisory') {
    runtime.audit.logRuntime('implementation', 'strategy_advisory', {
      routeContextId: route.routeContextId,
      toolName,
      reasonCode: classification.reasonCode,
      mutationClass: classification.mutationClass,
      advisoryCode: failure.code,
    });
    return {
      mode,
      required: true,
      valid: false,
      classification,
      advisoryCode: failure.code,
    };
  }

  throw failure;
}
export async function completeImplementationStrategyOperation(
  runtime: RuntimeServices,
  key: VerifiedKey,
  route: RouteContext,
  decision: ImplementationStrategyGuardDecision,
): Promise<void> {
  if (!decision.required || !decision.valid || decision.mode === 'disabled') return;
  const strategy = route.implementationStrategy;
  if (!strategy || !decision.leaseId) return;

  const state = decision.classification.mutationClass === 'verification_command'
    ? 'verification_pending'
    : 'mutation_started';
  try {
    runtime.routes.updateImplementationStrategy(route.routeContextId, key.id, {
      leaseId: decision.leaseId,
      state,
    });
  } catch (error) {
    if (decision.mode === 'advisory') return;
    throw new ImplementationStrategyError(
      'IMPLEMENTATION_STRATEGY_STALE',
      'Implementation operation completed but strategy state could not be advanced',
      { mutationCommitted: true },
    );
  }
}