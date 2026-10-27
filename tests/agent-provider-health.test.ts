import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import { PersistentCredentialScheduler } from '../src/agent-provider-scheduler.js';
import { ProviderModelReadinessService, readinessDigest } from '../src/agent-provider-readiness.js';
import { OpenAICompatibleProviderPool, type AgentProviderConfig } from '../src/agent-provider.js';
import { AgentProviderRequestError, classifyAgentProviderFailure } from '../src/agent-provider-errors.js';
import type { ProviderModelReadiness } from '../src/agent-provider-state.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(count = 2, keyless = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'provider-health-'));
  roots.push(root);
  const dbPath = path.join(root, 'provider-state.sqlite');
  const scheduler = new PersistentCredentialScheduler(dbPath);
  const keys = Array.from({ length: count }, (_, i) => ({
    id: keyless ? 'fixture:keyless' : `fixture:${i}`, ordinal: i,
    secret: keyless ? '' : `fixture-secret-${i}`,
  }));
  await scheduler.select({ providerId: 'fixture', model: 'model', credentials: keys,
    trackPool: true, expectedPoolRevision: 0, now: 1_000 });
  return { dbPath, scheduler, keys };
}
function snapshot(dbPath: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return ['provider_state_meta', 'provider_credential_state', 'provider_rotation_state', 'provider_pool_state',
      'provider_scope_blocks', 'provider_quota_state', 'provider_breaker_state', 'provider_model_readiness']
      .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  } finally { db.close(); }
}
async function holdWriter(dbPath: string, mode: 'WAL' | 'DELETE') {
  const db = new DatabaseSync(dbPath);
  try { db.exec(`PRAGMA journal_mode=${mode}`); } finally { db.close(); }
  // The separate writer owns only the disposable fixture and also has a self-exit deadline.
  const writer = spawn(process.execPath, ['--input-type=module', '--eval', `
    import { DatabaseSync } from 'node:sqlite';
    const db = new DatabaseSync(process.argv[1]);
    db.exec(process.argv[2] === 'WAL' ? 'BEGIN IMMEDIATE' : 'BEGIN EXCLUSIVE');
    db.exec('UPDATE provider_state_meta SET value=value');
    const finish = () => { clearTimeout(timer); db.exec('ROLLBACK'); db.close(); process.exit(0); };
    const timer = setTimeout(finish, 10_000);
    process.stdin.resume(); process.stdin.once('end', finish);
    process.stdout.write('locked\\n');
  `, dbPath, mode], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(writer, 'exit');
  const release = async () => { writer.stdin.end(); await exited; };
  try {
    const [ready] = await once(writer.stdout, 'data', { signal: AbortSignal.timeout(3_000) });
    expect(String(ready)).toContain('locked');
    return release;
  } catch (error) { await release(); throw error; }
}

it.each(['WAL', 'DELETE'] as const)('reads health without waiting for an external SQLite %s writer or changing durable state', async mode => {
  const { dbPath, scheduler, keys } = await fixture(20);
  const metadata: ProviderModelReadiness = { status: 'ready', model: 'model', contextWindowTokens: 32_768,
    maxOutputTokens: 4_096, checkedAtMs: 1_000, retryAtMs: 100_000,
    reason: 'MODEL_TOOL_PROBE_VERIFIED', source: 'provider-catalog-and-tool-probe' };
  const route = { id: 'fixture', model: 'model', baseUrl: null };
  for (const key of keys) scheduler.state.saveModelReadiness('fixture', key.id, readinessDigest(route, key), metadata);
  const before = snapshot(dbPath);
  const release = await holdWriter(dbPath, mode);
  try {
    const started = performance.now();
    const tick = new Promise(resolve => setTimeout(resolve, 20));
    const health = scheduler.health('fixture', keys, 2_000);
    const readiness = new ProviderModelReadinessService(scheduler.state, 1_000).readForHealth(route, keys);
    await tick;
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(health).toMatchObject(mode === 'WAL'
      ? { available: true, activeCount: 20, invalidCount: 0, cooldownCount: 0 }
      : { available: false, issue: expect.stringContaining('locked') });
    expect(readiness).toEqual(keys.map(() => mode === 'WAL' ? metadata : null));
  } finally {
    await release();
  }
  expect(snapshot(dbPath)).toEqual(before);
  expect(scheduler.health('fixture', keys, 2_000)).toMatchObject({ available: true, activeCount: 20 });
}, 15_000);

it('projects expired protection and changed credentials without mutating auth, quota, history or cursor', async () => {
  const { dbPath, scheduler, keys } = await fixture(6);
  const now = 10_000;
  const db = new DatabaseSync(dbPath);
  try {
    const update = db.prepare('UPDATE provider_credential_state SET state=?, cooldown_until_ms=? WHERE credential_id=?');
    update.run('cooldown', now - 1, keys[0]!.id);
    update.run('quota_blocked', now - 1, keys[1]!.id);
    update.run('invalid', null, keys[2]!.id);
    update.run('disabled', null, keys[3]!.id);
    update.run('invalid', null, keys[4]!.id);
    update.run('cooldown', now + 5_000, keys[5]!.id);
    db.prepare(`INSERT INTO provider_breaker_state(provider_id,state,retry_at_ms,updated_at_ms)
      VALUES ('fixture','OPEN',?,?)`).run(now - 1, now - 2);
    db.prepare(`INSERT INTO provider_scope_blocks(provider_id,credential_id,scope_kind,scope_key,reason,expires_at_ms,updated_at_ms)
      VALUES ('fixture',?,'quota','daily','RATE_LIMIT',?,?)`).run(keys[1]!.id, now - 1, now - 2);
    db.prepare(`INSERT INTO provider_quota_state(provider_id,credential_id,quota_scope_key,metric,remaining_value,reset_at_ms,source,observed_at_ms,updated_at_ms)
      VALUES ('fixture',?,'daily','requests',0,?,'fixture',?,?)`).run(keys[1]!.id, now - 1, now - 2, now - 2);
  } finally { db.close(); }
  const before = snapshot(dbPath);
  const replaced = keys.map((key, i) => i === 4 ? { ...key, secret: 'fixture-replaced-secret' } : key);
  replaced.push({ id: 'fixture:new', ordinal: 6, secret: 'fixture-new-secret' });
  expect(scheduler.health('fixture', replaced, now)).toMatchObject({
    available: true, credentialCount: 7, activeCount: 4, cooldownCount: 1,
    quotaBlockedCount: 0, invalidCount: 1, breakerState: 'HALF_OPEN', nextAvailableAtMs: now + 5_000,
  });
  expect(scheduler.health('fixture', keys, now - 2)).toMatchObject({
    activeCount: 0, cooldownCount: 2, quotaBlockedCount: 1, invalidCount: 2, breakerState: 'OPEN',
  });
  expect(snapshot(dbPath)).toEqual(before);
});

it.each([false, true])('recovers a real lock failure only for an uncanceled task, without selecting during recovery (keyless=%s)', async keyless => {
  const { dbPath, scheduler, keys } = await fixture(1, keyless);
  const route = { id: 'fixture', model: 'model', baseUrl: 'http://127.0.0.1:12345/v1' };
  const config: AgentProviderConfig = { enabled: true, baseUrl: null, model: null, apiKey: null,
    requestTimeoutMs: 1_000, maxToolIterations: 2, maxProviderAttempts: 2,
    providerOrder: [route.id], providers: [{ ...route, credentials: keys }] };
  const pool = new OpenAICompatibleProviderPool(config, dbPath);
  const state = (pool as any).scheduler.state as typeof scheduler.state;
  const now = Date.now();
  if (!keyless) state.saveModelReadiness(route.id, keys[0]!.id, readinessDigest(route, keys[0]!), {
    status: 'ready', model: route.model, contextWindowTokens: 32_768, maxOutputTokens: 4_096,
    checkedAtMs: now, retryAtMs: now + 100_000,
    reason: 'MODEL_TOOL_PROBE_VERIFIED', source: 'provider-catalog-and-tool-probe',
  });
  const before = snapshot(dbPath);
  const release = await holdWriter(dbPath, 'DELETE');
  try {
    expect(() => state.readModelReadiness(route.id, keys[0]!.id, readinessDigest(route, keys[0]!))).toThrow(/locked/);
    expect(pool.health().issue).toMatch(/PROVIDER_STATE_UNAVAILABLE/);
  } finally { await release(); }
  expect(pool.health().issue).toMatch(/PROVIDER_STATE_UNAVAILABLE/);
  expect(snapshot(dbPath)).toEqual(before);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ model: 'fixture-actual',
    choices: [{ finish_reason: 'stop', message: { content: 'recovered' } }],
  }), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  const canceled = new AbortController();
  canceled.abort(new Error('fixture-canceled'));
  await expect(pool.complete([{ role: 'user', content: 'fixture' }], [], undefined, canceled.signal)).rejects.toThrow('fixture-canceled');
  expect(state.healthIssue()).toMatch(/PROVIDER_STATE_UNAVAILABLE/);
  expect(snapshot(dbPath)).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
  await expect(pool.complete([{ role: 'user', content: 'fixture' }])).resolves.toMatchObject({ content: 'recovered' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(state.healthIssue()).toBeNull();
  const after = snapshot(dbPath);
  expect(after[3]).toEqual(before[3]); // The existing global cursor remains on the same pair/revision.
  expect(Number((after[2]![0] as any).rotation_sequence)).toBe(Number((before[2]![0] as any).rotation_sequence) + 1);
}, 15_000);

it.each([false, true])('keeps an unsupported schema fail-closed during task-time recovery (keyless=%s)', async keyless => {
  const { dbPath, keys } = await fixture(1, keyless);
  const db = new DatabaseSync(dbPath);
  try { db.exec("UPDATE provider_state_meta SET value='unsupported' WHERE key='schema_version'"); }
  finally { db.close(); }
  const pool = new OpenAICompatibleProviderPool({ enabled: true, baseUrl: null, model: null, apiKey: null,
    requestTimeoutMs: 1_000, maxToolIterations: 2, maxProviderAttempts: 2,
    providerOrder: ['fixture'], providers: [{ id: 'fixture', baseUrl: 'http://127.0.0.1:12345/v1', model: 'model', credentials: keys }],
  }, dbPath);
  const before = snapshot(dbPath);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(pool.complete([{ role: 'user', content: 'fixture' }])).rejects.toThrow(/SCHEMA_UNSUPPORTED/);
  expect(pool.health().issue).toMatch(/SCHEMA_UNSUPPORTED/);
  expect(fetch).not.toHaveBeenCalled();
  expect(snapshot(dbPath)).toEqual(before);
});

it('batches current readiness without weakening exact-model failures, freshness or configuration matching', async () => {
  const { dbPath, scheduler, keys } = await fixture(5);
  const now = Date.now();
  const route = { id: 'fixture', model: 'model', baseUrl: 'http://127.0.0.1:12345/v1' };
  const selected = (await scheduler.select({ providerId: route.id, model: route.model, credentials: keys, now })).credential!;
  scheduler.recordFailure({ selection: selected.selection, model: route.model, completedAtMs: now,
    decision: classifyAgentProviderFailure(new AgentProviderRequestError({ status: 404, message: 'HTTP_404' }), now) });
  const proof: ProviderModelReadiness = { status: 'ready', model: route.model, contextWindowTokens: 32_768,
    maxOutputTokens: 4_096, checkedAtMs: now + 1, retryAtMs: now + 100_000,
    reason: 'MODEL_TOOL_PROBE_VERIFIED', source: 'provider-catalog-and-tool-probe' };
  for (const [i, key] of keys.entries()) scheduler.state.saveModelReadiness(route.id, key.id, readinessDigest(route, key), {
    ...proof,
    ...(i === 1 ? { checkedAtMs: now } : {}),
    ...(i === 3 ? { retryAtMs: now - 1 } : {}),
    ...(i === 4 ? { status: 'unavailable', reason: 'MODEL_CATALOG_UNAVAILABLE' } : {}),
  });
  const currentKeys = keys.map((key, i) => i === 2 ? { ...key, secret: 'changed-fixture-secret' } : key);
  const config: AgentProviderConfig = { enabled: true, baseUrl: null, model: null, apiKey: null,
    requestTimeoutMs: 1_000, maxToolIterations: 2, maxProviderAttempts: 2,
    providerOrder: [route.id], providers: [{ ...route, credentials: currentKeys }] };
  const pool = new OpenAICompatibleProviderPool(config, dbPath);
  const service = new ProviderModelReadinessService(scheduler.state, 1_000);
  const before = snapshot(dbPath);
  expect(service.readForHealth(route, currentKeys)).toMatchObject([
    { status: 'ready', contextWindowTokens: 32_768, maxOutputTokens: 4_096 },
    { status: 'pending', reason: 'MODEL_REQUALIFICATION_REQUIRED' }, null,
    { status: 'ready', retryAtMs: now - 1 }, { status: 'unavailable' },
  ]);
  expect(service.readForHealth({ ...route, model: 'changed-model' }, currentKeys)).toEqual(keys.map(() => null));
  expect(service.readForHealth({ ...route, baseUrl: 'http://127.0.0.1:12346/v1' }, currentKeys)).toEqual(keys.map(() => null));
  expect(pool.health().routes?.[0]?.modelReadiness).toMatchObject({ ready: 1, pending: 3, unavailable: 1, models: ['model'] });
  expect(snapshot(dbPath)).toEqual(before);
});
