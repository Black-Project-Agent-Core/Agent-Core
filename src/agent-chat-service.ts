import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AgentModelMessage } from './agent-provider.js';
import {
  parseAgentTurnCheckpoint,
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
import type { AgentTurnEvent } from './agent-turn-events.js';

export interface AgentChatEventEnvelope extends AgentTurnEvent {
  conversationId: string;
  turnId: string;
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
  replayed: boolean;
}
function titleFromPrompt(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  return compact.slice(0, 160) || 'New Chat';
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
    const recovered = this.store.recoverRunningTurns();
    for (const turn of recovered.interrupted) {
      const task = await this.runtime.getTask(turn.runtimeTaskId).catch(() => null);
      if (!task || task.status !== 'running') continue;
      await this.runtime.markTerminal({
        taskId: task.id,
        outcome: 'failed',
        reason: 'task-complete',
      }).catch(() => undefined);
      await this.runtime.finalizeTask({
        taskId: task.id,
        disposition: 'awaiting-verification',
      }).catch(() => undefined);
    }
  }
  health() {
    const conversations = this.store.listConversations(true);
    return {
      status: 'available' as const,
      conversationCount: conversations.length,
      activeConversationCount: conversations.filter(item => item.status === 'active').length,
      runningTurnCount: this.activeTurns.size,
      resumableTurnCount: conversations.reduce((count, conversation) => {
        const detail = this.store.detail(conversation.id);
        return count + (detail?.turns.filter(turn => turn.status === 'resumable').length ?? 0);
      }, 0),
    };
  }

  listConversations(includeArchived = false): AgentChatConversation[] {
    return this.store.listConversations(includeArchived);
  }

  getConversation(conversationId: string): AgentChatConversationDetail | null {
    return this.store.detail(conversationId);
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
      ...(response ? { response } : {}),
      ...(turn.providerId ? { providerId: turn.providerId } : {}),
      ...(turn.model ? { model: turn.model } : {}),
      ...(turn.iterations !== undefined ? { iterations: turn.iterations } : {}),
      replayed: true,
    };
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
      save: (state: AgentTurnCheckpointState, phase: any) => Promise<void>;
    } = {
      conversationId: input.conversationId,
      turnId: input.turnId,
      ...(input.state ? { state: input.state } : {}),
      save: async (state, phase) => {
        const serialized = serializeAgentTurnCheckpoint(state);
        const saved = this.store.saveCheckpoint({
          turnId: input.turnId,
          claim: input.claim,
          expectedRevision: revision,
          schemaVersion: serialized.state.schemaVersion,
          phase: String(phase),
          payloadJson: serialized.json,
          payloadDigest: serialized.digest,
        });
        revision = saved.revision;
        hooks.state = serialized.state;
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
      await this.runtime.recordNativeSkillNoticeInclusion?.(turn.runtimeTaskId, input.response);
      await this.runtime.recordNativeCapabilityNoticeInclusion?.(turn.runtimeTaskId,input.response);
    }
  }

  async runTurn(input: {
    conversationId: string;
    clientRequestId: string;
    prompt: string;
    eventSink?: AgentChatEventSink;
  }): Promise<AgentChatTurnResult> {
    const existing = this.store.getTurnByClientRequestId(input.clientRequestId);
    if (existing) {
      if (existing.conversationId !== input.conversationId) {
        throw new Error('AGENT_CHAT_CLIENT_REQUEST_CONFLICT');
      }
      return this.replayResult(existing);
    }

    const conversation = this.store.getConversation(input.conversationId);
    if (!conversation || conversation.status !== 'active') {
      throw new Error('AGENT_CHAT_CONVERSATION_NOT_ACTIVE');
    }
    // Explicit artifact decisions are authenticated local-chat commands, not model tasks.
    // Do not make a Native model/provider session a prerequisite to operator approval.
    const artifactOperatorCommand = this.artifactAuthorization?.isOperatorCommand(input.prompt) === true;
    if (!artifactOperatorCommand) await this.runtime.ensureActiveSession(conversation.runtimeSessionId);
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
    });
    if (!begun.created) return this.replayResult(begun.turn);
    if (!begun.claim) throw new Error('AGENT_CHAT_EXECUTION_STATE_MISSING');
    const claim = begun.claim;
    const continuation = this.continuationHooks({
      conversationId: conversation.id,
      turnId,
      claim,
      revision: 0,
    });
    this.store.setTitleFromPrompt(conversation.id, titleFromPrompt(input.prompt));
    const history = this.store.boundedContextMessages({
      conversationId: conversation.id,
      excludeTurnId: turnId,
      maxMessages: 24,
      maxChars: 48_000,
    });
    const controller = new AbortController();
    this.activeTurns.set(turnId, controller);

    const emit = async (event: AgentTurnEvent) => {
      await input.eventSink?.({
        ...event,
        conversationId: conversation.id,
        turnId,
      });
    };

    let result: NativeAgentTaskResult;
    try {
      // The user message was persisted by beginTurn above. Tool output cannot enter this host-only path.
      // Only a freshly persisted real user message enters artifact operator commands.
      // No MCP tool, Memory record, or model output may invoke this host authority.
      const artifactReply = await this.artifactAuthorization?.operatorCommand(input.prompt, {
        workspace: conversation.workspace ?? 'agent-core', conversationId: conversation.id,
        userMessageId, persistedUserMessage: true,
      });
      const skillDecision = artifactReply === undefined ? await this.runtime.applyUserSkillCommand?.({ workspace: conversation.workspace ?? 'agent-core',
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
        history: historyMessages(history),
        memoryQuery: buildMemoryQuery(input.prompt, history),
        eventSink: emit,
        signal: controller.signal,
        continuation,
      });
      if (skillDecision || artifactReply !== undefined) await emit({ type: 'assistant.final', at: new Date().toISOString(), response: result.response }).catch(() => undefined);
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
        claim,
      });
      if (result.providerId || result.model) {
        this.store.updatePreferredRoute(
          conversation.id,
          result.providerId,
          result.model,
        );
      }
      return {
        conversationId: conversation.id,
        turnId,
        taskId,
        status: 'finalized',
        response: result.response,
        learningStatus: result.learningStatus,
        jobVerification: result.jobVerification,
        ...(result.providerId ? { providerId: result.providerId } : {}),
        ...(result.model ? { model: result.model } : {}),
        iterations: result.iterations,
        retrievalAttemptIds: result.retrievalAttemptIds,
        replayed: false,
      };
    } catch (error) {
      const stopped = controller.signal.aborted
        || (error instanceof Error && error.message === 'AGENT_RUNTIME_TURN_STOPPED');
      const currentTurn = this.store.getTurn(turnId);
      if (currentTurn?.status !== 'stopped') {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('AGENT_RUNTIME_CONTINUATION_')) {
          this.store.releaseResumeClaim(turnId, claim, safeErrorCode(error));
        } else {
          this.store.failTurn({
            turnId,
            status: stopped ? 'stopped' : 'failed',
            errorCode: stopped ? 'AGENT_RUNTIME_TURN_STOPPED' : safeErrorCode(error),
            claim,
          });
        }
      }
      throw error;
    } finally {
      this.activeTurns.delete(turnId);
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
  }): Promise<AgentChatTurnResult> {
    const turn = this.store.getTurn(input.turnId);
    if (!turn) throw new Error('AGENT_CHAT_TURN_NOT_FOUND');
    if (turn.status !== 'resumable') throw new Error('AGENT_CHAT_TURN_NOT_RESUMABLE');
    const conversation = this.store.getConversation(turn.conversationId);
    if (!conversation || conversation.status !== 'active') {
      throw new Error('AGENT_CHAT_CONVERSATION_NOT_ACTIVE');
    }

    const loaded = await this.loadResumableCheckpoint(turn);
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
    const emit = async (event: AgentTurnEvent) => {
      await input.eventSink?.({
        ...event,
        conversationId: conversation.id,
        turnId: turn.id,
      });
    };

    try {
      const runtimeTask = await this.runtime.getTask(turn.runtimeTaskId);
      const recovered = this.recoveredFinalResult(loaded.state, runtimeTask);
      if (recovered && runtimeTask?.status === 'finalized') {
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
          claim,
        });
        if (recovered.providerId || recovered.model) {
          this.store.updatePreferredRoute(
            conversation.id,
            recovered.providerId,
            recovered.model,
          );
        }
        return {
          conversationId: conversation.id,
          turnId: turn.id,
          taskId: turn.runtimeTaskId,
          status: 'finalized',
          response: recovered.response,
          ...(recovered.providerId ? { providerId: recovered.providerId } : {}),
          ...(recovered.model ? { model: recovered.model } : {}),
          iterations: recovered.iterations,
          retrievalAttemptIds: recovered.retrievalAttemptIds,
          replayed: false,
        };
      }

      const result = await this.controller.runConversationTurn({
        sessionId: conversation.runtimeSessionId,
        taskId: turn.runtimeTaskId,
        prompt: loaded.state.prompt,
        workspace: loaded.state.workspace ?? conversation.workspace,
        eventSink: emit,
        signal: controller.signal,
        continuation,
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
        claim,
      });
      if (result.providerId || result.model) {
        this.store.updatePreferredRoute(
          conversation.id,
          result.providerId,
          result.model,
        );
      }
      return {
        conversationId: conversation.id,
        turnId: turn.id,
        taskId: turn.runtimeTaskId,
        status: 'finalized',
        response: result.response,
        ...(result.providerId ? { providerId: result.providerId } : {}),
        ...(result.model ? { model: result.model } : {}),
        iterations: result.iterations,
        retrievalAttemptIds: result.retrievalAttemptIds,
        replayed: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentTurn = this.store.getTurn(turn.id);
      if (currentTurn?.status !== 'stopped') {
        if (message.startsWith('AGENT_RUNTIME_CONTINUATION_')) {
          this.store.releaseResumeClaim(turn.id, claim, safeErrorCode(error));
        } else {
          this.store.failTurn({
            turnId: turn.id,
            status: controller.signal.aborted ? 'stopped' : 'failed',
            errorCode: controller.signal.aborted
              ? 'AGENT_RUNTIME_TURN_STOPPED'
              : safeErrorCode(error),
            claim,
          });
        }
      }
      throw error;
    } finally {
      this.activeTurns.delete(turn.id);
    }
  }

  stopTurn(turnId: string): boolean {
    const cancelled = this.store.cancelTurn(turnId);
    if (!cancelled) return false;
    const controller = this.activeTurns.get(turnId);
    controller?.abort();
    if (!controller) {
      void (async () => {
        const task = await this.runtime.getTask(cancelled.runtimeTaskId).catch(() => null);
        if (!task || task.status !== 'running') return;
        await this.runtime.markTerminal({
          taskId: task.id,
          outcome: 'failed',
          reason: 'task-complete',
        }).catch(() => undefined);
        await this.runtime.finalizeTask({
          taskId: task.id,
          disposition: 'awaiting-verification',
        }).catch(() => undefined);
      })();
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
    await this.runtime.closeSession(detail.conversation.runtimeSessionId);
    this.store.archiveConversation(conversationId);
  }
}
