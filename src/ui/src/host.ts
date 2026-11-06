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
  skills?: {status:string; mode?:string; skillCount?:number|null; executionAuthority?:boolean|null; discoveryMode?:string; instructionRead?:boolean|null; issue?:string}|null;
  externalControllerLearning?: {status:string;mode?:string;episodeCount?:number|null;pendingLearningEpisodes?:number|null;procedureCount?:number|null;readyProcedureCount?:number|null;semanticAuthority?:string;issue?:string}|null;
  webResearch?: {status:string;searchConfigured?:boolean|null;readerConfigured?:boolean|null;nativeReaderAvailable?:boolean|null;externalReaderConfigured?:boolean|null;searchProviders?:string[]|null;openProviders?:string[]|null;issue?:string}|null;
  mcpMutationSafety?: {status:string;issueCount?:number|null;issue?:string;draining?:boolean|null;activeMutations?:number|null;journalEntries?:number|null}|null;
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
  timestamp?: string;
  kind?: string;
  invocationId?: string;
  tool?: string;
  target?: string;
  status?: 'running' | 'success' | 'error' | 'cancelled' | 'unknown';
  /** Lifecycle is separate from the terminal tool outcome. */
  lifecycle?: 'complete' | 'incomplete' | 'start-only' | null;
  startedAt?: string | null;
  terminalAt?: string | null;
  durationMs?: number | null;
};

