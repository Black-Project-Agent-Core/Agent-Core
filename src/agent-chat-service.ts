import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { extractProfileDraft, isInterviewStart, parseOperatorIntroduction, type ProfileDraft, type ProfileFileName } from './agent-profile.js';
import { AgentProviderPoolPausedError, validateAgentReasoningEffort, validateAgentProviderModel, type AgentModelMessage } from './agent-provider.js';
import type { AgentReasoningEffort } from './agent-provider-state.js';
import type { ProviderModelTestReport } from './agent-provider-readiness.js';
import { normalizeNativeResultMetadata } from './agent-memory-evaluation.js';
import {
  parseAgentTurnCheckpoint,
  AGENT_TURN_ITERATION_WINDOW_FULL,
  AGENT_TURN_USER_PAUSED,
  serializeAgentTurnCheckpoint,
  verifyCheckpointArtifacts,
  type AgentTurnCheckpointState,
} from './agent-turn-checkpoint.js';
import {
  type NativeAgentTaskResult,
  NativeAgentController,
} from './agent-controller.js';
import { AgentRuntimeService } from './agent-runtime.js';
import type { ArtifactAuthorization } from './auth/artifact-authorization.js';
import {
  AgentChatStore,
  type AgentChatConversation,
  type AgentChatConversationDetail,
  type AgentChatExecutionClaim,
  type AgentChatTurn,
} from './agent-chat-store.js';
import { emitAgentTurnEvent, type AgentTurnEvent } from './agent-turn-events.js';
import { redactSensitiveString } from './security/redaction.js';
import { parseSlashSelection, type SlashSkillSelection } from './agent-slash-commands.js';
import type { NativeSkillSettings } from './native-skill-settings.js';
import {
  buildAttachmentReference,
  readAttachmentText,
  storeAttachments,
  type ChatAttachmentInput,
} from './agent-chat-attachments.js';

/** The slice of SkillService the composer "/" selection needs: active catalog names only. */
export interface SlashSkillCatalog {
  list(): Promise<Array<{ name: string }>>;
}

/** Per-turn directive for a Skill the user picked from the composer "/" menu. A choice, not a grant. */
export function userSelectedSkillDirective(skillName: string): string {
  return 'USER-SELECTED SKILL: the user explicitly chose the Skill ' + skillName
    + ' for this request. Inspect and read it completely with the skills tool (follow every nextOffset),'
    + ' apply its relevant steps and declare actual use. This is a user choice, not a grant: tool access is unchanged.';
}

function filterDisabled(names: readonly string[], settings?: NativeSkillSettings): string[] {
  if (!settings) return [...names];
  const disabled = new Set(settings.listDisabled());
  return names.filter(n => !disabled.has(n));
}

export interface AgentChatEventEnvelope extends AgentTurnEvent {
  conversationId: string;
  turnId: string;
  /** The idempotent client request that created the turn. */
  requestId?: string;
}

export type AgentChatEventSink = (
  event: AgentChatEventEnvelope,
) => void | Promise<void>;

export interface AgentChatTurnResult {
  agentProfile?: import('./agent-profile.js').AgentProfileMetadata;
  conversationId: string;
  turnId: string;
  taskId: string;
  status: AgentChatTurn['status'];
  response?: string;
  learningStatus?: NativeAgentTaskResult['learningStatus'];
  jobVerification?: NativeAgentTaskResult['jobVerification'];
  providerId?: string;
  model?: string;
  iterations?: number;
  retrievalAttemptIds?: string[];
  memoryUse?: NativeAgentTaskResult['memoryUse'];
  evaluation?: NativeAgentTaskResult['evaluation'];
  metrics?: NativeAgentTaskResult['metrics'];
  modelIdentity?: NativeAgentTaskResult['modelIdentity'];
  learnedLesson?: NativeAgentTaskResult['learnedLesson'];
  settingsDigest?: string;
  toolContractDigest?: string;
  replayed: boolean;
}
function titleFromPrompt(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  return compact.slice(0, 160) || 'New Chat';
}

function isRunningTaskConflict(error: unknown): boolean {
  return error instanceof Error && error.message === 'AGENT_RUNTIME_SESSION_HAS_RUNNING_TASK';
}

/**
 * How long a user-facing path (turn end, send, archive) waits for a task settle before it moves on. At the end of a
 * turn it bounds the finalization that follows the terminal write; the sweep before a send or an archive bounds the
 * whole settle.
 */
const SETTLE_WAIT_MS = 10_000;

/**
 * How long the end of a turn waits for the terminal write of a task: reading the task and markTerminal, which syncs
 * to disk. It is a bound of its own so that a short finalization bound can never cut the write short; the production
 * value is the same as SETTLE_WAIT_MS.
 */
const SETTLE_TERMINAL_WAIT_MS = SETTLE_WAIT_MS;

/** The two milestones of one task settle, shared by every caller that races for the task. Neither promise rejects. */
interface TaskSettle {
  /**
   * Settles when the terminal write is over: true when this settle ended the task, false when the task was not
   * running, the race to end it was lost, or the write failed.
   */
  readonly terminal: Promise<boolean>;
  /**
   * Settles when the whole settle is over: true when this settle ended the task and then attempted its
   * finalization.
   */
  readonly done: Promise<boolean>;
}

/** Waits for a promise at most `ms`; the work keeps running and later callers can still join it. */
async function waitAtMost<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
    timer.unref();
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

function safeErrorCode(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return (text.split(':', 1)[0] || 'AGENT_CHAT_TURN_FAILED')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .slice(0, 160);
}

function buildMemoryQuery(
  prompt: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): string {
  const recentUsers = history
    .filter(message => message.role === 'user')
    .slice(-3)
    .map(message => message.content.replace(/\s+/g, ' ').trim().slice(0, 1_200))
    .filter(Boolean);
  if (!recentUsers.length) return prompt;
  return [
    'CURRENT USER TURN',
    prompt,
    '',
    'RECENT USER THREAD CONTEXT',
    ...recentUsers.map((value, index) => (index + 1) + '. ' + value),
  ].join('\n').slice(0, 6_000);
}

function historyMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): AgentModelMessage[] {
  return history.map(message => ({
    role: message.role,
    content: message.content,
  }));
}
export class AgentChatService {
  readonly store: AgentChatStore;
  private readonly activeTurns = new Map<string, AbortController>();
  private readonly pauseRequestedTurns = new Set<string>();
  /** Manual "compact now" requests; consumed once by the controller at its next iteration. */
  private readonly compactionRequestedTurns = new Set<string>();
  /** One settle per runtime task, shared by every caller that races for it. */
  private readonly settlingTasks = new Map<string, TaskSettle>();
  private settleWaitMs = SETTLE_WAIT_MS;
  private settleTerminalWaitMs = SETTLE_TERMINAL_WAIT_MS;
  private readonly providerWaitTimers = new Map<string, NodeJS.Timeout>();
  private readonly providerTests = new Map<string, Promise<ProviderModelTestReport>>();
  private automaticRecoveryPaused = false;

  private constructor(
    store: AgentChatStore,
    private readonly runtime: AgentRuntimeService,
    private readonly controller: NativeAgentController,
    private readonly projectRoot: string,
    private readonly artifactAuthorization?: ArtifactAuthorization,
    /** Active Skill catalog used only to resolve a composer "/<skill>" selection; never cached. */
    private readonly skillCatalog?: SlashSkillCatalog,
    private readonly nativeSkillSettings?: NativeSkillSettings,
  ) {
    this.store = store;
  }

