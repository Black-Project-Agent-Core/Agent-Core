import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';

const tempDirs: string[] = [];

async function makeStore(): Promise<FileKeyStore> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-core-key-store-'));
  tempDirs.push(dir);
  return new FileKeyStore(dir);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('FileKeyStore', () => {
  it('preserves concurrent writes from separate store instances and does not transfer approver authority on rotation', async () => {
    const store = await makeStore();
    const peer = new FileKeyStore(path.dirname(store.filePath));
    const created = await Promise.all([store.create('first'), peer.create('second'), store.create('third'), peer.create('fourth')]);
    expect((await store.list()).map(item => item.id).sort()).toEqual(created.map(item => item.metadata.id).sort());
    await store.setSkillProposalApprover(created[0].metadata.id, 'agent-core', true);
    const replacement = await peer.rotate(created[0].metadata.id);
    expect(await store.canApproveSkillProposal(created[0].metadata.id, 'agent-core')).toBe(false);
    expect(await store.canApproveSkillProposal(replacement.metadata.id, 'agent-core')).toBe(false);
  });
  it('does not resurrect a key revoked after verification took its snapshot', async () => {
    const store = await makeStore();
    const created = await store.create('operator');
    const peer = new FileKeyStore(path.dirname(store.filePath));
    let release!: () => void;
    let captured!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const snapshot = new Promise<void>(resolve => { captured = resolve; });
    const load = (store as any).load.bind(store);
    vi.spyOn(store as any, 'load').mockImplementationOnce(async () => {
      const file = await load(); captured(); await gate; return file;
    });
    const verification = store.verify(created.key);
    await snapshot;
    await peer.revoke(created.metadata.id);
    release();
    expect(await verification).toBeNull();
    expect((await peer.list())[0].revokedAt).toBeTruthy();
  });
  it('scopes proposal approvers by credential/workspace, persists independently of usage updates and revokes immediately', async () => {
    const store = await makeStore();
    const first = await store.create('operator');
    const second = await store.create('operator');
    expect(await store.canApproveSkillProposal(first.metadata.id, 'agent-core')).toBe(false);
    await store.setSkillProposalApprover(first.metadata.id, 'agent-core', true);
    await store.verify(first.key);
    const reopened = new FileKeyStore(path.dirname(store.filePath));
    expect(await reopened.canApproveSkillProposal(first.metadata.id, 'agent-core')).toBe(true);
    expect(await reopened.canApproveSkillProposal(first.metadata.id, 'other')).toBe(false);
    expect(await reopened.canApproveSkillProposal(second.metadata.id, 'agent-core')).toBe(false);
    await reopened.setSkillProposalApprover(first.metadata.id, 'agent-core', false);
    expect(await store.canApproveSkillProposal(first.metadata.id, 'agent-core')).toBe(false);
    await store.setSkillProposalApprover(first.metadata.id, 'agent-core', true);
    await store.revoke(first.metadata.id);
    expect(await store.canApproveSkillProposal(first.metadata.id, 'agent-core')).toBe(false);
    const expired = await store.create('expired', { expiresAt: new Date(Date.now() - 1) });
    await expect(store.setSkillProposalApprover(expired.metadata.id, 'agent-core', true)).rejects.toThrow(/KEY_UNAVAILABLE/);
    const restricted = await store.create('read-only', { toolGrant: { version: 1, allowedTools: ['read_file'] }, availableTools: ['read_file'] });
    await expect(store.setSkillProposalApprover(restricted.metadata.id, 'agent-core', true)).rejects.toThrow(/KEY_UNAVAILABLE/);
    await writeFile(path.join(path.dirname(store.filePath), 'proposal-approvers.json'), '{"version":2,"entries":[]}');
    await expect(store.canApproveSkillProposal(second.metadata.id, 'agent-core')).rejects.toThrow(/POLICY_INVALID/);
  });
  it('creates a prefixed key without persisting the raw secret', async () => {
    const store = await makeStore();
    const created = await store.create('integration');

    expect(created.key).toMatch(/^agent_core_live_[A-Za-z0-9_-]+$/);
    expect(created.metadata.name).toBe('integration');

    const persisted = await readFile(store.filePath, 'utf8');
    expect(persisted).not.toContain(created.key);
    expect(persisted).not.toContain(created.key.slice('agent_core_live_'.length));
  });

  it('verifies valid keys and rejects invalid keys', async () => {
    const store = await makeStore();
    const created = await store.create('operator');

    const verified = await store.verify(created.key);
    expect(verified?.id).toBe(created.metadata.id);
    expect(verified?.name).toBe('operator');
    expect(await store.verify('agent_core_live_not-the-key')).toBeNull();
  });

  it('rejects revoked and expired keys', async () => {
    const store = await makeStore();
    const active = await store.create('revoked');
    const expired = await store.create('expired', { expiresAt: new Date(Date.now() - 60_000) });

    expect(await store.revoke(active.metadata.id)).toBe(true);
    expect(await store.verify(active.key)).toBeNull();
    expect(await store.verify(expired.key)).toBeNull();

    const listed = await store.list();
    expect(listed.find((key) => key.id === active.metadata.id)?.revokedAt).toBeTruthy();
  });

  it('rotates a key by revoking the old secret and returning a new valid secret', async () => {
    const store = await makeStore();
    const original = await store.create('rotate-me');
    const replacement = await store.rotate(original.metadata.id);

    expect(replacement.key).not.toBe(original.key);
    expect(replacement.metadata.name).toBe('rotate-me');
    expect(await store.verify(original.key)).toBeNull();
    expect((await store.verify(replacement.key))?.id).toBe(replacement.metadata.id);
  });
});
