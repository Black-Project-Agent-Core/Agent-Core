import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LauncherInspector } from './LauncherInspector';
import { postHost } from './host';
import type { AgentChatUiState } from './host';

vi.mock('./host', async importOriginal => ({ ...(await importOriginal<typeof import('./host')>()), postHost: vi.fn() }));

function chatWith(turn: Record<string, unknown>): AgentChatUiState {
  return {
    conversations: [], modelChoice: '', providers: [],
    active: { conversation: { id: 'c1', runtimeSessionId: 's1', workspace: 'agent-core', title: 'Task', status: 'active', createdAtMs: 1, updatedAtMs: 1 },
      messages: [],
      turns: [{ id: 't1', conversationId: 'c1', clientRequestId: 'r1', runtimeTaskId: 'task-1', status: 'running', createdAtMs: 1, startedAtMs: 1,
        model: 'claude-opus-5-5', ...turn }] },
  } as unknown as AgentChatUiState;
}
const renderInspector = (chat: AgentChatUiState) => render(<LauncherInspector chat={chat} logs={[]} open onToggle={vi.fn()}/>);

it('shows the Context Window card with percent, numbers, bar and the 70% marker', () => {
  const view = renderInspector(chatWith({ contextTokens: 144_000, contextWindow: 1_000_000 }));
  expect(screen.getByText('Context Window (14%)')).toBeInTheDocument();
  expect(view.container).toHaveTextContent('Model: claude-opus-5-5');
  expect(view.container).toHaveTextContent('144k / 1M');
  expect(screen.getByRole('meter', { name: 'Context window usage' })).toHaveAttribute('aria-valuenow', '14');
  expect(screen.getByTestId('context-meter-mark')).toHaveAttribute('title', 'otomatis di 100%');
  expect(view.container).toHaveTextContent('otomatis di 100%');
  expect(view.container.querySelector('details[open] > summary')).not.toBeNull();
});

it('never guesses the capacity and shows a plain heading without data', () => {
  const unknown = renderInspector(chatWith({ contextTokens: 5_000 }));
  expect(unknown.container).toHaveTextContent('kapasitas tidak diketahui');
  expect(screen.queryByTestId('context-meter-mark')).toBeNull();
  unknown.unmount();
  const none = renderInspector(chatWith({}));
  expect(screen.getByText('Context Window')).toBeInTheDocument();
  expect(none.container).not.toHaveTextContent('%');
});

it('reads iterations and context recall from the polled turn row, falling back only when absent', () => {
  const live = renderInspector(chatWith({ iterations: 3, maxIterations: 24, retrievalCount: 5 }));
  expect(live.container).toHaveTextContent('Iterations3 / 24');
  expect(live.container).toHaveTextContent('Context recall5');
  expect(live.container).not.toHaveTextContent('Iterations' + 'Not recorded');
  live.unmount();
  const empty = renderInspector(chatWith({}));
  expect(empty.container).toHaveTextContent('IterationsNot recorded');
  expect(empty.container).toHaveTextContent('Context recallNot recorded');
});

it('offers Compact from 70%: hidden below, disabled when idle, enabled while running, click asks the host', () => {
  const below = renderInspector(chatWith({ contextTokens: 690_000, contextWindow: 1_000_000 }));
  expect(screen.queryByRole('button', { name: 'Compact' })).toBeNull();
  below.unmount();
  const idle = renderInspector(chatWith({ contextTokens: 700_000, contextWindow: 1_000_000, status: 'finalized' }));
  expect(screen.getByRole('button', { name: 'Compact' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('title', 'Hanya untuk giliran yang sedang berjalan');
  idle.unmount();
  renderInspector(chatWith({ contextTokens: 700_000, contextWindow: 1_000_000 }));
  const button = screen.getByRole('button', { name: 'Compact' });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(postHost).toHaveBeenCalledWith({ type: 'agent-chat-compact', turnId: 't1' });
});

it('shows the answer to a Compact request only for its own turn', () => {
  const chat = chatWith({ contextTokens: 700_000, contextWindow: 1_000_000 });
  const own = renderInspector({ ...chat, compactResult: { turnId: 't1', status: 'scheduled' } });
  expect(screen.getByRole('status')).toHaveTextContent('Kompaksi dijadwalkan');
  own.unmount();
  const other = renderInspector({ ...chat, compactResult: { turnId: 'other', status: 'scheduled' } });
  expect(screen.queryByRole('status')).toBeNull();
  other.unmount();
  renderInspector({ ...chat, compactResult: { turnId: 't1', status: 'not-running' } });
  expect(screen.getByRole('status')).toHaveTextContent('Tidak ada giliran berjalan');
});

it('no longer renders the context meter above the composer', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/pages.tsx'), 'utf8');
  expect(source).not.toContain('<ContextMeter');
});
