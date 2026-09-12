import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkflowService, type WorkflowPlanInput, type WorkflowScope } from '../src/workflow/service.js';
import type { EngineeringEnforcement } from '../src/workflow/engineering-enforcement.js';
import type { WorkflowActiveWriter } from '../src/workflow/operation-ledger.js';
import { engineeringIdentity, engineeringStateSchema } from '../src/workflow/engineering-policy.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { assessPlan, acceptCurrentReview } from './helpers/engineering.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('ac-engineering-integrity-')) throw Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
async function fixture(dependencies = false) {
  const root = await mkdtemp(path.join(tmpdir(), 'ac-engineering-integrity-')); roots.push(root);
  const source = path.join(root, 'src'), target = path.join(source, 'target.ts'), manifest = path.join(root, 'package.json');
  await mkdir(source); await writeFile(target, 'export const value = 1;\n');
  const installed = (name: string) => path.join(root, 'node_modules', name, 'package.json');
  if (dependencies) {
    await writeFile(manifest, JSON.stringify({ dependencies: { alpha: '1.0.0', beta: '1.0.0' } }));
    for (const name of ['alpha', 'beta']) { await mkdir(path.dirname(installed(name)), { recursive: true }); await writeFile(installed(name), JSON.stringify({ name, version: '1.0.0' })); }
  }
  const service = new WorkflowService({ workspace: new WorkspacePolicy([root]), projectRoot: root, stateRoot: path.join(root, 'runtime', 'state'), cacheRoot: path.join(root, 'runtime', 'source-cache') });
  const scope: WorkflowScope = { principalId: 'fixture', projectId: 'agent-core://self', taskId: 'integrity' };
  await service.bind(scope, { brief: 'Implement a corrected source module', workflow: 'direct' });
  const plan: WorkflowPlanInput = { expectedVersion: (await service.status(scope))!.version, mappings: [], steps: [
    { id: 'edit', kind: 'command', purpose: 'Update the source directory', command: 'node update.mjs', paths: [source] },
    ...(dependencies ? [{ id: 'manifest', kind: 'edit' as const, purpose: 'Update the declaration manifest', paths: [manifest] }] : []),
    { id: 'test', kind: 'verification', purpose: 'Verify the public behavior', command: 'node verify.mjs', paths: [] },
  ], checks: [{ id: 'behavior', kind: 'integration', purpose: 'Public behavior remains valid', stepIds: ['test'], requirementIds: [], artifactPaths: [path.join(root, 'reports', 'behavior.json')] }] };
  await assessPlan(service, scope, plan); const accepted = await service.submitPlan(scope, plan);
  const enforcement = (service as unknown as { engineering: EngineeringEnforcement }).engineering;
  const operation = { toolName: 'execute_command', command: 'node update.mjs', paths: [source], stepId: 'edit', planVersion: 1, viaExecution: true };
  const writer = (writes: string[]): WorkflowActiveWriter => ({ runId: 'fixture-run', nodeId: 'sibling', attemptId: 'fixture-attempt', attemptNo: 1, planHash: accepted.plan!.hash, planRevision: 1, writes });
  return { root, source, target, manifest, installed, service, scope, enforcement, operation, writer };
}

