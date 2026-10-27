import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { TaskChangesPanel } from './TaskChangesPanel';

const handlers = new Set<(event: { data: any }) => void>();
const postMessage = vi.fn();
const lookups = () => postMessage.mock.calls.map(([message]) => message).filter(message => message.type === 'task-changes-get');
const reply = (message: any) => act(() => handlers.forEach(handler => handler({ data: message })));
const diff = (state: string, extra: object = {}) => ({ state, ...extra });
const base = (over: object = {}) => ({
  taskId: 'task-1', generatedAt: '2026-10-27T10:00:00.000Z', checkpointCount: 1,
  requests: [{ checkpointId: 'cp-1', invocationId: 'a'.repeat(32), at: '2026-10-27T09:59:00.000Z',
    paths: [{ path: 'src/a.ts', afterwards: 'differs' }, { path: 'src/failed.ts', afterwards: 'same' }] }],
  applied: { unchanged: 1, truncated: false, items: [
    { path: 'src/a.ts', state: 'modified', attribution: 'checkpoint-baseline', checkpointIds: ['cp-1'], invocationIds: ['a'.repeat(32)],
      otherCheckpointTasks: ['task-other'], before: { exists: true, size: 10 }, after: { exists: true, size: 12 },
      diff: diff('text', { text: '@@ -1 +1 @@\n-old line\n+new line', additions: 1, deletions: 1 }) },
    { path: 'logo.png', state: 'modified', attribution: 'checkpoint-baseline', checkpointIds: [], invocationIds: [], otherCheckpointTasks: [],
      before: { exists: true, size: 4 }, after: { exists: true, size: 4 }, diff: diff('binary') },
    { path: 'new.txt', oldPath: 'old.txt', state: 'renamed', attribution: 'checkpoint-baseline', checkpointIds: [], invocationIds: [], otherCheckpointTasks: [],
      before: { exists: true, size: 4 }, after: { exists: true, size: 4 }, diff: diff('none') },
    { path: 'big.txt', state: 'modified', attribution: 'checkpoint-baseline', checkpointIds: [], invocationIds: [], otherCheckpointTasks: [],
      before: { exists: true, size: 900000 }, after: { exists: true, size: 900001 }, diff: diff('too-large') },
    { path: 'long.txt', state: 'modified', attribution: 'checkpoint-baseline', checkpointIds: [], invocationIds: [], otherCheckpointTasks: [],
      before: { exists: true, size: 1 }, after: { exists: true, size: 50000 }, diff: diff('truncated', { text: '@@ -1 +1,600 @@\n+first', additions: null, deletions: null }) },
  ] },
  external: { state: 'ok', truncated: false, total: 2, items: [
    { path: 'shell.txt', state: 'untracked', binary: null, additions: null, deletions: null, modifiedAfterTaskStart: true, attribution: 'unattributed' },
    { path: 'dirty.txt', state: 'modified', binary: false, additions: 3, deletions: 1, modifiedAfterTaskStart: false, attribution: 'unattributed' },
  ] },
  ...over,
});

beforeEach(() => {
  handlers.clear(); postMessage.mockReset();
  (window as any).chrome = { webview: { postMessage,
    addEventListener: (_: string, fn: any) => handlers.add(fn), removeEventListener: (_: string, fn: any) => handlers.delete(fn) } };
});
afterEach(() => { cleanup(); delete (window as any).chrome; vi.useRealTimers(); });

