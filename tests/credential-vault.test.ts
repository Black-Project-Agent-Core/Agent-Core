import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyCredentialVault, getCredentialVaultStatus, launcherMasterKeyProtector, removeVaultCredential, signVaultFile,
  type MasterKeyProtector,
} from '../src/security/credential-vault.js';
import { buildMachineShellEnv, buildOwnedChildEnv, getAgentCoreOwnedSecretKeys } from '../src/security/environment.js';

// Stand-in for DPAPI: reversible, bound to a "user" tag so a blob from another user cannot be opened.
const fakeProtector = (user: string): MasterKeyProtector => {
  const tag = Buffer.from(`fake-dpapi:${user}:`);
  return {
    protect: plain => Buffer.concat([tag, plain]),
    unprotect: blob => {
      if (!blob.subarray(0, tag.length).equals(tag)) throw new Error('fake-dpapi: wrong user');
      return blob.subarray(tag.length);
    },
  };
};

const KEY_A = 'sk-ant-test-key-alpha-0000000000000000001';
const KEY_B = 'sk-or-v1-test-key-bravo-000000000000000002';
const KEY_C = 'sk-ant-test-key-charlie-00000000000000003';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-core-vault-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const vaultFile = () => path.join(dir, 'credential-vault.json');
const keyFile = () => path.join(dir, 'credential-vault.key');
const snapshot = () => ({ vault: fs.readFileSync(vaultFile()), key: fs.readFileSync(keyFile()) });

