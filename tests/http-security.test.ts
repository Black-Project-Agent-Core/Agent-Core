import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { HttpSecurityConfig } from '../src/config.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';

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
