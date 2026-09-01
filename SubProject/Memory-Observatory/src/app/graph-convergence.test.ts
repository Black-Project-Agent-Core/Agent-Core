import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGraphRefreshScheduler, isGraphChangingEvent } from './graph-convergence';

describe('graph convergence scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces a burst for 50 ms but forces refresh by 250 ms max wait', async () => {
    const refresh = vi.fn(async () => undefined);
    const scheduler = createGraphRefreshScheduler(refresh, { debounceMs: 50, maxWaitMs: 250, now: () => Date.now() });

    scheduler.schedule();
    for (let elapsed = 40; elapsed <= 240; elapsed += 40) {
      await vi.advanceTimersByTimeAsync(40);
      scheduler.schedule();
    }
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('coalesces an immediate burst into one refresh after 50 ms', async () => {
    const refresh = vi.fn(async () => undefined);
    const scheduler = createGraphRefreshScheduler(refresh, { debounceMs: 50, maxWaitMs: 250, now: () => Date.now() });
    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(49);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('classifies only authoritative graph-changing activity', () => {
    for (const event of [
      'memory.node_created', 'memory.revision_created', 'memory.edge_created', 'memory.edge_retracted',
      'memory.conflict_opened', 'memory.conflict_resolved', 'memory.remote_pending', 'memory.remote_synced',
      'memory.hydration_completed',
    ]) expect(isGraphChangingEvent(event)).toBe(true);
    for (const event of ['memory.recalled', 'memory.remember_more_expanded', 'tool.read_file', 'request.completed']) {
      expect(isGraphChangingEvent(event)).toBe(false);
    }
  });
});
