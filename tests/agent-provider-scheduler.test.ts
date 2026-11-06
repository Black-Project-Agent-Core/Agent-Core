import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AgentProviderRequestError,
  classifyAgentProviderFailure,
} from '../src/agent-provider-errors.js';
import {
  PersistentCredentialScheduler,
  type ProviderSchedulerCredential,
} from '../src/agent-provider-scheduler.js';
import {
  ProviderStateStore,
  summarizeCredentialVerdicts,
  secretRevisionDigest,
  type ProviderModelReadiness,
  type ProviderSkipReason,
} from '../src/agent-provider-state.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'provider-scheduler-'));
  roots.push(root);
  return path.join(root, 'provider-state.sqlite');
}

function credentials(count = 4, prefix = 'secret'): ProviderSchedulerCredential[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `openrouter:${String(index + 1).padStart(2, '0')}`,
    ordinal: index + 1,
    secret: `${prefix}-${index + 1}`,
  }));
}
describe('PersistentCredentialScheduler', () => {
  it('provider probe recovery rejects invalid lease budgets before claiming', async () => {
    const scheduler=new PersistentCredentialScheduler(await fixture());
    const keys=credentials(1);
    for(const probeLeaseMs of [0,NaN,0.5,2_147_483_648]){
      await expect(scheduler.select({providerId:'openrouter',model:'fixture-model',credentials:keys,probeLeaseMs})).rejects.toThrow('AGENT_RUNTIME_PROVIDER_PROBE_LEASE_INVALID');
    }
    expect(scheduler.health('openrouter',keys).breakerState).toBe('CLOSED');
  });

  it('provider probe recovery bounds abandoned claims and fences late outcomes', async () => {
    const scheduler = new PersistentCredentialScheduler(await fixture());
    const keys = credentials(1);
    const base = 50_000_000;
    const ordinary = (await scheduler.select({providerId:'openrouter', model:'fixture-model', credentials:keys, now:base-1})).credential!;
    const failure = classifyAgentProviderFailure(new AgentProviderRequestError({status:503,message:'unavailable'}), base);
    for (let i=0;i<3;i++) {
      const picked = await scheduler.select({providerId:'openrouter',model:'fixture-model',credentials:keys,now:base+i});
      scheduler.recordFailure({selection:picked.credential!.selection,decision:failure,model:'fixture-model',completedAtMs:base+i});
    }
    const started = base+30_003;
    const probe = await scheduler.select({providerId:'openrouter',model:'fixture-model',credentials:keys,now:started,probeLeaseMs:1_000});
    expect(probe.credential).not.toBeNull();
    const reopened = new PersistentCredentialScheduler(scheduler.state.dbPath);
    const blocked = await reopened.select({providerId:'openrouter',model:'fixture-model',credentials:keys,now:started+1});
    expect(blocked.nextAvailableAtMs).toBe(started+1_000);
    expect(blocked.credential).toBeNull();
    expect(reopened.health('openrouter',keys,started+1).nextAvailableAtMs).toBe(started+1_000);
    const replacement = await reopened.select({providerId:'openrouter',model:'fixture-model',credentials:keys,now:started+1_000,probeLeaseMs:1_000});
    expect(replacement.credential).not.toBeNull();
    scheduler.recordSuccess(probe.credential!.selection,started+1_001);
    scheduler.recordSuccess(ordinary.selection,started+1_001);
    scheduler.recordFailure({selection:probe.credential!.selection,decision:failure,model:'fixture-model',completedAtMs:started+1_001});
    scheduler.recordFailure({selection:ordinary.selection,decision:failure,model:'fixture-model',completedAtMs:started+1_001});
    scheduler.releaseProbe(probe.credential!.selection,started+1_001);
    expect((await reopened.select({providerId:'openrouter',model:'fixture-model',credentials:keys,now:started+1_002})).credential).toBeNull();
    reopened.releaseProbe(replacement.credential!.selection,started+1_003);
    expect(reopened.health('openrouter',keys,started+1_004).breakerState).toBe('HALF_OPEN');
    const retry = await reopened.select({providerId:'openrouter',model:'fixture-model',credentials:keys,now:started+1_004});
    expect(retry.credential).not.toBeNull();
    reopened.recordSuccess(retry.credential!.selection,started+1_005);
    expect(reopened.health('openrouter',keys,started+1_006).breakerState).toBe('CLOSED');
  });

  it('provider probe recovery reclaims old deadline-less state without discarding failure history', async () => {
    const dbPath=await fixture();
    const scheduler=new PersistentCredentialScheduler(dbPath);
    const keys=credentials(1);
    const now=50_000_000;
    await scheduler.select({providerId:'openrouter',model:'fixture-model',credentials:keys,now:now-1});
    const db=new DatabaseSync(dbPath);
    db.prepare(`INSERT INTO provider_breaker_state(provider_id,state,failure_count,half_open_probe_count,state_revision,updated_at_ms)
      VALUES ('openrouter','HALF_OPEN',3,1,4,?)`).run(now-1_000_000);
    db.close();
    expect(scheduler.diagnose({providerId:'openrouter',model:'fixture-model',credentials:keys,now})?.status).toBe('available');
    const probe=await scheduler.select({providerId:'openrouter',model:'fixture-model',credentials:keys,now});
    expect(probe.credential).not.toBeNull();
    scheduler.recordFailure({selection:probe.credential!.selection,decision:classifyAgentProviderFailure(new Error('fixture internal contract'),now),model:'fixture-model',completedAtMs:now});
    scheduler.releaseProbe(probe.credential!.selection,now+1);
    const inspect=new DatabaseSync(dbPath,{readOnly:true});
    expect(inspect.prepare('SELECT failure_count,half_open_probe_count FROM provider_breaker_state').get()).toMatchObject({failure_count:3,half_open_probe_count:0});
    inspect.close();
  });

  it('uses newer exact model qualification without erasing historical blocks or ignoring later failures', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(2);
    const base = 10_000_000;
    const select = (now: number, qualifiedModels?: Map<string, ProviderModelReadiness>) => scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now, qualifiedModels,
    });
    const picked = (await select(base)).credential!;
    const missing = classifyAgentProviderFailure(new AgentProviderRequestError({ status: 404, message: 'HTTP_404' }), base + 1);
    scheduler.recordFailure({ selection: picked.selection, decision: missing, model: 'fixture-model', completedAtMs: base + 1 });
    const proof: ProviderModelReadiness = { status: 'ready', model: 'fixture-model', contextWindowTokens: 100_000,
      maxOutputTokens: 8_192, checkedAtMs: base + 2, retryAtMs: base + 100_000,
      reason: 'MODEL_TOOL_PROBE_VERIFIED', source: 'provider-catalog-and-tool-probe' };
    expect((await select(base + 3)).credential).toBeNull();
    const qualified = new Map([[keys[0]!.id, proof]]);
    expect((await select(base + 3, new Map([[keys[0]!.id, { ...proof, checkedAtMs: base }]]))).credential).toBeNull();
    expect((await select(base + 3, new Map([[keys[0]!.id, { ...proof, retryAtMs: base + 2 }]]))).credential).toBeNull();
    const recovered = (await select(base + 3, qualified)).credential!;
    expect(recovered.id).toBe(keys[0]!.id);
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try { expect(db.prepare('SELECT COUNT(*) AS n FROM provider_scope_blocks').get()?.n).toBe(1); }
    finally { db.close(); }
    scheduler.recordFailure({ selection: recovered.selection, decision: missing, model: 'fixture-model', completedAtMs: base + 4 });
    expect((await select(base + 5, qualified)).credential).toBeNull();
    expect((await select(base + 6, new Map([[keys[0]!.id, { ...proof, model: 'alternative' }]]))).credential?.id).toBe(keys[0]!.id);
  });

  it.each([
    [401, 'invalid api key'], [429, 'rate limit'], [402, 'payment required'], [413, 'context window exceeded'],
  ])('preserves operational protection after qualification: %s', async (status, message) => {
    const scheduler = new PersistentCredentialScheduler(await fixture());
    const keys = credentials(1), base = 20_000_000;
    const picked = (await scheduler.select({ providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base })).credential!;
    scheduler.recordFailure({ selection: picked.selection, model: 'fixture-model', completedAtMs: base + 1,
      decision: classifyAgentProviderFailure(new AgentProviderRequestError({ status: Number(status), message: String(message) }), base + 1) });
    const qualifiedModels = new Map<string, ProviderModelReadiness>([[keys[0]!.id, {
      status: 'ready', model: 'fixture-model', contextWindowTokens: 100_000, maxOutputTokens: 8_192,
      checkedAtMs: base + 2, retryAtMs: base + 100_000, reason: 'MODEL_TOOL_PROBE_VERIFIED', source: 'provider-catalog-and-tool-probe',
    }]]);
    expect((await scheduler.select({ providerId: 'openrouter', model: 'fixture-model', credentials: keys,
      now: base + 3, qualifiedModels })).credential).toBeNull();
  });

  it('keeps the selected credential after success and reconstruction', async () => {
    const dbPath = await fixture();
    const keys = credentials(4);
    const first = new PersistentCredentialScheduler(dbPath);
    const seen: string[] = [];

    for (let i = 0; i < 3; i += 1) {
      const picked = await first.select({
        providerId: 'openrouter',
        model: 'fixture-model',
        credentials: keys,
        now: 1_000 + i,
      });
      expect(picked.credential).not.toBeNull();
      seen.push(picked.credential!.id);
      first.recordSuccess(picked.credential!.selection, 2_000 + i);
    }

    const reopened = new PersistentCredentialScheduler(dbPath);
    const fourth = await reopened.select({
      providerId: 'openrouter',
      model: 'fixture-model',
      credentials: keys,
      now: 3_000,
    });

    expect(seen).toEqual(['openrouter:01', 'openrouter:01', 'openrouter:01']);
    expect(fourth.credential?.id).toBe('openrouter:01');
  });
  it('persists rate-limit failover across restart without a recovered key preempting it', async () => {
    const dbPath = await fixture();
    const keys = credentials(2);
    const base = 10_000_000;
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const first = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base,
    });
    expect(first.credential?.id).toBe('openrouter:01');

    const rateLimit = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 429,
      message: 'rate limit exceeded',
      retryAfterMs: 120_000,
    }), base);
    scheduler.recordFailure({
      selection: first.credential!.selection,
      decision: rateLimit,
      model: 'fixture-model',
      httpStatus: 429,
      completedAtMs: base + 10,
    });

    const second = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 20,
    });
    expect(second.credential?.id).toBe('openrouter:02');

    const reopened = new PersistentCredentialScheduler(dbPath);
    const beforeExpiry = await reopened.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 60_000,
    });
    expect(beforeExpiry.credential?.id).toBe('openrouter:02');
    const afterExpiry = await reopened.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 121_000,
    });
    expect(afterExpiry.credential?.id).toBe('openrouter:02');
    const recovered = await reopened.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys,
      excludedCredentialIds: new Set(['openrouter:02']), now: base + 121_001,
    });
    expect(recovered.credential?.id).toBe('openrouter:01');
  });

  it('persists invalid credential state and resets it when the slot secret changes', async () => {
    const dbPath = await fixture();
    const base = 20_000_000;
    const keys = credentials(2);
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const first = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base,
    });

    const authFailure = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 401,
      message: 'invalid api key',
    }), base);
    scheduler.recordFailure({
      selection: first.credential!.selection,
      decision: authFailure,
      model: 'fixture-model',
      httpStatus: 401,
      completedAtMs: base + 1,
    });

    const reopened = new PersistentCredentialScheduler(dbPath);
    const skipped = await reopened.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 2,
    });
    expect(skipped.credential?.id).toBe('openrouter:02');

    const replaced = credentials(2);
    replaced[0] = { ...replaced[0]!, secret: 'replacement-secret' };
    const recovered = await reopened.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: replaced, now: base + 3,
    });
    expect(recovered.credential?.id).toBe('openrouter:02');
    expect(reopened.health('openrouter', replaced, base + 4).invalidCount).toBe(0);
  });
  it('does not punish a credential for request-invalid errors', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(1);
    const selected = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: 30_000_000,
    });
    const invalidRequest = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 400,
      message: 'malformed request',
    }), 30_000_000);
    scheduler.recordFailure({
      selection: selected.credential!.selection,
      decision: invalidRequest,
      model: 'fixture-model',
      httpStatus: 400,
      completedAtMs: 30_000_001,
    });
    const health = scheduler.health('openrouter', keys, 30_000_002);
    expect(health.activeCount).toBe(1);
    expect(health.invalidCount).toBe(0);
    expect(health.cooldownCount).toBe(0);
  });

  it('returns the earliest next-available time when every credential is blocked', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(2);
    const base = 40_000_000;

    const one = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base,
    });
    const firstLimit = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 429, message: 'rate limit', retryAfterMs: 120_000,
    }), base);
    scheduler.recordFailure({
      selection: one.credential!.selection, decision: firstLimit,
      model: 'fixture-model', httpStatus: 429, completedAtMs: base + 1,
    });

    const two = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 2,
    });
    const secondLimit = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 429, message: 'rate limit', retryAfterMs: 180_000,
    }), base + 2);
    scheduler.recordFailure({
      selection: two.credential!.selection, decision: secondLimit,
      model: 'fixture-model', httpStatus: 429, completedAtMs: base + 3,
    });

    const exhausted = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 4,
    });
    expect(exhausted.credential).toBeNull();
    expect(exhausted.reason).toBe('no-eligible-credential');
    expect(exhausted.nextAvailableAtMs).toBe(base + 120_000);
  });
  it('persists provider circuit breaker state and closes it after a half-open success', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(1);
    const base = 50_000_000;

    for (let i = 0; i < 3; i += 1) {
      const selected = await scheduler.select({
        providerId: 'openrouter', model: 'fixture-model',
        credentials: keys, now: base + i,
      });
      expect(selected.credential).not.toBeNull();
      const failure = classifyAgentProviderFailure(new AgentProviderRequestError({
        status: 503, message: 'service unavailable',
      }), base + i);
      scheduler.recordFailure({
        selection: selected.credential!.selection,
        decision: failure,
        model: 'fixture-model',
        httpStatus: 503,
        completedAtMs: base + i,
      });
    }

    const reopened = new PersistentCredentialScheduler(dbPath);
    const blocked = await reopened.select({
      providerId: 'openrouter', model: 'fixture-model',
      credentials: keys, now: base + 10,
    });
    expect(blocked.credential).toBeNull();
    expect(blocked.reason).toBe('provider-open');
    const probe = await reopened.select({
      providerId: 'openrouter', model: 'fixture-model',
      credentials: keys, now: base + 30_003,
    });
    expect(probe.credential?.id).toBe('openrouter:01');
    reopened.recordSuccess(probe.credential!.selection, base + 30_004);
    expect(reopened.health('openrouter', keys, base + 30_005).breakerState).toBe('CLOSED');
  });


  it('keeps model-scoped failures isolated from unrelated models', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(1);
    const base = 70_000_000;
    const selected = await scheduler.select({
      providerId: 'openrouter', model: 'model-a', credentials: keys, now: base,
    });
    const forbidden = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 403, message: 'model access forbidden',
    }), base);
    scheduler.recordFailure({
      selection: selected.credential!.selection,
      decision: forbidden,
      model: 'model-a',
      httpStatus: 403,
      completedAtMs: base + 1,
    });

    const unrelated = await scheduler.select({
      providerId: 'openrouter', model: 'model-b', credentials: keys, now: base + 2,
    });
    expect(unrelated.credential?.id).toBe('openrouter:01');
  });

  it('uses persisted quota observations for preflight and releases them after reset', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(2);
    const base = 80_000_000;
    scheduler.recordObservation({
      providerId: 'openrouter',
      credentialId: 'openrouter:01',
      model: 'fixture-model',
      observedAtMs: base,
      observation: {
        status: 200,
        retryAfterMs: null,
        resetAtMs: base + 60_000,
        requestLimit: 100,
        requestRemaining: 0,
        errorCode: null,
        errorType: null,
      },
    });

    const blocked = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 1,
    });
    expect(blocked.credential?.id).toBe('openrouter:02');

    const released = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 60_001,
    });
    expect(released.credential?.id).toBe('openrouter:02');
    const recovered = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys,
      excludedCredentialIds: new Set(['openrouter:02']), now: base + 60_002,
    });
    expect(recovered.credential?.id).toBe('openrouter:01');
  });

  it('escalates repeated transient rate-limit cooldowns until a success resets backoff', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(1);
    const base = 90_000_000;
    const first = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base,
    });
    const limit1 = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 429, message: 'rate limit',
    }), base);
    const retry1 = scheduler.recordFailure({
      selection: first.credential!.selection, decision: limit1,
      model: 'fixture-model', httpStatus: 429, completedAtMs: base,
    });
    expect(retry1).toBe(base + 90_000);

    const second = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: base + 90_001,
    });
    const limit2 = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 429, message: 'rate limit',
    }), base + 90_001);
    const retry2 = scheduler.recordFailure({
      selection: second.credential!.selection, decision: limit2,
      model: 'fixture-model', httpStatus: 429, completedAtMs: base + 90_001,
    });
    expect(retry2).toBe(base + 270_001);
  });

  it('serializes concurrent selections without rotating an eligible credential', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(4);

    const results = await Promise.all(Array.from({ length: 4 }, () =>
      scheduler.select({
        providerId: 'openrouter',
        model: 'fixture-model',
        credentials: keys,
        now: 60_000_000,
      }),
    ));

    expect(results.map(result => result.credential?.id)).toEqual([
      'openrouter:01',
      'openrouter:01',
      'openrouter:01',
      'openrouter:01',
    ]);
  });

  it('shares a sticky failover key across sessions and restart without late outcomes moving it back', async () => {
    const dbPath = await fixture();
    const keys = credentials(2);
    const sessionA = new PersistentCredentialScheduler(dbPath);
    const base = 100_000_000;
    expect(sessionA.readPoolCursor(['openrouter'])).toBeNull();
    const first = await sessionA.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys,
      trackPool: true, expectedPoolRevision: 0, now: base,
    });
    const limit = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 429, message: 'rate limit', retryAfterMs: 120_000,
    }), base);
    sessionA.recordFailure({
      selection: first.credential!.selection, decision: limit,
      model: 'fixture-model', completedAtMs: base + 1,
    });
    expect(sessionA.readPoolCursor(['openrouter'])).toEqual({
      providerId: 'openrouter', credentialId: 'openrouter:01', revision: 1,
    });
    const switched = await sessionA.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys,
      trackPool: true, expectedPoolRevision: 1, now: base + 2,
    });
    expect(switched.credential?.id).toBe('openrouter:02');
    sessionA.recordSuccess(first.credential!.selection, base + 3);
    sessionA.recordFailure({
      selection: first.credential!.selection, decision: limit,
      model: 'fixture-model', completedAtMs: base + 4,
    });
    const sessionB = new PersistentCredentialScheduler(dbPath);
    expect(sessionB.readPoolCursor(['openrouter'])).toEqual({
      providerId: 'openrouter', credentialId: 'openrouter:02', revision: 2,
    });
    const resumed = await sessionB.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys,
      trackPool: true, expectedPoolRevision: 2, now: base + 200_000,
    });
    expect(resumed.credential?.id).toBe('openrouter:02');
    expect(sessionB.readPoolCursor(['openrouter'])?.revision).toBe(2);
  });

  it('starts another provider at its first eligible key despite its older rotation', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(1);
    const otherKeys = credentials(2).map(key => ({ ...key, id: key.id.replace('openrouter', 'other') }));
    await scheduler.select({
      providerId: 'other', model: null, credentials: otherKeys,
      excludedCredentialIds: new Set(['other:01']), now: 100,
    });
    const first = await scheduler.select({
      providerId: 'openrouter', model: null, credentials: keys,
      trackPool: true, expectedPoolRevision: 0, now: 200,
    });
    scheduler.recordFailure({
      selection: first.credential!.selection,
      decision: classifyAgentProviderFailure(new AgentProviderRequestError({
        status: 401, message: 'invalid api key',
      }), 201),
      model: null, completedAtMs: 201,
    });
    const exhausted = await scheduler.select({
      providerId: 'openrouter', model: null, credentials: keys,
      trackPool: true, expectedPoolRevision: 1, now: 202,
    });
    expect(exhausted.reason).toBe('no-eligible-credential');
    const next = await scheduler.select({
      providerId: 'other', model: null, credentials: otherKeys,
      trackPool: true, expectedPoolRevision: 1, now: 203,
    });
    expect(next.credential?.id).toBe('other:01');
    const reopened = new PersistentCredentialScheduler(dbPath);
    expect(reopened.readPoolCursor(['openrouter', 'other'])).toEqual({
      providerId: 'other', credentialId: 'other:01', revision: 2,
    });
  });

  it.each([
    { otherAt: 2_000, providerIds: ['openrouter', 'other'], expected: 'other' },
    { otherAt: 1_000, providerIds: ['openrouter', 'other'], expected: 'openrouter' },
    { otherAt: 1_000, providerIds: ['other', 'openrouter'], expected: 'other' },
  ])('migrates traced legacy selection by recency and configured order: $expected / $otherAt', async ({
    otherAt, providerIds, expected,
  }) => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    for (const [providerId, now] of [['openrouter', 1_000], ['other', otherAt], ['removed', 9_000]] as const) {
      const keys = credentials(2).map(key => ({ ...key, id: key.id.replace('openrouter', providerId) }));
      await scheduler.select({
        providerId, model: null, credentials: keys,
        excludedCredentialIds: new Set([`${providerId}:01`]), now,
      });
    }
    scheduler.recordObservation({
      providerId: 'openrouter', credentialId: 'openrouter:01', model: null, observedAtMs: 1_001,
      observation: {
        status: 200, retryAfterMs: null, resetAtMs: 99_000,
        requestLimit: 10, requestRemaining: 0, errorCode: null, errorType: null,
      },
    });
    const reopened = new PersistentCredentialScheduler(dbPath);
    expect(reopened.readPoolCursor(providerIds)).toEqual({
      providerId: expected, credentialId: `${expected}:02`, revision: 1,
    });
    expect(reopened.readPoolCursor(['removed'])).toEqual({
      providerId: expected, credentialId: `${expected}:02`, revision: 1,
    });
    const db = new DatabaseSync(dbPath);
    try {
      expect(db.prepare('SELECT COUNT(*) AS count FROM provider_rotation_state').get()).toEqual({ count: 3 });
      expect(db.prepare('SELECT remaining_value, reset_at_ms FROM provider_quota_state').get()).toEqual({
        remaining_value: 0, reset_at_ms: 99_000,
      });
    } finally {
      db.close();
    }
  });

  it('rejects a stale pool revision before any credential or rotation mutation', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    await scheduler.select({
      providerId: 'openrouter', model: null, credentials: credentials(1),
      trackPool: true, expectedPoolRevision: 0, now: 1_000,
    });
    const stale = await new PersistentCredentialScheduler(dbPath).select({
      providerId: 'other', model: null,
      credentials: [{ id: 'other:01', ordinal: 1, secret: 'private-other-key' }],
      trackPool: true, expectedPoolRevision: 0, now: 2_000,
    });
    expect(stale).toEqual({ credential: null, nextAvailableAtMs: null, reason: 'pool-changed' });
    const db = new DatabaseSync(dbPath);
    try {
      expect(db.prepare("SELECT COUNT(*) AS count FROM provider_credential_state WHERE provider_id = 'other'").get())
        .toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM provider_rotation_state WHERE provider_id = 'other'").get())
        .toEqual({ count: 0 });
    } finally {
      db.close();
    }
    expect(scheduler.readPoolCursor(['openrouter', 'other'])).toEqual({
      providerId: 'openrouter', credentialId: 'openrouter:01', revision: 1,
    });
  });

  it('allows concurrent use of the same pool key without advancing its revision', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(2);
    await scheduler.select({
      providerId: 'openrouter', model: null, credentials: keys,
      trackPool: true, expectedPoolRevision: 0, now: 1_000,
    });
    const sessions = Array.from({ length: 4 }, () => new PersistentCredentialScheduler(dbPath));
    const selected = await Promise.all(sessions.map(session => session.select({
      providerId: 'openrouter', model: null, credentials: keys,
      trackPool: true, expectedPoolRevision: 1, now: 2_000,
    })));
    expect(selected.map(result => result.credential?.id)).toEqual(Array(4).fill('openrouter:01'));
    expect(scheduler.readPoolCursor(['openrouter'])?.revision).toBe(1);
  });

  it('admits only one concurrent provider switch from the same pool revision', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const results = await Promise.all(['openrouter', 'other'].map(providerId =>
      new PersistentCredentialScheduler(dbPath).select({
        providerId, model: null,
        credentials: [{ id: `${providerId}:01`, ordinal: 1, secret: `${providerId}-secret` }],
        trackPool: true, expectedPoolRevision: 0, now: 1_000,
      }),
    ));
    expect(results.filter(result => result.reason === 'selected')).toHaveLength(1);
    expect(results.filter(result => result.reason === 'pool-changed')).toHaveLength(1);
    const winner = results.find(result => result.credential)?.credential;
    expect(scheduler.readPoolCursor(['openrouter', 'other'])).toEqual({
      providerId: winner!.selection.providerId, credentialId: winner!.id, revision: 1,
    });
  });

  it('keeps recovered or replaced keys behind the active pool key and stores no raw secrets', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(2, 'fixture-private-credential');
    const first = await scheduler.select({
      providerId: 'openrouter', model: null, credentials: keys,
      trackPool: true, expectedPoolRevision: 0, now: 1_000,
    });
    scheduler.recordFailure({
      selection: first.credential!.selection,
      decision: classifyAgentProviderFailure(new AgentProviderRequestError({
        status: 401, message: 'invalid api key',
      }), 1_001),
      model: null, completedAtMs: 1_001,
    });
    const second = await scheduler.select({
      providerId: 'openrouter', model: null, credentials: keys,
      trackPool: true, expectedPoolRevision: 1, now: 1_002,
    });
    const replacement = keys.map((key, index) => index === 0
      ? { ...key, secret: 'fixture-private-replacement-credential' } : key);
    const afterReplacement = await scheduler.select({
      providerId: 'openrouter', model: null, credentials: replacement,
      trackPool: true, expectedPoolRevision: 2, now: 1_003,
    });
    expect(afterReplacement.credential?.id).toBe(second.credential!.id);
    expect(scheduler.readPoolCursor(['openrouter'])?.revision).toBe(2);
    scheduler.resetCredential('openrouter', 'openrouter:01', 1_004);
    const afterReset = await scheduler.select({
      providerId: 'openrouter', model: null, credentials: replacement,
      trackPool: true, expectedPoolRevision: 2, now: 1_005,
    });
    expect(afterReset.credential?.id).toBe('openrouter:02');
    const stored = await readFile(dbPath);
    for (const key of [...keys, ...replacement]) expect(stored.includes(key.secret)).toBe(false);
    expect(JSON.stringify(scheduler.readPoolCursor(['openrouter']))).not.toContain('fixture-private');
  });
});