export type ActivityDetailPage = {
  invocationId: string;
  phase: 'request' | 'response';
  state: 'complete' | 'truncated' | 'redacted' | 'omitted' | 'expired' | 'unavailable';
  redacted: boolean;
  text: string;
  offset: number;
  nextOffset: number | null;
  totalChars: number;
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

/** Estimated tokens (chars/4) per prompt part, written by the server per turn and on context.usage; not the provider total. */
export type ContextBreakdown = { system: number; tools: number; conversation: number; memory: number; skills?: number; toolResults?: number };

/** What the host reports about a file sent with a turn: metadata only, the file stays on disk. */
export type AgentChatAttachment = {
  attachmentId: string;
  name: string;
  mimeType: string;
  kind: 'text' | 'image' | 'binary';
  sizeBytes: number;
  relPath: string;
};

export type AgentChatTurn = {
  agentProfile?: AgentProfileMetadata;
  id: string;
  conversationId: string;
  clientRequestId: string;
  runtimeTaskId: string;
  goalMode?: boolean;
  planMode?: boolean;
  /** Present only on a turn that carried files. */
  attachments?: AgentChatAttachment[];
  pauseRequested?: boolean;
  status: 'running' | 'resumable' | 'finalized' | 'failed' | 'interrupted' | 'stopped';
  providerId?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  iterations?: number;
  /** Loop ceiling written live with iterations; absent for turns that have not reported it. */
  maxIterations?: number;
  retrievalCount?: number;
  /** Last observed prompt size and known window for this turn; absent when the provider reported none. */
  contextTokens?: number;
  contextWindow?: number;
  contextBreakdown?: ContextBreakdown;
  /** Cache tokens of the last real provider call; kept across a later interim estimate. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** True when contextTokens/contextBreakdown are the interim estimate, not a fresh measurement. */
  contextEstimated?: boolean;
  memoryUse?: AgentMemoryUse[];
  errorCode?: string;
  createdAtMs: number;
  startedAtMs: number;
  completedAtMs?: number;
};

export type AgentMemoryUse = {
  memoryId: string;
  title: string;
  applicability: 'applied' | 'adapted' | 'rejected';
  evidenceRefs: string[];
  verification: 'pass' | 'fail' | 'unavailable';
};

export type AgentChatMessage = {
  id: string;
  conversationId: string;
  turnId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAtMs: number;
};

/** Persisted per-step metadata (no Input/Output text; that is fetched per step on demand). */
export type AgentChatStepMeta = {
  turnId: string;
  seq: number;
  iteration?: number;
  toolName: string;
  status: 'running' | 'ok' | 'error';
  startedAtMs: number;
  durationMs?: number;
  argsSummary?: string;
  resultSummary?: string;
  /** 'note' marks a persisted assistant narration row (toolName '', text in resultSummary) ordered among tool steps. */
  kind?: 'note';
};

export type StepDetailState = {
  status: 'loading' | 'ready' | 'error';
  inputText?: string;
  outputText?: string;
  inputTruncated?: boolean;
  outputTruncated?: boolean;
  error?: string;
};

export type StepDetailResult = { inputText: string; outputText: string; inputTruncated: boolean; outputTruncated: boolean };
export type StepDetailAction =
  | { type: 'loading'; turnId: string; seq: number }
  | { type: 'ready'; turnId: string; seq: number; result: StepDetailResult }
  | { type: 'error'; turnId: string; seq: number; error: string };

export const stepKey = (turnId: string, seq: number) => `${turnId}:${seq}`;

/** Pure reducer for the on-demand step Input/Output cache; loading never replaces loading/ready (no duplicate request). */
export function reduceStepDetail(prev: Record<string, StepDetailState> | undefined, action: StepDetailAction): Record<string, StepDetailState> {
  const map = prev ?? {};
  const key = stepKey(action.turnId, action.seq);
  const current = map[key];
  if (action.type === 'loading') {
    if (current && current.status !== 'error') return map;
    return { ...map, [key]: { status: 'loading' } };
  }
  if (action.type === 'ready') return { ...map, [key]: { status: 'ready', ...action.result } };
  return { ...map, [key]: { status: 'error', error: action.error } };
}

export type AgentChatDetail = {
  conversation: AgentChatConversation;
  turns: AgentChatTurn[];
  messages: AgentChatMessage[];
  /** Persisted tool steps of the newest turns (metadata only). */
  steps?: AgentChatStepMeta[];
  decisionEvidence?: {
    status: 'available' | 'unavailable'; taskId: string; truncated: boolean;
    attribution: 'controller-declared'; goalVerification: 'not-established';
    records: Array<{ id: string; question: string; assumptions: Array<{ statement: string; basis: string }>;
      alternatives: Array<{ id: string; claim: string; check: string; falsifier: string; status: string }>;
      summary: string; evidenceRefs: string[]; assessedAt?: string }>;
  };
};

export type AgentChatEvent = {
  stream?: { id: string; type: 'start' | 'end' | 'reset' } | { id: string; type: 'delta'; text: string };
  agentProfile?: AgentProfileMetadata;
  type: string;
  at: string;
  conversationId: string;
  turnId: string;
  toolName?: string;
  success?: boolean;
  iteration?: number;
  maxIterations?: number;
  durationMs?: number;
  argsSummary?: string;
  resultSummary?: string;
  /** assistant.progress: the assistant's short narration for the iteration. */
  text?: string;
  itemCount?: number;
  providerId?: string;
  model?: string;
  response?: string;
  memoryUse?: AgentMemoryUse[];
  code?: string;
  retryAtMs?: number | null;
  /** context.usage: full prompt size of the last provider call, the known window and the estimated per-part breakdown. */
  contextTokens?: number;
  contextWindow?: number;
  contextBreakdown?: ContextBreakdown;
  /** context.usage: cache tokens of the last REAL provider call; absent on an interim estimate. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** context.usage: true when contextTokens/contextBreakdown are extrapolated since the last real call. */
  estimated?: boolean;
};

/** Public projection only; USER/SOUL text and filesystem paths never travel to the launcher. */
export type AgentProfileMetadata = {
  enabled: boolean; revision: string; audience: string; principal: string; workspace?: string;
  identity: { name: string; role?: string; emoji?: string; avatar?: string };
  files: Record<'SOUL' | 'IDENTITY' | 'USER', { status: string; truncated: false; digest?: string }>;
};

export type AgentChatProvider = {
  id: string;
  model: string | null;
  configured: boolean;
  available: boolean;
  retryAt?: string;
  issue?: string;
  reasoningEfforts?: ReasoningEffort[];
  models?: Array<{ id: string; reasoningEfforts?: ReasoningEffort[] }>;
};

/** A model that finished at least one turn in Agent Core without an error. */
export type VerifiedModel = { providerId: string; model: string; successfulTurns: number; lastSuccessAtMs: number };

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ReasoningChoice = 'auto' | ReasoningEffort;

export type AgentChatUiState = {
  conversations: AgentChatConversation[];
  /** Routes the owner can pin for a message; absent until the host answers. */
  providers?: AgentChatProvider[];
  verifiedModels?: VerifiedModel[];
  /** "auto" keeps automatic rotation; otherwise a route id from providers. */
  providerChoice?: string;
  modelChoice: string;
  reasoningChoice?: ReasoningChoice;
  /** True once the choice came from storage or an owner pick (labels the selected option "Terakhir dipakai"). */
  selectionSaved?: boolean;
  active?: AgentChatDetail;
  runningRequestId?: string;
  creating?: boolean;
  lastEvent?: AgentChatEvent;
  /** Bounded live preview only; canonical messages still come from the conversation store. */
  streaming?: AgentChatStreamPreview;
  /** Last tool steps of the current turn, built from the live event stream only (lost on reload). */
  activity?: AgentChatActivity[];
  /** Latest live context.usage of the active conversation (replaced by the persisted turn value after reload). */
  contextUsage?: AgentContextUsage;
  /** On-demand Input/Output of persisted steps, keyed `${turnId}:${seq}`. */
  stepDetails?: Record<string, StepDetailState>;
  /** Latest answer to a manual Compact request; the Inspector shows it only for the turn it belongs to. */
  compactResult?: AgentChatCompactResult;
  /** Entries of the composer "/" menu; absent until the host answers. */
  slashCommands?: SlashCommand[];
  error?: string;
  /** Skills page state. */
  skills?: { items: NativeSkillInfo[]; state: 'idle'|'loading'|'ready'|'error'; error?: string; pending: Record<string,boolean> };
};

export type AgentChatActivity = {
  id: string;
  /** Absent for a tool step; 'note' is assistant narration shown as a chat line, 'budget' the one-time step-limit warning. */
  kind?: 'note' | 'budget';
  text?: string;
  resultSummary?: string;
  toolName: string;
  iteration?: number;
  maxIterations?: number;
  status: 'running' | 'done' | 'failed';
  durationMs?: number;
  argsSummary?: string;
};

export const AGENT_ACTIVITY_LIMIT = 30;
let activitySequence = 0;

export type AgentChatStreamPreview = { conversationId: string; turnId: string; id: string; text: string };

export function reduceAgentStream(previous: AgentChatStreamPreview | undefined, event: AgentChatEvent): AgentChatStreamPreview | undefined {
  if (['assistant.final', 'turn.failed', 'turn.cancelled', 'turn.paused', 'turn.accepted'].includes(event.type)) {
    return previous?.conversationId === event.conversationId && previous.turnId === event.turnId ? undefined : previous;
  }
  if (event.type !== 'assistant.stream' || !event.stream) return previous;
  const stream = event.stream;
  if (stream.type === 'start') return { conversationId: event.conversationId, turnId: event.turnId, id: stream.id, text: '' };
  if (!previous || previous.id !== stream.id || previous.conversationId !== event.conversationId || previous.turnId !== event.turnId) return previous;
  if (stream.type === 'reset') return undefined;
  return stream.type === 'delta' ? { ...previous, text: (previous.text + stream.text).slice(0, 16_384) } : previous;
}

/** Folds one live turn event into the bounded Activity list; unrelated events return the same list. */
export function reduceAgentActivity(list: AgentChatActivity[], event: AgentChatEvent): AgentChatActivity[] {
  if (event.type === 'turn.accepted') return [];
  if (event.type === 'assistant.progress' && event.text) {
    return [...list, { id: 'step-' + (activitySequence += 1), kind: 'note' as const, text: event.text, toolName: '',
      iteration: event.iteration, maxIterations: event.maxIterations, status: 'done' as const }].slice(-AGENT_ACTIVITY_LIMIT);
  }
  if (event.type === 'agent.budget') {
    if (list.some(item => item.kind === 'budget')) return list;
    return [...list, { id: 'step-' + (activitySequence += 1), kind: 'budget' as const, toolName: '',
      iteration: event.iteration, maxIterations: event.maxIterations, status: 'done' as const }].slice(-AGENT_ACTIVITY_LIMIT);
  }
  if (event.type === 'tool.started' && event.toolName) {
    return [...list, { id: 'step-' + (activitySequence += 1), toolName: event.toolName, iteration: event.iteration,
      maxIterations: event.maxIterations, status: 'running' as const, argsSummary: event.argsSummary }]
      .slice(-AGENT_ACTIVITY_LIMIT);
  }
  if (event.type === 'tool.completed' && event.toolName) {
    let index = -1;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]!.status === 'running' && list[i]!.toolName === event.toolName) { index = i; break; }
    }
    if (index < 0) return list;
    const next = [...list];
    next[index] = { ...next[index]!, status: event.success === false ? 'failed' : 'done', durationMs: event.durationMs,
      ...(event.resultSummary ? { resultSummary: event.resultSummary } : {}) };
    return next;
  }
  return list;
}

