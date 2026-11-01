import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LauncherInspector } from './LauncherInspector';
import { FREE_SPACE_COLOR, SEGMENT_COLORS } from './ContextMeter';
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

it('shows the Context card with the "% used" header, used / window, bar and the 70% marker; the model moves into the details list', () => {
  const view = renderInspector(chatWith({ contextTokens: 144_000, contextWindow: 1_000_000 }));
  expect(screen.getByText('Context')).toBeInTheDocument();
  expect(screen.queryByText(/Context Window/)).toBeNull();
  expect(screen.getByText('14% used').tagName).toBe('B');
  expect(screen.getByText('144k / 1M')).toBeInTheDocument();
  expect(view.container.querySelector('.inspector-context-head')).toHaveTextContent(/^14% used144k \/ 1M$/);
  expect(view.container).toHaveTextContent('Modelclaude-opus-5-5');
  expect(view.container).not.toHaveTextContent('Model:');
  expect(screen.getByRole('meter', { name: 'Context window usage' })).toHaveAttribute('aria-valuenow', '14');
  expect(screen.getByTestId('context-meter-mark')).toHaveAttribute('title', 'otomatis di 100%');
  expect(view.container).toHaveTextContent('otomatis di 100%');
  expect(view.container.querySelector('details[open] > summary')).not.toBeNull();
});

it('never guesses the capacity: single bar, no "% used", label text in the header, old share percent in the rows', () => {
  const unknown = renderInspector(chatWith({ contextTokens: 5_000, contextBreakdown: { system: 1, tools: 1, conversation: 1, memory: 1 } }));
  expect(unknown.container.querySelector('.inspector-context-head')).toHaveTextContent(/^5k · kapasitas tidak diketahui$/);
  expect(screen.queryByText(/% used/)).toBeNull();
  expect(screen.queryByTestId('context-meter-mark')).toBeNull();
  expect(screen.queryByTestId('context-segment-system')).toBeNull();
  expect(screen.getByRole('meter')).not.toHaveAttribute('aria-valuenow');
  expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual([
    'System Instructions1k25%', 'Tools & MCP Manifests1k25%', 'Memory Injections1k25%', 'Conversation & Files1k25%']);
  unknown.unmount();
  const none = renderInspector(chatWith({}));
  expect(screen.getByText('Context')).toBeInTheDocument();
  expect(none.container.querySelector('.inspector-context-head')).toHaveTextContent(/^Not recorded$/);
  expect(none.container).not.toHaveTextContent('%');
});

it('lists the four categories plus Free space with a coloured swatch, tokens and the percent of the window, feeding only the categories to the bar', () => {
  const view = renderInspector(chatWith({ contextTokens: 100_000, contextWindow: 1_000_000,
    contextBreakdown: { system: 1, tools: 2, conversation: 3, memory: 4 } }));
  const items = screen.getAllByRole('listitem');
  expect(items.map(item => item.textContent)).toEqual([
    'System Instructions10k1.0%', 'Tools & MCP Manifests20k2.0%', 'Memory Injections40k4.0%', 'Conversation & Files30k3.0%',
    'Free space900k90.0%']);
  const swatches = view.container.querySelectorAll('.inspector-swatch');
  expect(swatches).toHaveLength(5);
  expect(swatches[0]).toHaveAttribute('aria-hidden', 'true');
  expect(swatches[0]).toHaveStyle({ backgroundColor: SEGMENT_COLORS.system });
  expect(swatches[2]).toHaveStyle({ backgroundColor: SEGMENT_COLORS.memory });
  expect(swatches[4]).toHaveStyle({ backgroundColor: FREE_SPACE_COLOR });
  expect(screen.getByTestId('context-segment-system')).toHaveStyle({ width: '1%' });
  expect(screen.getByTestId('context-segment-memory')).toHaveStyle({ width: '4%' });
  expect(screen.queryByTestId('context-segment-free')).toBeNull();
});

