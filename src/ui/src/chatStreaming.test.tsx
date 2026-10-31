import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPage } from './pages';
import { reduceAgentStream, type AgentChatEvent, type AgentChatUiState } from './host';

const event = (stream: AgentChatEvent['stream']): AgentChatEvent => ({
  type: 'assistant.stream', at: 'now', conversationId: 'c1', turnId: 't1', stream,
});

describe('live response preview', () => {
  it('replaces failed attempts, ignores old fragments and clears on terminal events', () => {
    let preview = reduceAgentStream(undefined, event({ type: 'start', id: 'attempt-1' }));
    preview = reduceAgentStream(preview, event({ type: 'delta', id: 'attempt-1', text: 'old' }));
    expect(preview?.text).toBe('old');
    preview = reduceAgentStream(preview, event({ type: 'reset', id: 'attempt-1' }));
    expect(preview).toBeUndefined();
    preview = reduceAgentStream(preview, event({ type: 'start', id: 'attempt-2' }));
    preview = reduceAgentStream(preview, event({ type: 'delta', id: 'attempt-1', text: 'late' }));
    preview = reduceAgentStream(preview, event({ type: 'delta', id: 'attempt-2', text: 'new' }));
    preview = reduceAgentStream(preview, event({ type: 'end', id: 'attempt-2' }));
    expect(preview?.text).toBe('new');
    for (const type of ['assistant.final', 'turn.failed', 'turn.cancelled', 'turn.paused']) {
      expect(reduceAgentStream(preview, { ...event(undefined), type })).toBeUndefined();
    }
  });

  it('bounds the temporary text and never changes canonical messages', () => {
    const preview = reduceAgentStream(reduceAgentStream(undefined, event({ type: 'start', id: 'attempt' })),
      event({ type: 'delta', id: 'attempt', text: 'x'.repeat(100_000) }));
    expect(preview?.text).toHaveLength(16_384);
    expect(reduceAgentStream(preview, { ...event({ type: 'delta', id: 'attempt', text: 'foreign' }), turnId: 'other' })).toBe(preview);
  });

  it('shows escaped temporary text while running and only the persisted answer after completion', () => {
    const agentChat: AgentChatUiState = { conversations: [], modelChoice: '', streaming: {
      conversationId: 'c1', turnId: 't1', id: 'attempt', text: '<script>partial text</script>',
    }, active: {
      conversation: { id: 'c1', runtimeSessionId: 's1', workspace: 'agent-core', title: 'Task', status: 'active', createdAtMs: 1, updatedAtMs: 1 },
      messages: [], turns: [{ id: 't1', conversationId: 'c1', clientRequestId: 'r1', runtimeTaskId: 'task1', status: 'running', createdAtMs: 1, startedAtMs: 1 }],
    } };
    const props: ComponentProps<typeof ChatPage> = { logs: [], onAction: vi.fn(), setPage: vi.fn(), agentChat,
      agentRun: { status: 'idle' }, onAgentRun: vi.fn(), onChatCreate: vi.fn(), onChatOpen: vi.fn(), onChatSend: vi.fn(),
      onChatCancel: vi.fn(), onChatArchive: vi.fn() };
    const view = render(<ChatPage {...props}/>);
    expect(screen.getByLabelText('Respons sementara')).toHaveTextContent('<script>partial text</script>');
    expect(view.container.querySelector('script')).toBeNull();
    expect(agentChat.active!.messages).toEqual([]);
    view.rerender(<ChatPage {...props} agentChat={{ ...agentChat, active: { ...agentChat.active!,
      turns: [{ ...agentChat.active!.turns[0]!, status: 'finalized' }],
      messages: [{ id: 'm1', conversationId: 'c1', turnId: 't1', role: 'assistant', content: 'Canonical final', createdAtMs: 2 }],
    } }}/>);
    expect(screen.queryByLabelText('Respons sementara')).toBeNull();
    expect(screen.getByText('Canonical final')).toBeInTheDocument();
  });
});
