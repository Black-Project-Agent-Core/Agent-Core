import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './components';

const listeners = new Set<(event: { data: unknown }) => void>();
const postMessage = vi.fn();
const state = { width: 1536, height: 960, defaultWidth: 1202, defaultHeight: 811, minWidth: 320, minHeight: 240, maxDimension: 32767 };
const emit = (message: unknown) => act(() => listeners.forEach(listener => listener({ data: message })));
const last = () => postMessage.mock.calls.at(-1)![0];

beforeEach(() => {
  listeners.clear(); postMessage.mockReset();
  (window as any).chrome = { webview: { postMessage, addEventListener: (_: string, listener: any) => listeners.add(listener), removeEventListener: (_: string, listener: any) => listeners.delete(listener) } };
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); } });
});
afterEach(() => { delete (window as any).chrome; vi.useRealTimers(); });

it('reads the real current size, applies presets immediately, and restores a custom saved size on reopen', () => {
  render(<AppShell page="chat" setPage={vi.fn()} onAction={vi.fn()}><div>Workspace</div></AppShell>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Window Size' }));
  expect(last()).toMatchObject({ type: 'window-size-get' });
  expect(postMessage.mock.calls.some(([message]) => message.type === 'window-size-set')).toBe(false);
  emit({ type: 'window-size-state', requestId: last().requestId, size: state });
  expect(screen.getByRole('spinbutton', { name: 'Window width' })).toHaveValue(1536);
  fireEvent.click(screen.getByRole('button', { name: 'Compact (1024 × 768)' }));
  expect(last()).toMatchObject({ type: 'window-size-set', width: 1024, height: 768 });
  emit({ type: 'window-size-state', requestId: last().requestId, size: { ...state, width: 1024, height: 768 } });
  expect(screen.getByRole('button', { name: 'Compact (1024 × 768)' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Window width' }), { target: { value: '1337' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Window height' }), { target: { value: '777' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(last()).toMatchObject({ type: 'window-size-set', width: 1337, height: 777 });
  emit({ type: 'window-size-state', requestId: last().requestId, size: { ...state, width: 1337, height: 777 } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Window Size' }));
  expect(last()).toMatchObject({ type: 'window-size-get' });
  emit({ type: 'window-size-state', requestId: last().requestId, size: { ...state, width: 1337, height: 777 } });
  expect(screen.getByRole('spinbutton', { name: 'Window width' })).toHaveValue(1337);
  expect(screen.getByRole('spinbutton', { name: 'Window height' })).toHaveValue(777);
  fireEvent.click(screen.getByRole('button', { name: 'Reset Default' }));
  expect(last()).toMatchObject({ type: 'window-size-set', width: 1202, height: 811 });
});

it('rejects invalid manual sizes and shows a failed save without claiming success', () => {
  render(<AppShell page="chat" setPage={vi.fn()} onAction={vi.fn()}><div>Workspace</div></AppShell>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Window Size' }));
  emit({ type: 'window-size-state', requestId: last().requestId, size: state });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Window width' }), { target: { value: '1' } });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Wide (1440 × 900)' }));
  emit({ type: 'window-size-error', requestId: last().requestId, error: 'Could not save window size.', size: { ...state, width: 1440, height: 900 } });
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save window size.');
  expect(screen.getByRole('spinbutton', { name: 'Window width' })).toHaveValue(1440);
});

it('keeps a manual edit made while a preset response is in flight', () => {
  render(<AppShell page="chat" setPage={vi.fn()} onAction={vi.fn()}><div>Workspace</div></AppShell>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Window Size' }));
  emit({ type: 'window-size-state', requestId: last().requestId, size: state });
  fireEvent.click(screen.getByRole('button', { name: 'Compact (1024 × 768)' }));
  const requestId = last().requestId;
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Window width' }), { target: { value: '1337' } });
  emit({ type: 'window-size-state', requestId, size: { ...state, width: 1024, height: 768 } });
  expect(screen.getByRole('spinbutton', { name: 'Window width' })).toHaveValue(1337);
  expect(screen.getByRole('spinbutton', { name: 'Window height' })).toHaveValue(768);
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(last()).toMatchObject({ type: 'window-size-set', width: 1337, height: 768 });
});
