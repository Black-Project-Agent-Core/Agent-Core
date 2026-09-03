import { describe, expect, it } from 'vitest';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import type { CraftPlan } from '../src/crafting/craft-plan.js';
import { resolveCraftingMode, type CraftingFeatureContract, type CraftingReference } from '../src/crafting/mode-resolver.js';
import {
  CraftingVerificationCoordinator,
  applyCraftingVerificationToRoute,
  type CraftingBehaviorVerification,
  type HostCraftingVerification,
  type CraftingVerificationRequest,
} from '../src/crafting/verification.js';
import { RouteContextStore } from '../src/runtime/route-context-store.js';

const feature: CraftingFeatureContract = {
  featureId: 'verify-fixture', title: 'Verify fixture', objective: 'Verify a crafted feature as native.',
  requiredBehaviors: ['core behavior'], requiredInvariants: ['host ownership'], explicitNonGoals: [],
  targetAuthorities: ['routing'], verificationRequirements: ['focused-test', 'host-integration'],
  planFingerprint: 'a'.repeat(64),
};
const reference: CraftingReference = {
  referenceId: 'donor', kind: 'git_repo', repository: 'owner/repo',
  commit: '1'.repeat(40), tree: '2'.repeat(40), featureScope: 'core', approvalSource: 'user',
};
const decision = resolveCraftingMode({ routeContextId: 'route', projectId: '/host', feature, references: [reference] });
const plan: CraftPlan = {
  craftPlanId: 'craft-plan:verify', craftingId: decision.craftingId, mode: decision.mode,
  featureContractHash: decision.featureContractHash, referenceSetHash: decision.referenceSetHash,
  groundingReceiptId: 'grounding:verify', anatomyId: 'anatomy:verify',
  decisions: [{ sparepartId: 'core', action: 'ADAPT', rationaleCode: 'HOST_API', targetPath: 'src/core.ts',
    preservedBehaviors: ['core behavior'], intentionallyChangedBehaviors: [], evidenceRefs: ['source:core'] }],
  hostVerification: ['focused-test', 'host-integration'], donorVerification: ['core behavior'], status: 'ready', blockingReasons: [],
};
const donorBehavior: CraftingBehaviorVerification[] = [{
  behaviorId: 'core behavior', required: true, disposition: 'preserved', evidenceRefs: ['test:donor-core'],
}];
const hostVerification: HostCraftingVerification[] = [
  { verificationId: 'focused-test', status: 'passed', evidenceRefs: ['vitest:focused'] },
  { verificationId: 'host-integration', status: 'passed', evidenceRefs: ['vitest:integration'] },
];

function request(overrides: Partial<CraftingVerificationRequest> = {}): CraftingVerificationRequest {
  return {
    decision,
    craftPlan: plan,
    donorBehavior,
    hostVerification,
    execution: { processState: 'succeeded', requiredEvidenceState: 'verified' },
    impact: { completeness: 'complete', affectedPaths: ['src/dependent.ts'], unresolvedUnknowns: [], evidenceRefs: ['impact:1'] },
    verificationMode: 'stable',
    ...overrides,
  };
}
function routePlan(): RoutePlan {
  return {
    tier: 'task_scoped', mode: 'capability_guided', domain: 'implementation', confidence: 1, risk: 'medium',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['write_file'],
    verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['crafting_verification'],
  };
}

