import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryRemoteCrypto } from '../src/memory/remote-crypto.js';

async function keyFixture(bytes: Uint8Array | string, label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-memory-crypto-${label}-`));
  const file = path.join(root, 'memory.key');
  await writeFile(file, bytes);
  return file;
}

function flipBase64(value: string): string {
  if (!value.length) return 'A';
  return `${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;
}

describe('MemoryRemoteCrypto', () => {
  it('loads either a 32-byte raw key or a 64-hex-character key with one trailing newline', async () => {
    const rawKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1));
    const raw = await MemoryRemoteCrypto.fromKeyFile(await keyFixture(rawKey, 'raw'));
    const hex = await MemoryRemoteCrypto.fromKeyFile(await keyFixture(`${rawKey.toString('hex')}\n`, 'hex'));
    const plaintext = Buffer.from('cross-session memory payload', 'utf8');

    expect(Buffer.from(raw.decrypt(raw.encrypt(plaintext, 'scope-a'), 'scope-a'))).toEqual(plaintext);
    expect(Buffer.from(hex.decrypt(hex.encrypt(plaintext, 'scope-a'), 'scope-a'))).toEqual(plaintext);
  });

  it('round-trips with deterministic plaintext hash but randomized nonce and ciphertext', async () => {
    const key = Buffer.alloc(32, 0x31);
    const crypto = await MemoryRemoteCrypto.fromKeyFile(await keyFixture(key, 'randomized'));
    const plaintext = Buffer.from('A1 failure -> S1 solution -> E1 validation', 'utf8');

    const first = crypto.encrypt(plaintext, 'scope:abc/object:1');
    const second = crypto.encrypt(plaintext, 'scope:abc/object:1');

    expect(first.format).toBe('agent-core-memory-aes256gcm-v1');
    expect(first.plaintextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.plaintextHash).toBe(first.plaintextHash);
    expect(second.nonce).not.toBe(first.nonce);
    expect(second.ciphertext).not.toBe(first.ciphertext);
    expect(Buffer.from(crypto.decrypt(first, 'scope:abc/object:1'))).toEqual(plaintext);
    expect(Buffer.from(crypto.decrypt(second, 'scope:abc/object:1'))).toEqual(plaintext);
  });

  it('rejects ciphertext/authentication tampering, wrong AAD, and wrong encryption keys', async () => {
    const firstCrypto = await MemoryRemoteCrypto.fromKeyFile(await keyFixture(Buffer.alloc(32, 0x41), 'tamper-a'));
    const otherCrypto = await MemoryRemoteCrypto.fromKeyFile(await keyFixture(Buffer.alloc(32, 0x42), 'tamper-b'));
    const encrypted = firstCrypto.encrypt(Buffer.from('durable secret memory', 'utf8'), 'scope-a');

    expect(() => firstCrypto.decrypt({ ...encrypted, ciphertext: flipBase64(encrypted.ciphertext) }, 'scope-a'))
      .toThrow('MEMORY_REMOTE_DECRYPT_FAILED');
    expect(() => firstCrypto.decrypt({ ...encrypted, authTag: flipBase64(encrypted.authTag) }, 'scope-a'))
      .toThrow('MEMORY_REMOTE_DECRYPT_FAILED');
    expect(() => firstCrypto.decrypt(encrypted, 'scope-b'))
      .toThrow('MEMORY_REMOTE_DECRYPT_FAILED');
    expect(() => otherCrypto.decrypt(encrypted, 'scope-a'))
      .toThrow('MEMORY_REMOTE_DECRYPT_FAILED');
  });

  it('rejects malformed keys and GitHub credential-shaped key material', async () => {
    const malformedCases: Array<Uint8Array | string> = [
      Buffer.alloc(31, 0x11),
      Buffer.alloc(34, 0x11),
      'z'.repeat(64),
      '00'.repeat(31),
      '00'.repeat(33),
      `${'00'.repeat(32)}\n\n`,
      'ghp_1234567890123456789012345678',
      'github_pat_123456789012345678901',
    ];

    for (let index = 0; index < malformedCases.length; index += 1) {
      await expect(MemoryRemoteCrypto.fromKeyFile(await keyFixture(malformedCases[index]!, `invalid-${index}`)))
        .rejects.toThrow('MEMORY_REMOTE_KEY_INVALID');
    }
  });

  it('never serializes known plaintext or key bytes into the encrypted payload', async () => {
    const key = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
    const crypto = await MemoryRemoteCrypto.fromKeyFile(await keyFixture(key, 'plaintext-scan'));
    const marker = 'MEMORY_PLAINTEXT_MUST_NOT_APPEAR_7f8c91';
    const encrypted = crypto.encrypt(Buffer.from(marker, 'utf8'), 'opaque-scope-aad');
    const serialized = JSON.stringify(encrypted);

    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain(key.toString('utf8'));
    expect(serialized).not.toContain(key.toString('hex'));
    expect(Buffer.from(crypto.decrypt(encrypted, 'opaque-scope-aad')).toString('utf8')).toBe(marker);
  });

  it('rejects a payload whose decrypted bytes no longer match its declared plaintext hash', async () => {
    const crypto = await MemoryRemoteCrypto.fromKeyFile(await keyFixture(Buffer.alloc(32, 0x51), 'hash'));
    const encrypted = crypto.encrypt(Buffer.from('verified payload', 'utf8'), 'scope-a');

    expect(() => crypto.decrypt({ ...encrypted, plaintextHash: '0'.repeat(64) }, 'scope-a'))
      .toThrow('MEMORY_REMOTE_PLAINTEXT_HASH_MISMATCH');
  });
});
