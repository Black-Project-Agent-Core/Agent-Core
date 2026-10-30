import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentChatService } from '../src/agent-chat-service.js';
import { AgentChatStore } from '../src/agent-chat-store.js';
import { parseAgentTurnCheckpoint, serializeAgentTurnCheckpoint, type AgentTurnCheckpointState } from '../src/agent-turn-checkpoint.js';

const parent = fileURLToPath(new URL('../runtime/tmp/', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(parent) + path.sep)) throw new Error('fixture root escaped');
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'native-chat-reliability-'));
  roots.push(root);
  const store = new AgentChatStore(path.join(root, 'runtime', 'agent-runtime', 'chat.sqlite'));
  store.createConversation({ conversationId: 'chat-1', runtimeSessionId: 'session-1', workspace: 'fixture', title: 'Fixture' });
  const runtime = {
    ensureActiveSession: vi.fn(), setProviderAffinity: vi.fn(),
    getTask: vi.fn(async () => ({ id: 'task-1', status: 'running' })),
    markTerminal: vi.fn(async () => ({})), finalizeTask: vi.fn(async () => ({})),
  };
  const result = { sessionId: 'session-1', taskId: 'task-1', response: 'Saved result', status: 'finalized',
    learningStatus: 'complete', jobVerification: 'pass', iterations: 2, retrievalAttemptIds: [] };
  const controller = { runConversationTurn: vi.fn(async () => ({ ...result })) };
  const chat = new (AgentChatService as any)(store, runtime, controller, root) as AgentChatService;
  return { root, store, runtime, controller, chat, result };
}

function seed(store: AgentChatStore, overrides: Partial<AgentTurnCheckpointState> = {}) {
  const now = Date.now();
  const state: AgentTurnCheckpointState = {
    schemaVersion: 1, conversationId: 'chat-1', runtimeSessionId: 'session-1',
    runtimeTaskId: 'task-1', turnId: 'turn-1', prompt: 'Continue fixture', workspace: 'fixture',
    messages: [{ role: 'user', content: 'Continue fixture' }],
    nextIteration: 2, maxIterations: 6, providerAttemptsConsumed: 2, maxProviderAttempts: 8,
    approvedCapabilities: [], historicalGrantedTools: [],
    toolContractDigest: 'sha256:' + createHash('sha256').update('fixture').digest('hex'),
    hasStrategy: true, needsStrategy: false, lastStrategyText: 'fixture', currentStrategySummary: 'fixture',
    failedFingerprints: [], memoryEvidence: [], artifactRefs: [],
    createdAtMs: now, updatedAtMs: now, expiresAtMs: now + 60_000, ...overrides,
  };
  const begun = store.beginTurn({ conversationId: state.conversationId, turnId: state.turnId,
    clientRequestId: 'request-' + state.turnId, runtimeTaskId: state.runtimeTaskId,
    userMessageId: 'user-' + state.turnId, prompt: state.prompt, executorToken: 'old-executor', reasoningEffort: state.reasoningEffort,
    requestedModel: state.providerModel });
  const serialized = serializeAgentTurnCheckpoint(state);
  store.saveCheckpoint({ turnId: state.turnId, claim: begun.claim!, expectedRevision: 0,
    schemaVersion: 1, phase: 'model-ready', payloadJson: serialized.json, payloadDigest: serialized.digest });
  return state;
}