describe('Real Steel native-feature verification', () => {
  it('keeps donor behavior parity and host integration as independent evidence dimensions', async () => {
    const donorBlocked = await new CraftingVerificationCoordinator().verify(request({
      donorBehavior: [{ behaviorId: 'core behavior', required: true, disposition: 'unverified', evidenceRefs: [] }],
    }));
    expect(donorBlocked.status).toBe('blocked');
    expect(donorBlocked.donorBehavior).toBe('blocked');
    expect(donorBlocked.hostIntegration).toBe('passed');

    const hostBlocked = await new CraftingVerificationCoordinator().verify(request({
      hostVerification: [{ verificationId: 'focused-test', status: 'failed', evidenceRefs: ['vitest:red'] }],
    }));
    expect(hostBlocked.status).toBe('blocked');
    expect(hostBlocked.donorBehavior).toBe('passed');
    expect(hostBlocked.hostIntegration).toBe('failed');
  });

  it.each([
    ['preserved', undefined],
    ['intentionally_changed', 'PLAN_INTENT'],
    ['dropped_non_goal', 'EXPLICIT_NON_GOAL'],
  ] as const)('accepts %s required behavior only with factual evidence and required plan rationale', async (disposition, planReasonCode) => {
    const result = await new CraftingVerificationCoordinator().verify(request({
      donorBehavior: [{ behaviorId: 'core behavior', required: true, disposition, evidenceRefs: ['behavior:evidence'], ...(planReasonCode ? { planReasonCode } : {}) }],
    }));
    expect(result.status).toBe('verified');
    expect(result.behaviorDispositions[0]?.disposition).toBe(disposition);
  });

  it('blocks any required behavior left unverified', async () => {
    const result = await new CraftingVerificationCoordinator().verify(request({
      donorBehavior: [{ behaviorId: 'core behavior', required: true, disposition: 'unverified', evidenceRefs: ['missing:test'] }],
    }));
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('CRAFTING_REQUIRED_BEHAVIOR_UNVERIFIED');
  });

  it('does not close on process exit zero when required tests or artifacts are still pending', async () => {
    const result = await new CraftingVerificationCoordinator().verify(request({
      execution: { processState: 'succeeded', requiredEvidenceState: 'pending' },
    }));
    expect(result.status).toBe('blocked');
    expect(result.reasonCodes).toContain('CRAFTING_EXECUTION_EVIDENCE_REQUIRED');
  });

  it('requires sufficient impact evidence and blocks unresolved unknowns for stable completion', async () => {
    const partial = await new CraftingVerificationCoordinator().verify(request({
      impact: { completeness: 'partial', affectedPaths: ['src/a.ts'], unresolvedUnknowns: [], evidenceRefs: ['impact:partial'] },
    }));
    expect(partial.reasonCodes).toContain('CRAFTING_IMPACT_INCOMPLETE');
    const unknown = await new CraftingVerificationCoordinator().verify(request({
      impact: { completeness: 'complete', affectedPaths: ['src/a.ts'], unresolvedUnknowns: ['caller unknown'], evidenceRefs: ['impact:complete'] },
    }));
    expect(unknown.reasonCodes).toContain('CRAFTING_IMPACT_UNKNOWN');
  });

  it('produces bounded redacted provenance without raw donor bodies or credentials', async () => {
    const unsafe: CraftPlan = structuredClone(plan);
    unsafe.decisions[0]!.evidenceRefs = ['token=SUPER_SECRET_VALUE', 'source:core'];
    const result = await new CraftingVerificationCoordinator().verify(request({ craftPlan: unsafe }));
    expect(result.status).toBe('verified');
    const text = JSON.stringify({ provenance: result.provenance, memoryCandidate: result.memoryCandidate });
    expect(text).not.toContain('SUPER_SECRET_VALUE');
    expect(text).not.toMatch(/sourceBody|donorBody/i);
    expect(text).toContain('[REDACTED:TOKEN]');
  });

  it('closes matching route crafting state only after verified terminal evidence', async () => {
    const result = await new CraftingVerificationCoordinator().verify(request());
    expect(result.status).toBe('verified');
    expect(result.reasonCodes).toEqual([]);
    const store = new RouteContextStore();
    const route = store.create('principal', routePlan(), {
      projectId: '/host',
      crafting: {
        craftingId: decision.craftingId, mode: decision.mode,
        featureContractHash: decision.featureContractHash, referenceSetHash: decision.referenceSetHash,
        groundingReceiptId: plan.groundingReceiptId, craftPlanId: plan.craftPlanId, state: 'verification_pending',
      },
    });
    const closed = applyCraftingVerificationToRoute(store, route.routeContextId, 'principal', result);
    expect(closed.crafting?.state).toBe('closed');
    expect(result.memoryCandidate).not.toBeNull();
  });
});
