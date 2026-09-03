import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerifiedKey } from '../src/auth/key-types.js';
import type { RoutePlan } from '../src/capabilities/route-types.js';
import { loadConfig } from '../src/config.js';
import { applyCompatibilitySurgery } from '../src/crafting/compatibility-surgery.js';
import { buildCraftPlan } from '../src/crafting/craft-plan.js';
import { CraftingExecutionController } from '../src/crafting/execution-controller.js';
import { buildFeatureAnatomy } from '../src/crafting/feature-anatomy.js';
import { resolveCraftingMode, type CraftingFeatureContract, type CraftingReference } from '../src/crafting/mode-resolver.js';
import { resolveReferenceSource } from '../src/crafting/reference-resolution.js';
import { buildSourceGroundingReceipt, inspectSourceEvidence } from '../src/crafting/source-grounding.js';
import { CraftingVerificationCoordinator } from '../src/crafting/verification.js';
import { validateCraftingBeforeOperation } from '../src/mcp/crafting-guard.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];
const runtimes: RuntimeServices[] = [];
const key: VerifiedKey = { id: 'transplant-principal', name: 'transplant-principal', createdAt: new Date(0).toISOString(), lastUsedAt: null, expiresAt: null, revokedAt: null };
const feature: CraftingFeatureContract = {
  featureId: 'transplanted-processor', title: 'Transplanted Processor',
  objective: 'Transplant normalized dispatch behavior while preserving host execution ownership.',
  requiredBehaviors: ['normalize-before-dispatch'], requiredInvariants: ['host execution ownership'],
  explicitNonGoals: ['donor telemetry'], targetAuthorities: ['operational_execution'],
  verificationRequirements: ['donor-parity', 'host-integration'], planFingerprint: '5'.repeat(64),
};

function routePlan(): RoutePlan {
  return {
    tier: 'task_scoped', mode: 'capability_guided', domain: 'implementation', confidence: 1, risk: 'medium',
    recommendedCapabilities: [], requiredSkillLoads: [], allowedTools: ['write_file'],
    verification: { required: true, suggestedTools: ['read_file'] }, reasonCodes: ['feature_transplantation_canary'],
  };
}

