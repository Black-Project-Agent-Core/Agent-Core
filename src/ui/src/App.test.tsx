import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { DesktopSnapshot } from './host';

let messageHandler: ((event: { data: any }) => void) | undefined;
const postMessage = vi.fn();

const onlineSnapshot: DesktopSnapshot = {
  status: {
    overall: 'online',
    connection: 'on',
    memory: 'available',
    tunnel: 'on',
    execution: 'available',
    gameMode: 'on',
    autostart: true,
    root: 'E:\\Projects\\Agent-Core',
  },
  capturedAt: '2026-09-24T20:00:00+07:00',
  version: '0.12.0',
  core: {
    pid: 15404,
    uptimeSeconds: 8040,
    workingSetBytes: 512 * 1024 * 1024,
    memoryCapacityBytes: 4 * 1024 * 1024 * 1024,
    cpuPercent: 12,
    port: 8765,
    httpHealthy: true,
  },
  tunnel: { port: 8787, ready: true },
  paths: {
    root: 'E:\\Projects\\Agent-Core',
    memory: 'E:\\Projects\\Agent-Core\\runtime\\memory',
    runtimeCache: 'E:\\Projects\\Agent-Core\\runtime\\cache',
    logs: 'E:\\Projects\\Agent-Core\\runtime\\tracker',
  },
  health: {
    memory: {
      status: 'available',
      canonicalStore: 'available',
      noteCount: 21,
      issueCount: 0,
      index: 'available',
      embedding: 'available',
      intelligence: 'available',
    },
    execution: { status: 'available', mode: 'rdc-direct' },
    phone: {
      status: 'available',
      mode: 'gateway',
      transport: 'gateway',
      deviceOnline: true,
      deviceId: 'nubia-z2465n-main',
    },
    codeIntelligence: {
      status: 'available',
      provider: 'grafel',
      index: 'current',
      daemon: 'available',
      issueCount: 0,
      isolationOk: true,
    },
    semanticIde: {
      status: 'available',
      issueCount: 0,
      configuredServers: [
        { id: 'typescript', observedVersion: '6.0.0', compatibility: 'compatible' },
        { id: 'csharp', observedVersion: '5.5.0', compatibility: 'compatible' },
        { id: 'powershell', observedVersion: '7.6.6', compatibility: 'compatible' },
        { id: 'python', observedVersion: '1.1.403', compatibility: 'compatible' },
      ],
    },
    learning: {
      status: 'available',
      issueCount: 0,
      sinkStatus: [
        { name: 'memory', available: true },
        { name: 'grafel-patterns', available: true },
      ],
    },
    agentRuntime: {
      status: 'not-configured',
      issueCount: 0,
      providerCount: 1,
      configuredProviderCount: 0,
      sessionCount: 0,
      runningSessionCount: 0,
      skillCount: 0,
      pendingFinalizationCount: 0,
    },
  },
};

beforeEach(() => {
  messageHandler = undefined;
  postMessage.mockReset();
  window.location.hash = '';
  (window as any).chrome = {
    webview: {
      addEventListener: (_name: string, handler: (event: { data: any }) => void) => { messageHandler = handler; },
      removeEventListener: vi.fn(),
      postMessage,
    },
  };
});

function pushSnapshot(snapshot: DesktopSnapshot = onlineSnapshot) {
  act(() => messageHandler!({ data: { type: 'snapshot', snapshot } }));
}

