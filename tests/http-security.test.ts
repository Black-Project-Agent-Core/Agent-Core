import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { HttpSecurityConfig } from '../src/config.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { loadConfig } from '../src/config.js';

function request(
  headers: Record<string, string> = {},
  remoteAddress = '127.0.0.1',
  encrypted = false,
): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress, encrypted },
  } as unknown as IncomingMessage;
}

function policy(overrides: Partial<HttpSecurityConfig> = {}): HttpSecurityPolicy {
  return new HttpSecurityPolicy({
    publicBaseUrl: null,
    trustProxy: false,
    allowedOrigins: [],
    ...overrides,
  });
}

describe('HTTP trust boundary policy', () => {
  it('uses configured canonical public base URL over request and forwarded identity', () => {
    const security = policy({ publicBaseUrl: 'https://agent-core.example.test' });
    const req = request({
      host: '127.0.0.1:8765',
      'x-forwarded-proto': 'http',
      'x-forwarded-host': 'spoofed.example.test',
    });
    expect(security.externalBaseUrl(req)).toBe('https://agent-core.example.test');
    expect(security.protectedResource(req)).toBe('https://agent-core.example.test/mcp');
  });

  it('ignores forwarded identity unless trusted-proxy mode is explicit', () => {
    const req = request({
      host: '127.0.0.1:8765',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'public.example.test',
    });
    expect(policy().externalBaseUrl(req)).toBe('http://127.0.0.1:8765');
    expect(policy({ trustProxy: true }).externalBaseUrl(req)).toBe('https://public.example.test');
  });

  it('fails closed for malformed trusted forwarded identity', () => {
    const security = policy({ trustProxy: true });
    expect(() => security.externalBaseUrl(request({
      host: '127.0.0.1:8765',
      'x-forwarded-proto': 'javascript',
      'x-forwarded-host': 'public.example.test',
    }))).toThrow(/forwarded protocol/i);
    expect(() => security.externalBaseUrl(request({
      host: '127.0.0.1:8765',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'user@public.example.test',
    }))).toThrow(/forwarded host/i);
  });

  it.each([
    ['127.0.0.1', true],
    ['127.10.20.30', true],
    ['::1', true],
    ['::ffff:127.0.0.1', true],
    ['10.0.0.8', false],
    ['203.0.113.5', false],
  ])('classifies remote address %s as loopback=%s', (remoteAddress, expected) => {
    const req = request({}, remoteAddress);
    expect(policy().isLoopbackRequest(req)).toBe(expected);
  });

  it('fails closed when the peer address is unavailable', () => {
    const req = { headers: {}, socket: {} } as unknown as IncomingMessage;
    expect(policy().isLoopbackRequest(req)).toBe(false);
  });

  it('uses forwarded client address for loopback classification only in trusted-proxy mode', () => {
    const remoteThroughLoopbackProxy = request({
      'x-forwarded-for': '203.0.113.25',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'agent-core.example.test',
    }, '127.0.0.1');
    expect(policy({ trustProxy: false }).isLoopbackRequest(remoteThroughLoopbackProxy)).toBe(true);
    expect(policy({ trustProxy: true }).isLoopbackRequest(remoteThroughLoopbackProxy)).toBe(false);

    const localThroughTrustedProxy = request({
      'x-forwarded-for': '127.0.0.1',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'agent-core.example.test',
    }, '127.0.0.1');
    expect(policy({ trustProxy: true }).isLoopbackRequest(localThroughTrustedProxy)).toBe(true);
  });

  it('fails closed for proxied metrics identity when trusted proxy headers exist without client address', () => {
    const proxied = request({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'agent-core.example.test',
    }, '127.0.0.1');
    expect(policy({ trustProxy: true }).isLoopbackRequest(proxied)).toBe(false);
  });

  it.each([
    [undefined, { ok: true }],
    ['null', { ok: false, code: 'invalid_origin' }],
    ['not-a-url', { ok: false, code: 'invalid_origin' }],
    ['https://evil.example', { ok: false, code: 'origin_not_allowed' }],
    ['https://user@localhost', { ok: false, code: 'invalid_origin' }],
    ['file://localhost', { ok: false, code: 'invalid_origin' }],
    ['http://localhost:43123', { ok: true }],
    ['https://agent-core.example.test', { ok: true }],
  ])('validates MCP Origin %s deterministically', (origin, expected) => {
    const security = policy({ publicBaseUrl: 'https://agent-core.example.test' });
    const headers = origin === undefined ? {} : { origin };
    expect(security.validateMcpOrigin(request(headers))).toEqual(expected);
  });
});

