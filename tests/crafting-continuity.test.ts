import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  buildCraftingCheckpointInput,
  parseCraftingContinuityCheckpoint,
  resumeCraftingProjection,
  toMemoryPostflightCandidate,
  type CraftingContinuityProjection,
} from '../src/crafting/continuity.js';
import { resolveCraftingMode, type CraftingFeatureContract, type CraftingReference } from '../src/crafting/mode-resolver.js';
import type { CraftPlan } from '../src/crafting/craft-plan.js';
import { CraftingService } from '../src/crafting/service.js';
import type { CraftingVerificationResult } from '../src/crafting/verification.js';
import type { MemoryScope } from '../src/memory/types.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const runtimes: RuntimeServices[] = [];
const feature: CraftingFeatureContract = {
  featureId: 'continuity-feature', title: 'Continuity feature', objective: 'Resume a crafted feature across sessions.',
  requiredBehaviors: ['resume safely'], requiredInvariants: ['fresh lease'], explicitNonGoals: [],
  targetAuthorities: ['memory'], verificationRequirements: ['resume-test'], planFingerprint: 'a'.repeat(64),
};
const reference: CraftingReference = {
  referenceId: 'donor', kind: 'git_repo', repository: 'owner/repo',
  commit: '1'.repeat(40), tree: '2'.repeat(40), featureScope: 'resume', approvalSource: 'user',
};
const decision = resolveCraftingMode({ routeContextId: 'route-origin', projectId: '/host', feature, references: [reference] });
const plan: CraftPlan = {
  craftPlanId: 'craft-plan:continuity', craftingId: decision.craftingId, mode: decision.mode,
  featureContractHash: decision.featureContractHash, referenceSetHash: decision.referenceSetHash,
  groundingReceiptId: 'grounding:continuity', anatomyId: 'anatomy:continuity',
  decisions: [{ sparepartId: 'core', action: 'ADAPT', rationaleCode: 'HOST_BOUNDARY', targetPath: 'src/core.ts',
    preservedBehaviors: ['resume safely'], intentionallyChangedBehaviors: [], evidenceRefs: ['source:core'] }],
  hostVerification: ['resume-test'], donorVerification: ['resume safely'], status: 'ready', blockingReasons: [],
};

const projection: CraftingContinuityProjection = {
  craftingId: decision.craftingId, mode: decision.mode,
  featureContractHash: decision.featureContractHash, referenceSetHash: decision.referenceSetHash,
  craftPlanId: plan.craftPlanId, groundingReceiptId: plan.groundingReceiptId,
  references: decision.references.map(({ referenceId, kind, repository, commit, tree, bundleHash }) => ({
    referenceId, kind, ...(repository ? { repository } : {}), ...(commit ? { commit } : {}),
    ...(tree ? { tree } : {}), ...(bundleHash ? { bundleHash } : {}),
  })),
  currentSparepartId: 'core', executionRunId: 'run-1', verificationStatus: 'pending',
};
async function runtimeFixture(label: string, dbPath?: string) {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `agent-core-crafting-continuity-${label}-`));
  roots.push(root);
  const defaults = loadConfig({}, root);
  const memoryConfig = {
    ...defaults.memory,
    enabled: true,
    dbPath: dbPath ?? path.join(root, 'runtime', 'memory', 'crafting-continuity.sqlite'),
  };
  const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, memoryConfig);
  runtimes.push(runtime);
  return { root, runtime, memoryConfig };
}