it('shows only the categories present in the data: Skills and Tool Results appear when the breakdown has them', () => {
  const view = renderInspector(chatWith({ contextTokens: 100_000, contextWindow: 1_000_000,
    contextBreakdown: { system: 1, tools: 1, conversation: 1, memory: 1, skills: 1, toolResults: 1 } }));
  const items = screen.getAllByRole('listitem');
  expect(items.map(item => item.textContent?.split(/\d/)[0])).toEqual([
    'System Instructions', 'Tools & MCP Manifests', 'Skills', 'Memory Injections', 'Conversation & Files', 'Tool Results', 'Free space']);
  const swatches = view.container.querySelectorAll('.inspector-swatch');
  expect(swatches[2]).toHaveStyle({ backgroundColor: SEGMENT_COLORS.skills });
  expect(swatches[5]).toHaveStyle({ backgroundColor: SEGMENT_COLORS.toolResults });
});

it('prefixes the used number with "~" only when the turn\'s context usage is an interim estimate', () => {
  const real = renderInspector(chatWith({ contextTokens: 144_000, contextWindow: 1_000_000 }));
  expect(real.container.querySelector('.inspector-context-head')).toHaveTextContent('144k / 1M');
  real.unmount();
  const estimated = renderInspector(chatWith({ contextTokens: 144_000, contextWindow: 1_000_000, contextEstimated: true }));
  expect(estimated.container.querySelector('.inspector-context-head')).toHaveTextContent('~144k / 1M');
});

it('shows a Cache hit row only when cacheReadTokens is known, as a percent of the current context size', () => {
  const without = renderInspector(chatWith({ contextTokens: 100_000, contextWindow: 1_000_000 }));
  expect(without.container).not.toHaveTextContent('Cache hit');
  without.unmount();
  const view = renderInspector(chatWith({ contextTokens: 100_000, contextWindow: 1_000_000, cacheReadTokens: 80_000 }));
  expect(view.container).toHaveTextContent('Cache hit80%');
  expect(screen.getByText('80%')).toHaveAttribute('title', 'dari panggilan model terakhir');
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

it('offers Compact session from 70% with the room left before auto-compact: hidden below, disabled when idle, enabled while running, click asks the host', () => {
  const below = renderInspector(chatWith({ contextTokens: 690_000, contextWindow: 1_000_000 }));
  expect(screen.queryByRole('button', { name: 'Compact session' })).toBeNull();
  expect(below.container).not.toHaveTextContent('until auto-compact');
  below.unmount();
  const idle = renderInspector(chatWith({ contextTokens: 700_000, contextWindow: 1_000_000, status: 'finalized' }));
  expect(idle.container).toHaveTextContent('300k until auto-compact');
  expect(screen.getByRole('button', { name: 'Compact session' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Compact session' })).toHaveAttribute('title', 'Hanya untuk giliran yang sedang berjalan');
  idle.unmount();
  renderInspector(chatWith({ contextTokens: 700_000, contextWindow: 1_000_000 }));
  const button = screen.getByRole('button', { name: 'Compact session' });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(postHost).toHaveBeenCalledWith({ type: 'agent-chat-compact', turnId: 't1' });
});

it('shows the answer to a Compact request only for its own turn', () => {
  const chat = chatWith({ contextTokens: 700_000, contextWindow: 1_000_000 });
  // The Outputs card also announces its own status messages, so the notice is read inside the Context card.
  const contextCard = () => within(screen.getByText('Context').closest('details') as HTMLElement);
  const own = renderInspector({ ...chat, compactResult: { turnId: 't1', status: 'scheduled' } });
  expect(contextCard().getByRole('status')).toHaveTextContent('Kompaksi dijadwalkan');
  own.unmount();
  const other = renderInspector({ ...chat, compactResult: { turnId: 'other', status: 'scheduled' } });
  expect(contextCard().queryByRole('status')).toBeNull();
  other.unmount();
  renderInspector({ ...chat, compactResult: { turnId: 't1', status: 'not-running' } });
  expect(contextCard().getByRole('status')).toHaveTextContent('Tidak ada giliran berjalan');
});

it('no longer renders the context meter above the composer', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/pages.tsx'), 'utf8');
  expect(source).not.toContain('<ContextMeter');
});
