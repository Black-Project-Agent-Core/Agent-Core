import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { WorkflowService, type WorkflowScope } from '../src/workflow/service.js';
import { EngineeringEnforcement } from '../src/workflow/engineering-enforcement.js';
import { WorkflowSources } from '../src/workflow/source.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('ac-capture-atomic-')) throw new Error('Unexpected fixture cleanup root');
    await rm(resolved, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'ac-capture-atomic-')); roots.push(root);
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', 'value.mjs'), 'export function value() { return 1; }\n');
  const workspace = new WorkspacePolicy([root]);
  const stateRoot = path.join(root, 'runtime', 'state');
  const cacheRoot = path.join(root, 'runtime', 'sources');
  const service = new WorkflowService({ workspace, stateRoot, cacheRoot, projectRoot: root });
  const scope: WorkflowScope = { principalId: 'fixture', projectId: root, taskId: 'first-engineering-capture' };
  await service.bind(scope, { brief: 'Inspect service status', workflow: 'direct' });
  await service.bind(scope, { brief: 'Inspect service status', workflow: 'direct' });
  const sources = new WorkflowSources(workspace, cacheRoot);
  const engineering = new EngineeringEnforcement({ workspace, store: service.store, sources, cacheRoot, protectedRoots: [stateRoot, cacheRoot], now: Date.now });
  const before = (await service.store.read(scope))!;
  expect(before.version).toBe(2);
  expect(before.engineering).toBeUndefined();
  return { service, scope, engineering, sources, before };
}

describe('atomic first engineering evidence capture', () => {
  it('accepts the caller current version while activating and capturing in one version transition', async () => {
    const { service, scope, before } = await fixture();
    const receipt = await service.source(scope, { operation: 'discover', role: 'target', query: 'value', expectedVersion: before.version });
    expect(receipt).toMatchObject({ version: 3, engineeringPolicy: 'engineering-v1', receipt: { kind: 'discovery' } });
    const after = (await service.store.read(scope))!;
    expect(after).toMatchObject({ version: 3, planRequired: true, engineering: { required: true, evidence: [{ kind: 'discovery' }] } });
    expect(after.engineering?.evidence).toHaveLength(1);
  });

  it('preserves existing activation and receipts when subsequent captures advance once', async () => {
    const { service, scope } = await fixture();
    await service.source(scope, { operation: 'discover', role: 'target', expectedVersion: 2 });
    const first = (await service.store.read(scope))!;
    await service.source(scope, { operation: 'discover', role: 'target', expectedVersion: 3, query: 'another lookup' });
    const next = (await service.store.read(scope))!;
    expect(next.version).toBe(4);
    expect(next.engineering?.activatedAt).toBe(first.engineering?.activatedAt);
    expect(next.engineering?.evidence).toHaveLength(2);
    expect(next.engineering?.evidence[0]).toEqual(first.engineering?.evidence[0]);
  });

  it('rejects an already stale expected version before activation or collection', async () => {
    const { service, scope, engineering, before } = await fixture();
    const discovery = vi.spyOn(engineering.discovery, 'discover');
    await expect(engineering.capture(scope, { operation: 'discover', role: 'target', expectedVersion: 1 })).rejects.toMatchObject({
      code: 'WORKFLOW_VERSION_CONFLICT', details: { expectedVersion: 1, actualVersion: 2 },
    });
    expect(discovery).not.toHaveBeenCalled();
    expect(await service.store.read(scope)).toEqual(before);
  });

  it.each(['role', 'impact-targets', 'assessment', 'collector', 'source-change', 'cache'] as const)('does not persist activation when %s validation/acquisition fails', async failure => {
    const { service, scope, engineering, sources, before } = await fixture();
    if (failure === 'collector') vi.spyOn(engineering.discovery, 'discover').mockRejectedValue(new Error('fixture collection failed'));
    if (failure === 'cache') vi.spyOn(sources, 'cache').mockRejectedValue(new Error('fixture cache failed'));
    if (failure === 'source-change') {
      const collect = engineering.discovery.collect.bind(engineering.discovery);
      let collections = 0;
      vi.spyOn(engineering.discovery, 'collect').mockImplementation(async root => {
        const inventory = await collect(root);
        return ++collections === 1 ? inventory : { ...inventory, coverage: { ...inventory.coverage, inventoryHash: '0'.repeat(64) } };
      });
    }
    await expect(engineering.capture(scope, {
      operation: failure === 'impact-targets' ? 'impact' : failure === 'assessment' ? 'review' : 'discover',
      role: failure === 'role' ? 'donor' : 'target', expectedVersion: before.version,
    })).rejects.toBeDefined();
    expect(await service.store.read(scope)).toEqual(before);
  });

  it.each([true, false])('rejects a concurrent update during acquisition without partial activation (explicit version: %s)', async explicit => {
    const { service, scope, engineering, before } = await fixture();
    const discover = engineering.discovery.discover.bind(engineering.discovery);
    let concurrent: Awaited<ReturnType<typeof service.store.read>>;
    vi.spyOn(engineering.discovery, 'discover').mockImplementationOnce(async (root, query) => {
      const evidence = await discover(root, query);
      const current = (await service.store.read(scope))!;
      concurrent = await service.store.update(scope, current.version, record => {
        record!.context = 'Concurrent controller update';
        return record!;
      });
      return evidence;
    });
    await expect(engineering.capture(scope, { operation: 'discover', role: 'target', ...(explicit ? { expectedVersion: before.version } : {}) })).rejects.toMatchObject({ code: 'WORKFLOW_VERSION_CONFLICT' });
    const after = (await service.store.read(scope))!;
    expect(after).toEqual(concurrent!);
    expect(after.version).toBe(3);
    expect(after.engineering).toBeUndefined();
  });

  it.each(['CLOSURE_PENDING', 'CLOSED'] as const)('does not activate %s records', async phase => {
    const { service, scope, engineering } = await fixture();
    const before = await service.store.update(scope, 2, record => { record!.phase = phase; return record!; });
    await expect(engineering.capture(scope, { operation: 'discover', role: 'target', expectedVersion: before.version })).rejects.toMatchObject({ code: 'WORKFLOW_CLOSED' });
    expect(await service.store.read(scope)).toEqual(before);
  });
});
