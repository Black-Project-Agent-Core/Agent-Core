import { describe, expect, it } from 'vitest';
import { resolveCraftingMode, type CraftingFeatureContract, type CraftingReference } from '../src/crafting/mode-resolver.js';
import type { FeatureAnatomy } from '../src/crafting/feature-anatomy.js';
import type { SourceGroundingReceipt } from '../src/crafting/source-grounding.js';
import {
  CraftPlanError,
  buildCraftPlan,
  type CraftingDecision,
} from '../src/crafting/craft-plan.js';

const feature: CraftingFeatureContract = {
  featureId: 'craft-plan', title: 'Craft Plan', objective: 'Craft connected spareparts.',
  requiredBehaviors: ['behavior-a'], requiredInvariants: ['host wins'], explicitNonGoals: [],
  targetAuthorities: ['routing'], verificationRequirements: ['focused'], planFingerprint: 'a'.repeat(64),
};
const reference: CraftingReference = {
  referenceId: 'donor', kind: 'git_repo', repository: 'owner/repo',
  commit: '1'.repeat(40), tree: '2'.repeat(40), featureScope: 'feature', approvalSource: 'user',
};
const decision = resolveCraftingMode({ routeContextId: 'route', projectId: '/host', feature, references: [reference] });
const receipt: SourceGroundingReceipt = {
  receiptId: 'grounding:ready', referenceSetHash: decision.referenceSetHash,
  featureContractHash: decision.featureContractHash, evidence: [], inspectedSourceFiles: ['src/a.ts', 'src/b.ts'],
  inspectedTests: ['tests/a.test.ts'], completeness: 'sufficient', missingEvidence: [],
};
const anatomy: FeatureAnatomy = {
  anatomyId: 'anatomy:ready', groundingReceiptId: receipt.receiptId,
  spareparts: [
    { sparepartId: 'a', referenceId: 'donor', sourcePath: 'src/a.ts', role: 'entry', evidenceRefs: ['e-a'] },
    { sparepartId: 'b', referenceId: 'donor', sourcePath: 'src/b.ts', role: 'dependency', evidenceRefs: ['e-b'] },
  ], connections: [], unknownEvidence: [], notRequiredEvidence: [], status: 'ready',
};
function craft(sparepartId: string, action: CraftingDecision['action']): CraftingDecision {
  return {
    sparepartId,
    action,
    rationaleCode: `${action}_RATIONALE`,
    preservedBehaviors: ['behavior-a'],
    intentionallyChangedBehaviors: [],
    evidenceRefs: [`e-${sparepartId}`],
  };
}

describe('Real Steel craft plan', () => {
  it('requires exactly one crafting decision for every selected sparepart', () => {
    expect(() => buildCraftPlan({
      decision, groundingReceipt: receipt, anatomy,
      decisions: [craft('a', 'KEEP')], hostVerification: [], donorVerification: [],
    })).toThrow(CraftPlanError);
    expect(() => buildCraftPlan({
      decision, groundingReceipt: receipt, anatomy,
      decisions: [craft('a', 'KEEP'), craft('a', 'ADAPT'), craft('b', 'DROP')],
      hostVerification: [], donorVerification: [],
    })).toThrow(CraftPlanError);
  });

  it('requires rationale and evidence for every crafting action', () => {
    expect(() => buildCraftPlan({
      decision, groundingReceipt: receipt, anatomy,
      decisions: [{ ...craft('a', 'KEEP'), rationaleCode: '', evidenceRefs: [] }, craft('b', 'DROP')],
      hostVerification: [], donorVerification: [],
    })).toThrow(CraftPlanError);
  });
  it('requires a factual exception reason for REIMPLEMENT', () => {
    expect(() => buildCraftPlan({
      decision, groundingReceipt: receipt, anatomy,
      decisions: [craft('a', 'REIMPLEMENT'), craft('b', 'DROP')],
      hostVerification: [], donorVerification: [],
    })).toThrow(CraftPlanError);

    const plan = buildCraftPlan({
      decision, groundingReceipt: receipt, anatomy,
      decisions: [
        { ...craft('a', 'REIMPLEMENT'), reimplementationReason: 'RUNTIME_NON_PORTABLE' },
        craft('b', 'DROP'),
      ],
      hostVerification: [], donorVerification: [],
    });
    expect(plan.status).toBe('ready');
  });

  it('normalizes decision order into a deterministic craftPlanId', () => {
    const decisions = [craft('a', 'ADAPT'), craft('b', 'REPLACE')];
    const left = buildCraftPlan({ decision, groundingReceipt: receipt, anatomy, decisions, hostVerification: ['host'], donorVerification: ['donor'] });
    const right = buildCraftPlan({ decision, groundingReceipt: receipt, anatomy, decisions: [...decisions].reverse(), hostVerification: ['host'], donorVerification: ['donor'] });
    expect(right.craftPlanId).toBe(left.craftPlanId);
  });

  it('blocks transplantation when grounding or anatomy is not ready', () => {
    expect(() => buildCraftPlan({
      decision, groundingReceipt: { ...receipt, completeness: 'insufficient' }, anatomy,
      decisions: [craft('a', 'KEEP'), craft('b', 'DROP')], hostVerification: [], donorVerification: [],
    })).toThrow(CraftPlanError);
    expect(() => buildCraftPlan({
      decision, groundingReceipt: receipt, anatomy: { ...anatomy, status: 'blocked', unknownEvidence: ['e-x'] },
      decisions: [craft('a', 'KEEP'), craft('b', 'DROP')], hostVerification: [], donorVerification: [],
    })).toThrow(CraftPlanError);
  });
  it('creates a reference-free BUILD_FROM_ZERO craft plan and rejects donor anatomy in that mode', () => {
    const zero = resolveCraftingMode({ routeContextId: 'route-zero', projectId: '/host', feature });
    const plan = buildCraftPlan({
      decision: zero,
      decisions: [],
      hostVerification: ['host focused test'],
      donorVerification: [],
    });
    expect(plan.mode).toBe('BUILD_FROM_ZERO');
    expect(plan.groundingReceiptId).toBeUndefined();
    expect(plan.status).toBe('ready');

    expect(() => buildCraftPlan({
      decision: zero, groundingReceipt: receipt, anatomy,
      decisions: [], hostVerification: [], donorVerification: [],
    })).toThrow(CraftPlanError);
  });
});