describe('Agent Core desktop UI host integration', () => {
  it('renders live snapshot truth in the reference dashboard shell', () => {
    render(<App />);
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
    expect(messageHandler).toBeTypeOf('function');

    pushSnapshot();

    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'System Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('PID 15404')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Code Intelligence Healthy/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agent Core AI Offline/ })).toBeInTheDocument();

    pushSnapshot({
      ...onlineSnapshot,
      status: { ...onlineSnapshot.status, overall: 'offline', connection: 'off', tunnel: 'off', execution: 'unavailable', gameMode: 'off' },
      core: { ...onlineSnapshot.core, httpHealthy: false, pid: undefined },
      tunnel: { ...onlineSnapshot.tunnel, ready: false },
    });

    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
    expect(screen.getByText('PID -')).toBeInTheDocument();
  });

  it('routes only owned lifecycle and launcher actions to the native host', () => {
    render(<App />);
    pushSnapshot();
    postMessage.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /^Restart$/ }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'restart-core' });

    fireEvent.click(screen.getByRole('button', { name: 'Open Agent Core Folder' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'open-folder' });

    fireEvent.click(screen.getByRole('button', { name: 'Open Tunnel UI' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'open-tunnel-admin' });

    fireEvent.click(screen.getByRole('button', { name: 'System Snapshot' }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'system-snapshot' });
  });

  it('navigates the reference pages and keeps unsupported destructive controls disabled', () => {
    render(<App />);
    pushSnapshot();

    fireEvent.click(screen.getByRole('button', { name: 'Activity Log' }));
    expect(screen.getByRole('heading', { name: 'Activity Log' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Factory Reset/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reset All Settings/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Clear Cache/ })).toBeDisabled();

    const startWithWindows = screen.getByText('Start with Windows').closest('.setting-toggle')?.querySelector('button');
    expect(startWithWindows).toHaveAttribute('aria-pressed', 'true');
    postMessage.mockClear();
    fireEvent.click(startWithWindows!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'toggle-autostart' });
  });

  it('opens persistent native chat, creates a conversation, and sends one turn', () => {
    render(<App />);
    pushSnapshot({
      ...onlineSnapshot,
      health: {
        ...onlineSnapshot.health,
        agentRuntime: {
          ...onlineSnapshot.health.agentRuntime!,
          status: 'available',
          issueCount: 0,
          providerCount: 1,
          configuredProviderCount: 1,
        },
        agentChat: {
          status: 'available',
          conversationCount: 0,
          activeConversationCount: 0,
          runningTurnCount: 0,
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
    expect(screen.getByRole('heading', { name: 'Agent Core AI' })).toBeInTheDocument();

    postMessage.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'New Chat' }).at(-1)!);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'agent-chat-create',
      workspace: 'agent-core',
    });

    const conversation = {
      id: 'conversation-1',
      runtimeSessionId: 'session-1',
      workspace: 'agent-core',
      title: 'New Chat',
      status: 'active' as const,
      createdAtMs: 1,
      updatedAtMs: 1,
    };
    act(() => messageHandler!({ data: {
      type: 'agent-chat-state',
      result: { conversation, turns: [], messages: [] },
    } }));

    const prompt = screen.getByPlaceholderText('Message Agent Core…');
    fireEvent.change(prompt, { target: { value: 'Inspect current runtime' } });
    postMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const sent = postMessage.mock.calls.find(([value]) => value?.type === 'agent-chat-send')?.[0];
    expect(sent).toEqual(expect.objectContaining({
      type: 'agent-chat-send',
      requestId: expect.any(String),
      clientRequestId: expect.any(String),
      conversationId: 'conversation-1',
      prompt: 'Inspect current runtime',
    }));

    act(() => messageHandler!({ data: {
      type: 'agent-chat-state',
      result: {
        conversation: { ...conversation, title: 'Inspect current runtime', updatedAtMs: 2 },
        turns: [{
          id: 'turn-1', conversationId: 'conversation-1',
          clientRequestId: sent.clientRequestId, runtimeTaskId: 'task-1',
          status: 'finalized', iterations: 2, retrievalCount: 1,
          createdAtMs: 1, startedAtMs: 1, completedAtMs: 2,
        }],
        messages: [
          { id: 'm1', conversationId: 'conversation-1', turnId: 'turn-1', role: 'user', content: 'Inspect current runtime', createdAtMs: 1 },
          { id: 'm2', conversationId: 'conversation-1', turnId: 'turn-1', role: 'assistant', content: 'Runtime verified.', createdAtMs: 2 },
        ],
      },
    } }));

    expect(screen.getByText('Runtime verified.')).toBeInTheDocument();
    expect(screen.getAllByText('Inspect current runtime').length).toBeGreaterThanOrEqual(2);
  });
});
