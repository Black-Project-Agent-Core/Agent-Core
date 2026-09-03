import { createHash } from 'node:crypto';
import type { CraftPlan, CraftingDecision } from './craft-plan.js';
import {
  PROTECTED_CRAFTING_AUTHORITIES,
  type CraftingAuthorityConflict,
  type DonorAuthorityClaim,
} from './authority-registry.js';

export type CompatibilitySurgery =
  | 'NONE'
  | 'ADAPTER'
  | 'TYPE_MAP'
  | 'AUTHORITY_REPLACEMENT'
  | 'LIFECYCLE_REWIRE'
  | 'ERROR_MAP';

export interface CompatibilityBinding {
  sparepartId: string;
  boundary: string;
  donorContract: string;
  hostContract: string;
  surgery: CompatibilitySurgery;
  verificationRequirement: string;
  preservesHostAuthority: boolean;
}

export interface CompatibleCraftPlan extends CraftPlan {
  compatibilityBindings: CompatibilityBinding[];
  authorityConflicts: CraftingAuthorityConflict[];
}

export class CompatibilitySurgeryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'CompatibilitySurgeryError';
  }
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function bindingKey(item: CompatibilityBinding): string {
  return [item.sparepartId, item.boundary, item.hostContract, item.donorContract, item.surgery].join('\u0000');
}

function normalizeBinding(item: CompatibilityBinding): CompatibilityBinding {
  const result = {
    sparepartId: item.sparepartId.trim(),
    boundary: item.boundary.trim(),
    donorContract: item.donorContract.trim(),
    hostContract: item.hostContract.trim(),
    surgery: item.surgery,
    verificationRequirement: item.verificationRequirement.trim(),
    preservesHostAuthority: item.preservesHostAuthority,
  };
  if (!result.sparepartId || !result.boundary || !result.donorContract
    || !result.hostContract || !result.verificationRequirement) {
    throw new CompatibilitySurgeryError('COMPATIBILITY_BINDING_INVALID', 'Compatibility bindings require sparepart, boundary, contracts, and verification');
  }
  if (!result.preservesHostAuthority) {
    throw new CompatibilitySurgeryError('HOST_GUARDRAIL_WEAKENED', `Compatibility binding weakens host authority: ${result.sparepartId}/${result.boundary}`);
  }
  return result;
}
function conflictId(value: Omit<CraftingAuthorityConflict, 'conflictId'>): string {
  return `authority:${createHash('sha256').update(stableJson(value), 'utf8').digest('hex').slice(0, 32)}`;
}

function authorityConflict(
  claim: DonorAuthorityClaim,
  status: 'resolved' | 'blocking',
  reasonCode: CraftingAuthorityConflict['reasonCode'],
  targetBinding?: string,
): CraftingAuthorityConflict {
  const body: Omit<CraftingAuthorityConflict, 'conflictId'> = {
    sparepartId: claim.sparepartId,
    authorityId: claim.authorityId,
    status,
    reasonCode,
    ...(targetBinding ? { targetBinding } : {}),
  };
  return { conflictId: conflictId(body), ...body };
}

function evaluateClaims(
  decisions: Map<string, CraftingDecision>,
  bindings: CompatibilityBinding[],
  claims: DonorAuthorityClaim[],
): CraftingAuthorityConflict[] {
  const conflicts: CraftingAuthorityConflict[] = [];
  for (const claim of claims) {
    if (claim.role !== 'owner') continue;
    const decision = decisions.get(claim.sparepartId);
    if (!decision) {
      conflicts.push(authorityConflict(claim, 'blocking', 'AUTHORITY_SPAREPART_NOT_FOUND'));
      continue;
    }
    if (decision.action === 'DROP') {
      conflicts.push(authorityConflict(claim, 'resolved', 'DONOR_AUTHORITY_DROPPED'));
      continue;
    }
    const canonical = PROTECTED_CRAFTING_AUTHORITIES[claim.authorityId].canonicalBinding;
    const boundary = bindings.find((item) => item.sparepartId === claim.sparepartId
      && item.hostContract === canonical
      && (item.surgery === 'AUTHORITY_REPLACEMENT' || item.surgery === 'ADAPTER'));
    const boundaryAction = decision.action === 'ADAPT'
      || decision.action === 'REPLACE'
      || decision.action === 'REIMPLEMENT';
    if (boundary && boundaryAction && decision.targetBinding === canonical) {
      conflicts.push(authorityConflict(claim, 'resolved', 'BOUND_TO_CANONICAL_AUTHORITY', canonical));
      continue;
    }
    conflicts.push(authorityConflict(
      claim,
      'blocking',
      'DUPLICATE_AUTHORITY_OWNER',
      decision.targetBinding,
    ));
  }
  return conflicts.sort((left, right) => left.conflictId.localeCompare(right.conflictId));
}

export function applyCompatibilitySurgery(input: {
  craftPlan: CraftPlan;
  bindings: CompatibilityBinding[];
  authorityClaims: DonorAuthorityClaim[];
}): CompatibleCraftPlan {
  if (input.craftPlan.status !== 'ready') {
    throw new CompatibilitySurgeryError('CRAFT_PLAN_NOT_READY', 'Compatibility surgery requires a decision-ready craft plan');
  }
  const decisions = new Map(input.craftPlan.decisions.map((item) => [item.sparepartId, item]));
  const bindings = input.bindings.map(normalizeBinding)
    .sort((left, right) => bindingKey(left).localeCompare(bindingKey(right)));
  const seenBindings = new Set<string>();
  for (const item of bindings) {
    if (!decisions.has(item.sparepartId)) {
      throw new CompatibilitySurgeryError('COMPATIBILITY_SPAREPART_UNKNOWN', `Binding targets unknown sparepart: ${item.sparepartId}`);
    }
    if (decisions.get(item.sparepartId)?.action === 'DROP') {
      throw new CompatibilitySurgeryError('COMPATIBILITY_FOR_DROPPED_SPAREPART', `Dropped sparepart cannot carry a compatibility binding: ${item.sparepartId}`);
    }
    const key = bindingKey(item);
    if (seenBindings.has(key)) throw new CompatibilitySurgeryError('COMPATIBILITY_BINDING_DUPLICATE', `Duplicate compatibility binding: ${key}`);
    seenBindings.add(key);
  }

  const blockingReasons: string[] = [];
  for (const decision of input.craftPlan.decisions) {
    if (!decision.targetBinding) continue;
    const mapped = bindings.some((item) => item.sparepartId === decision.sparepartId
      && item.hostContract === decision.targetBinding);
    if (!mapped) blockingReasons.push(`COMPATIBILITY_BINDING_REQUIRED:${decision.sparepartId}`);
  }
  const authorityConflicts = evaluateClaims(decisions, bindings, input.authorityClaims);
  blockingReasons.push(...authorityConflicts
    .filter((item) => item.status === 'blocking')
    .map((item) => `AUTHORITY_CONFLICT:${item.sparepartId}:${item.authorityId}`));
  blockingReasons.sort();
  const identity = {
    baseCraftPlanId: input.craftPlan.craftPlanId,
    bindings,
    authorityConflicts,
    blockingReasons,
  };
  return {
    ...structuredClone(input.craftPlan),
    craftPlanId: `craft-plan:${createHash('sha256').update(stableJson(identity), 'utf8').digest('hex').slice(0, 32)}`,
    compatibilityBindings: bindings,
    authorityConflicts,
    status: blockingReasons.length > 0 ? 'blocked' : 'ready',
    blockingReasons,
  };
}