describe('credential vault', () => {
  it('imports numbered keys from the environment, keeps their values out of the vault file and refills the slots from the vault', () => {
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_A, OPENROUTER_API_KEY_02: ` ${KEY_B} `, OTHER_VALUE: 'kept' };
    const status = applyCredentialVault(env, { dir, protector: fakeProtector('owner') });

    expect(status.status).toBe('active');
    expect(status.entryCount).toBe(2);
    expect(status.importedCount).toBe(2);
    expect(status.providers).toEqual({ anthropic: 1, openrouter: 1 });
    const stored = fs.readFileSync(vaultFile(), 'utf8') + fs.readFileSync(keyFile(), 'latin1');
    expect(stored).not.toContain(KEY_A);
    expect(stored).not.toContain(KEY_B);
    expect(stored).not.toContain('alpha');
    expect(JSON.stringify(status)).not.toContain(KEY_A);
    expect(JSON.stringify(getCredentialVaultStatus())).not.toContain(KEY_B);

    expect(env.ANTHROPIC_API_KEY_01).toBe(KEY_A);
    expect(env.OPENROUTER_API_KEY_02).toBe(KEY_B);
    expect(env.OTHER_VALUE).toBe('kept');
    expect(getAgentCoreOwnedSecretKeys()).toEqual(expect.arrayContaining(['ANTHROPIC_API_KEY_01', 'OPENROUTER_API_KEY_02']));
    expect(Object.keys(buildOwnedChildEnv({}, env))).toEqual(['OTHER_VALUE']);
    expect(buildMachineShellEnv({}, env)).not.toHaveProperty('ANTHROPIC_API_KEY_01');
  });

  it('is the source of truth on later starts: a key gone from .env still fills its slot, a new key takes a free slot', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });

    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_C };
    const status = applyCredentialVault(env, { dir, protector: fakeProtector('owner') });

    expect(status.importedCount).toBe(1);
    expect(status.entryCount).toBe(2);
    expect(env.ANTHROPIC_API_KEY_01).toBe(KEY_A);
    expect(env.ANTHROPIC_API_KEY_02).toBe(KEY_C);
  });

  it('never imports a removed key again while it is still in .env', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A, ANTHROPIC_API_KEY_02: KEY_C }, { dir, protector: fakeProtector('owner') });
    expect(removeVaultCredential({ dir, protector: fakeProtector('owner') }, { prefix: 'ANTHROPIC', slot: 1 })).toBe(true);

    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_A, ANTHROPIC_API_KEY_02: KEY_C };
    const status = applyCredentialVault(env, { dir, protector: fakeProtector('owner') });

    expect(status.entryCount).toBe(1);
    expect(status.deletedCount).toBe(1);
    expect(status.importedCount).toBe(0);
    expect(env.ANTHROPIC_API_KEY_01).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY_02).toBe(KEY_C);
    expect(fs.readFileSync(vaultFile(), 'utf8')).not.toContain(KEY_A);
  });

  it('reports a corrupt vault file, keeps .env in force and does not rewrite the vault', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });
    fs.writeFileSync(vaultFile(), '{"version":1,"entries":[{"broken":true');
    const before = snapshot();

    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_C };
    const status = applyCredentialVault(env, { dir, protector: fakeProtector('owner') });

    expect(status.status).toBe('corrupt');
    expect(status.issue).toBe('VAULT_FILE_INVALID');
    expect(env.ANTHROPIC_API_KEY_01).toBe(KEY_C);
    expect(snapshot()).toEqual(before);
  });

  it('reports a tampered ciphertext as corrupt without rewriting, with or without a valid file MAC', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });
    const parsed = JSON.parse(fs.readFileSync(vaultFile(), 'utf8'));
    parsed.entries[0].ciphertext = Buffer.from('not the real ciphertext').toString('base64');
    fs.writeFileSync(vaultFile(), JSON.stringify(parsed));
    expectCorrupt('VAULT_MAC_INVALID');
    resign(file => { file.entries[0].ciphertext = Buffer.from('not the real ciphertext').toString('base64'); });
    expectCorrupt('VAULT_DECRYPT_FAILED');
  });

  it('reports a master key that does not open (other user or machine) as locked without rewriting', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });
    const before = snapshot();

    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_C };
    const status = applyCredentialVault(env, { dir, protector: fakeProtector('someone-else') });

    expect(status.status).toBe('locked');
    expect(status.issue).toBe('VAULT_KEY_LOCKED');
    expect(env.ANTHROPIC_API_KEY_01).toBe(KEY_C);
    expect(snapshot()).toEqual(before);
  });

  it('is unavailable without the DPAPI helper: nothing is created and .env stays in force', () => {
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_A };
    const status = applyCredentialVault(env, { dir, protector: null });

    expect(status.status).toBe('unavailable');
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(env.ANTHROPIC_API_KEY_01).toBe(KEY_A);
  });

  // The tampering tests re-sign the file with the real master key (opened through the fake protector), so each
  // inner check is exercised on its own instead of being masked by the file MAC.
  const resign = (mutate: (file: any) => void) => {
    const master = fakeProtector('owner').unprotect(fs.readFileSync(keyFile()));
    const parsed = JSON.parse(fs.readFileSync(vaultFile(), 'utf8'));
    mutate(parsed);
    fs.writeFileSync(vaultFile(), JSON.stringify(signVaultFile(master, parsed)));
  };
  const expectCorrupt = (issue: string) => {
    const before = snapshot();
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_C };
    const status = applyCredentialVault(env, { dir, protector: fakeProtector('owner') });
    expect(status).toMatchObject({ status: 'corrupt', issue });
    expect(env.ANTHROPIC_API_KEY_01).toBe(KEY_C);
    expect(snapshot()).toEqual(before);
  };

  it('rejects an entry moved to another provider even when the file is re-signed', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });
    resign(file => { file.entries[0].prefix = 'OPENROUTER'; });
    expectCorrupt('VAULT_DECRYPT_FAILED');
  });

  it('rejects an entry whose slot was changed even when the file is re-signed', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });
    resign(file => { file.entries[0].slot = 2; });
    expectCorrupt('VAULT_DECRYPT_FAILED');
  });

  it('rejects an authentication tag shorter than 16 bytes', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });
    resign(file => { file.entries[0].tag = Buffer.from(file.entries[0].tag, 'base64').subarray(0, 12).toString('base64'); });
    expectCorrupt('VAULT_DECRYPT_FAILED');
  });

  it('rejects a file whose entries or deleted list changed without the file MAC', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });
    const parsed = JSON.parse(fs.readFileSync(vaultFile(), 'utf8'));
    parsed.deleted.push('0'.repeat(64));
    fs.writeFileSync(vaultFile(), JSON.stringify(parsed));
    expectCorrupt('VAULT_MAC_INVALID');
  });

  it('rejects an entry with an invalid prefix or slot as an invalid file', () => {
    applyCredentialVault({ ANTHROPIC_API_KEY_01: KEY_A }, { dir, protector: fakeProtector('owner') });
    resign(file => { file.entries[0].prefix = 'anthropic'; });
    expectCorrupt('VAULT_FILE_INVALID');
    resign(file => { file.entries[0].prefix = 'ANTHROPIC'; file.entries[0].slot = 21; });
    expectCorrupt('VAULT_FILE_INVALID');
  });

  it('keeps one key that is configured for two providers working in both', () => {
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_A, OPENROUTER_API_KEY_01: KEY_A };
    const status = applyCredentialVault(env, { dir, protector: fakeProtector('owner') });
    expect(status.entryCount).toBe(2);
    expect(status.providers).toEqual({ anthropic: 1, openrouter: 1 });
    expect(env.ANTHROPIC_API_KEY_01).toBe(KEY_A);
    expect(env.OPENROUTER_API_KEY_01).toBe(KEY_A);

    expect(removeVaultCredential({ dir, protector: fakeProtector('owner') }, { prefix: 'ANTHROPIC', slot: 1 })).toBe(true);
    const again: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_A, OPENROUTER_API_KEY_01: KEY_A };
    applyCredentialVault(again, { dir, protector: fakeProtector('owner') });
    expect(again.ANTHROPIC_API_KEY_01).toBeUndefined();
    expect(again.OPENROUTER_API_KEY_01).toBe(KEY_A);
  });

  it('reports a provider whose 20 slots are full and does not import the extra key', () => {
    const full: NodeJS.ProcessEnv = {};
    for (let slot = 1; slot <= 20; slot += 1) full[`ANTHROPIC_API_KEY_${String(slot).padStart(2, '0')}`] = `sk-ant-full-${slot}-000000000000000000000000`;
    expect(applyCredentialVault(full, { dir, protector: fakeProtector('owner') }).entryCount).toBe(20);

    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY_01: KEY_C };
    const status = applyCredentialVault(env, { dir, protector: fakeProtector('owner') });
    expect(status).toMatchObject({ status: 'active', entryCount: 20, importedCount: 0, issueCount: 1, issue: 'VAULT_SLOTS_FULL' });
    expect(fs.readFileSync(vaultFile(), 'utf8')).not.toContain('charlie');
    expect(Object.keys(env).filter(key => key.startsWith('ANTHROPIC_API_KEY_'))).toHaveLength(20);
    expect(Object.values(env)).not.toContain(KEY_C);
  });

  it('uses the launcher only as a regular file beside the module project root', () => {
    expect(launcherMasterKeyProtector()).toBeNull();
    expect(launcherMasterKeyProtector(dir)).toBeNull();
    fs.mkdirSync(path.join(dir, 'Agent Core.exe'));
    expect(launcherMasterKeyProtector(dir)).toBeNull();
    fs.rmdirSync(path.join(dir, 'Agent Core.exe'));
    fs.writeFileSync(path.join(dir, 'Agent Core.exe'), 'stub');
    expect(launcherMasterKeyProtector(dir)).not.toBeNull();
  });

  it('creates nothing when there is no key to store', () => {
    const status = applyCredentialVault({ OTHER_VALUE: 'x' }, { dir: path.join(dir, 'secrets'), protector: fakeProtector('owner') });
    expect(status.status).toBe('active');
    expect(status.entryCount).toBe(0);
    expect(fs.existsSync(path.join(dir, 'secrets'))).toBe(false);
  });
});
