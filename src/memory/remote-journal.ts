import { createHash } from 'node:crypto';
import type { MemoryScope } from './types.js';
import { MemoryRemoteCrypto, type EncryptedMemoryPayload } from './remote-crypto.js';
import type { MemoryRemoteEnvelope, MemoryRemoteManifest, MemoryRemoteObjectKind } from './remote-types.js';

const HEX_64 = /^[0-9a-f]{64}$/;
const OBJECT_KINDS = new Set<MemoryRemoteObjectKind>(['event-batch', 'recovery-checkpoint']);

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('MEMORY_REMOTE_CANONICAL_JSON_INVALID');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  throw new Error('MEMORY_REMOTE_CANONICAL_JSON_INVALID');
}

function validHexId(value: unknown): value is string {
  return typeof value === 'string' && HEX_64.test(value);
}

function assertPathId(value: string): void {
  if (!validHexId(value)) throw new Error('MEMORY_REMOTE_PATH_ID_INVALID');
}

function validCanonicalBase64(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return false;
  try {
    return Buffer.from(value, 'base64').toString('base64') === value;
  } catch {
    return false;
  }
}

function validEncryptedPayload(payload: unknown): payload is EncryptedMemoryPayload {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Record<string, unknown>;
  return value.format === 'agent-core-memory-aes256gcm-v1'
    && validCanonicalBase64(value.nonce)
    && Buffer.from(String(value.nonce), 'base64').length === 12
    && validCanonicalBase64(value.ciphertext)
    && validCanonicalBase64(value.authTag)
    && Buffer.from(String(value.authTag), 'base64').length === 16
    && validHexId(value.plaintextHash);
}

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function envelopePayloadHash(payload: EncryptedMemoryPayload): string {
  return sha256(stableJson(payload));
}

function envelopeIdentityBody(envelope: Omit<MemoryRemoteEnvelope, 'objectId' | 'encryptedPayload'>): Record<string, unknown> {
  return {
    formatVersion: envelope.formatVersion,
    scopeId: envelope.scopeId,
    kind: envelope.kind,
    previousGeneration: envelope.previousGeneration,
    logicalStateHash: envelope.logicalStateHash,
    payloadHash: envelope.payloadHash,
    createdAt: envelope.createdAt,
  };
}

function manifestIdentityBody(manifest: Omit<MemoryRemoteManifest, 'generationId'>): Record<string, unknown> {
  return {
    formatVersion: manifest.formatVersion,
    scopeId: manifest.scopeId,
    previousGeneration: manifest.previousGeneration,
    objectIds: manifest.objectIds,
    logicalStateHash: manifest.logicalStateHash,
    createdAt: manifest.createdAt,
  };
}

function envelopeAad(input: {
  scopeId: string;
  kind: MemoryRemoteObjectKind;
  previousGeneration: string | null;
  logicalStateHash: string;
  createdAt: number;
}): string {
  return `agent-core-memory-envelope-aad-v1\0${stableJson({
    scopeId: input.scopeId,
    kind: input.kind,
    previousGeneration: input.previousGeneration,
    logicalStateHash: input.logicalStateHash,
    createdAt: input.createdAt,
  })}`;
}

export function memoryRemoteScopeId(scope: Pick<MemoryScope, 'principalId' | 'projectId'>): string {
  if (!scope.principalId?.trim()) throw new Error('MEMORY_REMOTE_SCOPE_INVALID');
  return sha256(`agent-core-memory-scope-v1\0${scope.principalId}\0${scope.projectId ?? ''}`);
}

export function memoryRemoteObjectPath(scopeId: string, objectId: string): string {
  assertPathId(scopeId);
  assertPathId(objectId);
  return `scopes/${scopeId}/objects/${objectId}.json`;
}

export function memoryRemoteGenerationPath(scopeId: string, generationId: string): string {
  assertPathId(scopeId);
  assertPathId(generationId);
  return `scopes/${scopeId}/manifests/${generationId}.json`;
}

export function memoryRemoteHeadPath(scopeId: string): string {
  assertPathId(scopeId);
  return `scopes/${scopeId}/HEAD`;
}

export function computeMemoryRemoteObjectId(envelope: MemoryRemoteEnvelope): string {
  return sha256(`agent-core-memory-object-v1\0${stableJson(envelopeIdentityBody(envelope))}`);
}

export function computeMemoryRemoteGenerationId(manifest: MemoryRemoteManifest): string {
  return sha256(`agent-core-memory-generation-v1\0${stableJson(manifestIdentityBody(manifest))}`);
}

export function createMemoryRemoteEnvelope(input: {
  crypto: MemoryRemoteCrypto;
  scopeId: string;
  kind: MemoryRemoteObjectKind;
  previousGeneration: string | null;
  logicalStateHash: string;
  plaintextPayload: Uint8Array;
  createdAt: number;
}): MemoryRemoteEnvelope {
  if (!validHexId(input.scopeId) || !OBJECT_KINDS.has(input.kind)
    || (input.previousGeneration !== null && !validHexId(input.previousGeneration))
    || !validHexId(input.logicalStateHash) || !validTimestamp(input.createdAt)) {
    throw new Error('MEMORY_REMOTE_ENVELOPE_INVALID');
  }
  const encryptedPayload = input.crypto.encrypt(input.plaintextPayload, envelopeAad(input));
  const payloadHash = envelopePayloadHash(encryptedPayload);
  const partial: Omit<MemoryRemoteEnvelope, 'objectId'> = {
    formatVersion: 1,
    scopeId: input.scopeId,
    kind: input.kind,
    previousGeneration: input.previousGeneration,
    logicalStateHash: input.logicalStateHash,
    payloadHash,
    createdAt: input.createdAt,
    encryptedPayload,
  };
  const envelope = { ...partial, objectId: '' } as MemoryRemoteEnvelope;
  envelope.objectId = computeMemoryRemoteObjectId(envelope);
  return envelope;
}

