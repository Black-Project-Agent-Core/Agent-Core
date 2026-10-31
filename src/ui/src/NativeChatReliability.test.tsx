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
  it('uses each turn identity metadata for the assistant label and avatar with the built-in fallback', () => {
    const input = props();
    (input.agentChat.active!.turns[0] as any).agentProfile = { identity: { name: 'Atlas', emoji: '🦉', role: 'Asisten lokal' } };
    input.agentChat.active!.messages.push({ id: 'assistant-1', conversationId: 'chat-1', turnId: 'turn-1', role: 'assistant', content: 'Halo.', createdAtMs: 2 });
    const view = render(<ChatPage {...input}/>);
    expect(screen.getByLabelText('Atlas')).toHaveTextContent('🦉');
    expect(screen.getByText('Atlas · Asisten lokal')).toBeInTheDocument();
    delete (input.agentChat.active!.turns[0] as any).agentProfile;
    view.rerender(<ChatPage {...input}/>);
    expect(screen.getByLabelText('Agent Core')).toBeInTheDocument();
  });
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
    const input = props();
    input.agentChat.active!.messages = [{ id: 'answer-1', conversationId: 'chat-1', turnId: 'turn-1', role: 'assistant', content: 'Observed result', createdAtMs: 2 }];
    input.agentChat.active!.steps = [{ turnId: 'turn-1', seq: 1, toolName: 'read_file', status: 'ok', startedAtMs: 0 }];
    render(<ChatPage {...input}/>);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
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
    expect(screen.getByText('read_file failed')).toBeInTheDocument();
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

describe('Native chat composer "/" menu and /compact', () => {
  const commands = [
    { name: 'compact', kind: 'command' as const, description: 'Padatkan konteks giliran yang berjalan' },
    { name: 'code-review', kind: 'skill' as const, description: 'Tinjau kode' },
    { name: 'mind-control', kind: 'skill' as const, description: 'Gerbang penalaran' },
  ];
  const slashProps = (status: AgentChatTurn['status'] = 'finalized') => {
    const input = props(status);
    input.agentChat.slashCommands = commands;
    input.onChatCompact = vi.fn();
    input.onSlashCommands = vi.fn();
    return input;
  };
  const textarea = () => screen.getByRole('textbox', { name: 'Message Agent Core' });
  const optionNames = () => screen.getAllByRole('option').map(option => option.querySelector('b')!.textContent);

  it('typing "/" requests the list and shows the menu with compact first', () => {
    const input = slashProps();
    render(<ChatPage {...input}/>);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.change(textarea(), { target: { value: '/' } });
    expect(input.onSlashCommands).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('listbox', { name: 'Perintah dan skill' })).toBeInTheDocument();
    expect(optionNames()).toEqual(['/compact', '/code-review', '/mind-control']);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    expect(textarea()).toHaveAttribute('aria-activedescendant', 'slash-option-compact');
    fireEvent.change(textarea(), { target: { value: '/co' } });
    // startsWith matches first, then the includes match ("mind-control" contains "co").
    expect(optionNames()).toEqual(['/compact', '/code-review', '/mind-control']);
    expect(input.onSlashCommands).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown then Enter inserts "/<skill> " and closes the menu', () => {
    const input = slashProps();
    render(<ChatPage {...input}/>);
    fireEvent.change(textarea(), { target: { value: '/' } });
    fireEvent.keyDown(textarea(), { key: 'ArrowDown' });
    expect(textarea()).toHaveAttribute('aria-activedescendant', 'slash-option-code-review');
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(textarea()).toHaveValue('/code-review ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input.onChatSend).not.toHaveBeenCalled();
  });

  it('Escape closes the menu and typing again reopens and re-requests it', () => {
    const input = slashProps();
    render(<ChatPage {...input}/>);
    fireEvent.change(textarea(), { target: { value: '/' } });
    fireEvent.keyDown(textarea(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(textarea()).toHaveValue('/');
    fireEvent.change(textarea(), { target: { value: '/mi' } });
    expect(optionNames()).toEqual(['/mind-control']);
    expect(input.onSlashCommands).toHaveBeenCalledTimes(2);
  });

  it('keeps the textarea enabled while a turn runs but refuses a normal message', () => {
    const input = slashProps('running');
    render(<ChatPage {...input}/>);
    expect(textarea()).toBeEnabled();
    expect(textarea()).toHaveAttribute('placeholder', 'Giliran berjalan. Ketik /compact untuk memadatkan konteks.');
    fireEvent.change(textarea(), { target: { value: 'hello' } });
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(input.onChatSend).not.toHaveBeenCalled();
    expect(input.onChatCompact).not.toHaveBeenCalled();
    expect(textarea()).toHaveValue('hello');
    expect(screen.getByText('Giliran sedang berjalan; hanya /compact yang bisa dikirim sekarang')).toBeInTheDocument();
  });

  it('"/compact" while running posts the compact request for the running turn and shows its answer', () => {
    const input = slashProps('running');
    const view = render(<ChatPage {...input}/>);
    fireEvent.change(textarea(), { target: { value: '/' } });
    expect(optionNames()).toEqual(['/compact']);
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(textarea()).toHaveValue('/compact');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(input.onChatCompact).toHaveBeenCalledWith('turn-1');
    expect(input.onChatSend).not.toHaveBeenCalled();
    expect(textarea()).toHaveValue('');
    input.agentChat.compactResult = { turnId: 'turn-1', status: 'scheduled' };
    view.rerender(<ChatPage {...input}/>);
    expect(screen.getByText('Kompaksi dijadwalkan')).toBeInTheDocument();
    input.agentChat.compactResult = { turnId: 'turn-1', status: 'unavailable' };
    view.rerender(<ChatPage {...input}/>);
    expect(screen.getByText('Gagal menjadwalkan')).toBeInTheDocument();
  });

  it('"/compact" while idle sends no chat message and reports that no turn is running', () => {
    const input = slashProps();
    render(<ChatPage {...input}/>);
    fireEvent.change(textarea(), { target: { value: '/compact' } });
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(input.onChatSend).not.toHaveBeenCalled();
    expect(input.onChatCompact).not.toHaveBeenCalled();
    expect(textarea()).toHaveValue('');
    expect(screen.getByText('Tidak ada giliran berjalan')).toBeInTheDocument();
  });
});
