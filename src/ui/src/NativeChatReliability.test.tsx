import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPage } from './pages';
import type { AgentChatTurn, DesktopSnapshot } from './host';

function props(status: AgentChatTurn['status'] = 'finalized'): ComponentProps<typeof ChatPage> {
  const conversation = { id: 'chat-1', runtimeSessionId: 'session-1', workspace: 'fixture', title: 'Fixture',
    status: 'active' as const, createdAtMs: 1, updatedAtMs: 2 };
  return {
    snapshot: { health: { agentRuntime: { status: 'available', configuredProviderCount: 1, providerCount: 1 } } } as DesktopSnapshot,
    logs: [], onAction: vi.fn(), setPage: vi.fn(), agentRun: { status: 'idle' }, onAgentRun: vi.fn(),
    agentChat: { conversations: [conversation], active: { conversation,
      turns: [{ id: 'turn-1', conversationId: 'chat-1', clientRequestId: 'request-1', runtimeTaskId: 'task-1',
        status, createdAtMs: 1, startedAtMs: 1 }], messages: [] } },
    onChatCreate: vi.fn(), onChatOpen: vi.fn(), onChatSend: vi.fn(), onChatCancel: vi.fn(), onChatArchive: vi.fn(),
  };
}

describe('Native chat progress and durable states', () => {
  it('shows a saved response without declaring task verification success', () => {
    render(<ChatPage {...props()}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Response saved');
    expect(screen.queryByText('Task verified')).not.toBeInTheDocument();
  });

  it('keeps uncertain recovery visible and offers the existing cancellation action', () => {
    const input = props('resumable');
    input.agentChat.active!.turns[0]!.errorCode = 'AGENT_CHAT_RESUME_SIDE_EFFECT_RESULT_UNAVAILABLE';
    render(<ChatPage {...input}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Recovery paused');
    expect(screen.getByRole('status')).toHaveTextContent('AGENT_CHAT_RESUME_SIDE_EFFECT_RESULT_UNAVAILABLE');
    expect(screen.getByPlaceholderText('Message Agent Core…')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop recovery' }));
    expect(input.onChatCancel).toHaveBeenCalledWith('turn-1');
    expect(input.onChatSend).not.toHaveBeenCalled();
  });

  it('uses a readable progress label and preserves the tool failure distinction', () => {
    const input = props('running');
    input.agentChat.lastEvent = { type: 'tool.completed', at: new Date().toISOString(),
      conversationId: 'chat-1', turnId: 'turn-1', success: false, toolName: 'read_file' };
    render(<ChatPage {...input}/>);
    expect(screen.getByText('Tool failed; checking recovery')).toBeInTheDocument();
    expect(screen.queryByText('tool.completed')).not.toBeInTheDocument();
  });

  it('shows provider waiting separately while preserving the stop action', () => {
    const input = props('resumable');
    input.agentChat.active!.turns[0]!.errorCode = 'AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT';
    render(<ChatPage {...input}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for an eligible provider');
    expect(screen.queryByText('Recovery paused')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop recovery' }));
    expect(input.onChatCancel).toHaveBeenCalledWith('turn-1');
  });

  it('shows persisted Memory use with expandable evidence without declaring causal benefit', () => {
    const input = props();
    input.agentChat.active!.messages.push({ id: 'answer-1', conversationId: 'chat-1', turnId: 'turn-1',
      role: 'assistant', content: 'Observed result', createdAtMs: 2 });
    input.agentChat.active!.turns[0]!.memoryUse = [{ memoryId: 'lesson-1', title: 'Verified fixture lesson',
      applicability: 'adapted', evidenceRefs: ['verification:fixture-report#sha256:' + 'a'.repeat(64)], verification: 'pass' }];
    render(<ChatPage {...input}/>);
    const summary = screen.getByText('Memory use · 1 record');
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Verified fixture lesson')).toBeVisible();
    expect(screen.getByText('adapted · Outcome check passed')).toBeVisible();
    expect(screen.getByText(/Causal benefit is not established/)).toBeVisible();
    expect(screen.getByLabelText('Evidence for Verified fixture lesson')).toHaveTextContent('verification:fixture-report');
  });

  it('keeps unavailable Memory verification distinct and old messages compatible', () => {
    const input = props();
    input.agentChat.active!.messages.push({ id: 'answer-1', conversationId: 'chat-1', turnId: 'turn-1',
      role: 'assistant', content: 'Legacy answer', createdAtMs: 2 });
    const view = render(<ChatPage {...input}/>);
    expect(screen.queryByText(/Memory use/)).not.toBeInTheDocument();
    input.agentChat.active!.turns[0]!.memoryUse = [{ memoryId: 'lesson-2', title: 'Rejected obsolete lesson',
      applicability: 'rejected', evidenceRefs: [], verification: 'unavailable' }];
    view.rerender(<ChatPage {...input}/>);
    fireEvent.click(screen.getByText('Memory use · 1 record'));
    expect(screen.getByText('rejected · Outcome check unavailable')).toBeVisible();
    expect(screen.queryByText('Outcome check passed')).not.toBeInTheDocument();
  });
});
