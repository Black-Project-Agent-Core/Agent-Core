import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { MemoryHardLifecycleError, type MemoryContextLifecycleRecord } from './hard-lifecycle.js';
import type { MemoryScope } from './types.js';

const TOKEN_PREFIX = 'mcl1';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
export const MEMORY_CONTEXT_LEASE_MAX_TTL_MS = 15 * 60_000;
export const MEMORY_CONTEXT_LEASE_MAX_TOKEN_CHARS = 4096;

interface LeasePayload {
  version: 1;
  principalId: string;
  projectId: string;
  contextId: string;
  routeContextId: string;
  objectiveHash: string;
  issuedAt: number;
  expiresAt: number;
}

export interface IssuedMemoryContextLease {
  token: string;
  expiresAt: number;
}

export interface ValidatedMemoryContextLease {
  scope: MemoryScope;
  contextId: string;
  routeContextId: string;
  objectiveHash: string;
  issuedAt: number;
  expiresAt: number;
}

function fail(): never {
  throw new MemoryHardLifecycleError(
    'MEMORY_PREFLIGHT_REQUIRED',
    'A valid current Memory Context Lease is required for this meaningful operation',
  );
}

function b64url(value: Buffer): string {
  return value.toString('base64url');
}

function decodePart(value: string, expectedLength?: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) fail();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    fail();
  }
  if (decoded.length === 0 || (expectedLength !== undefined && decoded.length !== expectedLength)) fail();
  if (decoded.toString('base64url') !== value) fail();
  return decoded;
}

function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) fail();
  return value;
}

function parsePayload(value: unknown, now: number, allowExpired = false): LeasePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const row = value as Record<string, unknown>;
  if (row.version !== 1) fail();
  const issuedAt = Number(row.issuedAt);
  const expiresAt = Number(row.expiresAt);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) || issuedAt < 0 || expiresAt <= issuedAt || (!allowExpired && expiresAt <= now)) fail();
  const objectiveHash = boundedText(row.objectiveHash, 64);
  if (!/^[a-f0-9]{64}$/.test(objectiveHash)) fail();
  return {
    version: 1,
    principalId: boundedText(row.principalId, 512),
    projectId: typeof row.projectId === 'string' && row.projectId.length <= 4096 ? row.projectId : fail(),
    contextId: boundedText(row.contextId, 512),
    routeContextId: boundedText(row.routeContextId, 512),
    objectiveHash,
    issuedAt,
    expiresAt,
  };
}

export class MemoryContextLeaseAuthority {
  private readonly key: Buffer;

  constructor(key?: Buffer) {
    const resolved = key ? Buffer.from(key) : randomBytes(KEY_BYTES);
    if (resolved.length !== KEY_BYTES) throw new Error('MEMORY_CONTEXT_LEASE_KEY_INVALID');
    this.key = resolved;
  }

  issue(record: MemoryContextLifecycleRecord, now = Date.now()): IssuedMemoryContextLease {
    if (record.postflightState === 'CLOSED' || record.expiresAt <= now) fail();
    const expiresAt = Math.min(record.expiresAt, now + MEMORY_CONTEXT_LEASE_MAX_TTL_MS);
    if (expiresAt <= now) fail();
    const payload: LeasePayload = {
      version: 1,
      principalId: record.principalId,
      projectId: record.projectId,
      contextId: record.contextId,
      routeContextId: record.routeContextId,
      objectiveHash: record.objectiveHash,
      issuedAt: now,
      expiresAt,
    };
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const token = `${TOKEN_PREFIX}.${b64url(nonce)}.${b64url(ciphertext)}.${b64url(tag)}`;
    if (token.length > MEMORY_CONTEXT_LEASE_MAX_TOKEN_CHARS) throw new Error('MEMORY_CONTEXT_LEASE_TOKEN_TOO_LARGE');
    return { token, expiresAt };
  }

  validate(token: string, now = Date.now()): ValidatedMemoryContextLease {
    return this.decode(token, now, false);
  }

  // Completion records work already performed. It never authorizes another operation.
  validateCompletion(token: string, now = Date.now()): ValidatedMemoryContextLease {
    return this.decode(token, now, true);
  }

  private decode(token: string, now: number, allowExpired: boolean): ValidatedMemoryContextLease {
    if (typeof token !== 'string' || token.length < 16 || token.length > MEMORY_CONTEXT_LEASE_MAX_TOKEN_CHARS) fail();
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX) fail();
    const nonce = decodePart(parts[1]!, NONCE_BYTES);
    const ciphertext = decodePart(parts[2]!);
    const tag = decodePart(parts[3]!, TAG_BYTES);
    if (ciphertext.length > 16 * 1024) fail();
    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce, { authTagLength: TAG_BYTES });
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      fail();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext.toString('utf8'));
    } catch {
      fail();
    }
    const payload = parsePayload(parsed, now, allowExpired);
    return {
      scope: { principalId: payload.principalId, projectId: payload.projectId },
      contextId: payload.contextId,
      routeContextId: payload.routeContextId,
      objectiveHash: payload.objectiveHash,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    };
  }
}
