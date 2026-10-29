import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './pages';
import { AgentStepRow } from './AgentSteps';
import { LauncherInspector } from './LauncherInspector';
import { reduceStepDetail, stepKey } from './host';
import type { AgentChatStepMeta, AgentChatUiState, DesktopSnapshot, StepDetailState } from './host';

const meta = (over: Partial<AgentChatStepMeta> = {}): AgentChatStepMeta => ({
  turnId: 'turn-1', seq: 1, iteration: 1, toolName: 'start_search', status: 'ok', startedAtMs: 10,
  durationMs: 1234, argsSummary: 'pattern="x"', resultSummary: '8 matches', ...over });
const result = { inputText: '{"pattern":"x"}', outputText: 'a.ts:1 x', inputTruncated: false, outputTruncated: false };

describe('reduceStepDetail', () => {
  it('moves loading -> ready, never re-requests loading/ready, and lets an error retry', () => {
    const key = stepKey('turn-1', 1);
    const loading = reduceStepDetail(undefined, { type: 'loading', turnId: 'turn-1', seq: 1 });
    expect(loading[key]).toEqual({ status: 'loading' });
    expect(reduceStepDetail(loading, { type: 'loading', turnId: 'turn-1', seq: 1 })).toBe(loading);
    const ready = reduceStepDetail(loading, { type: 'ready', turnId: 'turn-1', seq: 1, result });
    expect(ready[key]).toEqual({ status: 'ready', ...result });
    expect(reduceStepDetail(ready, { type: 'loading', turnId: 'turn-1', seq: 1 })).toBe(ready);
    const failed = reduceStepDetail(loading, { type: 'error', turnId: 'turn-1', seq: 1, error: 'not found' });
    expect(failed[key]).toEqual({ status: 'error', error: 'not found' });
    expect(reduceStepDetail(failed, { type: 'loading', turnId: 'turn-1', seq: 1 })[key]).toEqual({ status: 'loading' });
  });
});

describe('AgentStepRow', () => {
  it('shows a human title, status, duration and a one-line argument summary', () => {
    const view = render(<AgentStepRow step={meta()} onOpen={vi.fn()}/>);
    expect(screen.getByText('Used start_search')).toBeInTheDocument();
    expect(view.container).toHaveTextContent('✓');
    expect(screen.getByText('1,2 s')).toBeInTheDocument();
    expect(screen.getByText('pattern="x"')).toBeInTheDocument();
    view.unmount();
    const running = render(<AgentStepRow step={meta({ status: 'running', durationMs: undefined })} onOpen={vi.fn()}/>);
    expect(screen.getByText('Using start_search')).toBeInTheDocument();
    running.unmount();
    const failed = render(<AgentStepRow step={meta({ status: 'error' })} onOpen={vi.fn()}/>);
    expect(failed.container).toHaveTextContent('✗');
  });

  it('requests the detail once on first open and shows exact Input and Output', () => {
    const onOpen = vi.fn();
    const step = meta();
    const view = render(<AgentStepRow step={step} onOpen={onOpen}/>);
    const toggle = screen.getByRole('button', { name: /Used start_search/ });
    expect(screen.queryByText('Input')).toBeNull();
    fireEvent.click(toggle);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('turn-1', 1);
    expect(screen.getByText('memuat...')).toBeInTheDocument();
    const ready: StepDetailState = { status: 'ready', ...result };
    view.rerender(<AgentStepRow step={step} detail={ready} onOpen={onOpen}/>);
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText('{"pattern":"x"}').tagName).toBe('PRE');
    expect(screen.getByText('a.ts:1 x').tagName).toBe('PRE');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('waits for a running step to finish before requesting its detail, so a half-written Output is never cached', () => {
    const onOpen = vi.fn();
    const view = render(<AgentStepRow step={meta({ status: 'running', durationMs: undefined })} onOpen={onOpen}/>);
    fireEvent.click(screen.getByRole('button', { name: /Using start_search/ }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByText('langkah masih berjalan...')).toBeInTheDocument();
    view.rerender(<AgentStepRow step={meta()} onOpen={onOpen}/>);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('turn-1', 1);
    expect(screen.queryByText('langkah masih berjalan...')).toBeNull();
  });

  it('copies the Input, flags truncation and shows an error message', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const step = meta();
    const view = render(<AgentStepRow step={step} detail={{ status: 'ready', ...result, inputTruncated: true, outputTruncated: true }} onOpen={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button', { name: /Used start_search/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy input' }));
    expect(writeText).toHaveBeenCalledWith('{"pattern":"x"}');
    expect(screen.getAllByText(/dipotong 16 KB/)).toHaveLength(2);
    view.rerender(<AgentStepRow step={step} detail={{ status: 'error', error: 'Step not found' }} onOpen={vi.fn()}/>);
    expect(screen.getByText('Step not found')).toBeInTheDocument();
    expect(screen.queryByText('Input')).toBeNull();
  });
});

