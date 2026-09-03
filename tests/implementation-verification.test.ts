import { describe, expect, it, vi } from 'vitest';
import type { RuntimeAuditLogger } from '../src/logging/audit-log.js';
import type { CodeIntelligenceProvider } from '../src/implementation/code-intelligence.js';
import { resolveImplementationStrategy, type ApprovedReference, type FeatureContract } from '../src/implementation/strategy.js';
import { buildTransplantManifest } from '../src/implementation/transplant-manifest.js';
import {
  ImplementationVerificationCoordinator,
  applyImplementationVerificationToRoute,
} from '../src/implementation/verification.js';
import { RouteContextStore } from '../src/runtime/route-context-store.js';
import type { RoutePlan } from '../src/capabilities/route-types.js';

const feature: FeatureContract = {
  featureId: 'strategy-gate', title: 'Strategy Gate', objective: 'Gate implementation mutation.',
  requiredBehaviors: ['strategy lease'], requiredInvariants: ['plan authority'], explicitNonGoals: [],
  targetAuthorities: ['routing'], verificationRequirements: ['donor parity', 'host integration'],
  planFingerprint: 'a'.repeat(64),
};
const reference: ApprovedReference = {
  referenceId: 'graft', kind: 'git_repo', repository: 'Black-Project-Agent-Core/Graft',
  commit: '65c29667bd59d7137caba8f6f5b5790e2d1f9404', tree: 'fbfcd728b6ebe587678996b20053c81bfd4da3ad',
  featureScope: 'provider-neutral contract', approvalSource: 'operator',
};
const strategy = resolveImplementationStrategy({ planRef: 'plan.md', feature, approvedReferences: [reference] });
const manifest = buildTransplantManifest({
  strategy, feature, analysisCompleteness: 'complete', createdAt: 1,
  components: [{
    referenceId: 'graft', sourcePath: 'src/ai/llm/factory.ts', symbol: 'createChatModel',
    action: 'ADAPT', rationaleCode: 'PROVIDER_NEUTRAL_PATTERN', targetPath: 'src/implementation/strategy.ts',
    evidenceRefs: ['graft:factory:createChatModel'],
  }],
  donorTests: [], hostVerification: ['focused-tests'],
});
function provider(completeness: 'complete' | 'partial' | 'insufficient' = 'complete'): CodeIntelligenceProvider {
  return {
    providerId: () => 'fake-graph',
    mapArchitecture: async () => ({ providerId: 'fake-graph', completeness: 'complete', evidence: [], notes: [], areas: [] }),
    findFeature: async () => ({ providerId: 'fake-graph', completeness: 'complete', evidence: [], notes: [], entryPoints: [] }),
    traceInbound: async () => ({ providerId: 'fake-graph', completeness: 'complete', evidence: [], notes: [], edges: [] }),
    traceOutbound: async () => ({ providerId: 'fake-graph', completeness: 'complete', evidence: [], notes: [], edges: [] }),
    findTests: async () => ({ providerId: 'fake-graph', completeness: 'complete', evidence: [], notes: [], tests: [] }),
    blastRadius: async () => ({
      providerId: 'fake-graph', completeness, notes: completeness === 'complete' ? [] : ['bounded evidence'],
      evidence: [{ path: 'src/dependent.ts', symbol: 'dependent', evidenceType: 'symbol' }],
      affected: [{ path: 'src/dependent.ts', symbol: 'dependent', evidenceType: 'symbol' }],
    }),
    freshness: async () => ({ providerId: 'fake-graph', completeness: 'complete', evidence: [], notes: [], fingerprint: 'f'.repeat(64), fresh: true }),
  };
}

const donorBehavior = [{
  behaviorId: 'provider-neutral-resolution',
  disposition: 'preserved' as const,
  evidenceRefs: ['test:implementation-strategy:provider-neutral'],
}];
const hostIntegration = [{
  verificationId: 'focused-tests', status: 'passed' as const,
  evidenceRefs: ['vitest:focused'],
}];

