import { randomUUID } from 'node:crypto';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { MemoryCognitionLedger } from './cognition-ledger.js';
import {
  hashMemoryLogicalState,
  projectMemoryLogicalState,
  type MemoryLogicalStateProjection,
} from './logical-state-hash.js';
import type { MemoryRemoteCrypto } from './remote-crypto.js';
import {
  decodeMemoryRemoteEnvelope,
  decodeMemoryRemoteManifest,
  decryptMemoryRemoteEnvelope,
  memoryRemoteGenerationPath,
  memoryRemoteHeadPath,
  memoryRemoteObjectPath,
  memoryRemoteScopeId,
} from './remote-journal.js';
import {
  MEMORY_REMOTE_FORMAT_PATH,
  validateMemoryRemoteFormat,
} from './remote-sync.js';
import type { MemoryRemoteTransport } from './remote-transport.js';
import { MemoryStore } from './store.js';
import type { MemoryHydrationState, MemoryScope } from './types.js';
import { MemoryWorkerClient } from './worker-client.js';

const HEX_40 = /^[0-9a-f]{40}$/i;
const HEX_64 = /^[0-9a-f]{64}$/;
const MAX_MANIFEST_CHAIN = 4096;

export class MemoryRemoteHydrationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hydrationState: Exclude<MemoryHydrationState, 'REMOTE_EMPTY_CONFIRMED' | 'REMOTE_HYDRATED'>,
  ) {
    super(`${code}: ${message}`);
    this.name = 'MemoryRemoteHydrationError';
  }
}

function codeOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function mapTransportError(error: unknown): MemoryRemoteHydrationError {
  if (error instanceof MemoryRemoteHydrationError) return error;
  const code = codeOf(error);
  if (code === 'GITHUB_GIT_AUTH_FAILED' || code === 'GITHUB_CREDENTIAL_MISSING' || code === 'GITHUB_CREDENTIAL_EMPTY') {
    return new MemoryRemoteHydrationError('MEMORY_REMOTE_AUTH_FAILED', 'Memory Remote authentication failed', 'REMOTE_AUTH_FAILED');
  }
  return new MemoryRemoteHydrationError(
    'MEMORY_REMOTE_UNAVAILABLE',
    code ? `${code}: Memory Remote transport failed` : (error instanceof Error ? error.message : String(error)),
    'REMOTE_UNAVAILABLE',
  );
}

function integrityError(code: string, message: string): MemoryRemoteHydrationError {
  return new MemoryRemoteHydrationError(code, message, 'REMOTE_INTEGRITY_FAILED');
}

function replayError(error: unknown): MemoryRemoteHydrationError {
  if (error instanceof MemoryRemoteHydrationError) return error;
  return new MemoryRemoteHydrationError(
    'MEMORY_REMOTE_REPLAY_FAILED',
    error instanceof Error ? error.message : String(error),
    'REMOTE_REPLAY_FAILED',
  );
}

function decodeLogicalHead(bytes: Uint8Array): string {
  const value = Buffer.from(bytes).toString('utf8').trim();
  if (!HEX_64.test(value)) throw integrityError('MEMORY_REMOTE_HEAD_INVALID', 'Memory Remote logical HEAD is malformed');
  return value;
}

