import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OpenAICompatibleProviderPool,
  AgentProviderPoolPausedError,
  type AgentProviderConfig,
  type AgentProviderRoutingEvent,
} from '../src/agent-provider.js';
import { loadConfig } from '../src/config.js';
import { ProviderStateStore } from '../src/agent-provider-state.js';
import { AgentProviderEmptyResponseError, AgentProviderRequestError, classifyAgentProviderFailure } from '../src/agent-provider-errors.js';
import { PersistentCredentialScheduler } from '../src/agent-provider-scheduler.js';

const roots: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixturePath() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'provider-pool-'));
  roots.push(root);
  return {
    root,
    statePath: path.join(root, 'provider-state.sqlite'),
  };
}

function success(content = 'ok') {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}
function config(keys: string[], maxProviderAttempts = 6): AgentProviderConfig {
  return {
    enabled: true,
    baseUrl: null,
    model: null,
    apiKey: null,
    requestTimeoutMs: 5_000,
    maxToolIterations: 4,
    maxProviderAttempts,
    providerOrder: ['openrouter'],
    providers: [{
      id: 'openrouter',
      baseUrl: 'http://127.0.0.1:12345/v1',
      model: 'fixture-model',
      credentials: keys.map((secret, index) => ({
        id: `openrouter:${String(index + 1).padStart(2, '0')}`,
        secret,
        ordinal: index + 1,
      })),
    }],
  };
}

function auth(init: RequestInit | undefined): string | null {
  return ((init?.headers ?? {}) as Record<string, string>).authorization ?? null;
}

// Protocol fixtures prove routing independently of live provider entitlement.
function fixtureFetch(handler: (url: URL, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: URL, init?: RequestInit) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{
      id: 'fixture-model', context_length: 131_072, supported_parameters: ['tools'], max_output_tokens: 4_096,
    }] }), { headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (body.tools?.[0]?.function?.name === 'agent_core_model_probe') return new Response(JSON.stringify({ choices: [{
      finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: 'probe', type: 'function',
        function: { name: 'agent_core_model_probe', arguments: JSON.stringify({ nonce: body.tools[0].function.parameters.properties.nonce.enum[0] }) } }] },
    }] }), { headers: { 'content-type': 'application/json' } });
    return handler(url, init);
  }));
}

