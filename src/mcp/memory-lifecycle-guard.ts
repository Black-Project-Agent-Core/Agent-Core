import type { VerifiedKey } from '../auth/key-types.js';
import { MemoryHardLifecycleError } from '../memory/hard-lifecycle.js';
import {
  classifyMeaningfulWork,
  type MeaningfulWorkClassification,
} from '../memory/meaningful-work.js';
import type { RouteContext } from '../runtime/route-context-store.js';
import type { RuntimeServices } from '../runtime/services.js';

export interface MemoryLifecycleGuardDecision {
  mode: 'disabled' | 'advisory' | 'enforce';
  required: boolean;
  valid: boolean;
  classification: MeaningfulWorkClassification;
  contextId?: string;
  advisoryCode?: 'MEMORY_PREFLIGHT_REQUIRED';
}

function scope(runtime: RuntimeServices, key: VerifiedKey, route: RouteContext) {
  return {
    principalId: key.id,
    projectId: route.projectId ?? runtime.workspace.resolveProjectRoot(),
  };
}

function complianceError(message: string, cause?: unknown): MemoryHardLifecycleError {
  const causeCode = cause && typeof cause === 'object' && 'code' in cause && typeof (cause as { code?: unknown }).code === 'string'
    ? String((cause as { code: string }).code)
    : undefined;
  return new MemoryHardLifecycleError(
    'MEMORY_PREFLIGHT_REQUIRED',
    message,
    causeCode ? { causeCode } : undefined,
  );
}

async function bestEffortAdvisoryAudit(
  runtime: RuntimeServices,
  key: VerifiedKey,
  route: RouteContext,
  toolName: string,
  classification: MeaningfulWorkClassification,
  error: unknown,
): Promise<void> {
  if (!runtime.memory.config.enabled) return;
  try {
    await runtime.memory.recordEvent({
      scope: scope(runtime, key, route),
      eventType: 'memory.lifecycle_advisory',
      sourceType: 'hard_lifecycle_guard',
      sourceRef: route.routeContextId,
      text: `${toolName} would require persisted memory preflight in enforce mode`,
      metadata: {
        routeContextId: route.routeContextId,
        toolName,
        reasonCode: classification.reasonCode,
        mutationClass: classification.mutationClass,
        advisoryCode: 'MEMORY_PREFLIGHT_REQUIRED',
        causeCode: error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '',
      },
    });
  } catch {
    // Advisory audit is best-effort and never converts advisory mode into enforcement.
  }
}

export async function validateMemoryLifecycleBeforeOperation(
  runtime: RuntimeServices,
  key: VerifiedKey,
  route: RouteContext,
  toolName: string,
  input: Record<string, unknown> = {},
): Promise<MemoryLifecycleGuardDecision> {
  const classification = classifyMeaningfulWork(toolName, input);
  const mode = runtime.memory.config.hardLifecycleMode;
  if (!classification.meaningful) {
    return { mode, required: false, valid: true, classification };
  }
  if (mode === 'disabled') {
    return { mode, required: false, valid: true, classification };
  }

  const contextId = route.memorySnapshot?.memoryContextId;
  let complianceFailure: unknown;
  if (!contextId) {
    complianceFailure = complianceError('A persisted memory preflight context is required before meaningful work');
  } else {
    try {
      await runtime.memory.validateLifecycleContext({
        scope: scope(runtime, key, route),
        contextId,
        routeContextId: route.routeContextId,
      });
      return { mode, required: true, valid: true, classification, contextId };
    } catch (error) {
      complianceFailure = error;
    }
  }

  if (mode === 'advisory') {
    await bestEffortAdvisoryAudit(runtime, key, route, toolName, classification, complianceFailure);
    return {
      mode,
      required: true,
      valid: false,
      classification,
      ...(contextId ? { contextId } : {}),
      advisoryCode: 'MEMORY_PREFLIGHT_REQUIRED',
    };
  }

  if (complianceFailure instanceof MemoryHardLifecycleError) throw complianceFailure;
  throw complianceError('A healthy persisted memory preflight context is required before meaningful work', complianceFailure);
}

export async function completeMemoryLifecycleOperation(
  runtime: RuntimeServices,
  key: VerifiedKey,
  route: RouteContext,
  toolName: string,
  decision: MemoryLifecycleGuardDecision,
): Promise<void> {
  if (!decision.classification.meaningful || decision.mode === 'disabled' || !decision.valid || !decision.contextId) return;
  try {
    await runtime.memory.markLifecycleMeaningfulWork({
      scope: scope(runtime, key, route),
      contextId: decision.contextId,
      routeContextId: route.routeContextId,
      toolName,
      reasonCode: decision.classification.reasonCode,
    });
  } catch (error) {
    if (decision.mode === 'advisory') return;
    const causeCode = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? String((error as { code: string }).code)
      : undefined;
    throw new MemoryHardLifecycleError(
      'MEMORY_POSTFLIGHT_REQUIRED',
      'Meaningful work completed locally but its memory lifecycle could not be marked POSTFLIGHT_PENDING',
      { mutationCommitted: true, ...(causeCode ? { causeCode } : {}) },
    );
  }
}
