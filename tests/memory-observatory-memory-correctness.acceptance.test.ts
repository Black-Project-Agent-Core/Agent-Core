import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { MemoryActivityEvent, MemoryActivitySink } from '../src/memory/activity.js';
import { MemoryService } from '../src/memory/service.js';
import type { MemoryScope } from '../src/memory/types.js';

const roots: string[] = [];
const services: MemoryService[] = [];

class RecordingSink implements MemoryActivitySink {
  readonly events: MemoryActivityEvent[] = [];
  emit(event: MemoryActivityEvent): void { this.events.push(structuredClone(event)); }
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-observatory-memory-correctness-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })));
});

describe('Memory Observatory memory-behavior correctness', () => {
  it('visualizes revise/branch/root/conflict/remember_more truth without inventing durable nodes or recall history', async () => {
    const root = await tempRoot();
    const config = loadConfig({
      AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'memory.sqlite'),
      AGENT_CORE_MEMORY_REMOTE_ENABLED: 'false',
      AGENT_CORE_MEMORY_OBSERVATORY_ENABLED: 'true',
      AGENT_CORE_MEMORY_OBSERVATORY_MODE: 'shadow',
    }, root).memory;
    const sink = new RecordingSink();
    const service = new MemoryService(config, undefined, { activitySink: sink });
    services.push(service);
    const scope: MemoryScope = { principalId: 'observatory-correctness-principal', projectId: 'observatory-correctness-project' };

    const current = await service.applyPostflight({
      scope,
      routeContextId: 'correctness-root-current',
      candidate: {
        canonicalKey: 'correctness.current-decision',
        kind: 'decision',
        value: 'Use bounded current decision v1.',
        title: 'Current Decision',
        semanticProfile: { title: 'Current Decision', futureRelevance: ['correctness acceptance'] },
      },
      rootReason: 'Fresh durable correctness subject has no semantic parent.',
      reasonCodes: ['FRESH_DURABLE_CONTEXT'],
      evidenceRefs: ['acceptance:current-v1'],
    });
    expect(current).toMatchObject({ decision: 'WRITE_NEW_ROOT', applied: true, semanticMutation: true });
    const currentId = current.memoryId!;
    const afterRoot = await service.observatorySnapshot({ scope, maxNodes: 500, maxEdges: 2_000 });
    expect(afterRoot.nodes).toHaveLength(1);

    const revised = await service.applyPostflight({
      scope,
      routeContextId: 'correctness-revise-current',
      candidate: {
        canonicalKey: 'correctness.current-decision',
        kind: 'decision',
        value: 'Use bounded current decision v2 after verified evidence.',
        title: 'Current Decision',
        semanticProfile: { title: 'Current Decision', futureRelevance: ['correctness acceptance'] },
      },
      reasonCodes: ['BELIEF_CHANGED'],
      evidenceRefs: ['acceptance:current-v2'],
    });
    expect(revised).toMatchObject({ decision: 'REVISE_EXISTING', memoryId: currentId, applied: true, semanticMutation: true });
    const afterRevise = await service.observatorySnapshot({ scope, maxNodes: 500, maxEdges: 2_000 });
    expect(afterRevise.nodes).toHaveLength(1);
    expect(afterRevise.nodes[0]).toMatchObject({ memoryId: currentId, revisionNo: 2 });

    const branch = await service.applyPostflight({
      scope,
      routeContextId: 'correctness-branch',
      candidate: {
        canonicalKey: 'correctness.branch-decision',
        kind: 'decision',
        value: 'Maintain a distinct related branch.',
        title: 'Distinct Branch',
        semanticProfile: { title: 'Distinct Branch', futureRelevance: ['alternative path'] },
      },
      branchParentMemoryId: currentId,
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['acceptance:branch'],
      proposedRelations: [{ targetMemoryId: currentId, relation: 'branch_of', evidenceRefs: ['acceptance:branch'] }],
    });
    expect(branch).toMatchObject({ decision: 'WRITE_BRANCH', applied: true, semanticMutation: true, createdEdges: 1 });
    const afterBranch = await service.observatorySnapshot({ scope, maxNodes: 500, maxEdges: 2_000 });
    expect(afterBranch.nodes).toHaveLength(2);
    expect(afterBranch.edges).toContainEqual(expect.objectContaining({ fromMemoryId: branch.memoryId, toMemoryId: currentId, relation: 'branch_of' }));

    const weak = await service.applyPostflight({
      scope,
      routeContextId: 'correctness-unjustified',
      candidate: {
        canonicalKey: 'correctness.unjustified-node',
        kind: 'decision',
        value: 'Weak association alone must not justify a durable node.',
      },
      branchParentMemoryId: currentId,
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['acceptance:weak'],
      proposedRelations: [{ targetMemoryId: currentId, relation: 'same_anchor', evidenceRefs: ['acceptance:weak'] }],
    });
    expect(weak).toMatchObject({ decision: 'NO_DURABLE_MEMORY', applied: true, semanticMutation: false });
    const afterWeak = await service.observatorySnapshot({ scope, maxNodes: 500, maxEdges: 2_000 });
    expect(afterWeak.nodes).toHaveLength(2);
    expect(afterWeak.nodes.some((node) => node.canonicalKey === 'correctness.unjustified-node')).toBe(false);

    const freshRoot = await service.applyPostflight({
      scope,
      routeContextId: 'correctness-fresh-root',
      candidate: {
        canonicalKey: 'correctness.fresh-root',
        kind: 'project_state',
        value: 'Fresh root is intentionally independent durable context.',
        title: 'Fresh Root',
        semanticProfile: { title: 'Fresh Root', futureRelevance: ['independent context'] },
      },
      rootReason: 'FRESH_DURABLE_CONTEXT: no existing semantic parent applies.',
      reasonCodes: ['FRESH_DURABLE_CONTEXT'],
      evidenceRefs: ['acceptance:fresh-root'],
    });
    expect(freshRoot).toMatchObject({ decision: 'WRITE_NEW_ROOT', applied: true, semanticMutation: true, createdEdges: 0 });
    const rootDetail = await service.observatoryNode(scope, freshRoot.memoryId!);
    expect(rootDetail).toMatchObject({ memoryId: freshRoot.memoryId, rootReason: 'FRESH_DURABLE_CONTEXT: no existing semantic parent applies.' });

    const conflict = await service.applyPostflight({
      scope,
      routeContextId: 'correctness-conflict',
      candidate: {
        canonicalKey: 'correctness.conflict-candidate',
        kind: 'decision',
        value: 'Conflicting candidate preserves both histories.',
        semanticProfile: { title: 'Conflict Candidate' },
      },
      conflictWithMemoryId: freshRoot.memoryId!,
      conflictType: 'correctness-contradiction',
      reasonCodes: ['CONFLICT_DETECTED'],
      evidenceRefs: ['acceptance:conflict'],
      proposedRelations: [{ targetMemoryId: freshRoot.memoryId!, relation: 'contradicts', evidenceRefs: ['acceptance:conflict'] }],
    });
    expect(conflict).toMatchObject({ decision: 'OPEN_CONFLICT', applied: true, semanticMutation: true });
    const afterConflict = await service.observatorySnapshot({ scope, maxNodes: 500, maxEdges: 2_000 });
    const projectedConflict = afterConflict.conflicts.find((item) => item.conflictId === conflict.conflictId);
    expect(projectedConflict).toMatchObject({ conflictId: conflict.conflictId, status: 'open' });
    expect(new Set([projectedConflict?.leftMemoryId, projectedConflict?.rightMemoryId])).toEqual(
      new Set([conflict.memoryId, freshRoot.memoryId]),
    );
    expect(afterConflict.nodes.find((node) => node.memoryId === conflict.memoryId)?.state).toBe('conflicted');
    expect(afterConflict.nodes.find((node) => node.memoryId === freshRoot.memoryId)?.state).toBe('conflicted');

    const validation = await service.commit({
      scope,
      canonicalKey: 'correctness.renderer-validation',
      kind: 'artifact',
      value: 'Renderer validation corpus passed.',
      sourceType: 'correctness-acceptance',
    });
    const solution = await service.commit({
      scope,
      canonicalKey: 'correctness.renderer-solution',
      kind: 'procedure',
      value: 'Preserve source-native renderer geometry.',
      sourceType: 'correctness-acceptance',
      explicitRelations: [{ targetMemoryId: validation.memoryId, relation: 'validated_by', weight: 1 }],
    });
    const failure = await service.commit({
      scope,
      canonicalKey: 'correctness.renderer-failure',
      kind: 'failure',
      value: 'Renderer failed because post-scaling doubled typography.',
      sourceType: 'correctness-acceptance',
      explicitRelations: [{ targetMemoryId: solution.memoryId, relation: 'resolved_by', weight: 1 }],
    });
    const unrelated = await service.commit({
      scope,
      canonicalKey: 'correctness.unrelated-coffee',
      kind: 'observation',
      value: 'Coffee preference is unrelated to renderer recovery.',
      sourceType: 'correctness-acceptance',
    });

    sink.events.length = 0;
    const preflight = await service.preflight({
      scope,
      routeContextId: 'correctness-remember-more-preflight',
      task: 'correctness.renderer-failure',
      context: 'Recover renderer failure caused by post-scaling typography.',
      expiresAt: Date.now() + 60_000,
    });
    expect(preflight.recalled.map((hit) => hit.memoryId)).toContain(failure.memoryId);

    const expanded = await service.rememberMore({
      scope,
      contextId: preflight.contextId,
      seedMemoryIds: [failure.memoryId],
      reason: 'causal_history',
      maxHops: 2,
      maxItems: 4,
      characterBudget: 6_000,
    });
    const expandedIds = expanded.expansions.map((item) => item.memoryId);
    expect(expandedIds).toEqual(expect.arrayContaining([solution.memoryId, validation.memoryId]));
    expect(expandedIds).not.toContain(unrelated.memoryId);

    const ledger = await service.listRecallExpansions(scope, preflight.contextId);
    expect(ledger.map((item) => item.targetMemoryId)).toEqual(expanded.expansions.map((item) => item.memoryId));
    expect(ledger.every((item) => item.sourceMemoryId === failure.memoryId || item.sourceMemoryId === solution.memoryId)).toBe(true);
    const expandedActivity = sink.events.find((event) => event.type === 'memory.remember_more_expanded');
    expect(expandedActivity?.memoryIds).toEqual(expanded.expansions.map((item) => item.memoryId));
    expect(expandedActivity?.memoryIds).not.toContain(unrelated.memoryId);

    const finalSnapshot = await service.observatorySnapshot({ scope, maxNodes: 500, maxEdges: 2_000 });
    expect(finalSnapshot.edges).toContainEqual(expect.objectContaining({ fromMemoryId: failure.memoryId, toMemoryId: solution.memoryId, relation: 'resolved_by' }));
    expect(finalSnapshot.edges).toContainEqual(expect.objectContaining({ fromMemoryId: solution.memoryId, toMemoryId: validation.memoryId, relation: 'validated_by' }));
  });
});
