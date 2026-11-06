/**
 * Encrypted store for the numbered provider keys (`<PREFIX>_API_KEY_NN`) under `secrets/`.
 *
 * `.env` is only an import source: new keys found there are added once, then every slot is cleared and refilled from
 * the vault, so a key the owner removed from the vault stays out even while it is still written in `.env`. Each
 * entry is AES-256-GCM under its own HKDF-derived key, bound by additional data to its provider and slot; a salted
 * HMAC fingerprint (per provider) recognises a key without opening it, and a file MAC covers the entry and deleted
 * lists. The master key is protected by Windows DPAPI (user scope) through the launcher helper
 * (`Agent Core.exe --dpapi-protect|--dpapi-unprotect`). Any failure to open the vault is reported and leaves both
 * the files and `.env` as they are: the vault is never rewritten from a state it could not read.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverProjectRoot } from '../portability/paths.js';
import { buildOwnedChildEnv, recordAgentCoreOwnedSecretKey } from './environment.js';

export interface MasterKeyProtector {
  protect(plain: Buffer): Buffer;
  unprotect(blob: Buffer): Buffer;
}

export interface CredentialVaultOptions {
  /** The `secrets` folder. Created only when there is something to store. */
  dir: string;
  /** `null` when no DPAPI helper exists (for example a Source checkout without the launcher). */
  protector: MasterKeyProtector | null;
}

export type CredentialVaultState = 'active' | 'unavailable' | 'locked' | 'corrupt';

export interface CredentialVaultStatus {
  status: CredentialVaultState;
  entryCount: number;
  importedCount: number;
  deletedCount: number;
  providers: Record<string, number>;
  issueCount: number;
  issue?: string;
}

interface VaultEntry {
  prefix: string;
  slot: number;
  fingerprint: string;
  salt: string;
  nonce: string;
  ciphertext: string;
  tag: string;
  createdAt: string;
}
interface VaultFile { version: 1; entries: VaultEntry[]; deleted: string[]; mac: string }
interface OpenVault { master: Buffer; file: VaultFile; secrets: Map<string, string>; keyIsNew: boolean }
type OpenFailure = { status: 'locked' | 'corrupt'; issue: string };

export const VAULT_FILE = 'credential-vault.json';
export const VAULT_KEY_FILE = 'credential-vault.key';
const LAUNCHER_FILE = 'Agent Core.exe';
const PREFIX_PATTERN = /^[A-Z][A-Z0-9]*$/;
const SLOT_PATTERN = /^([A-Z][A-Z0-9]*)_API_KEY_(\d{2})$/;
const SLOT_MAX = 20;
const VERSION = 1;
const INFO = 'agent-core-credential-vault:v1';
const TAG_BYTES = 16;

const slotKey = (prefix: string, slot: number) => `${prefix}_API_KEY_${String(slot).padStart(2, '0')}`;
const deriveKey = (master: Buffer, salt: Buffer | string, purpose: string) =>
  Buffer.from(hkdfSync('sha256', master, salt, `${INFO}:${purpose}`, 32));
/** Per provider on purpose: the same key configured for two providers is two entries, removable one at a time. */
const fingerprintOf = (master: Buffer, prefix: string, secret: string) =>
  createHmac('sha256', deriveKey(master, 'fingerprint', 'fingerprint')).update(`${prefix}\0${secret}`, 'utf8').digest('hex');
/** Binds the ciphertext to its place: an entry copied to another provider or slot does not open. */
const entryAad = (entry: Pick<VaultEntry, 'prefix' | 'slot' | 'fingerprint'>) =>
  Buffer.from(`${VERSION}\0${entry.prefix}\0${entry.slot}\0${entry.fingerprint}`, 'utf8');
const fileMac = (master: Buffer, file: Pick<VaultFile, 'entries' | 'deleted'>) =>
  createHmac('sha256', deriveKey(master, 'file', 'file'))
    .update(JSON.stringify({ version: VERSION, entries: file.entries, deleted: file.deleted }), 'utf8').digest('hex');