function parseProjection(bytes: Uint8Array): MemoryLogicalStateProjection {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    throw new MemoryRemoteHydrationError('MEMORY_REMOTE_REPLAY_FAILED', 'Recovery checkpoint payload is not valid JSON', 'REMOTE_REPLAY_FAILED');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MemoryRemoteHydrationError('MEMORY_REMOTE_REPLAY_FAILED', 'Recovery checkpoint projection is not an object', 'REMOTE_REPLAY_FAILED');
  }
  const projection = value as Partial<MemoryLogicalStateProjection>;
  const tableKeys: Array<keyof MemoryLogicalStateProjection> = [
    'events', 'items', 'revisions', 'anchors', 'edges', 'conflicts', 'nodeMetadata', 'writeDecisions',
    'edgeEvents', 'continuityTasks', 'continuityDependencies', 'continuityCheckpoints', 'continuityFrontier',
  ];
  if (projection.formatVersion !== 1 || !projection.scope || typeof projection.scope.principalId !== 'string' || typeof projection.scope.projectId !== 'string') {
    throw new MemoryRemoteHydrationError('MEMORY_REMOTE_REPLAY_FAILED', 'Recovery checkpoint projection scope/format is invalid', 'REMOTE_REPLAY_FAILED');
  }
  for (const key of tableKeys) {
    if (!Array.isArray(projection[key])) {
      throw new MemoryRemoteHydrationError('MEMORY_REMOTE_REPLAY_FAILED', `Recovery checkpoint table ${String(key)} is invalid`, 'REMOTE_REPLAY_FAILED');
    }
  }
  return projection as MemoryLogicalStateProjection;
}

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

async function atomicInstall(tempDbPath: string, destinationDbPath: string): Promise<void> {
  await mkdir(path.dirname(destinationDbPath), { recursive: true });
  const backupPath = `${destinationDbPath}.pre-hydrate-${randomUUID()}`;
  const hadDestination = await exists(destinationDbPath);
  try {
    if (hadDestination) await rename(destinationDbPath, backupPath);
    await rename(tempDbPath, destinationDbPath);
    if (hadDestination) await rm(backupPath, { force: true });
  } catch (error) {
    if (await exists(destinationDbPath)) await rm(destinationDbPath, { force: true }).catch(() => undefined);
    if (hadDestination && await exists(backupPath)) await rename(backupPath, destinationDbPath).catch(() => undefined);
    throw error;
  }
}

export class MemoryRemoteHydrator {
  constructor(
    readonly transport: MemoryRemoteTransport,
    readonly crypto: MemoryRemoteCrypto,
  ) {}

