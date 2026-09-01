import type { MemoryCognitionLedger } from './cognition-ledger.js';
import {
  createMemoryRemoteManifest,
  decodeMemoryRemoteEnvelope,
  decodeMemoryRemoteManifest,
  encodeMemoryRemoteEnvelope,
  encodeMemoryRemoteManifest,
  memoryRemoteGenerationPath,
  memoryRemoteHeadPath,
  memoryRemoteObjectPath,
  memoryRemoteScopeId,
  validateMemoryRemoteEnvelope,
  validateMemoryRemoteManifest,
} from './remote-journal.js';
import type { MemoryRemoteTransport } from './remote-transport.js';
import type { MemoryRemoteEnvelope, MemoryRemoteManifest } from './remote-types.js';
import type { MemoryRemoteDurabilityState, MemoryScope } from './types.js';

export const MEMORY_REMOTE_FORMAT_PATH = 'format.json';
export const MEMORY_REMOTE_FORMAT_BYTES = Buffer.from(
  '{"format":"agent-core-private-memory-remote","formatVersion":1}\n',
  'utf8',
);

const HEX_64 = /^[0-9a-f]{64}$/;

export interface MemoryRemoteSynchronizerOptions {
  maxRetryAttempts?: number;
}

export class MemoryRemoteSyncError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly durabilityState: Exclude<MemoryRemoteDurabilityState, 'REMOTE_SYNCED'>,
  ) {
    super(`${code}: ${message}`);
    this.name = 'MemoryRemoteSyncError';
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function nonFastForward(error: unknown): boolean {
  return errorCode(error) === 'GITHUB_GIT_NON_FAST_FORWARD';
}

function unavailable(error: unknown): MemoryRemoteSyncError {
  if (error instanceof MemoryRemoteSyncError) return error;
  const code = errorCode(error);
  return new MemoryRemoteSyncError(
    'MEMORY_REMOTE_UNAVAILABLE',
    code ? `${code}: remote operation failed` : (error instanceof Error ? error.message : String(error)),
    'REMOTE_UNAVAILABLE',
  );
}

function conflict(message: string): MemoryRemoteSyncError {
  return new MemoryRemoteSyncError('MEMORY_REMOTE_CONFLICT', message, 'REMOTE_CONFLICT');
}

function readbackMissing(message: string): MemoryRemoteSyncError {
  return new MemoryRemoteSyncError('MEMORY_REMOTE_READBACK_MISSING', message, 'REMOTE_UNAVAILABLE');
}

export function validateMemoryRemoteFormat(bytes: Uint8Array): void {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    throw new MemoryRemoteSyncError('MEMORY_REMOTE_FORMAT_INVALID', 'Memory Remote format.json is malformed', 'REMOTE_UNAVAILABLE');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MemoryRemoteSyncError('MEMORY_REMOTE_FORMAT_INVALID', 'Memory Remote format.json is malformed', 'REMOTE_UNAVAILABLE');
  }
  const record = value as Record<string, unknown>;
  if (
    record.format !== 'agent-core-private-memory-remote'
    || record.formatVersion !== 1
    || Object.keys(record).sort().join(',') !== 'format,formatVersion'
  ) {
    throw new MemoryRemoteSyncError('MEMORY_REMOTE_FORMAT_INVALID', 'Memory Remote format version is unsupported', 'REMOTE_UNAVAILABLE');
  }
}

function decodeLogicalHead(bytes: Uint8Array | null): string | null {
  if (!bytes) return null;
  const value = Buffer.from(bytes).toString('utf8').trim();
  if (!HEX_64.test(value)) {
    throw new MemoryRemoteSyncError('MEMORY_REMOTE_HEAD_INVALID', 'Memory Remote logical HEAD is malformed', 'REMOTE_UNAVAILABLE');
  }
  return value;
}