export type AgentContextUsage = { conversationId: string; contextTokens: number; contextWindow?: number; contextBreakdown?: ContextBreakdown;
  iteration?: number; maxIterations?: number; cacheReadTokens?: number; cacheWriteTokens?: number; estimated?: boolean };

/** Context size to show for the active conversation: the live event if it belongs to it, else the last persisted turn value. */
export function selectContextUsage(chat?: AgentChatUiState): Omit<AgentContextUsage, 'conversationId'> | undefined {
  const active = chat?.active;
  if (!chat || !active) return undefined;
  if (chat.contextUsage && chat.contextUsage.conversationId === active.conversation.id) return chat.contextUsage;
  const last = [...active.turns].reverse().find(turn => turn.contextTokens !== undefined);
  return last ? { contextTokens: last.contextTokens!, ...(last.contextWindow !== undefined ? { contextWindow: last.contextWindow } : {}),
    ...(last.contextBreakdown ? { contextBreakdown: last.contextBreakdown } : {}),
    ...(last.cacheReadTokens !== undefined ? { cacheReadTokens: last.cacheReadTokens } : {}),
    ...(last.cacheWriteTokens !== undefined ? { cacheWriteTokens: last.cacheWriteTokens } : {}),
    ...(last.contextEstimated ? { estimated: true } : {}) } : undefined;
}

