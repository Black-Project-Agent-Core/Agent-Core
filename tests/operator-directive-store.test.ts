import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { OperatorDirectiveConfig } from '../src/config.js';
import { OperatorDirectiveStore } from '../src/operator-directives/store.js';

const roots: string[] = [];
const stores: OperatorDirectiveStore[] = [];

const VERBATIM = 'instruksi verbatim : aku ingin kamu membantuku dengan men-install setiap kebutuhan alat bantu dalam pembangunan tanpa ragu untuk menunggu persetujuan, aku percaya dan mengizinkan sepenuhnya agar kamu bisa bantu aku install setiap alat kebutuhannya tanpa menunggu pertujuan lagi dan tidak perlu menundanya.';

function config(stateRoot: string, lockTimeoutMs = 5_000): OperatorDirectiveConfig {
  return { enabled: true, stateRoot, lockTimeoutMs, stateVersion: 1 };
}

function track(store: OperatorDirectiveStore): OperatorDirectiveStore {
  stores.push(store);
  return store;
}

async function setup(lockTimeoutMs?: number) {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-directives-'));
  roots.push(stateRoot);
  const store = track(new OperatorDirectiveStore(config(stateRoot, lockTimeoutMs)));
  await store.open();
  return { stateRoot, store };
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

async function walk(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full));
    else found.push(full);
  }
  return found;
}

async function eventsFile(stateRoot: string): Promise<string> {
  const names = await readdir(path.join(stateRoot, 'events'));
  const first = names.find((name) => name.endsWith('.jsonl'));
  if (!first) throw new Error('no event stream written');
  return path.join(stateRoot, 'events', first);
}