describe('PersistentCredentialScheduler releaseRouteLocks', () => {
  const now = 2_000_000;
  const model = 'fixture-model';

  function seed(dbPath: string, sql: string, values: Array<string | number | null>) {
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(sql).run(...values);
    } finally {
      db.close();
    }
  }

  it('releases a scope block and an open breaker, keeps invalid and disabled keys, and counts only the changed key', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(3);
    const ids = keys.map(key => key.id);
    await scheduler.select({ providerId: 'openrouter', model, credentials: keys, now: now - 1 });
    seed(dbPath, `UPDATE provider_credential_state SET state = 'invalid' WHERE provider_id = ? AND credential_id = ?`, ['openrouter', ids[1]!]);
    seed(dbPath, `UPDATE provider_credential_state SET state = 'disabled' WHERE provider_id = ? AND credential_id = ?`, ['openrouter', ids[2]!]);
    seed(dbPath, `INSERT INTO provider_scope_blocks (provider_id, credential_id, model, scope_kind, scope_key, reason, expires_at_ms, state_revision, updated_at_ms)
      VALUES (?, ?, ?, 'model-credential', ?, 'RATE_LIMIT', ?, 1, ?)`, ['openrouter', ids[0]!, model, model, now + 60_000, now]);
    seed(dbPath, `INSERT INTO provider_breaker_state (provider_id, state, failure_count, opened_at_ms, retry_at_ms, open_cycle_count, state_revision, updated_at_ms)
      VALUES (?, 'OPEN', 3, ?, ?, 1, 1, ?)`, ['openrouter', now, now + 60_000, now]);

    const before = scheduler.diagnose({ providerId: 'openrouter', model, credentials: keys, now });
    expect(before?.breaker).toBe('OPEN');
    expect(before?.skipped).toEqual({ 'rate-limit': 1, invalid: 1, disabled: 1 });

    expect(scheduler.releaseLocks('openrouter', ids, now)).toBe(1);
    const after = scheduler.diagnose({ providerId: 'openrouter', model, credentials: keys, now });
    expect(after?.breaker).toBe('CLOSED');
    expect(after?.skipped).toEqual({ invalid: 1, disabled: 1 });
    expect(after?.eligible).toBe(1);
    expect(scheduler.releaseLocks('openrouter', ids, now)).toBe(0);
  });

  it('releases a cooldown row and an exhausted request quota, and keeps an authentication block in place', async () => {
    const dbPath = await fixture();
    const scheduler = new PersistentCredentialScheduler(dbPath);
    const keys = credentials(3);
    const ids = keys.map(key => key.id);
    await scheduler.select({ providerId: 'openrouter', model, credentials: keys, now: now - 1 });
    seed(dbPath, `UPDATE provider_credential_state SET state = 'cooldown', cooldown_until_ms = ?, cooldown_reason = 'RATE_LIMIT'
      WHERE provider_id = ? AND credential_id = ?`, [now + 60_000, 'openrouter', ids[0]!]);
    seed(dbPath, `INSERT INTO provider_scope_blocks (provider_id, credential_id, model, scope_kind, scope_key, reason, expires_at_ms, state_revision, updated_at_ms)
      VALUES (?, ?, '', 'credential', 'credential', 'AUTH_INVALID', ?, 1, ?)`, ['openrouter', ids[1]!, now + 60_000, now]);
    seed(dbPath, `INSERT INTO provider_quota_state (provider_id, credential_id, quota_scope_key, metric, limit_value, remaining_value, reset_at_ms, retry_after_ms, source, confidence, observed_at_ms, updated_at_ms)
      VALUES (?, ?, '*', 'requests', 10, 0, ?, NULL, 'fixture', 1, ?, ?)`, ['openrouter', ids[2]!, now + 60_000, now, now]);

    expect(scheduler.diagnose({ providerId: 'openrouter', model, credentials: keys, now })?.skipped)
      .toEqual({ 'rate-limit': 2, invalid: 1 });
    expect(scheduler.releaseLocks('openrouter', ids, now)).toBe(2);
    const after = scheduler.diagnose({ providerId: 'openrouter', model, credentials: keys, now });
    expect(after?.skipped).toEqual({ invalid: 1 });
    expect(after?.eligible).toBe(2);
  });
});

