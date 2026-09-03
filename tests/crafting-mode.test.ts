import { describe, expect, it } from 'vitest';
import {
  CraftingModeResolutionError,
  resolveCraftingMode,
  type CraftingFeatureContract,
  type CraftingReference,
} from '../src/crafting/mode-resolver.js';

const feature: CraftingFeatureContract = {
  featureId: 'real-steel-fixture',
  title: 'Real Steel fixture',
  objective: 'Implement a fixture feature with the locked crafting method.',
  requiredBehaviors: ['fixture works'],
  requiredInvariants: ['host authority remains canonical'],
  explicitNonGoals: ['unrelated refactor'],
  targetAuthorities: ['workspace_containment'],
  verificationRequirements: ['focused test'],
  planFingerprint: 'a'.repeat(64),
};

const gitReference: CraftingReference = {
  referenceId: 'donor-a',
  kind: 'git_repo',
  repository: 'owner/repo',
  commit: '1'.repeat(40),
  tree: '2'.repeat(40),
  featureScope: 'fixture feature',
  approvalSource: 'user',
};
function request(references: CraftingReference[] = []) {
  return {
    routeContextId: 'route-1',
    projectId: 'E:/Projects/host',
    feature,
    references,
  };
}

describe('Real Steel crafting mode contract', () => {
  it('locks BUILD_FROM_ZERO when no approved implementation reference exists', () => {
    const decision = resolveCraftingMode(request());
    expect(decision.mode).toBe('BUILD_FROM_ZERO');
    expect(decision.references).toEqual([]);
    expect(decision.reasonCodes).toEqual(['NO_APPROVED_REFERENCE']);
  });

  it('locks FEATURE_TRANSPLANTATION when an approved implementation reference exists', () => {
    const decision = resolveCraftingMode(request([gitReference]));
    expect(decision.mode).toBe('FEATURE_TRANSPLANTATION');
    expect(decision.references).toHaveLength(1);
    expect(decision.reasonCodes).toContain('APPROVED_REFERENCE_PRESENT');
  });

  it.each(['unavailable', 'ambiguous'] as const)(
    'blocks a declared %s reference instead of falling back to build from zero',
    (availability) => {
      expect(() => resolveCraftingMode(request([{ ...gitReference, availability }])))
        .toThrow(CraftingModeResolutionError);
    },
  );
  it('normalizes reference order so identical inputs reproduce the same identities', () => {
    const donorB: CraftingReference = {
      ...gitReference,
      referenceId: 'donor-b',
      repository: 'owner/repo-b',
      commit: '3'.repeat(40),
      tree: '4'.repeat(40),
    };
    const left = resolveCraftingMode(request([gitReference, donorB]));
    const right = resolveCraftingMode(request([donorB, gitReference]));
    expect(right.referenceSetHash).toBe(left.referenceSetHash);
    expect(right.featureContractHash).toBe(left.featureContractHash);
    expect(right.craftingId).toBe(left.craftingId);
    expect(right.references.map((item) => item.referenceId)).toEqual(['donor-a', 'donor-b']);
  });

  it('rejects mutable or incomplete git identities', () => {
    expect(() => resolveCraftingMode(request([{ ...gitReference, commit: undefined }])))
      .toThrow(CraftingModeResolutionError);
    expect(() => resolveCraftingMode(request([{ ...gitReference, tree: 'main' }])))
      .toThrow(CraftingModeResolutionError);
  });

  it('rejects duplicate reference identities rather than creating ambiguous crafting state', () => {
    expect(() => resolveCraftingMode(request([gitReference, { ...gitReference }])))
      .toThrow(CraftingModeResolutionError);
  });
});
