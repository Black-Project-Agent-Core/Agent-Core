import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import {
  hashMemoryLogicalState,
  projectMemoryLogicalState,
  serializeMemoryLogicalState,
  type MemoryLogicalStateProjection,
} from '../src/memory/logical-state-hash.js';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import { MemoryRemoteHydrator } from '../src/memory/remote-hydrator.js';
import {
  createMemoryRemoteEnvelope,
  createMemoryRemoteManifest,
  encodeMemoryRemoteEnvelope,
  encodeMemoryRemoteManifest,
  memoryRemoteGenerationPath,
  memoryRemoteHeadPath,
  memoryRemoteObjectPath,
  memoryRemoteScopeId,
} from '../src/memory/remote-journal.js';
import { MEMORY_REMOTE_FORMAT_BYTES, MEMORY_REMOTE_FORMAT_PATH } from '../src/memory/remote-sync.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryStore } from '../src/memory/store.js';
import type { MemoryScope } from '../src/memory/types.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

const roots: string[] = [];
const stores: MemoryStore[] = [];

async function rootFixture(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-memory-remote-hydration-${label}-`));
  roots.push(root);
  return root;
}

async function cryptoFixture(root: string, label: string, fill: number): Promise<MemoryRemoteCrypto> {
  const keyPath = path.join(root, `${label}.key`);
  await writeFile(keyPath, Buffer.alloc(32, fill));
  return MemoryRemoteCrypto.fromKeyFile(keyPath);
}

class SnapshotRemoteTransport implements MemoryRemoteTransport {
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = 'a'.repeat(40);
  fetchedGitHead: string | null = null;
  fetchError: (Error & { code?: string }) | undefined;

  async ensureCheckout(): Promise<{ cwd: string }> { return { cwd: '/snapshot-memory-remote' }; }
  async fetch(): Promise<void> {
    if (this.fetchError) throw this.fetchError;
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }
  async currentRemoteHead(): Promise<string | null> { return this.fetchedGitHead; }
  async readFile(relativePath: string): Promise<Uint8Array | null> {
    const value = this.localFiles.get(relativePath);
    return value ? Uint8Array.from(value) : null;
  }
  async writeFiles(): Promise<void> { throw new Error('not used by hydrator'); }
  async commit(): Promise<string> { throw new Error('not used by hydrator'); }
  async pushNonForce(): Promise<void> { throw new Error('not used by hydrator'); }
  async resetToRemoteHead(): Promise<void> { throw new Error('not used by hydrator'); }
}

async function sourceProjection(root: string, scope: MemoryScope): Promise<MemoryLogicalStateProjection> {
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  stores.push(store);
  await store.open({ dbPath: path.join(root, 'source.sqlite') });
  const parent = await store.commitMemory({
    scope,
    canonicalKey: 'memory.remote.parent',
    kind: 'fact',
    value: 'Parent memory survives deletion recovery.',
    sourceType: 'test',
  });
  const child = await store.commitMemory({
    scope,
    canonicalKey: 'memory.remote.child',
    kind: 'decision',
    value: 'Child memory links to the parent after hydration.',
    sourceType: 'test',
    explicitRelations: [{ targetMemoryId: parent.memoryId, relation: 'branch_of' }],
  });
  const ledger = new MemoryCognitionLedger(client);
  const decision = await ledger.recordWriteDecision({
    scope,
    routeContextId: 'route-hydration',
    decisionType: 'WRITE_BRANCH',
    candidateCanonicalKey: 'memory.remote.child',
    candidateHash: 'b'.repeat(64),
    targetMemoryId: child.memoryId,
    existingMemoryIds: [parent.memoryId],
    reasonCodes: ['DISTINCT_BRANCH'],
    evidenceRefs: ['checkpoint-hydration'],
    relationPlan: [{ relation: 'branch_of', targetMemoryId: parent.memoryId }],
    createdAt: 1_788_220_000_000,
  });
  await ledger.upsertNodeMetadata({
    scope,
    memoryId: child.memoryId,
    title: 'Hydrated Child',
    createdFromDecisionId: decision.id,
    branchParentMemoryId: parent.memoryId,
    semanticProfile: { intent: 'memory remote hydration', concepts: ['memory-remote'] },
    updatedAt: 1_788_220_000_001,
  });
  return projectMemoryLogicalState(client, scope);
}

function seedProjection(
  transport: SnapshotRemoteTransport,
  scope: MemoryScope,
  crypto: MemoryRemoteCrypto,
  projection: MemoryLogicalStateProjection,
  logicalStateHash = hashMemoryLogicalState(projection),
) {
  const scopeId = memoryRemoteScopeId(scope);
  const object = createMemoryRemoteEnvelope({
    crypto,
    scopeId,
    kind: 'recovery-checkpoint',
    previousGeneration: null,
    logicalStateHash,
    plaintextPayload: Buffer.from(`${serializeMemoryLogicalState(projection)}\n`, 'utf8'),
    createdAt: 1_788_220_100_000,
  });
  const manifest = createMemoryRemoteManifest({
    scopeId,
    previousGeneration: null,
    objectIds: [object.objectId],
    logicalStateHash,
    createdAt: 1_788_220_100_001,
  });
  transport.remoteFiles.set(MEMORY_REMOTE_FORMAT_PATH, MEMORY_REMOTE_FORMAT_BYTES);
  transport.remoteFiles.set(memoryRemoteHeadPath(scopeId), Buffer.from(`${manifest.generationId}\n`));
  transport.remoteFiles.set(memoryRemoteGenerationPath(scopeId, manifest.generationId), encodeMemoryRemoteManifest(manifest));
  transport.remoteFiles.set(memoryRemoteObjectPath(scopeId, object.objectId), encodeMemoryRemoteEnvelope(object));
  return { scopeId, object, manifest, logicalStateHash };
}

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map(async (store) => {
    try { await store.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('deterministic fresh-workspace Memory Remote hydration', () => {

  it('hydrates a pinned legacy Phase 5 format-v1 checkpoint without changing its logical hash', async () => {
    const root = await rootFixture('legacy-v1');
    const scope = { principalId: 'principal-legacy-v1', projectId: 'project-legacy-v1' };
    const projection: MemoryLogicalStateProjection = {
      formatVersion: 1,
      scope: { principalId: scope.principalId, projectId: scope.projectId },
      events: [], items: [], revisions: [], anchors: [], edges: [], conflicts: [], nodeMetadata: [],
      writeDecisions: [], edgeEvents: [], continuityTasks: [], continuityDependencies: [],
      continuityCheckpoints: [], continuityFrontier: [],
    };
    const expectedHash = hashMemoryLogicalState(projection);
    const crypto = await cryptoFixture(root, 'legacy-v1', 0x21);
    const transport = new SnapshotRemoteTransport();
    seedProjection(transport, scope, crypto, projection);
    const destination = path.join(root, 'legacy-restored.sqlite');

    await expect(new MemoryRemoteHydrator(transport, crypto).hydrate(scope, destination))
      .resolves.toMatchObject({ state: 'REMOTE_HYDRATED', logicalStateHash: expectedHash });

    const restoredClient = new MemoryWorkerClient();
    const restoredStore = new MemoryStore(restoredClient);
    stores.push(restoredStore);
    await restoredStore.open({ dbPath: destination });
    const legacyView = await projectMemoryLogicalState(restoredClient, scope, { formatVersion: 1 });
    expect(hashMemoryLogicalState(legacyView)).toBe(expectedHash);
    expect(legacyView).toEqual(projection);
  });

  it('returns REMOTE_EMPTY_CONFIRMED only after a successful remote fetch with no logical scope HEAD', async () => {
    const root = await rootFixture('empty');
    const scope = { principalId: 'principal-empty', projectId: 'project-empty' };
    const crypto = await cryptoFixture(root, 'empty', 0x11);
    const transport = new SnapshotRemoteTransport();
    const destination = path.join(root, 'fresh.sqlite');
    const hydrator = new MemoryRemoteHydrator(transport, crypto);

    await expect(hydrator.hydrate(scope, destination)).resolves.toEqual({
      state: 'REMOTE_EMPTY_CONFIRMED',
      remoteHead: 'a'.repeat(40),
    });
    await expect(readFile(destination)).rejects.toThrow();
  });

  it('decrypts, materializes, integrity-checks, and installs a fresh DB with exact logical projection/hash equality', async () => {
    const root = await rootFixture('success');
    const scope = { principalId: 'principal-hydrate', projectId: 'project-hydrate' };
    const projection = await sourceProjection(root, scope);
    const expectedHash = hashMemoryLogicalState(projection);
    const crypto = await cryptoFixture(root, 'success', 0x22);
    const transport = new SnapshotRemoteTransport();
    const seeded = seedProjection(transport, scope, crypto, projection);
    const destination = path.join(root, 'restored', 'memory.sqlite');
    const hydrator = new MemoryRemoteHydrator(transport, crypto);

    const result = await hydrator.hydrate(scope, destination);
    expect(result).toEqual({
      state: 'REMOTE_HYDRATED',
      generationId: seeded.manifest.generationId,
      logicalStateHash: expectedHash,
      remoteHead: 'a'.repeat(40),
    });

    const restoredClient = new MemoryWorkerClient();
    const restoredStore = new MemoryStore(restoredClient);
    stores.push(restoredStore);
    await restoredStore.open({ dbPath: destination });
    const restoredProjection = await projectMemoryLogicalState(restoredClient, scope);
    expect(restoredProjection).toEqual(projection);
    expect(hashMemoryLogicalState(restoredProjection)).toBe(expectedHash);
    const remoteState = await new MemoryCognitionLedger(restoredClient).getRemoteState(scope);
    expect(remoteState).toMatchObject({
      durabilityState: 'REMOTE_SYNCED',
      hydrationState: 'REMOTE_HYDRATED',
      remoteGeneration: seeded.manifest.generationId,
      remoteHead: 'a'.repeat(40),
      logicalStateHash: expectedHash,
    });
  });

  it('distinguishes remote auth failure from general unavailability and never interprets either as empty', async () => {
    const root = await rootFixture('unavailable');
    const scope = { principalId: 'principal-hydrate', projectId: 'project-hydrate' };
    const crypto = await cryptoFixture(root, 'unavailable', 0x33);
    const destination = path.join(root, 'memory.sqlite');

    const authTransport = new SnapshotRemoteTransport();
    authTransport.fetchError = codedError('GITHUB_GIT_AUTH_FAILED');
    await expect(new MemoryRemoteHydrator(authTransport, crypto).hydrate(scope, destination))
      .rejects.toMatchObject({ hydrationState: 'REMOTE_AUTH_FAILED' });

    const unavailableTransport = new SnapshotRemoteTransport();
    unavailableTransport.fetchError = codedError('GITHUB_GIT_FAILED');
    await expect(new MemoryRemoteHydrator(unavailableTransport, crypto).hydrate(scope, destination))
      .rejects.toMatchObject({ hydrationState: 'REMOTE_UNAVAILABLE' });
    await expect(readFile(destination)).rejects.toThrow();
  });

  it('maps wrong-key decryption to REMOTE_DECRYPT_FAILED', async () => {
    const root = await rootFixture('decrypt');
    const scope = { principalId: 'principal-hydrate', projectId: 'project-hydrate' };
    const projection = await sourceProjection(root, scope);
    const encryptionCrypto = await cryptoFixture(root, 'encrypt', 0x44);
    const wrongCrypto = await cryptoFixture(root, 'decrypt', 0x45);
    const transport = new SnapshotRemoteTransport();
    seedProjection(transport, scope, encryptionCrypto, projection);

    await expect(new MemoryRemoteHydrator(transport, wrongCrypto).hydrate(scope, path.join(root, 'memory.sqlite')))
      .rejects.toMatchObject({ hydrationState: 'REMOTE_DECRYPT_FAILED' });
  });

  it('maps tampered envelope bytes and logical-state mismatch to REMOTE_INTEGRITY_FAILED', async () => {
    const root = await rootFixture('integrity');
    const scope = { principalId: 'principal-hydrate', projectId: 'project-hydrate' };
    const projection = await sourceProjection(root, scope);
    const crypto = await cryptoFixture(root, 'integrity', 0x55);

    const tamperedTransport = new SnapshotRemoteTransport();
    const tampered = seedProjection(tamperedTransport, scope, crypto, projection);
    tamperedTransport.remoteFiles.set(
      memoryRemoteObjectPath(tampered.scopeId, tampered.object.objectId),
      Buffer.from('{"corrupt":true}\n'),
    );
    await expect(new MemoryRemoteHydrator(tamperedTransport, crypto).hydrate(scope, path.join(root, 'tampered.sqlite')))
      .rejects.toMatchObject({ hydrationState: 'REMOTE_INTEGRITY_FAILED' });

    const mismatchTransport = new SnapshotRemoteTransport();
    seedProjection(mismatchTransport, scope, crypto, projection, 'f'.repeat(64));
    await expect(new MemoryRemoteHydrator(mismatchTransport, crypto).hydrate(scope, path.join(root, 'mismatch.sqlite')))
      .rejects.toMatchObject({ hydrationState: 'REMOTE_INTEGRITY_FAILED' });
  });

  it('maps invalid logical replay to REMOTE_REPLAY_FAILED and preserves an existing destination byte-for-byte', async () => {
    const root = await rootFixture('replay');
    const scope = { principalId: 'principal-hydrate', projectId: 'project-hydrate' };
    const badProjection: MemoryLogicalStateProjection = {
      formatVersion: 1,
      scope: { principalId: scope.principalId, projectId: scope.projectId },
      events: [],
      items: [],
      revisions: [{
        id: 'rev-orphan', memory_id: 'missing-memory', revision_no: 1,
        value_text: 'orphan', value_json: null, value_hash: 'a'.repeat(64), source_event_id: null,
        valid_from: 1, valid_to: null, supersedes_revision_id: null, created_at: 1,
      }],
      anchors: [], edges: [], conflicts: [], nodeMetadata: [], writeDecisions: [], edgeEvents: [],
      continuityTasks: [], continuityDependencies: [], continuityCheckpoints: [], continuityFrontier: [],
    };
    const crypto = await cryptoFixture(root, 'replay', 0x66);
    const transport = new SnapshotRemoteTransport();
    seedProjection(transport, scope, crypto, badProjection);
    const destination = path.join(root, 'existing.sqlite');
    const original = Buffer.from('ORIGINAL_DESTINATION_BYTES');
    await writeFile(destination, original);

    await expect(new MemoryRemoteHydrator(transport, crypto).hydrate(scope, destination))
      .rejects.toMatchObject({ hydrationState: 'REMOTE_REPLAY_FAILED' });
    expect(await readFile(destination)).toEqual(original);
  });
});
