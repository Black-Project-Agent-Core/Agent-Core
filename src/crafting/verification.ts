import { redactMemoryText } from '../memory/redaction.js';
import { AgentCoreRouteError, type RouteContextStore } from '../runtime/route-context-store.js';
import type { CraftPlan, CraftingDecision } from './craft-plan.js';
import type { CraftingModeDecision, CraftingReference } from './types.js';

export type CraftingBehaviorDisposition =
  | 'preserved'
  | 'intentionally_changed'
  | 'dropped_non_goal'
  | 'unverified';

export interface CraftingBehaviorVerification {
  behaviorId: string;
  required: boolean;
  disposition: CraftingBehaviorDisposition;
  evidenceRefs: string[];
  planReasonCode?: string;
}

export interface HostCraftingVerification {
  verificationId: string;
  status: 'passed' | 'failed';
  evidenceRefs: string[];
}

export interface CraftingExecutionEvidence {
  processState: 'succeeded' | 'failed' | 'running' | 'unknown';
  requiredEvidenceState: 'verified' | 'pending' | 'failed' | 'not_declared';
}

export interface CraftingImpactEvidence {
  method?: 'graph' | 'fallback' | 'manual';
  completeness: 'complete' | 'partial' | 'insufficient';
  affectedPaths: string[];
  unresolvedUnknowns: string[];
  evidenceRefs: string[];
}

export interface CraftingVerificationRequest {
  decision: CraftingModeDecision;
  craftPlan: CraftPlan;
  donorBehavior: CraftingBehaviorVerification[];
  hostVerification: HostCraftingVerification[];
  execution: CraftingExecutionEvidence;
  impact: CraftingImpactEvidence;
  verificationMode?: 'stable' | 'canary';
}

export interface SafeCraftingProvenance {
  references: Array<{ referenceId: string; kind: string; repository?: string; commit?: string; tree?: string; bundleHash?: string }>;
  decisions: Array<{
    sparepartId: string;
    action: string;
    rationaleCode: string;
    targetPath?: string;
    targetBinding?: string;
    evidenceRefs: string[];
  }>;
}

export interface CraftingMemoryCandidate {
  kind: 'decision';
  canonicalKey: string;
  value: Record<string, unknown>;
  importance: number;
  sourceType: 'crafting';
  sourceRef: string;
}

export interface CraftingVerificationResult {
  status: 'verified' | 'blocked';
  craftingId: string;
  mode: CraftingModeDecision['mode'];
  featureContractHash: string;
  referenceSetHash: string;
  craftPlanId: string;
  donorBehavior: 'passed' | 'blocked' | 'not_applicable';
  hostIntegration: 'passed' | 'failed';
  execution: 'passed' | 'blocked';
  impact: CraftingImpactEvidence;
  behaviorDispositions: CraftingBehaviorVerification[];
  reasonCodes: string[];
  provenance: SafeCraftingProvenance;
  memoryCandidate: CraftingMemoryCandidate | null;
}

function boundedRedacted(value: string, max = 512): string {
  return redactMemoryText(value.slice(0, max)).text;
}

function safeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => boundedRedacted(value.trim())).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function safeReference(reference: CraftingReference): SafeCraftingProvenance['references'][number] {
  return {
    referenceId: boundedRedacted(reference.referenceId, 200),
    kind: reference.kind,
    ...(reference.repository ? { repository: boundedRedacted(reference.repository, 500) } : {}),
    ...(reference.commit ? { commit: reference.commit } : {}),
    ...(reference.tree ? { tree: reference.tree } : {}),
    ...(reference.bundleHash ? { bundleHash: reference.bundleHash } : {}),
  };
}

function safeDecision(decision: CraftingDecision): SafeCraftingProvenance['decisions'][number] {
  return {
    sparepartId: boundedRedacted(decision.sparepartId, 200),
    action: decision.action,
    rationaleCode: boundedRedacted(decision.rationaleCode, 200),
    ...(decision.targetPath ? { targetPath: boundedRedacted(decision.targetPath, 500) } : {}),
    ...(decision.targetBinding ? { targetBinding: boundedRedacted(decision.targetBinding, 500) } : {}),
    evidenceRefs: safeStrings(decision.evidenceRefs),
  };
}

function planIdentityReasons(request: CraftingVerificationRequest): string[] {
  const plan = request.craftPlan;
  const decision = request.decision;
  if (plan.status !== 'ready') return ['CRAFTING_PLAN_NOT_READY'];
  if (plan.craftingId !== decision.craftingId
    || plan.mode !== decision.mode
    || plan.featureContractHash !== decision.featureContractHash
    || plan.referenceSetHash !== decision.referenceSetHash) {
    return ['CRAFTING_PLAN_STALE'];
  }
  return [];
}

function donorBehaviorStatus(request: CraftingVerificationRequest, reasons: string[]): 'passed' | 'blocked' | 'not_applicable' {
  if (request.decision.mode === 'BUILD_FROM_ZERO') return 'not_applicable';
  const byId = new Map(request.donorBehavior.map((item) => [item.behaviorId, item]));
  let blocked = false;
  for (const requirement of request.craftPlan.donorVerification) {
    const behavior = byId.get(requirement);
    if (!behavior || !behavior.required || behavior.disposition === 'unverified' || safeStrings(behavior.evidenceRefs).length === 0) {
      reasons.push('CRAFTING_REQUIRED_BEHAVIOR_UNVERIFIED');
      blocked = true;
      continue;
    }
    if ((behavior.disposition === 'intentionally_changed' || behavior.disposition === 'dropped_non_goal')
      && !behavior.planReasonCode?.trim()) {
      reasons.push('CRAFTING_BEHAVIOR_REASON_REQUIRED');
      blocked = true;
    }
  }
  return blocked ? 'blocked' : 'passed';
}