describe('classifyAgentProviderFailure matrix', () => {
  const base = 1_000_000_000;

  function classify(status: number, message: string, extra?: { safeCode?: string | null; safeType?: string | null; retryAfterMs?: number | null; resetAtMs?: number | null }) {
    return classifyAgentProviderFailure(
      new AgentProviderRequestError({ status, message, ...extra }),
      base,
    );
  }

  function classifyNonProviderError(text: string) {
    return classifyAgentProviderFailure(new Error(text), base);
  }

  it('401 -> AUTH_INVALID / credential / terminal', () => {
    const d = classify(401, 'invalid api key');
    expect(d.failureClass).toBe('AUTH_INVALID');
    expect(d.scope).toBe('credential');
    expect(d.terminalCredential).toBe(true);
    expect(d.shouldFailover).toBe(true);
    expect(d.affectsProviderBreaker).toBe(false);
    expect(d.cooldownMs).toBe(0);
    expect(d.retryAtMs).toBeNull();
  });

  it('403 plain -> MODEL_ACCESS / model-credential (not QUOTA/CREDIT)', () => {
    const d = classify(403, 'forbidden');
    expect(d.failureClass).toBe('MODEL_ACCESS');
    expect(d.scope).toBe('model-credential');
    expect(d.shouldFailover).toBe(true);
    expect(d.terminalCredential).toBe(false);
    expect(d.affectsProviderBreaker).toBe(false);
    expect(d.cooldownMs).toBe(24 * 60 * 60 * 1000); // DAY
  });

  it('403 + body quota/billing -> QUOTA_EXHAUSTED / credential', () => {
    const d = classify(403, 'quota exceeded', { safeType: 'insufficient_quota' });
    expect(d.failureClass).toBe('QUOTA_EXHAUSTED');
    expect(d.scope).toBe('credential');
    expect(d.shouldFailover).toBe(true);
    expect(d.terminalCredential).toBe(false);
  });

  it('403 + body model access -> MODEL_ACCESS / model-credential', () => {
    const d = classify(403, 'model access forbidden');
    expect(d.failureClass).toBe('MODEL_ACCESS');
    expect(d.scope).toBe('model-credential');
  });

  it('404 model not found -> MODEL_NOT_FOUND / model-provider', () => {
    const d = classify(404, 'model not found');
    expect(d.failureClass).toBe('MODEL_NOT_FOUND');
    expect(d.scope).toBe('model-provider');
  });

  it('404 generic -> MODEL_NOT_FOUND / model-provider (status-based fallback)', () => {
    const d = classify(404, 'not found');
    expect(d.failureClass).toBe('MODEL_NOT_FOUND');
    expect(d.scope).toBe('model-provider');
  });

  it('429 pure -> RATE_LIMIT / model-credential', () => {
    const d = classify(429, 'rate limit exceeded');
    expect(d.failureClass).toBe('RATE_LIMIT');
    expect(d.scope).toBe('model-credential');
    expect(d.shouldFailover).toBe(true);
    expect(d.cooldownMs).toBe(90_000);
  });

  it('429 + insufficient_quota -> QUOTA_EXHAUSTED / credential (body signal beats status)', () => {
    const d = classify(429, 'rate limit', { safeCode: 'insufficient_quota' });
    expect(d.failureClass).toBe('QUOTA_EXHAUSTED');
    expect(d.scope).toBe('credential');
  });

  it('429 + quota_exceeded (Duanyan credit exhausted) -> QUOTA_EXHAUSTED / credential; rate_limit_exceeded stays RATE_LIMIT', () => {
    // Duanyan answers both "too fast" and "credit exhausted" with HTTP 429; only the body code tells them apart.
    const exhausted = classify(429, 'Too Many Requests', { safeCode: 'quota_exceeded' });
    expect(exhausted.failureClass).toBe('QUOTA_EXHAUSTED');
    expect(exhausted.scope).toBe('credential');
    expect(exhausted.cooldownMs).toBeGreaterThanOrEqual(6 * 60 * 60_000);
    const tooFast = classify(429, 'Too Many Requests', { safeCode: 'rate_limit_exceeded' });
    expect(tooFast.failureClass).toBe('RATE_LIMIT');
    expect(tooFast.scope).toBe('model-credential');
  });

  it.each([
    'tpm_quota_exceeded', 'rpm_quota_exceeded', 'concurrency_quota_exceeded',
  ])('429 + %s (a rate window, not an exhausted credential) stays RATE_LIMIT', code => {
    // Only the exact exhausted-credit tokens may start a credential-wide cooldown; longer codes that merely contain them may not.
    const d = classify(429, 'Too Many Requests', { safeCode: code });
    expect(d.failureClass).toBe('RATE_LIMIT');
    expect(d.scope).toBe('model-credential');
    expect(d.cooldownMs).toBe(90_000);
  });

  it('matches the exhausted-credit tokens at word boundaries inside a message as well as in the code', () => {
    expect(classify(429, 'error code: quota_exceeded.').failureClass).toBe('QUOTA_EXHAUSTED');
    expect(classify(429, '{"code":"insufficient_quota"}').failureClass).toBe('QUOTA_EXHAUSTED');
    expect(classify(429, 'limit reached: tpm_quota_exceeded').failureClass).toBe('RATE_LIMIT');
  });

  it('402 / credit exhausted -> CREDIT_EXHAUSTED / credential', () => {
    const d = classify(402, 'payment required');
    expect(d.failureClass).toBe('CREDIT_EXHAUSTED');
    expect(d.scope).toBe('credential');
  });

  it('500/502/503/529 -> PROVIDER_TRANSIENT / provider / affectsBreaker', () => {
    for (const status of [500, 502, 503, 529]) {
      const d = classify(status, 'server error');
      expect(d.failureClass).toBe('PROVIDER_TRANSIENT');
      expect(d.scope).toBe('provider');
      expect(d.affectsProviderBreaker).toBe(true);
      expect(d.cooldownMs).toBe(30_000);
    }
  });

  it('transport errors (not AgentProviderRequestError) -> TRANSPORT_TRANSIENT / provider / affectsBreaker', () => {
    for (const text of ['fetch failed', 'ECONNRESET', 'ETIMEDOUT', 'timeout', 'socket']) {
      const d = classifyNonProviderError(text);
      expect(d.failureClass).toBe('TRANSPORT_TRANSIENT');
      expect(d.scope).toBe('provider');
      expect(d.affectsProviderBreaker).toBe(true);
      expect(d.cooldownMs).toBe(30_000);
    }
  });

  it('400 / 422 payload broken -> REQUEST_INVALID / request / no failover', () => {
    for (const status of [400, 422]) {
      const d = classify(status, 'malformed request');
      expect(d.failureClass).toBe('REQUEST_INVALID');
      expect(d.scope).toBe('request');
      expect(d.shouldFailover).toBe(false);
      expect(d.cooldownMs).toBe(0);
      expect(d.retryAtMs).toBeNull();
    }
  });

  it('413 -> MODEL_CAPACITY / model-provider / 10 min cooldown (observed behavior)', () => {
    const d = classify(413, 'payload too large');
    expect(d.failureClass).toBe('MODEL_CAPACITY');
    expect(d.scope).toBe('model-provider');
    expect(d.cooldownMs).toBe(10 * 60 * 1000);
    expect(d.shouldFailover).toBe(true);
  });

  it('context_length_exceeded text -> MODEL_CAPACITY / model-provider / 10 min cooldown (observed behavior)', () => {
    const d = classify(400, 'context_length_exceeded: input too long');
    expect(d.failureClass).toBe('MODEL_CAPACITY');
    expect(d.scope).toBe('model-provider');
    expect(d.cooldownMs).toBe(10 * 60 * 1000);
  });

  it('403 plain is NOT QUOTA/CREDIT', () => {
    const d = classify(403, 'forbidden');
    expect(d.failureClass).not.toBe('QUOTA_EXHAUSTED');
    expect(d.failureClass).not.toBe('CREDIT_EXHAUSTED');
    expect(d.failureClass).not.toBe('AUTH_INVALID');
  });

});