test('stays collapsed and silent until opened, then looks up only by task id', () => {
  render(<TaskChangesPanel taskId="task-1" />);
  const toggle = screen.getByRole('button', { name: 'Show actual changes' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(lookups()).toHaveLength(0);
  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Hide actual changes' })).toHaveAttribute('aria-expanded', 'true');
  expect(lookups()).toEqual([{ type: 'task-changes-get', requestId: expect.any(String), taskId: 'task-1' }]);
  expect(screen.getByRole('status')).toHaveTextContent('Reading checkpoints and Git');
});

test('shows requests, applied diffs and external changes as three separate groups with explicit states', () => {
  render(<TaskChangesPanel taskId="task-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Show actual changes' }));
  reply({ type: 'task-changes-result', requestId: lookups().at(-1).requestId, result: base() });

  const requests = screen.getByRole('region', { name: 'Proposed requests' });
  expect(within(requests).getByText(/File differs afterwards/)).toBeInTheDocument();
  expect(within(requests).getByText(/No difference observed afterwards/)).toBeInTheDocument();

  const applied = screen.getByRole('region', { name: 'Applied changes' });
  const pre = within(applied).getByLabelText('Diff for src/a.ts');
  expect(pre).toHaveAttribute('tabindex', '0');
  expect(pre).toHaveTextContent('-old line');
  expect(pre).toHaveTextContent('+new line');
  expect(pre.querySelector('.diff-removed')).toHaveTextContent('-old line');
  expect(pre.querySelector('.diff-added')).toHaveTextContent('+new line');
  expect(within(applied).getByText(/Also checkpointed later by: task-other/)).toBeInTheDocument();
  expect(within(applied).getByText('Binary file: content not shown.')).toBeInTheDocument();
  expect(within(applied).getByText('Identical content: the file only moved.')).toBeInTheDocument();
  expect(within(applied).getByText('old.txt')).toBeInTheDocument();
  expect(within(applied).getByText(/Too large to diff/)).toBeInTheDocument();
  expect(within(applied).getByText('Diff truncated: only the first part is shown.')).toBeInTheDocument();

  const external = screen.getByRole('region', { name: 'External or unattributed changes' });
  expect(within(external).getByText('shell.txt').parentElement).toHaveTextContent('modified after this task started (hint only)');
  expect(within(external).getByText('dirty.txt').parentElement).toHaveTextContent('not modified since this task started');
  expect(within(external).getAllByText(/Unattributed/)).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /stage|commit|restore|revert/i })).toBeNull();
  expect(postMessage.mock.calls.every(([message]) => message.type === 'task-changes-get')).toBe(true);
});

test('explains a task with no checkpoints and unavailable Git instead of showing an empty success', () => {
  render(<TaskChangesPanel taskId="task-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Show actual changes' }));
  reply({ type: 'task-changes-result', requestId: lookups().at(-1).requestId, result: base({
    checkpointCount: 0, requests: [], applied: { items: [], unchanged: 0, truncated: false },
    external: { state: 'unavailable', reason: 'git-not-installed', items: [], total: 0, truncated: false } }) });
  expect(screen.getByText(/No automatic checkpoint exists for this task/)).toBeInTheDocument();
  expect(screen.getByText(/Git status is unavailable \(git-not-installed\)/)).toBeInTheDocument();
  expect(screen.queryByText(/working tree is clean/)).toBeNull();
});

test('says so when nothing changed and the tree is clean', () => {
  render(<TaskChangesPanel taskId="task-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Show actual changes' }));
  reply({ type: 'task-changes-result', requestId: lookups().at(-1).requestId, result: base({
    checkpointCount: 0, requests: [], applied: { items: [], unchanged: 0, truncated: false },
    external: { state: 'ok', items: [], total: 0, truncated: false } }) });
  expect(screen.getByText(/No changes were recorded for this task and the working tree is clean/)).toBeInTheDocument();
});

test('reports errors with an alert, ignores stale or foreign replies, and retries through Refresh', () => {
  render(<TaskChangesPanel taskId="task-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Show actual changes' }));
  const first = lookups().at(-1).requestId;
  reply({ type: 'task-changes-result', requestId: 'someone-else', result: base() });
  expect(screen.queryByRole('region', { name: 'Applied changes' })).toBeNull();
  reply({ type: 'task-changes-result', requestId: first, result: base({ taskId: 'another-task' }) });
  expect(screen.getByRole('alert')).toHaveTextContent('not a valid task changes report');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(lookups()).toHaveLength(2);
  reply({ type: 'task-changes-result', requestId: first, result: base() }); // answer to the superseded request
  expect(screen.queryByRole('region', { name: 'Applied changes' })).toBeNull();
  reply({ type: 'task-changes-error', requestId: lookups().at(-1).requestId, error: 'TASK_CHANGES_UNAVAILABLE' });
  expect(screen.getByRole('alert')).toHaveTextContent('TASK_CHANGES_UNAVAILABLE');
});

test('times out with an alert when the host never answers', () => {
  vi.useFakeTimers();
  render(<TaskChangesPanel taskId="task-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Show actual changes' }));
  act(() => { vi.advanceTimersByTime(26000); });
  expect(screen.getByRole('alert')).toHaveTextContent('timed out');
});