describe('additional OAuth resource identity (Cloudflare Tunnel)', () => {
  const openai = 'https://tunnel-service.gateway.example/v1/mcp/tunnel_test';
  const cloudflare = 'https://agent-core.example.test/mcp';
  const multi = (overrides: Partial<HttpSecurityConfig> = {}) => policy({
    protectedResourceUrl: openai,
    additionalProtectedResourceUrls: [cloudflare],
    ...overrides,
  });

  it('selects the additional resource by Host and keeps the default for every other host', () => {
    const security = multi();
    const viaCloudflare = request({ host: 'Agent-Core.Example.Test:443' });
    expect(security.protectedResource(viaCloudflare)).toBe(cloudflare);
    expect(security.externalBaseUrl(viaCloudflare)).toBe('https://agent-core.example.test');
    const local = request({ host: '127.0.0.1:8765' });
    expect(security.protectedResource(local)).toBe(openai);
    expect(security.externalBaseUrl(local)).toBe('http://127.0.0.1:8765');
  });

  it('reads the forwarded host only in trusted-proxy mode', () => {
    const spoofed = request({ host: '127.0.0.1:8765', 'x-forwarded-host': 'agent-core.example.test' });
    expect(multi().protectedResource(spoofed)).toBe(openai);
    expect(multi({ trustProxy: true }).protectedResource(spoofed)).toBe(cloudflare);
  });

  it('allows the additional hostname as MCP Origin', () => {
    expect(multi().validateMcpOrigin(request({ origin: 'https://agent-core.example.test' }))).toEqual({ ok: true });
    expect(multi().validateMcpOrigin(request({ origin: 'https://evil.example' }))).toEqual({ ok: false, code: 'origin_not_allowed' });
  });

  it.each(['http://agent-core.example.test/mcp', 'not a url', 'https://u:p@agent-core.example.test/mcp'])(
    'rejects invalid additional resource %s at construction',
    (value) => {
      expect(() => policy({ additionalProtectedResourceUrls: [value] })).toThrow(/additional oauth resource/i);
    },
  );
});

describe('Cloudflare Tunnel hostname setting', () => {
  const urls = (env: Record<string, string>) => loadConfig(env, process.cwd()).httpSecurity.additionalProtectedResourceUrls;

  it('derives the public MCP resource from the hostname and keeps explicit URLs', () => {
    expect(urls({ CLOUDFLARE_TUNNEL_HOSTNAME: 'Agent-Core.Example.com' })).toEqual(['https://agent-core.example.com/mcp']);
    expect(urls({
      AGENT_CORE_OAUTH_ADDITIONAL_RESOURCE_URLS: 'https://other.example.test/mcp',
      CLOUDFLARE_TUNNEL_HOSTNAME: 'agent-core.example.com',
    })).toEqual(['https://other.example.test/mcp', 'https://agent-core.example.com/mcp']);
  });

  it.each([['https://agent-core.example.com/mcp'], ['  agent-core.example.com/  ']])('tolerates a pasted scheme or path: %s', (value) => {
    expect(urls({ CLOUDFLARE_TUNNEL_HOSTNAME: value })).toEqual(['https://agent-core.example.com/mcp']);
  });

  it.each([[''], ['localhost'], ['not a host'], ['-bad.example.com']])('adds nothing for an empty or invalid hostname %j', (value) => {
    expect(urls({ CLOUDFLARE_TUNNEL_HOSTNAME: value })).toEqual([]);
  });
});