  async hydrate(
    scope: MemoryScope,
    destinationDbPath: string,
  ): Promise<
    | { state: 'REMOTE_EMPTY_CONFIRMED'; remoteHead: string | null }
    | { state: 'REMOTE_HYDRATED'; generationId: string; logicalStateHash: string; remoteHead: string }
  > {
    if (!scope.principalId?.trim() || !destinationDbPath?.trim() || destinationDbPath === ':memory:') {
      throw new MemoryRemoteHydrationError('MEMORY_REMOTE_HYDRATION_INPUT_INVALID', 'Hydration scope/destination is invalid', 'REMOTE_REPLAY_FAILED');
    }

    try {
      await this.transport.fetch();
    } catch (error) {
      throw mapTransportError(error);
    }

    let remoteHead: string | null;
    try {
      remoteHead = await this.transport.currentRemoteHead();
    } catch (error) {
      throw mapTransportError(error);
    }
    if (remoteHead !== null && !HEX_40.test(remoteHead)) {
      throw integrityError('MEMORY_REMOTE_GIT_HEAD_INVALID', 'Fetched remote Git head is malformed');
    }

    const scopeId = memoryRemoteScopeId(scope);
    let formatBytes: Uint8Array | null;
    let headBytes: Uint8Array | null;
    try {
      [formatBytes, headBytes] = await Promise.all([
        this.transport.readFile(MEMORY_REMOTE_FORMAT_PATH),
        this.transport.readFile(memoryRemoteHeadPath(scopeId)),
      ]);
    } catch (error) {
      throw mapTransportError(error);
    }

    if (!headBytes) {
      if (formatBytes) {
        try { validateMemoryRemoteFormat(formatBytes); }
        catch (error) { throw integrityError('MEMORY_REMOTE_FORMAT_INVALID', error instanceof Error ? error.message : String(error)); }
      }
      return { state: 'REMOTE_EMPTY_CONFIRMED', remoteHead };
    }
    if (!formatBytes) throw integrityError('MEMORY_REMOTE_FORMAT_MISSING', 'Memory Remote format.json is missing');
    try { validateMemoryRemoteFormat(formatBytes); }
    catch (error) { throw integrityError('MEMORY_REMOTE_FORMAT_INVALID', error instanceof Error ? error.message : String(error)); }
    if (!remoteHead) throw integrityError('MEMORY_REMOTE_GIT_HEAD_MISSING', 'Logical scope HEAD exists without a fetched Git head');

    const generationId = decodeLogicalHead(headBytes);
    let latestManifest;
    try {
      const manifestBytes = await this.transport.readFile(memoryRemoteGenerationPath(scopeId, generationId));
      if (!manifestBytes) throw integrityError('MEMORY_REMOTE_MANIFEST_MISSING', 'Latest generation manifest is missing');
      latestManifest = decodeMemoryRemoteManifest(manifestBytes);
      if (latestManifest.scopeId !== scopeId || latestManifest.generationId !== generationId) {
        throw integrityError('MEMORY_REMOTE_MANIFEST_MISMATCH', 'Latest generation manifest identity does not match the scope HEAD');
      }
      await this.verifyManifestChain(scopeId, latestManifest.previousGeneration);
    } catch (error) {
      if (error instanceof MemoryRemoteHydrationError) throw error;
      throw integrityError('MEMORY_REMOTE_INTEGRITY_FAILED', error instanceof Error ? error.message : String(error));
    }

    const objects = [];
    try {
      for (const objectId of latestManifest.objectIds) {
        const objectBytes = await this.transport.readFile(memoryRemoteObjectPath(scopeId, objectId));
        if (!objectBytes) throw integrityError('MEMORY_REMOTE_OBJECT_MISSING', `Remote object ${objectId} is missing`);
        const object = decodeMemoryRemoteEnvelope(objectBytes);
        if (object.objectId !== objectId || object.scopeId !== scopeId) {
          throw integrityError('MEMORY_REMOTE_OBJECT_MISMATCH', 'Remote object identity/scope mismatch');
        }
        objects.push(object);
      }
    } catch (error) {
      if (error instanceof MemoryRemoteHydrationError) throw error;
      throw integrityError('MEMORY_REMOTE_INTEGRITY_FAILED', error instanceof Error ? error.message : String(error));
    }

    const checkpoint = objects
      .filter((object) => object.kind === 'recovery-checkpoint')
      .sort((left, right) => right.createdAt - left.createdAt || right.objectId.localeCompare(left.objectId))[0];
    if (!checkpoint) {
      throw new MemoryRemoteHydrationError('MEMORY_REMOTE_CHECKPOINT_MISSING', 'Latest generation has no recovery checkpoint', 'REMOTE_REPLAY_FAILED');
    }
    if (checkpoint.logicalStateHash !== latestManifest.logicalStateHash) {
      throw integrityError('MEMORY_REMOTE_LOGICAL_HASH_MISMATCH', 'Checkpoint and manifest logical-state hashes differ');
    }

    let plaintext: Uint8Array;
    try {
      plaintext = decryptMemoryRemoteEnvelope(this.crypto, checkpoint);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/DECRYPT|AUTH|KEY/i.test(message)) {
        throw new MemoryRemoteHydrationError('MEMORY_REMOTE_DECRYPT_FAILED', message, 'REMOTE_DECRYPT_FAILED');
      }
      throw integrityError('MEMORY_REMOTE_INTEGRITY_FAILED', message);
    }

    const projection = parseProjection(plaintext);
    if (projection.scope.principalId !== scope.principalId || projection.scope.projectId !== (scope.projectId ?? '')) {
      throw new MemoryRemoteHydrationError('MEMORY_REMOTE_REPLAY_SCOPE_MISMATCH', 'Recovery checkpoint projection belongs to another scope', 'REMOTE_REPLAY_FAILED');
    }
    const projectedHash = hashMemoryLogicalState(projection);
    if (projectedHash !== latestManifest.logicalStateHash) {
      throw integrityError('MEMORY_REMOTE_LOGICAL_HASH_MISMATCH', 'Recovery checkpoint logical-state hash does not match the manifest');
    }