describe('Native chat durable response ownership', () => {
  it('reads decision evidence for the exact durable task without another model call', async () => {
    const f = await fixture(); seed(f.store);
    const evidence = { status: 'available', taskId: 'task-1', records: [], truncated: false,
      attribution: 'controller-declared', goalVerification: 'not-established' };
    const reader = vi.fn(async () => evidence);
    (f.runtime as any).getDecisionEvidence = reader;
    expect((await f.chat.readConversation('chat-1'))?.decisionEvidence).toEqual(evidence);
    expect(reader).toHaveBeenCalledWith('task-1', 'session-1', 'fixture');
    expect(f.controller.runConversationTurn).not.toHaveBeenCalled();
    reader.mockRejectedValueOnce(new Error('AGENT_DECISION_SCOPE_UNAVAILABLE'));
    expect((await f.chat.readConversation('chat-1'))?.decisionEvidence).toMatchObject({ status: 'unavailable', records: [] });
    expect(await f.chat.readConversation('foreign-chat')).toBeNull();
  });
  it('binds the requested model to the turn and rejects changed-model retries before another call', async () => {
    const f = await fixture();
    (f.runtime as any).providerHealth = () => ({ routes: [{ id: 'anthropic', configured: true, model: 'claude-sonnet-5-5',
      reasoningEfforts: ['low', 'high'], models: [{ id: 'claude-sonnet-5-5', reasoningEfforts: ['low', 'high'] },
        { id: 'claude-opus-5-5', reasoningEfforts: ['low'] }] }] });
    const input = { conversationId: 'chat-1', clientRequestId: 'model-1', prompt: 'Fixture', providerRoute: 'anthropic',
      providerModel: 'claude-opus-5-5', reasoningEffort: 'low' as const };
    const result = await f.chat.runTurn(input);
    expect(f.controller.runConversationTurn).toHaveBeenCalledWith(expect.objectContaining({ providerModel: input.providerModel }));
    expect(f.store.getTurn(result.turnId)?.requestedModel).toBe(input.providerModel);
    expect(new AgentChatStore(f.store.dbPath).getTurn(result.turnId)?.requestedModel).toBe(input.providerModel);
    expect((await f.chat.runTurn(input)).replayed).toBe(true);
    await expect(f.chat.runTurn({ ...input, providerModel: 'claude-sonnet-5-5' })).rejects.toThrow('AGENT_CHAT_CLIENT_REQUEST_CONFLICT');
    await expect(f.chat.runTurn({ ...input, clientRequestId: 'unknown-model', providerModel: 'unknown' })).rejects.toThrow('AGENT_CHAT_MODEL_UNAVAILABLE');
    await expect(f.chat.runTurn({ ...input, clientRequestId: 'wrong-effort', reasoningEffort: 'high' })).rejects.toThrow('AGENT_CHAT_REASONING_EFFORT_UNSUPPORTED');
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    expect(f.store.getTurnByClientRequestId('unknown-model')).toBeNull();
  });

  it('validates and persists explicit effort and rejects a changed retry without making another model call', async () => {
    const f = await fixture();
    (f.runtime as any).providerHealth = () => ({ routes: [{ id: 'anthropic', configured: true, reasoningEfforts: ['low', 'high'] }] });
    const input = { conversationId: 'chat-1', clientRequestId: 'effort-1', prompt: 'Fixture', providerRoute: 'anthropic', reasoningEffort: 'low' as const };
    const result = await f.chat.runTurn(input);
    expect(f.store.getTurn(result.turnId)?.reasoningEffort).toBe('low');
    expect((f.controller.runConversationTurn.mock.calls[0] as any[])[0]).toMatchObject({ providerRoute: 'anthropic', reasoningEffort: 'low' });
    expect((await f.chat.runTurn(input)).replayed).toBe(true);
    for (const reasoningEffort of [undefined, 'high'] as const) {
      await expect(f.chat.runTurn({ ...input, reasoningEffort })).rejects.toThrow('AGENT_CHAT_CLIENT_REQUEST_CONFLICT');
      expect(()=>f.store.beginTurn({ conversationId: 'chat-1', clientRequestId: 'effort-1', turnId:'duplicate', runtimeTaskId:'duplicate', userMessageId:'duplicate', prompt:'Fixture', reasoningEffort })).toThrow('AGENT_CHAT_CLIENT_REQUEST_CONFLICT');
    }
    for (const change of [{ reasoningEffort: 'max' }, { reasoningEffort: 'auto' }, { reasoningEffort: null }, { providerRoute: undefined }, { providerRoute: 'atria' }]) {
      await expect(f.chat.runTurn({ ...input, ...change, clientRequestId: 'invalid' } as any)).rejects.toThrow(/AGENT_CHAT_REASONING_/);
    }
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    expect(f.store.detail('chat-1')?.turns).toHaveLength(1);
  });
  it('publishes one final only after commit and returns the exact sanitized stored text', async () => {
    const f = await fixture();
    f.controller.runConversationTurn.mockImplementation(async (input: any) => {
      await input.eventSink({ type: 'assistant.final', at: new Date().toISOString(), response: 'provisional' });
      expect(f.store.detail('chat-1')!.messages.filter(m => m.role === 'assistant')).toHaveLength(0);
      return { ...f.result, response: '  Saved\u0000 result\n' };
    });
    const finals: string[] = [];
    const result = await f.chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'request-1', prompt: 'Fixture',
      eventSink: event => {
        if (event.type !== 'assistant.final') return;
        expect(f.store.getTurn(event.turnId)?.status).toBe('finalized');
        expect(f.store.detail('chat-1')!.messages.at(-1)?.content).toBe(event.response);
        finals.push(event.response!);
      } });
    expect(finals).toEqual(['Saved result']);
    expect(result.response).toBe('Saved result');
    const replay = await f.chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'request-1', prompt: 'Duplicate' });
    expect(replay.response).toBe(result.response);
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
  });

  it('does not publish a final or invent an assistant message when persistence fails', async () => {
    const f = await fixture();
    f.controller.runConversationTurn.mockImplementation(async (input: any) => {
      await input.eventSink({ type: 'assistant.final', at: new Date().toISOString(), response: 'not committed' });
      return f.result;
    });
    vi.spyOn(f.store, 'finalizeTurn').mockImplementation(() => { throw new Error('fixture disk full'); });
    const events: string[] = [];
    await expect(f.chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'request-1', prompt: 'Fixture',
      eventSink: event => { events.push(event.type); } })).rejects.toThrow('fixture disk full');
    expect(events).not.toContain('assistant.final');
    expect(f.store.detail('chat-1')!.messages.filter(m => m.role === 'assistant')).toHaveLength(0);
  });

  describe('user-chosen provider route', () => {
    const routes = [{ id: 'atria', model: 'Atria-Dawn', configured: true, keyCount: 1, activeKeyCount: 1, breakerState: 'CLOSED' },
      { id: 'gonka', model: 'DeepSeek-V4-Flash', configured: true, keyCount: 1, activeKeyCount: 0, breakerState: 'OPEN', nextAvailableAt: '2026-10-25T09:00:00.000Z' },
      { id: 'half', model: null, configured: false, keyCount: 0, issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE' }];

    it('lists only what the owner needs to choose a route: id, model and availability', async () => {
      const f = await fixture();
      (f.runtime as any).providerHealth = vi.fn(() => ({ configured: true, routes }));
      expect(f.chat.listProviders()).toEqual([
        { id: 'atria', model: 'Atria-Dawn', configured: true, available: true },
        { id: 'gonka', model: 'DeepSeek-V4-Flash', configured: true, available: false, retryAt: '2026-10-25T09:00:00.000Z' },
        { id: 'half', model: null, configured: false, available: false, issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE' },
      ]);
    });

    it('refreshes model capabilities before listing but waits no longer than its bound for a slow provider', async () => {
      const f = await fixture();
      (f.runtime as any).refreshModelCapabilities = vi.fn(() => new Promise<void>(() => {}));
      vi.useFakeTimers();
      try {
        const settled = vi.fn();
        const refreshing = f.chat.refreshProviderCapabilities().then(settled);
        await vi.advanceTimersByTimeAsync(4_000);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1_000);
        await refreshing;
        expect((f.runtime as any).refreshModelCapabilities).toHaveBeenCalledTimes(1);
      } finally { vi.useRealTimers(); }
    });

    it('passes the chosen route to the controller and keeps automatic rotation when none is chosen', async () => {
      const f = await fixture();
      (f.runtime as any).providerHealth = vi.fn(() => ({ configured: true, routes }));
      await f.chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'request-pin', prompt: 'Fixture', providerRoute: 'atria' });
      expect((f.controller.runConversationTurn.mock.calls[0] as any[])[0]).toMatchObject({ providerRoute: 'atria' });
      await f.chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'request-auto', prompt: 'Fixture' });
      expect((f.controller.runConversationTurn.mock.calls[1] as any[])[0]).not.toHaveProperty('providerRoute');
    });

    it('rejects an unknown or unconfigured route before a turn is stored', async () => {
      const f = await fixture();
      (f.runtime as any).providerHealth = vi.fn(() => ({ configured: true, routes }));
      for (const providerRoute of ['nowhere', 'half']) {
        await expect(f.chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'request-' + providerRoute, prompt: 'Fixture', providerRoute }))
          .rejects.toThrow('AGENT_CHAT_PROVIDER_ROUTE_UNKNOWN');
      }
      expect(f.controller.runConversationTurn).not.toHaveBeenCalled();
      expect(f.store.detail('chat-1')!.messages).toHaveLength(0);
    });
  });

  it('keeps the chosen route in the durable checkpoint so a resumed turn stays on it', async () => {
    const state = seed((await fixture()).store, { providerRoute: 'atria' });
    const serialized = serializeAgentTurnCheckpoint(state);
    expect(parseAgentTurnCheckpoint(serialized.json, serialized.digest).providerRoute).toBe('atria');
  });

  it('finishes after observer disconnection, including operator command progress', async () => {
    const f = await fixture();
    const operator = { isOperatorCommand: () => true, operatorCommand: async () => 'Operator result' };
    const chat = new (AgentChatService as any)(f.store, f.runtime, f.controller, f.root, operator) as AgentChatService;
    const result = await chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'operator-1', prompt: '/fixture',
      eventSink: () => { throw new Error('UI disconnected'); } });
    expect(result.response).toBe('Operator result');
    expect(f.store.detail('chat-1')!.turns[0]?.status).toBe('finalized');
    expect(f.controller.runConversationTurn).not.toHaveBeenCalled();
  });

  it('does not turn a persisted response into a failed task when notice attribution is unavailable', async () => {
    const f = await fixture();
    Object.assign(f.runtime, { recordNativeSkillNoticeInclusion: async () => { throw new Error('receipt unavailable'); } });
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await f.chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'request-1', prompt: 'Fixture' });
    expect(result.status).toBe('finalized');
    expect(diagnostic).toHaveBeenCalledWith('AGENT_CHAT_NOTICE_RECEIPT_FAILED:receipt-unavailable');
    expect(f.store.getTurn(result.turnId)?.status).toBe('finalized');
  });
});