async function setupRepos() {
  const container = await mkdtemp(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-real-steel-transplant-'));
  roots.push(container);
  const host = path.join(container, 'host');
  const donor = path.join(container, 'reference');
  await mkdir(path.join(host, 'src'), { recursive: true });
  await mkdir(path.join(host, 'tests'), { recursive: true });
  await mkdir(path.join(donor, 'src'), { recursive: true });
  await mkdir(path.join(donor, 'test'), { recursive: true });
  await writeFile(path.join(host, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  await writeFile(path.join(donor, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  await writeFile(path.join(donor, 'src', 'registry.mjs'), "export const dispatch = (value) => `donor:${value}`;\n", 'utf8');
  await writeFile(path.join(donor, 'src', 'telemetry.mjs'), "export const trace = (_value) => undefined;\n", 'utf8');
  await writeFile(path.join(donor, 'src', 'core.mjs'), "import { dispatch } from './registry.mjs';\nimport { trace } from './telemetry.mjs';\nexport function processValue(value) { trace(value); return dispatch(value.trim().toLowerCase()); }\n", 'utf8');
  await writeFile(path.join(donor, 'test', 'core.test.mjs'), "import assert from 'node:assert/strict';\nimport { processValue } from '../src/core.mjs';\nassert.equal(processValue('  HELLO  '), 'donor:hello');\n", 'utf8');
  return { container, host, donor };
}
async function createRuntime(container: string, enforcement: 'advisory' | 'enforce', iteration: number) {
  const defaults = loadConfig({}, container);
  const runtime = createRuntimeServices(
    [container], path.join(container, 'capabilities'), undefined,
    { ...defaults.memory, enabled: false, dbPath: path.join(container, `memory-${iteration}-${enforcement}.sqlite`) },
    {
      ...defaults.execution, enabled: true,
      dbPath: path.join(container, `execution-${iteration}-${enforcement}.sqlite`),
      logRoot: path.join(container, `execution-runs-${iteration}-${enforcement}`),
    },
    defaults.github, undefined, defaults.observability, 'canary', defaults.maintenance,
    defaults.implementationStrategy, { enforcement, leaseTtlMs: 60_000 },
  );
  runtimes.push(runtime);
  return runtime;
}

async function waitForTerminal(runtime: RuntimeServices, scope: { principalId: string; projectId: string }, runId: string, sequence: number) {
  let current = await runtime.execution.status(scope, runId);
  let afterSequence = sequence;
  for (let index = 0; index < 30 && current && current.state !== 'completed' && current.state !== 'failed'; index += 1) {
    const wake = await runtime.execution.wait(scope, runId, afterSequence, undefined, 5_000);
    current = wake.state;
    afterSequence = current.lastEventSequence;
  }
  return current;
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});
async function buildTransplantArtifacts(container: string, host: string, donor: string) {
  const reference: CraftingReference = {
    referenceId: 'reference-processor', kind: 'local_repo', localPath: donor,
    commit: '7'.repeat(40), tree: '8'.repeat(40), featureScope: 'processor', approvalSource: 'user',
  };
  const decision = resolveCraftingMode({ routeContextId: 'route-transplant', projectId: host, feature, references: [reference] });
  const workspace = new WorkspacePolicy([container]);
  const resolved = await resolveReferenceSource(decision.references[0]!, donor, workspace);
  const core = await inspectSourceEvidence({ workspace, reference: resolved, relativePath: 'src/core.mjs', role: 'entry_point', observation: 'processValue normalizes before dispatch and calls telemetry.' });
  const registry = await inspectSourceEvidence({ workspace, reference: resolved, relativePath: 'src/registry.mjs', role: 'dependency', observation: 'Donor registry owns dispatch implementation.' });
  const telemetry = await inspectSourceEvidence({ workspace, reference: resolved, relativePath: 'src/telemetry.mjs', role: 'dependency', observation: 'Telemetry is donor-only and excluded by plan.' });
  const test = await inspectSourceEvidence({ workspace, reference: resolved, relativePath: 'test/core.test.mjs', role: 'test', observation: 'Donor test proves normalization before dispatch.' });
  const receipt = buildSourceGroundingReceipt({
    decision, evidence: [core, registry, telemetry, test],
    requirements: { tests: true, lifecycle: false, stateOrConfig: false },
  });
  const anatomy = buildFeatureAnatomy({
    receipt,
    spareparts: [
      { sparepartId: 'core', referenceId: reference.referenceId, sourcePath: 'src/core.mjs', symbol: 'processValue', role: 'core algorithm', evidenceRefs: [core.evidenceId] },
      { sparepartId: 'registry', referenceId: reference.referenceId, sourcePath: 'src/registry.mjs', symbol: 'dispatch', role: 'execution owner', evidenceRefs: [registry.evidenceId] },
      { sparepartId: 'telemetry', referenceId: reference.referenceId, sourcePath: 'src/telemetry.mjs', symbol: 'trace', role: 'donor telemetry', evidenceRefs: [telemetry.evidenceId] },
      { sparepartId: 'donor-test', referenceId: reference.referenceId, sourcePath: 'test/core.test.mjs', role: 'verification only', evidenceRefs: [test.evidenceId] },
    ],
    connections: [
      { from: 'core', to: 'registry', relation: 'CALLS', evidenceRefs: [core.evidenceId, registry.evidenceId] },
      { from: 'core', to: 'telemetry', relation: 'IMPORTS', evidenceRefs: [core.evidenceId, telemetry.evidenceId] },
      { from: 'donor-test', to: 'core', relation: 'TESTS', evidenceRefs: [test.evidenceId, core.evidenceId] },
    ],
    coverage: [],
  });
  const craftPlan = buildCraftPlan({
    decision, groundingReceipt: receipt, anatomy,
    decisions: [
      { sparepartId: 'core', action: 'ADAPT', rationaleCode: 'HOST_IMPORT_SURGERY', targetPath: 'src/core.mjs',
        preservedBehaviors: ['normalize-before-dispatch'], intentionallyChangedBehaviors: ['remove donor telemetry call'], evidenceRefs: [core.evidenceId] },
      { sparepartId: 'registry', action: 'REPLACE', rationaleCode: 'HOST_EXECUTION_AUTHORITY', targetPath: 'src/registry-adapter.mjs', targetBinding: 'ExecutionService/ProcessManager',
        preservedBehaviors: ['dispatch boundary'], intentionallyChangedBehaviors: ['host owns execution dispatch'], evidenceRefs: [registry.evidenceId] },
      { sparepartId: 'telemetry', action: 'DROP', rationaleCode: 'EXPLICIT_NON_GOAL', preservedBehaviors: [], intentionallyChangedBehaviors: ['donor telemetry excluded'], evidenceRefs: [telemetry.evidenceId] },
      { sparepartId: 'donor-test', action: 'DROP', rationaleCode: 'VERIFICATION_ONLY', preservedBehaviors: [], intentionallyChangedBehaviors: ['test mapped to host verification'], evidenceRefs: [test.evidenceId] },
    ],
    hostVerification: ['host-integration'], donorVerification: ['normalize-before-dispatch'],
  });
  const compatible = applyCompatibilitySurgery({
    craftPlan,
    bindings: [{
      sparepartId: 'registry', boundary: 'operational_execution', donorContract: 'DonorRegistry',
      hostContract: 'ExecutionService/ProcessManager', surgery: 'AUTHORITY_REPLACEMENT',
      verificationRequirement: 'host-integration', preservesHostAuthority: true,
    }],
    authorityClaims: [{ sparepartId: 'registry', authorityId: 'operational_execution', role: 'owner' }],
  });
  expect(compatible.status).toBe('ready');
  expect(compatible.decisions.map((item) => [item.sparepartId, item.action])).toEqual([
    ['core', 'ADAPT'], ['donor-test', 'DROP'], ['registry', 'REPLACE'], ['telemetry', 'DROP'],
  ]);
  return { decision, receipt, anatomy, plan: compatible };
}
describe('Real Steel FEATURE_TRANSPLANTATION canary', () => {
  it('source-grounds connected spareparts, crafts compatibility surgery, and repeats deterministic transplantation three times', async () => {
    const { container, host, donor } = await setupRepos();
    const expected: Array<{ craftingId: string; receiptId: string; anatomyId: string; craftPlanId: string }> = [];

    for (let iteration = 0; iteration < 3; iteration += 1) {
      const artifacts = await buildTransplantArtifacts(container, host, donor);
      expected.push({
        craftingId: artifacts.decision.craftingId,
        receiptId: artifacts.receipt.receiptId,
        anatomyId: artifacts.anatomy.anatomyId,
        craftPlanId: artifacts.plan.craftPlanId,
      });

      const advisory = await createRuntime(container, 'advisory', iteration);
      advisory.crafting.registerCraftPlan(artifacts.plan);
      let advisoryRoute = advisory.routes.create(key.id, routePlan(), {
        projectId: host,
        crafting: {
          craftingId: artifacts.decision.craftingId, mode: artifacts.decision.mode,
          featureContractHash: artifacts.decision.featureContractHash, referenceSetHash: artifacts.decision.referenceSetHash,
          groundingReceiptId: artifacts.receipt.receiptId, craftPlanId: artifacts.plan.craftPlanId, state: 'ready',
        },
      });
      const advisoryLease = advisory.crafting.issueLease({
        principalId: key.id, projectId: host, routeContextId: advisoryRoute.routeContextId,
        crafting: advisoryRoute.crafting!, routeExpiresAt: Date.parse(advisoryRoute.expiresAt),
      });
      advisoryRoute = advisory.routes.updateCrafting(advisoryRoute.routeContextId, key.id, { leaseId: advisoryLease.leaseId });
      const wouldBlock = await validateCraftingBeforeOperation(advisory, key, advisoryRoute, 'write_file', {
        path: path.join(host, 'src', 'core.mjs'), craftingIntent: { origin: 'host_original', sparepartId: 'core' },
      });
      expect(wouldBlock).toMatchObject({ enforcement: 'advisory', required: true, valid: false, advisoryCode: 'CLEAN_ROOM_PARALLEL_IMPLEMENTATION' });

      const enforce = await createRuntime(container, 'enforce', iteration);
      enforce.crafting.registerCraftPlan(artifacts.plan);
      let route = enforce.routes.create(key.id, routePlan(), {
        projectId: host,
        crafting: {
          craftingId: artifacts.decision.craftingId, mode: artifacts.decision.mode,
          featureContractHash: artifacts.decision.featureContractHash, referenceSetHash: artifacts.decision.referenceSetHash,
          groundingReceiptId: artifacts.receipt.receiptId, craftPlanId: artifacts.plan.craftPlanId, state: 'ready',
        },
      });
      const lease = enforce.crafting.issueLease({
        principalId: key.id, projectId: host, routeContextId: route.routeContextId,
        crafting: route.crafting!, routeExpiresAt: Date.parse(route.expiresAt),
      });
      route = enforce.routes.updateCrafting(route.routeContextId, key.id, { leaseId: lease.leaseId });
      await expect(validateCraftingBeforeOperation(enforce, key, route, 'write_file', {
        path: path.join(host, 'src', 'core.mjs'), craftingIntent: { origin: 'donor_derived', sparepartId: 'core' },
      })).resolves.toMatchObject({ valid: true });
      await expect(validateCraftingBeforeOperation(enforce, key, route, 'write_file', {
        path: path.join(host, 'src', 'registry-adapter.mjs'), craftingIntent: { origin: 'compatibility', sparepartId: 'registry', compatibilityBoundary: 'operational_execution' },
      })).resolves.toMatchObject({ valid: true });

      const donorCore = await readFile(path.join(donor, 'src', 'core.mjs'), 'utf8');
      const adaptedCore = donorCore
        .replace("./registry.mjs", "./registry-adapter.mjs")
        .replace("import { trace } from './telemetry.mjs';\n", '')
        .replace(' trace(value);', '');
      await enforce.filesystem.writeFile(path.join(host, 'src', 'registry-adapter.mjs'), "export const dispatch = (value) => `host:${value}`;\n");
      await enforce.filesystem.writeFile(path.join(host, 'src', 'core.mjs'), adaptedCore);
      await enforce.filesystem.writeFile(
        path.join(host, 'tests', 'core.test.mjs'),
        "import assert from 'node:assert/strict';\nimport { processValue } from '../src/core.mjs';\nassert.equal(processValue('  HELLO  '), 'host:hello');\n",
      );

      await enforce.execution.open();
      const scope = { principalId: key.id, projectId: host };
      const controller = new CraftingExecutionController(enforce.execution);
      const started = await controller.startDag(scope, artifacts.plan, {
        objective: 'Verify transplanted processor',
        maxConcurrency: 3,
        steps: [
          {
            stepId: 'donor-parity', purpose: 'run donor behavior parity',
            command: `node ${JSON.stringify(path.join(donor, 'test', 'core.test.mjs'))}`, cwd: container,
            sparepartId: 'core',
            expectedArtifacts: [{ path: path.join(donor, 'test', 'core.test.mjs'), kind: 'file', required: true, artifactType: 'test_report' }],
          },
          {
            stepId: 'host-integration', purpose: 'run host integration',
            command: `node ${JSON.stringify(path.join(host, 'tests', 'core.test.mjs'))}`, cwd: container,
            sparepartId: 'core', compatibilityBoundary: 'operational_execution',
            expectedArtifacts: [{ path: path.join(host, 'tests', 'core.test.mjs'), kind: 'file', required: true, artifactType: 'test_report' }],
          },
          {
            stepId: 'impact-audit', purpose: 'verify only selected host outputs exist',
            command: "node -e \"const fs=require('node:fs');if(!fs.existsSync('src/core.mjs')||fs.existsSync('src/telemetry.mjs'))process.exit(1)\"",
            cwd: host,
            expectedArtifacts: [{ path: path.join(host, 'src', 'core.mjs'), kind: 'file', required: true, artifactType: 'build' }],
          },
        ],
      });
      await waitForTerminal(enforce, scope, started.run.runId, started.run.lastEventSequence);
      const observed = await controller.observe(scope, artifacts.plan, started.run.runId);
      expect(observed.status, JSON.stringify({ failed: observed.failedNodeIds, blocked: observed.blockedNodeIds, active: observed.activeNodeIds, missing: observed.missingEvidenceNodeIds, run: observed.run.nodes.map((node) => ({ id: node.nodeId, state: node.state })) })).toBe('verified');

      const verification = await new CraftingVerificationCoordinator().verify({
        decision: artifacts.decision,
        craftPlan: artifacts.plan,
        donorBehavior: [{
          behaviorId: 'normalize-before-dispatch', required: true, disposition: 'preserved', evidenceRefs: ['execution:donor-parity'],
        }],
        hostVerification: [{
          verificationId: 'host-integration', status: 'passed', evidenceRefs: ['execution:host-integration'],
        }],
        execution: { processState: 'succeeded', requiredEvidenceState: 'verified' },
        impact: {
          completeness: 'complete', affectedPaths: ['src/core.mjs', 'src/registry-adapter.mjs'],
          unresolvedUnknowns: [], evidenceRefs: ['execution:impact-audit'],
        },
        verificationMode: 'stable',
      });
      expect(verification.status).toBe('verified');
      expect(await readFile(path.join(host, 'src', 'core.mjs'), 'utf8')).toContain("./registry-adapter.mjs");
      await expect(readFile(path.join(host, 'src', 'telemetry.mjs'), 'utf8')).rejects.toThrow();
    }

    expect(expected).toHaveLength(3);
    expect(expected[1]).toEqual(expected[0]);
    expect(expected[2]).toEqual(expected[0]);
  });
});
