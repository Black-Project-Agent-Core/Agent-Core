import { describe, expect, it } from 'vitest';
import {
  ImplementationStrategyResolutionError,
  resolveImplementationStrategy,
  type ApprovedReference,
  type FeatureContract,
} from '../src/implementation/strategy.js';

const feature: FeatureContract = {
  featureId: 'implementation-strategy-gate',
  title: 'Implementation Strategy Gate',
  objective: 'Resolve one implementation strategy before mutation.',
  requiredBehaviors: ['resolve greenfield', 'resolve feature graft'],
  requiredInvariants: ['no hidden hybrid'],
  explicitNonGoals: ['choose donor behavior over the plan'],
  targetAuthorities: ['routing', 'memory lifecycle'],
  verificationRequirements: ['deterministic replay'],
  planFingerprint: 'a'.repeat(64),
};

const graft: ApprovedReference = {
  referenceId: 'graft',
  kind: 'git_repo',
  repository: 'Black-Project-Agent-Core/Graft',
  commit: '65c29667bd59d7137caba8f6f5b5790e2d1f9404',
  tree: 'fbfcd728b6ebe587678996b20053c81bfd4da3ad',
  featureScope: 'provider-neutral contracts',
  approvalSource: 'operator',
};
const cbm: ApprovedReference = {
  referenceId: 'cbm',
  kind: 'git_repo',
  repository: 'Black-Project-Agent-Core/codebase-memory-mcp',
  commit: '4d8ac9e1cea0d645a02f876f47536c54a5bfa406',
  tree: 'afccfb0e1d82ffb0690e01b19c9f7fd4ec446ad2',
  featureScope: 'fingerprint and evidence contracts',
  approvalSource: 'operator',
};

function request(references: ApprovedReference[] = []) {
  return {
    planRef: 'docs/roadmap/agent-core-plan-driven-implementation-strategy-gate.md',
    feature,
    approvedReferences: references,
  } as const;
}

function expectResolutionError(run: () => unknown, code: string) {
  try {
    run();
    throw new Error('expected strategy resolution to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ImplementationStrategyResolutionError);
    expect((error as ImplementationStrategyResolutionError).code).toBe(code);
  }
}

describe('implementation strategy resolver', () => {
  it('resolves zero approved references to GREENFIELD with an explicit reason', () => {
    const result = resolveImplementationStrategy(request());
    expect(result.mode).toBe('GREENFIELD');
    expect(result.reasonCodes).toEqual(['NO_APPROVED_REFERENCE']);
    expect(result.approvedReferences).toEqual([]);
    expect(result.referenceSetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.strategyFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resolves an approved donor to FEATURE_GRAFT and preserves immutable donor identity', () => {
    const result = resolveImplementationStrategy(request([graft]));
    expect(result.mode).toBe('FEATURE_GRAFT');
    expect(result.reasonCodes).toEqual(['APPROVED_REFERENCE_PRESENT']);
    expect(result.approvedReferences[0]).toMatchObject({
      referenceId: 'graft', commit: graft.commit, tree: graft.tree,
    });
  });

  it('makes multiple-donor fingerprints independent of declaration order', () => {
    const left = resolveImplementationStrategy(request([graft, cbm]));
    const right = resolveImplementationStrategy(request([cbm, graft]));
    expect(left.referenceSetFingerprint).toBe(right.referenceSetFingerprint);
    expect(left.strategyFingerprint).toBe(right.strategyFingerprint);
    expect(left.reasonCodes).toEqual([
      'APPROVED_REFERENCE_PRESENT', 'MULTIPLE_APPROVED_REFERENCES',
    ]);
    expect(left.approvedReferences.map((entry) => entry.referenceId)).toEqual(['cbm', 'graft']);
  });

  it('fails closed when the plan requires a donor but none is resolved', () => {    expectResolutionError(
      () => resolveImplementationStrategy({ ...request(), referencePolicy: 'required' }),
      'PLAN_REQUIRES_REFERENCE',
    );
  });

  it('never falls back to GREENFIELD when an approved donor is unavailable', () => {
    expectResolutionError(
      () => resolveImplementationStrategy(request([{
        ...graft,
        availability: 'unavailable',
        required: true,
      }])),
      'REFERENCE_UNAVAILABLE',
    );
  });

  it('rejects a git donor whose immutable identity is incomplete', () => {
    const { tree: _tree, ...withoutTree } = graft;
    expectResolutionError(
      () => resolveImplementationStrategy(request([withoutTree as ApprovedReference])),
      'REFERENCE_AMBIGUOUS',
    );
  });

  it('replays identical normalized inputs to exactly the same resolution', () => {
    const first = resolveImplementationStrategy(request([graft, cbm]));
    const second = resolveImplementationStrategy(request([graft, cbm]));
    expect(second).toEqual(first);
  });
});