import { describe, expect, it } from 'vitest';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { loadConfig } from '../src/config.js';
import { CraftingService, CraftingError } from '../src/crafting/service.js';
import { RouteContextStore, type RouteCraftingProjection } from '../src/runtime/route-context-store.js';

function plan(): RoutePlan {
  return {
    tier: 'task_scoped', mode: 'atomic_direct', domain: 'implementation', confidence: 1, risk: 'low',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['read_file', 'write_file'],
    verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['crafting_route_test'],
  };
}

function projection(overrides: Partial<RouteCraftingProjection> = {}): RouteCraftingProjection {
  return {
    craftingId: 'craft:1',
    mode: 'BUILD_FROM_ZERO',
    featureContractHash: 'a'.repeat(64),
    referenceSetHash: 'b'.repeat(64),
    craftPlanId: 'craft-plan:1',
    state: 'ready',
    ...overrides,
  };
}

describe('Real Steel route crafting state', () => {
  it('stores route-scoped crafting identity without changing normal route semantics', () => {
    const store = new RouteContextStore();
    const route = store.create('principal', plan(), { projectId: '/host', crafting: projection() });
    expect(route.crafting).toEqual(projection());
    expect(route.allowedTools).toEqual(['read_file', 'write_file']);
  });
  it('keeps read-only route validation available while crafting analysis is pending', () => {
    const store = new RouteContextStore();
    const route = store.create('principal', plan(), {
      projectId: '/host',
      crafting: projection({ craftPlanId: undefined, state: 'analysis' }),
    });
    expect(store.validate(route.routeContextId, 'principal', 'read_file').crafting?.state).toBe('analysis');
  });

  it('issues a scoped lease for ready build-from-zero crafting and rejects stale craft identity', () => {
    const service = new CraftingService({ enforcement: 'enforce', leaseTtlMs: 60_000 }, () => 1_000);
    const crafting = projection();
    const lease = service.issueLease({
      principalId: 'principal', projectId: '/host', routeContextId: 'route', crafting, routeExpiresAt: 120_000,
    });
    expect(service.validateLease({
      principalId: 'principal', projectId: '/host', routeContextId: 'route', crafting: { ...crafting, leaseId: lease.leaseId },
    }).leaseId).toBe(lease.leaseId);

    expect(() => service.validateLease({
      principalId: 'principal', projectId: '/host', routeContextId: 'route',
      crafting: { ...crafting, leaseId: lease.leaseId, craftPlanId: 'craft-plan:changed' },
    })).toThrow(CraftingError);
  });

  it('requires sufficient transplantation grounding and a ready craft plan before lease issuance', () => {
    const service = new CraftingService({ enforcement: 'enforce', leaseTtlMs: 60_000 });
    const transplant = projection({ mode: 'FEATURE_TRANSPLANTATION', craftPlanId: 'craft-plan:t', groundingReceiptId: undefined });
    expect(() => service.issueLease({
      principalId: 'principal', projectId: '/host', routeContextId: 'route', crafting: transplant, routeExpiresAt: Date.now() + 60_000,
    })).toThrow(CraftingError);
  });
  it('detects stale feature/reference/craft-plan hashes on the route projection', () => {
    const store = new RouteContextStore();
    const route = store.create('principal', plan(), { projectId: '/host', crafting: projection() });
    expect(store.validateCraftingFreshness(route.routeContextId, 'principal', {
      featureContractHash: 'a'.repeat(64), referenceSetHash: 'b'.repeat(64), craftPlanId: 'craft-plan:1',
    }).crafting?.craftingId).toBe('craft:1');
    expect(() => store.validateCraftingFreshness(route.routeContextId, 'principal', {
      featureContractHash: 'c'.repeat(64), referenceSetHash: 'b'.repeat(64), craftPlanId: 'craft-plan:1',
    })).toThrow();
  });

  it('defaults crafting enforcement to disabled and accepts explicit rollout config', () => {
    const defaults = loadConfig({}, 'E:/host');
    expect(defaults.crafting).toEqual({ enforcement: 'disabled', leaseTtlMs: 30 * 60_000 });
    const enforced = loadConfig({
      AGENT_CORE_CRAFTING_ENFORCEMENT: 'enforce',
      AGENT_CORE_CRAFTING_LEASE_TTL_MS: '60000',
    }, 'E:/host');
    expect(enforced.crafting).toEqual({ enforcement: 'enforce', leaseTtlMs: 60_000 });
  });
});
