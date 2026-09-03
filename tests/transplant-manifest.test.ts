import { describe, expect, it } from 'vitest';
import { resolveImplementationStrategy, type ApprovedReference, type FeatureContract } from '../src/implementation/strategy.js';
import {
  TransplantManifestError,
  buildTransplantManifest,
  type TransplantComponent,
} from '../src/implementation/transplant-manifest.js';

const feature: FeatureContract = {
  featureId: 'strategy-gate', title: 'Strategy Gate', objective: 'Enforce strategy before mutation.',
  requiredBehaviors: ['resolve strategy'], requiredInvariants: ['plan wins'], explicitNonGoals: [],
  targetAuthorities: ['routing'], verificationRequirements: ['deterministic replay'],
  planFingerprint: 'a'.repeat(64),
};

const refs: ApprovedReference[] = [
  {
    referenceId: 'graft', kind: 'git_repo', repository: 'Black-Project-Agent-Core/Graft',
    commit: '65c29667bd59d7137caba8f6f5b5790e2d1f9404', tree: 'fbfcd728b6ebe587678996b20053c81bfd4da3ad',
    featureScope: 'provider neutral', approvalSource: 'operator',
  },
  {
    referenceId: 'cbm', kind: 'git_repo', repository: 'Black-Project-Agent-Core/codebase-memory-mcp',
    commit: '4d8ac9e1cea0d645a02f876f47536c54a5bfa406', tree: 'afccfb0e1d82ffb0690e01b19c9f7fd4ec446ad2',
    featureScope: 'fingerprints', approvalSource: 'operator',
  },
];

const strategy = resolveImplementationStrategy({ planRef: 'plan.md', feature, approvedReferences: refs });
const components: TransplantComponent[] = [
  {
    referenceId: 'graft', sourcePath: 'src/ai/llm/factory.ts', symbol: 'createChatModel',
    action: 'ADAPT', rationaleCode: 'PROVIDER_NEUTRAL_PATTERN', evidenceRefs: ['graft:factory:createChatModel'],
    targetPath: 'src/implementation/strategy.ts',
  },
  {
    referenceId: 'cbm', sourcePath: 'src/daemon/service.c', symbol: 'cbm_daemon_build_fingerprint_file',
    action: 'ADAPT', rationaleCode: 'IMMUTABLE_FINGERPRINT_PATTERN', evidenceRefs: ['cbm:service:fingerprint'],
    targetPath: 'src/implementation/strategy.ts',
  },
];

function expectManifestError(run: () => unknown, code: string) {
  try {
    run();
    throw new Error('expected manifest build to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(TransplantManifestError);
    expect((error as TransplantManifestError).code).toBe(code);
  }
}

describe('transplant manifest planner', () => {
  it('builds a deterministic FEATURE_GRAFT manifest with sorted component provenance', () => {
    const first = buildTransplantManifest({
      strategy, feature, analysisCompleteness: 'complete', components, createdAt: 100,
      donorTests: [], hostVerification: ['focused-tests'],
    });
    const second = buildTransplantManifest({
      strategy, feature, analysisCompleteness: 'complete', components: [...components].reverse(), createdAt: 200,
      donorTests: [], hostVerification: ['focused-tests'],
    });
    expect(first.manifestId).toBe(second.manifestId);
    expect(first.featureContractHash).toBe(second.featureContractHash);
    expect(first.donorSetHash).toBe(strategy.referenceSetFingerprint);
    expect(first.components.map((item) => item.referenceId)).toEqual(['cbm', 'graft']);
  });
  it('rejects readiness when donor anatomy evidence is insufficient', () => {
    expectManifestError(
      () => buildTransplantManifest({
        strategy, feature, analysisCompleteness: 'insufficient', components, createdAt: 100,
        donorTests: [], hostVerification: ['focused-tests'],
      }),
      'DONOR_ANALYSIS_INSUFFICIENT',
    );
  });

  it('requires classification rationale and evidence for every selected component', () => {
    expectManifestError(
      () => buildTransplantManifest({
        strategy, feature, analysisCompleteness: 'complete', createdAt: 100,
        components: [{ ...components[0]!, rationaleCode: '', evidenceRefs: [] }],
        donorTests: [], hostVerification: ['focused-tests'],
      }),
      'TRANSPLANT_COMPONENT_INVALID',
    );
  });

  it('rejects components that point at donors outside the active strategy', () => {
    expectManifestError(
      () => buildTransplantManifest({
        strategy, feature, analysisCompleteness: 'complete', createdAt: 100,
        components: [{ ...components[0]!, referenceId: 'foreign' }],
        donorTests: [], hostVerification: ['focused-tests'],
      }),
      'TRANSPLANT_REFERENCE_NOT_APPROVED',
    );
  });
});

describe('transplant manifest authority readiness', () => {
  it('binds authority conflict outcome into readiness and manifest identity', () => {
    const baseConflict = {
      conflictId: 'authority:one', referenceId: 'graft', sourcePath: 'src/ai/llm/factory.ts',
      authorityId: 'routing' as const, targetBinding: 'CapabilityRouter/RouteContextStore',
    };
    const blocked = buildTransplantManifest({
      strategy, feature, analysisCompleteness: 'complete', components, createdAt: 100,
      donorTests: [], hostVerification: ['focused-tests'],
      authorityConflicts: [{ ...baseConflict, status: 'blocking' as const, reasonCode: 'DUPLICATE_AUTHORITY_OWNER' as const }],
    });
    const ready = buildTransplantManifest({
      strategy, feature, analysisCompleteness: 'complete', components, createdAt: 100,
      donorTests: [], hostVerification: ['focused-tests'],
      authorityConflicts: [{ ...baseConflict, status: 'resolved' as const, reasonCode: 'BOUND_TO_CANONICAL_AUTHORITY' as const }],
    });
    expect(blocked.readiness).toBe('blocked');
    expect(ready.readiness).toBe('ready');
    expect(blocked.manifestId).not.toBe(ready.manifestId);
  });
});