describe('Native startup checkpoint recovery', () => {
  it('parks the safe turn at startup, then continues it on explicit Continue with consumed budgets and publishes a single committed result', async () => {
    const f = await fixture();
    const state = seed(f.store, { providerRoute: 'anthropic', providerModel: 'claude-opus-5-5', reasoningEffort: 'high' });
    f.controller.runConversationTurn.mockImplementation(async (input: any) => {
      expect(input.continuation.state.runtimeTaskId).toBe(state.runtimeTaskId);
      expect(input.continuation.state.providerAttemptsConsumed).toBe(2);
      expect(input.continuation.state.nextIteration).toBe(2);
      expect(input.continuation.state.reasoningEffort).toBe('high');
      expect(input.continuation.state.providerModel).toBe('claude-opus-5-5');
      return f.result;
    });
    const chat = await AgentChatService.initialize(f.root, f.runtime as any, f.controller as any);
    await new Promise<void>(resolve => setImmediate(resolve));
    // Startup never spends provider quota: the turn waits, resumable, until the owner presses Continue.
    expect(chat.store.getTurn('turn-1')?.status).toBe('resumable');
    expect(chat.store.getTurn('turn-1')?.errorCode).toBe('AGENT_CHAT_TURN_RESUMABLE');
    expect(f.controller.runConversationTurn).not.toHaveBeenCalled();
    expect(chat.getConversation('chat-1')!.messages.filter(m => m.role === 'assistant')).toHaveLength(0);
    const resumed = await chat.resumeTurn({ turnId: 'turn-1' });
    expect(resumed.status).toBe('finalized');
    expect(chat.store.getTurn('turn-1')?.status).toBe('finalized');
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    expect(chat.getConversation('chat-1')!.messages.filter(m => m.role === 'assistant')).toHaveLength(1);
    const replay = await chat.runTurn({ conversationId: 'chat-1', clientRequestId: 'request-turn-1', prompt: 'Duplicate', providerModel: 'claude-opus-5-5', reasoningEffort: 'high' });
    expect(replay.replayed).toBe(true);
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
  });

  it('keeps an uncertain mutating dispatch paused at startup, and an explicit Continue hands it on instead of refusing', async () => {
    const f = await fixture();
    seed(f.store, { pendingTool: { callId: 'write-1', name: 'write_file', arguments: '{}',
      invocationId: 'write-1', mutating: true, phase: 'dispatching' } });
    const chat = await AgentChatService.initialize(f.root, f.runtime as any, f.controller as any);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(chat.store.getTurn('turn-1')?.status).toBe('resumable');
    expect(chat.store.getTurn('turn-1')?.errorCode).toBe('AGENT_CHAT_TURN_RESUMABLE');
    const revision = chat.store.getCheckpoint('turn-1')!.revision;
    // Startup never retries a write whose outcome is unknown, however often it runs.
    await AgentChatService.initialize(f.root, f.runtime as any, f.controller as any);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(chat.store.getCheckpoint('turn-1')!.revision).toBe(revision);
    expect(f.controller.runConversationTurn).not.toHaveBeenCalled();
    // A resumable turn still owns its task: the startup sweep must leave it running for a later resume.
    expect(f.runtime.markTerminal).not.toHaveBeenCalled();
    // Only the owner's Continue runs it again. The controller receives the checkpoint with the cut-off call still
    // marked as dispatching and answers it as interrupted; the call itself is never dispatched a second time.
    const resumed = await chat.resumeTurn({ turnId: 'turn-1' });
    expect(resumed.status).toBe('finalized');
    expect(f.controller.runConversationTurn).toHaveBeenCalledTimes(1);
    expect((f.controller.runConversationTurn.mock.calls[0] as any)[0].continuation.state.pendingTool)
      .toMatchObject({ callId: 'write-1', mutating: true, phase: 'dispatching' });
  });

  it('leaves cancelled turns stopped and refuses stale recovery annotations', async () => {
    const f = await fixture();
    seed(f.store);
    f.store.cancelTurn('turn-1');
    const chat = await AgentChatService.initialize(f.root, f.runtime as any, f.controller as any);
    await new Promise<void>(resolve => setImmediate(resolve));
    chat.store.noteResumeIssue('turn-1', 1, 'stale reason');
    expect(chat.store.getTurn('turn-1')?.status).toBe('stopped');
    expect(chat.store.getTurn('turn-1')?.errorCode).toBe('AGENT_RUNTIME_TURN_STOPPED');
    expect(f.controller.runConversationTurn).not.toHaveBeenCalled();
    // A stopped turn can never resume, so the startup sweep ends the task it left running, once, through the runtime owner.
    expect(f.runtime.markTerminal).toHaveBeenCalledTimes(1);
    expect(f.runtime.markTerminal).toHaveBeenCalledWith({ taskId: 'task-1', outcome: 'failed', reason: 'task-complete' });
    expect(f.runtime.finalizeTask).toHaveBeenCalledWith({ taskId: 'task-1', disposition: 'awaiting-verification' });
  });

  it('ignores ended turns that carry no runtime task id when sweeping for orphaned tasks', async () => {
    const f = await fixture();
    f.store.beginTurn({ conversationId: 'chat-1', turnId: 'blank-turn', clientRequestId: 'blank-request',
      runtimeTaskId: '', userMessageId: 'blank-user', prompt: 'No task was ever recorded.' });
    f.store.cancelTurn('blank-turn');
    expect(f.store.listEndedTurnTasks().map(item => item.turnId)).not.toContain('blank-turn');
    await AgentChatService.initialize(f.root, f.runtime as any, f.controller as any);
    expect(f.runtime.getTask).not.toHaveBeenCalledWith('');
  });

  it('commits a recovered work result with failed Learning without rerunning the model', async () => {
    const f = await fixture();
    const modelIdentity = { observedCalls: 2, identities: [{ providerId: 'fixture', model: 'resolved-fixture' }] };
    seed(f.store, { finalResult: { response: 'Work complete; Learning unavailable', learningStatus: 'failed',
      jobVerification: 'pass', iterations: 2, retrievalAttemptIds: [], modelIdentity } });
    f.store.recoverRunningTurns();
    f.runtime.getTask.mockResolvedValue({ id: 'task-1', status: 'finalization-failed', modelIdentity } as any);
    const events: string[] = [];
    const result = await f.chat.resumeTurn({ turnId: 'turn-1', eventSink: event => { events.push(event.type); } });
    expect(result.learningStatus).toBe('failed');
    expect(result.jobVerification).toBe('pass');
    expect(result.status).toBe('finalized');
    expect(result.modelIdentity).toEqual(modelIdentity);
    expect(f.store.getTurn('turn-1')?.modelIdentity).toEqual(modelIdentity);
    expect(events).toEqual(['assistant.final']);
    expect(f.controller.runConversationTurn).not.toHaveBeenCalled();
  });
});
