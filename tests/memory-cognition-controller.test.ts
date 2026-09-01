import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryCognitionController } from '../src/memory/cognition-controller.js';
import { MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import { MemoryLifecycle } from '../src/memory/lifecycle.js';
import { MemoryLinker } from '../src/memory/linker.js';
import { MemoryService } from '../src/memory/service.js';
import { MemoryStore } from '../src/memory/store.js';
import type { MemoryPostflightRequest, MemoryScope } from '../src/memory/types.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

function tempRoot(label: string): string {
  const base = process.env.TEMP || process.env.TMP || os.tmpdir();
  return mkdtempSync(path.join(base, `agent-core-cognition-controller-${label}-`));
}

async function fixture(label: string) {
  const root = tempRoot(label);
  const config = loadConfig({}, root).memory;
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  await store.open({ dbPath: path.join(root, 'memory.sqlite') });
  const cognition = new MemoryCognitionLedger(client);
  const linker = new MemoryLinker(client, {
    tokenOverlapJaccardThreshold: config.tokenOverlapJaccardThreshold,
    temporalNeighborWindowMs: config.temporalNeighborWindowMs,
    candidateCap: Math.min(512, config.seedCap),
  });
  const lifecycle = new MemoryLifecycle(client, config);
  const controller = new MemoryCognitionController(store, linker, lifecycle, cognition);
  return { root, config, client, store, cognition, linker, lifecycle, controller };
}

const scope: MemoryScope = { principalId: 'principal-a', projectId: 'project-a' };

async function semanticCounts(client: MemoryWorkerClient) {
  const rows = await client.query<{ items: number; revisions: number; edges: number; conflicts: number }>(
    `SELECT
       (SELECT count(*) FROM memory_items) AS items,
       (SELECT count(*) FROM memory_revisions) AS revisions,
       (SELECT count(*) FROM memory_edges) AS edges,
       (SELECT count(*) FROM memory_conflicts) AS conflicts`,
  );
  return rows[0]!;
}

function request(overrides: Partial<MemoryPostflightRequest>): MemoryPostflightRequest {
  return {
    scope,
    routeContextId: `route-${Math.random().toString(16).slice(2)}`,
    reasonCodes: [],
    evidenceRefs: [],
    ...overrides,
  };
}

describe('advisory memory cognition controller', () => {
  it('classifies duplicate, same-belief evidence, mutable revision, and immutable failure without semantic mutation', async () => {
    const f = await fixture('canonical');
    try {
      const decision = await f.store.commitMemory({
        scope,
        canonicalKey: 'decision.geometry',
        kind: 'decision',
        value: 'Preserve source-native geometry.',
        sourceType: 'test',
      });
      const failure = await f.store.commitMemory({
        scope,
        canonicalKey: 'failure.geometry.post-scale',
        kind: 'failure',
        value: 'Post-render scaling doubled font size.',
        sourceType: 'test',
      });
      const baseline = await semanticCounts(f.client);

      const duplicate = await f.controller.evaluate(request({
        candidate: { canonicalKey: 'DECISION.GEOMETRY', kind: 'decision', value: 'Preserve source-native geometry.' },
      }));
      expect(duplicate).toMatchObject({
        decision: 'NO_DURABLE_MEMORY',
        targetMemoryId: decision.memoryId,
        existingMemoryIds: [decision.memoryId],
        advisory: true,
      });
      expect(duplicate.reasonCodes).toEqual(expect.arrayContaining(['DUPLICATE_CANONICAL', 'DUPLICATE_VALUE']));

      const sameBelief = await f.controller.evaluate(request({
        candidate: { canonicalKey: 'decision.geometry', kind: 'decision', value: 'Preserve source-native geometry.' },
        reasonCodes: ['SAME_BELIEF_NEW_EVIDENCE'],
        evidenceRefs: ['artifact:regression-6'],
      }));
      expect(sameBelief).toMatchObject({ decision: 'LINK_EXISTING', targetMemoryId: decision.memoryId, advisory: true });
      expect(sameBelief.decisionRecord.evidenceRefs).toEqual(['artifact:regression-6']);

      const revised = await f.controller.evaluate(request({
        candidate: { canonicalKey: 'decision.geometry', kind: 'decision', value: 'Preserve source-native geometry and native font units.' },
        reasonCodes: ['BELIEF_CHANGED'],
        evidenceRefs: ['validation:new-corpus'],
      }));
      expect(revised).toMatchObject({ decision: 'REVISE_EXISTING', targetMemoryId: decision.memoryId, advisory: true });
      expect(revised.reasonCodes).toContain('BELIEF_CHANGED');

      const immutableFailure = await f.controller.evaluate(request({
        candidate: { canonicalKey: 'failure.geometry.post-scale', kind: 'failure', value: 'A different failure description.' },
        reasonCodes: ['FAILURE_OBSERVED'],
        evidenceRefs: ['run:new-failure'],
      }));
      expect(immutableFailure.decision).not.toBe('REVISE_EXISTING');
      expect(immutableFailure.decision).toBe('NO_DURABLE_MEMORY');
      expect(immutableFailure.targetMemoryId).toBe(failure.memoryId);

      expect(await semanticCounts(f.client)).toEqual(baseline);
      const decisions = await f.client.query<{ count: number }>('SELECT count(*) AS count FROM memory_write_decisions');
      expect(decisions[0]!.count).toBe(4);
    } finally {
      await f.store.close();
    }
  });

  it('classifies branch, fresh root, exact profile duplicate, conflict, and unrelated no-write deterministically', async () => {
    const f = await fixture('node-gates');
    try {
      const parent = await f.store.commitMemory({
        scope,
        canonicalKey: 'architecture.presentation-fidelity',
        kind: 'decision',
        value: 'Presentation conversion fidelity root.',
        sourceType: 'test',
      });
      const conflictTarget = await f.store.commitMemory({
        scope,
        canonicalKey: 'policy.guardrail.mode',
        kind: 'decision',
        value: 'Hard guardrails remain disabled by default.',
        sourceType: 'test',
      });
      const profiled = await f.store.commitMemory({
        scope,
        canonicalKey: 'decision.profiled.geometry',
        kind: 'decision',
        value: 'Use source-native geometry.',
        sourceType: 'test',
      });
      const profile = {
        title: 'PPT Geometry Fidelity',
        concepts: ['geometry', 'PPTX'],
        futureRelevance: ['pptx conversion'],
      };
      await f.cognition.upsertNodeMetadata({ scope, memoryId: profiled.memoryId, semanticProfile: profile });
      const baseline = await semanticCounts(f.client);

      const branch = await f.controller.evaluate(request({
        candidate: {
          canonicalKey: 'architecture.typography-fidelity',
          kind: 'decision',
          value: 'Typography fidelity is an independently durable branch.',
          semanticProfile: { title: 'Typography Fidelity', futureRelevance: ['pptx conversion'] },
        },
        branchParentMemoryId: parent.memoryId,
        relatedMemoryIds: [parent.memoryId],
        reasonCodes: ['DISTINCT_BRANCH'],
        evidenceRefs: ['task:typography-fork'],
        proposedRelations: [{ targetMemoryId: parent.memoryId, relation: 'branch_of', evidenceRefs: ['task:typography-fork'] }],
      }));
      expect(branch).toMatchObject({ decision: 'WRITE_BRANCH', targetMemoryId: parent.memoryId, advisory: true });

      const root = await f.controller.evaluate(request({
        candidate: {
          canonicalKey: 'project.new-memory-observatory',
          kind: 'project_state',
          value: 'A genuinely new durable observatory project context.',
          semanticProfile: { title: 'Memory Observatory', futureRelevance: ['memory observability'] },
        },
        rootReason: 'New observatory context has no existing semantic parent.',
        reasonCodes: ['FRESH_DURABLE_CONTEXT'],
        evidenceRefs: ['user:explicit-new-project'],
      }));
      expect(root).toMatchObject({ decision: 'WRITE_NEW_ROOT', advisory: true });
      expect(root.decisionRecord.rootReason).toBe('New observatory context has no existing semantic parent.');

      const profileDuplicate = await f.controller.evaluate(request({
        candidate: {
          canonicalKey: 'decision.same-profile-new-key',
          kind: 'decision',
          value: 'Different wording under an identical structured semantic profile.',
          semanticProfile: profile,
        },
        reasonCodes: ['RELATED_EXISTING_ONLY'],
        evidenceRefs: ['analysis:profile-match'],
      }));
      expect(profileDuplicate).toMatchObject({ decision: 'LINK_EXISTING', targetMemoryId: profiled.memoryId, advisory: true });
      expect(profileDuplicate.existingMemoryIds).toContain(profiled.memoryId);

      const conflict = await f.controller.evaluate(request({
        candidate: {
          canonicalKey: 'policy.guardrail.mode.project-x',
          kind: 'decision',
          value: 'Hard guardrails are enabled by default for Project X.',
        },
        conflictWithMemoryId: conflictTarget.memoryId,
        conflictType: 'scope_authority_ambiguous',
        relatedMemoryIds: [conflictTarget.memoryId],
        reasonCodes: ['CONFLICT_DETECTED'],
        evidenceRefs: ['user:project-x-policy'],
        proposedRelations: [{ targetMemoryId: conflictTarget.memoryId, relation: 'contradicts', evidenceRefs: ['user:project-x-policy'] }],
      }));
      expect(conflict).toMatchObject({ decision: 'OPEN_CONFLICT', targetMemoryId: conflictTarget.memoryId, advisory: true });

      const unrelated = await f.controller.evaluate(request({
        candidate: { canonicalKey: 'observation.transient.status', kind: 'observation', value: 'One transient status read.' },
        reasonCodes: ['TRANSIENT_OPERATION'],
      }));
      expect(unrelated.decision).toBe('NO_DURABLE_MEMORY');
      expect(unrelated.reasonCodes).toContain('TRANSIENT_OPERATION');

      expect(await semanticCounts(f.client)).toEqual(baseline);
      const decisions = await f.client.query<{ decision_type: string; applied_at: number | null }>(
        'SELECT decision_type, applied_at FROM memory_write_decisions ORDER BY created_at, id',
      );
      expect(decisions).toHaveLength(5);
      expect(decisions.every((row) => row.applied_at === null)).toBe(true);
    } finally {
      await f.store.close();
    }
  });

  it('never accepts unjustified root or weak-only branch creation and keeps candidate hashes deterministic', async () => {
    const f = await fixture('rejection');
    try {
      const parent = await f.store.commitMemory({
        scope,
        canonicalKey: 'rejection.parent',
        kind: 'decision',
        value: 'Parent.',
        sourceType: 'test',
      });
      const baseline = await semanticCounts(f.client);
      const candidate = {
        canonicalKey: 'rejection.candidate',
        kind: 'decision' as const,
        value: { z: 'value', a: 'Authorization: Bearer secret-one' },
        semanticProfile: { title: 'Candidate', concepts: ['two', 'one'] },
      };

      const weakBranch = await f.controller.evaluate(request({
        candidate,
        branchParentMemoryId: parent.memoryId,
        reasonCodes: ['DISTINCT_BRANCH'],
        evidenceRefs: ['task:weak-branch'],
        proposedRelations: [{ targetMemoryId: parent.memoryId, relation: 'same_anchor', evidenceRefs: ['task:weak-branch'] }],
      }));
      expect(weakBranch.decision).toBe('NO_DURABLE_MEMORY');
      expect(weakBranch.reasonCodes).toContain('INSUFFICIENT_EVIDENCE');

      const unjustifiedRoot = await f.controller.evaluate(request({
        candidate,
        rootReason: 'Caller wants a root but provided no fresh-durable reason.',
        reasonCodes: ['NO_FUTURE_RELEVANCE'],
        evidenceRefs: ['task:not-durable'],
      }));
      expect(unjustifiedRoot.decision).toBe('NO_DURABLE_MEMORY');

      const deterministicA = await f.controller.evaluate(request({
        candidate,
        reasonCodes: ['TRANSIENT_OPERATION'],
      }));
      const deterministicB = await f.controller.evaluate(request({
        candidate: {
          ...candidate,
          value: { a: 'Authorization: Bearer secret-two', z: 'value' },
          semanticProfile: { concepts: ['one', 'two'], title: 'Candidate' },
        },
        reasonCodes: ['TRANSIENT_OPERATION'],
      }));
      expect(deterministicA.candidateHash).toBe(deterministicB.candidateHash);
      expect(deterministicA.semanticProfileHash).toBe(deterministicB.semanticProfileHash);
      expect(await semanticCounts(f.client)).toEqual(baseline);
    } finally {
      await f.store.close();
    }
  });
  it('explicitly applies all six validated decisions with auditable node, revision, relation, metadata, and conflict effects', async () => {
    const f = await fixture('apply-six');
    try {
      const mutable = await f.store.commitMemory({
        scope,
        canonicalKey: 'apply.mutable',
        kind: 'decision',
        value: 'Initial mutable decision.',
        sourceType: 'test',
      });
      const linkTarget = await f.store.commitMemory({
        scope,
        canonicalKey: 'apply.link-target',
        kind: 'procedure',
        value: 'Supporting procedure.',
        sourceType: 'test',
      });
      const branchParent = await f.store.commitMemory({
        scope,
        canonicalKey: 'apply.branch-parent',
        kind: 'decision',
        value: 'Parent architecture.',
        sourceType: 'test',
      });
      const conflictTarget = await f.store.commitMemory({
        scope,
        canonicalKey: 'apply.conflict-target',
        kind: 'decision',
        value: 'Guardrails disabled by default.',
        sourceType: 'test',
      });
      const baseline = await semanticCounts(f.client);

      const noWrite = await f.controller.apply(request({
        candidate: { canonicalKey: 'apply.transient', kind: 'observation', value: 'Transient status.' },
        reasonCodes: ['TRANSIENT_OPERATION'],
      }));
      expect(noWrite).toMatchObject({ decision: 'NO_DURABLE_MEMORY', advisory: false, applied: true, semanticMutation: false, createdEdges: 0 });
      expect(noWrite.decisionRecord.appliedAt).toEqual(expect.any(Number));
      expect(await semanticCounts(f.client)).toEqual(baseline);

      const revise = await f.controller.apply(request({
        candidate: { canonicalKey: 'apply.mutable', kind: 'decision', value: 'Updated mutable decision.', semanticProfile: { title: 'Updated Decision' } },
        reasonCodes: ['BELIEF_CHANGED'],
        evidenceRefs: ['user:revision'],
      }));
      expect(revise).toMatchObject({ decision: 'REVISE_EXISTING', memoryId: mutable.memoryId, advisory: false, applied: true, semanticMutation: true });
      expect(revise.revisionId).toBeTruthy();
      expect((await f.store.getMemory(scope, mutable.memoryId))?.revisionNo).toBe(2);
      expect((await f.cognition.getNodeMetadata(scope, mutable.memoryId))?.createdFromDecisionId).toBe(revise.decisionRecord.id);

      const link = await f.controller.apply(request({
        candidate: { canonicalKey: 'apply.mutable', kind: 'decision', value: 'Updated mutable decision.' },
        targetMemoryId: mutable.memoryId,
        reasonCodes: ['SAME_BELIEF_NEW_EVIDENCE'],
        evidenceRefs: ['validation:link-evidence'],
        proposedRelations: [{ targetMemoryId: linkTarget.memoryId, relation: 'depends_on', evidenceRefs: ['validation:link-evidence'] }],
      }));
      expect(link).toMatchObject({ decision: 'LINK_EXISTING', memoryId: mutable.memoryId, semanticMutation: true, createdEdges: 1, applied: true });
      expect((await f.client.query<{ count: number }>(
        "SELECT count(*) AS count FROM memory_edges WHERE from_memory_id = ? AND to_memory_id = ? AND relation = 'depends_on'",
        [mutable.memoryId, linkTarget.memoryId],
      ))[0]!.count).toBe(1);

      const branch = await f.controller.apply(request({
        candidate: {
          canonicalKey: 'apply.branch-child',
          kind: 'decision',
          value: 'Independent typography branch.',
          title: 'Typography Branch',
          semanticProfile: { title: 'Typography Fidelity', futureRelevance: ['pptx conversion'] },
        },
        branchParentMemoryId: branchParent.memoryId,
        reasonCodes: ['DISTINCT_BRANCH'],
        evidenceRefs: ['task:branch'],
        proposedRelations: [{ targetMemoryId: branchParent.memoryId, relation: 'branch_of', evidenceRefs: ['task:branch'] }],
      }));
      expect(branch).toMatchObject({ decision: 'WRITE_BRANCH', semanticMutation: true, applied: true, createdEdges: 1 });
      expect(branch.memoryId).toBeTruthy();
      expect(await f.cognition.getNodeMetadata(scope, branch.memoryId!)).toMatchObject({
        title: 'Typography Branch',
        noveltyClass: 'branch',
        branchParentMemoryId: branchParent.memoryId,
        createdFromDecisionId: branch.decisionRecord.id,
      });

      const root = await f.controller.apply(request({
        candidate: {
          canonicalKey: 'apply.fresh-root',
          kind: 'project_state',
          value: 'Fresh durable root context.',
          title: 'Fresh Root',
          semanticProfile: { title: 'Fresh Root', futureRelevance: ['future work'] },
        },
        rootReason: 'No existing semantic parent exists for this durable context.',
        reasonCodes: ['FRESH_DURABLE_CONTEXT'],
        evidenceRefs: ['user:new-root'],
      }));
      expect(root).toMatchObject({ decision: 'WRITE_NEW_ROOT', semanticMutation: true, applied: true, createdEdges: 0 });
      expect(await f.cognition.getNodeMetadata(scope, root.memoryId!)).toMatchObject({
        title: 'Fresh Root',
        noveltyClass: 'root',
        rootReason: 'No existing semantic parent exists for this durable context.',
        createdFromDecisionId: root.decisionRecord.id,
      });

      const conflict = await f.controller.apply(request({
        candidate: {
          canonicalKey: 'apply.conflict-candidate',
          kind: 'decision',
          value: 'Guardrails enabled for Project X.',
          semanticProfile: { title: 'Project X Guardrail Policy' },
        },
        conflictWithMemoryId: conflictTarget.memoryId,
        conflictType: 'authority_ambiguous',
        reasonCodes: ['CONFLICT_DETECTED'],
        evidenceRefs: ['user:project-x'],
        proposedRelations: [{ targetMemoryId: conflictTarget.memoryId, relation: 'contradicts', evidenceRefs: ['user:project-x'] }],
      }));
      expect(conflict).toMatchObject({ decision: 'OPEN_CONFLICT', semanticMutation: true, applied: true, createdEdges: 2 });
      expect(conflict.conflictId).toBeTruthy();
      expect((await f.store.getMemory(scope, conflictTarget.memoryId))?.state).toBe('conflicted');
      expect((await f.store.getMemory(scope, conflict.memoryId!))?.state).toBe('conflicted');
      expect((await f.lifecycle.listOpenConflicts(scope)).some((row) => row.conflictId === conflict.conflictId)).toBe(true);
      expect((await f.client.query<{ count: number }>(
        "SELECT count(*) AS count FROM memory_edges WHERE relation = 'contradicts' AND (from_memory_id = ? OR to_memory_id = ?)",
        [conflict.memoryId!, conflict.memoryId!],
      ))[0]!.count).toBe(2);
    } finally {
      await f.store.close();
    }
  });

  it('fails closed on foreign endpoints and converts unjustified branch/failure writes to applied no-write outcomes', async () => {
    const f = await fixture('apply-failures');
    try {
      const parent = await f.store.commitMemory({ scope, canonicalKey: 'failure.parent', kind: 'decision', value: 'Parent.', sourceType: 'test' });
      const failure = await f.store.commitMemory({ scope, canonicalKey: 'failure.immutable', kind: 'failure', value: 'Original failure.', sourceType: 'test' });
      const foreignScope = { principalId: scope.principalId, projectId: 'foreign-project' };
      const foreign = await f.store.commitMemory({ scope: foreignScope, canonicalKey: 'failure.foreign', kind: 'decision', value: 'Foreign.', sourceType: 'test' });
      const baseline = await semanticCounts(f.client);

      await expect(f.controller.apply(request({
        candidate: { canonicalKey: 'failure.cross-scope-branch', kind: 'decision', value: 'Must not persist.' },
        branchParentMemoryId: foreign.memoryId,
        reasonCodes: ['DISTINCT_BRANCH'],
        evidenceRefs: ['task:foreign'],
        proposedRelations: [{ targetMemoryId: foreign.memoryId, relation: 'branch_of', evidenceRefs: ['task:foreign'] }],
      }))).rejects.toThrow('MEMORY_POSTFLIGHT_RELATED_NOT_FOUND');
      expect(await semanticCounts(f.client)).toEqual(baseline);

      const weak = await f.controller.apply(request({
        candidate: { canonicalKey: 'failure.weak-branch', kind: 'decision', value: 'Weak relation cannot justify a node.' },
        branchParentMemoryId: parent.memoryId,
        reasonCodes: ['DISTINCT_BRANCH'],
        evidenceRefs: ['task:weak'],
        proposedRelations: [{ targetMemoryId: parent.memoryId, relation: 'same_anchor', evidenceRefs: ['task:weak'] }],
      }));
      expect(weak).toMatchObject({ decision: 'NO_DURABLE_MEMORY', semanticMutation: false, applied: true });
      expect(await f.store.getMemoryByCanonicalKey(scope, 'failure.weak-branch')).toBeNull();

      const immutable = await f.controller.apply(request({
        candidate: { canonicalKey: 'failure.immutable', kind: 'failure', value: 'Attempt to rewrite failure.' },
        reasonCodes: ['FAILURE_OBSERVED'],
        evidenceRefs: ['run:new'],
      }));
      expect(immutable).toMatchObject({ decision: 'NO_DURABLE_MEMORY', semanticMutation: false, applied: true, memoryId: failure.memoryId });
      expect(await f.store.listRevisions(scope, failure.memoryId)).toHaveLength(1);
      expect((await f.store.getMemory(scope, failure.memoryId))?.valueText).toBe('Original failure.');

      await expect(f.controller.apply(request({
        candidate: { canonicalKey: 'failure.invalid-conflict', kind: 'decision', value: 'Must not persist.' },
        conflictWithMemoryId: foreign.memoryId,
        conflictType: 'foreign',
        reasonCodes: ['CONFLICT_DETECTED'],
        evidenceRefs: ['task:foreign-conflict'],
        proposedRelations: [{ targetMemoryId: foreign.memoryId, relation: 'contradicts', evidenceRefs: ['task:foreign-conflict'] }],
      }))).rejects.toThrow('MEMORY_POSTFLIGHT_RELATED_NOT_FOUND');
      expect(await f.store.getMemoryByCanonicalKey(scope, 'failure.invalid-conflict')).toBeNull();
    } finally {
      await f.store.close();
    }
  });

  it('composes advisory/apply postflight through MemoryService without auto-adopting ordinary commit or preflight', async () => {
    const root = tempRoot('service-composition');
    const base = loadConfig({}, root).memory;
    const service = new MemoryService({ ...base, enabled: true, dbPath: path.join(root, 'service.sqlite') });
    try {
      const existing = await service.commit({
        scope,
        canonicalKey: 'service.postflight.existing',
        kind: 'decision',
        value: 'Existing service decision.',
        sourceType: 'test',
      });
      const preflight = await service.preflight({
        scope,
        routeContextId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        task: 'Inspect the existing service decision without automatic postflight.',
        expiresAt: Date.now() + 60_000,
      });
      expect(preflight.recalled.some((hit) => hit.memoryId === existing.memoryId)).toBe(true);
      expect((await service.status(scope)).counts.write_decisions ?? 0).toBe(0);

      const advisory = await service.evaluatePostflight({
        scope,
        routeContextId: 'route-service-advisory',
        candidate: {
          canonicalKey: 'service.postflight.existing',
          kind: 'decision',
          value: 'Existing service decision.',
        },
        reasonCodes: ['SAME_BELIEF_NEW_EVIDENCE'],
        evidenceRefs: ['validation:service'],
      });
      expect(advisory).toMatchObject({ decision: 'LINK_EXISTING', advisory: true, targetMemoryId: existing.memoryId });
      expect((await service.status(scope)).counts.write_decisions).toBe(1);

      const applied = await service.applyPostflight({
        scope,
        routeContextId: 'route-service-apply',
        candidate: {
          canonicalKey: 'service.postflight.root',
          kind: 'project_state',
          value: 'Explicitly applied new root through the controller.',
          semanticProfile: { title: 'Service Root', futureRelevance: ['service composition'] },
        },
        rootReason: 'This explicit service test has no existing semantic parent.',
        reasonCodes: ['FRESH_DURABLE_CONTEXT'],
        evidenceRefs: ['user:service-root'],
      });
      expect(applied).toMatchObject({ decision: 'WRITE_NEW_ROOT', advisory: false, applied: true, semanticMutation: true });
      expect(await service.getMemory(scope, applied.memoryId!)).toMatchObject({ canonicalKey: 'service.postflight.root' });
      expect((await service.status(scope)).counts.write_decisions).toBe(2);
    } finally {
      await service.close();
    }
  });

});
