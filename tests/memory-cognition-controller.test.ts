import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { MemoryService } from '../src/memory/service.js';
import type { MemoryPostflightRequest, MemoryScope, MemoryWriteDecisionRecord } from '../src/memory/types.js';
import { MEMORY_STATE, memoryFixture, scopedMemoryStateRecords } from './helpers/memory-fixture.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });

const scope: MemoryScope = { principalId: 'postflight-principal', projectId: 'postflight-project' };

async function fixture(label: string) {
  const f = await memoryFixture(`postflight-${label}`);
  roots.push(f.root);
  return f;
}

/** Everything an advisory evaluation must leave untouched: nodes, revisions, relations and conflicts. */
async function semanticCounts(service: MemoryService) {
  const exported = await service.export(scope, 500);
  const status = await service.status(scope);
  return {
    revisions: exported.items.map((item) => `${item.memoryId}:${item.revisionId}`).sort(),
    conflicts: exported.conflicts.length,
    activeItems: status.counts.active_items,
    edges: status.counts.edges,
  };
}

function request(overrides: Partial<MemoryPostflightRequest> = {}): MemoryPostflightRequest {
  return {
    scope,
    routeContextId: '33333333-3333-4333-8333-333333333333',
    reasonCodes: [],
    evidenceRefs: [],
    ...overrides,
  } as MemoryPostflightRequest;
}