    const destination = path.resolve(destinationDbPath);
    const tempDbPath = path.join(path.dirname(destination), `.${path.basename(destination)}.hydrate-${randomUUID()}.sqlite`);
    await mkdir(path.dirname(destination), { recursive: true });
    let store: MemoryStore | undefined;
    let installed = false;
    try {
      const client = new MemoryWorkerClient();
      store = new MemoryStore(client);
      await store.open({ dbPath: tempDbPath });
      try {
        await store.materializeLogicalProjection(projection);
        await new MemoryCognitionLedger(client).setRemoteState({
          scope,
          durabilityState: 'REMOTE_SYNCED',
          hydrationState: 'REMOTE_HYDRATED',
          remoteGeneration: latestManifest.generationId,
          remoteHead: remoteHead.toLowerCase(),
          logicalStateHash: latestManifest.logicalStateHash,
        });
      } catch (error) {
        throw replayError(error);
      }

      const integrity = await client.integrity();
      if (!integrity.ok) throw integrityError('MEMORY_REMOTE_INTEGRITY_FAILED', `Hydrated SQLite integrity_check failed: ${integrity.result}`);
      const restoredProjection = await projectMemoryLogicalState(client, scope);
      if (hashMemoryLogicalState(restoredProjection) !== latestManifest.logicalStateHash) {
        throw integrityError('MEMORY_REMOTE_LOGICAL_HASH_MISMATCH', 'Materialized SQLite logical-state hash differs from the remote manifest');
      }
      await store.close();
      store = undefined;
      await rm(`${tempDbPath}-wal`, { force: true }).catch(() => undefined);
      await rm(`${tempDbPath}-shm`, { force: true }).catch(() => undefined);
      await atomicInstall(tempDbPath, destination);
      installed = true;
    } catch (error) {
      if (error instanceof MemoryRemoteHydrationError) throw error;
      throw replayError(error);
    } finally {
      if (store) {
        try { await store.close(); } catch {}
      }
      if (!installed) {
        await rm(tempDbPath, { force: true }).catch(() => undefined);
        await rm(`${tempDbPath}-wal`, { force: true }).catch(() => undefined);
        await rm(`${tempDbPath}-shm`, { force: true }).catch(() => undefined);
      }
    }

    return {
      state: 'REMOTE_HYDRATED',
      generationId: latestManifest.generationId,
      logicalStateHash: latestManifest.logicalStateHash,
      remoteHead: remoteHead.toLowerCase(),
    };
  }

  private async verifyManifestChain(scopeId: string, previousGeneration: string | null): Promise<void> {
    const visited = new Set<string>();
    let generation = previousGeneration;
    let count = 0;
    while (generation) {
      if (++count > MAX_MANIFEST_CHAIN || visited.has(generation)) {
        throw integrityError('MEMORY_REMOTE_MANIFEST_CHAIN_INVALID', 'Memory Remote manifest chain is cyclic or exceeds the bound');
      }
      visited.add(generation);
      const bytes = await this.transport.readFile(memoryRemoteGenerationPath(scopeId, generation));
      if (!bytes) throw integrityError('MEMORY_REMOTE_MANIFEST_MISSING', `Predecessor manifest ${generation} is missing`);
      let manifest;
      try { manifest = decodeMemoryRemoteManifest(bytes); }
      catch (error) { throw integrityError('MEMORY_REMOTE_MANIFEST_INVALID', error instanceof Error ? error.message : String(error)); }
      if (manifest.scopeId !== scopeId || manifest.generationId !== generation) {
        throw integrityError('MEMORY_REMOTE_MANIFEST_CHAIN_INVALID', 'Predecessor manifest identity/scope mismatch');
      }
      generation = manifest.previousGeneration;
    }
  }
}
