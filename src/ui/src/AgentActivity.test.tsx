import type { ComponentProps } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './pages';
import { reduceAgentActivity } from './host';
import type { AgentChatEvent, AgentChatStepMeta, AgentChatTurn, DesktopSnapshot } from './host';

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
    expect(screen.getByText('Reading files…')).toBeInTheDocument();
  });

  it('shows the finished tool with its duration and a failed tool by name', () => {
    const input = props();
    input.agentChat.lastEvent = ev({ type: 'tool.completed', toolName: 'start_search', success: true, durationMs: 1234 });
    const view = render(<ChatPage {...input}/>);
    expect(screen.getByText('start_search finished')).toBeInTheDocument();
    input.agentChat.lastEvent = ev({ type: 'tool.completed', toolName: 'start_search', success: false, durationMs: 50 });
    view.rerender(<ChatPage {...input}/>);
    expect(screen.getByText('start_search failed')).toBeInTheDocument();
  });

  it('counts the turn duration only while it runs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T10:00:00.000Z'));
    const input = props('running');
    input.agentChat.lastEvent = ev({ type: 'tool.started', toolName: 'read_file', iteration: 1, maxIterations: 24,
      at: '2026-10-29T10:00:00.000Z' });
    input.agentChat.active!.turns[0]!.startedAtMs = Date.parse('2026-10-29T10:00:00.000Z');
    const view = render(<ChatPage {...input}/>);
    act(() => { vi.advanceTimersByTime(40_000); });
    expect(view.container.querySelector('.details-duration')).toHaveTextContent('00:40');
    input.agentChat.active!.turns[0]!.status = 'resumable';
    input.agentChat.runningRequestId = undefined;
    view.rerender(<ChatPage {...input}/>);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(view.container.querySelector('.details-duration')).toHaveTextContent('00:40');
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

describe('Native chat narration, result summaries and budget warning', () => {
  it('shows the result summary in the finished label and in the failed label', () => {
    const input = props();
    input.agentChat.lastEvent = ev({ type: 'tool.completed', toolName: 'start_search', success: true, durationMs: 1234,
      resultSummary: '8 matches in 1 file' });
    const view = render(<ChatPage {...input}/>);
    expect(screen.getByText('start_search finished: 8 matches in 1 file')).toBeInTheDocument();
    input.agentChat.lastEvent = ev({ type: 'tool.completed', toolName: 'start_search', success: false, durationMs: 50,
      resultSummary: 'error: ENOENT' });
    view.rerender(<ChatPage {...input}/>);
    expect(screen.getByText('start_search failed: error: ENOENT')).toBeInTheDocument();
  });

  it('uses the assistant narration as the main status text', () => {
    const input = props();
    input.agentChat.lastEvent = ev({ type: 'assistant.progress', text: 'Saya cek dulu file konfigurasinya.', iteration: 2, maxIterations: 24 });
    render(<ChatPage {...input}/>);
    expect(screen.getByText('Saya cek dulu file konfigurasinya.')).toBeInTheDocument();
  });

  it('shows the budget warning in the status area while running', () => {
    const input = props();
    input.agentChat.activity = [{ id: 'b1', kind: 'budget', toolName: '', status: 'done', iteration: 18, maxIterations: 24 }];
    input.agentChat.lastEvent = ev({ type: 'tool.started', toolName: 'read_file', iteration: 18, maxIterations: 24 });
    render(<ChatPage {...input}/>);
    expect(screen.getByText('Mendekati batas langkah (18/24)')).toBeInTheDocument();
  });

  it('folds progress, budget and result summary events into the activity list once each', () => {
    let list = reduceAgentActivity([], ev({ type: 'turn.accepted' }));
    list = reduceAgentActivity(list, ev({ type: 'assistant.progress', text: 'Mulai cek.', iteration: 1, maxIterations: 24 }));
    list = reduceAgentActivity(list, ev({ type: 'tool.started', toolName: 'read_file', iteration: 1, maxIterations: 24 }));
    list = reduceAgentActivity(list, ev({ type: 'tool.completed', toolName: 'read_file', success: true, durationMs: 5, resultSummary: 'read 10 lines' }));
    list = reduceAgentActivity(list, ev({ type: 'agent.budget', iteration: 18, maxIterations: 24 }));
    list = reduceAgentActivity(list, ev({ type: 'agent.budget', iteration: 18, maxIterations: 24 }));
    expect(list.map(item => item.kind ?? 'step')).toEqual(['note', 'step', 'budget']);
    expect(list[0]).toMatchObject({ text: 'Mulai cek.' });
    expect(list[1]).toMatchObject({ toolName: 'read_file', resultSummary: 'read 10 lines' });
    expect(list[2]).toMatchObject({ iteration: 18, maxIterations: 24 });
  });
});

describe('Native chat per-turn timeline', () => {
  const step = (seq: number, over: Partial<AgentChatStepMeta> = {}): AgentChatStepMeta => ({
    turnId: 'turn-1', seq, toolName: 'read_file', status: 'ok', startedAtMs: 0, durationMs: 100, resultSummary: 'r' + seq, ...over });
  const note = (seq: number, text: string): AgentChatStepMeta =>
    ({ turnId: 'turn-1', seq, kind: 'note', toolName: '', status: 'ok', startedAtMs: 0, resultSummary: text });
  const assistant = { id: 'm2', conversationId: 'chat-1', turnId: 'turn-1', role: 'assistant' as const, content: 'Selesai.', createdAtMs: 3 };

  it('renders narration, grouped steps and invocation cards under the assistant message instead of the activity list', () => {
    const input = props('finalized');
    input.agentChat.active!.messages = [assistant];
    input.agentChat.active!.steps = [
      note(1, 'Saya cek berkasnya dulu.'), step(2), step(3, { toolName: 'start_search' }),
      note(4, 'Sekarang saya ubah.'), step(5, { toolName: 'edit_block' }),
    ];
    const view = render(<ChatPage {...input}/>);
    expect(screen.getByText('Saya cek berkasnya dulu.')).toBeInTheDocument();
    expect(screen.getByText('Sekarang saya ubah.')).toBeInTheDocument();
    expect(screen.getByText(/· 2 langkah/)).toBeInTheDocument();
    expect(screen.getByText('EXECUTED INVOCATIONS (3)')).toBeInTheDocument();
    expect(view.container.querySelector('.chat-message-timeline .chat-timeline')).not.toBeNull();
    expect(screen.queryByText(/Activity ·/)).toBeNull();
  });

  it('renders neither timeline nor cards for a turn without steps', () => {
    const input = props('finalized');
    input.agentChat.active!.messages = [assistant];
    input.agentChat.active!.steps = [];
    const view = render(<ChatPage {...input}/>);
    expect(screen.getByText('Selesai.')).toBeInTheDocument();
    expect(view.container.querySelector('.chat-message-timeline')).toBeNull();
    expect(screen.queryByText(/EXECUTED INVOCATIONS/)).toBeNull();
    expect(screen.queryByText(/Activity ·/)).toBeNull();
  });
});
