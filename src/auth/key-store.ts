import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import lockfile from 'proper-lockfile';
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

import { credentialAllowsTool, parseToolGrant, provisioningToolGrant } from './tool-grant.js';

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

  private async withStoreLock<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(this.dataDir, { recursive: true });
    const release = await lockfile.lock(this.filePath, { realpath: false, stale: 30_000, update: 10_000,
      retries: { retries: 100, factor: 1.2, minTimeout: 10, maxTimeout: 100 } });
    try { return await operation(); } finally { await release(); }
  }

  private async mutate<T>(operation: (file: StoredKeyFile) => T | Promise<T>): Promise<T> {
    return this.withStoreLock(async () => {
      const file = await this.load();
      const result = await operation(file);
      await this.save(file);
      return result;
    });
  }

  private async skillProposalApprovers(): Promise<Array<{ keyId: string; workspace: string }>> {
    let file: { version: number; entries: Array<{ keyId: string; workspace: string }> };
    try { file = await readSensitiveJsonFile(path.join(this.dataDir, 'proposal-approvers.json')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    if (file?.version !== 1 || !Array.isArray(file.entries) || file.entries.length > 200
      || file.entries.some(entry => !entry || typeof entry.keyId !== 'string' || !entry.keyId.trim() || entry.keyId.length > 128
        || typeof entry.workspace !== 'string' || !entry.workspace.trim() || entry.workspace.length > 120
        || /[\x00-\x1f\x7f]/.test(entry.keyId + entry.workspace))) throw new Error('SKILL_PROPOSAL_APPROVER_POLICY_INVALID');
    return file.entries;
  }

  /** Operator provisioning; not exposed as a proposal MCP action. */
  async setSkillProposalApprover(keyId: string, workspace: string, allowed: boolean): Promise<void> {
    if (typeof allowed !== 'boolean' || !keyId.trim() || keyId.length > 128 || workspace !== workspace.trim() || !workspace || workspace.length > 120
      || /[\x00-\x1f\x7f]/.test(keyId + workspace)) throw new Error('SKILL_PROPOSAL_APPROVER_POLICY_INVALID');
    await this.withStoreLock(async () => {
      const key = (await this.list()).find(item => item.id === keyId);
      if (allowed && (!key || key.revokedAt || (key.expiresAt && !(Date.parse(key.expiresAt) > Date.now()))
        || !credentialAllowsTool(key, 'skills'))) throw new Error('SKILL_PROPOSAL_APPROVER_KEY_UNAVAILABLE');
      const entries = (await this.skillProposalApprovers()).filter(entry => entry.keyId !== keyId || entry.workspace !== workspace);
      if (allowed) entries.push({ keyId, workspace });
      if (entries.length > 200) throw new Error('SKILL_PROPOSAL_APPROVER_POLICY_INVALID');
      await writeOwnedFileAtomic(path.join(this.dataDir, 'proposal-approvers.json'), JSON.stringify({ version: 1, entries }) + '\n', { mode: 0o600 });
    });
  }

  async canApproveSkillProposal(keyId: string, workspace: string): Promise<boolean> {
    return this.withStoreLock(async () => {
      if (!(await this.skillProposalApprovers()).some(entry => entry.keyId === keyId && entry.workspace === workspace)) return false;
      const key = (await this.list()).find(item => item.id === keyId);
      return Boolean(key && !key.revokedAt && (!key.expiresAt || Date.parse(key.expiresAt) > Date.now()) && credentialAllowsTool(key, 'skills'));
    });
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

    return this.mutate(file => {
      file.keys.push(record);
      return { key: secret, metadata: toMetadata(record) };
    });
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
    const salt = randomBytes(16);
    const hash = await deriveKey(secret, salt);
    const record: StoredKeyRecord = {
      id: randomUUID(), name: normalizedName, createdAt: new Date().toISOString(),
      lastUsedAt: null, expiresAt: null, revokedAt: null,
      salt: salt.toString('base64'), hash: hash.toString('base64'),
    };
    return this.mutate(async file => {
      // Import must not resurrect a known scoped secret as an unrestricted key.
      for (const prior of file.keys) {
        const candidate = await deriveKey(secret, Buffer.from(prior.salt, 'base64'));
        const expected = Buffer.from(prior.hash, 'base64');
        if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) continue;
        if (prior.revokedAt || (prior.expiresAt && Date.parse(prior.expiresAt) <= Date.now())) {
          if (prior.toolGrant !== undefined) throw new Error('KEY_SCOPED_SECRET_IMPORT_REFUSED');
        } else return toMetadata(prior);
      }
      file.keys.push(record);
      return toMetadata(record);
    });
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

      return this.mutate(latest => {
        const current = latest.keys.find(key => key.id === record.id && key.hash === record.hash && key.salt === record.salt);
        if (!current || current.revokedAt || (current.expiresAt && !(Date.parse(current.expiresAt) > Date.now()))) return null;
        current.lastUsedAt = new Date().toISOString();
        return toMetadata(current);
      });
    }
    return null;
  }

  async revoke(id: string): Promise<boolean> {
    return this.mutate(file => {
      const record = file.keys.find((key) => key.id === id);
      if (!record) return false;
      if (!record.revokedAt) record.revokedAt = new Date().toISOString();
      return true;
    });
  }

  async rotate(id: string): Promise<CreatedKey> {
    const record = await this.mutate(file => {
      const record = file.keys.find((key) => key.id === id);
      if (!record) throw new Error(`Key not found: ${id}`);
      if (record.revokedAt) throw new Error(`Key already revoked: ${id}`);

      record.revokedAt = new Date().toISOString();
      return record;
    });
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