/**
 * Keeps the last context.usage (a snapshot of the latest prompt, not an accumulation); other events leave it unchanged.
 * The breakdown belongs to that one call: an event without it never inherits the previous one. cacheReadTokens/
 * cacheWriteTokens are the opposite: an interim estimate carries no fresh cache numbers, so the last real ones are
 * kept (same COALESCE the server store applies); `estimated` always overwrites, since it describes THIS value.
 */
export function reduceContextUsage(prev: AgentContextUsage | undefined, event: AgentChatEvent): AgentContextUsage | undefined {
  if (event.type !== 'context.usage' || typeof event.contextTokens !== 'number') return prev;
  const samePrompt = prev?.conversationId === event.conversationId;
  return { conversationId: event.conversationId, contextTokens: event.contextTokens,
    ...(typeof event.contextWindow === 'number' ? { contextWindow: event.contextWindow } : {}),
    ...(event.contextBreakdown ? { contextBreakdown: event.contextBreakdown } : {}),
    ...(event.iteration !== undefined ? { iteration: event.iteration } : {}),
    ...(event.maxIterations !== undefined ? { maxIterations: event.maxIterations } : {}),
    ...(event.cacheReadTokens !== undefined ? { cacheReadTokens: event.cacheReadTokens }
      : samePrompt && prev?.cacheReadTokens !== undefined ? { cacheReadTokens: prev.cacheReadTokens } : {}),
    ...(event.cacheWriteTokens !== undefined ? { cacheWriteTokens: event.cacheWriteTokens }
      : samePrompt && prev?.cacheWriteTokens !== undefined ? { cacheWriteTokens: prev.cacheWriteTokens } : {}),
    ...(event.estimated ? { estimated: true } : {}) };
}

export type WorkflowsSnapshot = {
  status: 'building' | 'ready' | 'stale' | 'error';
  fingerprint?: string;
  revision?: string;
  generatedAt?: string;
  checkedAt?: string;
  observedFingerprint?: string;
  sourceFiles?: number;
  nodes?: number;
  edges?: number;
  unknowns?: number;
  error?: string;
  html?: string;
  limitations: string[];
};

export type ProposalDocumentItem = {
  id: string; kind: 'skill' | 'skill-revision' | 'improvement' | 'guide'; title: string; path: string;
  status: string; revisionDigest: string; documentDigest?: string; updatedAt?: string;
  readStatus: 'available' | 'missing' | 'drift' | 'unavailable'; projection: 'external-docs' | 'legacy-runtime' | 'document';
};
export type ProposalDocumentList = { items: ProposalDocumentItem[]; guides: ProposalDocumentItem[]; warnings: string[] };
export type ProposalDocumentRead = ProposalDocumentItem & { text: string; decisionGuidance: string };

/** Mirrors the read-only /agent/task-changes response (src/rdc/checkpoints/task-changes.ts). */
export type TaskChangesDiff = {
  state: 'text' | 'truncated' | 'none' | 'binary' | 'too-large' | 'sensitive-not-shown' | 'budget' | 'unavailable';
  text?: string; additions?: number | null; deletions?: number | null; reason?: string;
};
export type TaskChangesApplied = {
  path: string; oldPath?: string; state: 'added' | 'modified' | 'deleted' | 'renamed' | 'unverified';
  attribution: 'checkpoint-baseline'; checkpointIds: string[]; invocationIds: string[]; otherCheckpointTasks: string[];
  before: { exists: boolean; size: number }; after: { exists: boolean; size: number | null }; diff: TaskChangesDiff;
};
export type TaskChangesExternal = {
  path: string; oldPath?: string; state: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted' | 'other';
  binary: boolean | null; additions: number | null; deletions: number | null;
  modifiedAfterTaskStart: boolean | null; attribution: 'unattributed';
};
export type TaskChangesRequest = {
  checkpointId: string; invocationId: string; at: string;
  paths: Array<{ path: string; afterwards: 'differs' | 'same' | 'unknown' }>;
};
export type TaskChanges = {
  taskId: string; generatedAt: string; checkpointCount: number; requests: TaskChangesRequest[];
  applied: { items: TaskChangesApplied[]; unchanged: number; truncated: boolean };
  external: { state: 'ok' | 'unavailable'; reason?: string; items: TaskChangesExternal[]; total: number; truncated: boolean };
};

