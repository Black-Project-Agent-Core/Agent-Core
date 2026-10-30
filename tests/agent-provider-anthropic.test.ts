import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider, OpenAICompatibleProviderPool, validateAnthropicContent,
  type AgentAnthropicContentBlock, type AgentModelMessage, type AgentModelTool } from '../src/agent-provider.js';
import { AgentProviderRequestError } from '../src/agent-provider-errors.js';

const config = {
  enabled: true,
  baseUrl: 'https://api.anthropic.com/v1/',
  model: 'claude-sonnet-5-5',
  apiKey: 'fixture-secret',
  requestTimeoutMs: 5_000,
  maxToolIterations: 4,
};
const tool: AgentModelTool = { type: 'function', function: { name: 'read_file', description: 'Read a file',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } };
const provider = () => new OpenAICompatibleProvider(config, undefined, 'anthropic');
const message = (content: unknown[] = [{ type: 'text', text: 'Done' }], extra = {}) => ({
  type: 'message', role: 'assistant', model: 'claude-fixture-resolved', content, stop_reason: 'end_turn',
  usage: { input_tokens: 12, output_tokens: 3 }, ...extra,
});
const json = (payload: unknown, init?: ResponseInit) => new Response(JSON.stringify(payload), {
  headers: { 'content-type': 'application/json' }, ...init,
});
const roots: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('Anthropic native Messages provider', () => {
  it.each(['claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'])('pins selected model %s without changing the configured default', async selectedModel => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'provider-anthropic-model-'));
    roots.push(root);
    const seen: Array<{ path: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : null;
      seen.push({ path: url.pathname, body });
      if (!body) return json({ id: url.pathname.split('/').at(-1), max_input_tokens: 131_072, max_tokens: 4_096,
        capabilities: { effort: { supported: true, low: { supported: true }, high: { supported: true } } } });
      if (body.tools?.[0]?.name === 'agent_core_model_probe') return json(message([
        { type: 'tool_use', id: 'probe', name: 'agent_core_model_probe', input: { nonce: body.tools[0].input_schema.properties.nonce.enum[0] } },
      ], { model: body.model, stop_reason: 'tool_use' }));
      return json(message(undefined, { model: body.model }));
    }));
    const pool = new OpenAICompatibleProviderPool({ ...config, baseUrl: null, model: null, apiKey: null,
      providers: [{ id: 'anthropic', baseUrl: config.baseUrl, model: config.model, models: [config.model, selectedModel],
        credentials: [{ id: 'anthropic:01', ordinal: 1, secret: 'fixture-one' }] }] }, path.join(root, 'provider-state.sqlite'));
    expect(await pool.complete([{ role: 'user', content: 'Selected' }], [], undefined, undefined,
      { routeId: 'anthropic', model: selectedModel })).toMatchObject({ model: selectedModel, resolvedModel: selectedModel });
    expect(await pool.complete([{ role: 'user', content: 'Default' }], [], undefined, undefined,
      { routeId: 'anthropic' })).toMatchObject({ model: config.model });
    expect(seen.filter(item => !item.body).map(item => item.path)).toEqual(['/v1/models/' + selectedModel, '/v1/models/' + config.model]);
    expect(seen.filter(item => item.body && item.body.tools?.[0]?.name !== 'agent_core_model_probe').map(item => item.body.model))
      .toEqual([selectedModel, config.model]);
    expect(pool.health().routes?.[0]?.model).toBe(config.model);
    const count = seen.length;
    await expect(pool.complete([], [], undefined, undefined, { routeId: 'anthropic', model: 'unknown-model' })).rejects.toThrow('AGENT_CHAT_MODEL_UNAVAILABLE');
    await expect(pool.complete([], [], undefined, undefined, { model: selectedModel })).rejects.toThrow('AGENT_CHAT_MODEL_PROVIDER_UNSUPPORTED');
    expect(seen).toHaveLength(count);
  });

  it('offers a model\'s catalog effort levels before its first turn, without a tool probe, and reuses them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'provider-anthropic-catalog-efforts-'));
    roots.push(root);
    const fable = 'claude-fable-5-1';
    const all = { supported: true, low: { supported: true }, medium: { supported: true }, high: { supported: true },
      xhigh: { supported: true }, max: { supported: true } };
    const seen: Array<{ method: string; path: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seen.push({ method: init.method ?? 'GET', path: url.pathname });
      // One credential's workspace lacks the two highest levels: the picker may only offer what every key can run.
      const effort = url.pathname.endsWith(fable) && headers['x-api-key'] === 'fixture-two'
        ? { ...all, xhigh: { supported: false }, max: { supported: false } } : all;
      return json({ id: url.pathname.split('/').at(-1), max_input_tokens: 131_072, max_tokens: 4_096, capabilities: { effort } });
    }));
    const pool = new OpenAICompatibleProviderPool({ ...config, baseUrl: null, model: null, apiKey: null,
      providers: [{ id: 'anthropic', baseUrl: config.baseUrl, model: config.model, models: [config.model, fable], credentials: [
        { id: 'anthropic:01', ordinal: 1, secret: 'fixture-one' },
        { id: 'anthropic:02', ordinal: 2, secret: 'fixture-two' },
      ] }] }, path.join(root, 'provider-state.sqlite'));
    const efforts = (model: string) => pool.health().routes?.[0]?.models?.find((item: { id: string }) => item.id === model)?.reasoningEfforts;
    expect(efforts(fable)).toEqual([]);
    await pool.refreshModelCapabilities();
    expect(efforts(fable)).toEqual(['low', 'medium', 'high']);
    expect(efforts(config.model)).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(seen.every(item => item.method === 'GET')).toBe(true);
    const count = seen.length;
    await pool.refreshModelCapabilities();
    expect(seen).toHaveLength(count);
  });

  it('qualifies each pool credential through native model lookup and a native tool probe, then completes natively', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'provider-anthropic-'));
    roots.push(root);
    const seen: Array<{ method: string; path: string; key: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers.authorization).toBeUndefined();
      const method = init.method ?? 'GET';
      if (method === 'POST') expect(headers['anthropic-workspace-id']).toBe('wrkspc_fixture');
      const body = init.body ? JSON.parse(String(init.body)) : null;
      seen.push({ method, path: url.pathname, key: headers['x-api-key']!, body });
      if (method === 'GET') {
        expect(url.pathname).toBe('/v1/models/claude-sonnet-5-5');
        return json({ id: 'claude-fixture-resolved', type: 'model', max_input_tokens: 131_072, max_tokens: 4_096,
          capabilities: { effort: { supported: true, low: { supported: true }, high: { supported: true }, max: { supported: false } } } });
      }
      expect(url.pathname).toBe('/v1/messages');
      if (body.tools?.[0]?.name === 'agent_core_model_probe') {
        return json(message([{ type: 'tool_use', id: 'probe', name: 'agent_core_model_probe',
          input: { nonce: body.tools[0].input_schema.properties.nonce.enum[0] } }], { stop_reason: 'tool_use' }));
      }
      return json(message());
    }));
    const pool = new OpenAICompatibleProviderPool({ ...config, baseUrl: null, model: null, apiKey: null,
      providers: [{ id: 'anthropic', baseUrl: config.baseUrl, model: config.model, workspaceId: 'wrkspc_fixture', credentials: [
        { id: 'anthropic:01', ordinal: 1, secret: 'fixture-one' },
        { id: 'anthropic:02', ordinal: 2, secret: 'fixture-two' },
      ] }], providerOrder: ['anthropic'] }, path.join(root, 'provider-state.sqlite'));
    await pool.prepareReadiness();
    expect(seen.filter(item => item.method === 'GET').map(item => item.key).sort()).toEqual(['fixture-one', 'fixture-two']);
    expect(seen.filter(item => item.method === 'POST')).toHaveLength(2);
    expect(seen.filter(item => item.method === 'POST').every(item => item.body.cache_control === undefined)).toBe(true);
    expect(pool.health().routes?.[0]?.modelReadiness).toMatchObject({ ready: 2, pending: 0 });
    expect(await pool.complete([{ role: 'user', content: 'Hello' }])).toMatchObject({ content: 'Done', providerId: 'anthropic' });
    expect(seen).toHaveLength(5);
    expect(seen.at(-1)).toMatchObject({ method: 'POST', path: '/v1/messages', key: 'fixture-one' });
    expect(seen.filter(item=>item.method==='POST').every(item=>item.body.output_config===undefined)).toBe(true);
    expect(pool.health().routes?.[0]?.reasoningEfforts).toEqual(['low', 'high']);
    for (const reasoningEffort of ['low', 'high'] as const) {
      await pool.complete([{ role: 'user', content: 'Hello' }], [], undefined, undefined, { routeId: 'anthropic', reasoningEffort });
      expect(seen.at(-1)?.body.output_config).toEqual({ effort: reasoningEffort });
      expect(seen.at(-1)?.body.thinking).toEqual({ type: 'adaptive', display: 'omitted', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    }
    const count = seen.length;
    for (const options of [{ reasoningEffort: 'low' }, { routeId: 'anthropic', reasoningEffort: 'max' }, { routeId: 'anthropic', reasoningEffort: 'bogus' }]) {
      await expect(pool.complete([{ role: 'user', content: 'Hello' }], [], undefined, undefined, options as any)).rejects.toThrow(/AGENT_CHAT_REASONING_/);
    }
    expect(seen).toHaveLength(count);
  });

  it('applies the highest supported effort up to the configured ceiling when the caller gave none', async () => {
    for (const [maxSupported, expected] of [[true, { effort: 'max' }], [false, { effort: 'high' }]] as const) {
      const root = await mkdtemp(path.join(os.tmpdir(), 'provider-anthropic-default-effort-'));
      roots.push(root);
      const seen: Array<{ method: string; body: any }> = [];
      vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => {
        const method = init.method ?? 'GET';
        const body = init.body ? JSON.parse(String(init.body)) : null;
        seen.push({ method, body });
        if (method === 'GET') {
          return json({ id: 'claude-fixture-resolved', type: 'model', max_input_tokens: 131_072, max_tokens: 4_096,
            capabilities: { effort: { supported: true, low: { supported: true }, high: { supported: true }, max: { supported: maxSupported } } } });
        }
        if (body.tools?.[0]?.name === 'agent_core_model_probe') {
          return json(message([{ type: 'tool_use', id: 'probe', name: 'agent_core_model_probe',
            input: { nonce: body.tools[0].input_schema.properties.nonce.enum[0] } }], { stop_reason: 'tool_use' }));
        }
        return json(message());
      }));
      const pool = new OpenAICompatibleProviderPool({ ...config, baseUrl: null, model: null, apiKey: null,
        anthropicDefaultReasoningEffort: 'max',
        providers: [{ id: 'anthropic', baseUrl: config.baseUrl, model: config.model,
          credentials: [{ id: 'anthropic:01', ordinal: 1, secret: 'fixture-one' }] }],
        providerOrder: ['anthropic'] }, path.join(root, 'provider-state.sqlite'));
      await pool.prepareReadiness();
      await pool.complete([{ role: 'user', content: 'Hello' }]);
      expect(seen.filter(item => item.method === 'POST').at(-1)?.body.output_config).toEqual(expected);
      await pool.complete([{ role: 'user', content: 'Hello' }], [], undefined, undefined, { routeId: 'anthropic', reasoningEffort: 'low' });
      expect(seen.filter(item => item.method === 'POST').at(-1)?.body.output_config).toEqual({ effort: 'low' });
    }
  });

  it('sends an explicitly configured workspace header for organization-scoped Anthropic credentials', async () => {
    const fetchMock = vi.fn(async () => json(message()));
    vi.stubGlobal('fetch', fetchMock);
    await new OpenAICompatibleProvider({ ...config, workspaceId: 'wrkspc_fixture' }, undefined, 'anthropic')
      .complete([{ role: 'user', content: 'Hello' }]);
    expect(fetchMock.mock.calls[0]![1].headers['anthropic-workspace-id']).toBe('wrkspc_fixture');
  });

  it('enables automatic caching by default and preserves explicit system cache boundaries', async () => {
    const fetchMock = vi.fn(async () => json(message()));
    vi.stubGlobal('fetch', fetchMock);
    await provider().complete([
      { role: 'system', content: 'Stable instructions', cacheControl: { type: 'ephemeral' } },
      { role: 'system', content: 'Dynamic task context' },
      { role: 'user', content: 'Hello' },
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.cache_control).toEqual({ type: 'ephemeral' });
    expect(body.system).toEqual([
      { type: 'text', text: 'Stable instructions', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Dynamic task context' },
    ]);
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }]);
  });

  it('restores legacy system serialization and omits all cache controls when disabled', async () => {
    const fetchMock = vi.fn(async () => json(message()));
    vi.stubGlobal('fetch', fetchMock);
    await new OpenAICompatibleProvider({ ...config, anthropicPromptCaching: false }, undefined, 'anthropic').complete([
      { role: 'system', content: 'Stable instructions', cacheControl: { type: 'ephemeral' } },
      { role: 'system', content: 'Dynamic task context' },
      { role: 'user', content: 'Hello' },
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.system).toBe('Stable instructions\n\nDynamic task context');
    expect(fetchMock.mock.calls[0]![1].body).not.toContain('cache_control');
    expect(fetchMock.mock.calls[0]![1].body).not.toContain('cacheControl');
  });

  it.each([
    [{}, { inputTokens: 12, outputTokens: 3, totalTokens: 15 }],
    [{ cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      { inputTokens: 12, outputTokens: 3, totalTokens: 15, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 }],
    [{ cache_read_input_tokens: 5 },
      { inputTokens: 17, outputTokens: 3, totalTokens: 20, cacheReadInputTokens: 5 }],
    [{ cache_creation_input_tokens: 4 },
      { inputTokens: 16, outputTokens: 3, totalTokens: 19, cacheWriteInputTokens: 4 }],
    [{ cache_read_input_tokens: 5, cache_creation_input_tokens: 4 },
      { inputTokens: 21, outputTokens: 3, totalTokens: 24, cacheReadInputTokens: 5, cacheWriteInputTokens: 4 }],
    [{ cache_read_input_tokens: null, cache_creation_input_tokens: 4 },
      { inputTokens: 16, outputTokens: 3, totalTokens: 19, cacheWriteInputTokens: 4 }],
    [{ cache_read_input_tokens: 5, cache_creation_input_tokens: null },
      { inputTokens: 17, outputTokens: 3, totalTokens: 20, cacheReadInputTokens: 5 }],
  ])('reports observed native cache usage without treating missing fields as zero: %j', async (cacheUsage, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => json(message(undefined,
      { usage: { input_tokens: 12, output_tokens: 3, ...cacheUsage } }))));
    expect((await provider().complete([{ role: 'user', content: 'Hello' }])).usage).toEqual(expected);
  });

  it('round trips parallel tools across turns while keeping the internal message contract', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(message([
        { type: 'text', text: 'I will inspect both files.' },
        { type: 'tool_use', id: 'call-1', name: 'read_file', input: { path: 'a.ts' } },
        { type: 'tool_use', id: 'call-2', name: 'read_file', input: { path: 'b.ts' } },
      ], { stop_reason: 'tool_use', usage: { input_tokens: 12, output_tokens: 3,
        cache_creation_input_tokens: 4, cache_read_input_tokens: 5 } })))
      .mockResolvedValueOnce(json(message()));
    vi.stubGlobal('fetch', fetchMock);
    const messages: AgentModelMessage[] = [{ role: 'system', content: 'System one' },
      { role: 'system', content: 'System two' }, { role: 'user', content: 'Inspect files' }];
    const first = await provider().complete(messages, [tool], undefined, 1_024);
    expect(first).toMatchObject({ content: 'I will inspect both files.', finishReason: 'tool_use',
      resolvedModel: 'claude-fixture-resolved', usage: { inputTokens: 21, outputTokens: 3, totalTokens: 24,
        cacheReadInputTokens: 5, cacheWriteInputTokens: 4 },
      toolCalls: [{ id: 'call-1', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } },
        { id: 'call-2', function: { name: 'read_file', arguments: '{"path":"b.ts"}' } }] });
    messages.push({ role: 'assistant', content: first.content, tool_calls: first.toolCalls },
      { role: 'tool', tool_call_id: 'call-1', content: 'File A' },
      { role: 'tool', tool_call_id: 'call-2', content: 'File B' });
    expect(await provider().complete(messages, [tool])).toMatchObject({ content: 'Done', toolCalls: [],
      finishReason: 'end_turn', usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toEqual({ 'content-type': 'application/json', 'x-api-key': 'fixture-secret',
      'anthropic-version': '2023-06-01', 'anthropic-beta': 'thinking-binding-controls-2026-08-01' });
    expect(JSON.parse(init.body)).toEqual({ model: 'claude-sonnet-5-5',
      system: [{ type: 'text', text: 'System one' }, { type: 'text', text: 'System two' }],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Inspect files' }] }],
      tools: [{ name: 'read_file', description: 'Read a file', input_schema: tool.function.parameters }],
      tool_choice: { type: 'auto' }, stream: false, max_tokens: 1_024,
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'adaptive', display: 'omitted', block_binding: { prefix_mismatch_behavior: 'drop_block' } } });
    const secondBody = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(secondBody.max_tokens).toBe(4_096);
    expect(secondBody.messages.slice(1)).toEqual([
      { role: 'assistant', content: [
        { type: 'text', text: 'I will inspect both files.' },
        { type: 'tool_use', id: 'call-1', name: 'read_file', input: { path: 'a.ts' } },
        { type: 'tool_use', id: 'call-2', name: 'read_file', input: { path: 'b.ts' } },
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'call-1', content: 'File A' },
        { type: 'tool_result', tool_use_id: 'call-2', content: 'File B' },
      ] },
    ]);
  });

  it.each(['claude-sonnet-5-5', 'claude-opus-5-5'])('preserves exact signed content order for %s without exposing omitted thinking as text', async model => {
    const content: AgentAnthropicContentBlock[] = [
      { type: 'thinking', thinking: '', signature: 'opaque-signed-A+/=' },
      { type: 'text', text: 'First visible note.' },
      { type: 'tool_use', id: 'call-1', name: 'read_file', input: { path: 'a.ts' } },
      { type: 'redacted_thinking', data: 'opaque-redacted-B+/=' },
      { type: 'text', text: 'Second visible note.' },
      { type: 'thinking', thinking: '', signature: 'opaque-signed-C+/=' },
      { type: 'tool_use', id: 'call-2', name: 'read_file', input: { path: 'b.ts' } },
    ];
    const fetchMock = vi.fn().mockResolvedValueOnce(json(message(content, { stop_reason: 'tool_use' })))
      .mockResolvedValueOnce(json(message()));
    vi.stubGlobal('fetch', fetchMock);
    const native = new OpenAICompatibleProvider({ ...config, model }, undefined, 'anthropic');
    const first = await native.complete([{ role: 'user', content: 'Inspect files' }], [tool]);
    expect(first.anthropicContent).toEqual(content);
    expect(first.content).toBe('First visible note.Second visible note.');
    expect(first.content).not.toContain('opaque-');
    await native.complete([{ role: 'user', content: 'Inspect files' },
      { role: 'assistant', content: first.content, tool_calls: first.toolCalls, anthropicContent: first.anthropicContent },
      { role: 'tool', tool_call_id: 'call-1', content: 'A' }, { role: 'tool', tool_call_id: 'call-2', content: 'B' }], [tool]);
    const body = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(body.model).toBe(model);
    expect(body.cache_control).toEqual({ type: 'ephemeral' });
    expect(body.messages[1].content).toEqual(content);
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'omitted',
      block_binding: { prefix_mismatch_behavior: 'drop_block' } });
  });

  it.each([
    [{ type: 'thinking', thinking: 'unexpected-private-summary', signature: 'opaque-signature' }],
    [{ type: 'thinking', thinking: '', signature: '' }],
    [{ type: 'redacted_thinking', data: {} }],
    [{ type: 'server_tool_use', id: 'server-1', name: 'unsupported', input: {} }],
    Array.from({ length: 129 }, () => ({ type: 'text', text: 'a' })),
    [{ type: 'thinking', thinking: '', signature: 'a'.repeat(2 * 1024 * 1024) }],
  ])('rejects malformed or unsupported preserved content without including it in errors', content => {
    let error: unknown;
    try { validateAnthropicContent(content); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
    expect((error as Error).message).not.toContain('unexpected-private-summary');
  });

  it.each(['not-json', '[]', 'null'])('rejects malformed tool input %s before sending a request', async args => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider().complete([{ role: 'assistant', content: null, tool_calls: [{ id: 'call-1',
      type: 'function', function: { name: 'read_file', arguments: args } }] }])).rejects.toThrow('AGENT_RUNTIME_PROVIDER_TOOL_CALL_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { choices: [{ message: { content: 'wrong protocol' } }] },
    message([{ type: 'text', text: {} }]),
    message([{ type: 'tool_use', id: 'call-1', name: 'read_file', input: [] }]),
    message([{ type: 'tool_use', id: 'call-1', name: 'read_file', input: {} },
      { type: 'tool_use', id: 'call-1', name: 'read_file', input: {} }]),
    message([], { usage: { input_tokens: -1, output_tokens: 3 } }),
    message([], { usage: { input_tokens: 12, output_tokens: 3, cache_read_input_tokens: -1 } }),
    message([], { usage: { input_tokens: 12, output_tokens: 3, cache_creation_input_tokens: -1 } }),
    message([], { usage: { input_tokens: 12, output_tokens: 3, cache_read_input_tokens: 1.5 } }),
    message([], { usage: { input_tokens: 12, output_tokens: 3, cache_creation_input_tokens: '4' } }),
    message([], { usage: { input_tokens: 12, output_tokens: 3, cache_creation_input_tokens: Number.MAX_SAFE_INTEGER + 1 } }),
    message([], { usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 3, cache_read_input_tokens: 1 } }),
  ])('rejects malformed native responses', async payload => {
    vi.stubGlobal('fetch', vi.fn(async () => json(payload)));
    await expect(provider().complete([{ role: 'user', content: 'Hello' }])).rejects.toThrow(/AGENT_RUNTIME_PROVIDER_(RESPONSE|TOOL_CALL)_INVALID/);
  });

  it('preserves structured API errors, redaction and a single non-idempotent attempt', async () => {
    const fetchMock = vi.fn(async () => json({ type: 'error', error: { type: 'rate_limit_error',
      message: 'Too many requests; api_key=fixture-secret' } }, { status: 429, headers: { 'retry-after': '2' } }));
    vi.stubGlobal('fetch', fetchMock);
    const error = await provider().complete([{ role: 'user', content: 'Hello' }]).catch(value => value);
    expect(error).toBeInstanceOf(AgentProviderRequestError);
    expect(error).toMatchObject({ status: 429, safeType: 'rate_limit_error', retryAfterMs: 2_000 });
    expect(error.message).toContain('[REDACTED]');
    expect(error.message).not.toContain('fixture-secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight request without retrying', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const fetchMock = vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      started();
    }));
    vi.stubGlobal('fetch', fetchMock);
    const result = provider().complete([{ role: 'user', content: 'Hello' }], [], controller.signal);
    await ready;
    controller.abort(new Error('fixture-cancel'));
    await expect(result).rejects.toThrow('fixture-cancel');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves OpenAI wire format and fixes a trailing slash in the shared endpoint', async () => {
    const fetchMock = vi.fn(async () => json({ choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await new OpenAICompatibleProvider({ ...config, workspaceId: 'wrkspc_unused', anthropicPromptCaching: true }).complete([
      { role: 'system', content: 'Stable instructions', cacheControl: { type: 'ephemeral' } },
      { role: 'assistant', content: 'Earlier', anthropicContent: [
      { type: 'thinking', thinking: '', signature: 'opaque-native-signature' }, { type: 'text', text: 'Earlier' },
    ] }, { role: 'user', content: 'Hello' }]))
      .toMatchObject({ content: 'OK', finishReason: 'stop' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://api.anthropic.com/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer fixture-secret');
    expect(init.headers['anthropic-workspace-id']).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ model: 'claude-sonnet-5-5', messages: [
      { role: 'system', content: 'Stable instructions' },
      { role: 'assistant', content: 'Earlier' }, { role: 'user', content: 'Hello' },
    ], stream: false });
    expect(init.body).not.toContain('opaque-native-signature');
    expect(init.body).not.toContain('cacheControl');
    expect(init.body).not.toContain('cache_control');
  });
});
