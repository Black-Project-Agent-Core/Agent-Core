import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentChatService } from '../src/agent-chat-service.js';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { LearningService } from '../src/learning/service.js';
import { MemoryService } from '../src/memory/service.js';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map(server =>
    new Promise<void>(resolve => server.close(() => resolve()))));
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-chat-service-'));
  roots.push(root);
  const memoryDir = path.join(root, 'runtime', 'memory');
  await mkdir(path.join(memoryDir, 'notes'), { recursive: true });
  await writeFile(
    path.join(memoryDir, '00-agent-core-memory.md'),
    '# Agent Core Foundational Memory\n\nChat fixture foundation.\n',
  );
  return { root, memoryDir };
}
function finalChoice(finalResponse: string, verificationRef: string) {
  return {
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        content: null,
        tool_calls: [{
          id: 'finalize-' + verificationRef,
          type: 'function',
          function: {
            name: 'agent_core_finalize',
            arguments: JSON.stringify({
              outcome: 'verified',
              reason: 'task-complete',
              verificationRef,
              finalResponse,
              nothingWorthSaving: true,
            }),
          },
        }],
      },
    }],
  };
}

async function startProvider(requests: any[]) {
  let turn = 0;
  const server = createServer(async (request, response) => {
    const body: Buffer[] = [];
    for await (const chunk of request) body.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(body).toString('utf8')));
    turn += 1;
    const payload = turn === 1
      ? finalChoice('Alpha context established.', 'verification:chat-turn-1')
      : finalChoice('Follow-up understood.', 'verification:chat-turn-2');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const address = server.address() as AddressInfo;
  return 'http://127.0.0.1:' + address.port + '/v1';
}
async function startRouteServer(handler: (call: number, payload: any) => { status: number; body: any }) {
  let calls = 0;
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    const body: Buffer[] = [];
    for await (const chunk of request) body.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(body).toString('utf8'));
    requests.push(payload);
    calls += 1;
    const result = handler(calls, payload);
    response.writeHead(result.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const address = server.address() as AddressInfo;
  return {
    baseUrl: 'http://127.0.0.1:' + address.port + '/v1',
    requests,
  };
}

