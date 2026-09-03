import { describe, expect, it } from 'vitest';
import type { CraftPlan } from '../src/crafting/craft-plan.js';
import {
  CompatibilitySurgeryError,
  applyCompatibilitySurgery,
  type CompatibilityBinding,
} from '../src/crafting/compatibility-surgery.js';
import {
  PROTECTED_CRAFTING_AUTHORITIES,
  type DonorAuthorityClaim,
  type ProtectedAuthorityId,
} from '../src/crafting/authority-registry.js';

const basePlan: CraftPlan = {
  craftPlanId: 'craft-plan:base', craftingId: 'craft:fixture', mode: 'FEATURE_TRANSPLANTATION',
  featureContractHash: 'a'.repeat(64), referenceSetHash: 'b'.repeat(64),
  groundingReceiptId: 'grounding:fixture', anatomyId: 'anatomy:fixture',
  decisions: [
    { sparepartId: 'core', action: 'ADAPT', rationaleCode: 'HOST_API', targetBinding: 'HostFeatureApi', preservedBehaviors: ['core'], intentionallyChangedBehaviors: [], evidenceRefs: ['e-core'] },
    { sparepartId: 'store', action: 'REPLACE', rationaleCode: 'HOST_MEMORY', targetBinding: 'MemoryService', preservedBehaviors: ['state role'], intentionallyChangedBehaviors: ['storage implementation'], evidenceRefs: ['e-store'] },
  ],
  hostVerification: [], donorVerification: [], status: 'ready', blockingReasons: [],
};

function binding(overrides: Partial<CompatibilityBinding> = {}): CompatibilityBinding {
  return {
    sparepartId: 'core', boundary: 'interface', donorContract: 'DonorFeatureApi', hostContract: 'HostFeatureApi',
    surgery: 'ADAPTER', verificationRequirement: 'adapter contract test', preservesHostAuthority: true,
    ...overrides,
  };
}
describe('Real Steel compatibility surgery', () => {
  it('accepts explicit interface/type/config/error/lifecycle mappings', () => {
    const result = applyCompatibilitySurgery({
      craftPlan: basePlan,
      bindings: [
        binding(),
        binding({ sparepartId: 'core', boundary: 'type', surgery: 'TYPE_MAP', donorContract: 'DonorType', hostContract: 'HostType' }),
        binding({ sparepartId: 'core', boundary: 'config', surgery: 'ADAPTER', donorContract: 'DonorConfig', hostContract: 'AgentCoreConfig' }),
        binding({ sparepartId: 'core', boundary: 'error', surgery: 'ERROR_MAP', donorContract: 'DonorError', hostContract: 'AgentCoreError' }),
        binding({ sparepartId: 'core', boundary: 'lifecycle', surgery: 'LIFECYCLE_REWIRE', donorContract: 'DonorLifecycle', hostContract: 'AgentCoreLifecycle' }),
        binding({ sparepartId: 'store', boundary: 'semantic_memory', surgery: 'AUTHORITY_REPLACEMENT', donorContract: 'DonorStore', hostContract: 'MemoryService' }),
      ],
      authorityClaims: [{ sparepartId: 'store', authorityId: 'semantic_memory', role: 'owner' }],
    });
    expect(result.status).toBe('ready');
    expect(result.authorityConflicts.every((item) => item.status === 'resolved')).toBe(true);
  });

  it.each(Object.keys(PROTECTED_CRAFTING_AUTHORITIES) as ProtectedAuthorityId[])(
    'blocks a donor from becoming a second %s authority',
    (authorityId) => {
      const plan: CraftPlan = {
        ...basePlan,
        decisions: [{ ...basePlan.decisions[0]!, sparepartId: 'owner', action: 'KEEP', targetBinding: undefined }],
      };
      const claim: DonorAuthorityClaim = { sparepartId: 'owner', authorityId, role: 'owner' };
      const result = applyCompatibilitySurgery({ craftPlan: plan, bindings: [], authorityClaims: [claim] });
      expect(result.status).toBe('blocked');
      expect(result.authorityConflicts[0]?.reasonCode).toBe('DUPLICATE_AUTHORITY_OWNER');
    },
  );
  it('resolves a REPLACE decision only when it binds to the canonical host authority', () => {
    const result = applyCompatibilitySurgery({
      craftPlan: basePlan,
      bindings: [
        binding(),
        binding({ sparepartId: 'store', boundary: 'semantic_memory', surgery: 'AUTHORITY_REPLACEMENT', donorContract: 'DonorStore', hostContract: 'MemoryService' }),
      ],
      authorityClaims: [{ sparepartId: 'store', authorityId: 'semantic_memory', role: 'owner' }],
    });
    expect(result.status).toBe('ready');
    expect(result.authorityConflicts[0]).toMatchObject({ status: 'resolved', targetBinding: 'MemoryService' });
  });

  it('rejects adapters that declare host guardrails are not preserved', () => {
    expect(() => applyCompatibilitySurgery({
      craftPlan: basePlan,
      bindings: [
        binding({ preservesHostAuthority: false }),
        binding({ sparepartId: 'store', boundary: 'semantic_memory', surgery: 'AUTHORITY_REPLACEMENT', donorContract: 'DonorStore', hostContract: 'MemoryService' }),
      ],
      authorityClaims: [],
    })).toThrow(CompatibilitySurgeryError);
  });

  it('blocks host-bound crafting decisions that have no compatibility binding', () => {
    const result = applyCompatibilitySurgery({
      craftPlan: basePlan,
      bindings: [binding()],
      authorityClaims: [],
    });
    expect(result.status).toBe('blocked');
    expect(result.blockingReasons).toContain('COMPATIBILITY_BINDING_REQUIRED:store');
  });
});
