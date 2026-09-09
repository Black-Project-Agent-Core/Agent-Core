import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export interface EncryptedMemoryPayload {
  format: 'agent-core-memory-aes256gcm-v1';
  nonce: string;
  ciphertext: string;
  authTag: string;
  plaintextHash: string;
}

const FORMAT = 'agent-core-memory-aes256gcm-v1' as const;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const GITHUB_TOKEN_PREFIX = /^(?:gh[pousr]_|github_pat_)/i;

function keyError(): Error {
  return new Error('MEMORY_REMOTE_KEY_INVALID');
}

function stripOneTrailingNewline(bytes: Buffer): Buffer {
  if (bytes.length >= 2 && bytes[bytes.length - 2] === 0x0d && bytes[bytes.length - 1] === 0x0a) {
    return bytes.subarray(0, bytes.length - 2);
  }
  if (bytes.length >= 1 && bytes[bytes.length - 1] === 0x0a) {
    return bytes.subarray(0, bytes.length - 1);
  }
  return bytes;
}

function looksLikeGitHubCredential(bytes: Buffer): boolean {
  const text = bytes.toString('utf8');
  return GITHUB_TOKEN_PREFIX.test(text);
}

function parseKeyFileBytes(source: Buffer): Buffer {
  if (source.length === 32 && !looksLikeGitHubCredential(source)) return Buffer.from(source);

  const candidate = stripOneTrailingNewline(source);
  if (candidate.length === 32 && !looksLikeGitHubCredential(candidate)) return Buffer.from(candidate);

  if (candidate.length === 64) {
    const encoded = candidate.toString('ascii');
    if (/^[0-9a-fA-F]{64}$/.test(encoded)) return Buffer.from(encoded, 'hex');
  }

  throw keyError();
}

function hashPlaintext(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeCanonicalBase64(value: unknown, expectedBytes: number | null): Buffer {
  if (typeof value !== 'string') throw new Error('MEMORY_REMOTE_ENCRYPTED_PAYLOAD_INVALID');
  if (value === '') {
    if (expectedBytes === null) return Buffer.alloc(0);
    throw new Error('MEMORY_REMOTE_ENCRYPTED_PAYLOAD_INVALID');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('MEMORY_REMOTE_ENCRYPTED_PAYLOAD_INVALID');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || (expectedBytes !== null && bytes.length !== expectedBytes)) {
    throw new Error('MEMORY_REMOTE_ENCRYPTED_PAYLOAD_INVALID');
  }
  return bytes;
}

function plaintextHashesEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export class MemoryRemoteCrypto {
  private constructor(private readonly key: Buffer) {}

  static async fromKeyFile(keyPath: string): Promise<MemoryRemoteCrypto> {
    let source: Buffer;
    try {
      source = await readFile(keyPath);
    } catch (error) {
      const wrapped = new Error('MEMORY_REMOTE_KEY_READ_FAILED');
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    }
    return new MemoryRemoteCrypto(parseKeyFileBytes(source));
  }

  encrypt(plaintext: Uint8Array, aad: string): EncryptedMemoryPayload {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: AUTH_TAG_BYTES });
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext)),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      format: FORMAT,
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      authTag: authTag.toString('base64'),
      plaintextHash: hashPlaintext(plaintext),
    };
  }

  decrypt(payload: EncryptedMemoryPayload, aad: string): Uint8Array {
    if (payload?.format !== FORMAT || !/^[0-9a-f]{64}$/.test(payload?.plaintextHash ?? '')) {
      throw new Error('MEMORY_REMOTE_ENCRYPTED_PAYLOAD_INVALID');
    }

    let nonce: Buffer;
    let ciphertext: Buffer;
    let authTag: Buffer;
    try {
      nonce = decodeCanonicalBase64(payload.nonce, NONCE_BYTES);
      ciphertext = payload.ciphertext === '' ? Buffer.alloc(0) : decodeCanonicalBase64(payload.ciphertext, null);
      authTag = decodeCanonicalBase64(payload.authTag, AUTH_TAG_BYTES);
    } catch (error) {
      if (error instanceof Error && error.message === 'MEMORY_REMOTE_ENCRYPTED_PAYLOAD_INVALID') throw error;
      throw new Error('MEMORY_REMOTE_ENCRYPTED_PAYLOAD_INVALID');
    }

    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce, { authTagLength: AUTH_TAG_BYTES });
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
    } catch {
      throw new Error('MEMORY_REMOTE_DECRYPT_FAILED');
    }

    const actualHash = hashPlaintext(plaintext);
    if (!plaintextHashesEqual(actualHash, payload.plaintextHash)) {
      throw new Error('MEMORY_REMOTE_PLAINTEXT_HASH_MISMATCH');
    }
    return Uint8Array.from(plaintext);
  }
}
