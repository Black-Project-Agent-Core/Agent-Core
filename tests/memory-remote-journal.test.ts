import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';
import {
  computeMemoryRemoteObjectId,
  createMemoryRemoteEnvelope,
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
} from '../src/memory/remote-journal.js';

async function cryptoFixture(): Promise<MemoryRemoteCrypto> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-journal-'));
  const file = path.join(root, 'memory.key');
  await writeFile(file, Buffer.alloc(32, 0x61));
  return MemoryRemoteCrypto.fromKeyFile(file);
}

function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('private memory remote journal format', () => {
  it('derives deterministic opaque scope ids and paths without leaking principal/project text', () => {
    const scope = { principalId: 'joe@example.test', projectId: 'Agent Core Secret Project' };
    const scopeId = memoryRemoteScopeId(scope);
    const otherScopeId = memoryRemoteScopeId({ ...scope, projectId: 'Another Project' });

    expect(scopeId).toMatch(/^[0-9a-f]{64}$/);
    expect(memoryRemoteScopeId(scope)).toBe(scopeId);
    expect(otherScopeId).not.toBe(scopeId);

    const objectId = sha('object-a');
    const generationId = sha('generation-a');
    const paths = [
      memoryRemoteObjectPath(scopeId, objectId),
      memoryRemoteGenerationPath(scopeId, generationId),
      memoryRemoteHeadPath(scopeId),
    ];
    expect(paths).toEqual([
      `scopes/${scopeId}/objects/${objectId}.json`,
      `scopes/${scopeId}/manifests/${generationId}.json`,
      `scopes/${scopeId}/HEAD`,
    ]);
    expect(paths.join('\n')).not.toContain(scope.principalId);
    expect(paths.join('\n')).not.toContain(scope.projectId);
  });

  it('creates an immutable envelope whose ids and encrypted payload hash can be recomputed canonically', async () => {
    const crypto = await cryptoFixture();
    const scopeId = memoryRemoteScopeId({ principalId: 'principal-a', projectId: 'project-a' });
    const marker = 'REMOTE_PLAINTEXT_SHOULD_BE_ENCRYPTED_42';
    const logicalStateHash = sha('logical-state-a');
    const envelope = createMemoryRemoteEnvelope({
      crypto,
      scopeId,
      kind: 'recovery-checkpoint',
      previousGeneration: sha('previous-generation'),
      logicalStateHash,
      plaintextPayload: Buffer.from(marker, 'utf8'),
      createdAt: 1_788_210_000_000,
    });

    expect(envelope.objectId).toMatch(/^[0-9a-f]{64}$/);
    expect(envelope.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeMemoryRemoteObjectId(envelope)).toBe(envelope.objectId);
    expect(envelope.encryptedPayload.plaintextHash).toBe(sha(marker));
    const encoded = encodeMemoryRemoteEnvelope(envelope);
    expect(encoded.toString('utf8')).not.toContain(marker);
    expect(decodeMemoryRemoteEnvelope(encoded)).toEqual(envelope);
    expect(validateMemoryRemoteEnvelope(envelope)).toEqual(envelope);
  });

  it('normalizes manifest object ids and derives a deterministic generation id linked to its predecessor', async () => {
    const scopeId = memoryRemoteScopeId({ principalId: 'principal-a', projectId: 'project-a' });
    const objectA = sha('object-a');
    const objectB = sha('object-b');
    const previousGeneration = sha('previous-generation');
    const logicalStateHash = sha('logical-state');

    const first = createMemoryRemoteManifest({
      scopeId,
      previousGeneration,
      objectIds: [objectB, objectA, objectB],
      logicalStateHash,
      createdAt: 1_788_210_000_100,
    });
    const second = createMemoryRemoteManifest({
      scopeId,
      previousGeneration,
      objectIds: [objectA, objectB],
      logicalStateHash,
      createdAt: 1_788_210_000_100,
    });

    expect(first.objectIds).toEqual([objectA, objectB].sort());
    expect(second.generationId).toBe(first.generationId);
    expect(first.previousGeneration).toBe(previousGeneration);
    expect(decodeMemoryRemoteManifest(encodeMemoryRemoteManifest(first))).toEqual(first);
    expect(validateMemoryRemoteManifest(first)).toEqual(first);

    const advanced = createMemoryRemoteManifest({
      scopeId,
      previousGeneration: first.generationId,
      objectIds: [objectA, objectB],
      logicalStateHash,
      createdAt: first.createdAt,
    });
    expect(advanced.previousGeneration).toBe(first.generationId);
    expect(advanced.generationId).not.toBe(first.generationId);
  });

  it('rejects malformed/tampered envelope or manifest identities rather than trusting file contents', async () => {
    const crypto = await cryptoFixture();
    const scopeId = memoryRemoteScopeId({ principalId: 'principal-a', projectId: 'project-a' });
    const envelope = createMemoryRemoteEnvelope({
      crypto,
      scopeId,
      kind: 'event-batch',
      previousGeneration: null,
      logicalStateHash: sha('logical-state'),
      plaintextPayload: Buffer.from('encrypted event payload', 'utf8'),
      createdAt: 100,
    });
    const manifest = createMemoryRemoteManifest({
      scopeId,
      previousGeneration: null,
      objectIds: [envelope.objectId],
      logicalStateHash: envelope.logicalStateHash,
      createdAt: 101,
    });

    expect(() => validateMemoryRemoteEnvelope({ ...envelope, formatVersion: 2 as 1 }))
      .toThrow('MEMORY_REMOTE_ENVELOPE_INVALID');
    expect(() => validateMemoryRemoteEnvelope({ ...envelope, payloadHash: '0'.repeat(64) }))
      .toThrow('MEMORY_REMOTE_ENVELOPE_HASH_MISMATCH');
    expect(() => validateMemoryRemoteEnvelope({ ...envelope, objectId: '0'.repeat(64) }))
      .toThrow('MEMORY_REMOTE_OBJECT_ID_MISMATCH');
    expect(() => validateMemoryRemoteManifest({ ...manifest, generationId: '0'.repeat(64) }))
      .toThrow('MEMORY_REMOTE_GENERATION_ID_MISMATCH');
    expect(() => memoryRemoteObjectPath('../scope', envelope.objectId))
      .toThrow('MEMORY_REMOTE_PATH_ID_INVALID');
  });
});
