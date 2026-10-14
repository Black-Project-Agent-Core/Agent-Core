import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { readSensitiveJsonFile } from '../security/sensitive-file.js';
import type {
  CreatedKey,
  CreateKeyOptions,
  KeyMetadata,
  StoredKeyFile,
  StoredKeyRecord,
  VerifiedKey,
} from './key-types.js';

import { parseToolGrant, provisioningToolGrant } from './tool-grant.js';

const KEY_PREFIX = 'agent_core_live_';
const HASH_BYTES = 64;

function deriveKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, HASH_BYTES, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

function toMetadata(record: StoredKeyRecord): KeyMetadata {
  const { salt: _salt, hash: _hash, ...metadata } = record;
  return record.toolGrant === undefined ? metadata : { ...metadata, toolGrant: parseToolGrant(record.toolGrant) };
}

export class FileKeyStore {
  readonly filePath: string;

  constructor(private readonly dataDir: string) {
    this.filePath = path.join(dataDir, 'keys.json');
  }

  private async load(): Promise<StoredKeyFile> {
    try {
      const parsed = await readSensitiveJsonFile<StoredKeyFile>(this.filePath);
      if (parsed.version !== 1 || !Array.isArray(parsed.keys)) {
        throw new Error('Unsupported Agent Core key store format');
      }
      for (const record of parsed.keys) {
        if (!record || typeof record !== 'object') throw new Error('Invalid key record');
        if (Object.hasOwn(record, 'toolGrant')) parseToolGrant(record.toolGrant);
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, keys: [] };
      }
      throw error;
    }
  }

  private async save(file: StoredKeyFile): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const serialized = `${JSON.stringify(file, null, 2)}\n`;
    await writeOwnedFileAtomic(this.filePath, serialized, { mode: 0o600 });
  }

  async create(name: string, options: CreateKeyOptions = {}): Promise<CreatedKey> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Key name is required');

    const toolGrant = provisioningToolGrant(options.toolGrant, options.availableTools);
    const secret = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
    const salt = randomBytes(16);
    const hash = await deriveKey(secret, salt);
    const file = await this.load();
    const record: StoredKeyRecord = {
      id: randomUUID(),
      name: normalizedName,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: options.expiresAt?.toISOString() ?? null,
      ...(toolGrant !== undefined ? { toolGrant } : {}),
      revokedAt: null,
      salt: salt.toString('base64'),
      hash: hash.toString('base64'),
    };

    file.keys.push(record);
    await this.save(file);
    return { key: secret, metadata: toMetadata(record) };
  }

  async list(): Promise<KeyMetadata[]> {
    const file = await this.load();
    return file.keys.map(toMetadata);
  }

  async importSecret(name: string, secret: string): Promise<KeyMetadata> {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Key name is required');
    if (!secret.startsWith(KEY_PREFIX)) throw new Error('Invalid Agent Core key format');
    const existing = await this.verify(secret);
    if (existing) return existing;
    // Import must not resurrect a known scoped secret as an unrestricted key.
    const prior = await this.load();
    for (const record of prior.keys) {
      if (record.toolGrant === undefined) continue;
      const candidate = await deriveKey(secret, Buffer.from(record.salt, 'base64'));
      const expected = Buffer.from(record.hash, 'base64');
      if (candidate.length === expected.length && timingSafeEqual(candidate, expected))
        throw new Error('KEY_SCOPED_SECRET_IMPORT_REFUSED');
    }
    const salt = randomBytes(16);
    const hash = await deriveKey(secret, salt);
    const file = await this.load();
    const record: StoredKeyRecord = {
      id: randomUUID(), name: normalizedName, createdAt: new Date().toISOString(),
      lastUsedAt: null, expiresAt: null, revokedAt: null,
      salt: salt.toString('base64'), hash: hash.toString('base64'),
    };
    file.keys.push(record);
    await this.save(file);
    return toMetadata(record);
  }

  async verify(secret: string): Promise<VerifiedKey | null> {
    if (!secret.startsWith(KEY_PREFIX)) return null;

    const file = await this.load();
    const now = Date.now();
    for (const record of file.keys) {
      if (record.revokedAt) continue;
      if (record.expiresAt && Date.parse(record.expiresAt) <= now) continue;

      const candidate = await deriveKey(secret, Buffer.from(record.salt, 'base64'));
      const expected = Buffer.from(record.hash, 'base64');
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) continue;

      record.lastUsedAt = new Date().toISOString();
      await this.save(file);
      return toMetadata(record);
    }
    return null;
  }

  async revoke(id: string): Promise<boolean> {
    const file = await this.load();
    const record = file.keys.find((key) => key.id === id);
    if (!record) return false;
    if (!record.revokedAt) {
      record.revokedAt = new Date().toISOString();
      await this.save(file);
    }
    return true;
  }

  async rotate(id: string): Promise<CreatedKey> {
    const file = await this.load();
    const record = file.keys.find((key) => key.id === id);
    if (!record) throw new Error(`Key not found: ${id}`);
    if (record.revokedAt) throw new Error(`Key already revoked: ${id}`);

    record.revokedAt = new Date().toISOString();
    await this.save(file);
    const options: CreateKeyOptions = {};
    if (record.expiresAt) options.expiresAt = new Date(record.expiresAt);
    if (record.toolGrant !== undefined) {
      options.toolGrant = parseToolGrant(record.toolGrant);
      // Rotation preserves the exact previously issued grant; it never widens it.
      options.availableTools = options.toolGrant.allowedTools;
    }
    return this.create(record.name, options);
  }
}

export { KEY_PREFIX };
