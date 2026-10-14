import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OpenAICompatibleProviderPool,
  type AgentProviderConfig,
} from '../src/agent-provider.js';
import { loadConfig } from '../src/config.js';

const roots: string[] = [];

afterEach(async () => {
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

describe('OpenAICompatibleProviderPool persistent routing', () => {
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
  it('continues the real provider-pool rotation after reconstruction', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init?: RequestInit) => {
      seen.push(auth(init) ?? '');
      return success();
    }));

    const providerConfig = config(['secret-1', 'secret-2', 'secret-3', 'secret-4']);
    const first = new OpenAICompatibleProviderPool(providerConfig, statePath);
    for (let i = 0; i < 3; i += 1) {
      await first.complete([{ role: 'user', content: 'hello' }]);
    }

    const reopened = new OpenAICompatibleProviderPool(providerConfig, statePath);
    await reopened.complete([{ role: 'user', content: 'hello again' }]);

    expect(seen).toEqual([
      'Bearer secret-1',
      'Bearer secret-2',
      'Bearer secret-3',
      'Bearer secret-4',
    ]);
  });

  it('rotates to a sibling credential on 429 and keeps the cooldown after reconstruction', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init?: RequestInit) => {
      const header = auth(init) ?? '';
      seen.push(header);
      if (header === 'Bearer secret-1') {
        return new Response(JSON.stringify({ error: { message: 'rate limit exceeded' } }), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '120' },
        });
      }
      return success('fallback-ok');
    }));
    const providerConfig = config(['secret-1', 'secret-2'], 2);
    const first = new OpenAICompatibleProviderPool(providerConfig, statePath);
    const result = await first.complete([{ role: 'user', content: 'rate test' }]);
    expect(result.content).toBe('fallback-ok');
    expect(seen).toEqual(['Bearer secret-1', 'Bearer secret-2']);

    const reopened = new OpenAICompatibleProviderPool(providerConfig, statePath);
    await reopened.complete([{ role: 'user', content: 'restart while cooling' }]);
    expect(seen.at(-1)).toBe('Bearer secret-2');
  });

  it('moves to the next provider on provider-scoped failure', async () => {
    const { statePath } = await fixturePath();
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init?: RequestInit) => {
      const header = auth(init) ?? '';
      seen.push(header);
      if (header === 'Bearer route-a') {
        return new Response(JSON.stringify({ error: { message: 'service unavailable' } }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return success('route-b-ok');
    }));

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
    vi.stubGlobal('fetch', vi.fn(async () => success('secure')));
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
});
