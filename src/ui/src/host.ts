export type DesktopStatus = {
  overall: 'online' | 'degraded' | 'offline';
  connection: 'on' | 'off';
  memory: 'not-used' | 'available' | 'degraded' | 'error';
  tunnel: 'on' | 'off';
  execution: 'available' | 'unavailable';
  gameMode: 'on' | 'off';
  autostart: boolean;
  root: string;
};

export type ProviderServerSnapshot = {
  id: string;
  observedVersion?: string;
  compatibility?: string;
};

export type DesktopHealthSnapshot = {
  memory: {
    status: string;
    canonicalStore?: string;
    noteCount: number;
    issueCount: number;
    index?: string;
    embedding?: string;
    intelligence?: string;
  };
  execution: { status: string; mode?: string };
  phone: {
    status: string;
    mode?: string;
    transport?: string;
    deviceOnline: boolean;
    deviceId?: string;
  };
  codeIntelligence: {
    status: string;
    provider?: string;
    index?: string;
    daemon?: string;
    issueCount: number;
    issue?: string;
    isolationOk: boolean;
  };
  semanticIde: {
    status: string;
    issueCount: number;
    issue?: string;
    configuredServers: ProviderServerSnapshot[];
  };
  learning: {
    status: string;
    issueCount: number;
    sinkStatus: Array<{ name: string; available: boolean }>;
  };
  agentRuntime?: {
    status: string;
    issueCount: number;
    issue?: string;
    providerCount: number;
    configuredProviderCount: number;
    sessionCount: number;
    runningSessionCount: number;
    skillCount: number;
    pendingFinalizationCount: number;
  };
  agentChat?: {
    status: string;
    conversationCount: number;
    activeConversationCount: number;
    runningTurnCount: number;
  };
};

export type DesktopSnapshot = {
  status: DesktopStatus;
  capturedAt: string;
  version: string;
  core: {
    pid?: number;
    uptimeSeconds?: number;
    workingSetBytes?: number;
    memoryCapacityBytes?: number;
    cpuPercent?: number;
    port: number;
    httpHealthy: boolean;
  };
  tunnel: { port: number; ready: boolean };
  paths: {
    root: string;
    memory: string;
    runtimeCache: string;
    logs: string;
  };
  health: DesktopHealthSnapshot;
};

export type ActivityEntry = {
  id: string;
  time: string;
  module: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'sys';
  message: string;
};

export type AgentRunResult = {
  sessionId: string;
  taskId: string;
  response: string;
  status: 'finalized' | 'finalization-failed';
  iterations: number;
  retrievalAttemptIds: string[];
};

export type AgentRunState = {
  requestId?: string;
  status: 'idle' | 'running' | 'done' | 'error';
  result?: AgentRunResult;
  error?: string;
};

export type AgentChatConversation = {
  id: string;
  runtimeSessionId: string;
  workspace: string;
  title: string;
  status: 'active' | 'archived';
  preferredProviderId?: string;
  preferredModel?: string;
  createdAtMs: number;
  updatedAtMs: number;
  lastTurnId?: string;
};

export type AgentChatTurn = {
  id: string;
  conversationId: string;
  clientRequestId: string;
  runtimeTaskId: string;
  status: 'running' | 'finalized' | 'failed' | 'interrupted' | 'stopped';
  providerId?: string;
  model?: string;
  iterations?: number;
  retrievalCount?: number;
  errorCode?: string;
  createdAtMs: number;
  startedAtMs: number;
  completedAtMs?: number;
};

export type AgentChatMessage = {
  id: string;
  conversationId: string;
  turnId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAtMs: number;
};

export type AgentChatDetail = {
  conversation: AgentChatConversation;
  turns: AgentChatTurn[];
  messages: AgentChatMessage[];
};

export type AgentChatEvent = {
  type: string;
  at: string;
  conversationId: string;
  turnId: string;
  toolName?: string;
  success?: boolean;
  itemCount?: number;
  providerId?: string;
  model?: string;
  response?: string;
  code?: string;
};

export type AgentChatUiState = {
  conversations: AgentChatConversation[];
  active?: AgentChatDetail;
  runningRequestId?: string;
  lastEvent?: AgentChatEvent;
  error?: string;
};

type HostEnvelope =
  | { type: 'status'; status: DesktopStatus }
  | { type: 'snapshot'; snapshot: DesktopSnapshot }
  | { type: 'log'; entry: ActivityEntry }
  | { type: 'logs'; entries: ActivityEntry[] }
  | { type: 'agent-result'; requestId: string; result?: AgentRunResult; error?: string }
  | { type: 'agent-chat-list-result'; result: { conversations?: AgentChatConversation[] } }
  | { type: 'agent-chat-state'; result: AgentChatDetail }
  | { type: 'agent-chat-event'; requestId: string; envelope: { type: string; event?: AgentChatEvent; result?: unknown; error?: string } }
  | { type: 'agent-chat-cancel-result'; turnId: string; stopped: boolean }
  | { type: 'agent-chat-error'; requestId?: string; error: string }
  | { type: 'error'; message: string };

export type HostListener = (message: HostEnvelope) => void;

type WebViewBridge = {
  addEventListener(name: 'message', listener: (event: { data: HostEnvelope }) => void): void;
  removeEventListener(name: 'message', listener: (event: { data: HostEnvelope }) => void): void;
  postMessage(message: unknown): void;
};

const webview = (): WebViewBridge | undefined => (window as any).chrome?.webview;

export const postHost = (message: unknown) => webview()?.postMessage(message);

export function subscribeHost(listener: HostListener): () => void {
  const bridge = webview();
  if (!bridge) return () => undefined;
  const wrapped = (event: { data: HostEnvelope }) => listener(event.data);
  bridge.addEventListener('message', wrapped);
  return () => bridge.removeEventListener('message', wrapped);
}
