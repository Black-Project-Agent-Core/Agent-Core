import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AgentProviderRequestError,
  classifyAgentProviderFailure,
} from '../src/agent-provider-errors.js';
import {
  PersistentCredentialScheduler,
  type ProviderSchedulerCredential,
} from '../src/agent-provider-scheduler.js';

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
  it('continues exact rotation after reconstruction', async () => {
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

    expect(seen).toEqual(['openrouter:01', 'openrouter:02', 'openrouter:03']);
    expect(fourth.credential?.id).toBe('openrouter:04');
  });
  it('persists rate-limit cooldown across restart and re-enables after expiry', async () => {
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
    expect(afterExpiry.credential?.id).toBe('openrouter:01');
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
    expect(recovered.credential?.id).toBe('openrouter:01');
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
    expect(released.credential?.id).toBe('openrouter:01');
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

  it('serializes concurrent selections per provider without losing rotation position', async () => {
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
      'openrouter:02',
      'openrouter:03',
      'openrouter:04',
    ]);
  });
});
