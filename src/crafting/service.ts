import { randomUUID } from 'node:crypto';
import type { CraftingConfig } from '../config.js';
import type { CraftPlan } from './craft-plan.js';
import type { CompatibilityBinding } from './compatibility-surgery.js';
import type { CraftingModeDecision } from './types.js';
import type { RouteCraftingProjection } from '../runtime/route-context-store.js';

export type CraftingErrorCode =
  | 'CRAFTING_REQUIRED'
  | 'CRAFTING_STATE_INVALID'
  | 'CRAFTING_LEASE_INVALID'
  | 'CRAFTING_STALE'
  | 'CRAFT_PLAN_REQUIRED'
  | 'SOURCE_GROUNDING_REQUIRED'
  | 'BUILD_FROM_ZERO_DONOR_EVIDENCE_FORBIDDEN'
  | 'CRAFT_MUTATION_MAPPING_REQUIRED'
  | 'CLEAN_ROOM_PARALLEL_IMPLEMENTATION'
  | 'CRAFT_MUTATION_NOT_ALLOWED'
  | 'CRAFT_MUTATION_PATH_MISMATCH'
  | 'CRAFT_COMPATIBILITY_MAPPING_REQUIRED';

export class CraftingError extends Error {
  constructor(
    readonly code: CraftingErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CraftingError';
  }
}

export interface RegisteredCraftPlan extends CraftPlan {
  compatibilityBindings?: CompatibilityBinding[];
}
export interface CraftingLease {
  leaseId: string;
  principalId: string;
  projectId?: string;
  routeContextId: string;
  craftingId: string;
  mode: RouteCraftingProjection['mode'];
  featureContractHash: string;
  referenceSetHash: string;
  groundingReceiptId?: string;
  craftPlanId: string;
  issuedAt: number;
  expiresAt: number;
}
export interface IssueCraftingLeaseRequest {
  principalId: string;
  projectId?: string;
  routeContextId: string;
  crafting: RouteCraftingProjection;
  routeExpiresAt: number;
}

export interface ValidateCraftingLeaseRequest {
  principalId: string;
  projectId?: string;
  routeContextId: string;
  crafting: RouteCraftingProjection;
}

function scopeEqual(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '') === (right ?? '');
}

export class CraftingService {
  readonly config: CraftingConfig;
  private readonly leases = new Map<string, CraftingLease>();
  private readonly craftPlans = new Map<string, RegisteredCraftPlan>();
  private readonly decisions = new Map<string, CraftingModeDecision>();

  constructor(config: CraftingConfig, private readonly now: () => number = Date.now) {
    this.config = { ...config };
  }
  registerDecision(decision: CraftingModeDecision): CraftingModeDecision {
    const existing = this.decisions.get(decision.craftingId);
    if (existing) {
      const { routeContextId: _existingRoute, ...existingIdentity } = existing;
      const { routeContextId: _nextRoute, ...nextIdentity } = decision;
      if (JSON.stringify(existingIdentity) !== JSON.stringify(nextIdentity)) {
        throw new CraftingError('CRAFTING_STALE', `Crafting decision identity collision: ${decision.craftingId}`);
      }
    }
    const clone = structuredClone(decision);
    this.decisions.set(decision.craftingId, clone);
    return structuredClone(clone);
  }

  getDecision(craftingId: string): CraftingModeDecision | null {
    const decision = this.decisions.get(craftingId);
    return decision ? structuredClone(decision) : null;
  }
  registerCraftPlan(plan: RegisteredCraftPlan): RegisteredCraftPlan {
    if (!plan.craftPlanId || !plan.craftingId || plan.status !== 'ready') {
      throw new CraftingError('CRAFT_PLAN_REQUIRED', 'Only identity-complete ready craft plans may be registered');
    }
    const existing = this.craftPlans.get(plan.craftPlanId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(plan)) {
      throw new CraftingError('CRAFTING_STALE', `Craft plan identity collision: ${plan.craftPlanId}`);
    }
    const clone = structuredClone(plan);
    this.craftPlans.set(plan.craftPlanId, clone);
    return structuredClone(clone);
  }

