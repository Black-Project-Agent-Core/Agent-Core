import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from './App';

const handlers = new Set<(event: { data: any }) => void>();
const postMessage = vi.fn();
const revision = 'sha256:' + 'a'.repeat(64), documentDigest = 'sha256:' + 'b'.repeat(64);
const item = { id: 'doc:proposal-one', kind: 'improvement', title: 'Improve recall', path: 'E:\\Project\\docs\\proposals\\improve-recall.md',
  status: 'HOLD', revisionDigest: revision, documentDigest, readStatus: 'available', projection: 'document' };
const requests = (type: string) => postMessage.mock.calls.map(([message]) => message).filter(message => message.type === type);
function response(type: string, result: any, requestId = requests(type === 'proposals-result' ? 'proposals-get' : 'proposal-read').at(-1)?.requestId) {
  act(() => handlers.forEach(handler => handler({ data: { type, requestId, result } })));
}
beforeEach(() => {
  handlers.clear(); postMessage.mockReset(); window.history.replaceState(null, '', '#dashboard');
  (window as any).chrome = { webview: { postMessage,
    addEventListener: (_: string, fn: any) => handlers.add(fn), removeEventListener: (_: string, fn: any) => handlers.delete(fn) } };
});
afterEach(() => { cleanup(); delete (window as any).chrome; });

test('dashboard cards show path status and revision, then read literal Markdown before decision guidance', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Proposals to review' })).toBeInTheDocument();
  response('proposals-result', { items: [item], guides: [], warnings: [] });
  expect(screen.getByText(item.path)).toBeInTheDocument(); expect(screen.getByText('HOLD')).toBeInTheDocument();
  expect(screen.getByText(revision)).toBeInTheDocument();
  expect(screen.queryByText(/Decision guidance/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Read Improve recall' }));
  response('proposal-read-result', { ...item, text: '# Full proposal\n\n<script>window.compromised = true</script>\n\n```ts\nconst tail = "preserved";\n```',
    decisionGuidance: 'Decision guidance: review this exact revision with your external controller. No approval is recorded here.' });
  expect(screen.getByText(/const tail = "preserved"/)).toBeInTheDocument();
  expect(screen.getByText(/Decision guidance:/)).toBeInTheDocument();
  expect(document.querySelector('.proposal-reader script')).toBeNull();
  expect((window as any).compromised).toBeUndefined();
  expect(postMessage.mock.calls.every(([message]) => !/approve|decide|activate|build/.test(message.type))).toBe(true);
});

test('outdated reads are ignored and unavailable proposals cannot supply decision guidance', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Proposals to review' })).toBeInTheDocument();
  response('proposals-result', { items: [item, { ...item, id: 'doc:stale', title: 'Stale mirror', readStatus: 'drift' }], guides: [], warnings: [] });
  expect(screen.getByRole('button', { name: 'Read Stale mirror' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Read Improve recall' }));
  response('proposal-read-result', { ...item, text: 'WRONG REVISION', decisionGuidance: 'Do something' }, 'old-request');
  expect(screen.queryByText('WRONG REVISION')).not.toBeInTheDocument();
  const pending = requests('proposal-read').at(-1)!;
  act(() => handlers.forEach(handler => handler({ data: { type: 'proposal-read-error', requestId: pending.requestId, error: 'PROPOSAL_DOCUMENT_CHANGED' } })));
  expect(screen.getByRole('alert')).toHaveTextContent('PROPOSAL_DOCUMENT_CHANGED');
  expect(screen.queryByText(/Decision guidance/)).not.toBeInTheDocument();
});

test('catalog revision changes invalidate an outstanding read before its response arrives', () => {
  render(<App />);
  response('proposals-result', { items: [item], guides: [], warnings: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Read Improve recall' }));
  const pending = requests('proposal-read').at(-1)!;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh proposals' }));
  response('proposals-result', { items: [{ ...item, revisionDigest: 'sha256:' + 'c'.repeat(64) }], guides: [], warnings: [] });
  response('proposal-read-result', { ...item, text: 'PREVIOUS REVISION', decisionGuidance: 'Decision guidance: outdated' }, pending.requestId);
  expect(screen.queryByText('PREVIOUS REVISION')).not.toBeInTheDocument();
  expect(screen.queryByText(/Decision guidance: outdated/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read Improve recall' })).toBeEnabled();
});
