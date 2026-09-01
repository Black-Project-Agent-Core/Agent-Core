import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryService } from '../src/memory/service.js';
import type { MemoryScope } from '../src/memory/types.js';

const roots: string[] = [];
const services: MemoryService[] = [];

async function fixture(label: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-observatory-projection-${label}-`));
  roots.push(root);
  const config = loadConfig({ AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite') }, root).memory;
  const service = new MemoryService(config);
  services.push(service);
  return { root, service };
}

afterEach(async () => {
  await Promise.all(services.splice(0).map(async (service) => {
    try { await service.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function linkExisting(
  service: MemoryService,
  scope: MemoryScope,
  source: { memoryId: string; canonicalKey: string; kind: 'failure' | 'decision' | 'artifact'; value: string },
  targetMemoryId: string,
  relation: 'resolved_by' | 'validated_by',
) {
  return service.applyPostflight({
    scope,
    routeContextId: `route-${relation}-${source.memoryId}`,
    candidate: { canonicalKey: source.canonicalKey, kind: source.kind, value: source.value },
    targetMemoryId: source.memoryId,
    reasonCodes: ['SAME_BELIEF_NEW_EVIDENCE'],
    evidenceRefs: [`test:${relation}`],
    proposedRelations: [{ targetMemoryId, relation, evidenceRefs: [`test:${relation}`] }],
  });
}

describe('authoritative read-only memory observatory projection', () => {
  it('projects an exact failure -> solution -> validation graph without changing DMF state', async () => {
    const { service, root } = await fixture('causal');
    const scope = { principalId: 'principal-causal', projectId: root };
    const failureValue = 'Rendering doubled font size after post-scaling.';
    const solutionValue = 'Preserve source-native geometry.';
    const validationValue = 'Six-file regression corpus passed.';
    const failure = await service.commit({ scope, canonicalKey: 'failure.geometry', kind: 'failure', value: failureValue, sourceType: 'test' });
    const solution = await service.commit({ scope, canonicalKey: 'decision.geometry.solution', kind: 'decision', value: solutionValue, sourceType: 'test' });
    const validation = await service.commit({ scope, canonicalKey: 'artifact.geometry.validation', kind: 'artifact', value: validationValue, sourceType: 'test' });
    await linkExisting(service, scope, { memoryId: failure.memoryId, canonicalKey: 'failure.geometry', kind: 'failure', value: failureValue }, solution.memoryId, 'resolved_by');
    await linkExisting(service, scope, { memoryId: solution.memoryId, canonicalKey: 'decision.geometry.solution', kind: 'decision', value: solutionValue }, validation.memoryId, 'validated_by');

    const before = await service.export(scope, 100);
    const snapshot = await service.observatorySnapshot({ scope, maxNodes: 20, maxEdges: 20 });
    const after = await service.export(scope, 100);

    expect(snapshot.nodes.map((node) => node.memoryId).sort()).toEqual([failure.memoryId, solution.memoryId, validation.memoryId].sort());
    expect(snapshot.edges).toHaveLength(2);
    expect(snapshot.edges.map((edge) => [edge.fromMemoryId, edge.relation, edge.toMemoryId])).toEqual(expect.arrayContaining([
      [failure.memoryId, 'resolved_by', solution.memoryId],
      [solution.memoryId, 'validated_by', validation.memoryId],
    ]));
    expect(before).toEqual(after);
  });

  it('keeps one node while the authoritative current revision advances', async () => {
    const { service, root } = await fixture('revision');
    const scope = { principalId: 'principal-revision', projectId: root };
    const first = await service.commit({ scope, canonicalKey: 'decision.revision', kind: 'decision', value: 'Revision one.', sourceType: 'test' });
    const before = await service.observatorySnapshot({ scope, maxNodes: 20, maxEdges: 20 });
    await service.revise({ scope, memoryId: first.memoryId, value: 'Revision two.', sourceType: 'test' });
    const after = await service.observatorySnapshot({ scope, maxNodes: 20, maxEdges: 20 });

    expect(before.nodes).toHaveLength(1);
    expect(after.nodes).toHaveLength(1);
    expect(before.nodes[0]?.revisionNo).toBe(1);
    expect(after.nodes[0]?.revisionNo).toBe(2);
    expect(after.nodes[0]?.memoryId).toBe(first.memoryId);
  });

  it('shows a branch parent and directed branch_of edge', async () => {
    const { service, root } = await fixture('branch');
    const scope = { principalId: 'principal-branch', projectId: root };
    const parent = await service.commit({ scope, canonicalKey: 'decision.parent', kind: 'decision', value: 'Parent approach.', sourceType: 'test' });
    const branch = await service.applyPostflight({
      scope,
      routeContextId: 'route-branch',
      candidate: { canonicalKey: 'decision.branch', kind: 'decision', value: 'Distinct branch.', title: 'Distinct Branch' },
      branchParentMemoryId: parent.memoryId,
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['test:branch'],
      proposedRelations: [{ targetMemoryId: parent.memoryId, relation: 'branch_of', evidenceRefs: ['test:branch'] }],
    });
    expect(branch.decision).toBe('WRITE_BRANCH');

    const snapshot = await service.observatorySnapshot({ scope, maxNodes: 20, maxEdges: 20 });
    const branchNode = snapshot.nodes.find((node) => node.memoryId === branch.memoryId);
    expect(branchNode).toMatchObject({ title: 'Distinct Branch', branchParentMemoryId: parent.memoryId });
    expect(snapshot.edges).toContainEqual(expect.objectContaining({
      fromMemoryId: branch.memoryId,
      toMemoryId: parent.memoryId,
      relation: 'branch_of',
    }));
  });

  it('enforces project scope and never includes nodes or edges from another project', async () => {
    const { service, root } = await fixture('isolation');
    const scopeA = { principalId: 'principal-shared', projectId: `${root}/project-a` };
    const scopeB = { principalId: 'principal-shared', projectId: `${root}/project-b` };
    const a = await service.commit({ scope: scopeA, canonicalKey: 'decision.project-a', kind: 'decision', value: 'A only.', sourceType: 'test' });
    const b = await service.commit({ scope: scopeB, canonicalKey: 'decision.project-b', kind: 'decision', value: 'B only.', sourceType: 'test' });

    const snapshotA = await service.observatorySnapshot({ scope: scopeA, maxNodes: 20, maxEdges: 20 });
    expect(snapshotA.nodes.map((node) => node.memoryId)).toEqual([a.memoryId]);
    expect(snapshotA.nodes.some((node) => node.memoryId === b.memoryId)).toBe(false);
    expect(snapshotA.edges.some((edge) => edge.fromMemoryId === b.memoryId || edge.toMemoryId === b.memoryId)).toBe(false);
  });

  it('bounds nodes/edges deterministically and strips principal, lease, API-key, and secret-bearing fields from snapshot and detail', async () => {
    const { service, root } = await fixture('privacy');
    const principal = 'principal-privacy-SENTINEL';
    const scope = { principalId: principal, projectId: root };
    const secret = 'agent_core_live_1234567890abcdefghijklmnopqrstuvwxyz';
    const first = await service.commit({
      scope,
      canonicalKey: 'decision.private-one',
      kind: 'decision',
      value: `Safe decision with API key ${secret}`,
      sourceType: 'test',
    });
    await service.commit({ scope, canonicalKey: 'decision.private-two', kind: 'decision', value: 'Second decision.', sourceType: 'test' });
    await service.commit({ scope, canonicalKey: 'decision.private-three', kind: 'decision', value: 'Third decision.', sourceType: 'test' });

    const snapshot = await service.observatorySnapshot({ scope, maxNodes: 2, maxEdges: 1 });
    const detail = await service.observatoryNode(scope, first.memoryId);
    expect(snapshot.nodes).toHaveLength(2);
    expect(snapshot.truncated.nodes).toBe(true);
    expect(snapshot.nodes).toEqual([...snapshot.nodes].sort((left, right) => right.updatedAt - left.updatedAt || left.memoryId.localeCompare(right.memoryId)));
    expect(detail?.memoryId).toBe(first.memoryId);

    const serialized = JSON.stringify({ snapshot, detail });
    expect(serialized).not.toContain(principal);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(/principalId|lease|apiKey|encryptionKey|keyFile|token/i);
  });
});