function validateSyncInput(input: {
  scope: MemoryScope;
  object: MemoryRemoteEnvelope;
  manifest: MemoryRemoteManifest;
}): { scopeId: string; object: MemoryRemoteEnvelope; manifest: MemoryRemoteManifest } {
  const object = validateMemoryRemoteEnvelope(input.object);
  const manifest = validateMemoryRemoteManifest(input.manifest);
  const scopeId = memoryRemoteScopeId(input.scope);
  if (object.scopeId !== scopeId || manifest.scopeId !== scopeId) {
    throw new MemoryRemoteSyncError('MEMORY_REMOTE_SCOPE_MISMATCH', 'Remote object/manifest scope does not match the authenticated scope', 'LOCAL_COMMITTED');
  }
  if (!manifest.objectIds.includes(object.objectId)) {
    throw new MemoryRemoteSyncError('MEMORY_REMOTE_MANIFEST_OBJECT_MISSING', 'Manifest does not reference the supplied remote object', 'LOCAL_COMMITTED');
  }
  if (
    object.logicalStateHash !== manifest.logicalStateHash
    || object.previousGeneration !== manifest.previousGeneration
  ) {
    throw new MemoryRemoteSyncError('MEMORY_REMOTE_GENERATION_INVALID', 'Remote object and manifest generation metadata disagree', 'LOCAL_COMMITTED');
  }
  return { scopeId, object, manifest };
}

export class MemoryRemoteSynchronizer {
  private readonly maxRetryAttempts: number;

  constructor(
    readonly transport: MemoryRemoteTransport,
    readonly ledger: MemoryCognitionLedger,
    options: MemoryRemoteSynchronizerOptions = {},
  ) {
    const retries = options.maxRetryAttempts ?? 3;
    if (!Number.isInteger(retries) || retries < 0 || retries > 16) {
      throw new Error('MEMORY_REMOTE_MAX_RETRIES_INVALID');
    }
    this.maxRetryAttempts = retries;
  }

  async sync(input: {
    scope: MemoryScope;
    object: MemoryRemoteEnvelope;
    manifest: MemoryRemoteManifest;
  }): Promise<{
    state: 'REMOTE_SYNCED';
    generationId: string;
    remoteHead: string;
    logicalStateHash: string;
  }> {
    const validated = validateSyncInput(input);
    await this.ledger.setRemoteState({
      scope: input.scope,
      durabilityState: 'REMOTE_PENDING',
      remoteGeneration: validated.manifest.previousGeneration ?? undefined,
      logicalStateHash: validated.manifest.logicalStateHash,
    });

    let attempt = 0;
    let activeManifest = validated.manifest;
    while (true) {
      try {
        return await this.syncAttempt(input.scope, validated.scopeId, validated.object, activeManifest);
      } catch (error) {
        if (nonFastForward(error) && attempt < this.maxRetryAttempts) {
          attempt += 1;
          try {
            activeManifest = await this.reconcileAfterNonFastForward(validated.scopeId, activeManifest);
          } catch (recoveryError) {
            const classified = recoveryError instanceof MemoryRemoteSyncError ? recoveryError : unavailable(recoveryError);
            await this.recordFailure(input.scope, activeManifest, classified);
            throw classified;
          }
          continue;
        }
        const classified = error instanceof MemoryRemoteSyncError ? error : unavailable(error);
        await this.recordFailure(input.scope, activeManifest, classified);
        throw classified;
      }
    }
  }

  private async reconcileAfterNonFastForward(
    scopeId: string,
    localManifest: MemoryRemoteManifest,
  ): Promise<MemoryRemoteManifest> {
    await this.transport.fetch();
    await this.transport.resetToRemoteHead();

    const formatBytes = await this.transport.readFile(MEMORY_REMOTE_FORMAT_PATH);
    if (!formatBytes) throw readbackMissing('Memory Remote format.json is missing during writer reconciliation');
    validateMemoryRemoteFormat(formatBytes);

    const remoteGeneration = decodeLogicalHead(await this.transport.readFile(memoryRemoteHeadPath(scopeId)));
    if (!remoteGeneration) {
      throw conflict('Memory Remote logical HEAD disappeared during writer reconciliation');
    }
    const remoteManifestBytes = await this.transport.readFile(memoryRemoteGenerationPath(scopeId, remoteGeneration));
    if (!remoteManifestBytes) throw readbackMissing('Concurrent writer generation manifest is missing');
    const remoteManifest = decodeMemoryRemoteManifest(remoteManifestBytes);
    if (remoteManifest.scopeId !== scopeId || remoteManifest.generationId !== remoteGeneration) {
      throw new MemoryRemoteSyncError(
        'MEMORY_REMOTE_INTEGRITY_FAILED',
        'Concurrent writer generation manifest failed scope/generation verification',
        'REMOTE_UNAVAILABLE',
      );
    }
    if (remoteManifest.logicalStateHash !== localManifest.logicalStateHash) {
      throw conflict('Concurrent writers produced different logical-state hashes; semantic reconciliation is required');
    }

    const createdAt = Math.max(remoteManifest.createdAt, localManifest.createdAt) + 1;
    if (!Number.isSafeInteger(createdAt)) {
      throw new MemoryRemoteSyncError(
        'MEMORY_REMOTE_GENERATION_INVALID',
        'Reconciled generation timestamp exceeds the safe integer bound',
        'REMOTE_UNAVAILABLE',
      );
    }
    return createMemoryRemoteManifest({
      scopeId,
      previousGeneration: remoteGeneration,
      objectIds: [...remoteManifest.objectIds, ...localManifest.objectIds],
      logicalStateHash: localManifest.logicalStateHash,
      createdAt,
    });
  }

