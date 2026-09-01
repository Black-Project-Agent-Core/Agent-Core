import type { EncryptedMemoryPayload } from './remote-crypto.js';

export type MemoryRemoteObjectKind = 'event-batch' | 'recovery-checkpoint';

export interface MemoryRemoteEnvelope {
  formatVersion: 1;
  objectId: string;
  scopeId: string;
  kind: MemoryRemoteObjectKind;
  previousGeneration: string | null;
  logicalStateHash: string;
  payloadHash: string;
  createdAt: number;
  encryptedPayload: EncryptedMemoryPayload;
}

export interface MemoryRemoteManifest {
  formatVersion: 1;
  generationId: string;
  scopeId: string;
  previousGeneration: string | null;
  objectIds: string[];
  logicalStateHash: string;
  createdAt: number;
}
