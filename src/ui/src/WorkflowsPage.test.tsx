import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const handlers = new Set<(event: { data: any }) => void>();
const postMessage = vi.fn();
const ready = {
  status: 'ready', fingerprint: 'fingerprint-one', revision: 'revision-one',
  generatedAt: '2026-10-09T18:00:00Z', sourceFiles: 24, nodes: 72, edges: 91, unknowns: 3,
  html: '<!doctype html><html><body>Unified system and Memory canvas</body></html>',
  limitations: ['Dynamic dispatch is unresolved.'],
};

function requests() {
  return postMessage.mock.calls.map(([message]) => message).filter(message => message.type === 'workflows-get');
}

function result(value: unknown, requestId = requests().at(-1)?.requestId) {
  act(() => handlers.forEach(handler => handler({ data: { type: 'workflows-result', requestId, result: value } })));
}

function error(message: string) {
  act(() => handlers.forEach(handler => handler({ data: { type: 'workflows-error', requestId: requests().at(-1)?.requestId, error: message } })));
}

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
  postMessage.mockReset();
  window.history.replaceState(null, '', '#workflows');
  (window as any).chrome = { webview: {
    postMessage,
    addEventListener: (_name: string, handler: (event: { data: any }) => void) => handlers.add(handler),
    removeEventListener: (_name: string, handler: (event: { data: any }) => void) => handlers.delete(handler),
  } };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as any).chrome;
});