  private async syncAttempt(
    scope: MemoryScope,
    scopeId: string,
    object: MemoryRemoteEnvelope,
    manifest: MemoryRemoteManifest,
  ): Promise<{
    state: 'REMOTE_SYNCED';
    generationId: string;
    remoteHead: string;
    logicalStateHash: string;
  }> {
    await this.transport.fetch();
    await this.transport.currentRemoteHead();

    const formatBefore = await this.transport.readFile(MEMORY_REMOTE_FORMAT_PATH);
    if (formatBefore) validateMemoryRemoteFormat(formatBefore);

    const headPath = memoryRemoteHeadPath(scopeId);
    const remoteGeneration = decodeLogicalHead(await this.transport.readFile(headPath));
    if (remoteGeneration !== manifest.previousGeneration) {
      throw conflict(
        `Remote generation ${remoteGeneration ?? '<empty>'} does not match expected predecessor ${manifest.previousGeneration ?? '<empty>'}`,
      );
    }

    if (remoteGeneration) {
      const predecessorBytes = await this.transport.readFile(memoryRemoteGenerationPath(scopeId, remoteGeneration));
      if (!predecessorBytes) throw readbackMissing('Expected predecessor manifest is missing');
      const predecessor = decodeMemoryRemoteManifest(predecessorBytes);
      if (predecessor.scopeId !== scopeId || predecessor.generationId !== remoteGeneration) {
        throw new MemoryRemoteSyncError('MEMORY_REMOTE_INTEGRITY_FAILED', 'Predecessor manifest failed scope/generation verification', 'REMOTE_UNAVAILABLE');
      }
    }

    const objectPath = memoryRemoteObjectPath(scopeId, object.objectId);
    const manifestPath = memoryRemoteGenerationPath(scopeId, manifest.generationId);
    const objectBytes = encodeMemoryRemoteEnvelope(object);
    const manifestBytes = encodeMemoryRemoteManifest(manifest);
    await this.assertImmutableFile(objectPath, objectBytes, 'object');
    await this.assertImmutableFile(manifestPath, manifestBytes, 'manifest');
    await this.assertManifestObjectsAvailable(scopeId, manifest, object.objectId, objectBytes);

    const writes: Array<{ relativePath: string; bytes: Uint8Array }> = [
      { relativePath: objectPath, bytes: objectBytes },
      { relativePath: manifestPath, bytes: manifestBytes },
      { relativePath: headPath, bytes: Buffer.from(`${manifest.generationId}\n`, 'utf8') },
    ];
    if (!formatBefore) writes.unshift({ relativePath: MEMORY_REMOTE_FORMAT_PATH, bytes: MEMORY_REMOTE_FORMAT_BYTES });
    await this.transport.writeFiles(writes);
    await this.transport.commit(`memory remote generation ${manifest.generationId.slice(0, 12)}`);
    await this.transport.pushNonForce();

    await this.transport.fetch();
    const remoteHead = await this.transport.currentRemoteHead();
    if (!remoteHead || !/^[0-9a-f]{40}$/i.test(remoteHead)) {
      throw readbackMissing('Remote Git head is unavailable after push');
    }

    const formatAfter = await this.transport.readFile(MEMORY_REMOTE_FORMAT_PATH);
    if (!formatAfter) throw readbackMissing('format.json is missing after push');
    validateMemoryRemoteFormat(formatAfter);

    const readbackGeneration = decodeLogicalHead(await this.transport.readFile(headPath));
    if (readbackGeneration !== manifest.generationId) {
      throw conflict('Remote logical HEAD changed or failed readback verification after push');
    }

    const readbackManifestBytes = await this.transport.readFile(manifestPath);
    if (!readbackManifestBytes) throw readbackMissing('Remote generation manifest is missing after push');
    const readbackManifest = decodeMemoryRemoteManifest(readbackManifestBytes);
    if (!bytesEqual(encodeMemoryRemoteManifest(readbackManifest), manifestBytes)) {
      throw new MemoryRemoteSyncError('MEMORY_REMOTE_READBACK_MISMATCH', 'Remote generation manifest differs after push', 'REMOTE_UNAVAILABLE');
    }

    for (const objectId of manifest.objectIds) {
      const readbackObjectBytes = await this.transport.readFile(memoryRemoteObjectPath(scopeId, objectId));
      if (!readbackObjectBytes) throw readbackMissing(`Remote object ${objectId} is missing after push`);
      const readbackObject = decodeMemoryRemoteEnvelope(readbackObjectBytes);
      if (readbackObject.objectId !== objectId || readbackObject.scopeId !== scopeId) {
        throw new MemoryRemoteSyncError('MEMORY_REMOTE_READBACK_MISMATCH', 'Remote object identity differs after push', 'REMOTE_UNAVAILABLE');
      }
      if (objectId === object.objectId && !bytesEqual(encodeMemoryRemoteEnvelope(readbackObject), objectBytes)) {
        throw new MemoryRemoteSyncError('MEMORY_REMOTE_READBACK_MISMATCH', 'Supplied remote object differs after push', 'REMOTE_UNAVAILABLE');
      }
    }

    await this.ledger.setRemoteState({
      scope,
      durabilityState: 'REMOTE_SYNCED',
      remoteGeneration: manifest.generationId,
      remoteHead: remoteHead.toLowerCase(),
      logicalStateHash: manifest.logicalStateHash,
    });
    return {
      state: 'REMOTE_SYNCED',
      generationId: manifest.generationId,
      remoteHead: remoteHead.toLowerCase(),
      logicalStateHash: manifest.logicalStateHash,
    };
  }

