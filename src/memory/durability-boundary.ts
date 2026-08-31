import type { MemoryRemoteConfig } from '../config.js';
import { MemoryCognitionLedger } from './cognition-ledger.js';
import {
  hashMemoryLogicalState,
  projectMemoryLogicalState,
  serializeMemoryLogicalState,
} from './logical-state-hash.js';
import { MemoryRemoteCrypto } from './remote-crypto.js';
import {
  createMemoryRemoteEnvelope,
  createMemoryRemoteManifest,
  memoryRemoteScopeId,
} from './remote-journal.js';
import { MemoryRemoteSynchronizer } from './remote-sync.js';
import {
  MEMORY_DURABILITY_BOUNDARY_REASONS,
  type MemoryDurabilityBoundaryReason,
  type MemoryDurabilityBoundaryResult,
  type MemoryScope,
} from './types.js';
import { MemoryWorkerClient } from './worker-client.js';

const REASONS = new Set<string>(MEMORY_DURABILITY_BOUNDARY_REASONS);

export class MemoryDurabilityBoundary {
  private cryptoPromise: Promise<MemoryRemoteCrypto> | undefined;

  constructor(
    readonly client: MemoryWorkerClient,
    readonly cognition: MemoryCognitionLedger,
    readonly remoteSync: MemoryRemoteSynchronizer | undefined,
    readonly config: MemoryRemoteConfig,
  ) {}

  async sync(
    scope: MemoryScope,
    reason: MemoryDurabilityBoundaryReason,
  ): Promise<MemoryDurabilityBoundaryResult> {
    if (!scope.principalId?.trim()) throw new Error('MEMORY_SCOPE_REQUIRED');
    if (!REASONS.has(reason)) throw new Error('MEMORY_DURABILITY_BOUNDARY_REASON_INVALID');
    if (!this.config.enabled) {
      return { required: false, state: 'NOT_REQUIRED', reason };
    }
    if (!this.remoteSync || !this.config.keyFile) throw new Error('MEMORY_REMOTE_DISABLED');

    const projection = await projectMemoryLogicalState(this.client, scope);
    const logicalStateHash = hashMemoryLogicalState(projection);
    const plaintextPayload = Buffer.from(serializeMemoryLogicalState(projection), 'utf8');
    const remoteState = await this.cognition.getRemoteState(scope);
    const previousGeneration = remoteState?.remoteGeneration ?? null;
    const crypto = await this.crypto();
    const scopeId = memoryRemoteScopeId(scope);
    const createdAt = Date.now();
    if (!Number.isSafeInteger(createdAt + 1)) throw new Error('MEMORY_DURABILITY_BOUNDARY_TIME_INVALID');

    const object = createMemoryRemoteEnvelope({
      crypto,
      scopeId,
      kind: 'recovery-checkpoint',
      previousGeneration,
      logicalStateHash,
      plaintextPayload,
      createdAt,
    });
    const manifest = createMemoryRemoteManifest({
      scopeId,
      previousGeneration,
      objectIds: [object.objectId],
      logicalStateHash,
      createdAt: createdAt + 1,
    });
    const synced = await this.remoteSync.sync({ scope, object, manifest });
    return {
      required: true,
      state: 'REMOTE_SYNCED',
      reason,
      generationId: synced.generationId,
      remoteHead: synced.remoteHead,
      logicalStateHash: synced.logicalStateHash,
    };
  }

  private crypto(): Promise<MemoryRemoteCrypto> {
    if (!this.config.keyFile) throw new Error('MEMORY_REMOTE_DISABLED');
    this.cryptoPromise ??= MemoryRemoteCrypto.fromKeyFile(this.config.keyFile);
    return this.cryptoPromise;
  }
}