export function validateMemoryRemoteEnvelope(value: MemoryRemoteEnvelope): MemoryRemoteEnvelope {
  if (!value || value.formatVersion !== 1 || !validHexId(value.scopeId)
    || !OBJECT_KINDS.has(value.kind)
    || (value.previousGeneration !== null && !validHexId(value.previousGeneration))
    || !validHexId(value.logicalStateHash) || !validHexId(value.payloadHash)
    || !validTimestamp(value.createdAt) || !validEncryptedPayload(value.encryptedPayload)
    || !validHexId(value.objectId)) {
    throw new Error('MEMORY_REMOTE_ENVELOPE_INVALID');
  }
  if (envelopePayloadHash(value.encryptedPayload) !== value.payloadHash) {
    throw new Error('MEMORY_REMOTE_ENVELOPE_HASH_MISMATCH');
  }
  if (computeMemoryRemoteObjectId(value) !== value.objectId) {
    throw new Error('MEMORY_REMOTE_OBJECT_ID_MISMATCH');
  }
  return value;
}

export function decryptMemoryRemoteEnvelope(
  crypto: MemoryRemoteCrypto,
  envelope: MemoryRemoteEnvelope,
): Uint8Array {
  validateMemoryRemoteEnvelope(envelope);
  return crypto.decrypt(envelope.encryptedPayload, envelopeAad(envelope));
}

function normalizedObjectIds(objectIds: readonly string[]): string[] {
  for (const objectId of objectIds) {
    if (!validHexId(objectId)) throw new Error('MEMORY_REMOTE_MANIFEST_INVALID');
  }
  return [...new Set(objectIds)].sort((left, right) => left.localeCompare(right));
}

export function createMemoryRemoteManifest(input: {
  scopeId: string;
  previousGeneration: string | null;
  objectIds: readonly string[];
  logicalStateHash: string;
  createdAt: number;
}): MemoryRemoteManifest {
  if (!validHexId(input.scopeId)
    || (input.previousGeneration !== null && !validHexId(input.previousGeneration))
    || !validHexId(input.logicalStateHash) || !validTimestamp(input.createdAt)) {
    throw new Error('MEMORY_REMOTE_MANIFEST_INVALID');
  }
  const partial: Omit<MemoryRemoteManifest, 'generationId'> = {
    formatVersion: 1,
    scopeId: input.scopeId,
    previousGeneration: input.previousGeneration,
    objectIds: normalizedObjectIds(input.objectIds),
    logicalStateHash: input.logicalStateHash,
    createdAt: input.createdAt,
  };
  const manifest = { ...partial, generationId: '' } as MemoryRemoteManifest;
  manifest.generationId = computeMemoryRemoteGenerationId(manifest);
  return manifest;
}

export function validateMemoryRemoteManifest(value: MemoryRemoteManifest): MemoryRemoteManifest {
  if (!value || value.formatVersion !== 1 || !validHexId(value.generationId)
    || !validHexId(value.scopeId)
    || (value.previousGeneration !== null && !validHexId(value.previousGeneration))
    || !Array.isArray(value.objectIds) || !validHexId(value.logicalStateHash)
    || !validTimestamp(value.createdAt)) {
    throw new Error('MEMORY_REMOTE_MANIFEST_INVALID');
  }
  const normalized = normalizedObjectIds(value.objectIds);
  if (stableJson(normalized) !== stableJson(value.objectIds)) {
    throw new Error('MEMORY_REMOTE_MANIFEST_INVALID');
  }
  if (computeMemoryRemoteGenerationId(value) !== value.generationId) {
    throw new Error('MEMORY_REMOTE_GENERATION_ID_MISMATCH');
  }
  return value;
}

function decodeJson(bytes: Uint8Array, code: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    throw new Error(code);
  }
}

export function encodeMemoryRemoteEnvelope(envelope: MemoryRemoteEnvelope): Buffer {
  return Buffer.from(`${stableJson(validateMemoryRemoteEnvelope(envelope))}\n`, 'utf8');
}

export function decodeMemoryRemoteEnvelope(bytes: Uint8Array): MemoryRemoteEnvelope {
  return validateMemoryRemoteEnvelope(decodeJson(bytes, 'MEMORY_REMOTE_ENVELOPE_INVALID') as MemoryRemoteEnvelope);
}

export function encodeMemoryRemoteManifest(manifest: MemoryRemoteManifest): Buffer {
  return Buffer.from(`${stableJson(validateMemoryRemoteManifest(manifest))}\n`, 'utf8');
}

export function decodeMemoryRemoteManifest(bytes: Uint8Array): MemoryRemoteManifest {
  return validateMemoryRemoteManifest(decodeJson(bytes, 'MEMORY_REMOTE_MANIFEST_INVALID') as MemoryRemoteManifest);
}
