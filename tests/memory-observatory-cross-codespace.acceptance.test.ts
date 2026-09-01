import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import type { MemoryActivityEvent, MemoryActivitySink } from '../src/memory/activity.js';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryService } from '../src/memory/service.js';
import type { MemoryObservatoryNodeDetail, MemoryObservatorySnapshot, MemoryScope } from '../src/memory/types.js';

const roots: string[] = [];
const services: MemoryService[] = [];

class DurableRemoteFixture implements MemoryRemoteTransport {
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = null;
  fetchedGitHead: string | null = null;
  localCommit: string | null = null;
  private commitNo = 0;

  async ensureCheckout(): Promise<{ cwd: string }> { return { cwd: '/observatory-cross-codespace-remote' }; }
  async fetch(): Promise<void> {
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
  async currentRemoteHead(): Promise<string | null> { return this.fetchedGitHead; }
  async readFile(relativePath: string): Promise<Uint8Array | null> {
    const value = this.localFiles.get(relativePath);
    return value ? Uint8Array.from(value) : null;
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

class RecordingSink implements MemoryActivitySink {
  readonly events: MemoryActivityEvent[] = [];
  emit(event: MemoryActivityEvent): void { this.events.push(structuredClone(event)); }
}

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-observatory-cross-codespace-${label}-`));
  roots.push(root);
  return root;
}

function memoryConfig(root: string, keyFile: string) {
  return loadConfig({
    AGENT_CORE_MEMORY_DB_PATH: path.join(root, 'runtime', 'memory', 'agent-core-memory.sqlite'),
    AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
    AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
    AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote-Observatory-Acceptance',
    AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/observatory-shadow-test',
    AGENT_CORE_MEMORY_REMOTE_KEY_FILE: keyFile,
    AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'remote-work'),
    AGENT_CORE_MEMORY_OBSERVATORY_ENABLED: 'true',
    AGENT_CORE_MEMORY_OBSERVATORY_MODE: 'shadow',
  }, root).memory;
}

function normalizedGraph(snapshot: MemoryObservatorySnapshot) {
  return {
    nodes: [...snapshot.nodes].sort((a, b) => a.memoryId.localeCompare(b.memoryId)),
    edges: [...snapshot.edges].sort((a, b) => a.edgeId.localeCompare(b.edgeId)),
    conflicts: [...snapshot.conflicts].sort((a, b) => a.conflictId.localeCompare(b.conflictId)),
  };
}

async function nodeDetails(service: MemoryService, scope: MemoryScope, snapshot: MemoryObservatorySnapshot) {
  const entries: Array<[string, MemoryObservatoryNodeDetail]> = [];
  for (const node of snapshot.nodes) {
    const detail = await service.observatoryNode(scope, node.memoryId);
    if (!detail) throw new Error(`OBSERVATORY_NODE_MISSING:${node.memoryId}`);
    entries.push([node.memoryId, detail]);
  }
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })));
});

describe('Memory Observatory cross-Codespace recovery', () => {
  it('rebuilds exact graph/revision/conflict truth from encrypted remote after all A-local state is destroyed', async () => {
    const rootA = await tempRoot('a');
    const rootB = await tempRoot('b');
    const secretRoot = await tempRoot('secrets');
    const keyFile = path.join(secretRoot, 'memory-remote.key');
    await writeFile(keyFile, Buffer.alloc(32, 0x6f), { mode: 0o600 });
    await MemoryRemoteCrypto.fromKeyFile(keyFile); // validates the isolated encryption fixture before mutation.

    const scope: MemoryScope = { principalId: 'observatory-cross-codespace-principal', projectId: 'observatory-cross-codespace-project' };
    const remote = new DurableRemoteFixture();
    const sinkA = new RecordingSink();
    const configA = memoryConfig(rootA, keyFile);
    const serviceA = new MemoryService(configA, undefined, { remoteTransport: remote, activitySink: sinkA });
    services.push(serviceA);

    await expect(serviceA.hydrateRemote(scope)).resolves.toEqual({ state: 'REMOTE_EMPTY_CONFIRMED', remoteHead: null });
    sinkA.events.length = 0; // initial empty confirmation is valid only before A creates durable state.

    const validation = await serviceA.commit({
      scope,
      canonicalKey: 'observatory.cross.validation',
      kind: 'artifact',
      value: 'Validation V1 proves the recovered solution.',
      sourceType: 'cross-codespace-acceptance',
    });
    const solution = await serviceA.commit({
      scope,
      canonicalKey: 'observatory.cross.solution',
      kind: 'procedure',
      value: 'Solution S1 uses bounded authoritative recovery.',
      sourceType: 'cross-codespace-acceptance',
      explicitRelations: [{ targetMemoryId: validation.memoryId, relation: 'validated_by', weight: 1 }],
    });
    await serviceA.revise({
      scope,
      memoryId: solution.memoryId,
      value: 'Solution S2 uses bounded authoritative recovery and exact graph verification.',
      sourceType: 'cross-codespace-acceptance-revision',
    });
    const failure = await serviceA.commit({
      scope,
      canonicalKey: 'observatory.cross.failure',
      kind: 'failure',
      value: 'Failure F1 occurred because local-only state disappeared.',
      sourceType: 'cross-codespace-acceptance',
      explicitRelations: [{ targetMemoryId: solution.memoryId, relation: 'resolved_by', weight: 1 }],
    });
    const branch = await serviceA.commit({
      scope,
      canonicalKey: 'observatory.cross.branch',
      kind: 'decision',
      value: 'Branch B1 preserves a distinct recovery path.',
      sourceType: 'cross-codespace-acceptance',
      explicitRelations: [{ targetMemoryId: solution.memoryId, relation: 'branch_of', weight: 1 }],
    });
    await serviceA.openConflict(scope, branch.memoryId, solution.memoryId, 'recovery-path-conflict', {
      evidence: 'Both recovery paths remain visible until explicitly resolved.',
    });

    const synced = await serviceA.syncDurableBoundary(scope, 'continuity_terminal');
    expect(synced).toMatchObject({ required: true, state: 'REMOTE_SYNCED' });
    if (!synced.required) throw new Error('REMOTE_SYNC_REQUIRED_FOR_ACCEPTANCE');
    expect(sinkA.events).toContainEqual(expect.objectContaining({ type: 'memory.remote_synced', state: 'completed' }));
    expect(sinkA.events.some((event) => event.statusCode === 'REMOTE_EMPTY_CONFIRMED')).toBe(false);

    const snapshotA = await serviceA.observatorySnapshot({ scope, maxNodes: 500, maxEdges: 2_000 });
    const detailsA = await nodeDetails(serviceA, scope, snapshotA);
    expect(snapshotA.status.remoteDurabilityState).toBe('REMOTE_SYNCED');
    expect(snapshotA.status.logicalStateHash).toBe(synced.logicalStateHash);
    expect(snapshotA.edges.map((edge) => edge.relation)).toEqual(expect.arrayContaining(['resolved_by', 'validated_by', 'branch_of']));
    expect(detailsA[solution.memoryId]?.revisions).toHaveLength(2);
    expect(snapshotA.conflicts).toHaveLength(1);

    const remoteText = Buffer.concat([...remote.remoteFiles.values()].map((bytes) => Buffer.from(bytes))).toString('utf8');
    for (const forbidden of ['Failure F1', 'Solution S2', 'Validation V1', scope.principalId, scope.projectId!]) {
      expect(remoteText).not.toContain(forbidden);
    }

    await serviceA.close();
    services.splice(services.indexOf(serviceA), 1);
    await rm(rootA, { recursive: true, force: true }); // simulate permanent Codespace A deletion.

    const sinkB = new RecordingSink();
    const configB = memoryConfig(rootB, keyFile);
    const serviceB = new MemoryService(configB, undefined, { remoteTransport: remote, activitySink: sinkB });
    services.push(serviceB);
    const hydrated = await serviceB.hydrateRemote(scope);
    expect(hydrated).toMatchObject({
      state: 'REMOTE_HYDRATED',
      generationId: synced.generationId,
      logicalStateHash: synced.logicalStateHash,
    });
    expect(sinkB.events).toContainEqual(expect.objectContaining({
      type: 'memory.hydration_completed',
      state: 'completed',
      statusCode: 'REMOTE_HYDRATED',
    }));
    expect(sinkB.events.some((event) => event.statusCode === 'REMOTE_EMPTY_CONFIRMED')).toBe(false);

    const snapshotB = await serviceB.observatorySnapshot({ scope, maxNodes: 500, maxEdges: 2_000 });
    const detailsB = await nodeDetails(serviceB, scope, snapshotB);
    expect(snapshotB.status.hydrationState).toBe('REMOTE_HYDRATED');
    expect(snapshotB.status.logicalStateHash).toBe(synced.logicalStateHash);
    expect(normalizedGraph(snapshotB)).toEqual(normalizedGraph(snapshotA));
    expect(detailsB).toEqual(detailsA);

    expect(normalizedGraph(snapshotB).nodes.map((node) => node.memoryId)).toEqual(expect.arrayContaining([
      validation.memoryId,
      solution.memoryId,
      failure.memoryId,
      branch.memoryId,
    ]));
  });
});
