import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentChatStore } from '../src/agent-chat-store.js';
import { AgentChatService } from '../src/agent-chat-service.js';
import { AgentProviderPoolPausedError } from '../src/agent-provider.js';
import { parseAgentTurnCheckpoint, type AgentTurnCheckpointState } from '../src/agent-turn-checkpoint.js';

const roots: string[] = [];
afterEach(async () => {
  vi.clearAllTimers();
  vi.useRealTimers();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-provider-wait-'));
  roots.push(root);
  await mkdir(path.join(root, 'runtime', 'agent-runtime'), { recursive: true });
  const store = new AgentChatStore(path.join(root, 'runtime', 'agent-runtime', 'chat.sqlite'));
  store.createConversation({ conversationId: 'chat', runtimeSessionId: 'session', workspace: 'fixture', title: 'Provider wait fixture' });
  const runtime = { ensureActiveSession: vi.fn(), setProviderAffinity: vi.fn(),
    getTask: vi.fn(async () => ({ id: 'fixture-task', status: 'running' })),
    markTerminal: vi.fn(async () => undefined), finalizeTask: vi.fn(async () => undefined) };
  const controller = { runConversationTurn: vi.fn(async (input: any) => ({ sessionId: input.sessionId,
    taskId: input.taskId, response: 'Recovered result', status: 'finalized', iterations: 2, retrievalAttemptIds: [] })) };
  const chat = new (AgentChatService as any)(store, runtime, controller, root) as AgentChatService;
  return { root, store, runtime, controller, chat };
}

async function pause(input: any, overrides: Partial<AgentTurnCheckpointState> = {}) {
  const now = Date.now();
  const state: AgentTurnCheckpointState = { schemaVersion: 1, conversationId: input.continuation.conversationId,
    turnId: input.continuation.turnId, runtimeTaskId: input.taskId, runtimeSessionId: input.sessionId,
    prompt: input.prompt, workspace: 'fixture', messages: [{ role: 'user', content: input.prompt }],
    nextIteration: 1, maxIterations: 4, providerAttemptsConsumed: 1, maxProviderAttempts: 4,
    approvedCapabilities: [], historicalGrantedTools: [], toolContractDigest: 'sha256:' + 'a'.repeat(64),
    hasStrategy: false, needsStrategy: false, lastStrategyText: '', currentStrategySummary: '',
    failedFingerprints: [], memoryEvidence: [], artifactRefs: [], createdAtMs: now,
    updatedAtMs: now, expiresAtMs: now + 60_000,
    providerWait: { reason: 'unavailable', retryAtMs: now + 5_000, pausedAtMs: now }, ...overrides };
  await input.continuation.save(state, 'provider-wait');
  throw new AgentProviderPoolPausedError(state.providerWait!.reason, state.providerWait!.retryAtMs);
}

describe('Native durable provider wait', () => {
  it('persists a safe wait and automatically resumes the same turn with its consumed budget', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    f.controller.runConversationTurn.mockImplementationOnce(pause);
    const waiting = await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'wait-1', prompt: 'Continue the original task' });
    expect(waiting.status).toBe('resumable');
    const saved = f.store.getCheckpoint(waiting.turnId)!;
    expect(saved.phase).toBe('provider-wait');
    expect(parseAgentTurnCheckpoint(saved.payloadJson, saved.payloadDigest).providerAttemptsConsumed).toBe(1);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(2);
    expect(f.controller.runConversationTurn.mock.calls[1]![0].continuation.state.providerAttemptsConsumed).toBe(1);
    expect(f.store.getTurn(waiting.turnId)?.status).toBe('finalized');
    expect(f.store.detail('chat')!.messages.filter(message => message.role === 'assistant')).toHaveLength(1);
  });

  it('keeps an exhausted overall budget paused without resetting or dispatching it', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    f.controller.runConversationTurn.mockImplementationOnce(input => pause(input, {
      providerAttemptsConsumed: 4, providerWait: { reason: 'attempt-budget', retryAtMs: null, pausedAtMs: Date.now() },
    }));
    const waiting = await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'wait-budget', prompt: 'Budget stays bounded' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await f.chat.resumeTurn({ turnId: waiting.turnId })).status).toBe('resumable');
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    const checkpoint = f.store.getCheckpoint(waiting.turnId)!;
    expect(parseAgentTurnCheckpoint(checkpoint.payloadJson, checkpoint.payloadDigest).providerAttemptsConsumed).toBe(4);
  });

  it('cancels a waiting turn and does not resume it after the retry deadline', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    f.controller.runConversationTurn.mockImplementationOnce(pause);
    const waiting = await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'wait-stop', prompt: 'Stop remains authoritative' });
    expect(f.chat.stopTurn(waiting.turnId)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    expect(f.store.getTurn(waiting.turnId)?.status).toBe('stopped');
  });

  it('pauses automatic recovery during shutdown without stopping or changing its checkpoint', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    f.controller.runConversationTurn.mockImplementationOnce(pause);
    const waiting = await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'wait-shutdown', prompt: 'Preserve this paused task' });
    const checkpoint = f.store.getCheckpoint(waiting.turnId)!;
    f.chat.pauseAutomaticRecovery();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await f.chat.resumeTurn({ turnId: waiting.turnId })).status).toBe('resumable');
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    expect(f.store.getCheckpoint(waiting.turnId)).toEqual(checkpoint);
    expect(f.runtime.markTerminal).not.toHaveBeenCalled();
  });

  it('parks a persisted wait after reconstruction until Continue and refuses unknown mutation replay', async () => {
    const f = await fixture();
    vi.useFakeTimers();
    f.controller.runConversationTurn.mockImplementationOnce(pause);
    const waiting = await f.chat.runTurn({ conversationId: 'chat', clientRequestId: 'wait-restart', prompt: 'Recover this exact waiting turn' });
    // Simulate the former process ending; only the durable checkpoint survives.
    for (const timer of (f.chat as any).providerWaitTimers.values()) clearTimeout(timer);
    (f.chat as any).providerWaitTimers.clear();
    const reopened = await AgentChatService.initialize(f.root, f.runtime as any, f.controller as any);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(reopened.store.getTurn(waiting.turnId)?.status).toBe('resumable');
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    await reopened.resumeTurn({turnId:waiting.turnId});
    expect(reopened.store.getTurn(waiting.turnId)?.status).toBe('finalized');
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(2);

    f.controller.runConversationTurn.mockImplementationOnce(input => pause(input, { pendingTool: {
      callId: 'unknown-write', name: 'write_file', arguments: '{}', invocationId: 'unknown-write', mutating: true, phase: 'dispatching',
    } }));
    const unknown = await reopened.runTurn({ conversationId: 'chat', clientRequestId: 'wait-unknown', prompt: 'Unknown mutation remains unknown' });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(reopened.resumeTurn({ turnId: unknown.turnId })).rejects.toThrow('AGENT_CHAT_RESUME_SIDE_EFFECT_RESULT_UNAVAILABLE');
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(3);
  });
});
