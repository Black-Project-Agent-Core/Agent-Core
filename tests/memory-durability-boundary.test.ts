import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  decodeMemoryRemoteEnvelope,
  decodeMemoryRemoteManifest,
  decryptMemoryRemoteEnvelope,
  memoryRemoteGenerationPath,
  memoryRemoteHeadPath,
  memoryRemoteObjectPath,
  memoryRemoteScopeId,
} from '../src/memory/remote-journal.js';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import { MemoryRemoteHydrator } from '../src/memory/remote-hydrator.js';
import type { MemoryRemoteTransport } from '../src/memory/remote-transport.js';
import { projectMemoryLogicalState, hashMemoryLogicalState, serializeMemoryLogicalState } from '../src/memory/logical-state-hash.js';
import { MemoryService } from '../src/memory/service.js';
import { MemoryStore } from '../src/memory/store.js';
import type { MemoryScope } from '../src/memory/types.js';
import { MemoryWorkerClient } from '../src/memory/worker-client.js';

const roots: string[] = [];
const services: MemoryService[] = [];
const stores: MemoryStore[] = [];

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-phase5-durability-${label}-`));
  roots.push(root);
  return root;
}

class FakeMemoryRemoteTransport implements MemoryRemoteTransport {
  readonly remoteFiles = new Map<string, Uint8Array>();
  readonly localFiles = new Map<string, Uint8Array>();
  remoteGitHead: string | null = null;
  fetchedGitHead: string | null = null;
  localCommit: string | null = null;
  pushError: (Error & { code?: string }) | undefined;
  private commitCounter = 0;

  async ensureCheckout(): Promise<{ cwd: string }> {
    return { cwd: '/fake-phase5-memory-remote' };
  }

  async fetch(): Promise<void> {
    this.localFiles.clear();
    for (const [key, value] of this.remoteFiles) this.localFiles.set(key, Uint8Array.from(value));
    this.fetchedGitHead = this.remoteGitHead;
  }

  async currentRemoteHead(): Promise<string | null> {
    return this.fetchedGitHead;
  }

  async readFile(relativePath: string): Promise<Uint8Array | null> {
    const value = this.localFiles.get(relativePath);
    return value ? Uint8Array.from(value) : null;
  }

  async writeFiles(files: readonly { relativePath: string; bytes: Uint8Array }[]): Promise<void> {
    for (const file of files) this.localFiles.set(file.relativePath, Uint8Array.from(file.bytes));
  }

  async commit(): Promise<string> {
    this.commitCounter += 1;
    this.localCommit = this.commitCounter.toString(16).padStart(40, '0');
    return this.localCommit;
  }

  async pushNonForce(): Promise<void> {
    if (this.pushError) throw this.pushError;
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

function codedError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

async function serviceFixture(label: string, remoteEnabled: boolean) {
  const root = await tempRoot(label);
  const dbPath = path.join(root, 'memory.sqlite');
  const keyPath = path.join(root, 'memory-remote.key');
  await writeFile(keyPath, Buffer.alloc(32, 0x5a), { mode: 0o600 });
  const config = loadConfig(remoteEnabled ? {
    AGENT_CORE_MEMORY_DB_PATH: dbPath,
    AGENT_CORE_MEMORY_REMOTE_ENABLED: 'true',
    AGENT_CORE_MEMORY_REMOTE_OWNER: 'Black-Project-Agent-Core',
    AGENT_CORE_MEMORY_REMOTE_REPO: 'Agent-Core-Memory-Remote',
    AGENT_CORE_MEMORY_REMOTE_BRANCH: 'memory/main',
    AGENT_CORE_MEMORY_REMOTE_KEY_FILE: keyPath,
    AGENT_CORE_MEMORY_REMOTE_WORK_ROOT: path.join(root, 'remote-work'),
  } : {
    AGENT_CORE_MEMORY_DB_PATH: dbPath,
  }, root).memory;
  const transport = new FakeMemoryRemoteTransport();
  const service = new MemoryService(config, undefined, { remoteTransport: transport });
  services.push(service);
  return { root, dbPath, keyPath, config, transport, service };
}

async function logicalProjection(dbPath: string, scope: MemoryScope) {
  const client = new MemoryWorkerClient();
  const store = new MemoryStore(client);
  stores.push(store);
  await store.open({ dbPath });
  return { client, store, projection: await projectMemoryLogicalState(client, scope) };
}

async function latestRemoteCheckpoint(
  transport: FakeMemoryRemoteTransport,
  crypto: MemoryRemoteCrypto,
  scope: MemoryScope,
) {
  await transport.fetch();
  const scopeId = memoryRemoteScopeId(scope);
  const headBytes = await transport.readFile(memoryRemoteHeadPath(scopeId));
  if (!headBytes) throw new Error('missing logical head');
  const generationId = Buffer.from(headBytes).toString('utf8').trim();
  const manifestBytes = await transport.readFile(memoryRemoteGenerationPath(scopeId, generationId));
  if (!manifestBytes) throw new Error('missing manifest');
  const manifest = decodeMemoryRemoteManifest(manifestBytes);
  const objectBytes = await transport.readFile(memoryRemoteObjectPath(scopeId, manifest.objectIds[0]!));
  if (!objectBytes) throw new Error('missing object');
  const envelope = decodeMemoryRemoteEnvelope(objectBytes);
  const plaintext = decryptMemoryRemoteEnvelope(crypto, envelope);
  return { generationId, manifest, envelope, plaintext };
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

const scope: MemoryScope = {
  principalId: 'phase5-principal',
  projectId: 'phase5-project',
  threadId: 'phase5-thread',
  resourceId: 'phase5-resource',
};

describe('production memory durability boundary', () => {
  it('returns NOT_REQUIRED without fabricating remote state when Memory Remote is disabled', async () => {
    const f = await serviceFixture('disabled', false);
    await f.service.commit({
      scope,
      canonicalKey: 'phase5.disabled.local',
      kind: 'decision',
      value: 'Local-only durable decision.',
      sourceType: 'test',
    });

    const result = await f.service.syncDurableBoundary(scope, 'continuity_checkpoint');
    expect(result).toEqual({ required: false, state: 'NOT_REQUIRED', reason: 'continuity_checkpoint' });
    expect(await f.service.getRemoteState(scope)).toBeNull();
    expect(f.transport.remoteFiles.size).toBe(0);
  });

  it('writes verified encrypted logical checkpoints with the prior generation as predecessor and hydrates the latest state exactly', async () => {
    const f = await serviceFixture('success', true);
    const crypto = await MemoryRemoteCrypto.fromKeyFile(f.keyPath);

    await f.service.commit({
      scope,
      canonicalKey: 'phase5.remote.first',
      kind: 'decision',
      value: 'First remote durable decision.',
      sourceType: 'test',
    });
    const first = await f.service.syncDurableBoundary(scope, 'continuity_checkpoint');
    expect(first).toMatchObject({ required: true, state: 'REMOTE_SYNCED', reason: 'continuity_checkpoint' });

    const firstCheckpoint = await latestRemoteCheckpoint(f.transport, crypto, scope);
    expect(firstCheckpoint.envelope.kind).toBe('recovery-checkpoint');
    expect(firstCheckpoint.envelope.previousGeneration).toBeNull();
    const firstLogical = await logicalProjection(f.dbPath, scope);
    expect(firstCheckpoint.envelope.logicalStateHash).toBe(hashMemoryLogicalState(firstLogical.projection));
    expect(Buffer.from(firstCheckpoint.plaintext).toString('utf8')).toBe(serializeMemoryLogicalState(firstLogical.projection));

    await f.service.commit({
      scope,
      canonicalKey: 'phase5.remote.second',
      kind: 'artifact',
      value: 'Second remote durable artifact.',
      sourceType: 'test',
    });
    const second = await f.service.syncDurableBoundary(scope, 'execution_artifact');
    expect(second).toMatchObject({ required: true, state: 'REMOTE_SYNCED', reason: 'execution_artifact' });
    const secondCheckpoint = await latestRemoteCheckpoint(f.transport, crypto, scope);
    expect(secondCheckpoint.envelope.previousGeneration).toBe(firstCheckpoint.generationId);
    expect(secondCheckpoint.manifest.previousGeneration).toBe(firstCheckpoint.generationId);

    const expected = await logicalProjection(f.dbPath, scope);
    expect(secondCheckpoint.envelope.logicalStateHash).toBe(hashMemoryLogicalState(expected.projection));
    expect(Buffer.from(secondCheckpoint.plaintext).toString('utf8')).toBe(serializeMemoryLogicalState(expected.projection));

    await f.service.close();
    services.splice(services.indexOf(f.service), 1);
    const restoredPath = path.join(f.root, 'restored.sqlite');
    const hydrated = await new MemoryRemoteHydrator(f.transport, crypto).hydrate(scope, restoredPath);
    expect(hydrated).toMatchObject({ state: 'REMOTE_HYDRATED', generationId: secondCheckpoint.generationId });
    const restored = await logicalProjection(restoredPath, scope);
    expect(restored.projection).toEqual(expected.projection);
  });

  it('preserves local semantic truth and records remote unavailability when required push/readback cannot complete', async () => {
    const f = await serviceFixture('failure', true);
    const before = await f.service.commit({
      scope,
      canonicalKey: 'phase5.remote.failure',
      kind: 'failure',
      value: 'Local failure evidence survives remote outage.',
      sourceType: 'test',
    });
    f.transport.pushError = codedError('NETWORK_UNAVAILABLE');

    await expect(f.service.syncDurableBoundary(scope, 'execution_failure')).rejects.toThrow(/MEMORY_REMOTE_UNAVAILABLE/);

    expect(await f.service.getMemory(scope, before.memoryId)).toMatchObject({ memoryId: before.memoryId });
    const state = await f.service.getRemoteState(scope);
    expect(state?.durabilityState).toBe('REMOTE_UNAVAILABLE');
    expect(state?.durabilityState).not.toBe('REMOTE_SYNCED');
  });
});