async function eventLines(stateRoot: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(await eventsFile(stateRoot), 'utf8');
  return text.split('\n').filter((line) => line.length).map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function currentState(stateRoot: string): Promise<Record<string, any>> {
  const names = await readdir(path.join(stateRoot, 'current'));
  const first = names.find((name) => name.endsWith('.json'));
  if (!first) throw new Error('no materialized state written');
  return JSON.parse(await readFile(path.join(stateRoot, 'current', first), 'utf8')) as Record<string, any>;
}

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('OperatorDirectiveStore file-native state', () => {
  it('appends a grant event and materializes the current directive state', async () => {
    const { store, stateRoot } = await setup();
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
    expect(await store.listEvents('principal-a')).toHaveLength(1);
    expect(await store.listCurrent('principal-a')).toEqual([result.directive]);

    const lines = await eventLines(stateRoot);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ seq: 1, principalId: 'principal-a', prevHash: '' });
    expect(String(lines[0]!.hash)).toMatch(/^[0-9a-f]{64}$/);
    const state = await currentState(stateRoot);
    expect(state).toMatchObject({ stateVersion: 1, principalId: 'principal-a', seq: 1, headHash: lines[0]!.hash });
    expect(state.directives).toHaveLength(1);
    expect(await readdir(path.join(stateRoot, 'journal'))).toEqual([]);
  });

  it('keeps revision numbers monotonic across grant, revise and revoke', async () => {
    const { store, stateRoot } = await setup();
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

    const revoked = await store.revoke({
      principalId: 'principal-a',
      directiveKey: 'dev_tool_install_consent',
      actorKeyId: 'key-a',
      authenticationMode: 'bearer-api-key',
      reason: 'user revoked standing consent',
    });
    expect(revoked.directive).toMatchObject({ active: false, revisionNo: 3 });
    expect(revoked.directive.revokedAt).toEqual(expect.any(Number));
    expect(await store.listCurrent('principal-a')).toEqual([]);
    expect(await store.listCurrent('principal-a', { includeRevoked: true })).toHaveLength(1);

    const events = await store.listEvents('principal-a');
    expect(events.map((event) => event.eventType)).toEqual(['granted', 'revised', 'revoked']);
    expect(events.map((event) => event.revisionNo)).toEqual([1, 2, 3]);
    expect((await eventLines(stateRoot)).map((line) => line.seq)).toEqual([1, 2, 3]);
    expect(await store.integrity()).toEqual({ ok: true, result: 'ok' });
  });

  it('scopes every stream, read and mutation to one principal', async () => {
    const { store, stateRoot } = await setup();
    await store.grantOrRevise(grantInput('principal-a'));
    await store.grantOrRevise(grantInput('principal-b', `${VERBATIM} other operator`));

    const a = await store.listCurrent('principal-a');
    const b = await store.listCurrent('principal-b');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.verbatimText).not.toBe(b[0]!.verbatimText);
    expect(a[0]!.revisionNo).toBe(1);
    expect(b[0]!.revisionNo).toBe(1);
    expect(await store.listCurrent('principal-c')).toEqual([]);
    expect(await store.listEvents('principal-c')).toEqual([]);
    expect((await store.listEvents('principal-a')).every((event) => event.principalId === 'principal-a')).toBe(true);
    expect((await readdir(path.join(stateRoot, 'events'))).filter((n) => n.endsWith('.jsonl'))).toHaveLength(2);

    await expect(store.revoke({
      principalId: 'principal-c',
      directiveKey: 'dev_tool_install_consent',
      actorKeyId: 'key-c',
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

  it('drops and heals an interrupted trailing append on restart', async () => {
    const { store, stateRoot } = await setup();
    await store.grantOrRevise(grantInput());
    await store.close();

    const file = await eventsFile(stateRoot);
    await writeFile(file, `${await readFile(file, 'utf8')}{"seq":2,"id":"half-written`, 'utf8');

    const reopened = track(new OperatorDirectiveStore(config(stateRoot)));
    await reopened.open();
    expect(await reopened.listEvents('principal-a')).toHaveLength(1);
    expect((await readFile(file, 'utf8')).endsWith('\n')).toBe(true);
    expect(await eventLines(stateRoot)).toHaveLength(1);

    const next = await reopened.grantOrRevise(grantInput('principal-a', `${VERBATIM} after recovery`));
    expect(next.directive.revisionNo).toBe(2);
    expect((await eventLines(stateRoot)).map((line) => line.seq)).toEqual([1, 2]);
    expect(await reopened.integrity()).toEqual({ ok: true, result: 'ok' });
  });

  it('surfaces a typed corrupt-state error when a committed event is tampered with', async () => {
    const { store, stateRoot } = await setup();
    await store.grantOrRevise(grantInput());
    await store.close();

    const file = await eventsFile(stateRoot);
    const tampered = { ...(await eventLines(stateRoot))[0]!, verbatimText: 'tampered text' };
    await writeFile(file, `${JSON.stringify(tampered)}\n`, 'utf8');

    const reopened = track(new OperatorDirectiveStore(config(stateRoot)));
    await expect(reopened.open()).rejects.toThrow('OPERATOR_DIRECTIVE_EVENT_STREAM_CORRUPT');
    await expect(reopened.listCurrent('principal-a')).rejects.toThrow('OPERATOR_DIRECTIVE_EVENT_STREAM_CORRUPT');
  });

  it('redoes a pending transaction journal left behind by a crash mid-append', async () => {
    const { store, stateRoot } = await setup();
    const granted = await store.grantOrRevise(grantInput());
    await store.close();

    // Crash after the journal was written but before the event reached the stream.
    const file = await eventsFile(stateRoot);
    const [pending] = await eventLines(stateRoot);
    await writeFile(file, '', 'utf8');
    await writeFile(
      path.join(stateRoot, 'journal', `${granted.event.id}.json`),
      JSON.stringify({
        stateVersion: 1,
        transactionId: granted.event.id,
        principalId: 'principal-a',
        createdAt: granted.event.createdAt,
        event: pending!,
      }),
      'utf8',
    );

    const reopened = track(new OperatorDirectiveStore(config(stateRoot)));
    await reopened.open();
    expect(await reopened.listEvents('principal-a')).toHaveLength(1);
    expect(await reopened.listCurrent('principal-a')).toHaveLength(1);
    expect(await readdir(path.join(stateRoot, 'journal'))).toEqual([]);
    expect(await reopened.integrity()).toEqual({ ok: true, result: 'ok' });
  });

  it('detects and rebuilds materialized state that disagrees with the event stream', async () => {
    const { store, stateRoot } = await setup();
    await store.grantOrRevise(grantInput());

    const currentDir = path.join(stateRoot, 'current');
    const [name] = await readdir(currentDir);
    await writeFile(path.join(currentDir, name!), JSON.stringify({ stateVersion: 1, principalId: 'principal-a', seq: 0, headHash: '', directives: [] }), 'utf8');
    expect(await store.integrity()).toEqual({ ok: false, result: expect.stringContaining('OPERATOR_DIRECTIVE_STATE_DIVERGED') });
    expect(await store.listCurrent('principal-a')).toHaveLength(1);
    await store.close();

    const reopened = track(new OperatorDirectiveStore(config(stateRoot)));
    await reopened.open();
    const state = await currentState(stateRoot);
    expect(state.seq).toBe(1);
    expect(state.directives).toHaveLength(1);
    expect(state.recovery).toMatchObject({ materializedStateRebuilt: true });
    expect(await reopened.integrity()).toEqual({ ok: true, result: 'ok' });
  });

  it('serializes concurrent writers through the owner-token lock', async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-core-operator-directives-'));
    roots.push(stateRoot);
    const left = track(new OperatorDirectiveStore(config(stateRoot)));
    const right = track(new OperatorDirectiveStore(config(stateRoot)));
    await Promise.all([left.open(), right.open()]);

    await Promise.all([
      left.grantOrRevise(grantInput('principal-a', `${VERBATIM} left`)),
      right.grantOrRevise(grantInput('principal-a', `${VERBATIM} right`)),
    ]);

    const events = await left.listEvents('principal-a');
    expect(events.map((event) => event.revisionNo)).toEqual([1, 2]);
    expect(events.map((event) => event.eventType)).toEqual(['granted', 'revised']);
    expect((await eventLines(stateRoot)).map((line) => line.seq)).toEqual([1, 2]);
    expect((await left.listCurrent('principal-a'))[0]!.revisionNo).toBe(2);
    expect(await left.integrity()).toEqual({ ok: true, result: 'ok' });
    expect(await readdir(stateRoot)).not.toContain('.directives.lock');
  });

  it('fails with a bounded lock timeout instead of blocking forever', async () => {
    const { store, stateRoot } = await setup(60);
    const lock = path.join(stateRoot, '.directives.lock');
    await writeFile(lock, JSON.stringify({ token: 'other-owner', pid: 1, host: 'elsewhere', acquiredAt: Date.now(), expiresAt: Date.now() + 600_000 }), 'utf8');
    await expect(store.grantOrRevise(grantInput())).rejects.toThrow('OPERATOR_DIRECTIVE_LOCK_TIMEOUT');
    await rm(lock, { force: true });
    expect((await store.grantOrRevise(grantInput())).directive.revisionNo).toBe(1);
  });

  it('takes over a stale owner-token lock', async () => {
    const { store, stateRoot } = await setup(50);
    await writeFile(
      path.join(stateRoot, '.directives.lock'),
      JSON.stringify({ token: 'dead-owner', pid: 1, host: 'elsewhere', acquiredAt: Date.now() - 600_000, expiresAt: Date.now() - 60_000 }),
      'utf8',
    );
    expect((await store.grantOrRevise(grantInput())).directive.revisionNo).toBe(1);
  });

  it('never writes a database file under the state root', async () => {
    const { store, stateRoot } = await setup();
    await store.grantOrRevise(grantInput('principal-a'));
    await store.grantOrRevise(grantInput('principal-b'));
    await store.revoke({
      principalId: 'principal-b',
      directiveKey: 'dev_tool_install_consent',
      actorKeyId: 'key-b',
      authenticationMode: 'bearer-api-key',
      reason: 'revoked',
    });
    const files = (await walk(stateRoot)).map((file) => path.relative(stateRoot, file).replaceAll('\\', '/'));
    expect(files.filter((file) => /sql|\.db$/i.test(file))).toEqual([]);
    expect(files.filter((file) => file.startsWith('events/'))).toHaveLength(2);
    expect(files.filter((file) => file.startsWith('current/'))).toHaveLength(2);
    expect(files.every((file) => file.startsWith('events/') || file.startsWith('current/'))).toBe(true);
  });
});
