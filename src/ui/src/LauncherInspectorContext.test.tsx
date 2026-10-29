import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LauncherInspector } from './LauncherInspector';
import type { AgentChatUiState } from './host';

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
  expect(screen.getByTestId('context-meter-mark')).toHaveAttribute('title', 'compact manual paling pas ~70%');
  expect(view.container).toHaveTextContent('compact manual paling pas ~70%');
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

it('no longer renders the context meter above the composer', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/pages.tsx'), 'utf8');
  expect(source).not.toContain('<ContextMeter');
});