  getCraftPlan(craftPlanId: string): RegisteredCraftPlan | null {
    const plan = this.craftPlans.get(craftPlanId);
    return plan ? structuredClone(plan) : null;
  }

  issueLease(request: IssueCraftingLeaseRequest): CraftingLease {
    const now = this.now();
    if (request.crafting.state !== 'ready') {
      throw new CraftingError('CRAFTING_STATE_INVALID', `Crafting lease requires ready state, received ${request.crafting.state}`);
    }
    if (!request.crafting.craftPlanId) {
      throw new CraftingError('CRAFT_PLAN_REQUIRED', 'Meaningful coding mutation requires a ready craft plan');
    }
    if (request.crafting.mode === 'FEATURE_TRANSPLANTATION' && !request.crafting.groundingReceiptId) {
      throw new CraftingError('SOURCE_GROUNDING_REQUIRED', 'FEATURE_TRANSPLANTATION requires sufficient source grounding before lease issuance');
    }
    if (!Number.isFinite(request.routeExpiresAt) || request.routeExpiresAt <= now) {
      throw new CraftingError('CRAFTING_LEASE_INVALID', 'Route expiry must be in the future for crafting lease issuance');
    }
    const lease: CraftingLease = {
      leaseId: randomUUID(),
      principalId: request.principalId,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      routeContextId: request.routeContextId,
      craftingId: request.crafting.craftingId,
      mode: request.crafting.mode,
      featureContractHash: request.crafting.featureContractHash,
      referenceSetHash: request.crafting.referenceSetHash,
      ...(request.crafting.groundingReceiptId ? { groundingReceiptId: request.crafting.groundingReceiptId } : {}),
      craftPlanId: request.crafting.craftPlanId,
      issuedAt: now,
      expiresAt: Math.min(request.routeExpiresAt, now + this.config.leaseTtlMs),
    };
    this.leases.set(lease.leaseId, lease);
    return structuredClone(lease);
  }

  validateLease(request: ValidateCraftingLeaseRequest): CraftingLease {
    const leaseId = request.crafting.leaseId;
    if (!leaseId) throw new CraftingError('CRAFTING_REQUIRED', 'Meaningful coding work requires a scoped crafting lease');
    const lease = this.leases.get(leaseId);
    if (!lease || lease.expiresAt <= this.now()) {
      if (lease) this.leases.delete(leaseId);
      throw new CraftingError('CRAFTING_LEASE_INVALID', 'Crafting lease is missing or expired');
    }
    if (lease.principalId !== request.principalId
      || !scopeEqual(lease.projectId, request.projectId)
      || lease.routeContextId !== request.routeContextId) {
      throw new CraftingError('CRAFTING_LEASE_INVALID', 'Crafting lease scope does not match the active route');
    }
    const stale = lease.craftingId !== request.crafting.craftingId
      || lease.mode !== request.crafting.mode
      || lease.featureContractHash !== request.crafting.featureContractHash
      || lease.referenceSetHash !== request.crafting.referenceSetHash
      || (lease.groundingReceiptId ?? '') !== (request.crafting.groundingReceiptId ?? '')
      || lease.craftPlanId !== request.crafting.craftPlanId;
    if (stale) throw new CraftingError('CRAFTING_STALE', 'Crafting lease no longer matches current feature/reference/grounding/craft-plan identity');
    if (request.crafting.state === 'analysis' || request.crafting.state === 'closed') {
      throw new CraftingError('CRAFTING_STATE_INVALID', `Crafting work is not allowed while state is ${request.crafting.state}`);
    }
    return structuredClone(lease);
  }

  revoke(leaseId: string): void {
    this.leases.delete(leaseId);
  }
}
