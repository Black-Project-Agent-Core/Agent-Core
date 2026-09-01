import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryCognitionLedger } from '../src/memory/cognition-ledger.js';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import {
  createMemoryRemoteEnvelope,
  createMemoryRemoteManifest,
  decodeMemoryRemoteManifest,
  encodeMemoryRemoteEnvelope,
  encodeMemoryRemoteManifest,
  memoryRemoteGenerationPath,
  memoryRemoteHeadPath,
  memoryRemoteObjectPath,
  memoryRemoteScopeId,
} from '../src/memory/remote-journal.js';
import { MEMORY_REMOTE_FORMAT_BYTES, MEMORY_REMOTE_FORMAT_PATH, MemoryRemoteSynchronizer } from '../src/memory/remote-sync.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { MemoryStore } from '../src/memory/store.js';
import type { MemoryScope } from '../src/memory/types.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

const roots: string[] = [];
const stores: MemoryStore[] = [];

async function rootFixture(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-memory-remote-concurrency-${label}-`));
  roots.push(root);
  return root;
}

class SharedRemote {
  readonly files = new Map<string, Uint8Array>();
  gitHead: string | null = null;
  commitNo = 10;
  pushes = 0;
  forcePushes = 0;
}

class CloneTransport implements MemoryRemoteTransport {
  readonly localFiles = new Map<string, Uint8Array>();
  fetchedHead: string | null = null;
  localCommit: string | null = null;
  beforePush: (() => Promise<void>) | undefined;
  private beforePushRan = false;

  constructor(readonly shared: SharedRemote, readonly name: string) {}

  async ensureCheckout(): Promise<{ cwd: string }> { return { cwd: `/clone-${this.name}` }; }
  async fetch(): Promise<void> {
    this.localFiles.clear();
    for (const [key, value] of this.shared.files) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedHead = this.shared.gitHead;
  }
  async currentRemoteHead(): Promise<string | null> { return this.fetchedHead; }
  async readFile(relativePath: string): Promise<Uint8Array | null> {
    const bytes = this.localFiles.get(relativePath);
    return bytes ? Uint8Array.from(bytes) : null;
  }
  async writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void> {
    for (const file of files) this.localFiles.set(file.relativePath, Uint8Array.from(file.bytes));
  }
  async commit(): Promise<string> {
    this.shared.commitNo += 1;
    this.localCommit = this.shared.commitNo.toString(16).padStart(40, '0');
    return this.localCommit;
  }
  async pushNonForce(): Promise<void> {
    if (!this.beforePushRan && this.beforePush) {
      this.beforePushRan = true;
      await this.beforePush();
    }
    if (this.fetchedHead !== this.shared.gitHead) {
      throw Object.assign(new Error('synthetic non-fast-forward'), { code: 'GITHUB_GIT_NON_FAST_FORWARD' });
    }
    this.shared.pushes += 1;
    this.shared.files.clear();
    for (const [key, value] of this.localFiles) this.shared.files.set(key, Uint8Array.from(value));
    this.shared.gitHead = this.localCommit;
  }
  async resetToRemoteHead(): Promise<void> {
    this.localFiles.clear();
    for (const [key, value] of this.shared.files) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedHead = this.shared.gitHead;
  }
}

async function ledger(root: string, label: string): Promise<MemoryCognitionLedger> {
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  stores.push(store);
  await store.open({ dbPath: path.join(root, `${label}.sqlite`) });
  return new MemoryCognitionLedger(client);
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map(async (store) => {
    try { await store.close(); } catch {}
  }));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Memory Remote concurrent writer reconciliation', () => {
  it('preserves writer A and B immutable objects after B retries a non-fast-forward without force', async () => {
    const root = await rootFixture('preserve-both');
    const scope: MemoryScope = { principalId: 'principal-concurrency', projectId: 'project-concurrency' };
    const keyPath = path.join(root, 'remote.key');
    await writeFile(keyPath, Buffer.alloc(32, 0x31));
    const crypto = await MemoryRemoteCrypto.fromKeyFile(keyPath);
    const scopeId = memoryRemoteScopeId(scope);
    const logicalHash = 'a'.repeat(64);

    const baseObject = createMemoryRemoteEnvelope({
      crypto, scopeId, kind: 'recovery-checkpoint', previousGeneration: null, logicalStateHash: logicalHash,
      plaintextPayload: Buffer.from('{"base":"checkpoint"}\n'), createdAt: 100,
    });
    const baseManifest = createMemoryRemoteManifest({
      scopeId, previousGeneration: null, objectIds: [baseObject.objectId], logicalStateHash: logicalHash, createdAt: 101,
    });
    const shared = new SharedRemote();
    shared.gitHead = '1'.repeat(40);
    shared.files.set(MEMORY_REMOTE_FORMAT_PATH, MEMORY_REMOTE_FORMAT_BYTES);
    shared.files.set(memoryRemoteHeadPath(scopeId), Buffer.from(`${baseManifest.generationId}\n`));
    shared.files.set(memoryRemoteObjectPath(scopeId, baseObject.objectId), encodeMemoryRemoteEnvelope(baseObject));
    shared.files.set(memoryRemoteGenerationPath(scopeId, baseManifest.generationId), encodeMemoryRemoteManifest(baseManifest));

    const eventA = createMemoryRemoteEnvelope({
      crypto, scopeId, kind: 'event-batch', previousGeneration: baseManifest.generationId, logicalStateHash: logicalHash,
      plaintextPayload: Buffer.from('WRITER_A_EVENT_SENTINEL'), createdAt: 200,
    });
    const manifestA = createMemoryRemoteManifest({
      scopeId, previousGeneration: baseManifest.generationId,
      objectIds: [baseObject.objectId, eventA.objectId], logicalStateHash: logicalHash, createdAt: 201,
    });
    const eventB = createMemoryRemoteEnvelope({
      crypto, scopeId, kind: 'event-batch', previousGeneration: baseManifest.generationId, logicalStateHash: logicalHash,
      plaintextPayload: Buffer.from('WRITER_B_EVENT_SENTINEL'), createdAt: 210,
    });
    const manifestB = createMemoryRemoteManifest({
      scopeId, previousGeneration: baseManifest.generationId,
      objectIds: [baseObject.objectId, eventB.objectId], logicalStateHash: logicalHash, createdAt: 211,
    });

    const transportA = new CloneTransport(shared, 'a');
    const transportB = new CloneTransport(shared, 'b');
    const syncA = new MemoryRemoteSynchronizer(transportA, await ledger(root, 'a'), { maxRetryAttempts: 3 });
    const syncB = new MemoryRemoteSynchronizer(transportB, await ledger(root, 'b'), { maxRetryAttempts: 3 });
    let resultA: Awaited<ReturnType<MemoryRemoteSynchronizer['sync']>> | undefined;
    transportB.beforePush = async () => {
      resultA = await syncA.sync({ scope, object: eventA, manifest: manifestA });
    };

    const resultB = await syncB.sync({ scope, object: eventB, manifest: manifestB });
    expect(resultA?.state).toBe('REMOTE_SYNCED');
    expect(resultB.state).toBe('REMOTE_SYNCED');
    expect(shared.forcePushes).toBe(0);
    expect(shared.pushes).toBe(2);

    expect(shared.files.has(memoryRemoteObjectPath(scopeId, eventA.objectId))).toBe(true);
    expect(shared.files.has(memoryRemoteObjectPath(scopeId, eventB.objectId))).toBe(true);
    const finalHead = Buffer.from(shared.files.get(memoryRemoteHeadPath(scopeId))!).toString('utf8').trim();
    const finalManifest = decodeMemoryRemoteManifest(shared.files.get(memoryRemoteGenerationPath(scopeId, finalHead))!);
    expect(finalManifest.objectIds).toEqual(expect.arrayContaining([baseObject.objectId, eventA.objectId, eventB.objectId]));
    expect(finalManifest.previousGeneration).toBe(resultA?.generationId);
    expect(finalManifest.logicalStateHash).toBe(logicalHash);

    const aManifest = decodeMemoryRemoteManifest(shared.files.get(memoryRemoteGenerationPath(scopeId, resultA!.generationId))!);
    expect(aManifest.previousGeneration).toBe(baseManifest.generationId);
    expect(baseManifest.previousGeneration).toBeNull();
  });

  it('does not transport-merge concurrent generations whose logical-state hashes disagree', async () => {
    const root = await rootFixture('semantic-conflict');
    const scope: MemoryScope = { principalId: 'principal-concurrency', projectId: 'project-concurrency' };
    const keyPath = path.join(root, 'remote.key');
    await writeFile(keyPath, Buffer.alloc(32, 0x32));
    const crypto = await MemoryRemoteCrypto.fromKeyFile(keyPath);
    const scopeId = memoryRemoteScopeId(scope);
    const baseHash = 'b'.repeat(64);
    const baseObject = createMemoryRemoteEnvelope({
      crypto, scopeId, kind: 'recovery-checkpoint', previousGeneration: null, logicalStateHash: baseHash,
      plaintextPayload: Buffer.from('{}'), createdAt: 300,
    });
    const baseManifest = createMemoryRemoteManifest({
      scopeId, previousGeneration: null, objectIds: [baseObject.objectId], logicalStateHash: baseHash, createdAt: 301,
    });
    const shared = new SharedRemote();
    shared.gitHead = '2'.repeat(40);
    shared.files.set(MEMORY_REMOTE_FORMAT_PATH, MEMORY_REMOTE_FORMAT_BYTES);
    shared.files.set(memoryRemoteHeadPath(scopeId), Buffer.from(`${baseManifest.generationId}\n`));
    shared.files.set(memoryRemoteObjectPath(scopeId, baseObject.objectId), encodeMemoryRemoteEnvelope(baseObject));
    shared.files.set(memoryRemoteGenerationPath(scopeId, baseManifest.generationId), encodeMemoryRemoteManifest(baseManifest));

    const objectA = createMemoryRemoteEnvelope({
      crypto, scopeId, kind: 'event-batch', previousGeneration: baseManifest.generationId,
      logicalStateHash: 'c'.repeat(64), plaintextPayload: Buffer.from('A'), createdAt: 400,
    });
    const manifestA = createMemoryRemoteManifest({
      scopeId, previousGeneration: baseManifest.generationId, objectIds: [baseObject.objectId, objectA.objectId],
      logicalStateHash: 'c'.repeat(64), createdAt: 401,
    });
    const objectB = createMemoryRemoteEnvelope({
      crypto, scopeId, kind: 'event-batch', previousGeneration: baseManifest.generationId,
      logicalStateHash: 'd'.repeat(64), plaintextPayload: Buffer.from('B'), createdAt: 410,
    });
    const manifestB = createMemoryRemoteManifest({
      scopeId, previousGeneration: baseManifest.generationId, objectIds: [baseObject.objectId, objectB.objectId],
      logicalStateHash: 'd'.repeat(64), createdAt: 411,
    });
    const transportA = new CloneTransport(shared, 'a-conflict');
    const transportB = new CloneTransport(shared, 'b-conflict');
    const syncA = new MemoryRemoteSynchronizer(transportA, await ledger(root, 'a-conflict'));
    const syncB = new MemoryRemoteSynchronizer(transportB, await ledger(root, 'b-conflict'));
    transportB.beforePush = async () => { await syncA.sync({ scope, object: objectA, manifest: manifestA }); };

    await expect(syncB.sync({ scope, object: objectB, manifest: manifestB }))
      .rejects.toMatchObject({ code: 'MEMORY_REMOTE_CONFLICT' });
    expect(shared.forcePushes).toBe(0);
    expect(shared.files.has(memoryRemoteObjectPath(scopeId, objectA.objectId))).toBe(true);
    expect(shared.files.has(memoryRemoteObjectPath(scopeId, objectB.objectId))).toBe(false);
  });
});