describe('ProviderStateStore routing diagnostics', () => {
  const base = 2_000_000_000;

  async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'provider-diagnostics-'));
    roots.push(root);
    return path.join(root, 'provider-state.sqlite');
  }

  function creds(count = 4, prefix = 'secret') {
    return Array.from({ length: count }, (_, i) => ({
      id: `openrouter:${String(i + 1).padStart(2, '0')}`,
      ordinal: i + 1,
      secret: `${prefix}-${i + 1}`,
    }));
  }

  function desc(cred: { id: string; secret: string; ordinal: number }) {
    return { id: cred.id, ordinal: cred.ordinal, secretRevisionDigest: secretRevisionDigest(cred.secret) };
  }

  it('summarizeCredentialVerdicts: available when eligible > 0', () => {
    const diag = summarizeCredentialVerdicts([null, 'rate-limit'], 'CLOSED', false);
    expect(diag.status).toBe('available');
    expect(diag.eligible).toBe(1);
    expect(diag.configured).toBe(2);
  });

  it('summarizeCredentialVerdicts: all-limit-or-quota when every reason is rate-limit or quota', () => {
    const diag = summarizeCredentialVerdicts(['rate-limit', 'quota'], 'CLOSED', false);
    expect(diag.status).toBe('all-limit-or-quota');
    expect(diag.eligible).toBe(0);
  });

  it('summarizeCredentialVerdicts: mixed when any other mixture', () => {
    const diag = summarizeCredentialVerdicts(['invalid', 'rate-limit'], 'CLOSED', false);
    expect(diag.status).toBe('mixed');
    const diag2 = summarizeCredentialVerdicts(['disabled', 'quota'], 'CLOSED', false);
    expect(diag2.status).toBe('mixed');
    const diag3 = summarizeCredentialVerdicts(['model-unavailable', 'cooldown'], 'CLOSED', false);
    expect(diag3.status).toBe('mixed');
  });

  it('summarizeCredentialVerdicts: empty list -> mixed with eligible=0 (no configured credentials)', () => {
    const diag = summarizeCredentialVerdicts([], 'CLOSED', false);
    expect(diag.status).toBe('mixed');
    expect(diag.eligible).toBe(0);
    expect(diag.configured).toBe(0);
  });

  it('summarizeCredentialVerdicts: providerOpen beats eligible -> provider-open', () => {
    const diag = summarizeCredentialVerdicts([null], 'OPEN', true);
    expect(diag.status).toBe('provider-open');
  });

  it('summarizeCredentialVerdicts: eligible > 0 beats mixed', () => {
    const diag = summarizeCredentialVerdicts([null, 'invalid'], 'CLOSED', false);
    expect(diag.status).toBe('available');
    expect(diag.eligible).toBe(1);
  });

  it('evaluateCredential precedence: invalid beats cooldown', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(2);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    // Mark first as invalid AND add competing active conditions
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='invalid' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run();
      // Add competing scope block (RATE_LIMIT)
      db.prepare(`INSERT INTO provider_scope_blocks (provider_id, credential_id, model, scope_kind, scope_key, reason, expires_at_ms, state_revision, updated_at_ms) VALUES ('openrouter', 'openrouter:01', 'm', 'model-credential', 'm', 'RATE_LIMIT', ?, 0, ?)`).run(now + 100_000, now);
      // Add competing quota state (remaining_value=0)
      db.prepare(`INSERT INTO provider_quota_state (provider_id, credential_id, quota_scope_key, metric, remaining_value, reset_at_ms, source, confidence, observed_at_ms, updated_at_ms) VALUES ('openrouter', 'openrouter:01', 'm', 'requests', 0, ?, 'test', 1, ?, ?)`).run(now + 100_000, now, now);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped.invalid).toBe(1);
    expect(diag?.skipped['rate-limit']).toBeUndefined();
  });

  it('evaluateCredential precedence: disabled beats cooldown', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(2);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    // Mark first as disabled AND add competing active conditions
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='disabled' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run();
      // Add competing scope block (RATE_LIMIT)
      db.prepare(`INSERT INTO provider_scope_blocks (provider_id, credential_id, model, scope_kind, scope_key, reason, expires_at_ms, state_revision, updated_at_ms) VALUES ('openrouter', 'openrouter:01', 'm', 'model-credential', 'm', 'RATE_LIMIT', ?, 0, ?)`).run(now + 100_000, now);
      // Add competing quota state (remaining_value=0)
      db.prepare(`INSERT INTO provider_quota_state (provider_id, credential_id, quota_scope_key, metric, remaining_value, reset_at_ms, source, confidence, observed_at_ms, updated_at_ms) VALUES ('openrouter', 'openrouter:01', 'm', 'requests', 0, ?, 'test', 1, ?, ?)`).run(now + 100_000, now, now);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped.disabled).toBe(1);
    expect(diag?.skipped['rate-limit']).toBeUndefined();
    expect(diag?.skipped.quota).toBeUndefined();
  });

  it('evaluateCredential: active cooldown with reason RATE_LIMIT -> rate-limit', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='cooldown', cooldown_until_ms=?, cooldown_reason='RATE_LIMIT' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now + 100_000);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped['rate-limit']).toBe(1);
  });

  it('evaluateCredential: active cooldown with reason QUOTA_EXHAUSTED -> quota', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='quota_blocked', cooldown_until_ms=?, cooldown_reason='QUOTA_EXHAUSTED' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now + 100_000);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped.quota).toBe(1);
  });

  it('evaluateCredential: active cooldown with reason AUTH_INVALID -> invalid', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='cooldown', cooldown_until_ms=?, cooldown_reason='AUTH_INVALID' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now + 100_000);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped.invalid).toBe(1);
  });

  it('evaluateCredential: active cooldown with reason MODEL_ACCESS -> model-unavailable', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='cooldown', cooldown_until_ms=?, cooldown_reason='MODEL_ACCESS' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now + 100_000);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped['model-unavailable']).toBe(1);
  });

  it('evaluateCredential: expired cooldown -> eligible again', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='cooldown', cooldown_until_ms=?, cooldown_reason='RATE_LIMIT' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now - 1000);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.eligible).toBe(1);
  });

  // D2: Advanced precedence tests
  it('evaluateCredential precedence: active QUOTA_EXHAUSTED cooldown beats scope block RATE_LIMIT and quota window -> quota', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      // Active quota_exhausted cooldown
      db.prepare(`UPDATE provider_credential_state SET state='cooldown', cooldown_until_ms=?, cooldown_reason='QUOTA_EXHAUSTED' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now + 100_000);
      // Competing scope block (RATE_LIMIT)
      db.prepare(`INSERT INTO provider_scope_blocks (provider_id, credential_id, model, scope_kind, scope_key, reason, expires_at_ms, state_revision, updated_at_ms) VALUES ('openrouter', 'openrouter:01', 'm', 'model-credential', 'm', 'RATE_LIMIT', ?, 0, ?)`).run(now + 100_000, now);
      // Competing quota window
      db.prepare(`INSERT INTO provider_quota_state (provider_id, credential_id, quota_scope_key, metric, remaining_value, reset_at_ms, source, confidence, observed_at_ms, updated_at_ms) VALUES ('openrouter', 'openrouter:01', 'm', 'requests', 0, ?, 'test', 1, ?, ?)`).run(now + 100_000, now, now);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped.quota).toBe(1);
    expect(diag?.skipped['rate-limit']).toBeUndefined();
    expect(diag?.eligible).toBe(0);
  });

  it('evaluateCredential: scope block MODEL_NOT_FOUND alone -> model-unavailable', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      // Scope block with MODEL_NOT_FOUND reason
      db.prepare(`INSERT INTO provider_scope_blocks (provider_id, credential_id, model, scope_kind, scope_key, reason, expires_at_ms, state_revision, updated_at_ms) VALUES ('openrouter', 'openrouter:01', 'm', 'model-credential', 'm', 'MODEL_NOT_FOUND', ?, 0, ?)`).run(now + 100_000, now);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped['model-unavailable']).toBe(1);
    expect(diag?.skipped['rate-limit']).toBeUndefined();
    expect(diag?.skipped.quota).toBeUndefined();
    expect(diag?.eligible).toBe(0);
  });

  it('evaluateCredential: quota window remaining_value=0 alone -> rate-limit', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      // Quota window with remaining_value=0 (no cooldown, no scope block)
      db.prepare(`INSERT INTO provider_quota_state (provider_id, credential_id, quota_scope_key, metric, remaining_value, reset_at_ms, source, confidence, observed_at_ms, updated_at_ms) VALUES ('openrouter', 'openrouter:01', 'm', 'requests', 0, ?, 'test', 1, ?, ?)`).run(now + 100_000, now, now);
    } finally { db.close(); }
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    expect(diag?.skipped['rate-limit']).toBe(1);
    expect(diag?.skipped.quota).toBeUndefined();
    expect(diag?.skipped['model-unavailable']).toBeUndefined();
    expect(diag?.eligible).toBe(0);
  });

  it('excludedReasons: excluded key uses given reason; key also rate-limited stays rate-limit', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(2);
    const c = keys.map(desc);
    const now = base;
    // Setup: first key rate-limited
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='cooldown', cooldown_until_ms=?, cooldown_reason='RATE_LIMIT' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now + 100_000);
    } finally { db.close(); }
    // Exclude second key with custom reason
    const excluded = new Set(['openrouter:02']);
    const excludedReasons = new Map<string, ProviderSkipReason>([['openrouter:02', 'context']]);
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: excluded, excludedReasons, now });
    expect(diag?.skipped['rate-limit']).toBe(1);
    expect(diag?.skipped.context).toBe(1);
  });

  // D4: excludedReasons additional test - key 01 rate-limited AND in excludedCredentialIds with reason 'context' -> skipped['rate-limit']===1 and skipped.context undefined
  it('excludedReasons: rate-limited key also excluded with context reason -> rate-limit wins, context not counted', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(2);
    const c = keys.map(desc);
    const now = base;
    // Setup: first key rate-limited
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='cooldown', cooldown_until_ms=?, cooldown_reason='RATE_LIMIT' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now + 100_000);
    } finally { db.close(); }
    // Exclude first key (the rate-limited one) with custom reason 'context'
    const excluded = new Set(['openrouter:01']);
    const excludedReasons = new Map<string, ProviderSkipReason>([['openrouter:01', 'context']]);
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: excluded, excludedReasons, now });
    expect(diag?.skipped['rate-limit']).toBe(1);
    expect(diag?.skipped.context).toBeUndefined();
  });

  it('diagnose() is read-only: full table dump before/after with expired cooldown key', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(2);
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    // Set first key to expired cooldown
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='cooldown', cooldown_until_ms=?, cooldown_reason='RATE_LIMIT' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run(now - 1000);
    } finally { db.close(); }

    // Dump ALL table rows BEFORE diagnose
    const dumpBefore = async (db: DatabaseSync) => ({
      pool: db.prepare('SELECT * FROM provider_pool_state ORDER BY rowid').all(),
      rotation: db.prepare('SELECT * FROM provider_rotation_state ORDER BY rowid').all(),
      credential: db.prepare('SELECT * FROM provider_credential_state ORDER BY rowid').all(),
      scopeBlocks: db.prepare('SELECT * FROM provider_scope_blocks ORDER BY rowid').all(),
      quota: db.prepare('SELECT * FROM provider_quota_state ORDER BY rowid').all(),
      breaker: db.prepare('SELECT * FROM provider_breaker_state ORDER BY rowid').all(),
      readiness: db.prepare('SELECT * FROM provider_model_readiness ORDER BY rowid').all(),
    });

    const dbReadOnly = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const before = await dumpBefore(dbReadOnly);
      const beforeDiag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
      const after = await dumpBefore(dbReadOnly);
      const afterDiag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
      expect(after).toEqual(before);
      expect(afterDiag).toEqual(beforeDiag);
      // Expired cooldown key should stay 'cooldown' (not flipped to 'active')
      const credState = dbReadOnly.prepare(`SELECT state FROM provider_credential_state WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).get();
      expect(credState?.state).toBe('cooldown');
    } finally { dbReadOnly.close(); }
  });

  it('secret slot replaced: old invalid/cooldown not counted for new secret', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(2, 'old');
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    // Mark first as invalid
    const db = new DatabaseSync(dbPath);
    try {
      db.prepare(`UPDATE provider_credential_state SET state='invalid' WHERE provider_id='openrouter' AND credential_id='openrouter:01'`).run();
    } finally { db.close(); }
    // Replace secret for first key
    const newKeys = creds(2, 'new');
    const newC = newKeys.map(desc);
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: newC, model: 'm', now });
    expect(diag?.eligible).toBe(2); // both should be active with new secret
    expect(diag?.skipped.invalid).toBeUndefined();
  });

  it('no raw secrets in JSON.stringify(diagnostics)', async () => {
    const dbPath = await fixture();
    const store = new ProviderStateStore(dbPath);
    const keys = creds(1, 'super-secret-key-123');
    const c = keys.map(desc);
    const now = base;
    await store.selectCredential({ providerId: 'openrouter', credentials: c, model: 'm', excludedCredentialIds: new Set(), now });
    const diag = store.diagnoseCredentials({ providerId: 'openrouter', credentials: c, model: 'm', now });
    const json = JSON.stringify(diag);
    expect(json).not.toContain('super-secret-key-123');
    expect(json).not.toContain('secret');
  });
});

