import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { fetchWithPolicy, type OutboundAttemptEvent } from '../src/net/outbound-request.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('TS5-P1 request-body ownership', () => {
  for (const [label, makeBody] of [
    ['ReadableStream', () => new Response('hello').body!],
    ['async iterator', () => (async function* () { yield Buffer.from('hello'); })()],
    ['Node stream', () => Readable.from([Buffer.from('hello')])],
  ] as const) {
    it(`${label} is consumed once even for an idempotent 503`, async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const events: OutboundAttemptEvent[] = [];
      const payloads: string[] = [];
      const send = vi.fn(async (_url: unknown, init: RequestInit) => {
        let body = '';
        for await (const chunk of init.body as any) body += Buffer.from(chunk).toString('utf8');
        payloads.push(body);
        return new Response('unavailable', { status: 503, headers: { 'retry-after-ms': '0' } });
      });
      vi.stubGlobal('fetch', send);
      const result = await fetchWithPolicy('https://example.invalid/upload', { method: 'PUT', body: makeBody() as any },
        { safety: 'idempotent', maxAttempts: 3, onAttempt: e => events.push(e) });
      expect(send).toHaveBeenCalledTimes(1);
      expect(payloads).toEqual(['hello']);
      expect(await result.text()).toBe('unavailable');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ maxAttempts: 1, retry: false });
    });
  }
  it.each(['text', new Uint8Array([65, 66]), new Blob(['abc']), new URLSearchParams({ a: 'b' })])('repeatable payload retains retries: %s', async body => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const send = vi.fn().mockImplementationOnce(async (_url, init) => {
      await new Response(init.body).text(); return new Response('', { status: 503 });
    }).mockImplementationOnce(async (_url, init) => new Response(await new Response(init.body).text()));
    vi.stubGlobal('fetch', send);
    const result = await fetchWithPolicy('https://example.invalid/upload', { method: 'PUT', body }, { safety: 'idempotent' });
    expect(result.status).toBe(200); expect(send).toHaveBeenCalledTimes(2);
    expect(await result.text()).not.toBe('');
  });
  it('non-idempotent payload never retries', async () => {
    const send = vi.fn(async () => new Response('retry', { status: 503 })); vi.stubGlobal('fetch', send);
    await fetchWithPolicy('https://example.invalid', { body: 'hello', method: 'POST' }, { safety: 'non-idempotent' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('classification does not invoke an unknown object accessor', async () => {
    const getter = vi.fn(() => { throw new Error('unexpected getter'); });
    const body = Object.defineProperty({}, Symbol.asyncIterator, { get: getter });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('last', { status: 503 })));
    await fetchWithPolicy('https://example.invalid', { body: body as any, method: 'PUT' }, { safety: 'idempotent' });
    expect(getter).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