describe('OpenAICompatibleProviderPool persistent routing', () => {
  it.each(['cancel','checkpoint-error','expired-callback','provider-error'] as const)('provider probe recovery releases %s without reporting provider success', async mode => {
    const {statePath}=await fixturePath();
    const settings=config(['fixture-secret']);
    let completionCalls=0;
    fixtureFetch(async () => {completionCalls++;return mode==='provider-error'
      ? new Response(JSON.stringify({choices:[]}),{status:200,headers:{'content-type':'application/json'}})
      : success();});
    const pool=new OpenAICompatibleProviderPool(settings,statePath);
    await pool.prepareReadiness();
    const db=new DatabaseSync(statePath);
    db.prepare(`INSERT INTO provider_breaker_state(provider_id,state,failure_count,half_open_probe_count,state_revision,updated_at_ms)
      VALUES ('openrouter','HALF_OPEN',3,0,4,?)`).run(Date.now());
    db.close();
    const controller=new AbortController();
    await expect(pool.complete([{role:'user',content:'fixture'}],[],undefined,controller.signal,{
      onAttempt:()=>{
        if(mode==='cancel')controller.abort(new Error('fixture cancel'));
        if(mode==='checkpoint-error')throw new Error('fixture checkpoint failure');
        if(mode==='expired-callback'){
          const read=new DatabaseSync(statePath,{readOnly:true});
          const deadline=read.prepare('SELECT retry_at_ms FROM provider_breaker_state WHERE provider_id=?').get('openrouter')!.retry_at_ms as number;
          read.close();
          vi.useFakeTimers();vi.setSystemTime(deadline+1);
        }
      },
    })).rejects.toBeInstanceOf(Error);
    const inspect=new DatabaseSync(statePath,{readOnly:true});
    const breaker=inspect.prepare('SELECT state,failure_count,half_open_probe_count FROM provider_breaker_state WHERE provider_id=?').get('openrouter');
    inspect.close();
    expect(breaker).toMatchObject(mode==='provider-error'
      ? {state:'OPEN',failure_count:4,half_open_probe_count:0}
      : {state:'HALF_OPEN',failure_count:3,half_open_probe_count:0});
    const next=await new PersistentCredentialScheduler(statePath).select({providerId:'openrouter',model:'fixture-model',credentials:settings.providers![0]!.credentials!});
    if(mode==='provider-error')expect(next.credential).toBeNull();
    else expect(next.credential).not.toBeNull();
    expect(completionCalls).toBe(mode==='provider-error'?1:0);
  });

  it('preserves numbered credential IDs from configuration', () => {
    const loaded = loadConfig({
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENROUTER_MODEL: 'fixture-model',
      OPENROUTER_API_KEY_01: 'key-one',
      OPENROUTER_API_KEY_02: 'key-two',
    }, process.cwd());
    const route = loaded.agentRuntime.providers?.find(item => item.id === 'openrouter');
    expect(route?.credentials?.map(item => [item.id, item.ordinal])).toEqual([
      ['openrouter:01', 1],
      ['openrouter:02', 2],
    ]);
  });
  it('keeps the successful global credential across sessions and reconstruction', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    fixtureFetch(async (_url: URL, init?: RequestInit) => {
      seen.push(auth(init) ?? '');
      return success();
    });

    const providerConfig = config(['secret-1', 'secret-2', 'secret-3', 'secret-4']);
    const first = new OpenAICompatibleProviderPool(providerConfig, statePath);
    for (let i = 0; i < 3; i += 1) {
      await first.complete([{ role: 'user', content: 'hello' }], [], `session-${i}`);
    }

    const reopened = new OpenAICompatibleProviderPool(providerConfig, statePath);
    await reopened.complete([{ role: 'user', content: 'hello again' }]);

    expect(seen).toEqual([
      'Bearer secret-1',
      'Bearer secret-1',
      'Bearer secret-1',
      'Bearer secret-1',
    ]);
  });

  it('rotates to a sibling credential on 429 and keeps the cooldown after reconstruction', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    fixtureFetch(async (_url: URL, init?: RequestInit) => {
      const header = auth(init) ?? '';
      seen.push(header);
      if (header === 'Bearer secret-1') {
        return new Response(JSON.stringify({ error: { message: 'rate limit exceeded' } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '120' },
        });
      }
      return success('fallback-ok');
    });
    const providerConfig = config(['secret-1', 'secret-2'], 2);
    const first = new OpenAICompatibleProviderPool(providerConfig, statePath);
    const result = await first.complete([{ role: 'user', content: 'rate test' }]);
    expect(result.content).toBe('fallback-ok');
    expect(seen).toEqual(['Bearer secret-1', 'Bearer secret-2']);

    const reopened = new OpenAICompatibleProviderPool(providerConfig, statePath);
    await reopened.complete([{ role: 'user', content: 'restart while cooling' }]);
    expect(seen.at(-1)).toBe('Bearer secret-2');
  });

  it('releases the locked credentials of one route, reports only a count, and ignores an unknown route', async () => {
    const { statePath } = await fixturePath();
    fixtureFetch(async (_url: URL, init?: RequestInit) => auth(init) === 'Bearer secret-1'
      ? new Response(JSON.stringify({ error: { message: 'rate limit exceeded' } }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '120' },
      })
      : success('fallback-ok'));
    const pool = new OpenAICompatibleProviderPool(config(['secret-1', 'secret-2'], 2), statePath);
    await pool.complete([{ role: 'user', content: 'rate test' }]);
    const locked = () => {
      const route = pool.health().routes?.find(item => item.id === 'openrouter');
      return (route?.cooldownKeyCount ?? 0) + (route?.quotaBlockedKeyCount ?? 0);
    };
    expect(locked()).toBe(1);
    const released = pool.resetRouteCredentials('openrouter');
    expect(released).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(released)).toBe(true);
    expect(locked()).toBe(0);
    expect(pool.resetRouteCredentials('ghost')).toBe(0);
  });

  it('moves to the next provider on provider-scoped failure and retains it for a new session', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    fixtureFetch(async (_url: URL, init?: RequestInit) => {
      const header = auth(init) ?? '';
      seen.push(header);
      if (header === 'Bearer route-a') {
        return new Response(JSON.stringify({ error: { message: 'service unavailable' } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return success('route-b-ok');
    });

    const providerConfig: AgentProviderConfig = {
      ...config([], 2),
      providerOrder: ['a', 'b'],
      providers: [
        {
          id: 'a', baseUrl: 'http://127.0.0.1:12345/v1', model: 'fixture-model',
          credentials: [{ id: 'a:01', secret: 'route-a', ordinal: 1 }],
        },
        {
          id: 'b', baseUrl: 'http://127.0.0.1:12346/v1', model: 'fixture-model',
          credentials: [{ id: 'b:01', secret: 'route-b', ordinal: 1 }],
        },
      ],
    };
    const pool = new OpenAICompatibleProviderPool(providerConfig, statePath);
    const result = await pool.complete([{ role: 'user', content: 'provider failover' }]);
    expect(result.content).toBe('route-b-ok');
    expect(seen).toEqual(['Bearer route-a', 'Bearer route-b']);
    const reopened = new OpenAICompatibleProviderPool(providerConfig, statePath);
    await reopened.complete([{ role: 'user', content: 'new session' }], [], 'session-b');
    expect(seen.at(-1)).toBe('Bearer route-b');
  });


  describe('user-pinned route', () => {
    const twoRoutes = (): AgentProviderConfig => ({
      ...config([], 2),
      providerOrder: ['a', 'b'],
      providers: [
        { id: 'a', baseUrl: 'http://127.0.0.1:12345/v1', model: 'fixture-model', credentials: [{ id: 'a:01', secret: 'route-a', ordinal: 1 }] },
        { id: 'b', baseUrl: 'http://127.0.0.1:12346/v1', model: 'fixture-model', credentials: [{ id: 'b:01', secret: 'route-b', ordinal: 1 }] },
      ],
    });

    it('sends the request to the chosen route even when another route is first in order', async () => {
      const { statePath } = await fixturePath();
      const seen: string[] = [];
      fixtureFetch(async (_url: URL, init?: RequestInit) => { seen.push(auth(init) ?? ''); return success('from-b'); });
      const pool = new OpenAICompatibleProviderPool(twoRoutes(), statePath);
      const result = await pool.complete([{ role: 'user', content: 'pin b' }], [], 'session-pin', undefined, { routeId: 'b' });
      expect(result).toMatchObject({ content: 'from-b', providerId: 'b' });
      expect(seen).toEqual(['Bearer route-b']);
    });

    it('never rotates away from the chosen route when it fails', async () => {
      const { statePath } = await fixturePath();
      const seen: string[] = [];
      fixtureFetch(async (_url: URL, init?: RequestInit) => {
        seen.push(auth(init) ?? '');
        return new Response(JSON.stringify({ error: { message: 'service unavailable' } }), { status: 503, headers: { 'content-type': 'application/json' } });
      });
      const pool = new OpenAICompatibleProviderPool(twoRoutes(), statePath);
      await expect(pool.complete([{ role: 'user', content: 'pin b fails' }], [], undefined, undefined, { routeId: 'b' }))
        .rejects.toBeInstanceOf(AgentProviderPoolPausedError);
      expect(seen.length).toBeGreaterThan(0);
      expect(new Set(seen)).toEqual(new Set(['Bearer route-b']));
    });

    it('keeps the chosen route when it answers empty and pauses instead of answering from another route', async () => {
      const { statePath } = await fixturePath();
      const seen: string[] = [];
      fixtureFetch(async (_url: URL, init?: RequestInit) => {
        seen.push(auth(init) ?? '');
        return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: null } }] }),
          { status: 200, headers: { 'content-type': 'application/json' } });
      });
      const pool = new OpenAICompatibleProviderPool(twoRoutes(), statePath);
      await expect(pool.complete([{ role: 'user', content: 'pin b empty' }], [], undefined, undefined, { routeId: 'b' }))
        .rejects.toBeInstanceOf(AgentProviderPoolPausedError);
      expect(seen.length).toBeGreaterThan(0);
      expect(new Set(seen)).toEqual(new Set(['Bearer route-b']));
    });

    it('rejects an unknown route before any provider request', async () => {
      const { statePath } = await fixturePath();
      const calls = vi.fn(async () => success());
      fixtureFetch(calls);
      const pool = new OpenAICompatibleProviderPool(twoRoutes(), statePath);
      await expect(pool.complete([{ role: 'user', content: 'pin nowhere' }], [], undefined, undefined, { routeId: 'nowhere' }))
        .rejects.toThrow('AGENT_RUNTIME_PROVIDER_ROUTE_UNAVAILABLE');
      expect(calls).not.toHaveBeenCalled();
    });
  });

  it('reports degraded scheduler health instead of silently resetting state', async () => {
    const { root } = await fixturePath();
    const unusableStatePath = path.join(root, 'state-as-directory');
    await mkdir(unusableStatePath);
    const pool = new OpenAICompatibleProviderPool(config(['secret-1']), unusableStatePath);
    const health = pool.health();
    expect(health.configured).toBe(true);
    expect(health.issue).toMatch(/^AGENT_RUNTIME_PROVIDER_STATE_UNAVAILABLE:/);
    expect(health.routes?.[0]?.issue).toMatch(/^AGENT_RUNTIME_PROVIDER_STATE_UNAVAILABLE:/);
  });

  it('never writes raw credential secrets into operational state or health', async () => {
    const { root, statePath } = await fixturePath();
    fixtureFetch(async () => success('secure'));
    const secrets = ['ultra-secret-one', 'ultra-secret-two'];
    const pool = new OpenAICompatibleProviderPool(config(secrets), statePath);

    await pool.complete([{ role: 'user', content: 'secure state' }]);
    const health = JSON.stringify(pool.health());
    for (const secret of secrets) expect(health).not.toContain(secret);

    const files = await readdir(root);
    const bytes = Buffer.concat(await Promise.all(
      files.map(name => readFile(path.join(root, name)).catch(() => Buffer.alloc(0))),
    ));
    const text = bytes.toString('latin1');
    for (const secret of secrets) expect(text).not.toContain(secret);
  });

  it('pauses an incomplete provider scan without claiming all keys are exhausted or jumping provider', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    fixtureFetch(async (_url, init) => {
      seen.push(auth(init) ?? '');
      if (auth(init) === 'Bearer a3') return success('last sibling');
      return new Response(JSON.stringify({ error: { message: 'rate limit' } }), { status: 429 });
    });
    const cfg = config(['a1', 'a2', 'a3'], 2);
    cfg.providers!.push({ id: 'b', baseUrl: 'http://127.0.0.1:12346/v1', model: 'fixture-model', apiKeys: ['b1'] });
    const pool = new OpenAICompatibleProviderPool(cfg, statePath);
    await expect(pool.complete([{ role: 'user', content: 'test' }])).rejects.toMatchObject({ reason: 'attempt-budget' });
    expect(seen).toEqual(['Bearer a1', 'Bearer a2']);
    expect((await pool.complete([{ role: 'user', content: 'resume' }])).content).toBe('last sibling');
    expect(seen.at(-1)).toBe('Bearer a3');
  });

  it('checks a sibling first during an outage and does not mark either credential quota exhausted', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    fixtureFetch(async (_url, init) => {
      seen.push(auth(init) ?? '');
      return auth(init) === 'Bearer a1' ? new Response('{}', { status: 503 }) : success();
    });
    const pool = new OpenAICompatibleProviderPool(config(['a1', 'a2']), statePath);
    await pool.complete([{ role: 'user', content: 'outage' }]);
    expect(seen).toEqual(['Bearer a1', 'Bearer a2']);
    expect(pool.health().routes?.[0]).toMatchObject({ invalidKeyCount: 0, quotaBlockedKeyCount: 0 });
  });

  it('skips cached readiness waits across attempt windows and reaches a compatible provider', async () => {
    const { statePath } = await fixturePath();
    const cfg = config(['a1', 'a2', 'a3'], 2);
    cfg.providers!.push({ id: 'b', baseUrl: 'http://127.0.0.1:12346/v1', model: 'fixture-model', apiKeys: ['b1'] });
    const seen: string[] = [];
    fixtureFetch(async (_url, init) => { seen.push(auth(init) ?? ''); return success(); });
    const qualifiedFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).endsWith('/models') && auth(init)?.startsWith('Bearer a')) return new Response('{}', { status: 503 });
      return qualifiedFetch(url, init);
    }));
    const pool = new OpenAICompatibleProviderPool(cfg, statePath);
    await expect(pool.complete([{ role: 'user', content: 'initial incomplete scan' }])).rejects.toMatchObject({ reason: 'attempt-budget' });
    expect(seen).toEqual([]);
    expect((await pool.complete([{ role: 'user', content: 'resume scan' }])).content).toBe('ok');
    expect(seen).toEqual(['Bearer b1']);
    await new OpenAICompatibleProviderPool(cfg, statePath).complete([{ role: 'user', content: 'new session' }]);
    expect(seen).toEqual(['Bearer b1', 'Bearer b1']);
    expect(pool.health().routes?.[0]).toMatchObject({ invalidKeyCount: 0, quotaBlockedKeyCount: 0 });
  });

  it('refreshes expired unproven readiness without blocking a ready route or changing its cursor', async () => {
    const { statePath } = await fixturePath();
    const cfg = config(['a1', 'a2', 'a3'], 2);
    cfg.providers!.push({ id: 'b', baseUrl: 'http://127.0.0.1:12346/v1', model: 'fixture-model', apiKeys: ['b1'] });
    const seen: string[] = [];
    fixtureFetch(async (_url, init) => { seen.push(auth(init) ?? ''); return success(); });
    const qualifiedFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).endsWith('/models') && auth(init)?.startsWith('Bearer a')) return new Response('{}', { status: 503 });
      return qualifiedFetch(url, init);
    }));
    const pool = new OpenAICompatibleProviderPool(cfg, statePath);
    await pool.prepareReadiness();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    expect((await pool.complete([{ role: 'user', content: 'old negative result' }])).content).toBe('ok');
    await pool.prepareReadiness();
    expect(seen).toEqual(['Bearer b1']);
    expect((await pool.complete([{ role: 'user', content: 'sticky success' }])).content).toBe('ok');
    expect(seen).toEqual(['Bearer b1', 'Bearer b1']);
  });

  it('keeps readiness preparation coalesced until every worker settles after a failure', async () => {
    const { statePath } = await fixturePath();
    fixtureFetch(async () => success());
    const qualifiedFetch = globalThis.fetch;
    const siblingGate = Promise.withResolvers<void>();
    const siblingSaved = Promise.withResolvers<void>();
    const failed = Promise.withResolvers<void>();
    const failure = new Error('fixture-readiness-write-failed');
    const originalSave = ProviderStateStore.prototype.saveModelReadiness;
    const save = vi.spyOn(ProviderStateStore.prototype, 'saveModelReadiness').mockImplementation(function (this: ProviderStateStore, ...args) {
      if (args[1] === 'openrouter:01') {
        failed.resolve();
        throw failure;
      }
      originalSave.call(this, ...args);
      siblingSaved.resolve();
    });
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).endsWith('/models') && auth(init) === 'Bearer a2') await siblingGate.promise;
      return qualifiedFetch(url, init);
    }));
    const pool = new OpenAICompatibleProviderPool(config(['a1', 'a2']), statePath);
    const preparation = pool.prepareReadiness();
    let settled = false;
    const outcome = preparation.then(() => { settled = true; return null; }, error => { settled = true; return error; });
    try {
      await failed.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(pool.prepareReadiness()).toBe(preparation);
      siblingGate.resolve();
      expect(await outcome).toBe(failure);
      save.mockRestore();
      const retry = pool.prepareReadiness();
      expect(retry).not.toBe(preparation);
      await retry;
      expect(pool.health().routes?.[0]?.modelReadiness?.ready).toBe(2);
    } finally {
      siblingGate.resolve();
      await siblingSaved.promise;
      await outcome;
      save.mockRestore();
    }
  });

  it('routes after actual model qualification supersedes a historical model block without erasing it', async () => {
    const { statePath } = await fixturePath();
    const cfg = config(['qualified-key']);
    const scheduler = new PersistentCredentialScheduler(statePath);
    const failedAt = Date.now() - 1_000;
    const selected = (await scheduler.select({ providerId: 'openrouter', model: 'fixture-model',
      credentials: cfg.providers![0]!.credentials!, now: failedAt - 1 })).credential!;
    scheduler.recordFailure({ selection: selected.selection, model: 'fixture-model', httpStatus: 404,
      completedAtMs: failedAt, decision: classifyAgentProviderFailure(
        new AgentProviderRequestError({ status: 404, message: 'missing endpoint' }), failedAt) });
    const readBlocks = () => {
      const db = new DatabaseSync(statePath, { readOnly: true });
      try { return db.prepare('SELECT * FROM provider_scope_blocks').all(); }
      finally { db.close(); }
    };
    const historical = readBlocks();
    expect(historical).toEqual([expect.objectContaining({ model: 'fixture-model', reason: 'MODEL_NOT_FOUND' })]);
    const seen: string[] = [];
    fixtureFetch(async (_url, init) => { seen.push(auth(init) ?? ''); return success('qualified-route'); });
    const pool = new OpenAICompatibleProviderPool(cfg, statePath);
    const onAttempt = vi.fn();
    const task = () => pool.complete([{ role: 'user', content: 'use the qualified model' }], [], undefined, undefined, { onAttempt });
    await expect(task()).rejects.toMatchObject({ reason: 'unavailable' });
    expect(onAttempt).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await pool.prepareReadiness();
    expect(pool.health().routes?.[0]?.modelReadiness?.ready).toBe(1);
    expect(seen).toEqual([]);
    expect(await task()).toMatchObject({ content: 'qualified-route', model: 'fixture-model' });
    expect(onAttempt).toHaveBeenCalledOnce();
    expect(seen).toEqual(['Bearer qualified-key']);
    expect(readBlocks()).toEqual(historical);
  });

  it('does not silently upgrade a pinned OpenRouter model for a larger task', async () => {
    const { statePath } = await fixturePath();
    const cfg = config(['qualified-key']);
    const probes: string[] = [], tasks: string[] = [];
    fixtureFetch(async (_url, init) => { tasks.push(JSON.parse(String(init?.body)).model); return success(); });
    const baseFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [
        { id: 'fixture-model', context_length: 4_096, max_output_tokens: 1_024, supported_parameters: ['tools'] },
        { id: 'larger-model', context_length: 131_072, max_output_tokens: 4_096, supported_parameters: ['tools'] },
      ] }), { headers: { 'content-type': 'application/json' } });
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.tools?.[0]?.function?.name === 'agent_core_model_probe') probes.push(body.model);
      return baseFetch(url, init);
    }));
    const pool = new OpenAICompatibleProviderPool(cfg, statePath);
    await pool.prepareReadiness();
    await expect(pool.complete([{ role: 'user', content: 'x'.repeat(6_000) }])).rejects.toMatchObject({ reason: 'unavailable' });
    expect(probes.length).toBeGreaterThan(0);
    expect(probes.every(model => model === 'fixture-model')).toBe(true);
    expect(tasks).toEqual([]);
    expect(pool.health().routes?.[0]?.modelReadiness?.models ?? []).not.toContain('larger-model');
  });

  it('rechecks replacement protection on a provider route that permits alternatives', async () => {
    const { statePath } = await fixturePath();
    const cfg = config(['qualified-key']);
    cfg.providers![0]!.id = 'sandbox';
    cfg.providers![0]!.credentials = cfg.providers![0]!.credentials!.map(item => ({ ...item,
      id: item.id.replace(/^openrouter:/, 'sandbox:') }));
    cfg.providerOrder = ['sandbox'];
    const scheduler = new PersistentCredentialScheduler(statePath);
    const failedAt = Date.now() - 1_000;
    const selected = (await scheduler.select({ providerId: 'sandbox', model: 'larger-model',
      credentials: cfg.providers![0]!.credentials!, now: failedAt - 1 })).credential!;
    scheduler.recordFailure({ selection: selected.selection, model: 'larger-model', httpStatus: 413,
      completedAtMs: failedAt, decision: classifyAgentProviderFailure(
        new AgentProviderRequestError({ status: 413, message: 'context window exceeded' }), failedAt) });
    const tasks: string[] = [];
    const probes: string[] = [];
    fixtureFetch(async (_url, init) => { tasks.push(JSON.parse(String(init?.body)).model); return success(); });
    const qualifiedFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [
        { id: 'fixture-model', context_length: 4_096, max_output_tokens: 1_024, supported_parameters: ['tools'] },
        { id: 'larger-model', context_length: 131_072, max_output_tokens: 4_096, supported_parameters: ['tools'] },
      ] }), { headers: { 'content-type': 'application/json' } });
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.tools?.[0]?.function?.name === 'agent_core_model_probe') probes.push(body.model);
      return qualifiedFetch(url, init);
    }));
    const pool = new OpenAICompatibleProviderPool(cfg, statePath);
    await pool.prepareReadiness();
    expect(pool.health().routes?.[0]?.modelReadiness?.models).toEqual(['fixture-model']);
    await expect(pool.complete([{ role: 'user', content: 'x'.repeat(6_000) }])).rejects.toMatchObject({ reason: 'unavailable' });
    expect(probes).toEqual(['fixture-model', 'larger-model']);
    expect(pool.health().routes?.[0]?.modelReadiness?.models).toEqual(['larger-model']);
    expect(tasks).toEqual([]);
  });

  it('exhausts sibling keys on a pinned provider before selecting a different provider', async () => {
    const { statePath } = await fixturePath();
    const cfg = config(['primary-1', 'primary-2'], 3);
    cfg.providerOrder = ['openrouter', 'secondary'];
    cfg.providers!.push({
      id: 'secondary', baseUrl: 'http://127.0.0.1:12346/v1', model: 'fixture-model',
      credentials: [{ id: 'secondary:01', secret: 'secondary-1', ordinal: 1 }],
    });
    const seen: Array<{ url: string; key: string; model: string }> = [];
    fixtureFetch(async (url, init) => {
      const key = auth(init) ?? '';
      const body = JSON.parse(String(init?.body ?? '{}'));
      seen.push({ url: String(url), key, model: body.model });
      if (key === 'Bearer primary-1' || key === 'Bearer primary-2') {
        return new Response(JSON.stringify({ error: { message: 'temporary rate limit' } }), {
          status: 429, headers: { 'content-type': 'application/json', 'retry-after': '120' },
        });
      }
      return success('secondary-success');
    });
    const pool = new OpenAICompatibleProviderPool(cfg, statePath);
    expect((await pool.complete([{ role: 'user', content: 'fixture only' }])).content).toBe('secondary-success');
    expect(seen.map(item => item.key)).toEqual([
      'Bearer primary-1', 'Bearer primary-2', 'Bearer secondary-1',
    ]);
    expect(seen.map(item => item.model)).toEqual(['fixture-model', 'fixture-model', 'fixture-model']);
    expect(seen[0]!.url).toContain(':12345/');
    expect(seen[1]!.url).toContain(':12345/');
    expect(seen[2]!.url).toContain(':12346/');
    expect(pool.health().routes?.find(route => route.id === 'openrouter')).toMatchObject({
      invalidKeyCount: 0, quotaBlockedKeyCount: 0,
    });
  });

  it('separates limit, quota, authentication, model access, provider outage and attempt budget', () => {
    const cases: Array<[number, string, string, string]> = [
      [429, 'temporary rate limit', 'RATE_LIMIT', 'model-credential'],
      [429, 'daily quota exceeded', 'QUOTA_EXHAUSTED', 'credential'],
      [402, 'insufficient credit', 'CREDIT_EXHAUSTED', 'credential'],
      [401, 'invalid api key', 'AUTH_INVALID', 'credential'],
      [403, 'model access denied', 'MODEL_ACCESS', 'model-credential'],
      [404, 'model not found', 'MODEL_NOT_FOUND', 'model-provider'],
      [503, 'service unavailable', 'PROVIDER_TRANSIENT', 'provider'],
    ];
    for (const [status, message, kind, scope] of cases) {
      const decision = classifyAgentProviderFailure(new AgentProviderRequestError({ status, message }));
      expect(decision.failureClass).toBe(kind);
      expect(decision.scope).toBe(scope);
      expect(decision.shouldFailover).toBe(true);
    }
    const invalid = classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 400, message: 'invalid request payload',
    }));
    expect(invalid).toMatchObject({ failureClass: 'REQUEST_INVALID', shouldFailover: false });
    expect(classifyAgentProviderFailure(new AgentProviderRequestError({
      status: 400, message: 'opaque provider response', safeCode: 'model_not_found',
    }))).toMatchObject({ failureClass: 'MODEL_NOT_FOUND', scope: 'model-provider' });
    expect(new AgentProviderPoolPausedError('attempt-budget', null).reason).toBe('attempt-budget');
  });
});

