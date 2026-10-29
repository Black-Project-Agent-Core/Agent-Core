import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './components';
import { GoalsPage, MemoryPage, ModelsPage } from './LauncherPages';
import { LauncherInspector } from './LauncherInspector';
import { PrototypeTools, PrototypeActivity, PrototypeSetup } from './PrototypePages';
import { LearningPage } from './LauncherPages';
import type { AgentChatUiState } from './host';

const chat: AgentChatUiState = {
  conversations: [], modelChoice: '', providers: [{ id: 'anthropic', model: 'claude-sonnet-5-5', configured: true, available: true,
    models: [{ id: 'claude-opus-5-5', reasoningEfforts: ['low', 'max'] }] }],
  active: { conversation: { id: 'c1', runtimeSessionId: 's1', workspace: 'agent-core', title: 'Current task', status: 'active', createdAtMs: 1, updatedAtMs: 1 },
    messages: [{ id: 'm1', conversationId: 'c1', turnId: 't1', role: 'user', content: 'Verify the migration', createdAtMs: 1 }],
    turns: [{ id: 't1', conversationId: 'c1', clientRequestId: 'r1', runtimeTaskId: 'task-1', status: 'finalized', createdAtMs: 1, startedAtMs: 1,
      memoryUse: [{ memoryId: 'memory-1', title: '<script>not executable</script>', applicability: 'applied', evidenceRefs: [], verification: 'unavailable' }] }] },
};
const props = { agentChat: chat, setPage: vi.fn(), onAction: vi.fn() };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

it('navigates the grouped launcher and keeps the original icon and real new-chat callback', () => {
  const onNewChat = vi.fn();
  render(<AppShell page="chat" setPage={props.setPage} onAction={props.onAction} onNewChat={onNewChat}><h1>Workspace fixture</h1></AppShell>);
  expect(screen.getByRole('img', { name: 'Agent Core' })).toHaveAttribute('src', './agent-core.png');
  const nav = screen.getByRole('navigation', { name: 'Agent Core pages' });
  for (const name of ['Goals & Plans', 'Artifacts', 'Tools Hub & MCP', 'AI Models', 'Memory Explorer', 'Dreaming Review']) {
    expect(within(nav).getByRole('button', { name })).toBeEnabled();
  }
  fireEvent.click(within(nav).getByRole('button', { name: 'AI Models' }));
  expect(props.setPage).toHaveBeenCalledWith('models');
  fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
  expect(onNewChat).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Start Core' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');
  expect(localStorage.getItem('agentcore.launcher.sidebarCollapsed')).toBe('true');
});

it('uses actual provider/model callbacks and returns to the existing workspace', () => {
  const onChatProvider = vi.fn(), onChatModel = vi.fn();
  render(<ModelsPage {...props} onChatProvider={onChatProvider} onChatModel={onChatModel}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Use' }));
  expect(onChatProvider).toHaveBeenCalledWith('anthropic');
  expect(onChatModel).toHaveBeenCalledWith('claude-opus-5-5');
  expect(props.setPage).toHaveBeenCalledWith('chat');
});

it('does not change the model while a turn is running or recovering', () => {
  const running = { ...chat, runningRequestId: 'active-request' };
  render(<ModelsPage {...props} agentChat={running} onChatProvider={vi.fn()} onChatModel={vi.fn()}/>);
  expect(screen.getByRole('button', { name: 'Use' })).toBeDisabled();
});

it('shows scoped recorded Memory use as escaped text and keeps unknown outcomes', () => {
  const view = render(<MemoryPage {...props}/>);
  expect(screen.getByText('<script>not executable</script>')).toBeInTheDocument();
  expect(view.container.querySelector('script')).toBeNull();
  expect(screen.getByText('applied · Outcome unavailable')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search conversation memory' }), { target: { value: 'missing' } });
  expect(screen.getByText('No matching records')).toBeInTheDocument();
});

it('rejects decision evidence bound to another task', () => {
  const foreign = { ...chat, active: { ...chat.active!, decisionEvidence: { status: 'available' as const, taskId: 'another-task', records: [{ id: 'd1', question: 'Foreign question', assumptions: [], alternatives: [], summary: 'Foreign evidence', evidenceRefs: [] }], truncated: false, attribution: 'controller-declared' as const, goalVerification: 'not-established' as const } } };
  render(<GoalsPage {...props} agentChat={foreign}/>);
  expect(screen.getByText('Verify the migration')).toBeInTheDocument();
  expect(screen.queryByText('Foreign question')).toBeNull();
  expect(screen.getByText('No decision evidence is available for this task.')).toBeInTheDocument();
});

it('opens Goals from a new draft without crashing and lets the user return to chat', () => {
  render(<GoalsPage {...props} agentChat={{ ...chat, active: undefined }}/>);
  expect(screen.getByRole('heading', { name: 'No task selected' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Open AI Workspace' }));
  expect(props.setPage).toHaveBeenCalledWith('chat');
});

it('does not invent a context budget or attribute global desktop activity to the chat', () => {
  const view = render(<LauncherInspector chat={chat} logs={[{ id: 'log1', time: '12:00', module: 'MCP', level: 'success', message: 'Observed', tool: 'read_file', status: 'success' }]} open onToggle={vi.fn()}/>);
  expect(view.container).not.toHaveTextContent('18,450');
  expect(view.container).toHaveTextContent('association with this chat is not established');
  expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
  expect(view.container).toHaveTextContent('Duration unavailable');
});

it('keeps prototype upgrade controls visible without dispatching fake backend work', () => {
  render(<LearningPage {...props}/>);
  expect(screen.getByRole('button', { name: 'Run Dreaming Now' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Run Dreaming Now' }));
  expect(props.onAction).not.toHaveBeenCalled();
  expect(screen.getByText(/does not mean the review queue is empty/)).toBeInTheDocument();
});

it('keeps Workflows reachable through the prototype Tools Hub and distinguishes unconnected discovery', () => {
  render(<PrototypeTools {...props} logs={[]}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Browse Workflows & Skills →' }));
  expect(props.setPage).toHaveBeenCalledWith('workflows');
  fireEvent.click(screen.getByRole('button', { name: 'Discover' }));
  expect(screen.getByText(/Connector discovery and installation are planned upgrades/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add / Connect MCP' })).toBeDisabled();
});

it('uses the prototype activity timeline without turning an incomplete lifecycle into success', () => {
  render(<PrototypeActivity {...props} logs={[{id:'incomplete',time:'12:00',module:'MCP',level:'warn',message:'Uncertain write',tool:'edit_file',status:'unknown',lifecycle:'incomplete'}]}/>);
  expect(screen.getByText('Lifecycle incomplete · start unavailable')).toBeInTheDocument();
  expect(screen.getByText('Duration unavailable')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', {name:'Search activity records'}),{target:{value:'missing'}});
  expect(screen.getByText('No matching activity in this desktop session.')).toBeInTheDocument();
});

it('reviews setup without writing configuration or inventing a successful first task', () => {
  render(<PrototypeSetup {...props} logs={[]}/>);
  for(let i=0;i<3;i++)fireEvent.click(screen.getByRole('button',{name:'Continue'}));
  expect(props.onAction).not.toHaveBeenCalled();
  expect(screen.getByText('Setup review complete. Core status: Unavailable.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Open AI Workspace'}));
  expect(props.setPage).toHaveBeenCalledWith('chat');
});
