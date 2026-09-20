import { getEventListeners } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCallToolResultJson } from '../src/mcp/call-tool-result.js';
import { bindAbortClose } from '../src/mcp/handler.js';
import {
  correlationSuffix,
  fetchWithPolicy,
  type OutboundAttemptEvent,
} from '../src/net/outbound-request.js';
import {
  readResponseTextBounded,
} from '../src/net/bounded-response.js';
import { assertCredentialBearingUrl } from '../src/net/endpoint-policy.js';
import {
  buildMachineShellEnv,
  buildOwnedChildEnv,
  recordAgentCoreOwnedSecretKey,
} from '../src/security/environment.js';
import { readSensitiveTextFile } from '../src/security/sensitive-file.js';
import { redactSensitiveString } from '../src/security/redaction.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Anthropic SDK TypeScript third-wave adoption', () => {
  it('prefers valid text JSON and falls back to structuredContent', () => {
    expect(parseCallToolResultJson({
      content: [{ type: 'text', text: '{"source":"text"}' }],
      structuredContent: { source: 'structured' },
    } as any)).toEqual({ source: 'text' });

    expect(parseCallToolResultJson({
      content: [],
      structuredContent: { source: 'structured' },
    } as any)).toEqual({ source: 'structured' });

    expect(parseCallToolResultJson({
      content: [{ type: 'text', text: 'not-json' }],
      structuredContent: { source: 'structured' },
    } as any)).toEqual({ source: 'structured' });
  });
  it('fails closed on MCP tool errors', () => {
    expect(parseCallToolResultJson({
      isError: true,
      content: [{ type: 'text', text: '{"unsafe":true}' }],
      structuredContent: { unsafe: true },
    } as any)).toBeNull();
  });

  it('detaches abort listeners on normal teardown and still closes on abort', () => {
    const controller = new AbortController();
    const close = vi.fn();
    const detach = bindAbortClose(controller.signal, close);
    expect(getEventListeners(controller.signal as any, 'abort')).toHaveLength(1);
    detach();
    expect(getEventListeners(controller.signal as any, 'abort')).toHaveLength(0);
    expect(close).not.toHaveBeenCalled();

    const second = new AbortController();
    const closeSecond = vi.fn();
    const detachSecond = bindAbortClose(second.signal, closeSecond);
    second.abort();
    expect(closeSecond).toHaveBeenCalledTimes(1);
    detachSecond();
    expect(getEventListeners(second.signal as any, 'abort')).toHaveLength(0);
  });

  it('closes immediately for an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const close = vi.fn();
    const detach = bindAbortClose(controller.signal, close);
    expect(close).toHaveBeenCalledTimes(1);
    detach();
    expect(getEventListeners(controller.signal as any, 'abort')).toHaveLength(0);
  });

  it('emits one sanitized hook event per real outbound attempt', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('retry', {
        status: 429,
        headers: { 'retry-after': '0', 'request-id': 'req_123' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const events: OutboundAttemptEvent[] = [];
    const response = await fetchWithPolicy(
      'https://example.com/v1/agent_core_secret_FAKE?api_key=SHOULD_NOT_APPEAR',
      {},
      { safety: 'safe', maxAttempts: 3, onAttempt: event => events.push(event) },
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      attempt: 1,
      maxAttempts: 3,
      outcome: 'response',
      retry: true,
      status: 429,
      correlationId: 'request-id=req_123',
      retryDelayMs: 0,
    });
    expect(events[1]).toMatchObject({
      attempt: 2,
      maxAttempts: 3,
      outcome: 'response',
      retry: false,
      status: 200,
    });
    expect(JSON.stringify(events)).not.toContain('SHOULD_NOT_APPEAR');
    expect(JSON.stringify(events)).not.toContain('agent_core_secret_FAKE');
  });
  it('retries transient responses for idempotent operations', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('retry', { status: 503, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const events: OutboundAttemptEvent[] = [];
    const response = await fetchWithPolicy(
      'https://example.com/idempotent',
      {},
      { safety: 'idempotent', maxAttempts: 2, onAttempt: event => events.push(event) },
    );
    expect(response.status).toBe(204);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(events.map(event => event.retry)).toEqual([true, false]);
  });

  it('keeps hooks fail-soft and non-idempotent calls single-attempt', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('still failing', { status: 503 }));

    const response = await fetchWithPolicy(
      'https://example.com/write',
      {},
      {
        safety: 'non-idempotent',
        maxAttempts: 5,
        onAttempt: () => { throw new Error('observer failed'); },
      },
    );

    expect(response.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves correlation suffix behavior through the shared parser', () => {
    const response = new Response('x', { headers: { 'cf-ray': 'abc-123' } });
    expect(correlationSuffix(response)).toBe(' (cf-ray=abc-123)');
  });
});

describe('Anthropic-derived hardening completion gates', () => {
  it('enforces HTTPS-or-loopback credential endpoints', () => {
    expect(assertCredentialBearingUrl('https://example.com/api').hostname).toBe('example.com');
    expect(assertCredentialBearingUrl('http://127.0.0.1:9999/api').hostname).toBe('127.0.0.1');
    expect(() => assertCredentialBearingUrl('http://example.com/api')).toThrow(/INSECURE_CREDENTIAL_ENDPOINT/);
  });

  it('bounds response-body consumption', async () => {
    await expect(readResponseTextBounded(
      new Response('x'.repeat(32)),
      8,
      'synthetic',
    )).rejects.toThrow(/exceeded 8 bytes/);
    expect(await readResponseTextBounded(new Response('small'), 8, 'synthetic')).toBe('small');
  });

  it('isolates owned-child secrets while machine shells only subtract Agent Core-owned secrets', () => {
    const ownedKey = 'AGENT_CORE_TEST_API_KEY';
    recordAgentCoreOwnedSecretKey(ownedKey);
    const source = {
      PATH: 'synthetic-path',
      [ownedKey]: 'owned-secret',
      USER_TOOL_TOKEN: 'user-secret',
      PLAIN_VALUE: 'plain',
    } as NodeJS.ProcessEnv;

    const owned = buildOwnedChildEnv({}, source);
    expect(owned.PATH).toBe('synthetic-path');
    expect(owned.PLAIN_VALUE).toBe('plain');
    expect(owned[ownedKey]).toBeUndefined();
    expect(owned.USER_TOOL_TOKEN).toBeUndefined();

    const shell = buildMachineShellEnv({}, source);
    expect(shell.PATH).toBe('synthetic-path');
    expect(shell.PLAIN_VALUE).toBe('plain');
    expect(shell[ownedKey]).toBeUndefined();
    expect(shell.USER_TOOL_TOKEN).toBe('user-secret');
  });
  it('rejects non-regular sensitive files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-sensitive-file-'));
    roots.push(root);
    const directory = path.join(root, 'not-a-file');
    await mkdir(directory);
    await expect(readSensitiveTextFile(directory)).rejects.toThrow(/SENSITIVE_FILE_NOT_REGULAR/);
  });

  it('redacts Agent Core token families and explicit credential assignments', () => {
    const raw = 'Bearer abc.def api_key=FAKE123 agent_core_refresh_ABCDEF';
    const redacted = redactSensitiveString(raw);
    expect(redacted).not.toContain('abc.def');
    expect(redacted).not.toContain('FAKE123');
    expect(redacted).not.toContain('agent_core_refresh_ABCDEF');
    expect(redacted).toContain('[REDACTED]');
  });
});
