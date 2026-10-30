import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  it('fills the composer "/" menu from the agent-chat-slash-commands-result message', () => {
    render(<App/>);pushSnapshot(chatReady);
    const textarea=screen.getByRole('textbox',{name:'Message Agent Core'});
    fireEvent.change(textarea,{target:{value:'/'}});
    expect(postMessage.mock.calls.filter(([value])=>value?.type==='agent-chat-slash-commands')).toHaveLength(1);
    expect(screen.queryByRole('listbox',{name:'Perintah dan skill'})).not.toBeInTheDocument();
    act(()=>messageHandler!({data:{type:'agent-chat-slash-commands-result',result:{commands:[
      {name:'compact',kind:'command',description:'Padatkan konteks'},
      {name:'code-review',kind:'skill',description:'Tinjau kode'},
    ]}}}));
    expect(screen.getByRole('listbox',{name:'Perintah dan skill'})).toBeInTheDocument();
    expect(screen.getAllByRole('option').map(option=>option.querySelector('b')!.textContent)).toEqual(['/compact','/code-review']);
    expect(postMessage.mock.calls.filter(([value])=>value?.type==='agent-chat-error')).toHaveLength(0);
  });

  it('manual continuation keeps running conversations switchable and scoped', () => {
    const a={id:'switch-a',runtimeSessionId:'session-a',workspace:'agent-core',title:'Switch A',status:'active' as const,createdAtMs:1,updatedAtMs:1};
    const b={...a,id:'switch-b',runtimeSessionId:'session-b',title:'Switch B'};
    const host=(data:any)=>act(()=>messageHandler!({data}));
    const openHistory=(title:string)=>{
      fireEvent.click(screen.getByRole('button',{name:'Chat history'}));
      const target=screen.getByRole('button',{name:new RegExp(title)});
      expect(target).toBeEnabled();fireEvent.click(target);
    };
    render(<App/>);pushSnapshot(chatReady);
    host({type:'agent-chat-list-result',result:{conversations:[a,b]}});
    host({type:'agent-chat-state',result:{conversation:a,turns:[],messages:[]}});
    fireEvent.change(screen.getByRole('textbox',{name:'Message Agent Core'}),{target:{value:'Run A'}});
    fireEvent.click(screen.getByRole('button',{name:'Send'}));
    const requestA=postMessage.mock.calls.find(([value])=>value?.type==='agent-chat-send')![0].requestId;
    // The textarea stays enabled while running so /compact can be typed; ordinary sends are refused by submit().
    expect(screen.getByRole('textbox',{name:'Message Agent Core'})).toBeEnabled();
    expect(screen.getByRole('textbox',{name:'Message Agent Core'})).toHaveAttribute('placeholder','Giliran berjalan. Ketik /compact untuk memadatkan konteks.');
    openHistory('Switch B');
    host({type:'agent-chat-state',result:{conversation:b,turns:[],messages:[]}});
    fireEvent.change(screen.getByRole('textbox',{name:'Message Agent Core'}),{target:{value:'Draft B'}});
    host({type:'agent-chat-state',requestId:requestA,result:{conversation:{...a,updatedAtMs:2},turns:[],messages:[]}});
    expect(screen.getByRole('heading',{name:'Switch B'})).toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:'Message Agent Core'})).toHaveValue('Draft B');
    openHistory('Switch A');host({type:'agent-chat-state',result:{conversation:a,turns:[],messages:[]}});
    expect(screen.getByRole('textbox',{name:'Message Agent Core'})).toHaveValue('');
    openHistory('Switch B');host({type:'agent-chat-state',result:{conversation:b,turns:[],messages:[]}});
    expect(screen.getByRole('textbox',{name:'Message Agent Core'})).toHaveValue('Draft B');
    const paused={id:'paused-b',conversationId:b.id,clientRequestId:'old-b',runtimeTaskId:'task-b',status:'resumable',errorCode:'AGENT_CHAT_TURN_RESUMABLE',createdAtMs:1,startedAtMs:1};
    host({type:'agent-chat-state',result:{conversation:b,turns:[paused],messages:[]}});
    expect(postMessage.mock.calls.filter(([value])=>value?.type==='agent-chat-resume')).toHaveLength(0);
    const proceed=screen.getByRole('button',{name:'Continue'});
    fireEvent.click(proceed);
    host({type:'agent-chat-state',result:{conversation:b,turns:[paused],messages:[]}});
    fireEvent.click(screen.getByRole('button',{name:'Continue'}));
    const resumes=postMessage.mock.calls.filter(([value])=>value?.type==='agent-chat-resume');
    expect(resumes).toHaveLength(1);
    expect(resumes[0]![0]).toMatchObject({conversationId:b.id,turnId:'paused-b'});
    fireEvent.click(screen.getByRole('button',{name:'New Chat'}));
    fireEvent.click(screen.getByRole('button',{name:'Goals mode'}));
    fireEvent.change(screen.getByRole('textbox',{name:'Message Agent Core'}),{target:{value:'New draft'}});
    fireEvent.click(screen.getByRole('button',{name:'Send'}));
    const createRequest=[...postMessage.mock.calls].reverse().find(([value])=>value?.type==='agent-chat-create')![0].requestId;
    host({type:'agent-chat-state',requestId:resumes[0]![0].requestId,result:{conversation:b,turns:[],messages:[]}});
    expect(postMessage.mock.calls.some(([value])=>value?.type==='agent-chat-send'&&value.prompt==='New draft')).toBe(false);
    const c={...a,id:'created-c',runtimeSessionId:'session-c',title:'Created C'};
    host({type:'agent-chat-state',requestId:createRequest,result:{conversation:c,turns:[],messages:[]}});
    expect(postMessage.mock.calls.filter(([value])=>value?.type==='agent-chat-send'&&value.prompt==='New draft').map(([value])=>value.conversationId)).toEqual([c.id]);
    const goalRequest=postMessage.mock.calls.find(([value])=>value?.type==='agent-chat-send'&&value.prompt==='New draft')![0];
    expect(goalRequest.goalMode).toBe(true);
    const goal={...paused,id:'goal-c',conversationId:c.id,clientRequestId:goalRequest.clientRequestId,runtimeTaskId:'goal-task-c',status:'running',errorCode:undefined,goalMode:true};
    const goalMessage={id:'goal-message-c',conversationId:c.id,turnId:goal.id,role:'user',content:'New draft',createdAtMs:1};
    host({type:'agent-chat-state',result:{conversation:c,turns:[goal],messages:[goalMessage]}});
    expect(screen.getByRole('region',{name:'Current goal'})).toHaveTextContent('Running goal');
    fireEvent.click(screen.getByRole('button',{name:'Pause goal'}));
    expect(postMessage.mock.calls.find(([value])=>value?.type==='agent-chat-pause')![0]).toMatchObject({conversationId:c.id,turnId:goal.id});
    host({type:'agent-chat-state',result:{conversation:c,turns:[{...goal,pauseRequested:true}],messages:[goalMessage]}});
    expect(screen.getByRole('region',{name:'Current goal'})).toHaveTextContent('Pausing goal');
    expect(screen.getByRole('button',{name:'Pause goal'})).toBeDisabled();
    host({type:'agent-chat-state',requestId:goalRequest.requestId,result:{conversation:c,turns:[{...goal,status:'resumable',errorCode:'AGENT_RUNTIME_CONTINUATION_USER_PAUSED'}],messages:[goalMessage]}});
    expect(screen.getByRole('region',{name:'Current goal'})).toHaveTextContent('Paused goal');
    expect(screen.queryByRole('button',{name:'Continue'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Continue goal'}));
    expect(postMessage.mock.calls.filter(([value])=>value?.type==='agent-chat-resume').map(([value])=>value.turnId)).toEqual(['paused-b',goal.id]);
    fireEvent.click(screen.getByRole('button',{name:'Stop goal'}));
    expect(postMessage.mock.calls.find(([value])=>value?.type==='agent-chat-cancel')![0]).toMatchObject({turnId:goal.id,conversationId:c.id});
  });

  it('opens on a new chat draft inside the grouped launcher', () => {
    render(<App />);
    pushSnapshot(chatReady);

    expect(screen.getByRole('heading', { name: 'Agent Core Workspace' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message Agent Core' })).toBeEnabled();
    expect(screen.queryByPlaceholderText(/Search systems/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Agent Core home' })).toBeInTheDocument();
    for (const name of ['New Chat', 'Dashboard', 'Core Runtime', 'Tools Hub & MCP', 'Dreaming Review', 'Activity Log', 'Diagnostics & Recovery', 'Settings', 'Quick Actions']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Core: Ready' })).toBeInTheDocument();
  });

  it('does not reopen the latest conversation by itself', () => {
    render(<App />);
    pushSnapshot(chatReady);
    const latest = { id: 'old-thread', runtimeSessionId: 's0', workspace: 'agent-core', title: 'Old thread',
      status: 'active' as const, createdAtMs: 1, updatedAtMs: 1 };
    postMessage.mockClear();
    act(() => messageHandler!({ data: { type: 'agent-chat-list-result', result: { conversations: [latest] } } }));

    expect(postMessage.mock.calls.some(([value]) => value?.type === 'agent-chat-open')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Agent Core Workspace' })).toBeInTheDocument();
    expect(screen.queryByText('Old thread')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chat history' }));
    fireEvent.click(screen.getByText('Old thread'));
    expect(postMessage).toHaveBeenCalledWith({ type: 'agent-chat-open', conversationId: 'old-thread' });
  });

  it('creates the conversation on the first send from the draft, then sends the turn', () => {
    render(<App />);
    pushSnapshot(chatReady);

    fireEvent.change(screen.getByRole('textbox', { name: 'Message Agent Core' }), { target: { value: 'Cek runtime' } });
    postMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent-chat-create', workspace: 'agent-core' }));
    expect(postMessage.mock.calls.some(([value]) => value?.type === 'agent-chat-send')).toBe(false);

    const conversation = { id: 'draft-1', runtimeSessionId: 's-draft', workspace: 'agent-core', title: 'New Chat',
      status: 'active' as const, createdAtMs: 1, updatedAtMs: 1 };
    const createRequest=postMessage.mock.calls.find(([value])=>value?.type==='agent-chat-create')![0].requestId;
    postMessage.mockClear();
    act(() => messageHandler!({ data: { type: 'agent-chat-state', requestId:createRequest, result: { conversation, turns: [], messages: [] } } }));

    const sent = postMessage.mock.calls.find(([value]) => value?.type === 'agent-chat-send')?.[0];
    expect(sent).toEqual(expect.objectContaining({ conversationId: 'draft-1', prompt: 'Cek runtime' }));
  });

  it('gives the typed prompt back when creating the conversation fails', () => {
    render(<App />);
    pushSnapshot(chatReady);

    fireEvent.change(screen.getByRole('textbox', { name: 'Message Agent Core' }), { target: { value: 'Jangan hilang' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const createRequest=postMessage.mock.calls.find(([value])=>value?.type==='agent-chat-create')![0].requestId;
    act(() => messageHandler!({ data: { type: 'agent-chat-error', requestId:createRequest, error: 'create failed' } }));

    expect(screen.getByRole('textbox', { name: 'Message Agent Core' })).toHaveValue('Jangan hilang');
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
    expect(screen.getByRole('heading', { name: 'Agent Core Workspace' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Thread A' })).not.toBeInTheDocument();
  });

  it('renders live snapshot truth in the reference dashboard shell', () => {
    render(<App />);
    expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
    expect(messageHandler).toBeTypeOf('function');

    pushSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));

    expect(screen.getByRole('button', { name: 'Core: Ready' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Agent Core Operating Cockpit' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quick Actions' }));
    expect(screen.getByText('PID 15404')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Code Intelligence.*Healthy/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agent Core AI.*Offline/ })).toBeInTheDocument();

    pushSnapshot({
      ...onlineSnapshot,
      status: { ...onlineSnapshot.status, overall: 'offline', connection: 'off', tunnel: 'off', execution: 'unavailable', gameMode: 'off' },
      core: { ...onlineSnapshot.core, httpHealthy: false, pid: undefined },
      tunnel: { ...onlineSnapshot.tunnel, ready: false },
    });

    expect(screen.getByRole('button', { name: 'Core: Unavailable' })).toBeInTheDocument();
    expect(screen.getByText('PID -')).toBeInTheDocument();
  });

  it('routes only owned lifecycle and launcher actions to the native host', () => {
    render(<App />);
    pushSnapshot();
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    postMessage.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Restart Core' }));
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
    expect(screen.getByRole('heading', { name: 'Execution Activity Log & Flight Recorder' })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]!);
    expect(screen.getByRole('heading', { name: 'Settings & Workspace Configuration' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /Factory Reset/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset All Settings/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear Cache/ })).not.toBeInTheDocument();

    const startWithWindows = screen.getByText('Start with Windows').closest('.prototype-setting-row')?.querySelector('button');
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
        agentRuntime: { ...onlineSnapshot.health.agentRuntime!, status: 'available', issueCount: 0, providerCount: 1, configuredProviderCount: 1 },
        agentChat: { status: 'available', conversationCount: 0, activeConversationCount: 0, runningTurnCount: 0 },
      },
    });

    // The launcher opens on a draft; the conversation is created on the first send.
    expect(screen.getByRole('heading', { name: 'Agent Core Workspace' })).toBeInTheDocument();
    const conversation = {
      id: 'conversation-1', runtimeSessionId: 'session-1', workspace: 'agent-core', title: 'New Chat',
      status: 'active' as const, createdAtMs: 1, updatedAtMs: 1,
    };
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Agent Core' }), { target: { value: 'Inspect current runtime' } });
    postMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const createRequest = postMessage.mock.calls.find(([value]) => value?.type === 'agent-chat-create')![0].requestId;
    act(() => messageHandler!({ data: { type: 'agent-chat-state', requestId: createRequest, result: { conversation, turns: [], messages: [] } } }));

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

  describe('model and effort selection survives restart and is never changed silently', () => {
    const SELECTION_KEY = 'agentcore.chat.selection';
    const storedSelection = () => JSON.parse(window.localStorage.getItem(SELECTION_KEY) ?? 'null');
    const conversation = { id: 'sel-chat', runtimeSessionId: 'sel-session', workspace: 'agent-core', title: 'Selection',
      status: 'active' as const, createdAtMs: 1, updatedAtMs: 1 };
    const twoProviders = { ...onlineSnapshot, health: { ...onlineSnapshot.health,
      agentRuntime: { ...onlineSnapshot.health.agentRuntime!, configuredProviderCount: 2 } } };
    // Ending the running state needs the host to answer with the request id of the pending send.
    const hostState = () => {
      const send = [...postMessage.mock.calls].reverse().find(([value]) => value?.type === 'agent-chat-send');
      act(() => messageHandler!({ data: { type: 'agent-chat-state', requestId: send?.[0].requestId, result: { conversation, turns: [], messages: [] } } }));
    };
    const hostProviders = (providers: any[], selection?: any) =>
      act(() => messageHandler!({ data: { type: 'agent-chat-providers-result', result: { providers, ...(selection ? { selection } : {}) } } }));
    const sendText = (text: string) => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Message Agent Core' }), { target: { value: text } });
      postMessage.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      return postMessage.mock.calls.find(([value]) => value?.type === 'agent-chat-send')?.[0];
    };
    const catalog = (models = [{ id: 'fixture-default', reasoningEfforts: ['high'] }, { id: 'fixture-other', reasoningEfforts: [] as string[] }]) => [
      { id: 'anthropic', model: 'fixture-default', configured: true, available: true, reasoningEfforts: ['high'], models },
      { id: 'atria', model: 'fixture-atria', configured: true, available: true },
    ];
    const boot = () => {
      const view = render(<App />);
      pushSnapshot(twoProviders);
      act(() => messageHandler!({ data: { type: 'agent-chat-state', result: { conversation, turns: [], messages: [] } } }));
      return view;
    };
    beforeEach(() => window.localStorage.clear());
    afterEach(() => window.localStorage.clear());

    it('persists global effort across reload, sends two levels, omits Auto and keeps (not resets) unsupported saved levels', () => {
      const levels = (list = ['low', 'medium', 'high', 'xhigh', 'max']) => hostProviders([
        { id: 'anthropic', model: 'fixture', configured: true, available: true, reasoningEfforts: list },
        { id: 'atria', model: 'fixture', configured: true, available: true },
      ]);
      let view = boot(); levels();
      fireEvent.change(screen.getByLabelText('Provider dan model'), { target: { value: 'anthropic' } });
      for (const level of ['Low', 'High']) {
        fireEvent.click(screen.getByRole('button', { name: /Reasoning:/ }));
        fireEvent.click(screen.getByRole('menuitemradio', { name: level }));
        const sent = sendText('Hello ' + level);
        expect(sent).toMatchObject({ providerId: 'anthropic', reasoningEffort: level.toLowerCase() });
        expect(screen.getByRole('button', { name: /Reasoning:/ })).toBeDisabled();
        hostState();
      }
      expect(storedSelection()).toMatchObject({ providerId: 'anthropic', reasoningEffort: 'high' });
      view.unmount(); view = boot(); levels();
      expect(screen.getByRole('button', { name: 'Reasoning: High' })).toBeEnabled();

      fireEvent.change(screen.getByLabelText('Provider dan model'), { target: { value: 'atria' } });
      expect(screen.getByRole('button', { name: 'Reasoning: Auto' })).toBeDisabled();
      expect(sendText('Other provider')).not.toHaveProperty('reasoningEffort');
      hostState();

      fireEvent.change(screen.getByLabelText('Provider dan model'), { target: { value: 'anthropic' } });
      levels(['low']);
      // The saved High is kept; only the displayed/sent level is the nearest supported one.
      expect(screen.getByRole('button', { name: 'Reasoning: Low' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Effort high tidak didukung fixture; memakai low untuk model ini');
      expect(storedSelection().reasoningEffort).toBe('high');
      expect(sendText('Clamped')).toMatchObject({ reasoningEffort: 'low' });
      hostState();
      levels();
      expect(screen.getByRole('button', { name: 'Reasoning: High' })).toBeInTheDocument();
      expect(screen.queryByText(/tidak didukung/)).not.toBeInTheDocument();
      view.unmount();
    });

    it('hydrates provider, model and effort from the server without interaction, then keeps the user pick over later polls', () => {
      boot();
      hostProviders(catalog([{ id: 'fixture-default', reasoningEfforts: ['high'] }, { id: 'fixture-other', reasoningEfforts: ['low', 'high'] }]),
        { providerId: 'anthropic', model: 'fixture-other', reasoningEffort: 'low', updatedAtMs: 5 });
      const picker = screen.getByLabelText('Provider dan model') as HTMLSelectElement;
      expect(picker.value).toBe('anthropic:fixture-other');
      expect(screen.getByRole('button', { name: 'Reasoning: Low' })).toBeEnabled();
      expect([...picker.options].find(option => option.selected)!.textContent).toContain('Terakhir dipakai');
      expect(sendText('Restored')).toMatchObject({ providerId: 'anthropic', model: 'fixture-other', reasoningEffort: 'low' });
      hostState();

      fireEvent.change(picker, { target: { value: 'atria' } });
      hostProviders(catalog(), { providerId: 'anthropic', model: 'fixture-other', reasoningEffort: 'low', updatedAtMs: 5 });
      expect(picker.value).toBe('atria');
      expect(storedSelection()).toMatchObject({ providerId: 'atria' });
    });

    it('keeps a saved model that left the catalog, says so, and refuses to send with another model', () => {
      boot();
      hostProviders(catalog(), { providerId: 'anthropic', model: 'fixture-other', reasoningEffort: 'auto', updatedAtMs: 5 });
      expect((screen.getByLabelText('Provider dan model') as HTMLSelectElement).value).toBe('anthropic:fixture-other');
      hostProviders(catalog([{ id: 'fixture-default', reasoningEfforts: ['high'] }]));
      expect((screen.getByLabelText('Provider dan model') as HTMLSelectElement).value).toBe('anthropic:fixture-other');
      expect(screen.getByRole('status')).toHaveTextContent('Model tidak tersedia di katalog saat ini; pilih model');
      fireEvent.change(screen.getByRole('textbox', { name: 'Message Agent Core' }), { target: { value: 'Must not go out' } });
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
      expect(storedSelection()).toMatchObject({ providerId: 'anthropic', model: 'fixture-other' });
      hostProviders(catalog());
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
      expect(screen.queryByText(/tidak tersedia di katalog/)).not.toBeInTheDocument();
    });

    it('selects catalog models per message and guards reasoning by the selected model', () => {
      boot(); hostProviders(catalog());
      const picker = screen.getByLabelText('Provider dan model') as HTMLSelectElement;
      expect([...picker.options].map(option => [option.value, option.textContent])).toEqual([
        ['auto', 'Auto (rotasi otomatis)'], ['anthropic', 'anthropic · fixture-default'],
        ['anthropic:fixture-other', 'anthropic · fixture-other'], ['atria', 'atria · fixture-atria'],
      ]);
      fireEvent.change(picker, { target: { value: 'anthropic' } });
      fireEvent.click(screen.getByRole('button', { name: 'Reasoning: Auto' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'High' }));
      // Every owner pick is pushed to the server immediately, not only on send.
      expect(postMessage).toHaveBeenCalledWith({ type: 'agent-chat-select', providerId: 'anthropic', model: '', reasoningEffort: 'high' });
      const defaultPayload = sendText('Use default');
      expect(defaultPayload).toMatchObject({ providerId: 'anthropic', reasoningEffort: 'high' });
      expect(defaultPayload).not.toHaveProperty('model');
      expect(picker).toBeDisabled();
      hostState();

      fireEvent.change(picker, { target: { value: 'anthropic:fixture-other' } });
      // Three separate values. SAVED: High stays High although this model offers no level.
      expect(storedSelection().reasoningEffort).toBe('high');
      expect(postMessage).toHaveBeenCalledWith({ type: 'agent-chat-select', providerId: 'anthropic', model: 'fixture-other', reasoningEffort: 'high' });
      // EFFECTIVE (display): Auto, with an explanation.
      expect(screen.getByRole('button', { name: 'Reasoning: Auto' })).toBeEnabled();
      expect(screen.getByRole('status')).toHaveTextContent('Effort high tidak didukung fixture-other; memakai auto untuk model ini');
      // SENT: the effective level (none for Auto), never the unsupported High.
      const explicitPayload = sendText('Use another model');
      expect(explicitPayload).toMatchObject({ providerId: 'anthropic', model: 'fixture-other' });
      expect(explicitPayload).not.toHaveProperty('reasoningEffort');
      expect(storedSelection().reasoningEffort).toBe('high');
      hostState();

      // Picking a model that supports High again makes the untouched saved High effective and sent.
      fireEvent.change(picker, { target: { value: 'anthropic' } });
      expect(screen.getByRole('button', { name: 'Reasoning: High' })).toBeEnabled();
      expect(screen.queryByText(/tidak didukung/)).not.toBeInTheDocument();
      expect(sendText('Back to default')).toMatchObject({ providerId: 'anthropic', reasoningEffort: 'high' });
      hostState();

      fireEvent.change(picker, { target: { value: 'auto' } });
      const autoPayload = sendText('Automatic route');
      for (const key of ['model', 'providerId', 'reasoningEffort']) expect(autoPayload).not.toHaveProperty(key);
    });

    it('lets the owner choose a provider per message, with automatic rotation as the default', () => {
      boot();
      expect(postMessage).toHaveBeenCalledWith({ type: 'agent-chat-providers' });
      hostProviders([
        { id: 'atria', model: 'Atria-Dawn', configured: true, available: true },
        { id: 'gonka', model: 'DeepSeek-V4-Flash', configured: true, available: false, retryAt: '2026-10-25T09:00:00.000Z' },
        { id: 'half', model: null, configured: false, available: false, issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE' },
      ]);
      const picker = screen.getByLabelText('Provider dan model') as HTMLSelectElement;
      expect(picker.value).toBe('auto');
      expect([...picker.options].map(option => option.textContent)).toEqual([
        'Auto (rotasi otomatis)', 'atria · Atria-Dawn', 'gonka · DeepSeek-V4-Flash (cooldown)', 'half (belum dikonfigurasi)']);
      expect(picker.options[3]!.disabled).toBe(true);
      expect(sendText('halo')).not.toHaveProperty('providerId');
      hostState();
      fireEvent.change(picker, { target: { value: 'atria' } });
      expect(sendText('halo lagi')).toMatchObject({ providerId: 'atria' });
    });
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
    const current={
      id:'current-thread',runtimeSessionId:'s1',workspace:'agent-core',
      title:'Current Thread',status:'active' as const,createdAtMs:1,updatedAtMs:1,
    };
    act(()=>messageHandler!({data:{type:'agent-chat-list-result',result:{conversations:[current]}}}));
    act(()=>messageHandler!({data:{type:'agent-chat-state',
      result:{conversation:current,turns:[],messages:[]}}}));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Agent Core' }),{
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
    expect(screen.getByRole('heading',{name:'Current Thread'})).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message Agent Core' })).toHaveValue('Draft must stay');
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
    // Drafts are kept per conversation: the externally opened thread starts with an empty composer.
    expect(screen.getByRole('textbox', { name: 'Message Agent Core' })).toHaveValue('');
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
    expect(screen.getByRole('textbox', { name: 'Message Agent Core' })).toHaveValue('');
  });

  it('polls every 1.5 s only while the active conversation has a running turn',()=>{
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
    const current={id:'current-thread',runtimeSessionId:'s1',workspace:'agent-core',
      title:'Current Thread',status:'active' as const,createdAtMs:1,updatedAtMs:1};
    const listResult=()=>act(()=>messageHandler!({data:{type:'agent-chat-list-result',result:{conversations:[current]}}}));
    act(()=>messageHandler!({data:{type:'agent-chat-state',result:{conversation:current,turns:[],messages:[]}}}));
    listResult();
    postMessage.mockClear();
    act(()=>vi.advanceTimersByTime(1600));
    expect(postMessage).not.toHaveBeenCalledWith({type:'agent-chat-list'});
    act(()=>messageHandler!({data:{type:'agent-chat-state',result:{conversation:current,turns:[{
      id:'t1',conversationId:'current-thread',clientRequestId:'r1',runtimeTaskId:'k1',status:'running',createdAtMs:1,startedAtMs:1,
    }],messages:[]}}}));
    listResult();
    postMessage.mockClear();
    act(()=>vi.advanceTimersByTime(1600));
    expect(postMessage).toHaveBeenCalledWith({type:'agent-chat-list'});
    expect(postMessage).not.toHaveBeenCalledWith({type:'agent-chat-providers'});
  });
});
