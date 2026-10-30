import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LauncherInspector } from './LauncherInspector';
import type { AgentChatUiState, DesktopSnapshot, AgentChatStepMeta } from './host';

vi.mock('./host', async importOriginal => ({ ...(await importOriginal<typeof import('./host')>()), postHost: vi.fn() }));

const step = (over: Partial<AgentChatStepMeta> = {}): AgentChatStepMeta => ({
  turnId: 't1', seq: 1, toolName: 'start_search', status: 'ok', startedAtMs: 10, durationMs: 1234,
  argsSummary: 'pattern="x"', ...over });

function chatWith(turn: Record<string, unknown>, steps?: AgentChatStepMeta[]): AgentChatUiState {
  return {
    conversations: [], modelChoice: '', providers: [],
    active: { conversation: { id: 'c1', runtimeSessionId: 's1', workspace: 'agent-core', title: 'Task', status: 'active', createdAtMs: 1, updatedAtMs: 1 },
      messages: [], turns: [{ id: 't1', conversationId: 'c1', clientRequestId: 'r1', runtimeTaskId: 'task-1', status: 'running', createdAtMs: 1, startedAtMs: 1, model: 'claude-opus-5-5', ...turn }],
      steps } } as unknown as AgentChatUiState;
}

function snapshotWith(health?: Partial<DesktopSnapshot['health']>, paths?: Partial<DesktopSnapshot['paths']>, core?: Partial<DesktopSnapshot['core']>, version = '1.6.0'): DesktopSnapshot {
  return {
    status: { overall: 'online', connection: 'on', memory: 'available', tunnel: 'off', execution: 'available', gameMode: 'off', autostart: false, root: paths?.root ?? 'C:\\agent-core' },
    capturedAt: new Date().toISOString(),
    version,
    core: { port: 3456, httpHealthy: true, ...core },
    tunnel: { port: 3457, ready: true },
    paths: { root: 'C:\\agent-core', memory: 'C:\\agent-core\\runtime\\memory', runtimeCache: 'C:\\agent-core\\runtime\\cache', logs: 'C:\\agent-core\\runtime\\logs', ...paths },
    health: (health ?? { memory: { status: 'available', canonicalStore: 'file', noteCount: 1, issueCount: 0 }, execution: { status: 'available' } }) as DesktopSnapshot['health'],
  } as DesktopSnapshot;
}

const renderInspector = (chat: AgentChatUiState, snapshot?: DesktopSnapshot) =>
  render(<LauncherInspector chat={chat} snapshot={snapshot} logs={[]} open onToggle={vi.fn()}/>);

// The Tool Calls card lists the same steps, so every assertion about one card stays inside its <details>.
const card = (title: string | RegExp) => within(screen.getByText(title).closest('details') as HTMLElement);

describe('Inspector Background tasks card', () => {
  it('shows two running steps and "1 finished"', () => {
    const chat = chatWith({}, [
      step({ seq: 1, toolName: 'read_file', status: 'running', argsSummary: 'path="a.ts"', durationMs: 500 }),
      step({ seq: 2, toolName: 'start_search', status: 'running', argsSummary: 'pattern="x"', durationMs: 1000 }),
      step({ seq: 3, toolName: 'edit_block', status: 'ok', argsSummary: 'file="b.ts"', durationMs: 200 }),
    ]);
    renderInspector(chat);
    const background = card('Background tasks (2 running)');
    expect(background.getByText('read_file')).toBeInTheDocument();
    expect(background.getByText('start_search')).toBeInTheDocument();
    expect(background.getByText(/500 ms/)).toBeInTheDocument();
    expect(background.getByText(/1,0 s/)).toBeInTheDocument();
    expect(background.queryByText('edit_block')).toBeNull();
    expect(background.getByText('1 finished')).toBeInTheDocument();
  });

  it('shows "Tidak ada tugas berjalan" when no running steps', () => {
    const chat = chatWith({}, [step({ seq: 1, status: 'ok' }), step({ seq: 2, status: 'error' })]);
    renderInspector(chat);
    expect(screen.getByText('Background tasks (0 running)')).toBeInTheDocument();
    expect(screen.getByText('Tidak ada tugas berjalan')).toBeInTheDocument();
    expect(screen.getByText('2 finished')).toBeInTheDocument();
  });
});

describe('Inspector Connectors card', () => {
  it('shows Memory and Skills with correct dots and "Subsistem Agent Core"', () => {
    const snap = snapshotWith({
      memory: { status: 'available', canonicalStore: 'file', noteCount: 1, issueCount: 0 },
      skills: { status: 'degraded', skillCount: 5, mode: 'catalog', executionAuthority: false, discoveryMode: 'catalog', instructionRead: true },
      codeIntelligence: { status: 'error', issueCount: 1, issue: 'daemon down', isolationOk: false, provider: 'local' },
      phone: { status: 'unavailable', mode: 'off', deviceOnline: false },
      webResearch: { status: 'ok', searchConfigured: true, readerConfigured: true },
      execution: { status: 'available', mode: 'native' },
    });
    const chat = chatWith({});
    renderInspector(chat, snap);
    expect(screen.getByText('Subsistem Agent Core')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Code Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Web research')).toBeInTheDocument();
    expect(screen.getByText('Execution')).toBeInTheDocument();
    expect(screen.getAllByText('available')[0]!.closest('li')).toContainHTML('inspector-dot ok');
    expect(screen.getByText('degraded').closest('li')).toContainHTML('inspector-dot warn');
    expect(screen.getByText('error').closest('li')).toContainHTML('inspector-dot bad');
    expect(screen.getByText('unavailable').closest('li')).toContainHTML('inspector-dot bad');
    expect(screen.getByText('ok').closest('li')).toContainHTML('inspector-dot ok');
  });
});

describe('Inspector Environment card', () => {
  it('shows workspace, root, port and version', () => {
    const snap = snapshotWith(undefined, { root: 'E:\\Projects\\Agent-Core' }, { port: 3456, httpHealthy: true });
    const chat = chatWith({});
    renderInspector(chat, snap);
    const env = card('Environment');
    expect(env.getByText('Workspace')).toBeInTheDocument();
    expect(env.getByText('agent-core')).toBeInTheDocument();
    expect(env.getByText('E:\\Projects\\Agent-Core')).toBeInTheDocument();
    expect(env.getByText('3456 · healthy')).toBeInTheDocument();
    expect(env.getByText('1.6.0')).toBeInTheDocument();
  });

  it('shows "Waiting for the desktop host" when snapshot missing', () => {
    const chat = chatWith({});
    renderInspector(chat);
    const env = card('Environment');
    expect(env.getByText('Waiting for the desktop host')).toBeInTheDocument();
    expect(env.getAllByText('—')).toHaveLength(2);
  });
});