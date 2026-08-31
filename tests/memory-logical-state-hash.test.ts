import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import {
  hashMemoryLogicalState,
  projectMemoryLogicalState,
  type MemoryLogicalStateProjection,
} from '../src/memory/logical-state-hash.js';
import { MemoryStore } from '../src/memory/store.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

const scope = { principalId: 'principal-logical', projectId: 'project-logical' };

function emptyProjection(): MemoryLogicalStateProjection {
  return {
    formatVersion: 1,
    scope: { principalId: scope.principalId, projectId: scope.projectId },
    events: [],
    items: [],
    revisions: [],
    anchors: [],
    edges: [],
    conflicts: [],
    nodeMetadata: [],
    writeDecisions: [],
    edgeEvents: [],
    continuityTasks: [],
    continuityDependencies: [],
    continuityCheckpoints: [],
    continuityFrontier: [],
  };
}

async function fixture(label: string) {
  const root = mkdtempSync(path.join(os.tmpdir(), `agent-core-logical-state-${label}-`));
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  await store.open({ dbPath: path.join(root, 'memory.sqlite') });
  return { client, store, cognition: new MemoryCognitionLedger(client) };
}

describe('memory logical-state projection and hash', () => {
  it('is stable across table-row order and object-key order while preserving nested array order', () => {
    const first = emptyProjection();
    first.items = [
      { id: 'b', canonical_key: 'beta', value: { z: 1, a: 2 }, tags: ['first', 'second'] },
      { id: 'a', canonical_key: 'alpha', value: { nested: { y: true, x: false } }, tags: ['x'] },
    ];
    first.edges = [
      { from_memory_id: 'b', to_memory_id: 'a', relation: 'branch_of' },
      { from_memory_id: 'a', to_memory_id: 'b', relation: 'contradicts' },
    ];

    const second = emptyProjection();
    second.items = [
      { tags: ['x'], value: { nested: { x: false, y: true } }, canonical_key: 'alpha', id: 'a' },
      { tags: ['first', 'second'], value: { a: 2, z: 1 }, canonical_key: 'beta', id: 'b' },
    ];
    second.edges = [
      { relation: 'contradicts', to_memory_id: 'b', from_memory_id: 'a' },
      { relation: 'branch_of', to_memory_id: 'a', from_memory_id: 'b' },
    ];

    expect(hashMemoryLogicalState(second)).toBe(hashMemoryLogicalState(first));

    const changedNestedOrder = structuredClone(second);
    changedNestedOrder.items[1] = {
      ...(changedNestedOrder.items[1] as Record<string, unknown>),
      tags: ['second', 'first'],
    };
    expect(hashMemoryLogicalState(changedNestedOrder)).not.toBe(hashMemoryLogicalState(first));
  });

  it('projects only authenticated scope and excludes access/session/remote-sync volatility', async () => {
    const f = await fixture('volatility');
    try {
      const primary = await f.store.commitMemory({
        scope,
        canonicalKey: 'logical.primary',
        kind: 'decision',
        value: { accepted: true, version: 1 },
        sourceType: 'test',
        metadata: { source: 'logical-hash-test' },
      });
      await f.store.commitMemory({
        scope: { principalId: scope.principalId, projectId: 'foreign-project' },
        canonicalKey: 'logical.foreign',
        kind: 'decision',
        value: 'must never enter the projection',
        sourceType: 'test',
      });

      const before = await projectMemoryLogicalState(f.client, scope);
      const beforeHash = hashMemoryLogicalState(before);
      expect(before.scope).toEqual(scope);
      expect((before.items as Array<Record<string, unknown>>).map((row) => row.canonical_key)).toEqual(['logical.primary']);
      expect(JSON.stringify(before)).not.toContain('logical.foreign');
      expect(JSON.stringify(before)).not.toContain('last_accessed_at');
      expect(JSON.stringify(before)).not.toContain('access_count');

      await f.client.transaction([
        {
          kind: 'run',
          sql: 'UPDATE memory_items SET last_accessed_at = last_accessed_at + 9999, access_count = access_count + 7 WHERE id = ?',
          params: [primary.memoryId],
        },
        {
          kind: 'run',
          sql: `INSERT INTO memory_contexts(
            id, principal_id, route_context_id, query_text, query_hash, result_json, blocking_json, created_at, expires_at
          ) VALUES ('volatile-context', ?, 'volatile-route', 'volatile query', 'volatile-hash', '{}', '[]', 10, 20)`,
          params: [scope.principalId],
        },
        {
          kind: 'run',
          sql: `INSERT INTO memory_access_log(memory_id, context_id, rank, score, reason_json, accessed_at)
                VALUES (?, 'volatile-context', 1, 0.9, '{}', 11)`,
          params: [primary.memoryId],
        },
      ]);
      await f.cognition.setRemoteState({
        scope,
        durabilityState: 'REMOTE_PENDING',
        hydrationState: 'REMOTE_HYDRATED',
        remoteGeneration: 'volatile-generation',
        remoteHead: 'volatile-head',
        logicalStateHash: 'volatile-self-hash',
      });

      const after = await projectMemoryLogicalState(f.client, scope);
      expect(hashMemoryLogicalState(after)).toBe(beforeHash);
      expect(after).toEqual(before);
    } finally {
      await f.store.close();
    }
  });

  it('changes when revision, graph, conflict, or terminal continuity truth changes', async () => {
    const f = await fixture('durable-changes');
    try {
      const primary = await f.store.commitMemory({
        scope,
        canonicalKey: 'logical.primary',
        kind: 'decision',
        value: 'version one',
        sourceType: 'test',
      });
      const related = await f.store.commitMemory({
        scope,
        canonicalKey: 'logical.related',
        kind: 'decision',
        value: 'related durable fact',
        sourceType: 'test',
      });
      const initialHash = hashMemoryLogicalState(await projectMemoryLogicalState(f.client, scope));

      await f.store.reviseMemory({
        scope,
        memoryId: primary.memoryId,
        value: 'version two',
        sourceType: 'test',
      });
      const revisionHash = hashMemoryLogicalState(await projectMemoryLogicalState(f.client, scope));
      expect(revisionHash).not.toBe(initialHash);

      await f.client.transaction([{
        kind: 'run',
        sql: `INSERT INTO memory_edges(from_memory_id, to_memory_id, relation, weight, evidence_event_id, created_at)
              VALUES (?, ?, 'branch_of', 1, NULL, 100)`,
        params: [related.memoryId, primary.memoryId],
      }]);
      const edgeHash = hashMemoryLogicalState(await projectMemoryLogicalState(f.client, scope));
      expect(edgeHash).not.toBe(revisionHash);

      await f.client.transaction([{
        kind: 'run',
        sql: `INSERT INTO memory_conflicts(id, left_memory_id, right_memory_id, conflict_type, status, evidence_json, created_at, resolved_at)
              VALUES ('conflict-1', ?, ?, 'contradicts', 'open', '{"evidence":"fixture"}', 101, NULL)`,
        params: [primary.memoryId, related.memoryId],
      }]);
      const conflictHash = hashMemoryLogicalState(await projectMemoryLogicalState(f.client, scope));
      expect(conflictHash).not.toBe(edgeHash);

      await f.client.transaction([
        {
          kind: 'run',
          sql: `INSERT INTO continuity_tasks(
            id, principal_id, project_id, parent_task_id, title, objective,
            acceptance_json, constraints_json, status, priority, blocker_json,
            last_checkpoint_id, created_at, updated_at, completed_at
          ) VALUES ('task-terminal', ?, ?, NULL, 'Terminal task', 'Durable completion',
                    '["verified"]', '[]', 'completed', 1, '[]', 'checkpoint-terminal', 200, 210, 210)`,
          params: [scope.principalId, scope.projectId],
        },
        {
          kind: 'run',
          sql: `INSERT INTO continuity_checkpoints(
            id, principal_id, project_id, task_id, route_context_id, phase,
            summary_json, evidence_json, state_hash, created_at
          ) VALUES ('checkpoint-terminal', ?, ?, 'task-terminal', 'route-terminal', 'done',
                    '{"result":"PASS","details":{"b":2,"a":1}}', '["evidence-1"]', 'terminal-state-hash', 210)`,
          params: [scope.principalId, scope.projectId],
        },
        {
          kind: 'run',
          sql: `INSERT INTO continuity_frontier(
            id, principal_id, project_id, source_task_id, title, rationale, status,
            dependency_task_ids_json, priority, created_at, updated_at
          ) VALUES ('frontier-terminal', ?, ?, 'task-terminal', 'Next durable step', 'Continue later',
                    'deferred', '[]', 1, 210, 210)`,
          params: [scope.principalId, scope.projectId],
        },
      ]);
      const continuityHash = hashMemoryLogicalState(await projectMemoryLogicalState(f.client, scope));
      expect(continuityHash).not.toBe(conflictHash);
    } finally {
      await f.store.close();
    }
  });
});