  private async assertImmutableFile(relativePath: string, expected: Uint8Array, label: string): Promise<void> {
    const current = await this.transport.readFile(relativePath);
    if (current && !bytesEqual(current, expected)) {
      throw new MemoryRemoteSyncError(
        'MEMORY_REMOTE_IMMUTABLE_OBJECT_MISMATCH',
        `Existing immutable remote ${label} path contains different bytes`,
        'REMOTE_UNAVAILABLE',
      );
    }
  }

  private async assertManifestObjectsAvailable(
    scopeId: string,
    manifest: MemoryRemoteManifest,
    suppliedObjectId: string,
    suppliedObjectBytes: Uint8Array,
  ): Promise<void> {
    for (const objectId of manifest.objectIds) {
      if (objectId === suppliedObjectId) continue;
      const bytes = await this.transport.readFile(memoryRemoteObjectPath(scopeId, objectId));
      if (!bytes) throw readbackMissing(`Manifest references unavailable remote object ${objectId}`);
      const decoded = decodeMemoryRemoteEnvelope(bytes);
      if (decoded.objectId !== objectId || decoded.scopeId !== scopeId) {
        throw new MemoryRemoteSyncError('MEMORY_REMOTE_INTEGRITY_FAILED', 'Manifest references a remote object with invalid identity', 'REMOTE_UNAVAILABLE');
      }
    }
    if (!manifest.objectIds.includes(suppliedObjectId) || !suppliedObjectBytes.byteLength) {
      throw new MemoryRemoteSyncError('MEMORY_REMOTE_GENERATION_INVALID', 'Supplied remote object is invalid', 'LOCAL_COMMITTED');
    }
  }

  private async recordFailure(
    scope: MemoryScope,
    manifest: MemoryRemoteManifest,
    error: MemoryRemoteSyncError,
  ): Promise<void> {
    await this.ledger.setRemoteState({
      scope,
      durabilityState: error.durabilityState,
      remoteGeneration: manifest.previousGeneration ?? undefined,
      logicalStateHash: manifest.logicalStateHash,
      lastErrorCode: error.code,
    });
  }
}
