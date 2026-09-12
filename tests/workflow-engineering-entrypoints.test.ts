import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkflowService, type WorkflowPlanInput, type WorkflowScope } from '../src/workflow/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { workflowScopeId } from '../src/workflow/store.js';
import { assessPlan, submitAssessedPlan } from './helpers/engineering.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('ac-engineering-entry-')) throw Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

async function fixture(brief = 'Fix module behavior with README.md documentation') {
  const root = await mkdtemp(path.join(tmpdir(), 'ac-engineering-entry-')); roots.push(root);
  const target = path.join(root, 'src', 'target.ts'), documentation = path.join(root, 'README.md');
  await mkdir(path.dirname(target));
  await writeFile(target, 'export function value() { return 1; }\n');
  await writeFile(documentation, '# Module\nThe public value is documented heer.\n');
  const options = { workspace: new WorkspacePolicy([root]), projectRoot: root, stateRoot: path.join(root, 'runtime', 'state'), cacheRoot: path.join(root, 'runtime', 'source-cache') };
  const service = new WorkflowService(options), scope: WorkflowScope = { principalId: 'fixture', projectId: 'agent-core://self', taskId: 'entrypoints' };
  await service.bind(scope, { brief, workflow: 'direct' });
  const artifact = path.join(root, 'reports', 'verification.json');
  const plan: WorkflowPlanInput = { expectedVersion: (await service.status(scope))!.version, steps: [
    { id: 'edit', kind: 'edit', purpose: 'Correct existing public behavior', paths: [target] },
    { id: 'verify', kind: 'verification', purpose: 'Verify the current public behavior', command: 'node verify.mjs', paths: [] },
  ], checks: [{ id: 'behavior', kind: 'integration', purpose: 'Public behavior matches its contract', stepIds: ['verify'], requirementIds: [], artifactPaths: [artifact] }], mappings: [] };
  return { root, target, documentation, artifact, options, service, scope, plan };
}