function hostStatus(request: CraftingVerificationRequest, reasons: string[]): 'passed' | 'failed' {
  const byId = new Map(request.hostVerification.map((item) => [item.verificationId, item]));
  const failed = request.craftPlan.hostVerification.some((requirement) => {
    const item = byId.get(requirement);
    return !item || item.status !== 'passed' || safeStrings(item.evidenceRefs).length === 0;
  });
  if (failed) reasons.push('CRAFTING_HOST_INTEGRATION_FAILED');
  return failed ? 'failed' : 'passed';
}

function executionStatus(request: CraftingVerificationRequest, reasons: string[]): 'passed' | 'blocked' {
  const passed = request.execution.processState === 'succeeded'
    && request.execution.requiredEvidenceState === 'verified';
  if (!passed) reasons.push('CRAFTING_EXECUTION_EVIDENCE_REQUIRED');
  return passed ? 'passed' : 'blocked';
}

function impactReasons(request: CraftingVerificationRequest): string[] {
  const reasons: string[] = [];
  const mode = request.verificationMode ?? 'stable';
  const impact = request.impact;
  if (impact.completeness === 'insufficient'
    || (mode === 'stable' && impact.completeness !== 'complete')
    || safeStrings(impact.evidenceRefs).length === 0) {
    reasons.push('CRAFTING_IMPACT_INCOMPLETE');
  }
  if (impact.unresolvedUnknowns.length > 0) reasons.push('CRAFTING_IMPACT_UNKNOWN');
  return reasons;
}

function safeProvenance(request: CraftingVerificationRequest): SafeCraftingProvenance {
  return {
    references: request.decision.references.map(safeReference),
    decisions: request.craftPlan.decisions.map(safeDecision),
  };
}

function dispositionProjection(values: CraftingBehaviorVerification[]): CraftingBehaviorVerification[] {
  return values.map((item) => ({
    behaviorId: boundedRedacted(item.behaviorId, 300),
    required: item.required,
    disposition: item.disposition,
    evidenceRefs: safeStrings(item.evidenceRefs),
    ...(item.planReasonCode?.trim() ? { planReasonCode: boundedRedacted(item.planReasonCode, 300) } : {}),
  })).sort((left, right) => left.behaviorId.localeCompare(right.behaviorId));
}

export class CraftingVerificationCoordinator {
  async verify(request: CraftingVerificationRequest): Promise<CraftingVerificationResult> {
    const reasons = planIdentityReasons(request);
    const donorBehavior = donorBehaviorStatus(request, reasons);
    const hostIntegration = hostStatus(request, reasons);
    const execution = executionStatus(request, reasons);
    reasons.push(...impactReasons(request));
    const reasonCodes = [...new Set(reasons)].sort();
    const status: 'verified' | 'blocked' = reasonCodes.length === 0 ? 'verified' : 'blocked';
    const provenance = safeProvenance(request);
    const impact: CraftingImpactEvidence = {
      ...(request.impact.method ? { method: request.impact.method } : {}),
      completeness: request.impact.completeness,
      affectedPaths: safeStrings(request.impact.affectedPaths),
      unresolvedUnknowns: safeStrings(request.impact.unresolvedUnknowns),
      evidenceRefs: safeStrings(request.impact.evidenceRefs),
    };
    const memoryCandidate: CraftingMemoryCandidate | null = status === 'verified'
      ? {
        kind: 'decision',
        canonicalKey: `crafting.${request.decision.craftingId}`,
        value: {
          craftingId: request.decision.craftingId,
          mode: request.decision.mode,
          craftPlanId: request.craftPlan.craftPlanId,
          references: provenance.references,
          decisions: provenance.decisions,
          donorBehavior,
          hostIntegration,
          impact: { completeness: impact.completeness, affectedCount: impact.affectedPaths.length },
        },
        importance: 0.8,
        sourceType: 'crafting',
        sourceRef: request.decision.craftingId,
      }
      : null;
    return {
      status,
      craftingId: request.decision.craftingId,
      mode: request.decision.mode,
      featureContractHash: request.decision.featureContractHash,
      referenceSetHash: request.decision.referenceSetHash,
      craftPlanId: request.craftPlan.craftPlanId,
      donorBehavior,
      hostIntegration,
      execution,
      impact,
      behaviorDispositions: dispositionProjection(request.donorBehavior),
      reasonCodes,
      provenance,
      memoryCandidate,
    };
  }
}

export function applyCraftingVerificationToRoute(
  store: RouteContextStore,
  routeContextId: string,
  principalId: string,
  result: CraftingVerificationResult,
) {
  const route = store.getOwned(routeContextId, principalId);
  const crafting = route.crafting;
  const matches = crafting
    && crafting.craftingId === result.craftingId
    && crafting.mode === result.mode
    && crafting.featureContractHash === result.featureContractHash
    && crafting.referenceSetHash === result.referenceSetHash
    && (crafting.craftPlanId ?? '') === result.craftPlanId;
  if (!matches) {
    throw new AgentCoreRouteError('ROUTE_CRAFTING_STALE', 'Verification result does not match active Real Steel crafting state');
  }
  return store.updateCrafting(routeContextId, principalId, {
    state: result.status === 'verified' ? 'closed' : 'verification_pending',
  });
}
