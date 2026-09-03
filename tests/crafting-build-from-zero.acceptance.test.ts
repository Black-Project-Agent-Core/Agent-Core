import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerifiedKey } from '../src/auth/key-types.js';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { loadConfig } from '../src/config.js';
import { buildCraftPlan } from '../src/crafting/craft-plan.js';
import { CraftingExecutionController } from '../src/crafting/execution-controller.js';
import { resolveCraftingMode, type CraftingFeatureContract } from '../src/crafting/mode-resolver.js';
import { CraftingVerificationCoordinator } from '../src/crafting/verification.js';
import { validateCraftingBeforeOperation } from '../src/mcp/crafting-guard.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';

const roots: string[] = [];
const runtimes: RuntimeServices[] = [];
const key: VerifiedKey = {
  id: 'zero-principal', name: 'zero-principal', createdAt: new Date(0).toISOString(),
  lastUsedAt: null, expiresAt: null, revokedAt: null,
};

const feature: CraftingFeatureContract = {
  featureId: 'host-normalizer', title: 'Host Normalizer', objective: 'Add a host-native normalizer with no implementation reference.',
  requiredBehaviors: ['trim-and-lowercase'], requiredInvariants: ['host-only implementation'], explicitNonGoals: ['donor reuse'],
  targetAuthorities: ['workspace'], verificationRequirements: ['focused-test', 'diff-audit'], planFingerprint: '3'.repeat(64),
};
function routePlan(): RoutePlan {
  return {
    tier: 'task_scoped', mode: 'capability_guided', domain: 'implementation', confidence: 1, risk: 'medium',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['write_file'],
    verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['build_from_zero_canary'],
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-real-steel-zero-'));
  roots.push(root);
  const defaults = loadConfig({}, root);
  const runtime = createRuntimeServices(
    [root], path.join(root, 'capabilities'), undefined,
    { ...defaults.memory, enabled: false, dbPath: path.join(root, 'memory.sqlite') },
    { ...defaults.execution, enabled: true, dbPath: path.join(root, 'execution.sqlite'), logRoot: path.join(root, 'execution-runs') },
    defaults.github, undefined, defaults.observability, 'canary', defaults.maintenance, { enforcement: 'enforce', leaseTtlMs: 60_000 },
  );
  runtimes.push(runtime);
  return { root, runtime };
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});
describe('Real Steel BUILD_FROM_ZERO canary', () => {
  it('locks zero-reference work, rejects later donor drift, and verifies a host-native feature', async () => {
    const f = await fixture();
    const decision = resolveCraftingMode({ routeContextId: 'route-zero', projectId: f.root, feature, references: [] });
    expect(decision.mode).toBe('BUILD_FROM_ZERO');
    const plan = buildCraftPlan({
      decision, decisions: [], hostVerification: ['focused-test', 'diff-audit'], donorVerification: [],
    });
    f.runtime.crafting.registerCraftPlan(plan);
    const route = f.runtime.routes.create(key.id, routePlan(), {
      projectId: f.root,
      crafting: {
        craftingId: decision.craftingId, mode: decision.mode,
        featureContractHash: decision.featureContractHash, referenceSetHash: decision.referenceSetHash,
        craftPlanId: plan.craftPlanId, state: 'ready',
      },
    });
    const lease = f.runtime.crafting.issueLease({
      principalId: key.id, projectId: f.root, routeContextId: route.routeContextId,
      crafting: route.crafting!, routeExpiresAt: Date.parse(route.expiresAt),
    });
    const leased = f.runtime.routes.updateCrafting(route.routeContextId, key.id, { leaseId: lease.leaseId });
    await expect(validateCraftingBeforeOperation(
      f.runtime, key, leased, 'write_file',
      { path: path.join(f.root, 'src', 'normalize.js'), craftingIntent: { origin: 'host_original' } },
    )).resolves.toMatchObject({ required: true, valid: true });

    await f.runtime.filesystem.writeFile(path.join(f.root, 'package.json'), JSON.stringify({ type: 'module' }));
    await f.runtime.filesystem.writeFile(
      path.join(f.root, 'src', 'normalize.js'),
      "export const normalize = (value) => value.trim().toLowerCase();\n",
    );
    await f.runtime.filesystem.writeFile(
      path.join(f.root, 'tests', 'normalize.test.mjs'),
      "import assert from 'node:assert/strict';\nimport { normalize } from '../src/normalize.js';\nassert.equal(normalize('  HELLO  '), 'hello');\n",
    );
    const read = await f.runtime.filesystem.readFile(path.join(f.root, 'src', 'normalize.js'));
    expect(read.content).toContain('trim().toLowerCase()');
    await f.runtime.execution.open();
    const scope = { principalId: key.id, projectId: f.root };
    const controller = new CraftingExecutionController(f.runtime.execution);
    const started = await controller.startDag(scope, plan, {
      objective: 'Verify host-native normalizer',
      maxConcurrency: 2,
      steps: [
        {
          stepId: 'focused-test', purpose: 'run focused behavior test', command: 'node tests/normalize.test.mjs', cwd: f.root,
          expectedArtifacts: [{ path: path.join(f.root, 'tests', 'normalize.test.mjs'), kind: 'file', required: true, artifactType: 'test_report' }],
        },
        {
          stepId: 'diff-audit', purpose: 'verify crafted source exists',
          command: "node -e \"const fs=require('node:fs');if(!fs.existsSync('src/normalize.js'))process.exit(1)\"", cwd: f.root,
          expectedArtifacts: [{ path: path.join(f.root, 'src', 'normalize.js'), kind: 'file', required: true, artifactType: 'build' }],
        },
      ],
    });
    let executionState = started.run;
    for (let index = 0; index < 20 && executionState.state !== 'completed' && executionState.state !== 'failed'; index += 1) {
      const wake = await f.runtime.execution.wait(scope, started.run.runId, executionState.lastEventSequence, undefined, 5_000);
      executionState = wake.state;
    }
    const observed = await controller.observe(scope, plan, started.run.runId);
    expect(observed.status).toBe('verified');

    const verified = await new CraftingVerificationCoordinator().verify({
      decision, craftPlan: plan, donorBehavior: [],
      hostVerification: [
        { verificationId: 'focused-test', status: 'passed', evidenceRefs: ['execution:focused-test'] },
        { verificationId: 'diff-audit', status: 'passed', evidenceRefs: ['execution:diff-audit'] },
      ],
      execution: { processState: 'succeeded', requiredEvidenceState: 'verified' },
      impact: { completeness: 'complete', affectedPaths: ['src/normalize.js'], unresolvedUnknowns: [], evidenceRefs: ['impact:host-only'] },
      verificationMode: 'stable',
    });
    expect(verified.status).toBe('verified');

    const donorIntroduced = resolveCraftingMode({
      routeContextId: 'route-zero-reopened', projectId: f.root, feature,
      references: [{ referenceId: 'late-donor', kind: 'source_bundle', bundleHash: '4'.repeat(64), featureScope: 'normalizer', approvalSource: 'late' }],
    });
    expect(donorIntroduced.mode).toBe('FEATURE_TRANSPLANTATION');
    expect(() => f.runtime.routes.validateCraftingFreshness(route.routeContextId, key.id, {
      featureContractHash: donorIntroduced.featureContractHash,
      referenceSetHash: donorIntroduced.referenceSetHash,
      craftPlanId: plan.craftPlanId,
    })).toThrow(/no longer matches/i);
  });
});