function chatProps(steps?: AgentChatStepMeta[]): ComponentProps<typeof ChatPage> {
  const conversation = { id: 'chat-1', runtimeSessionId: 'session-1', workspace: 'fixture', title: 'Fixture',
    status: 'active' as const, createdAtMs: 1, updatedAtMs: 2 };
  return {
    snapshot: { health: { agentRuntime: { status: 'available', configuredProviderCount: 1, providerCount: 1 } } } as DesktopSnapshot,
    logs: [], onAction: vi.fn(), setPage: vi.fn(), agentRun: { status: 'idle' }, onAgentRun: vi.fn(),
    agentChat: { conversations: [conversation], modelChoice: '', active: { conversation, steps,
      turns: [{ id: 'turn-1', conversationId: 'chat-1', clientRequestId: 'request-1', runtimeTaskId: 'task-1',
        status: 'finalized', createdAtMs: 1, startedAtMs: 1 }], messages: [] } },
    onChatCreate: vi.fn(), onChatOpen: vi.fn(), onChatSend: vi.fn(), onChatCancel: vi.fn(), onChatArchive: vi.fn(),
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('ActivityList with stored steps', () => {
  it('lists persisted steps, opens one to request its detail, and keeps live notes without duplicate live tools', () => {
    const input = chatProps([meta(), meta({ seq: 2, toolName: 'read_file', status: 'error', argsSummary: 'path="a.ts"', durationMs: 30 })]);
    input.onStepDetail = vi.fn();
    input.agentChat.activity = [
      { id: 'n1', kind: 'note', toolName: '', status: 'done', text: 'Saya cek dulu.' },
      { id: 'a1', toolName: 'live_only_tool', status: 'done', durationMs: 5 },
    ];
    render(<ChatPage {...input}/>);
    const summary = screen.getByText('Activity · 2 steps');
    fireEvent.click(summary);
    expect(screen.getByText('Used start_search')).toBeVisible();
    expect(screen.getByText('Used read_file')).toBeVisible();
    expect(screen.getByText('Saya cek dulu.')).toBeVisible();
    expect(screen.queryByText('live_only_tool')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Used read_file/ }));
    expect(input.onStepDetail).toHaveBeenCalledTimes(1);
    expect(input.onStepDetail).toHaveBeenCalledWith('turn-1', 2);
  });

  it('passes the stored detail of the opened step to the row', () => {
    const input = chatProps([meta()]);
    input.onStepDetail = vi.fn();
    input.agentChat.stepDetails = { [stepKey('turn-1', 1)]: { status: 'ready', ...result } };
    render(<ChatPage {...input}/>);
    fireEvent.click(screen.getByText('Activity · 1 step'));
    fireEvent.click(screen.getByRole('button', { name: /Used start_search/ }));
    expect(screen.getByText('a.ts:1 x')).toBeInTheDocument();
  });
});

describe('Inspector Tool Calls card', () => {
  const chatWith = (steps?: AgentChatStepMeta[]): AgentChatUiState => ({ ...chatProps(steps).agentChat, modelChoice: '' });
  const renderInspector = (chat: AgentChatUiState) => render(<LauncherInspector chat={chat} logs={[]} open onToggle={vi.fn()}/>);

  it('shows count, name, status, duration and one-line argument preview of the latest turn', () => {
    const view = renderInspector(chatWith([meta(), meta({ seq: 2, toolName: 'read_file', status: 'error', durationMs: 30, argsSummary: 'path="a.ts"' }),
      meta({ turnId: 'old-turn', seq: 1, toolName: 'ignored_tool' })]));
    const summary = screen.getByText('Tool Calls (2)');
    const card = summary.closest('details')!;
    expect(within(card).getByText('start_search')).toBeInTheDocument();
    expect(within(card).getByText('pattern="x"')).toBeInTheDocument();
    expect(within(card).getByText('read_file')).toBeInTheDocument();
    expect(card).toHaveTextContent('✓');
    expect(card).toHaveTextContent('✗');
    expect(card).toHaveTextContent('30 ms');
    expect(card).not.toHaveTextContent('ignored_tool');
    expect(view.container).not.toHaveTextContent('Desktop tool activity');
  });

  it('says there are no tool calls and never shows unrelated desktop logs', () => {
    const logs = [{ id: 'l1', tool: 'desktop_tool', level: 'info', status: 'ok', durationMs: 4 }] as never;
    const view = render(<LauncherInspector chat={chatWith(undefined)} logs={logs} open onToggle={vi.fn()}/>);
    expect(screen.getByText('Tool Calls (0)')).toBeInTheDocument();
    expect(view.container).toHaveTextContent('Belum ada tool call di percakapan ini');
    expect(view.container).not.toHaveTextContent('desktop_tool');
  });
});