describe('PersistentCredentialScheduler routing diagnostics', () => {
  async function failOnce(
    scheduler: PersistentCredentialScheduler,
    keys: ProviderSchedulerCredential[],
    status: number,
    message: string,
    at: number,
    retryAfterMs?: number,
  ) {
    const selected = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: at,
    });
    expect(selected.credential).not.toBeNull();
    scheduler.recordFailure({
      selection: selected.credential!.selection,
      decision: classifyAgentProviderFailure(new AgentProviderRequestError({
        status, message, ...(retryAfterMs ? { retryAfterMs } : {}),
      }), at),
      model: 'fixture-model',
      httpStatus: status,
      completedAtMs: at + 1,
    });
    return selected.credential!.id;
  }

  it('reports all-limit-or-quota only when every key is rate-limited', async () => {
    const scheduler = new PersistentCredentialScheduler(await fixture());
    const keys = credentials(2);
    const at = 6_000_000_000;
    const used = [
      await failOnce(scheduler, keys, 429, 'rate limit exceeded', at, 120_000),
      await failOnce(scheduler, keys, 429, 'rate limit exceeded', at + 2, 120_000),
    ];
    expect(used).toEqual(['openrouter:01', 'openrouter:02']);

    const none = await scheduler.select({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: at + 10,
    });
    expect(none.credential).toBeNull();
    expect(none.reason).toBe('no-eligible-credential');
    expect(none.diagnostics).toMatchObject({
      configured: 2, eligible: 0, status: 'all-limit-or-quota', skipped: { 'rate-limit': 2 },
    });
    expect(scheduler.diagnose({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: at + 10,
    })).toEqual(none.diagnostics);
  });

  it('reports a mixed state when one key is invalid and another is rate-limited', async () => {
    const scheduler = new PersistentCredentialScheduler(await fixture());
    const keys = credentials(2);
    const at = 7_000_000_000;
    await failOnce(scheduler, keys, 429, 'rate limit exceeded', at, 120_000);
    await failOnce(scheduler, keys, 401, 'invalid api key', at + 2);

    const diagnostics = scheduler.diagnose({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: at + 10,
    });
    expect(diagnostics).toMatchObject({
      configured: 2, eligible: 0, status: 'mixed', skipped: { 'rate-limit': 1, invalid: 1 },
    });
  });

  it('reports a provider outage as provider-open, never as rate-limit or quota exhaustion', async () => {
    const scheduler = new PersistentCredentialScheduler(await fixture());
    const keys = credentials(2);
    const at = 5_000_000_000;
    await failOnce(scheduler, keys, 503, 'service unavailable', at);
    await failOnce(scheduler, keys, 503, 'service unavailable', at + 2);

    // Below the breaker threshold a provider-scoped failure does not cool individual keys.
    const beforeOpen = scheduler.diagnose({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: at + 10,
    });
    expect(beforeOpen).toMatchObject({ configured: 2, eligible: 2, status: 'available', breaker: 'CLOSED' });
    expect(beforeOpen!.skipped['rate-limit']).toBeUndefined();
    expect(beforeOpen!.skipped.quota).toBeUndefined();

    await failOnce(scheduler, keys, 503, 'service unavailable', at + 4);
    const open = scheduler.diagnose({
      providerId: 'openrouter', model: 'fixture-model', credentials: keys, now: at + 10,
    });
    expect(open).not.toBeNull();
    expect(open!.status).toBe('provider-open');
    expect(open!.breaker).toBe('OPEN');
    expect(open!.status).not.toBe('all-limit-or-quota');
    expect(open!.skipped['rate-limit']).toBeUndefined();
    expect(open!.skipped.quota).toBeUndefined();
  });
});
