import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { resolveCraftingMode, type CraftingFeatureContract, type CraftingReference } from '../src/crafting/mode-resolver.js';
import {
  GroundingError,
  buildSourceGroundingReceipt,
  inspectSourceEvidence,
  validateGroundingReceipt,
} from '../src/crafting/source-grounding.js';
import { resolveReferenceSource } from '../src/crafting/reference-resolution.js';

const roots: string[] = [];
const feature: CraftingFeatureContract = {
  featureId: 'grounding-fixture', title: 'Grounding Fixture', objective: 'Ground actual implementation source.',
  requiredBehaviors: ['preserve behavior'], requiredInvariants: ['source facts required'],
  explicitNonGoals: [], targetAuthorities: [], verificationRequirements: ['ported test'],
  planFingerprint: 'a'.repeat(64),
};

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-crafting-grounding-'));
  roots.push(root);
  await mkdir(path.join(root, 'src'));
  await mkdir(path.join(root, 'tests'));
  await writeFile(path.join(root, 'README.md'), '# Feature docs\n');
  await writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(path.join(root, 'src', 'feature.ts'), 'export function feature() { return helper(); }\nfunction helper(){ return 1; }\n');
  await writeFile(path.join(root, 'tests', 'feature.test.ts'), 'test("feature", () => feature());\n');
  const reference: CraftingReference = {
    referenceId: 'donor', kind: 'local_repo', localPath: root,
    commit: '1'.repeat(40), tree: '2'.repeat(40),
    featureScope: 'feature', approvalSource: 'user',
  };
  const decision = resolveCraftingMode({
    routeContextId: 'route', projectId: root, feature, references: [reference],
  });
  const workspace = new WorkspacePolicy([root]);
  const resolved = await resolveReferenceSource(reference, root, workspace);
  return { root, reference, decision, workspace, resolved };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Real Steel source grounding', () => {
  it('rejects README and package metadata as sufficient transplantation grounding', async () => {
    const f = await fixture();
    const readme = await inspectSourceEvidence({
      workspace: f.workspace, reference: f.resolved, relativePath: 'README.md',
      role: 'entry_point', observation: 'README claims where feature lives',
    });
    const metadata = await inspectSourceEvidence({
      workspace: f.workspace, reference: f.resolved, relativePath: 'package.json',
      role: 'config', observation: 'package metadata',
    });
    expect(() => buildSourceGroundingReceipt({
      decision: f.decision, evidence: [readme, metadata],
      requirements: { tests: true, lifecycle: false, stateOrConfig: false },
    })).toThrow(GroundingError);
  });

  it('requires actual source entry/dependency evidence plus applicable donor tests', async () => {
    const f = await fixture();
    const entry = await inspectSourceEvidence({
      workspace: f.workspace, reference: f.resolved, relativePath: 'src/feature.ts',
      symbol: 'feature', role: 'entry_point', observation: 'feature entry point',
    });
    expect(() => buildSourceGroundingReceipt({
      decision: f.decision, evidence: [entry],
      requirements: { tests: true, lifecycle: false, stateOrConfig: false },
    })).toThrow(GroundingError);

    const dependency = { ...entry, evidenceId: `${entry.evidenceId}:dep`, symbol: 'helper', role: 'dependency' as const };
    const testEvidence = await inspectSourceEvidence({
      workspace: f.workspace, reference: f.resolved, relativePath: 'tests/feature.test.ts',
      role: 'test', observation: 'donor behavior test',
    });
    const receipt = buildSourceGroundingReceipt({
      decision: f.decision, evidence: [entry, dependency, testEvidence],
      requirements: { tests: true, lifecycle: false, stateOrConfig: false },
    });
    expect(receipt.completeness).toBe('sufficient');
    expect(receipt.inspectedSourceFiles).toContain('src/feature.ts');
    expect(receipt.inspectedTests).toEqual(['tests/feature.test.ts']);
  });
  it('rejects evidence whose reference identity no longer matches the locked decision', async () => {
    const f = await fixture();
    const entry = await inspectSourceEvidence({
      workspace: f.workspace, reference: f.resolved, relativePath: 'src/feature.ts',
      role: 'entry_point', observation: 'entry point',
    });
    const dependency = { ...entry, evidenceId: `${entry.evidenceId}:dep`, role: 'dependency' as const };
    const testEvidence = await inspectSourceEvidence({
      workspace: f.workspace, reference: f.resolved, relativePath: 'tests/feature.test.ts',
      role: 'test', observation: 'test',
    });
    const receipt = buildSourceGroundingReceipt({
      decision: f.decision, evidence: [entry, dependency, testEvidence],
      requirements: { tests: true, lifecycle: false, stateOrConfig: false },
    });
    const changedDecision = resolveCraftingMode({
      routeContextId: 'route', projectId: f.root, feature,
      references: [{ ...f.reference, tree: '3'.repeat(40) }],
    });
    expect(() => validateGroundingReceipt(changedDecision, receipt)).toThrow(GroundingError);
  });

  it('does not require donor grounding in BUILD_FROM_ZERO and rejects donor evidence in that locked mode', async () => {
    const f = await fixture();
    const zero = resolveCraftingMode({ routeContextId: 'route-zero', projectId: f.root, feature });
    const entry = await inspectSourceEvidence({
      workspace: f.workspace, reference: f.resolved, relativePath: 'src/feature.ts',
      role: 'entry_point', observation: 'donor evidence',
    });
    expect(() => buildSourceGroundingReceipt({
      decision: zero, evidence: [entry],
      requirements: { tests: false, lifecycle: false, stateOrConfig: false },
    })).toThrow(GroundingError);
  });

  it('requires lifecycle and state/config evidence when the feature declares them applicable', async () => {
    const f = await fixture();
    const entry = await inspectSourceEvidence({
      workspace: f.workspace, reference: f.resolved, relativePath: 'src/feature.ts',
      role: 'entry_point', observation: 'entry',
    });
    const dependency = { ...entry, evidenceId: `${entry.evidenceId}:dep`, role: 'interface' as const };
    expect(() => buildSourceGroundingReceipt({
      decision: f.decision, evidence: [entry, dependency],
      requirements: { tests: false, lifecycle: true, stateOrConfig: true },
    })).toThrow(GroundingError);
  });
});
