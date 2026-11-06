import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderStateStore } from '../src/agent-provider-state.js';
import { ProviderModelReadinessService } from '../src/agent-provider-readiness.js';
import { OpenAICompatibleProviderPool, type AgentProviderConfig } from '../src/agent-provider.js';
import { AgentChatService } from '../src/agent-chat-service.js';

// Fake keys only. The fake provider below decides each answer from the key it receives.
const KEYS = {
  good: 'sk-ant-fixture-GOOD-0001', second: 'sk-ant-fixture-SECOND-0002', revoked: 'sk-ant-fixture-REVOKED-0003',
  limited: 'sk-ant-fixture-LIMITED-0004', quota: 'sk-ant-fixture-QUOTA-0005', overloaded: 'sk-ant-fixture-OVERLOAD-0006',
  forbidden: 'sk-ant-fixture-FORBIDDEN-0007', html: 'sk-ant-fixture-HTML-0008', slow: 'sk-ant-fixture-SLOW-0009',
  broken: 'sk-ant-fixture-BROKEN-0010',
};

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const anthropicModel = (id: string, extra: Record<string, unknown> = {}) => ({
  type: 'model', id, display_name: id.replace('claude-', 'Claude ').replace(/-/g, ' '), created_at: '2026-09-21T00:00:00Z',
  lifecycle: 'active', max_input_tokens: 1_000_000, max_tokens: 128_000,
  capabilities: { effort: { supported: true, low: { supported: true }, medium: { supported: true }, high: { supported: true },
    xhigh: { supported: false }, max: { supported: true } } }, ...extra,
});

type Seen = { path: string; query: URLSearchParams; headers: IncomingMessage['headers'] };
async function fakeProvider() {
  const seen: Seen[] = [];
  const send = (response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    response.writeHead(status, { 'content-type': 'application/json', ...headers });
    response.end(JSON.stringify(body));
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture');
    seen.push({ path: url.pathname, query: url.searchParams, headers: request.headers });
    const key = String(request.headers['x-api-key'] ?? String(request.headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!url.pathname.endsWith('/v1/models')) return send(response, 404, { type: 'error', error: { type: 'not_found_error', message: 'Not found' } });
    switch (key) {
      case KEYS.good: case KEYS.second:
        if (request.headers['x-api-key'] === undefined) {
          // OpenAI-compatible catalog: one page.
          return send(response, 200, { object: 'list', data: [
            { id: 'vendor/model-a', name: 'Model A', context_length: 131_072, top_provider: { max_completion_tokens: 8_192 } },
            { id: 'vendor/model-b', context_length: 32_768 },
          ] });
        }
        if (!url.searchParams.get('after_id')) {
          return send(response, 200, { data: [anthropicModel('claude-opus-5-5'), anthropicModel('claude-sonnet-5-5', { max_input_tokens: 200_000, max_tokens: 64_000 })],
            has_more: true, first_id: 'claude-opus-5-5', last_id: 'claude-sonnet-5-5' });
        }
        return send(response, 200, { data: [
          anthropicModel(key === KEYS.good ? 'claude-haiku-5-5' : 'claude-fable-5-1', { capabilities: null }),
          anthropicModel('claude-old-1', { lifecycle: 'retired' }),
        ], has_more: false, first_id: 'claude-haiku-5-5', last_id: 'claude-old-1' });
      case KEYS.revoked:
        return send(response, 401, { type: 'error', error: { type: 'authentication_error', message: `invalid x-api-key ${key}` } });
      case KEYS.limited:
        return send(response, 429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '30' });
      case KEYS.quota:
        return send(response, 429, { error: { code: 'insufficient_quota', type: 'insufficient_quota', message: 'out of credit' } });
      case KEYS.overloaded:
        return send(response, 529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
      case KEYS.forbidden:
        return send(response, 403, { type: 'error', error: { type: 'permission_error', message: 'no access' } });
      case KEYS.html:
        response.writeHead(502, { 'content-type': 'text/html' });
        return response.end('<html>bad gateway</html>');
      case KEYS.broken:
        response.writeHead(200, { 'content-type': 'text/plain' });
        return response.end('not json');
      case KEYS.slow:
        return; // never answers
      default:
        return send(response, 401, { type: 'error', error: { type: 'authentication_error', message: 'unknown key' } });
    }
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return { seen, baseUrl: `http://127.0.0.1:${port}/v1`, origin: `127.0.0.1:${port}` };
}

async function service(timeoutMs = 2_000) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'provider-model-test-'));
  roots.push(root);
  return new ProviderModelReadinessService(new ProviderStateStore(path.join(root, 'provider-state.sqlite')), timeoutMs);
}