async function persistCheckpoint(runtime: RuntimeServices, scope: MemoryScope, routeContextId = 'route-origin') {
  const turn = await runtime.memory.beginContinuityTurn(
    scope, routeContextId, 'Craft continuation feature', undefined,
    { objective: 'Craft continuation feature' }, Date.now() + 60_000,
  );
  const input = buildCraftingCheckpointInput(routeContextId, projection, { status: 'interrupted' });
  const checkpoint = await runtime.memory.checkpointContinuity(scope, turn.taskId, turn.turnId, input);
  return { ...turn, ...checkpoint };
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});
describe('Real Steel crafting continuity', () => {
  it('persists bounded crafting state through existing continuity storage and restores it after runtime reopen', async () => {
    const first = await runtimeFixture('reopen');
    const scope: MemoryScope = { principalId: 'principal-a', projectId: first.root };
    const saved = await persistCheckpoint(first.runtime, scope);
    const dbPath = first.memoryConfig.dbPath;
    await first.runtime.execution.close();
    await first.runtime.memory.close();
    runtimes.splice(runtimes.indexOf(first.runtime), 1);

    const reopened = createRuntimeServices([first.root], path.join(first.root, 'capabilities'), undefined, first.memoryConfig);
    runtimes.push(reopened);
    const checkpoint = await reopened.memory.getContinuityCheckpoint(scope, saved.checkpointId);
    expect(checkpoint).not.toBeNull();
    const restored = parseCraftingContinuityCheckpoint(checkpoint!);
    expect(restored).toEqual(projection);
    expect(JSON.stringify(checkpoint)).not.toMatch(/sourceBody|donorBody/i);
  });

  it('keeps checkpoint reads isolated by principal and project scope', async () => {
    const f = await runtimeFixture('scope');
    const scope: MemoryScope = { principalId: 'principal-a', projectId: f.root };
    const saved = await persistCheckpoint(f.runtime, scope);
    await expect(f.runtime.memory.getContinuityCheckpoint(
      { principalId: 'principal-b', projectId: f.root }, saved.checkpointId,
    )).resolves.toBeNull();
    await expect(f.runtime.memory.getContinuityCheckpoint(
      { principalId: 'principal-a', projectId: `${f.root}-other` }, saved.checkpointId,
    )).resolves.toBeNull();
  });

  it('revalidates plan/reference/craft-plan identity before resuming on a fresh route', () => {
    const resumed = resumeCraftingProjection(projection, decision, plan);
    expect(resumed).toMatchObject({
      craftingId: decision.craftingId,
      mode: 'FEATURE_TRANSPLANTATION',
      featureContractHash: decision.featureContractHash,
      referenceSetHash: decision.referenceSetHash,
      craftPlanId: plan.craftPlanId,
      state: 'ready',
    });
    expect(resumed.leaseId).toBeUndefined();

    const staleDecision = { ...decision, referenceSetHash: 'f'.repeat(64) };
    expect(() => resumeCraftingProjection(projection, staleDecision, plan)).toThrow(/STALE/i);
    const stalePlan = { ...plan, craftPlanId: 'craft-plan:changed' };
    expect(() => resumeCraftingProjection(projection, decision, stalePlan)).toThrow(/STALE/i);
  });

  it('never persists or reuses an old crafting lease across a continuity checkpoint', () => {
    const resumed = resumeCraftingProjection(projection, decision, plan);
    const service = new CraftingService({ enforcement: 'enforce', leaseTtlMs: 60_000 });
    try {
      service.validateLease({
        principalId: 'principal-a', projectId: '/host', routeContextId: 'route-new', crafting: resumed,
      });
      throw new Error('Expected CRAFTING_LEASE_REQUIRED');
    } catch (error) {
      expect(error).toMatchObject({ code: 'CRAFTING_REQUIRED' });
    }
  });

  it('hands verified crafting decisions to the existing memory postflight contract instead of writing memory directly', () => {
    const result: CraftingVerificationResult = {
      status: 'verified', craftingId: decision.craftingId, mode: decision.mode,
      featureContractHash: decision.featureContractHash, referenceSetHash: decision.referenceSetHash,
      craftPlanId: plan.craftPlanId, donorBehavior: 'passed', hostIntegration: 'passed', execution: 'passed',
      impact: { completeness: 'complete', affectedPaths: ['src/core.ts'], unresolvedUnknowns: [], evidenceRefs: ['impact:1'] },
      behaviorDispositions: [], reasonCodes: [], provenance: { references: [], decisions: [] },
      memoryCandidate: {
        kind: 'decision', canonicalKey: `crafting.${decision.craftingId}`,
        value: { craftingId: decision.craftingId, craftPlanId: plan.craftPlanId }, importance: 0.8,
        sourceType: 'crafting', sourceRef: decision.craftingId,
      },
    };
    expect(toMemoryPostflightCandidate(result)).toEqual({
      canonicalKey: `crafting.${decision.craftingId}`,
      kind: 'decision', value: { craftingId: decision.craftingId, craftPlanId: plan.craftPlanId },
      importance: 0.8, sourceType: 'crafting', sourceRef: decision.craftingId,
    });
    expect(toMemoryPostflightCandidate({ ...result, status: 'blocked', memoryCandidate: null })).toBeNull();
  });
});

describe('Real Steel fresh-route continuity lease', () => {
  it('reuses the durable crafting identity across routes while issuing a new route-scoped lease', () => {
    const first = resolveCraftingMode({ routeContextId: 'route-a', projectId: '/host', feature, references: [reference] });
    const second = resolveCraftingMode({ routeContextId: 'route-b', projectId: '/host', feature, references: [reference] });
    expect(second.craftingId).toBe(first.craftingId);

    const currentPlan: CraftPlan = { ...plan, craftingId: first.craftingId };
    const service = new CraftingService({ enforcement: 'enforce', leaseTtlMs: 60_000 }, () => 1_000);
    service.registerDecision(first);
    service.registerCraftPlan(currentPlan);
    expect(() => service.registerDecision(second)).not.toThrow();

    const resumed = resumeCraftingProjection(projection, second, currentPlan);
    expect(resumed.leaseId).toBeUndefined();
    const lease = service.issueLease({
      principalId: 'principal-a', projectId: '/host', routeContextId: 'route-b',
      crafting: resumed, routeExpiresAt: 120_000,
    });
    expect(lease.routeContextId).toBe('route-b');
    expect(lease.craftingId).toBe(first.craftingId);
    expect(service.validateLease({
      principalId: 'principal-a', projectId: '/host', routeContextId: 'route-b',
      crafting: { ...resumed, leaseId: lease.leaseId },
    }).leaseId).toBe(lease.leaseId);
  });
});