function limited(message = 'temporary rate limit', retryAfter = '120') {
  return new Response(JSON.stringify({ error: { message } }), {
    status: 429, headers: { 'content-type': 'application/json', 'retry-after': retryAfter },
  });
}
function httpFailure(status: number, message: string) {
  return new Response(JSON.stringify({ error: { message } }), {
    status, headers: { 'content-type': 'application/json' },
  });
}
function twoRoutes(primaryKeys: string[], maxProviderAttempts = 6): AgentProviderConfig {
  const cfg = config(primaryKeys, maxProviderAttempts);
  cfg.providerOrder = ['openrouter', 'secondary'];
  cfg.providers!.push({
    id: 'secondary', baseUrl: 'http://127.0.0.1:12346/v1', model: 'fixture-model',
    credentials: [{ id: 'secondary:01', secret: 'secondary-1', ordinal: 1 }],
  });
  return cfg;
}
async function routed(
  pool: OpenAICompatibleProviderPool,
  events: AgentProviderRoutingEvent[],
  attemptLimit?: number,
) {
  return pool.complete([{ role: 'user', content: 'fixture only' }], [], undefined, undefined, {
    ...(attemptLimit === undefined ? {} : { attemptLimit }),
    onRouting: event => { events.push(event); },
  });
}

describe('OpenAICompatibleProviderPool routing evidence', () => {
  it('records key rotation inside a provider with cause, retry time and sibling counts', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    fixtureFetch(async (_url, init) => {
      const key = auth(init) ?? '';
      seen.push(key);
      return key === 'Bearer primary-1' ? limited() : success('primary-2-success');
    });
    const events: AgentProviderRoutingEvent[] = [];
    const before = Date.now();
    const pool = new OpenAICompatibleProviderPool(twoRoutes(['primary-1', 'primary-2'], 4), statePath);
    expect((await routed(pool, events)).content).toBe('primary-2-success');

    expect(seen).toEqual(['Bearer primary-1', 'Bearer primary-2']);
    expect(events.map(event => event.type)).toEqual(['attempt', 'failure', 'attempt', 'success']);
    const [first, failed, second, done] = events as any[];
    expect(first).toMatchObject({
      attempt: 1, attemptLimit: 4, transition: 'initial', cause: null, from: null,
      to: { providerId: 'openrouter', credentialId: 'openrouter:01', model: 'fixture-model' },
      selection: { configured: 2, eligible: 2, status: 'available' },
    });
    expect(first.selection.skipped).toEqual({});
    expect(failed).toMatchObject({
      attempt: 1, failureClass: 'RATE_LIMIT', scope: 'model-credential', httpStatus: 429, failover: true,
      key: { providerId: 'openrouter', credentialId: 'openrouter:01', model: 'fixture-model' },
    });
    expect(failed.retryAtMs).toBeGreaterThanOrEqual(before + 100_000);
    expect(second).toMatchObject({
      attempt: 2, transition: 'sibling-key', cause: 'RATE_LIMIT',
      from: { providerId: 'openrouter', credentialId: 'openrouter:01' },
      to: { providerId: 'openrouter', credentialId: 'openrouter:02', model: 'fixture-model' },
      selection: { configured: 2, eligible: 1, status: 'available' },
    });
    expect(second.selection.skipped).toEqual({ 'rate-limit': 1 });
    expect(done).toMatchObject({ attempt: 2, key: { providerId: 'openrouter', credentialId: 'openrouter:02' } });
    expect(events.some(event => (event as any).to?.providerId === 'secondary')).toBe(false);
    expect(JSON.stringify(events)).not.toMatch(/primary-[12]|secondary-1|Bearer/i);
  });

  it('leaves a provider only after every sibling is limited and states why in the switch', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    fixtureFetch(async (_url, init) => {
      const key = auth(init) ?? '';
      seen.push(key);
      return key.startsWith('Bearer primary-') ? limited() : success('secondary-success');
    });
    const events: AgentProviderRoutingEvent[] = [];
    const pool = new OpenAICompatibleProviderPool(twoRoutes(['primary-1', 'primary-2'], 4), statePath);
    expect((await routed(pool, events)).content).toBe('secondary-success');

    expect(seen).toEqual(['Bearer primary-1', 'Bearer primary-2', 'Bearer secondary-1']);
    const attempts = events.filter(event => event.type === 'attempt') as any[];
    expect(attempts.map(event => [event.to.providerId, event.to.credentialId, event.transition])).toEqual([
      ['openrouter', 'openrouter:01', 'initial'],
      ['openrouter', 'openrouter:02', 'sibling-key'],
      ['secondary', 'secondary:01', 'provider-switch'],
    ]);
    expect(attempts[2]).toMatchObject({
      attempt: 3, cause: 'RATE_LIMIT',
      from: { providerId: 'openrouter', credentialId: 'openrouter:02' },
      left: { providerId: 'openrouter', reason: 'siblings-unavailable',
        diagnostics: { configured: 2, eligible: 0, status: 'all-limit-or-quota' } },
    });
    expect(attempts[2].left.diagnostics.skipped).toEqual({ 'rate-limit': 2 });
    expect(attempts[2].selection).toMatchObject({ configured: 1, eligible: 1, status: 'available' });
  });

  it('reports mixed key states as mixed and never as all limited', async () => {
    const { statePath } = await fixturePath();
    fixtureFetch(async (_url, init) => {
      const key = auth(init) ?? '';
      if (key === 'Bearer k1') return httpFailure(401, 'invalid api key');
      if (key === 'Bearer k2') return limited();
      return httpFailure(503, 'service unavailable');
    });
    const events: AgentProviderRoutingEvent[] = [];
    const pool = new OpenAICompatibleProviderPool(config(['k1', 'k2', 'k3'], 6), statePath);
    await expect(routed(pool, events)).rejects.toMatchObject({ name: 'AgentProviderPoolPausedError', reason: 'unavailable' });

    const failures = events.filter(event => event.type === 'failure') as any[];
    expect(failures.map(event => [event.key.credentialId, event.failureClass, event.scope])).toEqual([
      ['openrouter:01', 'AUTH_INVALID', 'credential'],
      ['openrouter:02', 'RATE_LIMIT', 'model-credential'],
      ['openrouter:03', 'PROVIDER_TRANSIENT', 'provider'],
    ]);
    const paused = events.at(-1) as any;
    expect(paused).toMatchObject({ type: 'paused', reason: 'unavailable', attempt: 3, attemptLimit: 6 });
    const route = paused.routes.find((item: any) => item.providerId === 'openrouter');
    expect(route).toMatchObject({ configured: 3, eligible: 0, status: 'mixed' });
    expect(route.skipped).toEqual({ invalid: 1, 'rate-limit': 1, transient: 1 });
    expect(paused.routes.some((item: any) => item.status === 'all-limit-or-quota')).toBe(false);
  });

  it('reports all-limit-or-quota only when every key is a limit or quota', async () => {
    const { statePath } = await fixturePath();
    fixtureFetch(async (_url, init) => (auth(init) === 'Bearer k1'
      ? limited() : httpFailure(429, 'daily quota exceeded')));
    const events: AgentProviderRoutingEvent[] = [];
    const pool = new OpenAICompatibleProviderPool(config(['k1', 'k2'], 6), statePath);
    await expect(routed(pool, events)).rejects.toBeInstanceOf(AgentProviderPoolPausedError);
    const paused = events.at(-1) as any;
    const route = paused.routes.find((item: any) => item.providerId === 'openrouter');
    expect(route).toMatchObject({ configured: 2, eligible: 0, status: 'all-limit-or-quota' });
    expect(route.skipped).toEqual({ 'rate-limit': 1, quota: 1 });
  });

  it('does not claim exhaustion when the attempt window ends with an untried sibling', async () => {
    const { statePath } = await fixturePath();
    fixtureFetch(async () => limited());
    const events: AgentProviderRoutingEvent[] = [];
    const pool = new OpenAICompatibleProviderPool(config(['k1', 'k2', 'k3'], 2), statePath);
    await expect(routed(pool, events)).rejects.toMatchObject({ reason: 'attempt-budget' });
    const paused = events.at(-1) as any;
    expect(paused).toMatchObject({ type: 'paused', reason: 'attempt-budget', attempt: 2, attemptLimit: 2 });
    const route = paused.routes.find((item: any) => item.providerId === 'openrouter');
    expect(route).toMatchObject({ configured: 3, eligible: 1, status: 'available' });
    expect(route.skipped).toEqual({ 'rate-limit': 2 });
  });

  it('treats an empty reply as a temporary failure: sibling key next, no success recorded, no rate-limit escalation', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    const events: AgentProviderRoutingEvent[] = [];
    fixtureFetch(async (_url: URL, init?: RequestInit) => {
      const header = auth(init) ?? '';
      seen.push(header);
      if (header === 'Bearer secret-1') return new Response(JSON.stringify({
        choices: [{ finish_reason: 'stop', message: { content: '', tool_calls: [] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      return success('fallback-ok');
    });
    const pool = new OpenAICompatibleProviderPool(config(['secret-1', 'secret-2'], 2), statePath);
    const result = await pool.complete([{ role: 'user', content: 'empty test' }], [], undefined, undefined,
      { onRouting: event => { events.push(event); } });
    expect(result.content).toBe('fallback-ok');
    expect(seen).toEqual(['Bearer secret-1', 'Bearer secret-2']);
    expect(events.filter(event => event.type === 'success').map(event => event.key.credentialId)).toEqual(['openrouter:02']);
    expect(events.find(event => event.type === 'failure')).toMatchObject({
      key: { credentialId: 'openrouter:01' }, failureClass: 'EMPTY_RESPONSE', scope: 'model-credential', httpStatus: null, failover: true,
    });
    const db = new DatabaseSync(statePath, { readOnly: true });
    const row = db.prepare('SELECT backoff_level, last_error_class FROM provider_credential_state WHERE credential_id = ?').get('openrouter:01') as any;
    db.close();
    expect(row).toMatchObject({ backoff_level: 0, last_error_class: 'EMPTY_RESPONSE' });
    const decision = classifyAgentProviderFailure(new AgentProviderEmptyResponseError('stop'));
    expect(decision).toMatchObject({ failureClass: 'EMPTY_RESPONSE', scope: 'model-credential', shouldFailover: true,
      terminalCredential: false, affectsProviderBreaker: false });
    expect(decision.cooldownMs).toBeLessThanOrEqual(60_000);
  });

  it('keeps a request-scoped failure from rotating or cooling any key', async () => {
    const { statePath } = await fixturePath();
    let call = 0;
    const seen: string[] = [];
    fixtureFetch(async (_url, init) => {
      seen.push(auth(init) ?? '');
      call += 1;
      return call === 1 ? httpFailure(400, 'invalid request payload') : success('after-payload');
    });
    const events: AgentProviderRoutingEvent[] = [];
    const pool = new OpenAICompatibleProviderPool(config(['k1', 'k2'], 4), statePath);
    await expect(routed(pool, events)).rejects.toMatchObject({ status: 400 });
    expect(events.map(event => event.type)).toEqual(['attempt', 'failure']);
    expect(events[1]).toMatchObject({ failureClass: 'REQUEST_INVALID', scope: 'request', failover: false, retryAtMs: null });
    expect(pool.health().routes?.[0]).toMatchObject({ cooldownKeyCount: 0, quotaBlockedKeyCount: 0, invalidKeyCount: 0 });

    const next: AgentProviderRoutingEvent[] = [];
    expect((await routed(pool, next)).content).toBe('after-payload');
    expect(seen).toEqual(['Bearer k1', 'Bearer k1']);
    expect(next[0]).toMatchObject({ type: 'attempt', transition: 'keep', to: { credentialId: 'openrouter:01' } });
  });
});
