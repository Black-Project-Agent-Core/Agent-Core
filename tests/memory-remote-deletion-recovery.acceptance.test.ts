import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { auditedEdgeInsertOperations, MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import {
  hashMemoryLogicalState,
  projectMemoryLogicalState,
  serializeMemoryLogicalState,
} from '../src/memory/logical-state-hash.js';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import { MemoryRemoteHydrator } from '../src/memory/remote-hydrator.js';
import {
  createMemoryRemoteEnvelope,
  createMemoryRemoteManifest,
  memoryRemoteScopeId,
} from '../src/memory/remote-journal.js';
import { MemoryRemoteSynchronizer } from '../src/memory/remote-sync.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryService } from '../src/memory/service.js';
import { MemoryStore } from '../src/memory/store.js';
import type { MemoryScope } from '../src/memory/types.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

const roots: string[] = [];
const stores: MemoryStore[] = [];
const services: MemoryService[] = [];

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-memory-delete-recovery-${label}-`));
  roots.push(root);
  return root;
}

class DurableRemoteFixture implements MemoryRemoteTransport {
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = null;
  fetchedGitHead: string | null = null;
  localCommit: string | null = null;
  private commitNo = 0;

  async ensureCheckout(): Promise<{ cwd: string }> { return { cwd: '/durable-remote-fixture' }; }
  async fetch(): Promise<void> {
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
  async currentRemoteHead(): Promise<string | null> { return this.fetchedGitHead; }
  async readFile(relativePath: string): Promise<Uint8Array | null> {
    const bytes = this.localFiles.get(relativePath);
    return bytes ? Uint8Array.from(bytes) : null;
  }
  async writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void> {
    for (const file of files) this.localFiles.set(file.relativePath, Uint8Array.from(file.bytes));
  }
  async commit(): Promise<string> {
    this.commitNo += 1;
    this.localCommit = this.commitNo.toString(16).padStart(40, '0');
    return this.localCommit;
  }
  async pushNonForce(): Promise<void> {
    this.remoteFiles.clear();
    for (const [key, value] of this.localFiles) this.remoteFiles.set(key, Uint8Array.from(value));
    this.remoteGitHead = this.localCommit;
  }
  async resetToRemoteHead(): Promise<void> {
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
}

afterEach(async () => {
  await Promise.all(services.splice(0).map(async (service) => {
    try { await service.close(); } catch {}
  }));
  await Promise.all(stores.splice(0).map(async (store) => {
    try { await store.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('permanent Codespace deletion -> fresh Memory Remote hydration', () => {
  it('recreates exact certified logical truth without plaintext remote leakage', async () => {
    const codespaceA = await tempRoot('codespace-a');
    const codespaceB = await tempRoot('codespace-b');
    const durableSecrets = await tempRoot('durable-secrets');
    const keyPath = path.join(durableSecrets, 'memory-remote.key');
    await writeFile(keyPath, Buffer.alloc(32, 0x7a));
    const crypto = await MemoryRemoteCrypto.fromKeyFile(keyPath);
    const scope: MemoryScope = { principalId: 'principal-delete-recovery', projectId: 'project-delete-recovery' };

    const configA = loadConfig({}, codespaceA).memory;
    const dbA = path.join(codespaceA, 'runtime', 'memory', 'agent-core-memory.sqlite');
    const serviceA = new MemoryService({ ...configA, dbPath: dbA });
    services.push(serviceA);

    const rootMemory = await serviceA.commit({
      scope,
      canonicalKey: 'recovery.a1.root',
      kind: 'fact',
      value: 'A1_ROOT_SENTINEL durable root before Codespace deletion.',
      sourceType: 'acceptance',
    });
    await serviceA.revise({
      scope,
      memoryId: rootMemory.memoryId,
      value: 'A1_ROOT_SENTINEL durable root revised with current certified truth.',
      sourceType: 'acceptance-revision',
    });
    const branch = await serviceA.commit({
      scope,
      canonicalKey: 'recovery.a2.branch',
      kind: 'decision',
      value: 'A2_BRANCH_SENTINEL branch preserving an alternative durable line.',
      sourceType: 'acceptance',
      explicitRelations: [{ targetMemoryId: rootMemory.memoryId, relation: 'branch_of' }],
    });
    const failure = await serviceA.commit({
      scope,
      canonicalKey: 'recovery.a3.failure',
      kind: 'failure',
      value: 'A3_FAILURE_SENTINEL renderer failed because the source artifact was incomplete.',
      sourceType: 'acceptance',
    });
    const solution = await serviceA.commit({
      scope,
      canonicalKey: 'recovery.a4.solution',
      kind: 'procedure',
      value: 'A4_SOLUTION_SENTINEL rebuild the artifact from verified source evidence.',
      sourceType: 'acceptance',
      explicitRelations: [{ targetMemoryId: failure.memoryId, relation: 'learned_from' }],
    });
    const validation = await serviceA.commit({
      scope,
      canonicalKey: 'recovery.a5.validation',
      kind: 'artifact',
      value: 'A5_VALIDATION_SENTINEL verification passed with deterministic output hash.',
      sourceType: 'acceptance',
      explicitRelations: [{ targetMemoryId: solution.memoryId, relation: 'derived_from' }],
    });
    const alternate = await serviceA.commit({
      scope,
      canonicalKey: 'recovery.conflict.alternate',
      kind: 'decision',
      value: 'ALTERNATE_SENTINEL incompatible branch remains visible as conflict history.',
      sourceType: 'acceptance',
    });
    await serviceA.openConflict(scope, branch.memoryId, alternate.memoryId, 'acceptance-contradiction', {
      evidence: 'CONFLICT_EVIDENCE_SENTINEL',
    });
    const turn = await serviceA.beginContinuityTurn(
      scope,
      'route-delete-recovery',
      'Certify permanent Codespace deletion recovery',
      undefined,
      { objective: 'Preserve exact terminal continuity checkpoint after local deletion.' },
      Date.now() + 60_000,
    );
    await serviceA.checkpointContinuity(scope, turn.taskId, turn.turnId, {
      routeContextId: 'route-delete-recovery',
      status: 'completed',
      summary: 'TERMINAL_CONTINUITY_SENTINEL deletion-recovery checkpoint complete.',
      evidence: [{ type: 'test', ref: 'delete-recovery-acceptance', result: 'passed' }],
      projectTerminal: true,
    });
    await serviceA.closeContinuityTurn(scope, turn.turnId, 'closed');
    const writeDecision = await serviceA.recordWriteDecision({
      scope,
      routeContextId: 'route-delete-recovery',
      continuityTaskId: turn.taskId,
      decisionType: 'WRITE_BRANCH',
      candidateCanonicalKey: 'recovery.a2.branch',
      candidateHash: 'd'.repeat(64),
      targetMemoryId: branch.memoryId,
      existingMemoryIds: [rootMemory.memoryId],
      reasonCodes: ['DISTINCT_BRANCH'],
      evidenceRefs: ['delete-recovery-acceptance'],
      relationPlan: [{ relation: 'branch_of', targetMemoryId: rootMemory.memoryId }],
      rootReason: 'Acceptance branch survives local deletion.',
    });
    await serviceA.upsertNodeMetadata({
      scope,
      memoryId: branch.memoryId,
      title: 'Deletion Recovery Branch',
      createdFromDecisionId: writeDecision.id,
      branchParentMemoryId: rootMemory.memoryId,
      semanticProfile: { family: 'deletion-recovery', validated: true },
    });
    await serviceA.close();
    services.splice(services.indexOf(serviceA), 1);

    const clientA = new MemoryWorkerClient();
    const storeA = new MemoryStore(clientA);
    stores.push(storeA);
    await storeA.open({ dbPath: dbA });
    await clientA.transaction([
      ...auditedEdgeInsertOperations({
        eventId: randomUUID(), scope, fromMemoryId: failure.memoryId, toMemoryId: solution.memoryId,
        relation: 'resolved_by', weight: 1, evidenceEventId: solution.eventId,
        reasonCode: 'ACCEPTANCE_FAILURE_RESOLVED', createdAt: 1_788_230_000_000,
      }),
      ...auditedEdgeInsertOperations({
        eventId: randomUUID(), scope, fromMemoryId: solution.memoryId, toMemoryId: validation.memoryId,
        relation: 'validated_by', weight: 1, evidenceEventId: validation.eventId,
        reasonCode: 'ACCEPTANCE_SOLUTION_VALIDATED', createdAt: 1_788_230_000_001,
      }),
    ]);

    const originalProjection = await projectMemoryLogicalState(clientA, scope);
    const originalHash = hashMemoryLogicalState(originalProjection);
    const scopeId = memoryRemoteScopeId(scope);
    const object = createMemoryRemoteEnvelope({
      crypto,
      scopeId,
      kind: 'recovery-checkpoint',
      previousGeneration: null,
      logicalStateHash: originalHash,
      plaintextPayload: Buffer.from(`${serializeMemoryLogicalState(originalProjection)}\n`, 'utf8'),
      createdAt: 1_788_230_100_000,
    });
    const manifest = createMemoryRemoteManifest({
      scopeId,
      previousGeneration: null,
      objectIds: [object.objectId],
      logicalStateHash: originalHash,
      createdAt: 1_788_230_100_001,
    });
    const durableRemote = new DurableRemoteFixture();
    const sync = new MemoryRemoteSynchronizer(durableRemote, new MemoryCognitionLedger(clientA));
    await expect(sync.sync({ scope, object, manifest })).resolves.toMatchObject({ state: 'REMOTE_SYNCED' });

    const remoteBytes = Buffer.concat([...durableRemote.remoteFiles.values()].map((bytes) => Buffer.from(bytes))).toString('utf8');
    for (const forbidden of [
      'A1_ROOT_SENTINEL', 'A2_BRANCH_SENTINEL', 'A3_FAILURE_SENTINEL', 'A4_SOLUTION_SENTINEL',
      'A5_VALIDATION_SENTINEL', 'ALTERNATE_SENTINEL', 'CONFLICT_EVIDENCE_SENTINEL', 'TERMINAL_CONTINUITY_SENTINEL',
      scope.principalId, scope.projectId!,
    ]) expect(remoteBytes).not.toContain(forbidden);

    await storeA.close();
    stores.splice(stores.indexOf(storeA), 1);
    await rm(codespaceA, { recursive: true, force: true });

    const dbB = path.join(codespaceB, 'runtime', 'memory', 'agent-core-memory.sqlite');
    const hydrated = await new MemoryRemoteHydrator(durableRemote, crypto).hydrate(scope, dbB);
    expect(hydrated).toMatchObject({
      state: 'REMOTE_HYDRATED',
      generationId: manifest.generationId,
      logicalStateHash: originalHash,
    });

    const clientB = new MemoryWorkerClient();
    const storeB = new MemoryStore(clientB);
    stores.push(storeB);
    await storeB.open({ dbPath: dbB });
    const restoredProjection = await projectMemoryLogicalState(clientB, scope);
    expect(restoredProjection).toEqual(originalProjection);
    expect(hashMemoryLogicalState(restoredProjection)).toBe(originalHash);

    expect(restoredProjection.items).toHaveLength(originalProjection.items.length);
    expect(restoredProjection.revisions).toHaveLength(originalProjection.revisions.length);
    expect(restoredProjection.edges).toEqual(originalProjection.edges);
    expect(restoredProjection.conflicts).toEqual(originalProjection.conflicts);
    expect(restoredProjection.writeDecisions).toEqual(originalProjection.writeDecisions);
    expect(restoredProjection.continuityCheckpoints).toEqual(originalProjection.continuityCheckpoints);
    expect(restoredProjection.continuityFrontier).toEqual(originalProjection.continuityFrontier);
  });
});