describe('advisory memory postflight decisions', () => {
  it('classifies duplicate, same-belief evidence, mutable revision, and immutable failure without semantic mutation', async () => {
    const f = await fixture('canonical');
    const decision = await f.service.commit({
      scope, canonicalKey: 'decision.geometry', kind: 'decision',
      value: 'Preserve source-native geometry.', sourceType: 'test',
    });
    const failure = await f.service.commit({
      scope, canonicalKey: 'failure.geometry.post-scale', kind: 'failure',
      value: 'Post-render scaling doubled font size.', sourceType: 'test',
    });

    const duplicate = await f.service.evaluatePostflight(request({
      candidate: { canonicalKey: 'DECISION.GEOMETRY', kind: 'decision', value: 'Preserve source-native geometry.' },
    }));
    expect(duplicate).toMatchObject({
      decision: 'NO_DURABLE_MEMORY', targetMemoryId: decision.memoryId,
      existingMemoryIds: [decision.memoryId], advisory: true,
    });
    expect(duplicate.reasonCodes).toEqual(expect.arrayContaining(['DUPLICATE_CANONICAL', 'DUPLICATE_VALUE']));

    const sameBelief = await f.service.evaluatePostflight(request({
      candidate: { canonicalKey: 'decision.geometry', kind: 'decision', value: 'Preserve source-native geometry.' },
      reasonCodes: ['SAME_BELIEF_NEW_EVIDENCE'],
      evidenceRefs: ['artifact:regression-6'],
    }));
    expect(sameBelief).toMatchObject({ decision: 'LINK_EXISTING', targetMemoryId: decision.memoryId, advisory: true });
    expect(sameBelief.decisionRecord.evidenceRefs).toEqual(['artifact:regression-6']);

    const revised = await f.service.evaluatePostflight(request({
      candidate: { canonicalKey: 'decision.geometry', kind: 'decision', value: 'Preserve source-native geometry and native font units.' },
      reasonCodes: ['BELIEF_CHANGED'],
      evidenceRefs: ['validation:new-corpus'],
    }));
    expect(revised).toMatchObject({ decision: 'REVISE_EXISTING', targetMemoryId: decision.memoryId, advisory: true });
    expect(revised.reasonCodes).toContain('BELIEF_CHANGED');

    const immutableFailure = await f.service.evaluatePostflight(request({
      candidate: { canonicalKey: 'failure.geometry.post-scale', kind: 'failure', value: 'A different failure description.' },
      reasonCodes: ['FAILURE_OBSERVED'],
      evidenceRefs: ['run:new-failure'],
    }));
    expect(immutableFailure.decision).toBe('NO_DURABLE_MEMORY');
    expect(immutableFailure.targetMemoryId).toBe(failure.memoryId);

    // Advisory evaluation never mutates canonical memory.
    expect((await f.service.getMemory(scope, decision.memoryId))?.valueText).toBe('Preserve source-native geometry.');
    expect((await f.service.getMemory(scope, decision.memoryId))?.revisionNo).toBe(1);
    for (const evaluated of [duplicate, sameBelief, revised, immutableFailure]) {
      expect((await f.service.getWriteDecision(scope, evaluated.decisionRecord.id))?.id).toBe(evaluated.decisionRecord.id);
    }
    await f.service.close();
  });

  it('classifies branch, fresh root, exact profile duplicate, conflict, and unrelated no-write deterministically', async () => {
    const f = await fixture('node-gates');
    const parent = await f.service.commit({
      scope, canonicalKey: 'architecture.presentation-fidelity', kind: 'decision',
      value: 'Presentation conversion fidelity root.', sourceType: 'test',
    });
    const conflictTarget = await f.service.commit({
      scope, canonicalKey: 'policy.guardrail.mode', kind: 'decision',
      value: 'Hard guardrails remain disabled by default.', sourceType: 'test',
    });
    const profiled = await f.service.commit({
      scope, canonicalKey: 'decision.profiled.geometry', kind: 'decision',
      value: 'Use source-native geometry.', sourceType: 'test',
    });
    const semanticProfile = {
      title: 'PPT Geometry Fidelity',
      concepts: ['geometry', 'PPTX'],
      futureRelevance: ['pptx conversion'],
    };
    await f.service.upsertNodeMetadata({ scope, memoryId: profiled.memoryId, semanticProfile });
    expect((await f.service.getNodeMetadata(scope, profiled.memoryId))?.semanticProfileHash).toBeTruthy();
    const baseline = await semanticCounts(f.service);

    const branch = await f.service.evaluatePostflight(request({
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

    const root = await f.service.evaluatePostflight(request({
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

    // A new canonical key carrying an already-known semantic profile links instead of forking a duplicate node.
    const profileDuplicate = await f.service.evaluatePostflight(request({
      candidate: {
        canonicalKey: 'decision.same-profile-new-key',
        kind: 'decision',
        value: 'Different wording under an identical structured semantic profile.',
        semanticProfile,
      },
      reasonCodes: ['RELATED_EXISTING_ONLY'],
      evidenceRefs: ['analysis:profile-match'],
    }));
    expect(profileDuplicate).toMatchObject({ decision: 'LINK_EXISTING', targetMemoryId: profiled.memoryId, advisory: true });
    expect(profileDuplicate.existingMemoryIds).toContain(profiled.memoryId);
    expect(profileDuplicate.reasonCodes).toContain('RELATED_EXISTING_ONLY');
    expect(profileDuplicate.semanticProfileHash)
      .toBe((await f.service.getNodeMetadata(scope, profiled.memoryId))?.semanticProfileHash);

    const conflict = await f.service.evaluatePostflight(request({
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

    const unrelated = await f.service.evaluatePostflight(request({
      candidate: { canonicalKey: 'observation.transient.status', kind: 'observation', value: 'One transient status read.' },
      reasonCodes: ['TRANSIENT_OPERATION'],
    }));
    expect(unrelated.decision).toBe('NO_DURABLE_MEMORY');
    expect(unrelated.reasonCodes).toContain('TRANSIENT_OPERATION');

    expect(await semanticCounts(f.service)).toEqual(baseline);
    const decisions = await scopedMemoryStateRecords<MemoryWriteDecisionRecord>(
      f.config.fileNative, MEMORY_STATE.writeDecisions, scope,
    );
    expect(decisions).toHaveLength(5);
    expect(decisions.every((record) => record.appliedAt === undefined)).toBe(true);
    await f.service.close();
  });

  it('rejects an incomplete durable root and audits a weak branch without writing it', async () => {
    const f = await fixture('unjustified');
    const parent = await f.service.commit({
      scope, canonicalKey: 'architecture.presentation-fidelity', kind: 'decision',
      value: 'Presentation fidelity is owned by the renderer.', sourceType: 'test',
    });

    await expect(f.service.evaluatePostflight(request({
      candidate: { canonicalKey: 'decision.new.root', kind: 'decision', value: 'A root with no justification.' },
      rootReason: 'Because I said so.',
      evidenceRefs: [],
    }))).rejects.toThrow('MEMORY_POSTFLIGHT_EVIDENCE_REQUIRED');

    const weakBranch = await f.service.evaluatePostflight(request({
      candidate: { canonicalKey: 'decision.branch.weak', kind: 'decision', value: 'A branch with no distinct-branch claim.' },
      branchParentMemoryId: parent.memoryId,
      evidenceRefs: ['artifact:weak'],
      proposedRelations: [{ targetMemoryId: parent.memoryId, relation: 'derived_from', evidenceRefs: ['artifact:weak'] }],
    }));
    expect(weakBranch.decision).toBe('NO_DURABLE_MEMORY');
    expect(weakBranch.reasonCodes).toContain('INSUFFICIENT_EVIDENCE');

    await expect(f.service.evaluatePostflight(request({
      candidate: { canonicalKey: 'decision.foreign', kind: 'decision', value: 'Points at a foreign endpoint.' },
      relatedMemoryIds: ['00000000-0000-4000-8000-000000000000'],
    }))).rejects.toThrow('MEMORY_POSTFLIGHT_RELATED_NOT_FOUND');
    await f.service.close();
  });

  it('keeps candidate hashes deterministic and never mutates semantic memory while refusing a weak branch relation', async () => {
    const f = await fixture('deterministic');
    const parent = await f.service.commit({
      scope, canonicalKey: 'rejection.parent', kind: 'decision', value: 'Parent.', sourceType: 'test',
    });
    const baseline = (await f.service.export(scope, 100)).items.map((item) => [item.memoryId, item.revisionId]);
    const candidate = {
      canonicalKey: 'rejection.candidate',
      kind: 'decision' as const,
      value: { z: 'value', a: 'Authorization: Bearer secret-one' },
      semanticProfile: { title: 'Candidate', concepts: ['two', 'one'] },
    };

    // A same_anchor proposal is not a node-creation relation, so the branch stays unjustified.
    const weakBranch = await f.service.evaluatePostflight(request({
      candidate,
      branchParentMemoryId: parent.memoryId,
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['task:weak-branch'],
      proposedRelations: [{ targetMemoryId: parent.memoryId, relation: 'same_anchor', evidenceRefs: ['task:weak-branch'] }],
    }));
    expect(weakBranch.decision).toBe('NO_DURABLE_MEMORY');
    expect(weakBranch.reasonCodes).toContain('INSUFFICIENT_EVIDENCE');

    // Key order, concept order and a redacted credential must not move the candidate identity.
    const deterministicA = await f.service.evaluatePostflight(request({ candidate, reasonCodes: ['TRANSIENT_OPERATION'] }));
    const deterministicB = await f.service.evaluatePostflight(request({
      candidate: {
        ...candidate,
        value: { a: 'Authorization: Bearer secret-two', z: 'value' },
        semanticProfile: { concepts: ['one', 'two'], title: 'Candidate' },
      },
      reasonCodes: ['TRANSIENT_OPERATION'],
    }));
    expect(deterministicA.candidateHash).toBe(deterministicB.candidateHash);
    expect(deterministicA.semanticProfileHash).toBe(deterministicB.semanticProfileHash);
    expect((await f.service.export(scope, 100)).items.map((item) => [item.memoryId, item.revisionId])).toEqual(baseline);
    await f.service.close();
  });

  it('applies justified root, branch, revision, link, and conflict writes with auditable effects', async () => {
    const f = await fixture('apply');
    const root = await f.service.applyPostflight(request({
      candidate: { canonicalKey: 'decision.render.pipeline', kind: 'decision', value: 'Render through the deterministic pipeline.' },
      rootReason: 'First durable statement of the render pipeline choice.',
      reasonCodes: ['FRESH_DURABLE_CONTEXT'],
      evidenceRefs: ['artifact:pipeline-spec'],
    }));
    expect(root).toMatchObject({ decision: 'WRITE_NEW_ROOT', applied: true, semanticMutation: true, advisory: false });
    expect(root.memoryId).toBeTruthy();

    const branch = await f.service.applyPostflight(request({
      candidate: { canonicalKey: 'decision.render.pipeline.preview', kind: 'decision', value: 'Preview rendering takes a distinct fast path.' },
      branchParentMemoryId: root.memoryId!,
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['artifact:preview-benchmark'],
      proposedRelations: [{ targetMemoryId: root.memoryId!, relation: 'derived_from', evidenceRefs: ['artifact:preview-benchmark'] }],
    }));
    expect(branch).toMatchObject({ decision: 'WRITE_BRANCH', applied: true, semanticMutation: true });
    expect((await f.service.getNodeMetadata(scope, branch.memoryId!))?.noveltyClass).toBe('branch');

    const revised = await f.service.applyPostflight(request({
      candidate: { canonicalKey: 'decision.render.pipeline', kind: 'decision', value: 'Render through the deterministic pipeline with a verified cache.' },
      reasonCodes: ['BELIEF_CHANGED'],
      evidenceRefs: ['validation:cache-corpus'],
    }));
    expect(revised).toMatchObject({ decision: 'REVISE_EXISTING', applied: true, semanticMutation: true });
    expect((await f.service.getMemory(scope, root.memoryId!))?.revisionNo).toBe(2);
    expect((await f.service.listRevisions(scope, root.memoryId!)).length).toBe(2);

    const conflict = await f.service.applyPostflight(request({
      candidate: { canonicalKey: 'decision.render.pipeline.contradiction', kind: 'decision', value: 'Rendering must bypass the deterministic pipeline.' },
      conflictWithMemoryId: root.memoryId!,
      conflictType: 'contradictory_decision',
      reasonCodes: ['CONFLICT_DETECTED'],
      evidenceRefs: ['run:contradiction'],
      proposedRelations: [{ targetMemoryId: root.memoryId!, relation: 'contradicts', evidenceRefs: ['run:contradiction'] }],
    }));
    expect(conflict).toMatchObject({ decision: 'OPEN_CONFLICT', applied: true, semanticMutation: true });
    expect(conflict.conflictId).toBeTruthy();
    expect((await f.service.getMemory(scope, root.memoryId!))?.state).toBe('conflicted');
    expect((await f.service.listOpenConflicts(scope)).map((row) => row.conflictId)).toContain(conflict.conflictId);

    const noWrite = await f.service.applyPostflight(request({ reasonCodes: ['NO_FUTURE_RELEVANCE'], evidenceRefs: [] }));
    expect(noWrite).toMatchObject({ decision: 'NO_DURABLE_MEMORY', applied: true, semanticMutation: false });
    expect((await f.service.getWriteDecision(scope, noWrite.decisionRecord.id))?.decisionType).toBe('NO_DURABLE_MEMORY');
    await f.service.close();
  });

  it('fails closed on foreign endpoints and converts unjustified branch/failure writes to applied no-write outcomes', async () => {
    const f = await fixture('apply-failures');
    const canonicalKeys = async () => (await f.service.export(scope, 500)).items.map((item) => item.canonicalKey);
    const parent = await f.service.commit({
      scope, canonicalKey: 'failure.parent', kind: 'decision', value: 'Parent.', sourceType: 'test',
    });
    const failure = await f.service.commit({
      scope, canonicalKey: 'failure.immutable', kind: 'failure', value: 'Original failure.', sourceType: 'test',
    });
    const foreignScope = { principalId: scope.principalId, projectId: 'foreign-project' };
    const foreign = await f.service.commit({
      scope: foreignScope, canonicalKey: 'failure.foreign', kind: 'decision', value: 'Foreign.', sourceType: 'test',
    });
    const baseline = await semanticCounts(f.service);

    // A branch parent from another project is not reachable in this scope, so apply must fail closed.
    await expect(f.service.applyPostflight(request({
      candidate: { canonicalKey: 'failure.cross-scope-branch', kind: 'decision', value: 'Must not persist.' },
      branchParentMemoryId: foreign.memoryId,
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['task:foreign'],
      proposedRelations: [{ targetMemoryId: foreign.memoryId, relation: 'branch_of', evidenceRefs: ['task:foreign'] }],
    }))).rejects.toThrow('MEMORY_POSTFLIGHT_RELATED_NOT_FOUND');
    expect(await semanticCounts(f.service)).toEqual(baseline);

    const weak = await f.service.applyPostflight(request({
      candidate: { canonicalKey: 'failure.weak-branch', kind: 'decision', value: 'Weak relation cannot justify a node.' },
      branchParentMemoryId: parent.memoryId,
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['task:weak'],
      proposedRelations: [{ targetMemoryId: parent.memoryId, relation: 'same_anchor', evidenceRefs: ['task:weak'] }],
    }));
    expect(weak).toMatchObject({ decision: 'NO_DURABLE_MEMORY', semanticMutation: false, applied: true });
    expect(await canonicalKeys()).not.toContain('failure.weak-branch');

    const immutable = await f.service.applyPostflight(request({
      candidate: { canonicalKey: 'failure.immutable', kind: 'failure', value: 'Attempt to rewrite failure.' },
      reasonCodes: ['FAILURE_OBSERVED'],
      evidenceRefs: ['run:new'],
    }));
    expect(immutable).toMatchObject({
      decision: 'NO_DURABLE_MEMORY', semanticMutation: false, applied: true, memoryId: failure.memoryId,
    });
    expect(await f.service.listRevisions(scope, failure.memoryId)).toHaveLength(1);
    expect((await f.service.getMemory(scope, failure.memoryId))?.valueText).toBe('Original failure.');

    await expect(f.service.applyPostflight(request({
      candidate: { canonicalKey: 'failure.invalid-conflict', kind: 'decision', value: 'Must not persist.' },
      conflictWithMemoryId: foreign.memoryId,
      conflictType: 'foreign',
      reasonCodes: ['CONFLICT_DETECTED'],
      evidenceRefs: ['task:foreign-conflict'],
      proposedRelations: [{ targetMemoryId: foreign.memoryId, relation: 'contradicts', evidenceRefs: ['task:foreign-conflict'] }],
    }))).rejects.toThrow('MEMORY_POSTFLIGHT_RELATED_NOT_FOUND');
    expect(await canonicalKeys()).not.toContain('failure.invalid-conflict');
    expect(await semanticCounts(f.service)).toEqual(baseline);
    await f.service.close();
  });

  it('composes advisory/apply postflight through MemoryService without auto-adopting ordinary commit or preflight', async () => {
    const f = await fixture('service-composition');
    const writeDecisions = async () => (await scopedMemoryStateRecords(
      f.config.fileNative, MEMORY_STATE.writeDecisions, scope,
    )).length;

    const existing = await f.service.commit({
      scope, canonicalKey: 'service.postflight.existing', kind: 'decision',
      value: 'Existing service decision.', sourceType: 'test',
    });
    const preflight = await f.service.preflight({
      scope,
      routeContextId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      task: 'Inspect the existing service decision without automatic postflight.',
      expiresAt: Date.now() + 60_000,
    });
    expect(preflight.recalled.some((hit) => hit.memoryId === existing.memoryId)).toBe(true);
    // Neither an ordinary commit nor a preflight may invent a write decision on the AI's behalf.
    expect(await writeDecisions()).toBe(0);

    const advisory = await f.service.evaluatePostflight(request({
      routeContextId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      candidate: {
        canonicalKey: 'service.postflight.existing', kind: 'decision', value: 'Existing service decision.',
      },
      reasonCodes: ['SAME_BELIEF_NEW_EVIDENCE'],
      evidenceRefs: ['validation:service'],
    }));
    expect(advisory).toMatchObject({ decision: 'LINK_EXISTING', advisory: true, targetMemoryId: existing.memoryId });
    expect(await writeDecisions()).toBe(1);

    const applied = await f.service.applyPostflight(request({
      routeContextId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      candidate: {
        canonicalKey: 'service.postflight.root',
        kind: 'project_state',
        value: 'Explicitly applied new root through the controller.',
        semanticProfile: { title: 'Service Root', futureRelevance: ['service composition'] },
      },
      rootReason: 'This explicit service test has no existing semantic parent.',
      reasonCodes: ['FRESH_DURABLE_CONTEXT'],
      evidenceRefs: ['user:service-root'],
    }));
    expect(applied).toMatchObject({ decision: 'WRITE_NEW_ROOT', advisory: false, applied: true, semanticMutation: true });
    expect(await f.service.getMemory(scope, applied.memoryId!)).toMatchObject({ canonicalKey: 'service.postflight.root' });
    expect(await writeDecisions()).toBe(2);
    await f.service.close();
  });
});