export type LauncherWindowSize = { width: number; height: number; defaultWidth: number; defaultHeight: number; minWidth: number; minHeight: number; maxDimension: number };

/** Answer to {type:'agent-chat-compact', turnId}: the server compacts the running turn once at its next iteration. */
export type AgentChatCompactResult = { turnId: string; status: 'scheduled' | 'not-running' | 'unavailable' };

/** One entry of the composer "/" menu: an owner command or an active Skill. */
export type SlashCommand = { name: string; kind: 'command' | 'skill'; description: string };

export type DreamingStatus = {
  enabled: boolean; loopRunning: boolean; busy: boolean; intervalMs: number; loopError?: boolean;
  lastCycle?: { startedAt: string; completedAt: string; mode: 'preview' | 'applied'; planned: number | null;
    created: number | null; updated: number | null; failed: number | null; indexIssues: number | null; errors: number; reasons: Record<string, number> };
};
export type DreamingUiState = { state: 'idle' | 'loading' | 'running' | 'ready' | 'error'; data?: DreamingStatus; error?: string };

export type NativeSkillInfo = { name: string; description: string; digest: string; enabled: boolean };

type HostEnvelope =
  | { type: 'agent-dreaming-state'; result: DreamingStatus }
  | { type: 'agent-dreaming-error'; error: string }
  | { type: 'window-size-state'; requestId: string; size: LauncherWindowSize; warning?: string | null }
  | { type: 'window-size-error'; requestId: string; error: string; size: LauncherWindowSize }
  | { type: 'task-changes-result'; requestId: string; result: TaskChanges }
  | { type: 'task-changes-error'; requestId: string; error: string }
  | { type: 'proposals-result'; requestId: string; result: ProposalDocumentList }
  | { type: 'proposals-error'; requestId: string; error: string }
  | { type: 'proposal-read-result'; requestId: string; result: ProposalDocumentRead }
  | { type: 'proposal-read-error'; requestId: string; error: string }
  | { type: 'workflows-result'; requestId: string; result: WorkflowsSnapshot }
  | { type: 'workflows-error'; requestId: string; error: string }
  | { type: 'status'; status: DesktopStatus }
  | { type: 'snapshot'; snapshot: DesktopSnapshot }
  | { type: 'log'; entry: ActivityEntry }
  | { type: 'logs'; entries: ActivityEntry[] }
  | { type: 'activity-detail-result'; result: ActivityDetailPage }
  | { type: 'agent-result'; requestId: string; result?: AgentRunResult; error?: string }
  | { type: 'agent-chat-list-result'; result: { conversations?: AgentChatConversation[] } }
  | { type: 'agent-chat-providers-result'; result: { providers?: AgentChatProvider[]; verifiedModels?: VerifiedModel[]; /** Server-side last-used {providerId, model, reasoningEffort, updatedAtMs}. */ selection?: unknown } }
  | { type: 'agent-chat-state'; requestId?: string; result: AgentChatDetail }
  | { type: 'agent-chat-event'; requestId: string; conversationId?: string; envelope: { type: string; event?: AgentChatEvent; result?: unknown; error?: string } }
  | { type: 'agent-chat-step-result'; requestId: string; turnId: string; seq: number; result: StepDetailResult }
  | { type: 'agent-chat-cancel-result'; turnId: string; stopped: boolean }
  | ({ type: 'agent-chat-compact-result' } & AgentChatCompactResult)
  | { type: 'agent-chat-slash-commands-result'; result: { commands: SlashCommand[] } }
  | { type: 'agent-chat-pause-result'; turnId: string; paused: boolean }
  | { type: 'agent-chat-error'; requestId?: string; conversationId?: string; error: string }
  | { type: 'error'; message: string }
  | { type: 'agent-skills-result'; result: { skills: NativeSkillInfo[] } }
  | { type: 'agent-skills-error'; error: string }
  | { type: 'agent-skill-set-result'; name: string; enabled: boolean; ok: boolean; error?: string };

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