  static async initialize(
    projectRoot: string,
    runtime: AgentRuntimeService,
    controller: NativeAgentController,
    artifactAuthorization?: ArtifactAuthorization,
    skillCatalog?: SlashSkillCatalog,
    nativeSkillSettings?: NativeSkillSettings,
  ): Promise<AgentChatService> {
    const service = new AgentChatService(
      new AgentChatStore(
        path.join(projectRoot, 'runtime', 'agent-runtime', 'chat.sqlite'),
      ),
      runtime,
      controller,
      projectRoot,
      artifactAuthorization,
      skillCatalog,
      nativeSkillSettings,
    );
    await service.reconcileInterruptedTurns();
    return service;
  }

  /** Resolves "/<name> ..." against the live active catalog; any catalog failure means "no selection", never a failed turn. */
  private async resolveSlashSelection(prompt: string): Promise<SlashSkillSelection | null> {
    if (!this.skillCatalog || !prompt.trimStart().startsWith('/')) return null;
    try {
      const names = (await this.skillCatalog.list()).map(item => item.name);
      const filtered = filterDisabled(names, this.nativeSkillSettings);
      return parseSlashSelection(prompt, filtered);
    } catch (error) {
      console.error('AGENT_CHAT_SLASH_CATALOG_FAILED:' + safeErrorCode(error));
      return null;
    }
  }

  private async reconcileInterruptedTurns(): Promise<void> {
    // Startup parks checkpoints for explicit Continue; it never spends provider quota.
    this.store.recoverRunningTurns();
    // The turns interrupted just above, and any stopped or failed turn an earlier build left with a running
    // task, can never resume; settle those tasks so their sessions can be closed again.
    await this.settleOrphanedTasks();
  }

  private scheduleProviderResume(turnId: string, state: AgentTurnCheckpointState): void {
    const prior = this.providerWaitTimers.get(turnId);
    if (prior) clearTimeout(prior);
    this.providerWaitTimers.delete(turnId);
    if (this.automaticRecoveryPaused || this.pauseRequestedTurns.has(turnId) || !state.providerWait?.retryAtMs || state.providerAttemptsConsumed >= state.maxProviderAttempts
      || state.expiresAtMs <= Date.now() || (state.pendingTool?.mutating && state.pendingTool.phase === 'dispatching')) return;
    const timer = setTimeout(() => {
      this.providerWaitTimers.delete(turnId);
      void (async () => {
        if (this.automaticRecoveryPaused || this.store.getTurn(turnId)?.status !== 'resumable' || this.activeTurns.has(turnId)) return;
        await this.resumeTurn({ turnId, automatic: true });
      })().catch(error => {
        console.error('AGENT_CHAT_PROVIDER_RESUME_FAILED:' + safeErrorCode(error));
      });
    }, Math.max(1_000, Math.min(2_147_000_000, state.providerWait.retryAtMs - Date.now())));
    timer.unref();
    this.providerWaitTimers.set(turnId, timer);
  }

  pauseAutomaticRecovery(): void {
    this.automaticRecoveryPaused = true;
    for (const timer of this.providerWaitTimers.values()) clearTimeout(timer);
    this.providerWaitTimers.clear();
  }
  health() {
    return {
      status: 'available' as const,
      ...this.store.healthCounts(),
      runningTurnCount: this.activeTurns.size,
    };
  }

  listConversations(includeArchived = false): AgentChatConversation[] {
    return this.store.listConversations(includeArchived);
  }

  getConversation(conversationId: string): AgentChatConversationDetail | null {
    const detail = this.store.detail(conversationId);
    if (detail) detail.turns = detail.turns.map(turn => turn.status === 'running' && this.pauseRequestedTurns.has(turn.id) ? { ...turn, pauseRequested: true } : turn);
    return detail;
  }

  async readConversation(conversationId: string): Promise<AgentChatConversationDetail | null> {
    const detail = this.getConversation(conversationId);
    if (!detail) return null;
    const turn = detail.turns.find(item => item.id === detail.conversation.lastTurnId);
    if (!turn) return detail;
    try {
      detail.decisionEvidence = await this.runtime.getDecisionEvidence(turn.runtimeTaskId,
        detail.conversation.runtimeSessionId, detail.conversation.workspace);
    } catch {
      detail.decisionEvidence = { status: 'unavailable', taskId: turn.runtimeTaskId, records: [], truncated: false,
        attribution: 'controller-declared', goalVerification: 'not-established' };
    }
    return detail;
  }

  async createConversation(input: {
    workspace?: string;
    title?: string;
  } = {}): Promise<AgentChatConversationDetail> {
    const workspace = input.workspace?.trim().slice(0, 200) || 'agent-core';
    const session = await this.runtime.startSession();
    const conversationId = randomUUID();
    try {
      this.store.createConversation({
        conversationId,
        runtimeSessionId: session.id,
        workspace,
        title: input.title?.trim() || 'New Chat',
      });
      return this.store.detail(conversationId)!;
    } catch (error) {
      await this.runtime.closeSession(session.id).catch(() => undefined);
      throw error;
    }
  }

  private replayResult(turn: AgentChatTurn): AgentChatTurnResult {
    const detail = this.store.detail(turn.conversationId);
    const response = detail?.messages.find(message =>
      message.turnId === turn.id && message.role === 'assistant',
    )?.content;
    return {
      conversationId: turn.conversationId,
      turnId: turn.id,
      taskId: turn.runtimeTaskId,
      status: turn.status,
      ...normalizeNativeResultMetadata(turn),
      ...(response !== undefined ? { response } : {}),
      ...(turn.providerId ? { providerId: turn.providerId } : {}),
      ...(turn.model ? { model: turn.model } : {}),
      ...(turn.iterations !== undefined ? { iterations: turn.iterations } : {}),
      ...(turn.memoryUse ? { memoryUse: turn.memoryUse } : {}),
      replayed: true,
    };
  }
  /** Where attachment files live; derived from the project root this service already uses, never from the cwd. */
  private attachmentsDir(): string {
    return path.join(this.projectRoot, 'runtime', 'agent-runtime', 'attachments');
  }

  /** The USER ATTACHMENTS block of a turn, always rebuilt from the store and the stored files, so a resumed turn gets the same block as its first run. */
  private async attachmentReference(turnId: string): Promise<string | undefined> {
    const stored = this.store.listAttachments(turnId);
    if (stored.length === 0) return undefined;
    const baseDir = this.attachmentsDir();
    // The path lets Native open an image or binary file itself instead of searching the disk for it.
    const dir = baseDir.split(path.sep).join('/');
    const items = await Promise.all(stored.map(async item => ({
      ...item, path: `${dir}/${item.relPath}`, text: await readAttachmentText(baseDir, item),
    })));
    return buildAttachmentReference(items) || undefined;
  }

  /**
   * History lines for later turns: one per stored attachment, with the path of its file, so Native can reopen the
   * file with a file tool instead of receiving its content again. Built when history is read; never stored.
   */
  private attachmentHistoryNotes(conversationId: string): Map<string, string> {
    const dir = this.attachmentsDir().split(path.sep).join('/');
    const notes = new Map<string, string>();
    for (const [turnId, items] of this.store.listConversationAttachments(conversationId)) {
      notes.set(turnId, items.map(item =>
        `[lampiran: ${item.name} (${item.kind}, ${item.sizeBytes} bytes) path: ${dir}/${item.relPath}]`).join('\n'));
    }
    return notes;
  }

