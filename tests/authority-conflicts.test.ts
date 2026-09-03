import { describe, expect, it } from 'vitest';
import {
  PROTECTED_AUTHORITIES,
  evaluateAuthorityConflicts,
} from '../src/implementation/authority-conflicts.js';
import type { TransplantComponent } from '../src/implementation/transplant-manifest.js';

const donorStore: TransplantComponent = {
  referenceId: 'donor',
  sourcePath: 'src/donor-store.ts',
  symbol: 'DonorStore',
  action: 'KEEP',
  rationaleCode: 'DONOR_STORAGE',
  evidenceRefs: ['donor:store'],
};

const claim = {
  referenceId: 'donor',
  sourcePath: 'src/donor-store.ts',
  symbol: 'DonorStore',
  authorityId: 'semantic_memory' as const,
  role: 'owner' as const,
};

describe('implementation authority conflict registry', () => {
  it('defines the protected Agent Core authority owners explicitly', () => {
    expect(PROTECTED_AUTHORITIES.semantic_memory.canonicalBinding).toBe('MemoryService');
    expect(PROTECTED_AUTHORITIES.workspace_containment.canonicalBinding).toBe('WorkspacePolicy');
    expect(PROTECTED_AUTHORITIES.routing.canonicalBinding).toBe('CapabilityRouter/RouteContextStore');
    expect(PROTECTED_AUTHORITIES.operational_execution.canonicalBinding).toBe('ExecutionService/ProcessManager');
  });

  it('blocks KEEP when a donor attempts to become a second semantic-memory owner', () => {
    const result = evaluateAuthorityConflicts([donorStore], [claim]);
    expect(result.ready).toBe(false);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      authorityId: 'semantic_memory', status: 'blocking', reasonCode: 'DUPLICATE_AUTHORITY_OWNER',
    });
  });
  it('resolves the conflict when the donor owner is replaced by the canonical host authority', () => {
    const component: TransplantComponent = {
      ...donorStore,
      action: 'REPLACE',
      rationaleCode: 'USE_EXISTING_MEMORY_AUTHORITY',
      targetBinding: 'MemoryService',
    };
    const result = evaluateAuthorityConflicts([component], [{ ...claim, targetBinding: 'MemoryService' }]);
    expect(result.ready).toBe(true);
    expect(result.conflicts[0]).toMatchObject({
      status: 'resolved', reasonCode: 'BOUND_TO_CANONICAL_AUTHORITY', targetBinding: 'MemoryService',
    });
  });

  it('accepts an adapted donor boundary only when it binds to the canonical owner', () => {
    const component: TransplantComponent = {
      ...donorStore,
      action: 'ADAPT',
      rationaleCode: 'ADAPT_STORAGE_BOUNDARY',
      targetBinding: 'MemoryService',
    };
    expect(evaluateAuthorityConflicts([component], [{ ...claim, targetBinding: 'MemoryService' }]).ready).toBe(true);
    expect(evaluateAuthorityConflicts([{ ...component, targetBinding: 'ForeignStore' }], [{ ...claim, targetBinding: 'ForeignStore' }]).ready)
      .toBe(false);
  });

  it('does not create ownership conflicts for observer/adapter claims', () => {
    const observer = evaluateAuthorityConflicts([donorStore], [{ ...claim, role: 'observer' as const }]);
    expect(observer).toEqual({ ready: true, conflicts: [] });
  });
});