describe('effective engineering output and facility authority', () => {
  it.each(['restored-original', 'removed-created', 'restored-deleted'] as const)('rejects an unacknowledged %s below a planned directory target', async scenario => {
    const f = await fixture(), original = await readFile(f.target, 'utf8'), created = path.join(f.source, 'created.ts');
    await f.service.authorize(f.scope, f.operation);
    if (scenario === 'restored-original') await writeFile(f.target, 'export const value = 2;\n');
    else if (scenario === 'removed-created') await writeFile(created, 'export const created = 1;\n');
    else await rm(f.target);
    await f.service.recordOperation(f.scope, f.operation);
    await f.service.authorize(f.scope, f.operation);
    if (scenario === 'removed-created') await rm(created); else await writeFile(f.target, original);
    await expect(f.service.authorize(f.scope, f.operation)).rejects.toMatchObject({ code: 'ENGINEERING_UNPLANNED_CHANGE' });
    await expect(f.service.source(f.scope, { operation: 'review', role: 'target' })).rejects.toMatchObject({ code: 'ENGINEERING_UNPLANNED_CHANGE' });
  });

  it('does not defer an unrelated installed dependency change while a source writer is active', async () => {
    const f = await fixture(true); await writeFile(f.installed('alpha'), JSON.stringify({ name: 'alpha', version: '2.0.0' }));
    await expect(f.service.assertExecution(f.scope, { operation: 'execution_start', nodes: [{ command: 'node verify.mjs', stepIds: ['test'], resources: { writes: [] } }], executionTrust: { stage: 'start', activeWriters: [f.writer([f.source])] } })).rejects.toMatchObject({ code: 'ENGINEERING_FACILITIES_STALE' });
  });

  it('does not acknowledge an unrelated installed change through a legitimate package declaration edit', async () => {
    const f = await fixture(true), operation = { toolName: 'edit_file', path: f.manifest, stepId: 'manifest', planVersion: 1 };
    await f.service.authorize(f.scope, operation);
    await writeFile(f.manifest, JSON.stringify({ description: 'planned description', dependencies: { alpha: '1.0.0', beta: '1.0.0' } }));
    await writeFile(f.installed('beta'), JSON.stringify({ name: 'beta', version: '2.0.0' }));
    const before = await f.service.store.read(f.scope);
    await expect(f.service.recordOperation(f.scope, operation)).rejects.toMatchObject({ code: 'ENGINEERING_FACILITIES_STALE' });
    expect(await f.service.store.read(f.scope)).toEqual(before);
  });

  it('acknowledges one installed output while preserving the previous values of an active sibling', async () => {
    const f = await fixture(true), record = (await f.service.store.read(f.scope))!;
    for (const name of ['alpha', 'beta']) await writeFile(f.installed(name), JSON.stringify({ name, version: '2.0.0' }));
    await f.enforcement.recordOutputs(record, [f.installed('alpha')], [f.writer([f.installed('beta')])]);
    expect(record.engineering!.acknowledgedFacilities!.dependencies.map(item => [item.name, item.installedVersion])).toEqual([['alpha', '2.0.0'], ['beta', '1.0.0']]);
    expect(engineeringStateSchema.safeParse(record.engineering).success).toBe(true);
    await expect(f.enforcement.assertCurrent(record)).rejects.toMatchObject({ code: 'ENGINEERING_FACILITIES_STALE' });
    await f.enforcement.recordOutputs(record, [f.installed('beta')]);
    await expect(f.enforcement.assertCurrent(record)).resolves.toHaveProperty('coverage.complete', true);
  });

  it('never defers native runtime identity while any source or dependency writer is active', async () => {
    const f = await fixture(true), record = (await f.service.store.read(f.scope))!, inventory = await f.enforcement.discovery.collect(f.root);
    vi.spyOn(f.enforcement.discovery, 'collect').mockResolvedValue({ ...inventory, facilities: { ...inventory.facilities, nodeVersion: 'different-runtime' } });
    await expect(f.enforcement.assertCurrent(record, [f.writer([f.root])])).rejects.toMatchObject({ code: 'ENGINEERING_FACILITIES_STALE' });
  });

  it('reads unchanged hash-only historical facility state but rejects an unknown acknowledged baseline', async () => {
    const f = await fixture(true), record = (await f.service.store.read(f.scope))!;
    const discovery = record.engineering!.evidence.find(item => item.kind === 'discovery')!;
    record.engineering!.facilitiesHash = engineeringIdentity(discovery.data.inventory.facilities);
    await expect(f.enforcement.assertCurrent(record)).resolves.toHaveProperty('coverage.complete', true);
    record.engineering!.facilitiesHash = 'f'.repeat(64);
    await expect(f.enforcement.assertCurrent(record, [f.writer([f.root])])).rejects.toMatchObject({ code: 'ENGINEERING_FACILITIES_BASELINE_UNAVAILABLE' });
  });

  it('invalidates the accepted review after a subsequent acknowledged source operation', async () => {
    const f = await fixture(); await acceptCurrentReview(f.service, f.scope);
    await f.service.authorize(f.scope, f.operation); await writeFile(f.target, 'export const value = 2;\n');
    await f.service.recordOperation(f.scope, f.operation);
    expect((await f.service.store.read(f.scope))!.engineering!.review).toBeUndefined();
    await expect(f.service.prepareCompletion(f.scope, { runs: [] })).rejects.toMatchObject({ code: 'ENGINEERING_REVIEW_REQUIRED' });
  });
});
