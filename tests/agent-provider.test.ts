import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../src/agent-provider.js';
import { loadConfig } from '../src/config.js';

const baseConfig = {
  enabled: true,
  baseUrl: 'http://127.0.0.1:12345/v1',
  model: 'fixture-model',
  apiKey: 'fixture-secret',
  requestTimeoutMs: 5_000,
  maxToolIterations: 8,
};

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible native agent provider', () => {
  it('reports disabled and incomplete provider states without exposing credentials', () => {
    const disabled = new OpenAICompatibleProvider({ ...baseConfig, enabled: false }).health();
    expect(disabled).toEqual({ provider: 'openai-compatible', configured: false, enabled: false });

    const incomplete = new OpenAICompatibleProvider({ ...baseConfig, model: null }).health();
    expect(incomplete.configured).toBe(false);
    expect(incomplete.issue).toBe('AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE');
    expect(JSON.stringify(incomplete)).not.toContain('fixture-secret');
  });

  it('loads provider configuration from environment without changing default-off behavior', () => {
    const off = loadConfig({}, process.cwd());
    expect(off.agentRuntime.enabled).toBe(false);
    expect(off.agentRuntime.baseUrl).toBeNull();
    expect(off.agentUiToken).toBeNull();
    const configured = loadConfig({
      AGENT_CORE_AI_ENABLED: 'true',
      AGENT_CORE_AI_BASE_URL: 'http://127.0.0.1:9999/v1',
      AGENT_CORE_AI_MODEL: 'local-model',
      AGENT_CORE_AI_API_KEY: 'secret-value',
      AGENT_CORE_AI_REQUEST_TIMEOUT_MS: '7000',
      AGENT_CORE_AI_MAX_TOOL_ITERATIONS: '12',
      AGENT_CORE_UI_TOKEN: 'fixture-ui-token',
    }, process.cwd());
    expect(configured.agentRuntime).toEqual(expect.objectContaining({
      enabled: true, baseUrl: 'http://127.0.0.1:9999/v1', model: 'local-model',
      apiKey: 'secret-value', requestTimeoutMs: 7000, maxToolIterations: 12,
    }));
    expect(configured.agentUiToken).toBe('fixture-ui-token');
  });

  it('rejects insecure non-loopback provider endpoints', () => {
    const health = new OpenAICompatibleProvider({
      ...baseConfig,
      baseUrl: 'http://example.com/v1',
    }).health();
    expect(health.configured).toBe(false);
    expect(health.issue).toBe('AGENT_CORE_AI_BASE_URL_INSECURE_CREDENTIAL_ENDPOINT');
  });

  it('calls a configured provider and normalizes assistant tool calls', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"fixture"}' },
          }],
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAICompatibleProvider(baseConfig);
    const result = await provider.complete(
      [{ role: 'user', content: 'inspect fixture' }],
      [{
        type: 'function',
        function: {
          name: 'read_file',
          description: 'read a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      }],
    );

    expect(result).toEqual({
      content: null,
      toolCalls: [{
        id: 'call-1', type: 'function',
        function: { name: 'read_file', arguments: '{"path":"fixture"}' },
      }],
      finishReason: 'tool_calls',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://127.0.0.1:12345/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer fixture-secret');
  });
});

describe('native provider image boundary', () => {
  it('rejects undeclared multimodal input before any network request', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'should not see pixels' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAICompatibleProvider(baseConfig);
    await expect(provider.complete([{
      role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,cHJpdmF0ZQ==' } }],
    } as any])).rejects.toThrow('NATIVE_PROVIDER_IMAGE_INPUT_UNSUPPORTED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
