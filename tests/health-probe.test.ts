import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedHealthProbe } from '../src/http/health.js';

afterEach(() => vi.useRealTimers());

describe('passive health polling', () => {
  it('bounds a stalled owner, coalesces callers, and recovers without reporting false availability', async () => {
    vi.useFakeTimers();
    let finish!: (value: { status: string }) => void;
    const collect = vi.fn(() => new Promise<{ status: string }>(resolve => { finish = resolve; }));
    const probe = boundedHealthProbe(collect);
    const first = probe();
    const second = probe();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await first).toEqual({ status: 'unavailable', issue: 'HEALTH_PROBE_TIMEOUT', issueCount: 1 });
    expect(await second).toEqual(await first);
    expect(await probe()).toEqual(await first);
    expect(collect).toHaveBeenCalledTimes(1);
    finish({ status: 'available' });
    await vi.advanceTimersByTimeAsync(0);
    expect(await probe()).toEqual({ status: 'available' });
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('keeps execution responsive when a sibling diagnostic fails or stalls', async () => {
    vi.useFakeTimers();
    const slow = boundedHealthProbe(async () => new Promise<Record<string, unknown>>(() => {}));
    const execution = boundedHealthProbe(async () => ({ status: 'available', mode: 'rdc-direct' }), { cacheMs: 0 });
    const failed = boundedHealthProbe(async () => { throw new Error('private detail'); });
    const result = Promise.all([slow(), execution(), failed()]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await result).toEqual([
      { status: 'unavailable', issue: 'HEALTH_PROBE_TIMEOUT', issueCount: 1 },
      { status: 'available', mode: 'rdc-direct' },
      { status: 'unavailable', issue: 'HEALTH_PROBE_FAILED', issueCount: 1 },
    ]);
  });
});