const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/** Recompute the file MAC after changing `entries` or `deleted`; exported for the tamper tests. */
export function signVaultFile(master: Buffer, file: Omit<VaultFile, 'mac'> & { mac?: string }): VaultFile {
  return { version: VERSION, entries: file.entries, deleted: file.deleted, mac: fileMac(master, file) };
}

let lastStatus: CredentialVaultStatus = {
  status: 'unavailable', entryCount: 0, importedCount: 0, deletedCount: 0, providers: {}, issueCount: 0,
};
/** Last outcome of `applyCredentialVault`, for `/health` and the UI. Counts and codes only, never a value. */
export function getCredentialVaultStatus(): CredentialVaultStatus {
  return { ...lastStatus, providers: { ...lastStatus.providers } };
}

const MODULE_ROOT = (() => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return discoverProjectRoot(here) ?? path.resolve(here, '..', '..');
})();

/**
 * The launcher as DPAPI helper. Only the executable beside this module's own project root counts (never a root
 * chosen through `AGENT_CORE_PROJECT_ROOT`), and only as a regular file; otherwise `null` (Source checkout, other OS).
 */
export function launcherMasterKeyProtector(root: string = MODULE_ROOT): MasterKeyProtector | null {
  if (process.platform !== 'win32') return null;
  const executable = path.join(root, LAUNCHER_FILE);
  try { if (!fs.lstatSync(executable).isFile()) return null; } catch { return null; }
  const call = (flag: string) => (input: Buffer) => {
    const output = execFileSync(executable, [flag], {
      input, env: buildOwnedChildEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024,
    });
    if (!output.length) throw new Error('DPAPI_HELPER_EMPTY_OUTPUT');
    return output;
  };
  return { protect: call('--dpapi-protect'), unprotect: call('--dpapi-unprotect') };
}

function encrypt(master: Buffer, prefix: string, slot: number, secret: string): VaultEntry {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const fingerprint = fingerprintOf(master, prefix, secret);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(master, salt, 'entry'), nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(entryAad({ prefix, slot, fingerprint }));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    prefix, slot, fingerprint, salt: salt.toString('base64'), nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64'), createdAt: new Date().toISOString(),
  };
}

