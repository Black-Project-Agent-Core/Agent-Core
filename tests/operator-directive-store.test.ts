import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { OperatorDirectiveStore } from '../src/operator-directives/store.js';

const roots: string[] = [];
const stores: OperatorDirectiveStore[] = [];

const VERBATIM = 'instruksi verbatim : aku ingin kamu membantuku dengan men-install setiap kebutuhan alat bantu dalam pembangunan tanpa ragu untuk menunggu persetujuan, aku percaya dan mengizinkan sepenuhnya agar kamu bisa bantu aku install setiap alat kebutuhannya tanpa menunggu pertujuan lagi dan tidak perlu menundanya.';

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-directives-'));
  roots.push(root);
  const dbPath = path.join(root, 'operator-directives.sqlite');
  const store = new OperatorDirectiveStore({ enabled: true, dbPath, busyTimeoutMs: 5_000, schemaVersion: 1 });
  stores.push(store);
  await store.open();
  return { root, dbPath, store };
}

function grantInput(principalId = 'principal-a', verbatimText = VERBATIM) {
  return {
    principalId,
    directiveKey: 'dev_tool_install_consent' as const,
    verbatimText,
    actorKeyId: 'key-a',
    authenticationMode: 'bearer-api-key' as const,
    reason: 'explicit authenticated grant',
  };
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('OperatorDirectiveStore', () => {
  it('grants the current projection and append-only event atomically', async () => {
    const { store } = await setup();
    const result = await store.grantOrRevise(grantInput());
    expect(result.directive).toMatchObject({
      principalId: 'principal-a',
      directiveKey: 'dev_tool_install_consent',
      revisionNo: 1,
      active: true,
      verbatimText: VERBATIM,
      createdByKeyId: 'key-a',
      createdAuthentication: 'bearer-api-key',
    });
    expect(result.event).toMatchObject({ eventType: 'granted', revisionNo: 1 });
    expect((await store.listEvents('principal-a'))).toHaveLength(1);
  });

  it('revises by incrementing revision while preserving prior provenance', async () => {
    const { store } = await setup();
    const first = await store.grantOrRevise(grantInput());
    const second = await store.grantOrRevise({
      ...grantInput('principal-a', `${VERBATIM} revised wording`),
      actorKeyId: 'key-b',
      authenticationMode: 'oauth2',
      reason: 'authenticated revision',
    });
    expect(second.directive.revisionNo).toBe(2);
    expect(second.event.eventType).toBe('revised');
    expect(second.directive.verbatimSha256).not.toBe(first.directive.verbatimSha256);
    expect(second.directive.createdByKeyId).toBe('key-a');
    expect(second.directive.createdAuthentication).toBe('bearer-api-key');
    const events = await store.listEvents('principal-a');
    expect(events.map((event) => event.eventType)).toEqual(['granted', 'revised']);
    expect(events.map((event) => event.revisionNo)).toEqual([1, 2]);
  });

  it('revokes without deleting provenance', async () => {
    const { store } = await setup();
    await store.grantOrRevise(grantInput());
    const revoked = await store.revoke({
      principalId: 'principal-a',
      directiveKey: 'dev_tool_install_consent',
      actorKeyId: 'key-a',
      authenticationMode: 'bearer-api-key',
      reason: 'user revoked standing consent',
    });
    expect(revoked.directive).toMatchObject({ active: false, revisionNo: 2 });
    expect(revoked.directive.revokedAt).toEqual(expect.any(Number));
    expect((await store.listCurrent('principal-a', { includeRevoked: true }))).toHaveLength(1);
    expect(await store.listCurrent('principal-a')).toEqual([]);
    expect((await store.listEvents('principal-a')).map((event) => event.eventType))
      .toEqual(['granted', 'revoked']);
  });

  it('isolates directive state by principal', async () => {
    const { store } = await setup();
    await store.grantOrRevise(grantInput('principal-a'));
    expect(await store.listCurrent('principal-b')).toEqual([]);
    await expect(store.revoke({
      principalId: 'principal-b',
      directiveKey: 'dev_tool_install_consent',
      actorKeyId: 'key-b',
      authenticationMode: 'bearer-api-key',
      reason: 'cross-principal attempt',
    })).rejects.toThrow('OPERATOR_DIRECTIVE_NOT_FOUND');
  });

  it('round-trips the exact UTF-8 verbatim source byte-for-byte', async () => {
    const { store } = await setup();
    await store.grantOrRevise(grantInput());
    const [stored] = await store.listCurrent('principal-a');
    expect(Buffer.from(stored!.verbatimText, 'utf8')).toEqual(Buffer.from(VERBATIM, 'utf8'));
  });

  it('rejects directive keys outside the compile-time catalog', async () => {
    const { store } = await setup();
    await expect(store.grantOrRevise({
      ...grantInput(),
      directiveKey: 'allow_everything' as any,
    })).rejects.toThrow('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
  });

  it('detects a corrupted verbatim/hash projection and refuses trusted current state', async () => {
    const { store, dbPath } = await setup();
    await store.grantOrRevise(grantInput());
    await store.close();
    stores.splice(stores.indexOf(store), 1);

    const db = new DatabaseSync(dbPath);
    db.prepare('UPDATE operator_directives SET verbatim_text = ? WHERE principal_id = ?')
      .run('tampered text', 'principal-a');
    db.close();

    const reopened = new OperatorDirectiveStore({ enabled: true, dbPath, busyTimeoutMs: 5_000, schemaVersion: 1 });
    stores.push(reopened);
    await reopened.open();
    expect((await reopened.integrity()).ok).toBe(false);
    await expect(reopened.listCurrent('principal-a')).rejects.toThrow('OPERATOR_DIRECTIVE_INTEGRITY_FAILED');
  });

  it('enforces append-only directive events at sqlite level', async () => {
    const { store, dbPath } = await setup();
    const grant = await store.grantOrRevise(grantInput());
    await store.close();
    stores.splice(stores.indexOf(store), 1);

    const db = new DatabaseSync(dbPath);
    expect(() => db.prepare('UPDATE operator_directive_events SET reason = ? WHERE id = ?')
      .run('mutated', grant.event.id)).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM operator_directive_events WHERE id = ?')
      .run(grant.event.id)).toThrow(/append-only/);
    db.close();
  });
});