describe('AgentChatService multi-turn lifecycle', () => {
  it('keeps one runtime session across turns, persists context, and stays idempotent', async () => {
    const { root, memoryDir } = await fixtureRoot();
    const memory = await MemoryService.initialize(root, memoryDir);
    const memoryCountBefore = (await memory.list()).length;
    const learning = await LearningService.initialize({
      enabled: true,
      stateDir: path.join(root, 'runtime', 'learning'),
      reviewInterval: 10,
      curatorIntervalHours: 168,
    }, memory);
    const requests: any[] = [];
    const baseUrl = await startProvider(requests);
    const config = {
      enabled: true,
      baseUrl,
      model: 'chat-model',
      apiKey: null,
      requestTimeoutMs: 5_000,
      maxToolIterations: 4,
      allowedTools: [],
    };

    const runtime = await AgentRuntimeService.initialize(
      root, learning, config, memory,
    );
    const controller = new NativeAgentController(
      runtime,
      { memoryService: memory, learningService: learning },
      config,
    );
    const chat = await AgentChatService.initialize(root, runtime, controller);
    const created = await chat.createConversation({ workspace: 'fixture' });
    const conversationId = created.conversation.id;
    const sessionId = created.conversation.runtimeSessionId;
    const first = await chat.runTurn({
      conversationId,
      clientRequestId: 'chat-request-1',
      prompt: 'Establish Alpha as the thread topic.',
    });
    expect(first).toEqual(expect.objectContaining({
      status: 'finalized',
      response: 'Alpha context established.',
      providerId: 'default',
      model: 'chat-model',
      replayed: false,
    }));

    const reopenedRuntime = await AgentRuntimeService.initialize(
      root, learning, config, memory,
    );
    const reopenedController = new NativeAgentController(
      reopenedRuntime,
      { memoryService: memory, learningService: learning },
      config,
    );
    const reopenedChat = await AgentChatService.initialize(
      root, reopenedRuntime, reopenedController,
    );
    const restored = reopenedChat.getConversation(conversationId);
    expect(restored?.conversation.runtimeSessionId).toBe(sessionId);
    expect(restored?.messages.map(message => message.content)).toEqual([
      'Establish Alpha as the thread topic.',
      'Alpha context established.',
    ]);

    const second = await reopenedChat.runTurn({
      conversationId,
      clientRequestId: 'chat-request-2',
      prompt: 'What topic did I establish?',
    });
    expect(second).toEqual(expect.objectContaining({
      status: 'finalized',
      response: 'Follow-up understood.',
      providerId: 'default',
      replayed: false,
    }));
    expect(second.taskId).not.toBe(first.taskId);
    expect(requests).toHaveLength(2);
    const secondMessages = JSON.stringify(requests[1].messages);
    expect(secondMessages).toContain('Establish Alpha as the thread topic.');
    expect(secondMessages).toContain('Alpha context established.');
    expect(secondMessages).toContain('What topic did I establish?');

    const firstTask = await reopenedRuntime.getTask(first.taskId);
    const secondTask = await reopenedRuntime.getTask(second.taskId);
    expect(firstTask?.sessionId).toBe(sessionId);
    expect(secondTask?.sessionId).toBe(sessionId);
    expect(firstTask?.status).toBe('finalized');
    expect(secondTask?.status).toBe('finalized');
    expect((await reopenedRuntime.getSession(sessionId))?.status).toBe('active');

    const replay = await reopenedChat.runTurn({
      conversationId,
      clientRequestId: 'chat-request-2',
      prompt: 'This duplicate must not execute.',
    });
    expect(replay.replayed).toBe(true);
    expect(replay.taskId).toBe(second.taskId);
    expect(requests).toHaveLength(2);

    const other = await reopenedChat.createConversation({ workspace: 'fixture' });
    await expect(reopenedChat.runTurn({
      conversationId: other.conversation.id,
      clientRequestId: 'chat-request-2',
      prompt: 'Conflict request.',
    })).rejects.toThrow('AGENT_CHAT_CLIENT_REQUEST_CONFLICT');

    expect((await memory.list()).length).toBe(memoryCountBefore);
  });

  it('stops a turn at a controller boundary without starting a provider request', async () => {
    const { root, memoryDir } = await fixtureRoot();
    const memory = await MemoryService.initialize(root, memoryDir);
    const learning = await LearningService.initialize({
      enabled: true,
      stateDir: path.join(root, 'runtime', 'learning'),
      reviewInterval: 10,
      curatorIntervalHours: 168,
    }, memory);
    const fetchMock = vi.fn(async () => {
      throw new Error('provider should not be called after stop');
    });
    vi.stubGlobal('fetch', fetchMock);
    const config = {
      enabled: true,
      baseUrl: 'http://127.0.0.1:9999/v1',
      model: 'chat-model',
      apiKey: null,
      requestTimeoutMs: 5_000,
      maxToolIterations: 4,
      allowedTools: [],
    };
    const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
    const controller = new NativeAgentController(
      runtime, { memoryService: memory, learningService: learning }, config,
    );
    const chat = await AgentChatService.initialize(root, runtime, controller);
    const created = await chat.createConversation({ workspace: 'fixture' });

    await expect(chat.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'stop-request-1',
      prompt: 'Stop this before provider execution.',
      eventSink: event => {
        if (event.type === 'turn.accepted') {
          expect(chat.stopTurn(event.turnId)).toBe(true);
        }
      },
    })).rejects.toThrow('AGENT_RUNTIME_TURN_STOPPED');

    expect(fetchMock).not.toHaveBeenCalled();
    const detail = chat.getConversation(created.conversation.id)!;
    expect(detail.turns[0]?.status).toBe('stopped');
    expect(detail.messages.filter(message => message.role === 'assistant')).toHaveLength(0);
    expect((await runtime.getSession(created.conversation.runtimeSessionId))?.status).toBe('active');
  });

  it('restores preferred provider affinity after reconstruction while scheduler owns credentials', async () => {
    const { root, memoryDir } = await fixtureRoot();
    const memory = await MemoryService.initialize(root, memoryDir);
    const learning = await LearningService.initialize({
      enabled: true,
      stateDir: path.join(root, 'runtime', 'learning'),
      reviewInterval: 10,
      curatorIntervalHours: 168,
    }, memory);

    const routeA = await startRouteServer(() => ({
      status: 503,
      body: { error: { message: 'service unavailable' } },
    }));
    const routeB = await startRouteServer(call => ({
      status: 200,
      body: finalChoice(
        call === 1 ? 'route-b-first' : 'route-b-second',
        'verification:route-b-' + call,
      ),
    }));
    const config = {
      enabled: true,
      baseUrl: null,
      model: null,
      apiKey: null,
      requestTimeoutMs: 5_000,
      maxToolIterations: 4,
      allowedTools: [],
      providerOrder: ['a', 'b'],
      maxProviderAttempts: 2,
      providers: [
        {
          id: 'a', baseUrl: routeA.baseUrl, model: 'model-a',
          credentials: [{ id: 'a:01', secret: 'fixture-a', ordinal: 1 }],
        },
        {
          id: 'b', baseUrl: routeB.baseUrl, model: 'model-b',
          credentials: [{ id: 'b:01', secret: 'fixture-b', ordinal: 1 }],
        },
      ],
    };

    const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
    const controller = new NativeAgentController(
      runtime, { memoryService: memory, learningService: learning }, config,
    );
    const chat = await AgentChatService.initialize(root, runtime, controller);
    const created = await chat.createConversation({ workspace: 'fixture' });
    const first = await chat.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'route-request-1',
      prompt: 'Use any healthy route.',
    });
    expect(first.providerId).toBe('b');
    expect(routeA.requests).toHaveLength(1);
    expect(routeB.requests).toHaveLength(1);
    expect(chat.getConversation(created.conversation.id)?.conversation.preferredProviderId).toBe('b');

    const runtime2 = await AgentRuntimeService.initialize(root, learning, config, memory);
    const controller2 = new NativeAgentController(
      runtime2, { memoryService: memory, learningService: learning }, config,
    );
    const chat2 = await AgentChatService.initialize(root, runtime2, controller2);
    const second = await chat2.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'route-request-2',
      prompt: 'Continue on the healthy route.',
    });
    expect(second.providerId).toBe('b');
    expect(routeA.requests).toHaveLength(1);
    expect(routeB.requests).toHaveLength(2);
  }, 30_000);

  it('reconciles a persisted running turn to interrupted without phantom success', async () => {
    const { root, memoryDir } = await fixtureRoot();
    const memory = await MemoryService.initialize(root, memoryDir);
    const learning = await LearningService.initialize({
      enabled: true,
      stateDir: path.join(root, 'runtime', 'learning'),
      reviewInterval: 10,
      curatorIntervalHours: 168,
    }, memory);
    const config = {
      enabled: true,
      baseUrl: 'http://127.0.0.1:9999/v1',
      model: 'chat-model',
      apiKey: null,
      requestTimeoutMs: 5_000,
      maxToolIterations: 4,
      allowedTools: [],
    };
    const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
    const controller = new NativeAgentController(
      runtime, { memoryService: memory, learningService: learning }, config,
    );
    const chat = await AgentChatService.initialize(root, runtime, controller);
    const created = await chat.createConversation({ workspace: 'fixture' });
    const task = await runtime.beginTask({
      sessionId: created.conversation.runtimeSessionId,
      taskId: 'interrupted-task',
      workspace: 'fixture',
      goal: 'Simulate a process interruption.',
    });
    chat.store.beginTurn({
      conversationId: created.conversation.id,
      turnId: 'interrupted-turn',
      clientRequestId: 'interrupted-request',
      runtimeTaskId: task.id,
      userMessageId: 'interrupted-user-message',
      prompt: 'This turn was running when the service stopped.',
      startedAtMs: 10_000,
    });

    const recovered = await AgentChatService.initialize(root, runtime, controller);
    const detail = recovered.getConversation(created.conversation.id)!;
    expect(detail.turns[0]).toEqual(expect.objectContaining({
      id: 'interrupted-turn',
      status: 'interrupted',
      errorCode: 'AGENT_CHAT_TURN_INTERRUPTED',
    }));
    expect(detail.messages.filter(message => message.role === 'assistant')).toHaveLength(0);
    expect(await runtime.getTask(task.id)).toEqual(expect.objectContaining({
      status: 'finalized',
      terminalOutcome: 'failed',
    }));
    expect((await learning.status()).state.reviewDecisions?.[`agent-runtime:${task.id}:finalization`]?.status).toBe('awaiting-verification');
    expect((await runtime.getSession(created.conversation.runtimeSessionId))?.status).toBe('active');
  });

  it('preserves assistant output with failed Learning and permits finalization recovery', async () => {
    const { root, memoryDir } = await fixtureRoot();
    const memory = await MemoryService.initialize(root, memoryDir);
    const failingLearning = {
      procedures: async () => [],
      checkpoint: vi.fn(async () => {
        throw new Error('LEARNING_TEMPORARY_FAILURE');
      }),
      review: vi.fn(),
    };
    const requests: any[] = [];
    const baseUrl = await startProvider(requests);
    const config = {
      enabled: true,
      baseUrl,
      model: 'chat-model',
      apiKey: null,
      requestTimeoutMs: 5_000,
      maxToolIterations: 4,
      allowedTools: [],
    };

    const runtime = await AgentRuntimeService.initialize(
      root, failingLearning as any, config, memory,
    );
    const controller = new NativeAgentController(
      runtime,
      { memoryService: memory, learningService: failingLearning as any },
      config,
    );
    const chat = await AgentChatService.initialize(root, runtime, controller);
    const created = await chat.createConversation({ workspace: 'fixture' });

    const result = await chat.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'finalization-fail-1',
      prompt: 'Complete only after Learning finalization.',
    });
    expect(result.learningStatus).toBe('failed');
    expect(result.response).toContain('Learning belum selesai');

    const failedDetail = chat.getConversation(created.conversation.id)!;
    expect(failedDetail.turns).toHaveLength(1);
    expect(failedDetail.turns[0]?.status).toBe('finalized');
    expect(failedDetail.messages.filter(message => message.role === 'assistant')).toHaveLength(1);

    await expect(chat.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'finalization-blocked-2',
      prompt: 'This must remain blocked.',
    })).rejects.toThrow('AGENT_RUNTIME_SESSION_FINALIZATION_PENDING');
    expect(chat.getConversation(created.conversation.id)?.turns).toHaveLength(1);
    expect(requests).toHaveLength(1);

    const healthyLearning = await LearningService.initialize({
      enabled: true,
      stateDir: path.join(root, 'runtime', 'learning'),
      reviewInterval: 10,
      curatorIntervalHours: 168,
    }, memory);
    const runtime2 = await AgentRuntimeService.initialize(
      root, healthyLearning, config, memory,
    );
    const failedTaskId = failedDetail.turns[0]!.runtimeTaskId;
    const retried = await runtime2.finalizeTask({
      taskId: failedTaskId,
      nothingWorthSaving: true,
    });
    expect(retried.task.status).toBe('finalized');

    const controller2 = new NativeAgentController(
      runtime2,
      { memoryService: memory, learningService: healthyLearning },
      config,
    );
    const chat2 = await AgentChatService.initialize(root, runtime2, controller2);
    const resumed = await chat2.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'finalization-recovered-3',
      prompt: 'Continue after finalization recovery.',
    });
    expect(resumed.status).toBe('finalized');
    expect(resumed.response).toBe('Follow-up understood.');
  });
});
