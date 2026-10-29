import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './pages';
import { reduceAgentActivity } from './host';
import type { AgentChatEvent, AgentChatTurn, DesktopSnapshot } from './host';

function props(status: AgentChatTurn['status'] = 'running'): ComponentProps<typeof ChatPage> {
  const conversation = { id: 'chat-1', runtimeSessionId: 'session-1', workspace: 'fixture', title: 'Fixture',
    status: 'active' as const, createdAtMs: 1, updatedAtMs: 2 };
  return {
    snapshot: { health: { agentRuntime: { status: 'available', configuredProviderCount: 1, providerCount: 1 } } } as DesktopSnapshot,
    logs: [], onAction: vi.fn(), setPage: vi.fn(), agentRun: { status: 'idle' }, onAgentRun: vi.fn(),
    agentChat: { conversations: [conversation], modelChoice: '', active: { conversation,
      turns: [{ id: 'turn-1', conversationId: 'chat-1', clientRequestId: 'request-1', runtimeTaskId: 'task-1',
        status, createdAtMs: 1, startedAtMs: 1 }], messages: [] } },
    onChatCreate: vi.fn(), onChatOpen: vi.fn(), onChatSend: vi.fn(), onChatCancel: vi.fn(), onChatArchive: vi.fn(),
  };
}

const base = { conversationId: 'chat-1', turnId: 'turn-1' };
const ev = (event: Partial<AgentChatEvent> & { type: string }): AgentChatEvent =>
  ({ at: new Date().toISOString(), ...base, ...event });

afterEach(() => { vi.useRealTimers(); });

describe('Native chat tool activity transcript', () => {
  it('names the running tool with its step number and limit', () => {
    const input = props();
    input.agentChat.lastEvent = ev({ type: 'tool.started', toolName: 'start_search', iteration: 7, maxIterations: 24 });
    render(<ChatPage {...input}/>);
    expect(screen.getByText('Using start_search · langkah 7/24')).toBeInTheDocument();
  });

  it('shows the finished tool with its duration and a failed tool by name', () => {
    const input = props();
    input.agentChat.lastEvent = ev({ type: 'tool.completed', toolName: 'start_search', success: true, durationMs: 1234 });
    const view = render(<ChatPage {...input}/>);
    expect(screen.getByText('Tool finished · start_search · 1,2 s')).toBeInTheDocument();
    input.agentChat.lastEvent = ev({ type: 'tool.completed', toolName: 'start_search', success: false, durationMs: 50 });
    view.rerender(<ChatPage {...input}/>);
    expect(screen.getByText('Tool failed · start_search')).toBeInTheDocument();
  });

  it('counts elapsed seconds for the active step only while the turn is running', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T10:00:00.000Z'));
    const input = props('running');
    input.agentChat.lastEvent = ev({ type: 'tool.started', toolName: 'read_file', iteration: 1, maxIterations: 24,
      at: '2026-10-29T10:00:00.000Z' });
    const view = render(<ChatPage {...input}/>);
    act(() => { vi.advanceTimersByTime(40_000); });
    expect(screen.getByText('40 s')).toBeInTheDocument();
    input.agentChat.active!.turns[0]!.status = 'finalized';
    input.agentChat.runningRequestId = undefined;
    view.rerender(<ChatPage {...input}/>);
    expect(screen.queryByText(/^\d+ s$/)).not.toBeInTheDocument();
  });

  it('lists recent activity in a collapsed section with status, duration and argument summary', () => {
    const input = props('finalized');
    input.agentChat.activity = [
      { id: 'a1', toolName: 'start_search', iteration: 1, status: 'done', durationMs: 1200, argsSummary: 'pattern="x"' },
      { id: 'a2', toolName: 'read_file', iteration: 2, status: 'failed', durationMs: 30, argsSummary: 'path="src/a.ts"' },
      { id: 'a3', toolName: 'write_file', iteration: 3, status: 'done', durationMs: 90, argsSummary: 'path="src/b.ts"' },
    ];
    render(<ChatPage {...input}/>);
    const summary = screen.getByText('Activity · 3 steps');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(screen.getByText('start_search')).toBeVisible();
    expect(screen.getByText('pattern="x"')).toBeVisible();
    expect(screen.getByText('failed · 30 ms')).toBeVisible();
    expect(screen.getByText('done · 1,2 s')).toBeVisible();
    expect(screen.getByText(/actual changes/i)).toBeVisible();
  });

  it('keeps at most the last 30 steps and resets on a new turn', () => {
    let list = reduceAgentActivity([], ev({ type: 'turn.accepted' }));
    for (let i = 1; i <= 35; i += 1) {
      list = reduceAgentActivity(list, ev({ type: 'tool.started', toolName: 't' + i, iteration: i, maxIterations: 40, argsSummary: 'a' }));
      list = reduceAgentActivity(list, ev({ type: 'tool.completed', toolName: 't' + i, success: i % 2 === 1, durationMs: i }));
    }
    expect(list).toHaveLength(30);
    expect(list[0]).toMatchObject({ toolName: 't6', status: 'failed', durationMs: 6 });
    expect(list.at(-1)).toMatchObject({ toolName: 't35', status: 'done', iteration: 35, argsSummary: 'a' });
    expect(reduceAgentActivity(list, ev({ type: 'turn.accepted' }))).toEqual([]);
    expect(reduceAgentActivity(list, ev({ type: 'agent.planning' }))).toBe(list);
  });
});
