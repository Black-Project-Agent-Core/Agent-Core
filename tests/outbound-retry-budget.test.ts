import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithPolicy, type OutboundAttemptEvent } from '../src/net/outbound-request.js';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-22T00:00:00Z')); vi.spyOn(Math, 'random').mockReturnValue(0); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function run(hints: Record<string, string>[], budget: number) {
  const times: number[] = [], events: OutboundAttemptEvent[] = [];
  const start = Date.now();
  vi.stubGlobal('fetch', vi.fn(async () => {
    times.push(Date.now() - start);
    return times.length <= hints.length ? new Response('last-body', { status: 503, headers: hints[times.length - 1] }) : new Response('ok');
  }));
  const pending = fetchWithPolicy('https://example.invalid', {}, { safety: 'safe', maxAttempts: 5, maxTotalDelayMs: budget, onAttempt: e => events.push(e) });
  await vi.runAllTimersAsync();
  return { response: await pending, times, events };
}
describe('PY5-P1 provider wait / local budget', () => {
  it('30-second hint cannot be shortened to a 10-second budget', async () => {
    const r = await run([{ 'retry-after': '30' }], 10_000);
    expect(r.times).toEqual([0]); expect(r.events[0].retry).toBe(false);
    expect(await r.response.text()).toBe('last-body');
  });
  it('30-second hint is honored when it fits', async () => {
    const r = await run([{ 'retry-after': '30' }], 40_000);
    expect(r.times).toEqual([0, 30_000]); expect(r.events[0].retryDelayMs).toBe(30_000);
  });
  it('subtracts delay already spent', async () => {
    const r = await run([{ 'retry-after': '8' }, { 'retry-after': '8' }], 10_000);
    expect(r.times).toEqual([0, 8_000]); expect(r.response.status).toBe(503);
  });
  it('honors HTTP-date using the same budget decision', async () => {
    const r = await run([{ 'retry-after': new Date(Date.now() + 30_000).toUTCString() }], 10_000);
    expect(r.times).toEqual([0]);
  });
  it('fractional milliseconds round up, never earlier', async () => {
    const r = await run([{ 'retry-after-ms': '1.9' }], 100);
    expect(r.times).toEqual([0, 2]);
  });
  it.each(['100garbage', '-1', 'Infinity', '', 'NaN'])('rejects malformed millisecond hint %j', async value => {
    const r = await run([{ 'retry-after-ms': value }], 1000); expect(r.times).toEqual([0, 0]);
  });
  it('a valid hint beyond timer range prevents retry', async () => {
    const r = await run([{ 'retry-after-ms': '2147483648' }], 3_000_000_000); expect(r.times).toEqual([0]);
  });
  it('abort interrupts a permitted backoff and cannot retry', async () => {
    const abort = new AbortController(), send = vi.fn(async () => new Response('', { status: 503, headers: { 'retry-after': '30' } }));
    vi.stubGlobal('fetch', send);
    const pending = fetchWithPolicy('https://example.invalid', { signal: abort.signal }, { safety: 'safe', maxTotalDelayMs: 40_000 });
    const check = expect(pending).rejects.toThrow('stop');
    await vi.advanceTimersByTimeAsync(1000); abort.abort(new Error('stop')); await check;
    expect(send).toHaveBeenCalledTimes(1);
  });
});