  private recordContextUsage(turnId: string, event: AgentTurnEvent, claim?: AgentChatExecutionClaim): void {
    if (event.type === 'agent.profile' && event.agentProfile) {
      this.store.recordAgentProfile(turnId, event.agentProfile, claim);
      return;
    }
    if (event.type === 'memory.recall.completed' && typeof event.itemCount === 'number') {
      this.store.recordRecallCount(turnId, event.itemCount);
      return;
    }
    if (event.type !== 'context.usage' || typeof event.contextTokens !== 'number') return;
    this.store.recordContextUsage(turnId, event.contextTokens, event.contextWindow,
      { iteration: event.iteration, maxIterations: event.maxIterations }, event.contextBreakdown,
      { cacheReadTokens: event.cacheReadTokens, cacheWriteTokens: event.cacheWriteTokens }, event.estimated === true);
  }
  /** Persists tool steps (Input/Output) and assistant narration for any turn; ancillary, so a write failure is logged briefly and never fails the turn. */
  private recordStep(turnId: string, event: AgentTurnEvent): void {
    if (event.type !== 'tool.started' && event.type !== 'tool.completed' && event.type !== 'assistant.progress') return;
    try {
      if (event.type === 'tool.started') this.store.startStep(turnId, event);
      else if (event.type === 'tool.completed') this.store.completeStep(turnId, event);
      else this.store.recordNarration(turnId, event);
    } catch (error) {
      console.error('[agent-chat] step record failed:', error instanceof Error ? error.message : 'unknown');
    }
  }

  /** Full masked Input/Output of one persisted tool step, or null. */
  readStepDetail(turnId: string, seq: number): import('./agent-chat-store.js').AgentChatStepDetail | null {
    return this.store.getStepDetail(turnId, seq);
  }
  private continuationHooks(input: {
    conversationId: string;
    turnId: string;
    claim: AgentChatExecutionClaim;
    revision: number;
    state?: AgentTurnCheckpointState;
  }) {
    let revision = input.revision;
    const hooks: {
      conversationId: string;
      turnId: string;
      state?: AgentTurnCheckpointState;
      save: (state: AgentTurnCheckpointState, phase: any, extras?: {
        compactionSources?: Array<{ id: string; sourceJson: string; sourceDigest: string }>;
      }) => Promise<void>;
      consumeCompactionRequest: () => boolean;
      readCompactionSource: (compactionId: string) => { sourceJson: string; sourceDigest: string } | null;
    } = {
      conversationId: input.conversationId,
      turnId: input.turnId,
      ...(input.state ? { state: input.state } : {}),
      consumeCompactionRequest: () => this.compactionRequestedTurns.delete(input.turnId),
      readCompactionSource: compactionId => this.store.getCompactionSource(input.turnId, compactionId),
      save: async (state, phase, extras) => {
        const serialized = serializeAgentTurnCheckpoint(state);
        const saved = this.store.saveCheckpoint({
          turnId: input.turnId,
          claim: input.claim,
          expectedRevision: revision,
          schemaVersion: serialized.state.schemaVersion,
          phase: String(phase),
          payloadJson: serialized.json,
          payloadDigest: serialized.digest,
          ...(extras?.compactionSources?.length ? { compactionSources: extras.compactionSources } : {}),
        });
        revision = saved.revision;
        hooks.state = serialized.state;
        const mutationInFlight = serialized.state.pendingTool?.mutating && serialized.state.pendingTool.phase === 'dispatching';
        if (this.pauseRequestedTurns.has(input.turnId) && !serialized.state.finalResult && !mutationInFlight) {
          throw new Error(AGENT_TURN_USER_PAUSED);
        }
      },
    };
    return hooks;
  }

  private async loadResumableCheckpoint(turn: AgentChatTurn): Promise<{
    state: AgentTurnCheckpointState;
    revision: number;
  }> {
    const record = this.store.getCheckpoint(turn.id);
    if (!record) throw new Error('AGENT_CHAT_CHECKPOINT_NOT_FOUND');
    const state = parseAgentTurnCheckpoint(record.payloadJson, record.payloadDigest);
    if (state.turnId !== turn.id
      || state.conversationId !== turn.conversationId
      || state.runtimeTaskId !== turn.runtimeTaskId) {
      throw new Error('AGENT_CHAT_CHECKPOINT_IDENTITY_MISMATCH');
    }
    await verifyCheckpointArtifacts(
      state,
      path.join(this.projectRoot, 'runtime', 'tool-results'),
    );
    // A mutating call cut off while dispatching no longer blocks Continue: the controller answers it as interrupted and
    // never runs it again. Only the owner's Continue gets here; automatic recovery still skips such a turn (see above).
    return { state, revision: record.revision };
  }

  private async finalizeTurnWithSkillReceipt(input: Parameters<AgentChatStore['finalizeTurn']>[0], skipRuntimeNotice = false) {
    this.store.finalizeTurn(input);
    const turn = this.store.getTurn(input.turnId);
    if (turn && !skipRuntimeNotice) {
      try {
        await this.runtime.recordNativeSkillNoticeInclusion?.(turn.runtimeTaskId, input.response);
        await this.runtime.recordNativeCapabilityNoticeInclusion?.(turn.runtimeTaskId,input.response);
      } catch (error) {
        console.error('AGENT_CHAT_NOTICE_RECEIPT_FAILED:' + safeErrorCode(error));
      }
    }
  }

  /** What the owner needs to pick a route: stable id, model and whether it can answer now. Never keys or URLs. */
  listProviders(): Array<{ id: string; model: string | null; configured: boolean; available: boolean; retryAt?: string; issue?: string; reasoningEfforts?: AgentReasoningEffort[]; models?: Array<{ id: string; reasoningEfforts: AgentReasoningEffort[] }> }> {
    const routes = (this.runtime as any).providerHealth?.()?.routes ?? [];
    return routes.map((route: any) => ({
      id: String(route.id),
      model: typeof route.model === 'string' ? route.model : null,
      configured: route.configured === true,
      ...(route.id === 'anthropic' ? { reasoningEfforts: route.reasoningEfforts ?? [] } : {}),
      ...(route.id === 'anthropic' ? { models: route.models ?? [] } : {}),
      available: route.configured === true && (route.activeKeyCount ?? route.keyCount ?? 0) > 0 && route.breakerState !== 'OPEN',
      ...(typeof route.nextAvailableAt === 'string' && route.configured === true && route.breakerState === 'OPEN' ? { retryAt: route.nextAvailableAt } : {}),
      ...(typeof route.issue === 'string' && route.configured !== true ? { issue: route.issue } : {}),
    }));
  }

  /** Owner's release of one listed route's locked credentials. Returns the count only, never ids or keys. */
  resetProviderCredentials(providerId: string): number {
    if (!this.listProviders().some(route => route.id === providerId)) throw new Error('AGENT_CHAT_PROVIDER_UNKNOWN');
    return this.runtime.resetProviderCredentials(providerId);
  }

  /** The owner's last provider/model/effort, persisted in chat.sqlite so it survives Core restarts. */
  getLastSelection() { return this.store.getLastSelection(); }

  /** The models the Router page registers: proven by a finished turn. Never keys or URLs. */
  listVerifiedModels() { return this.store.listVerifiedModels(); }

