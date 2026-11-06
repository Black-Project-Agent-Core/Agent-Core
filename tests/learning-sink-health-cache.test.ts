import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodePatternLearningSink } from '../src/learning/code-pattern-sink.js';

type Health = { status: string; index: string; issue?: string };

/** Code Intelligence stand-in whose health() the test resolves by hand, like a slow Grafel refresh. */
function fakeCode(initial?: Health) {
  const calls: boolean[] = [];
  const waiting: Array<{ resolve: (health: Health) => void; reject: (error: Error) => void }> = [];
  const code = {
    enabled: true,
    capabilities: () => ({ patterns: true }),
    health: vi.fn((force = false) => {
      calls.push(force);
      if (initial) return Promise.resolve(initial);
      return new Promise<Health>((resolve, reject) => waiting.push({ resolve, reject }));
    }),
  };
  return { code: code as any, calls, waiting };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

describe('code-pattern sink health', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(1_000_000); });
  afterEach(() => { vi.useRealTimers(); });

  it('answers at once while the first Grafel refresh is still running, without claiming availability', async () => {
    const { code, calls } = fakeCode();
    const sink = new CodePatternLearningSink(code);
    const answer = await Promise.race([sink.health(), new Promise(resolve => setTimeout(() => resolve('blocked'), 50))]);
    expect(answer).not.toBe('blocked');
    expect(answer).toMatchObject({ available: false });
    expect((answer as { issue: string }).issue).toMatch(/not (been )?observed/i);
    expect(calls).toEqual([false]); // the status poll never forces a Grafel refresh
  });

  it('reports the cached result once the refresh finished and does not refresh again inside the cache window', async () => {
    const { code, calls, waiting } = fakeCode();
    const sink = new CodePatternLearningSink(code);
    await sink.health();
    await sink.health(); // a second poll while the refresh is pending shares it
    expect(calls).toHaveLength(1);
    waiting[0]!.resolve({ status: 'available', index: 'current' });
    await settle();
    expect(await sink.health()).toEqual({ available: true });
    expect(calls).toHaveLength(1);
  });

  it('serves the cached result immediately after the window and refreshes in the background', async () => {
    const { code, calls, waiting } = fakeCode();
    const sink = new CodePatternLearningSink(code);
    await sink.health();
    waiting[0]!.resolve({ status: 'available', index: 'current' });
    await settle();
    vi.setSystemTime(1_000_000 + 6_000);
    expect(await sink.health()).toEqual({ available: true });
    expect(calls).toHaveLength(2);
    waiting[1]!.resolve({ status: 'degraded', index: 'indexing', issue: 'Grafel index state is indexing' });
    await settle();
    expect(await sink.health()).toEqual({ available: false, issue: 'Grafel index state is indexing' });
  });

  it('does not present an old result as current when nobody polled for a long time', async () => {
    const { code, waiting } = fakeCode();
    const sink = new CodePatternLearningSink(code);
    await sink.health();
    waiting[0]!.resolve({ status: 'available', index: 'current' });
    await settle();
    vi.setSystemTime(1_000_000 + 10 * 60_000);
    expect(await sink.health()).toMatchObject({ available: false });
  });

  it('turns a failed refresh into an unavailable answer instead of throwing or hanging', async () => {
    const { code, waiting } = fakeCode();
    const sink = new CodePatternLearningSink(code);
    await sink.health();
    waiting[0]!.reject(new Error('GRAFEL_TIMEOUT_AFTER_30000MS'));
    await settle();
    expect(await sink.health()).toEqual({ available: false, issue: 'GRAFEL_TIMEOUT_AFTER_30000MS' });
  });

  it('keeps the write path on a forced refresh and lets it seed the cache', async () => {
    const { code, calls } = fakeCode({ status: 'available', index: 'current' });
    const sink = new CodePatternLearningSink(code);
    expect(await sink.isAvailable()).toBe(true);
    expect(calls).toEqual([true]);
    expect(await sink.health()).toEqual({ available: true });
    expect(calls).toEqual([true]); // served from what the forced check just learned
  });

  it('keeps the existing disabled and missing-capability answers', async () => {
    expect(await new CodePatternLearningSink(undefined).health()).toEqual({ available: false, issue: 'Code Intelligence unavailable' });
    const { code } = fakeCode();
    code.capabilities = () => ({ patterns: false });
    expect(await new CodePatternLearningSink(code).health()).toEqual({ available: false, issue: 'Grafel patterns capability unavailable' });
  });
});
