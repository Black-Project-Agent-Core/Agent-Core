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
    agentChat: { conversations: [conversation], modelChoice: '', active: { conversation,
      turns: [{ id: 'turn-1', conversationId: 'chat-1', clientRequestId: 'request-1', runtimeTaskId: 'task-1',
        status, createdAtMs: 1, startedAtMs: 1 }], messages: [] } },
    onChatCreate: vi.fn(), onChatOpen: vi.fn(), onChatSend: vi.fn(), onChatCancel: vi.fn(), onChatArchive: vi.fn(),
  };
}

describe('Native chat progress and durable states', () => {
  it('keeps decision evidence collapsed and scoped to the latest task, with source text inert', () => {
    const input = props();
    input.agentChat.active!.decisionEvidence = { status: 'available', taskId: 'task-1', truncated: true,
      attribution: 'controller-declared', goalVerification: 'not-established', records: [{ id: 'd1', question: 'Why did HTTP fail?',
        assumptions: [{ statement: 'Credential current', basis: 'observed' }],
        alternatives: [{ id: 'a1', claim: 'Callback missing', check: 'Direct versus HTTP', falsifier: 'Both forward callback', status: 'supported' }],
        summary: 'Transport omission reproduced.', evidenceRefs: ['source:<script>unexpected()</script>'] }] };
    const view = render(<ChatPage {...input}/>);
    const summary = screen.getByText('Decision evidence');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Declared finding: supported')).toBeInTheDocument();
    expect(screen.getByText('source:<script>unexpected()</script>')).toBeInTheDocument();
    expect(view.container.querySelector('script')).toBeNull();
    expect(input.onChatSend).not.toHaveBeenCalled();
    input.agentChat.active!.decisionEvidence.taskId = 'foreign-task';
    view.rerender(<ChatPage {...input}/>);
    expect(screen.queryByText('Decision evidence')).not.toBeInTheDocument();
  });

  it.each(['running', 'resumable', 'stopped'] as const)('reports unavailable evidence for %s without invented results', status => {
    const input = props(status);
    input.agentChat.active!.decisionEvidence = { status: 'unavailable', taskId: 'task-1', truncated: false, records: [],
      attribution: 'controller-declared', goalVerification: 'not-established' };
    render(<ChatPage {...input}/>);
    expect(screen.getByText(/evidence is not yet available|No decision evidence is available/)).toBeInTheDocument();
    expect(screen.queryByText(/Declared finding/)).not.toBeInTheDocument();
  });
  it.each(['running','resumable'] as const)('locks the Anthropic model picker during %s turns', status => {
    const input=props(status);
    input.agentChat.providerChoice='anthropic';
    input.agentChat.modelChoice='fixture-other';
    input.agentChat.providers=[{id:'anthropic',model:'fixture-default',configured:true,available:true,
      models:[{id:'fixture-default'},{id:'fixture-other'}]}];
    input.onChatProvider=vi.fn();
    input.onChatModel=vi.fn();
    render(<ChatPage {...input}/>);
    expect(screen.getByLabelText('Provider dan model')).toBeDisabled();
    expect(screen.getByLabelText('Provider dan model')).toHaveValue('anthropic:fixture-other');
    expect(screen.queryByLabelText('Anthropic model')).not.toBeInTheDocument();
  });

  it('offers only confirmed effort levels, supports keyboard navigation and returns focus', () => {
    const input=props();
    input.agentChat.providerChoice='anthropic';
    input.agentChat.reasoningChoice='auto';
    input.agentChat.providers=[{id:'anthropic',model:'fixture',configured:true,available:true,reasoningEfforts:['low','high']}];
    input.onChatReasoning=vi.fn();
    const view=render(<ChatPage {...input}/>);
    const trigger=screen.getByRole('button',{name:'Reasoning: Auto'});
    fireEvent.keyDown(trigger,{key:'ArrowDown'});
    expect(screen.getAllByRole('menuitemradio').map(item=>item.textContent)).toEqual(['Auto','Low','High']);
    expect(screen.getByRole('menuitemradio',{name:'Auto'})).toHaveFocus();
    fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'});
    expect(screen.getByRole('menuitemradio',{name:'Low'})).toHaveFocus();
    fireEvent.keyDown(document.activeElement!,{key:'End'});
    expect(screen.getByRole('menuitemradio',{name:'High'})).toHaveFocus();
    fireEvent.click(document.activeElement!);
    expect(input.onChatReasoning).toHaveBeenCalledWith('high');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'),{key:'Escape'});
    expect(trigger).toHaveFocus();
    input.agentChat.active!.turns[0]!.status='resumable';
    view.rerender(<ChatPage {...input}/>);
    expect(trigger).toBeDisabled();
    input.agentChat.active!.turns[0]!.status='running';
    view.rerender(<ChatPage {...input}/>);
    expect(trigger).toBeDisabled();
    input.agentChat.active!.turns[0]!.status='finalized';
    input.agentChat.providerChoice='auto';
    view.rerender(<ChatPage {...input}/>);
    expect(trigger).toBeDisabled();
  });
  it('shows a saved response without declaring task verification success', () => {
    render(<ChatPage {...props()}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Response saved');
    expect(screen.queryByText('Task verified')).not.toBeInTheDocument();
  });

  it('keeps uncertain recovery visible and offers the existing cancellation action', () => {
    const input = props('resumable');
    input.agentChat.active!.turns[0]!.errorCode = 'AGENT_CHAT_RESUME_SIDE_EFFECT_RESULT_UNAVAILABLE';
    render(<ChatPage {...input}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Paused — Continue required');
    expect(screen.getByRole('status')).toHaveTextContent('AGENT_CHAT_RESUME_SIDE_EFFECT_RESULT_UNAVAILABLE');
    expect(screen.getByRole('textbox', { name: 'Message Agent Core' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop recovery' }));
    expect(input.onChatCancel).toHaveBeenCalledWith('turn-1');
    expect(input.onChatSend).not.toHaveBeenCalled();
  });

  it('uses a readable progress label and preserves the tool failure distinction', () => {
    const input = props('running');
    input.agentChat.lastEvent = { type: 'tool.completed', at: new Date().toISOString(),
      conversationId: 'chat-1', turnId: 'turn-1', success: false, toolName: 'read_file' };
    render(<ChatPage {...input}/>);
    expect(screen.getByText('Tool failed · read_file')).toBeInTheDocument();
    expect(screen.queryByText('tool.completed')).not.toBeInTheDocument();
  });

  it('shows provider waiting separately while preserving the stop action', () => {
    const input = props('resumable');
    input.agentChat.active!.turns[0]!.errorCode = 'AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT';
    render(<ChatPage {...input}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for an eligible provider');
    expect(screen.queryByText('Paused — Continue required')).not.toBeInTheDocument();
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