  /**
   * Records an owner pick (before any send) so a restart keeps it. Rejects what a send would reject,
   * but keeps an effort the model does not support: the saved choice is never rewritten to the effective one.
   */
  recordOwnerSelection(input: { providerId?: unknown; model?: unknown; reasoningEffort?: unknown }) {
    const providerId = input.providerId === undefined || input.providerId === 'auto' ? undefined : input.providerId;
    if (providerId !== undefined && (typeof providerId !== 'string' || !this.listProviders().some(route => route.id === providerId))) {
      throw new Error('AGENT_CHAT_PROVIDER_UNKNOWN');
    }
    const model = input.model === undefined || input.model === '' ? undefined : input.model;
    if (model !== undefined) this.validateProviderModel(model, providerId as string | undefined);
    const effort = input.reasoningEffort === undefined || input.reasoningEffort === 'auto' ? undefined : input.reasoningEffort;
    if (effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort as string)) {
      throw new Error('AGENT_CHAT_REASONING_EFFORT_INVALID');
    }
    return this.store.recordLastSelection({ providerId: providerId as string | undefined, model: model as string | undefined, reasoningEffort: effort as string | undefined });
  }

  /** Resolves the catalog levels of models that have not run a turn yet; a slow provider delays the list by at most the bound. */
  async refreshProviderCapabilities(): Promise<void> {
    const boundMs = 5_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve((this.runtime as any).refreshModelCapabilities?.()).catch(() => undefined),
        new Promise<void>(resolve => { timer = setTimeout(resolve, boundMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }

  /**
   * Owner key test from the Router page: lists the models each key of one listed route can see. One test per route
   * runs at a time; a second request joins it. Throws AGENT_CHAT_PROVIDER_UNKNOWN for a route the picker does not list.
   */
  async testProvider(providerId: unknown): Promise<ProviderModelTestReport> {
    if (typeof providerId !== 'string' || !this.listProviders().some(route => route.id === providerId)) throw new Error('AGENT_CHAT_PROVIDER_UNKNOWN');
    const running = this.providerTests.get(providerId);
    if (running) return running;
    const work = Promise.resolve((this.runtime as any).testProviderModels?.(providerId) as Promise<ProviderModelTestReport> | null | undefined)
      .then(report => { if (!report) throw new Error('AGENT_CHAT_PROVIDER_UNKNOWN'); return report; })
      .finally(() => this.providerTests.delete(providerId));
    this.providerTests.set(providerId, work);
    return work;
  }

  validateProviderModel(value: unknown, providerRoute?: string): void {
    validateAgentProviderModel(value, providerRoute, this.listProviders().find(route => route.id === providerRoute)?.models?.map(model => model.id) ?? []);
  }

  /** The interview directive stays on while a bare `/perkenalan` is among the 12 messages up to this turn's own prompt. */
  private profileInterviewActive(conversationId: string, turnId: string): boolean {
    const messages = this.store.messagesForConversation(conversationId);
    const at = messages.findIndex(message => message.turnId === turnId && message.role === 'user');
    return messages.slice(Math.max(0, at - 11), at + 1).some(message => message.role === 'user' && isInterviewStart(message.content));
  }

  /**
   * `/perkenalan simpan`: drafts come only from finalized assistant messages after the latest bare `/perkenalan`, and each is
   * bound to the profile revision its own turn saw, so a file edited since the draft is refused instead of overwritten.
   */
  private async saveInterviewDrafts(conversation: { id: string; workspace?: string | undefined }, files: readonly ProfileFileName[]) {
    const messages = this.store.messagesForConversation(conversation.id);
    let start = -1;
    messages.forEach((message, index) => { if (message.role === 'user' && isInterviewStart(message.content)) start = index; });
    const drafts: ProfileDraft[] = [];
    const notes: string[] = [];
    for (const name of files) {
      let message: (typeof messages)[number] | undefined;
      for (let index = messages.length - 1; index > start && start >= 0 && !message; index--) {
        const candidate = messages[index]!;
        if (candidate.role === 'assistant' && extractProfileDraft(candidate.content, name) !== undefined) message = candidate;
      }
      if (!message) { if (files.length === 1) notes.push(name + '.md: belum ada draf berlabel ' + name + '.md setelah /perkenalan terakhir di percakapan ini.'); continue; }
      const seen = this.store.getTurn(message.turnId)?.agentProfile?.files[name];
      if (!seen || (seen.status !== 'read' && seen.status !== 'absent')) {
        notes.push(name + '.md tidak disimpan: revisi berkas saat draf dibuat tidak dapat dipastikan; minta draf baru.');
        continue;
      }
      drafts.push({ name, content: extractProfileDraft(message.content, name)!, expectedDigest: seen.status === 'read' ? seen.digest : undefined });
    }
    if (!drafts.length && !notes.length) notes.push('Belum ada draf berlabel setelah /perkenalan terakhir di percakapan ini. Ketik /perkenalan dulu.');
    const saved = await this.controller.saveProfileDrafts(drafts, conversation.workspace);
    return { ...saved, response: [...notes, saved.response].filter(Boolean).join('\n') };
  }

  validateReasoningEffort(value: unknown, providerRoute?: string, providerModel?: string): void {
    if (value === undefined) return;
    const route = this.listProviders().find(route => route.id === providerRoute);
    const selectedEfforts = providerModel ? route?.models?.find(model => model.id === providerModel)?.reasoningEfforts : undefined;
    validateAgentReasoningEffort(value, providerRoute, providerModel
      ? selectedEfforts?.length ? selectedEfforts : undefined : route?.reasoningEfforts ?? []);
  }

  async runTurn(input: {
    conversationId: string;
    clientRequestId: string;
    prompt: string;
    messageOrigin?: 'local-operator' | 'external-controller';
    goalMode?: boolean;
    planMode?: boolean;
    /** Validated by the HTTP route (validateAttachmentInputs); only the owner's UI may attach files. */
    attachments?: ChatAttachmentInput[];
    /** Owner-chosen route id from listProviders(); omitted means automatic rotation. */
    providerRoute?: string;
    providerModel?: string;
    reasoningEffort?: AgentReasoningEffort;
    eventSink?: AgentChatEventSink;
    evaluation?: NativeAgentTaskResult['evaluation'];
  }): Promise<AgentChatTurnResult> {
    const introduction = parseOperatorIntroduction(input.prompt);
    // Unknown origins are not an operator. Refuse before replay, profile access, or persistence.
    if (introduction && input.messageOrigin !== 'local-operator') throw new Error('AGENT_PROFILE_OWNER_REQUIRED');
    if (introduction && input.attachments?.length) throw new Error('AGENT_PROFILE_TEXT_ONLY');
    const persistedPrompt = introduction ? '/perkenalan' + (introduction.preferences ? ' [preferensi operator]' : '')
      + (introduction.save ? ' simpan ' + (introduction.save.length > 1 ? 'semua' : introduction.save[0]!.toLowerCase()) : '') : input.prompt;
    const replay = (turn: AgentChatTurn) => {
      if (input.messageOrigin !== 'local-operator' && this.store.messagesForConversation(turn.conversationId)
        .some(message => message.turnId === turn.id && message.role === 'user' && parseOperatorIntroduction(message.content)))
        throw new Error('AGENT_PROFILE_OWNER_REQUIRED');
      return this.replayResult(turn);
    };
    // The route already refuses this; the owner of the rule refuses it too, before any turn exists.
    if (input.attachments?.length && input.messageOrigin === 'external-controller') {
      throw new Error('AGENT_CHAT_ATTACHMENTS_NOT_ALLOWED');
    }
    const existing = this.store.getTurnByClientRequestId(input.clientRequestId);
    if (existing) {
      if (existing.conversationId !== input.conversationId || existing.reasoningEffort !== input.reasoningEffort
        || existing.requestedModel !== input.providerModel || Boolean(existing.goalMode) !== Boolean(input.goalMode)
        || Boolean(existing.planMode) !== Boolean(input.planMode)) {
        throw new Error('AGENT_CHAT_CLIENT_REQUEST_CONFLICT');
      }
      return replay(existing);
    }
    // A bare `/perkenalan` is a model interview when a provider can answer and the profile is readable; otherwise the static host reply.
    const interview = introduction !== undefined && introduction.preferences === undefined && introduction.save === undefined
      && await this.controller.profileInterviewReady(this.store.getConversation(input.conversationId)?.workspace);
    const hostCommand = introduction !== undefined && !interview;
    const providerRoute = input.providerRoute?.trim() || undefined;
    if (!hostCommand) this.validateProviderModel(input.providerModel, providerRoute);
    if (!hostCommand) this.validateReasoningEffort(input.reasoningEffort, providerRoute, input.providerModel);
    if (!hostCommand && providerRoute && !this.listProviders().some(route => route.id === providerRoute && route.configured)) {
      throw new Error('AGENT_CHAT_PROVIDER_ROUTE_UNKNOWN');
    }

    const conversation = this.store.getConversation(input.conversationId);
    if (!conversation || conversation.status !== 'active') {
      throw new Error('AGENT_CHAT_CONVERSATION_NOT_ACTIVE');
    }
    // Explicit artifact decisions are authenticated local-chat commands, not model tasks.
    // Do not make a Native model/provider session a prerequisite to operator approval.
    const localOperator = (input.messageOrigin ?? 'local-operator') === 'local-operator';
    const artifactOperatorCommand = localOperator && this.artifactAuthorization?.isOperatorCommand(input.prompt) === true;
    if (!hostCommand && !artifactOperatorCommand) await this.ensureConversationSession(conversation.id, conversation.runtimeSessionId);
    if (!hostCommand && !artifactOperatorCommand && conversation.preferredProviderId) {
      this.runtime.setProviderAffinity(
        conversation.runtimeSessionId,
        conversation.preferredProviderId,
      );
    }

    const turnId = randomUUID();
    const taskId = randomUUID();
    const userMessageId = randomUUID();
    const executorToken = randomUUID();
    const begun = this.store.beginTurn({
      conversationId: conversation.id,
      turnId,
      clientRequestId: input.clientRequestId,
      runtimeTaskId: taskId,
      userMessageId,
      prompt: persistedPrompt,
      executorToken,
      messageOrigin: localOperator ? 'local-operator' : 'external-controller',
      reasoningEffort: input.reasoningEffort,
      requestedModel: input.providerModel,
      goalMode: input.goalMode,
      planMode: input.planMode,
    });
    if (!begun.created) return replay(begun.turn);
    // Only the local owner's pick is the "last used" selection; external controllers must not move it.
    if (localOperator && !introduction) {
      try {
        this.store.recordLastSelection({ providerId: providerRoute, model: input.providerModel, reasoningEffort: input.reasoningEffort });
      } catch (error) { console.error('AGENT_CHAT_SELECTION_RECORD_FAILED:' + safeErrorCode(error)); }
    }
    if (!begun.claim) throw new Error('AGENT_CHAT_EXECUTION_STATE_MISSING');
    const claim = begun.claim;
    const continuation = this.continuationHooks({
      conversationId: conversation.id,
      turnId,
      claim,
      revision: 0,
    });
    this.store.setTitleFromPrompt(conversation.id, titleFromPrompt(persistedPrompt));
    const attachmentNotes = this.attachmentHistoryNotes(conversation.id);
    const boundedContext = this.store.boundedContext({
      conversationId: conversation.id,
      excludeTurnId: turnId,
      maxMessages: 24,
      maxChars: 48_000,
      ...(attachmentNotes.size ? { attachmentNotes } : {}),
    });
    const history = boundedContext.messages;
    const controller = new AbortController();
    this.activeTurns.set(turnId, controller);

    let iterationLimitReport: string | undefined;
    const emit = (event: AgentTurnEvent) => {
      if (event.type === 'turn.failed' && event.code === 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED'
        && typeof event.response === 'string') iterationLimitReport = redactSensitiveString(event.response.slice(0, 4_000));
      return emitAgentTurnEvent(value => input.eventSink?.({
        ...value,
        conversationId: conversation.id,
        turnId,
        requestId: input.clientRequestId,
      }), event);
    };

    let result: NativeAgentTaskResult;
    try {
      // Files are persisted before any model call; the reference block is then built from the store, exactly as a resume does.
      if (input.attachments?.length) {
        this.store.insertAttachments(turnId, conversation.id, await storeAttachments({
          baseDir: this.attachmentsDir(), conversationId: conversation.id, turnId, inputs: input.attachments,
        }));
      }
      const attachmentReference = await this.attachmentReference(turnId);
      // Composer "/<skill>" pick: the persisted user message stays exactly as typed; only this turn gets a directive.
      const slashSkill = localOperator && !introduction ? await this.resolveSlashSelection(input.prompt) : null;
      // The user message was persisted by beginTurn above. Tool output cannot enter this host-only path.
      // Only a freshly persisted real user message enters artifact operator commands.
      // No MCP tool, Memory record, or model output may invoke this host authority.
      const introductionReply = introduction && !interview
        ? introduction.save ? await this.saveInterviewDrafts(conversation, introduction.save)
          : await this.controller.operatorIntroduction(introduction.preferences, conversation.workspace)
        : undefined;
      const artifactReply = introductionReply ? introductionReply.response
        : localOperator ? await this.artifactAuthorization?.operatorCommand(input.prompt, {
        workspace: conversation.workspace ?? 'agent-core', conversationId: conversation.id,
        userMessageId, persistedUserMessage: true,
      }) : undefined;
      const proposalPromotion = localOperator && artifactReply === undefined ? await this.runtime.prepareNativeProposalPromotion?.({
        prompt: input.prompt, workspace: conversation.workspace ?? 'agent-core', sessionId: conversation.runtimeSessionId,
        history: history.map(message => ({ role: message.role, content: message.content ?? '' })),
      }) : undefined;
      const skillDecision = localOperator && artifactReply === undefined ? await this.runtime.applyUserSkillCommand?.({ workspace: conversation.workspace ?? 'agent-core',
        sessionId: conversation.runtimeSessionId, taskId, userEvidenceRef: 'user-message:' + userMessageId,
        ...(proposalPromotion?.skillCommand && proposalPromotion.binding ? { expectedProposal: {
          id: proposalPromotion.binding.id, revisionDigest: proposalPromotion.binding.revisionDigest,
        } } : {}),
        prompt: proposalPromotion?.skillCommand ?? input.prompt }) : undefined;
      result = artifactReply !== undefined ? {
        sessionId: conversation.runtimeSessionId, taskId, response: artifactReply,
        ...(introductionReply?.agentProfile ? { agentProfile: introductionReply.agentProfile } : {}),
        status: 'finalized', iterations: 0, retrievalAttemptIds: [],
      } : skillDecision ? await this.runtime.completeUserSkillDecision({ workspace: conversation.workspace ?? 'agent-core',
        sessionId: conversation.runtimeSessionId, taskId, prompt: input.prompt }, skillDecision) : await this.controller.runConversationTurn({
        sessionId: conversation.runtimeSessionId,
        taskId,
        prompt: input.prompt,
        workspace: conversation.workspace,
        profileAudience: input.messageOrigin === 'local-operator' ? 'owner-private'
          : input.messageOrigin === 'external-controller' ? 'external' : 'unknown',
        ...(providerRoute ? { providerRoute } : {}),
        ...(input.providerModel ? { providerModel: input.providerModel } : {}),
        ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
        history: historyMessages(history),
        ...(boundedContext.summary ? { historySummary: boundedContext.summary } : {}),
        memoryQuery: buildMemoryQuery(input.prompt, history),
        ...(localOperator && this.profileInterviewActive(conversation.id, turnId) ? { profileInterview: true } : {}),
        ...(slashSkill ? { userSelectedSkillDirective: userSelectedSkillDirective(slashSkill.skill) } : {}),
        ...(attachmentReference ? { attachmentReference } : {}),
        ...(proposalPromotion ? { proposalPromotion } : {}),
        ...(input.goalMode ? { goalMode: true } : {}),
        ...(input.planMode ? { planMode: true } : {}),
        eventSink: event => { this.recordContextUsage(continuation.turnId, event, claim); this.recordStep(continuation.turnId, event); return event.type === 'assistant.final' ? undefined : emit(event); },
        signal: controller.signal,
        continuation,
        ...(input.evaluation ? { evaluation: input.evaluation } : {}),
      });
      if (continuation.state?.finalResult) {
        await continuation.save(continuation.state, 'chat-commit-pending');
      }
      if (artifactReply !== undefined) {
        // Operator commands do not create a Native model task or Skill receipt.
        this.store.finalizeTurn({
          turnId, assistantMessageId: randomUUID(), response: result.response,
          iterations: 0, retrievalCount: 0, claim,
          ...(result.agentProfile ? { metadata: { agentProfile: result.agentProfile } } : {}),
        });
      } else await this.finalizeTurnWithSkillReceipt({
        turnId,
        assistantMessageId: randomUUID(),
        response: result.response,
        ...(result.providerId ? { providerId: result.providerId } : {}),
        ...(result.model ? { model: result.model } : {}),
        iterations: result.iterations,
        retrievalCount: result.retrievalAttemptIds.length,
        memoryUse: result.memoryUse,
        metadata: result,
        claim,
      });
      const persisted = this.replayResult(this.store.getTurn(turnId)!);
      await emit({ type: 'assistant.final', at: new Date().toISOString(), response: persisted.response, memoryUse: persisted.memoryUse, modelIdentity: persisted.modelIdentity });
      return {
        ...persisted,
        learningStatus: result.learningStatus,
        jobVerification: result.jobVerification,
        retrievalAttemptIds: result.retrievalAttemptIds,
        ...(result.evaluation ? { evaluation: result.evaluation } : {}),
        ...(result.metrics ? { metrics: result.metrics } : {}),
        ...(result.learnedLesson ? { learnedLesson: result.learnedLesson } : {}),
        ...(result.settingsDigest ? { settingsDigest: result.settingsDigest, toolContractDigest: result.toolContractDigest } : {}),
        replayed: false,
      };
    } catch (error) {
      const stopped = controller.signal.aborted
        || (error instanceof Error && error.message === 'AGENT_RUNTIME_TURN_STOPPED');
      const currentTurn = this.store.getTurn(turnId);
      if (currentTurn?.status !== 'stopped') {
        const message = this.pauseRequestedTurns.has(turnId) && error instanceof AgentProviderPoolPausedError
          ? AGENT_TURN_USER_PAUSED : error instanceof Error ? error.message : String(error);
        if (message.startsWith('AGENT_RUNTIME_CONTINUATION_')) {
          this.store.releaseResumeClaim(turnId, claim, message === AGENT_TURN_USER_PAUSED ? message : safeErrorCode(error));
        } else {
          this.store.failTurn({
            turnId,
            status: stopped ? 'stopped' : 'failed',
            errorCode: stopped ? 'AGENT_RUNTIME_TURN_STOPPED' : safeErrorCode(error),
            ...(!stopped && message === 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED' && iterationLimitReport
              ? { failureResponse: iterationLimitReport } : {}),
            claim,
          });
          if (!stopped && message === 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED' && iterationLimitReport) {
            await emit({ type: 'assistant.final', at: new Date().toISOString(), success: false,
              code: message, response: this.replayResult(this.store.getTurn(turnId)!).response });
          }
        }
      }
      const parkedCode = this.store.getTurn(turnId)?.errorCode;
      if (!stopped && (parkedCode === AGENT_TURN_USER_PAUSED || parkedCode === AGENT_TURN_ITERATION_WINDOW_FULL)) {
        return { ...this.replayResult(this.store.getTurn(turnId)!), replayed: false };
      }
      if (!stopped && error instanceof AgentProviderPoolPausedError && continuation.state) {
        this.scheduleProviderResume(turnId, continuation.state);
        return { ...this.replayResult(this.store.getTurn(turnId)!), replayed: false };
      }
      throw error;
    } finally {
      // Only drop the registration this executor made; a newer executor of the same turn keeps its own.
      if (this.activeTurns.get(turnId) === controller) this.activeTurns.delete(turnId);
      if (this.store.getTurn(turnId)?.status !== 'resumable') this.pauseRequestedTurns.delete(turnId);
      this.compactionRequestedTurns.delete(turnId);
      await this.settleIfEnded(turnId);
    }
  }

  private recoveredFinalResult(
    state: AgentTurnCheckpointState,
    task: Awaited<ReturnType<AgentRuntimeService['getTask']>>,
  ): AgentTurnCheckpointState['finalResult'] | null {
    if (state.finalResult) return state.finalResult;
    if (!task || task.status !== 'finalized') return null;
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const message = state.messages[index]!;
      if (message.role !== 'assistant' || !message.tool_calls?.length) continue;
      for (let callIndex = message.tool_calls.length - 1; callIndex >= 0; callIndex -= 1) {
        const call = message.tool_calls[callIndex]!;
        if (call.function.name !== 'agent_core_finalize') continue;
        try {
          const parsed = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
          const response = typeof parsed.finalResponse === 'string'
            ? parsed.finalResponse.slice(0, 200_000) : '';
          if (!response) continue;
          return {
            response,
            ...(state.providerId ? { providerId: state.providerId } : {}),
            ...(state.model ? { model: state.model } : {}),
            iterations: Math.max(1, Math.min(state.maxIterations, state.nextIteration)),
            retrievalAttemptIds: [...task.retrievalAttemptIds],
            memoryUse: task.memoryUse,
            modelIdentity: task.modelIdentity,
          };
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  async resumeTurn(input: {
    turnId: string;
    eventSink?: AgentChatEventSink;
    automatic?: boolean;
  }): Promise<AgentChatTurnResult> {
    const turn = this.store.getTurn(input.turnId);
    if (!turn) throw new Error('AGENT_CHAT_TURN_NOT_FOUND');
    if (turn.status !== 'resumable') throw new Error('AGENT_CHAT_TURN_NOT_RESUMABLE');
    if (input.automatic && this.pauseRequestedTurns.has(turn.id)) return { ...this.replayResult(turn), replayed: false };
    if (!input.automatic) this.pauseRequestedTurns.delete(turn.id);
    if (this.automaticRecoveryPaused) return { ...this.replayResult(turn), replayed: false };
    const conversation = this.store.getConversation(turn.conversationId);
    if (!conversation || conversation.status !== 'active') {
      throw new Error('AGENT_CHAT_CONVERSATION_NOT_ACTIVE');
    }

    const loaded = await this.loadResumableCheckpoint(turn);
    if (this.pauseRequestedTurns.has(turn.id)) return { ...this.replayResult(turn), replayed: false };
    if (loaded.state.reasoningEffort !== turn.reasoningEffort || loaded.state.providerModel !== turn.requestedModel) throw new Error('AGENT_RUNTIME_CONTINUATION_IDENTITY_MISMATCH');
    if (this.automaticRecoveryPaused) return { ...this.replayResult(turn), replayed: false };
    if (loaded.state.providerWait && (loaded.state.providerAttemptsConsumed >= loaded.state.maxProviderAttempts
      || (loaded.state.providerWait.retryAtMs !== null && loaded.state.providerWait.retryAtMs > Date.now()))) {
      this.scheduleProviderResume(turn.id, loaded.state);
      return { ...this.replayResult(turn), replayed: false };
    }
    const pendingTimer = this.providerWaitTimers.get(turn.id);
    if (pendingTimer) clearTimeout(pendingTimer);
    this.providerWaitTimers.delete(turn.id);
    const executorToken = randomUUID();
    const claim = this.store.claimResumableTurn({
      turnId: turn.id,
      expectedRevision: loaded.revision,
      executorToken,
    });
    const continuation = this.continuationHooks({
      conversationId: conversation.id,
      turnId: turn.id,
      claim,
      revision: loaded.revision,
      state: loaded.state,
    });
    if (loaded.state.providerId) {
      this.runtime.setProviderAffinity(
        conversation.runtimeSessionId,
        loaded.state.providerId,
      );
    }

    const controller = new AbortController();
    this.activeTurns.set(turn.id, controller);
    let iterationLimitReport: string | undefined;
    const emit = (event: AgentTurnEvent) => {
      if (event.type === 'turn.failed' && event.code === 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED'
        && typeof event.response === 'string') iterationLimitReport = redactSensitiveString(event.response.slice(0, 4_000));
      return emitAgentTurnEvent(value => input.eventSink?.({
        ...value,
        conversationId: conversation.id,
        turnId: turn.id,
        requestId: turn.clientRequestId,
      }), event);
    };

    try {
      const runtimeTask = await this.runtime.getTask(turn.runtimeTaskId);
      if (this.automaticRecoveryPaused) {
        this.store.releaseResumeClaim(turn.id, claim, 'AGENT_CHAT_AUTOMATIC_RECOVERY_PAUSED');
        return { ...this.replayResult(this.store.getTurn(turn.id)!), replayed: false };
      }
      const recovered = this.recoveredFinalResult(loaded.state, runtimeTask);
      if (recovered && runtimeTask && ['finalized', 'finalization-failed'].includes(runtimeTask.status)) {
        recovered.response=await this.runtime.appendNativeCapabilityNotice?.(turn.runtimeTaskId,recovered.response) ?? recovered.response;
        const commitState: AgentTurnCheckpointState = {
          ...loaded.state,
          pendingTool: undefined,
          finalResult: recovered,
          updatedAtMs: Date.now(),
        };
        await continuation.save(commitState, 'chat-commit-pending');
        await this.finalizeTurnWithSkillReceipt({
          turnId: turn.id,
          assistantMessageId: randomUUID(),
          response: recovered.response,
          ...(recovered.providerId ? { providerId: recovered.providerId } : {}),
          ...(recovered.model ? { model: recovered.model } : {}),
          iterations: recovered.iterations,
          retrievalCount: recovered.retrievalAttemptIds.length,
          memoryUse: recovered.memoryUse,
          metadata: { ...recovered, metrics: runtimeTask.metrics, modelIdentity: runtimeTask.modelIdentity,
            ...(loaded.state.memoryEvaluation ? { evaluation: loaded.state.memoryEvaluation } : {}) },
          claim,
        });
        const persisted = this.replayResult(this.store.getTurn(turn.id)!);
        await emit({ type: 'assistant.final', at: new Date().toISOString(), response: persisted.response, memoryUse: persisted.memoryUse, modelIdentity: persisted.modelIdentity });
        return {
          ...persisted,
          learningStatus: recovered.learningStatus,
          jobVerification: recovered.jobVerification,
          retrievalAttemptIds: recovered.retrievalAttemptIds,
          ...(loaded.state.memoryEvaluation ? { evaluation: loaded.state.memoryEvaluation } : {}),
          metrics: runtimeTask.metrics,
          replayed: false,
        };
      }

      // Rebuilt from the store and the stored files, never from the first request: the block the first run saw.
      const attachmentReference = await this.attachmentReference(turn.id);
      const proposalPromotion = loaded.state.proposalPromotionBinding ? await this.runtime.prepareNativeProposalPromotion?.({
        prompt: loaded.state.prompt, workspace: loaded.state.workspace ?? conversation.workspace ?? 'agent-core',
        sessionId: conversation.runtimeSessionId, expectedBinding: loaded.state.proposalPromotionBinding,
      }) : undefined;
      // No model/tool execution against a silently changed source. Commit-only terminal recovery above remains valid.
      if (loaded.state.proposalPromotionBinding && proposalPromotion?.status !== 'selected')
        throw new Error('AGENT_RUNTIME_PROPOSAL_BINDING_STALE');
      const result = await this.controller.runConversationTurn({
        sessionId: conversation.runtimeSessionId,
        taskId: turn.runtimeTaskId,
        prompt: loaded.state.prompt,
        workspace: loaded.state.workspace ?? conversation.workspace,
        profileAudience: turn.messageOrigin === 'local-operator' ? 'owner-private'
          : turn.messageOrigin === 'external-controller' ? 'external' : 'unknown',
        ...(turn.messageOrigin === 'local-operator' && this.profileInterviewActive(conversation.id, turn.id) ? { profileInterview: true } : {}),
        ...(attachmentReference ? { attachmentReference } : {}),
        ...(proposalPromotion ? { proposalPromotion } : {}),
        ...(turn.goalMode ? { goalMode: true } : {}),
        ...(turn.planMode ? { planMode: true } : {}),
        eventSink: event => { this.recordContextUsage(continuation.turnId, event, claim); this.recordStep(continuation.turnId, event); return event.type === 'assistant.final' ? undefined : emit(event); },
        signal: controller.signal,
        continuation,
        ...(loaded.state.memoryEvaluation ? { evaluation: loaded.state.memoryEvaluation } : {}),
      });
      if (continuation.state?.finalResult) {
        await continuation.save(continuation.state, 'chat-commit-pending');
      }
      await this.finalizeTurnWithSkillReceipt({
        turnId: turn.id,
        assistantMessageId: randomUUID(),
        response: result.response,
        ...(result.providerId ? { providerId: result.providerId } : {}),
        ...(result.model ? { model: result.model } : {}),
        iterations: result.iterations,
        retrievalCount: result.retrievalAttemptIds.length,
        memoryUse: result.memoryUse,
        metadata: result,
        claim,
      });
      const persisted = this.replayResult(this.store.getTurn(turn.id)!);
      await emit({ type: 'assistant.final', at: new Date().toISOString(), response: persisted.response, memoryUse: persisted.memoryUse, modelIdentity: persisted.modelIdentity });
      return {
        ...persisted,
        learningStatus: result.learningStatus,
        jobVerification: result.jobVerification,
        retrievalAttemptIds: result.retrievalAttemptIds,
        ...(result.evaluation ? { evaluation: result.evaluation } : {}),
        ...(result.metrics ? { metrics: result.metrics } : {}),
        ...(result.learnedLesson ? { learnedLesson: result.learnedLesson } : {}),
        ...(result.settingsDigest ? { settingsDigest: result.settingsDigest, toolContractDigest: result.toolContractDigest } : {}),
        replayed: false,
      };
    } catch (error) {
      const message = this.pauseRequestedTurns.has(turn.id) && error instanceof AgentProviderPoolPausedError
        ? AGENT_TURN_USER_PAUSED : error instanceof Error ? error.message : String(error);
      const currentTurn = this.store.getTurn(turn.id);
      if (currentTurn?.status !== 'stopped') {
        if (message.startsWith('AGENT_RUNTIME_CONTINUATION_')) {
          this.store.releaseResumeClaim(turn.id, claim, message === AGENT_TURN_USER_PAUSED ? message : safeErrorCode(error));
        } else {
          this.store.failTurn({
            turnId: turn.id,
            status: controller.signal.aborted ? 'stopped' : 'failed',
            errorCode: controller.signal.aborted
              ? 'AGENT_RUNTIME_TURN_STOPPED'
              : safeErrorCode(error),
            ...(!controller.signal.aborted && message === 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED' && iterationLimitReport
              ? { failureResponse: iterationLimitReport } : {}),
            claim,
          });
          if (!controller.signal.aborted && message === 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED' && iterationLimitReport) {
            await emit({ type: 'assistant.final', at: new Date().toISOString(), success: false,
              code: message, response: this.replayResult(this.store.getTurn(turn.id)!).response });
          }
        }
      }
      if (!controller.signal.aborted && (message === AGENT_TURN_USER_PAUSED || message === AGENT_TURN_ITERATION_WINDOW_FULL)) {
        return { ...this.replayResult(this.store.getTurn(turn.id)!), replayed: false };
      }
      if (!controller.signal.aborted && error instanceof AgentProviderPoolPausedError && continuation.state) {
        this.scheduleProviderResume(turn.id, continuation.state);
        return { ...this.replayResult(this.store.getTurn(turn.id)!), replayed: false };
      }
      throw error;
    } finally {
      // Same identity check as above: never remove another executor's registration.
      if (this.activeTurns.get(turn.id) === controller) this.activeTurns.delete(turn.id);
      if (this.store.getTurn(turn.id)?.status !== 'resumable') this.pauseRequestedTurns.delete(turn.id);
      this.compactionRequestedTurns.delete(turn.id);
      await this.settleIfEnded(turn.id);
    }
  }

  /**
   * A turn that stopped, failed or was interrupted can never resume. A runtime task it left running has no
   * executor, and an open task blocks closing or reusing the session (AGENT_RUNTIME_SESSION_HAS_RUNNING_TASK).
   * This reuses the existing terminal and finalization path and never selects a turn that may still resume.
   */
  private settleEndedTurnTask(turnId: string, runtimeTaskId: string): Promise<boolean> {
    return this.joinOrStartTaskSettle(turnId, runtimeTaskId)?.done ?? Promise.resolve(false);
  }

  /** Null while the turn still has an executor; otherwise the settle of its task, started now or already in flight. */
  private joinOrStartTaskSettle(turnId: string, runtimeTaskId: string): TaskSettle | null {
    if (this.activeTurns.has(turnId)) return null;
    // A stop, an unwinding executor, a send and an archive can all arrive for the same task; they share one settle.
    const inFlight = this.settlingTasks.get(runtimeTaskId);
    if (inFlight) return inFlight;
    let terminalReached!: (ended: boolean) => void;
    const terminal = new Promise<boolean>(resolve => { terminalReached = resolve; });
    const done: Promise<boolean> = this.settleTaskOnce(runtimeTaskId, terminalReached).finally(() => {
      if (this.settlingTasks.get(runtimeTaskId) === settle) this.settlingTasks.delete(runtimeTaskId);
    });
    const settle: TaskSettle = { terminal, done };
    this.settlingTasks.set(runtimeTaskId, settle);
    return settle;
  }

  /**
   * Never rejects: this runs on startup, stop, archive and send, and none of them may fail because of it.
   * terminalReached is called as soon as the terminal write is over, before the finalization starts, so a caller can
   * bound its wait for the write and its wait for the finalization separately; it is also called on every exit.
   */
  private async settleTaskOnce(runtimeTaskId: string, terminalReached: (ended: boolean) => void): Promise<boolean> {
    try {
      const task = await this.runtime.getTask(runtimeTaskId).catch(() => null);
      if (!task || task.status !== 'running') return false;
      // Only the settler that really ended the task finalizes it; a settler that lost a race leaves that to the winner.
      const ended = await this.runtime.markTerminal({
        taskId: task.id,
        outcome: 'failed',
        reason: 'task-complete',
      }).then(() => true, () => false);
      terminalReached(ended);
      if (!ended) return false;
      await this.runtime.finalizeTask({
        taskId: task.id,
        disposition: 'awaiting-verification',
      }).catch(error => {
        // The task no longer runs, so its session can be closed; finalization stays pending for a later attempt.
        console.error('AGENT_CHAT_TASK_FINALIZE_FAILED:' + safeErrorCode(error));
      });
      return true;
    } catch (error) {
      console.error('AGENT_CHAT_TASK_SETTLE_FAILED:' + safeErrorCode(error));
      return false;
    } finally {
      // Resolving a second time changes nothing; this only makes sure every exit resolves the terminal milestone.
      terminalReached(false);
    }
  }

  private async settleIfEnded(turnId: string): Promise<void> {
    try {
      const turn = this.store.getTurn(turnId);
      if (turn && (turn.status === 'stopped' || turn.status === 'failed' || turn.status === 'interrupted')) {
        // The end of a turn must not wait on runtime I/O without limit; the settle keeps running and later callers join it.
        // The terminal write and the finalization are bounded separately: a short finalization bound must not cut the
        // write short, and a finalization that hangs must not hold the turn open once the task has ended.
        const settle = this.joinOrStartTaskSettle(turn.id, turn.runtimeTaskId);
        if (settle && await waitAtMost(settle.terminal, this.settleTerminalWaitMs, false)) {
          await waitAtMost(settle.done, this.settleWaitMs, false);
        }
      }
    } catch (error) {
      console.error('AGENT_CHAT_TASK_SETTLE_FAILED:' + safeErrorCode(error));
    }
  }

  private async settleOrphanedTasks(conversationId?: string): Promise<number> {
    let settled = 0;
    try {
      for (const turn of this.store.listEndedTurnTasks(conversationId)) {
        if (await waitAtMost(this.settleEndedTurnTask(turn.turnId, turn.runtimeTaskId), this.settleWaitMs, false)) settled += 1;
      }
    } catch (error) {
      // A failing query must not fail startup, a send or an archive; the caller still reports its own conflict.
      console.error('AGENT_CHAT_TASK_SWEEP_FAILED:' + safeErrorCode(error));
    }
    return settled;
  }

  private async ensureConversationSession(conversationId: string, runtimeSessionId: string): Promise<void> {
    try {
      await this.runtime.ensureActiveSession(runtimeSessionId);
    } catch (error) {
      if (!isRunningTaskConflict(error)) throw error;
      // A turn that ended abnormally can leave its task running. Settle what is left, or join a settle that is
      // already running, then retry once whatever the sweep found: a stop may have settled the task between the
      // refused call and the sweep.
      await this.settleOrphanedTasks(conversationId);
      await this.runtime.ensureActiveSession(runtimeSessionId);
    }
  }

  /** Manual "compact now": only a running turn grows its context, so the request is valid only then. */
  requestCompaction(turnId: string): 'scheduled' | 'not-running' {
    const turn = this.store.getTurn(turnId);
    if (!turn || turn.status !== 'running') return 'not-running';
    this.compactionRequestedTurns.add(turnId);
    return 'scheduled';
  }

  stopTurn(turnId: string): boolean {
    this.pauseRequestedTurns.delete(turnId);
    this.compactionRequestedTurns.delete(turnId);
    const timer = this.providerWaitTimers.get(turnId);
    if (timer) clearTimeout(timer);
    this.providerWaitTimers.delete(turnId);
    const cancelled = this.store.cancelTurn(turnId);
    if (!cancelled) return false;
    const controller = this.activeTurns.get(turnId);
    controller?.abort();
    // With a live executor its own catch and finally settle the task; without one nothing else will.
    if (!controller) void this.settleEndedTurnTask(turnId, cancelled.runtimeTaskId);
    return true;
  }

  pauseTurn(turnId: string): boolean {
    const turn = this.store.getTurn(turnId);
    if (!turn || !['running', 'resumable'].includes(turn.status)) return false;
    this.pauseRequestedTurns.add(turnId);
    const timer = this.providerWaitTimers.get(turnId);
    if (timer) clearTimeout(timer);
    this.providerWaitTimers.delete(turnId);
    if (turn.status === 'resumable') {
      const checkpoint = this.store.getCheckpoint(turnId);
      if (checkpoint) this.store.noteResumeIssue(turnId, checkpoint.revision, AGENT_TURN_USER_PAUSED);
    }
    return true;
  }

  async archiveConversation(conversationId: string): Promise<void> {
    const detail = this.store.detail(conversationId);
    if (!detail) throw new Error('AGENT_CHAT_CONVERSATION_NOT_FOUND');
    if (detail.turns.some(turn =>
      turn.status === 'running' || turn.status === 'resumable')) {
      throw new Error('AGENT_CHAT_CONVERSATION_BUSY');
    }
    try {
      await this.runtime.closeSession(detail.conversation.runtimeSessionId);
    } catch (error) {
      if (!isRunningTaskConflict(error)) throw error;
      // Same as sending: settle or join, then retry once whatever the sweep found.
      await this.settleOrphanedTasks(conversationId);
      await this.runtime.closeSession(detail.conversation.runtimeSessionId);
    }
    this.store.archiveConversation(conversationId);
  }
}
