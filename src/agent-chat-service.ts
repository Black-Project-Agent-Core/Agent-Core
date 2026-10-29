import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AgentProviderPoolPausedError, validateAgentReasoningEffort, validateAgentProviderModel, type AgentModelMessage } from './agent-provider.js';
import type { AgentReasoningEffort } from './agent-provider-state.js';
import { normalizeNativeResultMetadata } from './agent-memory-evaluation.js';
import {
  parseAgentTurnCheckpoint,
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

/** How long a user-facing path (turn end, send, archive) waits for a task settle before it moves on. */
const SETTLE_WAIT_MS = 10_000;

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
  /** One settle per runtime task, shared by every caller that races for it. */
  private readonly settlingTasks = new Map<string, Promise<boolean>>();
  private settleWaitMs = SETTLE_WAIT_MS;
  private readonly providerWaitTimers = new Map<string, NodeJS.Timeout>();
  private automaticRecoveryPaused = false;

  private constructor(
    store: AgentChatStore,
    private readonly runtime: AgentRuntimeService,
    private readonly controller: NativeAgentController,
    private readonly projectRoot: string,
    private readonly artifactAuthorization?: ArtifactAuthorization,
  ) {
    this.store = store;
  }

  static async initialize(
    projectRoot: string,
    runtime: AgentRuntimeService,
    controller: NativeAgentController,
    artifactAuthorization?: ArtifactAuthorization,
  ): Promise<AgentChatService> {
    const service = new AgentChatService(
      new AgentChatStore(
        path.join(projectRoot, 'runtime', 'agent-runtime', 'chat.sqlite'),
      ),
      runtime,
      controller,
      projectRoot,
      artifactAuthorization,
    );
    await service.reconcileInterruptedTurns();
    return service;
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
  private recordContextUsage(turnId: string, event: AgentTurnEvent): void {
    if (event.type === 'memory.recall.completed' && typeof event.itemCount === 'number') {
      this.store.recordRecallCount(turnId, event.itemCount);
      return;
    }
    if (event.type !== 'context.usage' || typeof event.contextTokens !== 'number') return;
    this.store.recordContextUsage(turnId, event.contextTokens, event.contextWindow,
      { iteration: event.iteration, maxIterations: event.maxIterations });
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
    } = {
      conversationId: input.conversationId,
      turnId: input.turnId,
      ...(input.state ? { state: input.state } : {}),
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
    if (state.pendingTool?.mutating && state.pendingTool.phase === 'dispatching') {
      throw new Error('AGENT_CHAT_RESUME_SIDE_EFFECT_RESULT_UNAVAILABLE');
    }
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

  /** The owner's last provider/model/effort, persisted in chat.sqlite so it survives Core restarts. */
  getLastSelection() { return this.store.getLastSelection(); }

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

  validateProviderModel(value: unknown, providerRoute?: string): void {
    validateAgentProviderModel(value, providerRoute, this.listProviders().find(route => route.id === providerRoute)?.models?.map(model => model.id) ?? []);
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
    /** Owner-chosen route id from listProviders(); omitted means automatic rotation. */
    providerRoute?: string;
    providerModel?: string;
    reasoningEffort?: AgentReasoningEffort;
    eventSink?: AgentChatEventSink;
    evaluation?: NativeAgentTaskResult['evaluation'];
  }): Promise<AgentChatTurnResult> {
    const existing = this.store.getTurnByClientRequestId(input.clientRequestId);
    if (existing) {
      if (existing.conversationId !== input.conversationId || existing.reasoningEffort !== input.reasoningEffort
        || existing.requestedModel !== input.providerModel || Boolean(existing.goalMode) !== Boolean(input.goalMode)) {
        throw new Error('AGENT_CHAT_CLIENT_REQUEST_CONFLICT');
      }
      return this.replayResult(existing);
    }
    const providerRoute = input.providerRoute?.trim() || undefined;
    this.validateProviderModel(input.providerModel, providerRoute);
    this.validateReasoningEffort(input.reasoningEffort, providerRoute, input.providerModel);
    if (providerRoute && !this.listProviders().some(route => route.id === providerRoute && route.configured)) {
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
    if (!artifactOperatorCommand) await this.ensureConversationSession(conversation.id, conversation.runtimeSessionId);
    if (!artifactOperatorCommand && conversation.preferredProviderId) {
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
      prompt: input.prompt,
      executorToken,
      messageOrigin: localOperator ? 'local-operator' : 'external-controller',
      reasoningEffort: input.reasoningEffort,
      requestedModel: input.providerModel,
      goalMode: input.goalMode,
    });
    if (!begun.created) return this.replayResult(begun.turn);
    // Only the local owner's pick is the "last used" selection; external controllers must not move it.
    if (localOperator) {
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
    this.store.setTitleFromPrompt(conversation.id, titleFromPrompt(input.prompt));
    const boundedContext = this.store.boundedContext({
      conversationId: conversation.id,
      excludeTurnId: turnId,
      maxMessages: 24,
      maxChars: 48_000,
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
      // The user message was persisted by beginTurn above. Tool output cannot enter this host-only path.
      // Only a freshly persisted real user message enters artifact operator commands.
      // No MCP tool, Memory record, or model output may invoke this host authority.
      const artifactReply = localOperator ? await this.artifactAuthorization?.operatorCommand(input.prompt, {
        workspace: conversation.workspace ?? 'agent-core', conversationId: conversation.id,
        userMessageId, persistedUserMessage: true,
      }) : undefined;
      const skillDecision = localOperator && artifactReply === undefined ? await this.runtime.applyUserSkillCommand?.({ workspace: conversation.workspace ?? 'agent-core',
        sessionId: conversation.runtimeSessionId, taskId, userEvidenceRef: 'user-message:' + userMessageId, prompt: input.prompt }) : undefined;
      result = artifactReply !== undefined ? {
        sessionId: conversation.runtimeSessionId, taskId, response: artifactReply,
        status: 'finalized', iterations: 0, retrievalAttemptIds: [],
      } : skillDecision ? await this.runtime.completeUserSkillDecision({ workspace: conversation.workspace ?? 'agent-core',
        sessionId: conversation.runtimeSessionId, taskId, prompt: input.prompt }, skillDecision) : await this.controller.runConversationTurn({
        sessionId: conversation.runtimeSessionId,
        taskId,
        prompt: input.prompt,
        workspace: conversation.workspace,
        ...(providerRoute ? { providerRoute } : {}),
        ...(input.providerModel ? { providerModel: input.providerModel } : {}),
        ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
        history: historyMessages(history),
        ...(boundedContext.summary ? { historySummary: boundedContext.summary } : {}),
        memoryQuery: buildMemoryQuery(input.prompt, history),
        eventSink: event => { this.recordContextUsage(continuation.turnId, event); this.recordStep(continuation.turnId, event); return event.type === 'assistant.final' ? undefined : emit(event); },
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
      if (!stopped && this.store.getTurn(turnId)?.errorCode === AGENT_TURN_USER_PAUSED) {
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

      const result = await this.controller.runConversationTurn({
        sessionId: conversation.runtimeSessionId,
        taskId: turn.runtimeTaskId,
        prompt: loaded.state.prompt,
        workspace: loaded.state.workspace ?? conversation.workspace,
        eventSink: event => { this.recordContextUsage(continuation.turnId, event); this.recordStep(continuation.turnId, event); return event.type === 'assistant.final' ? undefined : emit(event); },
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
      if (!controller.signal.aborted && message === AGENT_TURN_USER_PAUSED) {
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
      await this.settleIfEnded(turn.id);
    }
  }

  /**
   * A turn that stopped, failed or was interrupted can never resume. A runtime task it left running has no
   * executor, and an open task blocks closing or reusing the session (AGENT_RUNTIME_SESSION_HAS_RUNNING_TASK).
   * This reuses the existing terminal and finalization path and never selects a turn that may still resume.
   */
  private settleEndedTurnTask(turnId: string, runtimeTaskId: string): Promise<boolean> {
    if (this.activeTurns.has(turnId)) return Promise.resolve(false);
    // A stop, an unwinding executor, a send and an archive can all arrive for the same task; they share one settle.
    const inFlight = this.settlingTasks.get(runtimeTaskId);
    if (inFlight) return inFlight;
    const settling: Promise<boolean> = this.settleTaskOnce(runtimeTaskId).finally(() => {
      if (this.settlingTasks.get(runtimeTaskId) === settling) this.settlingTasks.delete(runtimeTaskId);
    });
    this.settlingTasks.set(runtimeTaskId, settling);
    return settling;
  }

  /** Never rejects: this runs on startup, stop, archive and send, and none of them may fail because of it. */
  private async settleTaskOnce(runtimeTaskId: string): Promise<boolean> {
    try {
      const task = await this.runtime.getTask(runtimeTaskId).catch(() => null);
      if (!task || task.status !== 'running') return false;
      // Only the settler that really ended the task finalizes it; a settler that lost a race leaves that to the winner.
      const ended = await this.runtime.markTerminal({
        taskId: task.id,
        outcome: 'failed',
        reason: 'task-complete',
      }).then(() => true, () => false);
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
    }
  }

  private async settleIfEnded(turnId: string): Promise<void> {
    try {
      const turn = this.store.getTurn(turnId);
      if (turn && (turn.status === 'stopped' || turn.status === 'failed' || turn.status === 'interrupted')) {
        // The end of a turn must not wait on runtime I/O without limit; the settle keeps running and later callers join it.
        await waitAtMost(this.settleEndedTurnTask(turn.id, turn.runtimeTaskId), this.settleWaitMs, false);
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

  stopTurn(turnId: string): boolean {
    this.pauseRequestedTurns.delete(turnId);
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
