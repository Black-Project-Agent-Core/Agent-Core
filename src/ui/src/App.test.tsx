import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const chatReady: DesktopSnapshot = {
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
};

beforeEach(() => {
  messageHandler = undefined;
  postMessage.mockReset();
  window.location.hash = '';
  // WebView2 delivers each host message to every listener, so pages that subscribe
  // later (Dashboard proposal cards) must not replace the App listener in the mock.
  const handlers: Array<(event: { data: any }) => void> = [];
  (window as any).chrome = {
    webview: {
      addEventListener: (_name: string, handler: (event: { data: any }) => void) => {
        handlers.push(handler);
        messageHandler = event => [...handlers].forEach(item => item(event));
      },
      removeEventListener: (_name: string, handler: (event: { data: any }) => void) => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      },
      postMessage,
    },
  };
});

afterEach(()=>vi.useRealTimers());

function pushSnapshot(snapshot: DesktopSnapshot = onlineSnapshot) {
  act(() => messageHandler!({ data: { type: 'snapshot', snapshot } }));
}

describe('Agent Core desktop UI host integration', () => {
  it('opens on a new chat draft inside the compact icon rail', () => {
    render(<App />);
    pushSnapshot(chatReady);

    expect(screen.getByRole('heading', { name: 'Mau mengerjakan apa?' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Message Agent Core…')).toBeEnabled();
    expect(screen.queryByPlaceholderText(/Search systems/)).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    for (const name of ['New Chat', 'Dashboard', 'Core Runtime', 'Systems', 'Workflows', 'Activity Log', 'Diagnostics', 'Settings', 'Quick Actions']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
  });

  it('does not reopen the latest conversation by itself', () => {
    render(<App />);
    pushSnapshot(chatReady);
    const latest = { id: 'old-thread', runtimeSessionId: 's0', workspace: 'agent-core', title: 'Old thread',
      status: 'active' as const, createdAtMs: 1, updatedAtMs: 1 };
    postMessage.mockClear();
    act(() => messageHandler!({ data: { type: 'agent-chat-list-result', result: { conversations: [latest] } } }));

    expect(postMessage.mock.calls.some(([value]) => value?.type === 'agent-chat-open')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Mau mengerjakan apa?' })).toBeInTheDocument();
    expect(screen.queryByText('Old thread')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
    fireEvent.click(screen.getByText('Old thread'));
    expect(postMessage).toHaveBeenCalledWith({ type: 'agent-chat-open', conversationId: 'old-thread' });
  });

  it('creates the conversation on the first send from the draft, then sends the turn', () => {
    render(<App />);
    pushSnapshot(chatReady);

    fireEvent.change(screen.getByPlaceholderText('Message Agent Core…'), { target: { value: 'Cek runtime' } });
    postMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(postMessage).toHaveBeenCalledWith({ type: 'agent-chat-create', workspace: 'agent-core' });
    expect(postMessage.mock.calls.some(([value]) => value?.type === 'agent-chat-send')).toBe(false);

    const conversation = { id: 'draft-1', runtimeSessionId: 's-draft', workspace: 'agent-core', title: 'New Chat',
      status: 'active' as const, createdAtMs: 1, updatedAtMs: 1 };
    postMessage.mockClear();
    act(() => messageHandler!({ data: { type: 'agent-chat-state', result: { conversation, turns: [], messages: [] } } }));

    const sent = postMessage.mock.calls.find(([value]) => value?.type === 'agent-chat-send')?.[0];
    expect(sent).toEqual(expect.objectContaining({ conversationId: 'draft-1', prompt: 'Cek runtime' }));
  });

  it('gives the typed prompt back when creating the conversation fails', () => {
    render(<App />);
    pushSnapshot(chatReady);

    fireEvent.change(screen.getByPlaceholderText('Message Agent Core…'), { target: { value: 'Jangan hilang' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    act(() => messageHandler!({ data: { type: 'agent-chat-error', error: 'create failed' } }));

    expect(screen.getByPlaceholderText('Message Agent Core…')).toHaveValue('Jangan hilang');
    expect(postMessage.mock.calls.some(([value]) => value?.type === 'agent-chat-send')).toBe(false);
  });

  it('returns to a fresh draft from the rail New Chat button', () => {
    render(<App />);
    pushSnapshot(chatReady);
    const conversation = { id: 'thread-a', runtimeSessionId: 's-a', workspace: 'agent-core', title: 'Thread A',
      status: 'active' as const, createdAtMs: 1, updatedAtMs: 1 };
    act(() => messageHandler!({ data: { type: 'agent-chat-state', result: { conversation, turns: [], messages: [] } } }));
    expect(screen.getByRole('heading', { name: 'Thread A' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
    expect(screen.getByRole('heading', { name: 'Mau mengerjakan apa?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Thread A' })).not.toBeInTheDocument();
  });

  it('renders live snapshot truth in the reference dashboard shell', () => {
    render(<App />);
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
    expect(messageHandler).toBeTypeOf('function');

    pushSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'System Dashboard' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quick Actions' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    postMessage.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /^Restart$/ }));
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'restart-core' });

    const quickAction = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Quick Actions' }));
      fireEvent.click(screen.getByRole('button', { name }));
    };

    quickAction('Open Agent Core Folder');
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'open-folder' });

    quickAction('Open Tunnel UI');
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'open-tunnel-admin' });

    quickAction('System Snapshot');
    expect(postMessage).toHaveBeenCalledWith({ type: 'action', action: 'system-snapshot' });
    expect(screen.queryByRole('button', { name: 'System Snapshot' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Mau mengerjakan apa?' })).toBeInTheDocument();

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

  it('lets the owner choose a provider and model per message, with automatic rotation as the default', () => {
    try { window.localStorage.removeItem('agentcore.chat.provider'); } catch { /* storage is optional */ }
    render(<App />);
    pushSnapshot({
      ...onlineSnapshot,
      health: { ...onlineSnapshot.health,
        agentRuntime: { ...onlineSnapshot.health.agentRuntime!, status: 'available', issueCount: 0, providerCount: 2, configuredProviderCount: 2 },
        agentChat: { status: 'available', conversationCount: 0, activeConversationCount: 0, runningTurnCount: 0 } },
    });
    expect(postMessage).toHaveBeenCalledWith({ type: 'agent-chat-providers' });
    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
    const conversation = { id: 'conversation-2', runtimeSessionId: 'session-2', workspace: 'agent-core', title: 'New Chat',
      status: 'active' as const, createdAtMs: 1, updatedAtMs: 1 };
    act(() => messageHandler!({ data: { type: 'agent-chat-state', result: { conversation, turns: [], messages: [] } } }));
    act(() => messageHandler!({ data: { type: 'agent-chat-providers-result', result: { providers: [
      { id: 'atria', model: 'Atria-Dawn', configured: true, available: true },
      { id: 'gonka', model: 'DeepSeek-V4-Flash', configured: true, available: false, retryAt: '2026-10-25T09:00:00.000Z' },
      { id: 'half', model: null, configured: false, available: false, issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE' },
    ] } } }));

    const picker = screen.getByLabelText('Provider dan model') as HTMLSelectElement;
    expect(picker.value).toBe('auto');
    expect([...picker.options].map(option => option.textContent)).toEqual([
      'Auto (rotasi otomatis)', 'atria · Atria-Dawn', 'gonka · DeepSeek-V4-Flash (cooldown)', 'half (belum dikonfigurasi)']);
    expect(picker.options[3]!.disabled).toBe(true);

    const prompt = screen.getByPlaceholderText('Message Agent Core…');
    fireEvent.change(prompt, { target: { value: 'halo' } });
    postMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(postMessage.mock.calls.find(([value]) => value?.type === 'agent-chat-send')![0]).not.toHaveProperty('providerId');
    // The host answers with the saved conversation, which ends the running state.
    act(() => messageHandler!({ data: { type: 'agent-chat-state', result: { conversation: { ...conversation, updatedAtMs: 2 }, turns: [], messages: [] } } }));

    fireEvent.change(picker, { target: { value: 'atria' } });
    fireEvent.change(prompt, { target: { value: 'halo lagi' } });
    postMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(postMessage.mock.calls.find(([value]) => value?.type === 'agent-chat-send')![0]).toMatchObject({ providerId: 'atria' });
  });
});

describe('Native Chat UI refresh',()=>{
  it('keeps the selected conversation while listing remote threads',()=>{
    vi.useFakeTimers();
    render(<App/>);
    pushSnapshot({
      ...onlineSnapshot,
      health:{
        ...onlineSnapshot.health,
        agentRuntime:{...onlineSnapshot.health.agentRuntime!,status:'available',configuredProviderCount:1},
        agentChat:{status:'available',conversationCount:1,activeConversationCount:1,runningTurnCount:0},
      },
    });
    fireEvent.click(screen.getByRole('button',{name:'New Chat'}));
    const current={
      id:'current-thread',runtimeSessionId:'s1',workspace:'agent-core',
      title:'New Chat',status:'active' as const,createdAtMs:1,updatedAtMs:1,
    };
    act(()=>messageHandler!({data:{type:'agent-chat-list-result',result:{conversations:[current]}}}));
    act(()=>messageHandler!({data:{type:'agent-chat-state',
      result:{conversation:current,turns:[],messages:[]}}}));
    fireEvent.change(screen.getByPlaceholderText('Message Agent Core…'),{
      target:{value:'Draft must stay'},});
    postMessage.mockClear();
    act(()=>vi.advanceTimersByTime(4100));
    expect(postMessage).toHaveBeenCalledWith({type:'agent-chat-list'});
    const external={...current,id:'external-thread',runtimeSessionId:'s2',
      title:'External Bridge Verification 2026-10-23',createdAtMs:2,updatedAtMs:2};
    act(()=>messageHandler!({data:{type:'agent-chat-list-result',
      result:{conversations:[external,current]}}}));
    fireEvent.click(screen.getByRole('button',{name:'Chat history'}));
    expect(screen.getByText('External Bridge Verification 2026-10-23')).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'New Chat'})).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Message Agent Core…')).toHaveValue('Draft must stay');
    fireEvent.click(screen.getByText('External Bridge Verification 2026-10-23'));
    expect(postMessage).toHaveBeenCalledWith({type:'agent-chat-open',conversationId:'external-thread'});
    act(()=>messageHandler!({data:{type:'agent-chat-state',result:{
      conversation:external,turns:[],messages:[{id:'remote-user',conversationId:'external-thread',
        turnId:'remote-turn',role:'user',content:'HALO NATIVE AGENT! external message',createdAtMs:2}],
    }}}));
    expect(screen.getByText('HALO NATIVE AGENT! external message')).toBeInTheDocument();
    postMessage.mockClear();
    act(()=>vi.advanceTimersByTime(4100));
    act(()=>messageHandler!({data:{type:'agent-chat-list-result',result:{
      conversations:[{...external,updatedAtMs:3},current],
    }}}));
    expect(postMessage).toHaveBeenCalledWith({type:'agent-chat-open',conversationId:'external-thread'});
    act(()=>messageHandler!({data:{type:'agent-chat-state',result:{
      conversation:{...external,updatedAtMs:3},turns:[],messages:[{
        id:'remote-new',conversationId:'external-thread',turnId:'remote-turn',
        role:'user',content:'New external update',createdAtMs:3,
      }],
    }}}));
    expect(screen.getByText('New external update')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Message Agent Core…')).toHaveValue('Draft must stay');
    postMessage.mockClear();
    act(()=>vi.advanceTimersByTime(4100));
    act(()=>messageHandler!({data:{type:'agent-chat-list-result',result:{
      conversations:[{...external,updatedAtMs:4},current],
    }}}));
    expect(postMessage).toHaveBeenCalledWith({type:'agent-chat-open',conversationId:'external-thread'});
    act(()=>messageHandler!({data:{type:'agent-chat-state',result:{
      conversation:{...external,updatedAtMs:4},turns:[{
        id:'remote-turn',conversationId:'external-thread',clientRequestId:'remote-request',runtimeTaskId:'remote-task',
        status:'failed',errorCode:'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED',createdAtMs:3,startedAtMs:3,completedAtMs:4,
      }],messages:[{id:'remote-report',conversationId:'external-thread',turnId:'remote-turn',
        role:'assistant',content:'Observed report; task remains incomplete.',createdAtMs:4}],
    }}}));
    expect(screen.getByText('Observed report; task remains incomplete.')).toBeInTheDocument();
    expect(screen.getByText('Task failed')).toBeInTheDocument();
    expect(screen.getByText('AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Message Agent Core…')).toHaveValue('Draft must stay');
  });
});
