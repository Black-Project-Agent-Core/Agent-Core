import type { VerifiedKey } from '../auth/key-types.js';
import type { CraftPlan, CraftingDecision } from '../crafting/craft-plan.js';
import {
  CraftingError,
  type CraftingErrorCode,
} from '../crafting/service.js';
import {
  classifyCraftingMutation,
  parseCraftingMutationIntent,
  type CraftingMutationClassification,
  type CraftingMutationIntent,
} from '../crafting/mutation-intent.js';
import type { RouteContext, RouteCraftingProjection } from '../runtime/route-context-store.js';
import type { RuntimeServices } from '../runtime/services.js';

export interface CraftingGuardDecision {
  enforcement: 'disabled' | 'advisory' | 'enforce';
  required: boolean;
  valid: boolean;
  classification: CraftingMutationClassification;
  leaseId?: string;
  advisoryCode?: CraftingErrorCode;
}

function projectId(runtime: RuntimeServices, route: RouteContext): string {
  return route.projectId ?? runtime.workspace.resolveProjectRoot();
}

function craftingRequired(): CraftingError {
  return new CraftingError(
    'CRAFTING_REQUIRED',
    'Meaningful coding work requires Real Steel crafting state and a scoped lease',
  );
}

function requireRegisteredPlan(
  runtime: RuntimeServices,
  crafting: RouteCraftingProjection,
): CraftPlan {
  if (!crafting.craftPlanId) {
    throw new CraftingError('CRAFT_PLAN_REQUIRED', 'Crafting route is missing a craft plan identity');
  }
  const plan = runtime.crafting.getCraftPlan(crafting.craftPlanId);
  if (!plan) {
    throw new CraftingError('CRAFT_PLAN_REQUIRED', 'Craft plan is not registered for mutation enforcement');
  }
  const stale = plan.status !== 'ready'
    || plan.craftingId !== crafting.craftingId
    || plan.mode !== crafting.mode
    || plan.featureContractHash !== crafting.featureContractHash
    || plan.referenceSetHash !== crafting.referenceSetHash
    || (plan.groundingReceiptId ?? '') !== (crafting.groundingReceiptId ?? '');
  if (stale) throw new CraftingError('CRAFTING_STALE', 'Registered craft plan no longer matches the route crafting identity');
  return plan;
}

function decisionFor(plan: CraftPlan, intent: CraftingMutationIntent): CraftingDecision {
  if (!intent.sparepartId) {
    throw new CraftingError('CRAFT_MUTATION_MAPPING_REQUIRED', 'Transplant mutation must identify the selected sparepart');
  }
  const decision = plan.decisions.find((item) => item.sparepartId === intent.sparepartId);
  if (!decision || decision.action === 'DROP') {
    throw new CraftingError('CRAFT_MUTATION_NOT_ALLOWED', `Craft plan does not allow mutation for sparepart: ${intent.sparepartId}`);
  }
  return decision;
}

function validateTransplantIntent(plan: CraftPlan, intent: CraftingMutationIntent | undefined): void {
  if (!intent) {
    throw new CraftingError('CRAFT_MUTATION_MAPPING_REQUIRED', 'FEATURE_TRANSPLANTATION source mutation must map to a craft-plan decision');
  }
  const decision = decisionFor(plan, intent);
  if (intent.origin === 'host_original' && (decision.action === 'KEEP' || decision.action === 'ADAPT')) {
    throw new CraftingError(
      'CLEAN_ROOM_PARALLEL_IMPLEMENTATION',
      `Selected ${decision.action} sparepart must be transplanted/adapted rather than rebuilt in parallel: ${decision.sparepartId}`,
    );
  }
  if (intent.origin === 'donor_derived' && decision.action !== 'KEEP' && decision.action !== 'ADAPT') {
    throw new CraftingError('CRAFT_MUTATION_NOT_ALLOWED', `Donor-derived mutation is incompatible with ${decision.action}: ${decision.sparepartId}`);
  }
  if (intent.origin === 'compatibility' && decision.action !== 'ADAPT' && decision.action !== 'REPLACE') {
    throw new CraftingError('CRAFT_MUTATION_NOT_ALLOWED', `Compatibility mutation is incompatible with ${decision.action}: ${decision.sparepartId}`);
  }
}

function validateMutationIntent(
  plan: CraftPlan,
  classification: CraftingMutationClassification,
  input: Record<string, unknown>,
): void {
  if (classification.mutationClass === 'verification_command') return;
  let intent: CraftingMutationIntent | undefined;
  try {
    intent = parseCraftingMutationIntent(input);
  } catch (error) {
    throw new CraftingError(
      'CRAFT_MUTATION_MAPPING_REQUIRED',
      error instanceof Error ? error.message : 'Crafting mutation intent is invalid',
    );
  }
  if (plan.mode === 'BUILD_FROM_ZERO') {
    if (intent?.origin === 'donor_derived' || intent?.origin === 'compatibility') {
      throw new CraftingError(
        'BUILD_FROM_ZERO_DONOR_EVIDENCE_FORBIDDEN',
        'BUILD_FROM_ZERO cannot accept donor-derived or compatibility transplantation mutation',
      );
    }
    return;
  }
  validateTransplantIntent(plan, intent);
}

export async function validateCraftingBeforeOperation(
  runtime: RuntimeServices,
  key: VerifiedKey,
  route: RouteContext,
  toolName: string,
  input: Record<string, unknown> = {},
): Promise<CraftingGuardDecision> {
  const classification = classifyCraftingMutation(toolName, input);
  const enforcement = runtime.crafting.config.enforcement;
  if (!classification.required || enforcement === 'disabled') {
    return { enforcement, required: false, valid: true, classification };
  }

  let failure: CraftingError | undefined;
  const crafting = route.crafting;
  if (!crafting) {
    failure = craftingRequired();
  } else {
    try {
      const lease = runtime.crafting.validateLease({
        principalId: key.id,
        projectId: projectId(runtime, route),
        routeContextId: route.routeContextId,
        crafting,
      });
      const plan = requireRegisteredPlan(runtime, crafting);
      validateMutationIntent(plan, classification, input);
      return { enforcement, required: true, valid: true, classification, leaseId: lease.leaseId };
    } catch (error) {
      failure = error instanceof CraftingError
        ? error
        : new CraftingError('CRAFTING_REQUIRED', error instanceof Error ? error.message : 'Crafting validation failed');
    }
  }

  if (enforcement === 'advisory') {
    runtime.audit.logRuntime('crafting', 'guard_advisory', {
      routeContextId: route.routeContextId,
      toolName,
      reasonCode: classification.reasonCode,
      mutationClass: classification.mutationClass,
      advisoryCode: failure.code,
    });
    return {
      enforcement,
      required: true,
      valid: false,
      classification,
      advisoryCode: failure.code,
    };
  }
  throw failure;
}

export async function completeCraftingOperation(
  runtime: RuntimeServices,
  key: VerifiedKey,
  route: RouteContext,
  decision: CraftingGuardDecision,
): Promise<void> {
  if (!decision.required || !decision.valid || decision.enforcement === 'disabled') return;
  if (!route.crafting || !decision.leaseId) return;
  const state = decision.classification.mutationClass === 'verification_command'
    ? 'verification_pending'
    : 'mutation_started';
  try {
    runtime.routes.updateCrafting(route.routeContextId, key.id, { leaseId: decision.leaseId, state });
  } catch (error) {
    if (decision.enforcement === 'advisory') return;
    throw new CraftingError(
      'CRAFTING_STALE',
      'Crafting operation committed but route crafting state could not be advanced',
      { mutationCommitted: true },
    );
  }
}
