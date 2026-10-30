import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskChanges } from './useTaskChanges';

const sent = vi.hoisted(() => [] as Array<{ type: string; taskId?: string }>);
vi.mock('./host', async importOriginal => ({ ...(await importOriginal<typeof import('./host')>()), postHost: (message: { type: string; taskId?: string }) => { sent.push(message); }, subscribeHost: () => () => {} }));

beforeEach(() => { sent.length = 0; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useTaskChanges refresh key', () => {
  it('stays manual without a key', () => {
    renderHook(() => useTaskChanges('task-1'));
    act(() => { vi.advanceTimersByTime(20000); });
    expect(sent).toHaveLength(0);
  });

  it('loads on a key change, at most once per throttle window', () => {
    const { rerender } = renderHook(({ key }) => useTaskChanges('task-1', key), { initialProps: { key: 'running:1' } });
    act(() => { vi.advanceTimersByTime(0); });
    expect(sent.filter(m => m.type === 'task-changes-get')).toHaveLength(1);
    rerender({ key: 'running:2' });
    act(() => { vi.advanceTimersByTime(4000); });
    expect(sent).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1100); });
    expect(sent).toHaveLength(2);
  });
});