function request(overrides: Record<string, unknown> = {}) {
  return {
    strategy, manifest, projectRoot: '/repo', changedPaths: ['src/implementation/strategy.ts'],
    provider: provider(), verificationMode: 'stable' as const, reusePosture: 'COMPATIBLE' as const,
    donorBehavior, hostIntegration,
    ...overrides,
  };
}
describe('ImplementationVerificationCoordinator', () => {
  it('verifies graft only when donor parity, host integration, authority, blast, and provenance all pass', async () => {
    const result = await new ImplementationVerificationCoordinator().verify(request());
    expect(result.status).toBe('verified');
    expect(result.donorParity).toBe('passed');
    expect(result.hostIntegration).toBe('passed');
    expect(result.blastRadius).toMatchObject({ providerId: 'fake-graph', completeness: 'complete' });
    expect(result.provenance.donors[0]).toMatchObject({ referenceId: 'graft', commit: reference.commit, tree: reference.tree });
    expect(result.continuity).toMatchObject({ strategyId: strategy.strategyId, mode: 'FEATURE_GRAFT', manifestId: manifest.manifestId, verificationStatus: 'verified' });
    expect(result.memoryCandidate?.value).toMatchObject({ strategyId: strategy.strategyId, manifestId: manifest.manifestId });
  });

  it('keeps donor parity and host integration independent', async () => {
    const donorBlocked = await new ImplementationVerificationCoordinator().verify(request({
      donorBehavior: [{ behaviorId: 'provider-neutral-resolution', disposition: 'unverified', evidenceRefs: [] }],
    }));
    expect(donorBlocked.status).toBe('blocked');
    expect(donorBlocked.donorParity).toBe('blocked');
    expect(donorBlocked.hostIntegration).toBe('passed');

    const hostBlocked = await new ImplementationVerificationCoordinator().verify(request({
      hostIntegration: [{ verificationId: 'focused-tests', status: 'failed', evidenceRefs: ['vitest:red'] }],
    }));
    expect(hostBlocked.status).toBe('blocked');
    expect(hostBlocked.donorParity).toBe('passed');
    expect(hostBlocked.hostIntegration).toBe('failed');
  });
  it('requires complete blast evidence for stable verification but allows bounded partial canary evidence', async () => {
    const stable = await new ImplementationVerificationCoordinator().verify(request({ provider: provider('partial') }));
    expect(stable.status).toBe('blocked');
    expect(stable.reasonCodes).toContain('BLAST_RADIUS_INCOMPLETE');

    const canary = await new ImplementationVerificationCoordinator().verify(request({
      provider: provider('partial'), verificationMode: 'canary',
    }));
    expect(canary.status).toBe('verified');
    expect(canary.reasonCodes).toContain('BLAST_RADIUS_PARTIAL_CANARY');
  });

  it('redacts credential-like evidence and ignores raw donor body fields in projections/audit', async () => {
    const audit = { logRuntime: vi.fn() } as unknown as RuntimeAuditLogger;
    const coordinator = new ImplementationVerificationCoordinator(audit);
    const result = await coordinator.verify(request({
      donorBehavior: [{
        behaviorId: 'provider-neutral-resolution', disposition: 'preserved',
        evidenceRefs: ['token=supersecret-value'], donorBody: 'RAW_DONOR_SENTINEL',
      }],
      hostIntegration: [{
        verificationId: 'focused-tests', status: 'passed',
        evidenceRefs: ['Authorization: Bearer abcdefghijklmnopqrstuvwxyz'],
      }],
    }));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('supersecret-value');
    expect(serialized).not.toContain('RAW_DONOR_SENTINEL');
    expect(serialized).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(audit.logRuntime).toHaveBeenCalledWith('implementation', 'verification_completed', expect.any(Object));
    expect(JSON.stringify((audit.logRuntime as any).mock.calls)).not.toContain('RAW_DONOR_SENTINEL');
  });
  it('closes a route strategy only after verification succeeds', async () => {
    const store = new RouteContextStore();
    const routePlan: RoutePlan = {
      tier: 'structured', mode: 'capability_guided', domain: 'implementation', confidence: 1, risk: 'medium',
      recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['write_file'],
      verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['verification-test'],
    };
    const route = store.create('key-a', routePlan, {
      implementationStrategy: {
        strategyId: strategy.strategyId, mode: strategy.mode,
        planFingerprint: strategy.planFingerprint, referenceSetFingerprint: strategy.referenceSetFingerprint,
        manifestId: manifest.manifestId, leaseId: 'lease-1', state: 'verification_pending',
      },
    });
    const result = await new ImplementationVerificationCoordinator().verify(request());
    applyImplementationVerificationToRoute(store, route.routeContextId, 'key-a', result);
    expect(store.get(route.routeContextId)?.implementationStrategy?.state).toBe('closed');
  });
});