describe('unified Workflows page', () => {
  it('expands and restores the diagram while retaining its canvas and polling subscription', () => {
    render(<App />);
    result(ready);
    const canvas=screen.getByTitle('Agent Core unified workflows canvas');
    fireEvent.click(screen.getByRole('button', {name:'Expand workflows diagram'}));
    expect(screen.getByRole('region', {name:'Unified system and Memory source map'})).toHaveClass('is-expanded');
    expect(screen.getByTitle('Agent Core unified workflows canvas')).toBe(canvas);
    fireEvent.click(screen.getByRole('button', {name:'Close expanded diagram'}));
    expect(screen.getByRole('region', {name:'Unified system and Memory source map'})).not.toHaveClass('is-expanded');
    expect(requests()).toHaveLength(1);
  });
  it('can pause automatic refresh, refresh manually and detect a changed source fingerprint', () => {
    render(<App />);
    result(ready);
    fireEvent.click(screen.getByRole('button', { name: 'Auto update on' }));
    act(() => vi.advanceTimersByTime(9000));
    expect(requests()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workflows' }));
    result({ ...ready, fingerprint: 'fingerprint-two', html: '<html>Updated source</html>' });
    expect(screen.getByRole('status')).toHaveTextContent('Source change detected');
    expect(screen.getByTitle('Agent Core unified workflows canvas')).toHaveAttribute('srcdoc', '<html>Updated source</html>');
    act(() => vi.advanceTimersByTime(9000));
    expect(requests()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Auto update paused' }));
    expect(requests()).toHaveLength(3);
    result({ ...ready, fingerprint: 'fingerprint-two' });
    act(() => vi.advanceTimersByTime(3000));
    expect(requests()).toHaveLength(4);
  });
  it('restores the Workflows route and offers one source-analysis canvas for the system and Memory', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#workflows');
    expect(screen.getByText(/Source analysis, not live execution/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /memory/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Building the source map/i)).toBeInTheDocument();
    expect(requests()).toHaveLength(1);
    expect(requests()[0].requestId).toEqual(expect.any(String));
    result(ready);
    const canvas = screen.getByTitle('Agent Core unified workflows canvas');
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
    expect(canvas).toHaveAttribute('sandbox', 'allow-scripts');
    expect(canvas).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(canvas).toHaveAttribute('srcdoc', ready.html);
    expect(screen.getByText('72 nodes')).toBeInTheDocument();
    expect(screen.getByText('91 edges')).toBeInTheDocument();
    expect(screen.getByText('24 source files')).toBeInTheDocument();
    expect(screen.getByText('3 unresolved')).toBeInTheDocument();
    expect(screen.getByText('Dynamic dispatch is unresolved.')).toBeInTheDocument();
    expect(screen.getByText('revision-one')).toBeInTheDocument();
    expect(screen.getByText('fingerprint-one')).toBeInTheDocument();
    expect(screen.getByText('Git HEAD (reference only)')).toBeInTheDocument();
    expect(screen.getByText('Working-tree fingerprint')).toBeInTheDocument();
  });

  it('polls only after a response and prevents repeated refreshes from overlapping', () => {
    render(<App />);
    const refresh = screen.getByRole('button', { name: 'Refresh workflows' });
    expect(refresh).toBeDisabled();
    act(() => vi.advanceTimersByTime(5000));
    expect(requests()).toHaveLength(1);
    result({ status: 'building', limitations: [] });
    expect(refresh).toBeEnabled();
    act(() => vi.advanceTimersByTime(3000));
    expect(requests()).toHaveLength(2);
    result(ready);
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(requests()).toHaveLength(3);
    result(ready);
    const canvas = screen.getByTitle('Agent Core unified workflows canvas');
    act(() => vi.advanceTimersByTime(3000));
    result(ready);
    expect(screen.getByTitle('Agent Core unified workflows canvas')).toBe(canvas);
    expect(requests()).toHaveLength(4);
  });

  it('keeps the last good canvas and its provenance visible during stale snapshots and errors', () => {
    render(<App />);
    result(ready);
    const canvas = screen.getByTitle('Agent Core unified workflows canvas');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workflows' }));
    result({ status: 'stale', error: 'Canvas rebuild failed; retry pending', limitations: ['Rebuilding after a source change.'] });
    expect(screen.getByRole('alert')).toHaveTextContent('Canvas rebuild failed; retry pending');
    expect(canvas).toHaveAttribute('srcdoc', ready.html);
    expect(screen.getByText(/Showing the last successful source map/i)).toBeInTheDocument();
    expect(screen.getByText('revision-one')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workflows' }));
    error('Source analysis unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('Source analysis unavailable');
    expect(screen.getByTitle('Agent Core unified workflows canvas')).toBe(canvas);
    expect(canvas).toHaveAttribute('srcdoc', ready.html);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh workflows' }));
    result({ status: 'error', error: 'Analyzer failed', limitations: [] });
    expect(screen.getByRole('alert')).toHaveTextContent('Analyzer failed');
    expect(canvas).toHaveAttribute('srcdoc', ready.html);
  });

  it('times out a missing reply, retries, and rejects an older response', () => {
    render(<App />);
    const firstId = requests()[0].requestId;
    act(() => vi.advanceTimersByTime(12000));
    expect(screen.getByRole('alert')).toHaveTextContent(/timed out/i);
    expect(screen.getByRole('button', { name: 'Refresh workflows' })).toBeEnabled();
    act(() => vi.advanceTimersByTime(3000));
    expect(requests()).toHaveLength(2);
    result(ready, firstId);
    expect(screen.queryByTitle('Agent Core unified workflows canvas')).not.toBeInTheDocument();
    result(ready);
    expect(screen.getByTitle('Agent Core unified workflows canvas')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cleans up subscriptions and timers on navigation and restores Workflows through the hash', () => {
    const view = render(<App />);
    const oldId = requests()[0].requestId;
    expect(handlers.size).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(window.location.hash).toBe('#dashboard');
    // App + dashboard proposal reader; the Workflows subscriber was removed.
    expect(handlers.size).toBe(2);
    act(() => vi.advanceTimersByTime(20000));
    expect(requests()).toHaveLength(1);
    act(() => {
      window.history.replaceState(null, '', '#workflows');
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(screen.getByRole('heading', { name: 'Workflows' })).toBeInTheDocument();
    expect(requests()).toHaveLength(2);
    result(ready, oldId);
    expect(screen.queryByTitle('Agent Core unified workflows canvas')).not.toBeInTheDocument();
    result(ready);
    view.unmount();
    expect(handlers.size).toBe(0);
    const count = requests().length;
    act(() => vi.advanceTimersByTime(20000));
    expect(requests()).toHaveLength(count);
  });

  it('does not forward window messages from the canvas to the native host', () => {
    render(<App />);
    result(ready);
    postMessage.mockClear();
    act(() => window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'action', action: 'restart-all' }, origin: 'null',
    })));
    expect(postMessage).not.toHaveBeenCalled();
  });
});