describe('engineering entrypoint policy coverage', () => {
  it('keeps an active legacy plan readable, upgrades before its next edit, and requires fresh actual assessment', async () => {
    const f = await fixture(); await assessPlan(f.service, f.scope, f.plan);
    const accepted = await f.service.submitPlan(f.scope, f.plan);
    // Isolated historical-shape fixture: preserve actual source/plan receipts and remove only the optional newer policy state.
    const legacy = await f.service.store.update(f.scope, accepted.version, record => { delete record!.engineering; return record!; });
    const recordPath = path.join(f.options.stateRoot, 'workflow-contracts', workflowScopeId(f.scope) + '.json');
    const before = await readFile(recordPath, 'utf8'), sourceBefore = await readFile(f.target, 'utf8');
    const restarted = new WorkflowService(f.options);
    expect(await restarted.status(f.scope)).toMatchObject({ stateHash: legacy.stateHash, observedBlockers: [{ code: 'ENGINEERING_UPGRADE_REQUIRED' }] });
    expect(await readFile(recordPath, 'utf8')).toBe(before);
    const operation = { toolName: 'edit_file', path: f.target, stepId: 'edit', planVersion: 1 };
    await expect(restarted.authorize(f.scope, operation)).rejects.toMatchObject({ code: 'ENGINEERING_ASSESSMENT_REQUIRED' });
    const upgraded = (await restarted.store.read(f.scope))!;
    expect(upgraded.plan).toEqual(legacy.plan);
    expect(upgraded.engineering).toMatchObject({ required: true, evidence: [] });
    expect(upgraded.engineering!.assessment).toBeUndefined();
    expect(await readFile(f.target, 'utf8')).toBe(sourceBefore);
    await assessPlan(restarted, f.scope, f.plan);
    const reassessed = await restarted.submitPlan(f.scope, f.plan);
    expect(reassessed.plan!.revision).toBe(2);
    await expect(restarted.authorize(f.scope, { ...operation, planVersion: 2 })).resolves.toHaveProperty('engineering.assessment');
  });

  it('allows a documentation-only typo edit without requiring a coding assessment', async () => {
    const f = await fixture('Fix typo in README.md');
    const initial = (await f.service.status(f.scope))!;
    expect(initial).toMatchObject({ planRequired: false, craftRequired: false, dagRequired: false });
    expect(initial.engineering).toBeUndefined();
    const operation = { toolName: 'edit_file', path: f.documentation };
    await f.service.authorize(f.scope, operation);
    await writeFile(f.documentation, '# Module\nThe public value is documented here.\n');
    await f.service.recordOperation(f.scope, operation);
    expect((await f.service.prepareCompletion(f.scope, { runs: [] }))!.engineering).toBeUndefined();
    expect((await new WorkflowService(f.options).status(f.scope))!.engineering).toBeUndefined();
    expect(await readFile(f.target, 'utf8')).toBe('export function value() { return 1; }\n');
  });

  it('does not extend the documentation typo exemption to an actual source write', async () => {
    const f = await fixture('Fix typo in README.md');
    await expect(f.service.authorize(f.scope, { toolName: 'write_file', path: f.target })).rejects.toMatchObject({ code: 'WORKFLOW_PLAN_REQUIRED' });
    const record = (await f.service.store.read(f.scope))!;
    expect(record.engineering).toMatchObject({ required: true, evidence: [] });
    expect(record.engineering!.assessment).toBeUndefined();
    expect(await readFile(f.target, 'utf8')).toBe('export function value() { return 1; }\n');
  });

  it.each(['existing', 'new'] as const)('rejects a %s source output disguised as a verification artifact', async kind => {
    const f = await fixture('Verify the current public behavior');
    f.plan.steps = f.plan.steps.filter(step => step.id === 'verify');
    f.plan.checks[0]!.artifactPaths = [kind === 'existing' ? f.target : path.join(f.root, 'src', 'generated.ts')];
    await expect(f.service.submitPlan(f.scope,f.plan)).rejects.toMatchObject({code:'ENGINEERING_ASSESSMENT_REQUIRED'});
    await assessPlan(f.service,f.scope,f.plan);
    const before = await f.service.store.read(f.scope);
    await expect(f.service.submitPlan(f.scope, f.plan)).rejects.toMatchObject({ code: 'WORKFLOW_ARTIFACT_SOURCE_CONFLICT' });
    expect(await f.service.store.read(f.scope)).toEqual(before);
  });

  it('requires assessment when a verification-labeled step explicitly declares a source target', async () => {
    const f = await fixture('Verify the current public behavior');
    f.plan.steps = f.plan.steps.filter(step => step.id === 'verify'); f.plan.steps[0]!.paths = [f.target];
    f.plan.checks[0]!.artifactPaths = [f.target];
    await expect(f.service.submitPlan(f.scope, f.plan)).rejects.toMatchObject({ code: 'ENGINEERING_ASSESSMENT_REQUIRED' });
    expect((await f.service.store.read(f.scope))!.engineering).toMatchObject({ required: true, evidence: [] });
  });

  it('requires actual assessment for a verification-labeled shell command and enforces its exact report claims', async () => {
    const f = await fixture('Verify the current public behavior'); f.plan.steps = f.plan.steps.filter(step => step.id === 'verify');
    await expect(f.service.submitPlan(f.scope,f.plan)).rejects.toMatchObject({code:'ENGINEERING_ASSESSMENT_REQUIRED'});
    const accepted = await submitAssessedPlan(f.service,f.scope,f.plan);
    expect(accepted.engineering?.assessment).toBeDefined();
    const node = { id: 'verify', command: 'node verify.mjs', stepIds: ['verify'], resources: { writes: [f.artifact] } };
    await expect(f.service.assertExecution(f.scope, { operation: 'execution_create', planVersion: 1, nodes: [{...node,resources:{...node.resources,writes:[]}}] })).rejects.toMatchObject({code:'WORKFLOW_RESOURCE_COVERAGE_REQUIRED'});
    await expect(f.service.assertExecution(f.scope, { operation: 'execution_create', planVersion: 1, nodes: [node] })).resolves.toHaveProperty('planHash', accepted.plan!.hash);
    await writeFile(f.target,'export function value() { return 99; }\n');
    await expect(f.service.assertExecution(f.scope,{operation:'execution_start',planVersion:1,nodes:[node]})).rejects.toMatchObject({code:'ENGINEERING_UNPLANNED_CHANGE'});
  });

  it('requires mixed code/documentation target coverage and a real documentation read before acceptance', async () => {
    const f = await fixture(); f.plan.steps[0]!.paths!.push(f.documentation);
    await assessPlan(f.service, f.scope, f.plan);
    const codeTarget = f.plan.assessment!.targets.find(target => target.path === f.target)!;
    const docsTarget = f.plan.assessment!.targets.find(target => target.path === f.documentation)!;
    const omitted = structuredClone(f.plan); omitted.assessment!.targets = [codeTarget];
    await expect(f.service.submitPlan(f.scope, omitted)).rejects.toMatchObject({ code: 'ENGINEERING_TARGET_COVERAGE_REQUIRED' });
    const noDocRead = structuredClone(f.plan);
    const record = (await f.service.store.read(f.scope))!;
    const docReceiptIds = new Set(record.receipts.filter(receipt => record.snapshots.some(snapshot => snapshot.id === receipt.snapshotId && snapshot.path === f.documentation)).map(receipt => receipt.id));
    noDocRead.assessment!.targets.find(target => target.path === f.documentation)!.evidenceReceiptIds = docsTarget.evidenceReceiptIds.filter(id => !docReceiptIds.has(id));
    await expect(f.service.submitPlan(f.scope, noDocRead)).rejects.toMatchObject({ code: 'ENGINEERING_SOURCE_READ_REQUIRED' });
    const docs = await f.service.source(f.scope, { operation: 'read', role: 'target', path: f.documentation });
    docsTarget.evidenceReceiptIds.push(docs.receipt!.id);
    f.plan.expectedVersion = docs.version;
    const accepted = await f.service.submitPlan(f.scope, f.plan);
    expect(accepted.engineering!.assessment!.targets.map(target => target.path).sort()).toEqual([f.target, f.documentation].sort());
    await expect(f.service.authorize(f.scope, { toolName: 'edit_file', path: f.documentation, stepId: 'edit', planVersion: 1 })).resolves.toHaveProperty('engineering.assessment');
  });
});