/** Nothing in the report or in anything written to the console may carry a key value or the credential-bearing URL. */
function expectNoSecrets(value: unknown, logged: unknown[][], origin: string) {
  const text = JSON.stringify(value) + JSON.stringify(logged);
  for (const key of Object.values(KEYS)) expect(text).not.toContain(key);
  expect(text).not.toContain(origin);
  expect(text).not.toContain('http://');
}
function captureConsole() {
  const logged: unknown[][] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(args); });
  }
  return logged;
}

describe('owner provider key test', () => {
  it('lists every Anthropic model across pages for each key and merges them', async () => {
    const provider = await fakeProvider();
    const logged = captureConsole();
    const report = await (await service()).testRoute({ id: 'anthropic', baseUrl: provider.baseUrl, model: 'claude-sonnet-5-5', workspaceId: 'wrkspc_fixture' },
      [{ id: 'anthropic:01', secret: KEYS.good }, { id: 'anthropic:02', secret: KEYS.second }]);

    expect(report.status).toBe('ok');
    expect(report.keys).toEqual([
      { credentialId: 'anthropic:01', ok: true, modelCount: 3 },
      { credentialId: 'anthropic:02', ok: true, modelCount: 3 },
    ]);
    expect(report.models.map(model => [model.id, model.keyCount])).toEqual([
      ['claude-opus-5-5', 2], ['claude-sonnet-5-5', 2], ['claude-haiku-5-5', 1], ['claude-fable-5-1', 1],
    ]);
    expect(report.models[0]).toEqual({ id: 'claude-opus-5-5', displayName: 'Claude opus 5 5', contextWindowTokens: 1_000_000,
      maxOutputTokens: 128_000, reasoningEfforts: ['low', 'medium', 'high', 'max'], keyCount: 2 });
    expect(report.models[1]).toEqual(expect.objectContaining({ contextWindowTokens: 200_000, maxOutputTokens: 64_000 }));
    expect(report.models.some(model => model.id === 'claude-old-1')).toBe(false);

    // GET /v1/models with the documented headers and cursor pagination, never the single-model lookup.
    expect(provider.seen.map(item => item.path)).toEqual(['/v1/models', '/v1/models', '/v1/models', '/v1/models']);
    expect(provider.seen.every(item => item.headers['anthropic-version'] === '2023-06-01' && item.headers['anthropic-workspace-id'] === 'wrkspc_fixture')).toBe(true);
    expect(provider.seen.every(item => item.query.get('limit') === '1000')).toBe(true);
    expect(provider.seen.filter(item => item.query.get('after_id') === 'claude-sonnet-5-5')).toHaveLength(2);
    expectNoSecrets(report, logged, provider.origin);
  });

  it('lists an OpenAI-compatible catalog with a bearer key', async () => {
    const provider = await fakeProvider();
    const report = await (await service()).testRoute({ id: 'openrouter', baseUrl: provider.baseUrl, model: 'vendor/model-a' },
      [{ id: 'openrouter:01', secret: KEYS.good }]);
    expect(report.status).toBe('ok');
    expect(report.models).toEqual([
      { id: 'vendor/model-a', displayName: 'Model A', contextWindowTokens: 131_072, maxOutputTokens: 8_192, keyCount: 1 },
      { id: 'vendor/model-b', contextWindowTokens: 32_768, maxOutputTokens: null, keyCount: 1 },
    ]);
    expect(provider.seen[0]!.headers.authorization).toBe(`Bearer ${KEYS.good}`);
    expect(provider.seen[0]!.query.has('limit')).toBe(false);
  });

  it('explains each failure cause per key without echoing provider text, keys or URLs', async () => {
    const provider = await fakeProvider();
    const logged = captureConsole();
    const keys = (['good', 'revoked', 'limited', 'quota', 'overloaded', 'forbidden', 'html', 'broken'] as const)
      .map((name, index) => ({ id: `anthropic:${String(index + 1).padStart(2, '0')}`, secret: KEYS[name] }));
    const report = await (await service()).testRoute({ id: 'anthropic', baseUrl: provider.baseUrl, model: 'claude-sonnet-5-5' },
      [...keys, { id: 'anthropic:09', secret: '' }]);

    expect(report.status).toBe('partial');
    const byKey = Object.fromEntries(report.keys.map(key => [key.credentialId, key.failure]));
    expect(byKey['anthropic:01']).toBeUndefined();
    expect(byKey['anthropic:02']).toEqual({ code: 'AUTH_REJECTED', httpStatus: 401, message: expect.stringContaining('rejected the API key') });
    expect(byKey['anthropic:03']).toEqual({ code: 'RATE_LIMITED', httpStatus: 429, retryAt: expect.any(String), message: expect.stringContaining('rate limiting') });
    expect(Date.parse(byKey['anthropic:03']!.retryAt!)).toBeGreaterThanOrEqual(Date.now() + 25_000);
    expect(byKey['anthropic:04']).toEqual(expect.objectContaining({ code: 'QUOTA_EXHAUSTED', httpStatus: 429 }));
    expect(byKey['anthropic:05']).toEqual(expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE', httpStatus: 529 }));
    expect(byKey['anthropic:06']).toEqual(expect.objectContaining({ code: 'PERMISSION_DENIED', httpStatus: 403 }));
    expect(byKey['anthropic:07']).toEqual(expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE', httpStatus: 502 }));
    expect(byKey['anthropic:08']).toEqual(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
    expect(byKey['anthropic:09']).toEqual(expect.objectContaining({ code: 'NO_KEY' }));
    expect(report.models.map(model => model.id)).toContain('claude-haiku-5-5');
    expect(JSON.stringify(report)).not.toMatch(/slow down|out of credit|no access|bad gateway|invalid x-api-key/);
    expectNoSecrets(report, logged, provider.origin);
  });

  it('separates an unreachable host, a timeout, a wrong base URL and an insecure endpoint', async () => {
    const provider = await fakeProvider();
    const logged = captureConsole();
    const closed = createServer();
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve));
    const closedPort = (closed.address() as AddressInfo).port;
    await new Promise(resolve => closed.close(resolve));
    const tested = await service(300);
    const one = async (baseUrl: string, secret: string) => (await tested.testRoute({ id: 'anthropic', baseUrl, model: null }, [{ id: 'anthropic:01', secret }])).keys[0]!.failure;

    expect(await one(`http://127.0.0.1:${closedPort}/v1`, KEYS.good)).toEqual(expect.objectContaining({ code: 'NETWORK_UNREACHABLE' }));
    expect(await one(provider.baseUrl, KEYS.slow)).toEqual(expect.objectContaining({ code: 'TIMEOUT' }));
    expect(await one(provider.baseUrl.replace('/v1', '/wrong'), KEYS.good)).toEqual(expect.objectContaining({ code: 'ENDPOINT_NOT_FOUND', httpStatus: 404 }));
    const insecure = await tested.testRoute({ id: 'anthropic', baseUrl: `http://provider.example/v1?key=${KEYS.good}`, model: null }, [{ id: 'anthropic:01', secret: KEYS.good }]);
    expect(insecure.keys[0]!.failure).toEqual(expect.objectContaining({ code: 'ENDPOINT_INSECURE' }));
    expect(insecure.status).toBe('failed');
    expect((await tested.testRoute({ id: 'anthropic', baseUrl: provider.baseUrl, model: null }, [])).failure).toEqual(expect.objectContaining({ code: 'NO_KEY' }));
    expectNoSecrets([insecure], logged, provider.origin);
  });

  it('runs through the provider pool and the chat service for a configured route only', async () => {
    const provider = await fakeProvider();
    const root = await mkdtemp(path.join(os.tmpdir(), 'provider-model-test-pool-'));
    roots.push(root);
    const config: AgentProviderConfig = {
      enabled: true, baseUrl: null, model: null, apiKey: null, requestTimeoutMs: 2_000, maxToolIterations: 4, maxProviderAttempts: 2,
      providerOrder: ['anthropic'],
      providers: [{ id: 'anthropic', baseUrl: provider.baseUrl, model: 'claude-sonnet-5-5', models: ['claude-sonnet-5-5', 'claude-opus-5-5'],
        credentials: [{ id: 'anthropic:01', secret: KEYS.good, ordinal: 1 }, { id: 'anthropic:02', secret: KEYS.revoked, ordinal: 2 }] }],
    };
    const pool = new OpenAICompatibleProviderPool(config, path.join(root, 'provider-state.sqlite'));
    expect(pool.testProviderModels('gonka')).toBeNull();
    const report = await pool.testProviderModels('anthropic')!;
    expect(report.status).toBe('partial');
    expect(report.keys.map(key => [key.credentialId, key.ok])).toEqual([['anthropic:01', true], ['anthropic:02', false]]);

    // Chat service: unknown routes are refused before any provider call, and concurrent tests share one run.
    const testProviderModels = vi.fn((id: string) => pool.testProviderModels(id));
    const chat = Object.assign(Object.create(AgentChatService.prototype), {
      runtime: { testProviderModels }, providerTests: new Map(),
      listProviders: () => [{ id: 'anthropic', model: 'claude-sonnet-5-5', configured: true, available: true }],
    }) as AgentChatService;
    await expect(chat.testProvider('gonka')).rejects.toThrow('AGENT_CHAT_PROVIDER_UNKNOWN');
    await expect(chat.testProvider(42)).rejects.toThrow('AGENT_CHAT_PROVIDER_UNKNOWN');
    const [first, second] = await Promise.all([chat.testProvider('anthropic'), chat.testProvider('anthropic')]);
    expect(first).toBe(second);
    expect(testProviderModels).toHaveBeenCalledTimes(1);
    await chat.testProvider('anthropic');
    expect(testProviderModels).toHaveBeenCalledTimes(2);
    expectNoSecrets(first, [], provider.origin);
  });
});
