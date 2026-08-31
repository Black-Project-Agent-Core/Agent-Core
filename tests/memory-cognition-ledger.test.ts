import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import { MemoryService } from '../src/memory/service.js';
import { MemoryStore } from '../src/memory/store.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

function dbPath(label: string): string {
  const base = process.env.TEMP || process.env.TMP || os.tmpdir();
  return path.join(mkdtempSync(path.join(base, `agent-core-cognition-${label}-`)), 'memory.sqlite');
}

async function fixture(label: string) {
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  await store.open({ dbPath: dbPath(label) });
  return { client, store, ledger: new MemoryCognitionLedger(client) };
}

const scopeA = { principalId: 'principal-a', projectId: 'project-a' };
const scopeB = { principalId: 'principal-b', projectId: 'project-a' };
const scopeOtherProject = { principalId: 'principal-a', projectId: 'project-b' };

describe('scoped memory cognition ledger', () => {
  it('persists NO_DURABLE_MEMORY deterministically without creating a semantic memory node', async () => {
    const f = await fixture('write-decision');
    try {
      const before = (await f.client.query<{ count: number }>('SELECT count(*) AS count FROM memory_items'))[0]!.count;
      const decision = await f.ledger.recordWriteDecision({
        scope: scopeA,
        routeContextId: 'route-context-1',
        contextId: 'memory-context-1',
        decisionType: 'NO_DURABLE_MEMORY',
        candidateCanonicalKey: 'transient.inspect.status',
        candidateHash: 'candidate-hash-1',
        existingMemoryIds: ['memory-z', 'memory-a', 'memory-z'],
        reasonCodes: ['NO_FUTURE_RELEVANCE', 'TRANSIENT_OPERATION', 'NO_FUTURE_RELEVANCE'],
        evidenceRefs: ['evidence-z', 'Authorization: Bearer secret-token', 'evidence-a'],
        relationPlan: [{ relation: 'same_anchor', targetMemoryId: 'memory-z', note: 'token=secret-value' }],
      });

      expect(decision).toMatchObject({
        principalId: scopeA.principalId,
        projectId: scopeA.projectId,
        decisionType: 'NO_DURABLE_MEMORY',
        existingMemoryIds: ['memory-a', 'memory-z'],
        reasonCodes: ['NO_FUTURE_RELEVANCE', 'TRANSIENT_OPERATION'],
      });
      expect(decision.evidenceRefs).toEqual(['[REDACTED:BEARER]', 'evidence-a', 'evidence-z']);
      expect(JSON.stringify(decision.relationPlan)).not.toContain('secret-value');
      expect((await f.client.query<{ count: number }>('SELECT count(*) AS count FROM memory_items'))[0]!.count).toBe(before);

      const raw = (await f.client.query<{ existing_memory_ids_json: string; reason_codes_json: string; evidence_refs_json: string; relation_plan_json: string }>(
        'SELECT existing_memory_ids_json, reason_codes_json, evidence_refs_json, relation_plan_json FROM memory_write_decisions WHERE id = ?',
        [decision.id],
      ))[0]!;
      expect(raw.existing_memory_ids_json).toBe('["memory-a","memory-z"]');
      expect(raw.reason_codes_json).toBe('["NO_FUTURE_RELEVANCE","TRANSIENT_OPERATION"]');
      expect(raw.evidence_refs_json).toBe('["[REDACTED:BEARER]","evidence-a","evidence-z"]');
      expect(raw.relation_plan_json).not.toContain('secret-value');
    } finally {
      await f.store.close();
    }
  });

  it('applies decisions and recall expansions only inside the authenticated principal/project scope', async () => {
    const f = await fixture('scope');
    try {
      const decision = await f.ledger.recordWriteDecision({
        scope: scopeA,
        routeContextId: 'route-scope',
        decisionType: 'LINK_EXISTING',
        candidateHash: 'candidate-hash-scope',
        existingMemoryIds: [],
        reasonCodes: ['RELATED_EXISTING_ONLY'],
        evidenceRefs: [],
        relationPlan: [],
      });

      await expect(f.ledger.markWriteDecisionApplied(scopeB, decision.id, { status: 'wrong-principal' }))
        .rejects.toThrow(/MEMORY_WRITE_DECISION_NOT_FOUND/);
      await expect(f.ledger.markWriteDecisionApplied(scopeOtherProject, decision.id, { status: 'wrong-project' }))
        .rejects.toThrow(/MEMORY_WRITE_DECISION_NOT_FOUND/);
      const applied = await f.ledger.markWriteDecisionApplied(scopeA, decision.id, { status: 'applied', token: 'secret-value' });
      expect(applied.appliedAt).toEqual(expect.any(Number));
      expect(applied.applyResult).toEqual({ status: 'applied', token: '[REDACTED:SECRET]' });

      await f.ledger.recordRecallExpansion({
        scope: scopeA,
        contextId: 'ctx-1',
        sourceMemoryId: 'memory-seed',
        targetMemoryId: 'memory-z',
        depth: 2,
        relationPath: ['failed_because', 'resolved_by'],
        reasonCode: 'CAUSAL_HISTORY_REQUIRED',
        score: 0.8,
        createdAt: 20,
      });
      await f.ledger.recordRecallExpansion({
        scope: scopeA,
        contextId: 'ctx-1',
        sourceMemoryId: 'memory-seed',
        targetMemoryId: 'memory-a',
        depth: 1,
        relationPath: ['supersedes'],
        reasonCode: 'REVISION_HISTORY_REQUIRED',
        score: 1,
        createdAt: 10,
      });
      await f.ledger.recordRecallExpansion({
        scope: scopeOtherProject,
        contextId: 'ctx-1',
        sourceMemoryId: 'memory-other',
        targetMemoryId: 'memory-other-target',
        depth: 1,
        relationPath: ['branch_of'],
        reasonCode: 'BRANCH_HISTORY_REQUIRED',
        score: 0.5,
        createdAt: 5,
      });

      const expansions = await f.ledger.listRecallExpansions(scopeA, 'ctx-1');
      expect(expansions.map((row) => row.targetMemoryId)).toEqual(['memory-a', 'memory-z']);
      expect(await f.ledger.listRecallExpansions(scopeB, 'ctx-1')).toEqual([]);
      expect(await f.ledger.listRecallExpansions(scopeOtherProject, 'ctx-1')).toHaveLength(1);
    } finally {
      await f.store.close();
    }
  });

  it('round-trips node metadata only for memories and branch parents in the same scope', async () => {
    const f = await fixture('metadata');
    try {
      const parent = await f.store.commitMemory({
        scope: scopeA,
        canonicalKey: 'metadata.parent',
        kind: 'decision',
        value: 'Parent decision',
        sourceType: 'test',
      });
      const child = await f.store.commitMemory({
        scope: scopeA,
        canonicalKey: 'metadata.child',
        kind: 'decision',
        value: 'Child decision',
        sourceType: 'test',
      });
      const foreign = await f.store.commitMemory({
        scope: scopeOtherProject,
        canonicalKey: 'metadata.foreign',
        kind: 'decision',
        value: 'Foreign decision',
        sourceType: 'test',
      });

      const metadata = await f.ledger.upsertNodeMetadata({
        scope: scopeA,
        memoryId: child.memoryId,
        title: 'Child Architecture Branch',
        rootReason: 'FRESH_DURABLE_CONTEXT',
        noveltyClass: 'branch',
        branchParentMemoryId: parent.memoryId,
        semanticProfile: { intent: 'memory cognition', constraints: ['Bearer secret-token'] },
      });
      expect(metadata).toMatchObject({
        memoryId: child.memoryId,
        title: 'Child Architecture Branch',
        rootReason: 'FRESH_DURABLE_CONTEXT',
        noveltyClass: 'branch',
        branchParentMemoryId: parent.memoryId,
        semanticProfile: { constraints: ['[REDACTED:BEARER]'], intent: 'memory cognition' },
      });
      expect(metadata.semanticProfileHash).toMatch(/^[0-9a-f]{64}$/);
      expect(await f.ledger.getNodeMetadata(scopeA, child.memoryId)).toEqual(metadata);
      expect(await f.ledger.getNodeMetadata(scopeB, child.memoryId)).toBeNull();
      expect(await f.ledger.getNodeMetadata(scopeOtherProject, child.memoryId)).toBeNull();

      await expect(f.ledger.upsertNodeMetadata({
        scope: scopeA,
        memoryId: child.memoryId,
        branchParentMemoryId: foreign.memoryId,
      })).rejects.toThrow(/MEMORY_NODE_METADATA_PARENT_NOT_FOUND/);
      await expect(f.ledger.upsertNodeMetadata({
        scope: scopeB,
        memoryId: child.memoryId,
      })).rejects.toThrow(/MEMORY_NODE_METADATA_NOT_FOUND/);
    } finally {
      await f.store.close();
    }
  });

  it('exposes narrow cognition wrappers and scoped cognition counts through MemoryService', async () => {
    const root = mkdtempSync(path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'agent-core-cognition-service-'));
    const base = loadConfig({}, root).memory;
    const service = new MemoryService({ ...base, enabled: true, dbPath: path.join(root, 'runtime', 'memory', 'service.sqlite') });
    try {
      const decision = await service.recordWriteDecision({
        scope: scopeA,
        routeContextId: 'route-service',
        decisionType: 'NO_DURABLE_MEMORY',
        candidateHash: 'service-candidate-hash',
        existingMemoryIds: [],
        reasonCodes: ['TRANSIENT_OPERATION'],
        evidenceRefs: [],
        relationPlan: [],
      });
      await service.recordRecallExpansion({
        scope: scopeA,
        contextId: 'service-context',
        sourceMemoryId: 'seed',
        targetMemoryId: 'target',
        depth: 1,
        relationPath: ['supersedes'],
        reasonCode: 'REVISION_HISTORY_REQUIRED',
        score: 1,
      });
      await service.setRemoteState({ scope: scopeA, durabilityState: 'REMOTE_PENDING' });

      expect(await service.getWriteDecision(scopeA, decision.id)).toMatchObject({ id: decision.id });
      expect(await service.listRecallExpansions(scopeA, 'service-context')).toHaveLength(1);
      expect(await service.getRemoteState(scopeA)).toMatchObject({ durabilityState: 'REMOTE_PENDING' });
      const status = await service.status(scopeA);
      expect(status.counts).toMatchObject({ write_decisions: 1, recall_expansions: 1, edge_events: 0 });
    } finally {
      await service.close();
    }
  });

  it('persists bounded semantic profiles and finds exact profile identities only inside scope', async () => {
    const f = await fixture('semantic-profile-index');
    try {
      const first = await f.store.commitMemory({
        scope: scopeA,
        canonicalKey: 'profile.first',
        kind: 'decision',
        value: 'Preserve source-native geometry.',
        sourceType: 'test',
      });
      const second = await f.store.commitMemory({
        scope: scopeA,
        canonicalKey: 'profile.second',
        kind: 'procedure',
        value: 'Use the same bounded profile identity.',
        sourceType: 'test',
      });
      const foreign = await f.store.commitMemory({
        scope: scopeOtherProject,
        canonicalKey: 'profile.foreign',
        kind: 'decision',
        value: 'Foreign profile identity.',
        sourceType: 'test',
      });
      const profile = {
        title: 'PPT Geometry Fidelity',
        concepts: ['PPTX', 'geometry'],
        constraints: ['token=secret-value'],
        futureRelevance: ['pptx conversion'],
      };
      const firstMetadata = await f.ledger.upsertNodeMetadata({ scope: scopeA, memoryId: first.memoryId, semanticProfile: profile });
      const secondMetadata = await f.ledger.upsertNodeMetadata({ scope: scopeA, memoryId: second.memoryId, semanticProfile: profile });
      await f.ledger.upsertNodeMetadata({ scope: scopeOtherProject, memoryId: foreign.memoryId, semanticProfile: profile });

      expect(firstMetadata.semanticProfile).toMatchObject({ constraints: ['[REDACTED:TOKEN]'] });
      expect(firstMetadata.semanticProfileHash).toBe(secondMetadata.semanticProfileHash);
      const matches = await f.ledger.findNodeMetadataBySemanticProfileHash(scopeA, firstMetadata.semanticProfileHash!);
      expect(matches.map((row) => row.memoryId)).toEqual([first.memoryId, second.memoryId].sort());
      expect(await f.ledger.findNodeMetadataBySemanticProfileHash(scopeB, firstMetadata.semanticProfileHash!)).toEqual([]);
      expect(await f.ledger.findNodeMetadataBySemanticProfileHash(scopeOtherProject, firstMetadata.semanticProfileHash!))
        .toHaveLength(1);
    } finally {
      await f.store.close();
    }
  });

  it('keeps edge-event history append-only', async () => {
    const f = await fixture('edge-events-append-only');
    try {
      await f.client.transaction([{
        kind: 'run',
        sql: `INSERT INTO memory_edge_events(
          id, principal_id, project_id, event_type, from_memory_id, to_memory_id,
          relation, old_weight, new_weight, evidence_event_id, reason_code, created_at
        ) VALUES (?, ?, ?, 'edge.created', ?, ?, 'branch_of', NULL, 1, NULL, 'TEST', ?)`,
        params: ['edge-event-1', scopeA.principalId, scopeA.projectId!, 'child', 'parent', 1],
      }]);
      await expect(f.client.exec("UPDATE memory_edge_events SET reason_code = 'mutated' WHERE id = 'edge-event-1'"))
        .rejects.toThrow(/append-only/);
      await expect(f.client.exec("DELETE FROM memory_edge_events WHERE id = 'edge-event-1'"))
        .rejects.toThrow(/append-only/);
    } finally {
      await f.store.close();
    }
  });

  it('tracks pending/synced remote truth per scope and rejects invalid enum values', async () => {
    const f = await fixture('remote-state');
    try {
      const pending = await f.ledger.setRemoteState({
        scope: scopeA,
        durabilityState: 'REMOTE_PENDING',
        hydrationState: 'REMOTE_HYDRATED',
        remoteGeneration: 'generation-1',
        remoteHead: 'remote-head-1',
        logicalStateHash: 'logical-hash-1',
      });
      expect(pending).toMatchObject({
        durabilityState: 'REMOTE_PENDING',
        hydrationState: 'REMOTE_HYDRATED',
        remoteGeneration: 'generation-1',
        remoteHead: 'remote-head-1',
        logicalStateHash: 'logical-hash-1',
      });

      const synced = await f.ledger.setRemoteState({
        scope: scopeA,
        durabilityState: 'REMOTE_SYNCED',
        hydrationState: 'REMOTE_HYDRATED',
        remoteGeneration: 'generation-2',
        remoteHead: 'remote-head-2',
        logicalStateHash: 'logical-hash-2',
      });
      expect(await f.ledger.getRemoteState(scopeA)).toEqual(synced);
      expect(await f.ledger.getRemoteState(scopeB)).toBeNull();
      expect(await f.ledger.getRemoteState(scopeOtherProject)).toBeNull();

      await expect(f.ledger.recordWriteDecision({
        scope: scopeA,
        routeContextId: 'route-invalid',
        decisionType: 'INVALID' as never,
        candidateHash: 'invalid',
        existingMemoryIds: [],
        reasonCodes: [],
        evidenceRefs: [],
        relationPlan: [],
      })).rejects.toThrow(/MEMORY_WRITE_DECISION_INVALID/);
      await expect(f.ledger.setRemoteState({
        scope: scopeA,
        durabilityState: 'INVALID' as never,
      })).rejects.toThrow(/MEMORY_REMOTE_STATE_INVALID/);
    } finally {
      await f.store.close();
    }
  });
});