/** Throws on any mismatch: tag length, authentication, or a plaintext that does not match the stored fingerprint. */
function decrypt(master: Buffer, entry: VaultEntry): string {
  const tag = Buffer.from(entry.tag, 'base64');
  if (tag.length !== TAG_BYTES) throw new Error('VAULT_TAG_LENGTH');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(master, Buffer.from(entry.salt, 'base64'), 'entry'),
    Buffer.from(entry.nonce, 'base64'), { authTagLength: TAG_BYTES });
  decipher.setAAD(entryAad(entry));
  decipher.setAuthTag(tag);
  const secret = Buffer.concat([decipher.update(Buffer.from(entry.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  if (!sameHex(fingerprintOf(master, entry.prefix, secret), entry.fingerprint)) throw new Error('VAULT_FINGERPRINT_MISMATCH');
  return secret;
}

function isVaultFile(value: unknown): value is VaultFile {
  const file = value as VaultFile;
  return !!file && file.version === VERSION && Array.isArray(file.entries) && Array.isArray(file.deleted)
    && typeof file.mac === 'string' && file.deleted.every(item => typeof item === 'string')
    && file.entries.every(entry => entry && typeof entry.prefix === 'string' && PREFIX_PATTERN.test(entry.prefix)
      && Number.isInteger(entry.slot) && entry.slot >= 1 && entry.slot <= SLOT_MAX
      && ['fingerprint', 'salt', 'nonce', 'ciphertext', 'tag'].every(field => typeof (entry as any)[field] === 'string'));
}

function readIfExists(file: string): Buffer | null {
  try { return fs.readFileSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function openVault(options: CredentialVaultOptions & { protector: MasterKeyProtector }): OpenVault | OpenFailure {
  const keyBlob = readIfExists(path.join(options.dir, VAULT_KEY_FILE));
  const raw = readIfExists(path.join(options.dir, VAULT_FILE));
  if (!keyBlob && raw) return { status: 'locked', issue: 'VAULT_KEY_MISSING' };
  let master: Buffer;
  let keyIsNew = false;
  if (keyBlob) {
    try { master = options.protector.unprotect(keyBlob); } catch { return { status: 'locked', issue: 'VAULT_KEY_LOCKED' }; }
    if (master.length !== 32) return { status: 'corrupt', issue: 'VAULT_KEY_INVALID' };
  } else {
    master = randomBytes(32);
    keyIsNew = true;
  }
  let file: VaultFile = signVaultFile(master, { version: VERSION, entries: [], deleted: [] });
  if (raw) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString('utf8')); } catch { return { status: 'corrupt', issue: 'VAULT_FILE_INVALID' }; }
    if (!isVaultFile(parsed)) return { status: 'corrupt', issue: 'VAULT_FILE_INVALID' };
    if (!sameHex(fileMac(master, parsed), parsed.mac)) return { status: 'corrupt', issue: 'VAULT_MAC_INVALID' };
    file = parsed;
  }
  const secrets = new Map<string, string>();
  for (const entry of file.entries) {
    try { secrets.set(entry.fingerprint, decrypt(master, entry)); } catch { return { status: 'corrupt', issue: 'VAULT_DECRYPT_FAILED' }; }
  }
  return { master, file, secrets, keyIsNew };
}

/** Write through a temporary file that is fsynced before the rename; a failure leaves no temporary behind. */
function writeAtomic(file: string, data: Buffer | string, flags = 'w') {
  const temporary = `${file}.tmp-${process.pid}`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, 'w');
    fs.writeSync(descriptor, typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (flags === 'wx') {
      // The master key is written once: copy into a new file so an existing key is never replaced.
      fs.copyFileSync(temporary, file, fs.constants.COPYFILE_EXCL);
      fs.rmSync(temporary, { force: true });
    } else {
      fs.renameSync(temporary, file);
    }
  } catch (error) {
    if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch { /* keep the original failure */ } }
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function persist(options: CredentialVaultOptions & { protector: MasterKeyProtector }, vault: OpenVault) {
  fs.mkdirSync(options.dir, { recursive: true });
  if (vault.keyIsNew) {
    writeAtomic(path.join(options.dir, VAULT_KEY_FILE), options.protector.protect(vault.master), 'wx');
    vault.keyIsNew = false;
  }
  vault.file = signVaultFile(vault.master, vault.file);
  writeAtomic(path.join(options.dir, VAULT_FILE), JSON.stringify(vault.file, null, 2) + '\n');
}

function numberedSlots(env: NodeJS.ProcessEnv) {
  const found: Array<{ key: string; prefix: string; slot: number; value: string }> = [];
  for (const [key, raw] of Object.entries(env)) {
    const match = SLOT_PATTERN.exec(key);
    if (!match) continue;
    const slot = Number(match[2]);
    if (slot < 1 || slot > SLOT_MAX) continue;
    found.push({ key, prefix: match[1]!, slot, value: (raw ?? '').trim() });
  }
  return found;
}

function freeSlot(entries: VaultEntry[], prefix: string, preferred: number): number | null {
  const taken = new Set(entries.filter(entry => entry.prefix === prefix).map(entry => entry.slot));
  if (!taken.has(preferred)) return preferred;
  for (let slot = 1; slot <= SLOT_MAX; slot += 1) if (!taken.has(slot)) return slot;
  return null;
}

function summarize(vault: OpenVault, imported: number, issue?: string): CredentialVaultStatus {
  const providers: Record<string, number> = {};
  for (const entry of vault.file.entries) {
    const id = entry.prefix.toLowerCase();
    providers[id] = (providers[id] ?? 0) + 1;
  }
  return {
    status: 'active', entryCount: vault.file.entries.length, importedCount: imported,
    deletedCount: vault.file.deleted.length, providers, issueCount: issue ? 1 : 0, ...(issue ? { issue } : {}),
  };
}

/**
 * Import new numbered keys from `env` into the vault, then make the vault the only source of those slots. On any
 * failure to open the vault, `env` is left untouched (so `.env` keeps working) and nothing is written.
 */
export function applyCredentialVault(env: NodeJS.ProcessEnv, options: CredentialVaultOptions): CredentialVaultStatus {
  const found = numberedSlots(env);
  const fail = (status: CredentialVaultState, issue: string, issueCount = 1): CredentialVaultStatus => (lastStatus = {
    status, entryCount: 0, importedCount: 0, deletedCount: 0, providers: {}, issueCount, issue,
  });
  // No helper is normal in a Source checkout; it is an issue only when a vault exists that cannot be opened.
  if (!options.protector) return fail('unavailable', 'VAULT_HELPER_MISSING', fs.existsSync(path.join(options.dir, VAULT_FILE)) ? 1 : 0);
  let vault: OpenVault | OpenFailure;
  try { vault = openVault({ ...options, protector: options.protector }); } catch (error) {
    return fail('corrupt', `VAULT_READ_FAILED:${(error as NodeJS.ErrnoException).code ?? 'unknown'}`);
  }
  if (!('master' in vault)) return fail(vault.status, vault.issue);

  let imported = 0;
  let issue: string | undefined;
  const skipped = new Set<string>();
  for (const slot of found) {
    if (!slot.value) continue;
    const fingerprint = fingerprintOf(vault.master, slot.prefix, slot.value);
    if (vault.secrets.has(fingerprint) || vault.file.deleted.includes(fingerprint)) continue;
    const target = freeSlot(vault.file.entries, slot.prefix, slot.slot);
    if (target === null) { skipped.add(slot.key); issue = 'VAULT_SLOTS_FULL'; continue; }
    vault.file.entries.push(encrypt(vault.master, slot.prefix, target, slot.value));
    vault.secrets.set(fingerprint, slot.value);
    imported += 1;
  }
  if (imported) {
    try { persist({ ...options, protector: options.protector }, vault); } catch (error) {
      issue = `VAULT_WRITE_FAILED:${(error as NodeJS.ErrnoException).code ?? 'unknown'}`;
    }
  }

  // A key the vault could not take stays in the environment, unless the vault fills that very slot.
  for (const slot of found) if (!skipped.has(slot.key)) delete env[slot.key];
  for (const entry of vault.file.entries) {
    const key = slotKey(entry.prefix, entry.slot);
    env[key] = vault.secrets.get(entry.fingerprint);
    recordAgentCoreOwnedSecretKey(key);
  }
  return (lastStatus = summarize(vault, imported, issue));
}

/**
 * Remove one stored key. Its fingerprint stays on the deleted list so the next `.env` import does not revive it.
 * Returns `false` when the vault could not be opened or holds no such slot; nothing is written in that case.
 */
export function removeVaultCredential(
  options: CredentialVaultOptions, target: { prefix: string; slot: number },
): boolean {
  if (!options.protector) return false;
  let vault: OpenVault | OpenFailure;
  try { vault = openVault({ ...options, protector: options.protector }); } catch { return false; }
  if (!('master' in vault)) return false;
  const index = vault.file.entries.findIndex(entry => entry.prefix === target.prefix.toUpperCase() && entry.slot === target.slot);
  if (index < 0) return false;
  const [removed] = vault.file.entries.splice(index, 1);
  if (!vault.file.deleted.includes(removed!.fingerprint)) vault.file.deleted.push(removed!.fingerprint);
  persist({ ...options, protector: options.protector }, vault);
  return true;
}
