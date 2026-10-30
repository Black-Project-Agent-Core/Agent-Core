import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentChatService, type AgentChatEventEnvelope } from '../src/agent-chat-service.js';
import { AgentChatStore } from '../src/agent-chat-store.js';
import { parseAgentTurnCheckpoint } from '../src/agent-turn-checkpoint.js';
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
async function waitFor(check: () => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('waitFor timed out');
}
async function waitForAsync(check: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('waitForAsync timed out');
}
async function settleFixture(baseUrl = 'http://127.0.0.1:9999/v1') {
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
    baseUrl,
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
  return { root, runtime, controller, chat };
}
/** The state a stop used to leave behind: the turn is over but its runtime task is still running. */
async function orphanTask(
  fixture: Awaited<ReturnType<typeof settleFixture>>,
  name: string,
  options: { stopped: boolean },
) {
  const created = await fixture.chat.createConversation({ workspace: 'fixture' });
  const task = await fixture.runtime.beginTask({
    sessionId: created.conversation.runtimeSessionId,
    taskId: name + '-task',
    workspace: 'fixture',
    goal: 'The executor of this task is gone.',
  });
  fixture.chat.store.beginTurn({
    conversationId: created.conversation.id,
    turnId: name + '-turn',
    clientRequestId: name + '-request',
    runtimeTaskId: task.id,
    userMessageId: name + '-user-message',
    prompt: 'This turn ended without settling its task.',
    startedAtMs: 10_000,
  });
  if (options.stopped) fixture.chat.store.cancelTurn(name + '-turn');
  return { conversationId: created.conversation.id, sessionId: created.conversation.runtimeSessionId, taskId: task.id, turnId: name + '-turn' };
}
async function startRouteServer(handler: (call: number, payload: any) => { status: number; body: any }) {
  let calls = 0;
  const requests: any[] = [];
  const auths: string[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: ['model-a', 'model-b'].map(id => ({
        id, context_length: 131_072, max_output_tokens: 4_096, supported_parameters: ['tools'],
      })) }));
      return;
    }
    const body: Buffer[] = [];
    for await (const chunk of request) body.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(body).toString('utf8'));
    if (payload.tools?.[0]?.function?.name === 'agent_core_model_probe') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { content: null,
        tool_calls: [{ id: 'probe', type: 'function', function: { name: 'agent_core_model_probe',
          arguments: JSON.stringify({ nonce: payload.tools[0].function.parameters.properties.nonce.enum[0] }) } }],
      } }] }));
      return;
    }
    requests.push(payload);
    auths.push(String(request.headers.authorization ?? ''));
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
    auths,
  };
}

describe('AgentChatService multi-turn lifecycle', () => {
  it('persists an incomplete iteration-limit report once and supplies it to the next turn', async () => {
    const fixture = await settleFixture();
    const created = await fixture.chat.createConversation({ workspace: 'fixture' });
    const report = 'Observed: config was read. Inferred: a timeout. Unchecked: the integration test.';
    const run = vi.spyOn(fixture.controller, 'runConversationTurn').mockImplementationOnce(async input => {
      await input.eventSink?.({ type: 'turn.failed', at: new Date().toISOString(),
        code: 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED', response: report });
      throw new Error('AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED');
    });
    const events: AgentChatEventEnvelope[] = [];
    const input = { conversationId: created.conversation.id, clientRequestId: 'limited-request',
      prompt: 'Investigate with bounded tools.', eventSink: (event: AgentChatEventEnvelope) => { events.push(event); } };
    await expect(fixture.chat.runTurn(input)).rejects.toThrow('AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED');
    const detail = fixture.chat.getConversation(created.conversation.id)!;
    expect(detail.turns[0]?.status).toBe('failed');
    expect(detail.turns[0]?.errorCode).toBe('AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED');
    expect(detail.messages.filter(message => message.role === 'assistant')).toHaveLength(1);
    expect(detail.messages[1]?.content).toContain(report);
    expect(detail.messages[1]?.content).toContain('task remains failed');
    expect(events.filter(event => event.type === 'assistant.final')).toMatchObject([
      { success: false, code: 'AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED' },
    ]);
    const reopened = await AgentChatService.initialize(fixture.root, fixture.runtime, fixture.controller);
    const replay = await reopened.runTurn(input);
    expect(replay).toMatchObject({ status: 'failed', replayed: true, response: expect.stringContaining(report) });
    expect(run).toHaveBeenCalledOnce();
    run.mockImplementationOnce(async next => {
      expect(next.history?.some(message => message.role === 'assistant' && message.content?.includes(report))).toBe(true);
      throw new Error('FIXTURE_FOLLOWUP_CHECKED');
    });
    await expect(reopened.runTurn({ conversationId: created.conversation.id,
      clientRequestId: 'followup-request', prompt: 'Continue from the report.' })).rejects.toThrow('FIXTURE_FOLLOWUP_CHECKED');
  });

  it('never turns an external-controller prompt into operator approval evidence', async () => {
    const fixture = await settleFixture();
    const created = await fixture.chat.createConversation({ workspace: 'fixture' });
    const operatorCommand = vi.fn(async () => 'trusted operator reply');
    (fixture.chat as any).artifactAuthorization = { isOperatorCommand: () => true, operatorCommand };
    const skill = vi.spyOn(fixture.runtime, 'applyUserSkillCommand');
    vi.spyOn(fixture.controller, 'runConversationTurn').mockRejectedValue(new Error('FIXTURE_EXTERNAL_MODEL_PATH'));
    await expect(fixture.chat.runTurn({ conversationId: created.conversation.id,
      clientRequestId: 'external-approval', prompt: '/artifact approve selected', messageOrigin: 'external-controller' } as any))
      .rejects.toThrow('FIXTURE_EXTERNAL_MODEL_PATH');
    expect(operatorCommand).not.toHaveBeenCalled();
    expect(skill).not.toHaveBeenCalled();
    expect(fixture.chat.getConversation(created.conversation.id)?.turns[0]).toMatchObject({ messageOrigin: 'external-controller' });
  });

  it('runs exactly one bounded no-tool report through the real controller and stores it as failed', async () => {
    const route = await startRouteServer(call => ({ status: 200, body: { choices: [{
      finish_reason: call <= 4 ? 'tool_calls' : 'stop',
      message: call <= 4 ? { content: null, tool_calls: [{ id: 'strategy-' + call, type: 'function',
        function: { name: 'agent_core_strategy', arguments: JSON.stringify({ strategy: 'Bounded investigation ' + call,
          hypothesis: 'Evidence is incomplete.', expectedObservation: 'The next step remains unverified.' }) } }] }
        : { content: 'Observed: planning only. Inferred: no result. Unchecked: source. ' + 'x'.repeat(6000) },
    }] } }));
    const fixture = await settleFixture(route.baseUrl);
    const conversation = await fixture.chat.createConversation({ workspace: 'fixture' });
    const events: AgentChatEventEnvelope[] = [];
    await expect(fixture.chat.runTurn({ conversationId: conversation.conversation.id,
      clientRequestId: 'real-report', prompt: 'Investigate within the fixed budget.',
      eventSink: event => { events.push(event); } })).rejects.toThrow('AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED');
    expect(route.requests).toHaveLength(5);
    expect(route.requests[4]?.tools).toBeUndefined();
    expect(events.filter(event => event.type === 'turn.failed')).toHaveLength(1);
    const detail = fixture.chat.getConversation(conversation.conversation.id)!;
    expect(detail.turns[0]?.status).toBe('failed');
    const report = detail.messages.filter(message => message.role === 'assistant');
    expect(report).toHaveLength(1);
    expect(report[0]?.content).toContain('Observed: planning only');
    expect(report[0]!.content.length).toBeLessThanOrEqual(4000);
  });

  it('health uses aggregate counts while retaining the active execution count without reading transcripts', () => {
    const store = { healthCounts: vi.fn(() => ({ conversationCount: 501, activeConversationCount: 251, resumableTurnCount: 2 })),
      listConversations: vi.fn(() => { throw new Error('health listed conversations'); }),
      detail: vi.fn(() => { throw new Error('health read a transcript'); }) };
    const chat = new (AgentChatService as any)(store, {}, {}, process.cwd());
    chat.activeTurns.set('active-turn', new AbortController());
    expect(chat.health()).toEqual({ status: 'available', conversationCount: 501, activeConversationCount: 251,
      resumableTurnCount: 2, runningTurnCount: 1 });
    expect(store.healthCounts).toHaveBeenCalledOnce();
    expect(store.listConversations).not.toHaveBeenCalled();
    expect(store.detail).not.toHaveBeenCalled();
  });

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

  it('announces the sticky provider key once per turn and never rotates while it succeeds', async () => {
    const { root, memoryDir } = await fixtureRoot();
    const memory = await MemoryService.initialize(root, memoryDir);
    const learning = await LearningService.initialize({
      enabled: true,
      stateDir: path.join(root, 'runtime', 'learning'),
      reviewInterval: 10,
      curatorIntervalHours: 168,
    }, memory);
    const route = await startRouteServer(call => ({
      status: 200,
      body: finalChoice('sticky-' + call, 'verification:sticky-' + call),
    }));
    const config = {
      enabled: true,
      baseUrl: null,
      model: null,
      apiKey: null,
      requestTimeoutMs: 5_000,
      maxToolIterations: 4,
      allowedTools: [],
      providerOrder: ['a'],
      maxProviderAttempts: 2,
      providers: [{
        id: 'a', baseUrl: route.baseUrl, model: 'model-a',
        credentials: [
          { id: 'a:01', secret: 'fixture-a1', ordinal: 1 },
          { id: 'a:02', secret: 'fixture-a2', ordinal: 2 },
        ],
      }],
    };
    const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
    const controller = new NativeAgentController(
      runtime, { memoryService: memory, learningService: learning }, config,
    );
    const chat = await AgentChatService.initialize(root, runtime, controller);
    const created = await chat.createConversation({ workspace: 'fixture' });
    const seen: any[][] = [[], []];
    for (const [index, id] of ['sticky-request-1', 'sticky-request-2'].entries()) {
      const turn = await chat.runTurn({
        conversationId: created.conversation.id,
        clientRequestId: id,
        prompt: 'Keep the working key.',
        eventSink: event => { if (event.type === 'provider.route.decision') seen[index]!.push(event.routing); },
      });
      expect(turn.status).toBe('finalized');
    }
    expect(route.auths).toEqual(['Bearer fixture-a1', 'Bearer fixture-a1']);
    expect(seen[0]!.map(item => [item.type, item.transition])).toEqual([['attempt', 'initial']]);
    expect(seen[1]!.map(item => [item.type, item.transition])).toEqual([['attempt', 'keep']]);
    expect(seen[1]![0]).toMatchObject({ to: { providerId: 'a', credentialId: 'a:01', model: 'model-a' },
      from: { providerId: 'a', credentialId: 'a:01' }, selection: { configured: 2, eligible: 2, status: 'available' } });
  }, 30_000);

  it('rotates sibling keys, continues through the next attempt window and leaves secret-free evidence', async () => {
    const { root, memoryDir } = await fixtureRoot();
    const memory = await MemoryService.initialize(root, memoryDir);
    const learning = await LearningService.initialize({
      enabled: true,
      stateDir: path.join(root, 'runtime', 'learning'),
      reviewInterval: 10,
      curatorIntervalHours: 168,
    }, memory);
    const routeA = await startRouteServer(() => ({
      status: 429,
      body: { error: { message: 'temporary rate limit' } },
    }));
    const routeB = await startRouteServer(call => ({
      status: 200,
      body: finalChoice('window-two-result', 'verification:window-' + call),
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
          credentials: [
            { id: 'a:01', secret: 'fixture-a1', ordinal: 1 },
            { id: 'a:02', secret: 'fixture-a2', ordinal: 2 },
          ],
        },
        {
          id: 'b', baseUrl: routeB.baseUrl, model: 'model-b',
          credentials: [{ id: 'b:01', secret: 'fixture-b1', ordinal: 1 }],
        },
      ],
    };
    const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
    const controller = new NativeAgentController(
      runtime, { memoryService: memory, learningService: learning }, config,
    );
    const chat = await AgentChatService.initialize(root, runtime, controller);
    const created = await chat.createConversation({ workspace: 'fixture' });
    const events: AgentChatEventEnvelope[] = [];
    // The automatic resume timer has no stream of its own; give it one so window 2 is observable.
    const resumeTurn = chat.resumeTurn.bind(chat);
    (chat as any).resumeTurn = (input: any) => resumeTurn({
      ...input, eventSink: (event: AgentChatEventEnvelope) => { events.push(event); },
    });
    const windowStates: any[] = [];
    const runConversationTurn = controller.runConversationTurn.bind(controller);
    vi.spyOn(controller, 'runConversationTurn').mockImplementation(async (input: any) => {
      windowStates.push(structuredClone(input.continuation?.state ?? null));
      return runConversationTurn(input);
    });

    // Window 1: sibling-first inside provider a; the two-attempt window ends without claiming exhaustion elsewhere.
    const first = await chat.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'window-request-1',
      prompt: 'Rotate across keys, then continue.',
      eventSink: event => { events.push(event); },
    });
    expect(first.status).toBe('resumable');
    expect(routeA.auths).toEqual(['Bearer fixture-a1', 'Bearer fixture-a2']);
    expect(routeB.auths).toEqual([]);
    const decisions = events.filter(event => event.type === 'provider.route.decision').map(event => event.routing! as any);
    expect(decisions.map(item => [item.type, item.to?.credentialId ?? item.key?.credentialId ?? null])).toEqual([
      ['attempt', 'a:01'], ['failure', 'a:01'], ['attempt', 'a:02'], ['failure', 'a:02'], ['paused', null],
    ]);
    expect(decisions.every(item => item.taskId === first.taskId)).toBe(true);
    expect(events.every(event => event.requestId === 'window-request-1' && event.turnId === first.turnId)).toBe(true);
    expect(decisions[2]).toMatchObject({ transition: 'sibling-key', cause: 'RATE_LIMIT', totalAttempts: 2, maxTotalAttempts: 8 });
    expect(decisions[4]).toMatchObject({ reason: 'attempt-budget', attempt: 2, attemptLimit: 2, totalAttempts: 2 });
    expect(decisions[4].routes.find((route: any) => route.providerId === 'a'))
      .toMatchObject({ configured: 2, eligible: 0, status: 'all-limit-or-quota', attempts: 2 });
    expect(decisions[4].routes.find((route: any) => route.providerId === 'b'))
      .toMatchObject({ configured: 1, eligible: 1, status: 'available', attempts: 0 });
    expect(events.some(event => event.type === 'provider.waiting' && event.code === 'attempt-budget')).toBe(true);

    const store = (chat as any).store;
    const paused = store.getCheckpoint(first.turnId)!;
    const pausedState = parseAgentTurnCheckpoint(paused.payloadJson, paused.payloadDigest);
    expect(pausedState.routeTrail!.map(line => JSON.parse(line).type)).toEqual(['attempt', 'failure', 'attempt', 'failure', 'paused']);

    // Window 2 resumes the same turn automatically: a's cooldown is honored and b serves.
    await waitFor(() => store.getTurn(first.turnId)?.status === 'finalized', 20_000);
    // The status flips before the resumed run releases its execution slot; settle it before assertions and teardown.
    await waitFor(() => chat.health().runningTurnCount === 0, 10_000);
    expect(windowStates).toHaveLength(2);
    expect(windowStates[0]).toBeNull();
    expect(windowStates[1].providerAttemptsConsumed).toBe(2);
    expect(windowStates[1].routeTrail.map((line: string) => JSON.parse(line).type))
      .toEqual(['attempt', 'failure', 'attempt', 'failure', 'paused']);
    expect(routeA.auths).toEqual(['Bearer fixture-a1', 'Bearer fixture-a2']);
    expect(routeB.auths).toEqual(['Bearer fixture-b1']);
    expect(chat.getConversation(created.conversation.id)?.messages.filter(item => item.role === 'assistant')
      .map(item => item.content)).toEqual(['window-two-result']);
    const windowTwo = events.filter(event => event.type === 'provider.route.decision')
      .map(event => event.routing! as any).slice(5);
    expect(windowTwo).toHaveLength(1);
    expect(windowTwo[0]).toMatchObject({
      type: 'attempt', attempt: 1, attemptLimit: 2, transition: 'provider-switch', totalAttempts: 3, taskId: first.taskId,
      from: { providerId: 'a', credentialId: 'a:02' },
      to: { providerId: 'b', credentialId: 'b:01', model: 'model-b' },
      left: { providerId: 'a', reason: 'siblings-unavailable',
        diagnostics: { configured: 2, eligible: 0, status: 'all-limit-or-quota' } },
    });
    expect(events.every(event => event.requestId === 'window-request-1')).toBe(true);
    expect(JSON.stringify([events, windowStates])).not.toMatch(/fixture-[ab][12]|Bearer/i);
  }, 45_000);

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

  it('ends the runtime task when a stop lands after the task exists but before the model loop starts', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('provider should not be called after stop');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { runtime, chat } = await settleFixture();
    const created = await chat.createConversation({ workspace: 'fixture' });
    let stopAccepted = false;

    await expect(chat.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'stop-after-planning-1',
      prompt: 'Stop as soon as planning starts.',
      eventSink: event => {
        if (event.type === 'agent.planning') stopAccepted = chat.stopTurn(event.turnId);
      },
    })).rejects.toThrow('AGENT_RUNTIME_TURN_STOPPED');

    expect(stopAccepted).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const turn = chat.getConversation(created.conversation.id)!.turns[0]!;
    expect(turn.status).toBe('stopped');
    expect(await runtime.getTask(turn.runtimeTaskId)).toEqual(expect.objectContaining({
      status: 'finalized',
      terminalOutcome: 'failed',
    }));
    await chat.archiveConversation(created.conversation.id);
    expect((await runtime.getSession(created.conversation.runtimeSessionId))?.status).toBe('closed');
  });

  it('archives a conversation whose stopped turn left a running task without an executor', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'orphan-archive', { stopped: true });
    await expect(fixture.runtime.closeSession(orphan.sessionId))
      .rejects.toThrow('AGENT_RUNTIME_SESSION_HAS_RUNNING_TASK');

    await fixture.chat.archiveConversation(orphan.conversationId);

    expect(await fixture.runtime.getTask(orphan.taskId)).toEqual(expect.objectContaining({
      status: 'finalized',
      terminalOutcome: 'failed',
    }));
    expect((await fixture.runtime.getSession(orphan.sessionId))?.status).toBe('closed');
    expect(fixture.chat.store.getConversation(orphan.conversationId)?.status).toBe('archived');
  });

  it('starts the next turn in a conversation whose stopped turn left a running task', async () => {
    const requests: any[] = [];
    const baseUrl = await startProvider(requests);
    const fixture = await settleFixture(baseUrl);
    const orphan = await orphanTask(fixture, 'orphan-send', { stopped: true });

    const next = await fixture.chat.runTurn({
      conversationId: orphan.conversationId,
      clientRequestId: 'orphan-send-next',
      prompt: 'Continue after the stop.',
    });

    expect(next).toEqual(expect.objectContaining({
      status: 'finalized',
      response: 'Alpha context established.',
    }));
    expect(requests).toHaveLength(1);
    expect(await fixture.runtime.getTask(orphan.taskId)).toEqual(expect.objectContaining({
      status: 'finalized',
      terminalOutcome: 'failed',
    }));
  });

  it('settles a running task left by a stopped turn when the chat service starts', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'orphan-start', { stopped: true });
    expect((await fixture.runtime.getTask(orphan.taskId))?.status).toBe('running');

    const restarted = await AgentChatService.initialize(fixture.root, fixture.runtime, fixture.controller);

    expect(await fixture.runtime.getTask(orphan.taskId)).toEqual(expect.objectContaining({
      status: 'finalized',
      terminalOutcome: 'failed',
    }));
    await restarted.archiveConversation(orphan.conversationId);
    expect((await fixture.runtime.getSession(orphan.sessionId))?.status).toBe('closed');
  });

  it('settles the task of a turn that is stopped while no executor owns it', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'orphan-stop', { stopped: false });

    expect(fixture.chat.stopTurn(orphan.turnId)).toBe(true);

    await waitForAsync(async () => (await fixture.runtime.getTask(orphan.taskId))?.status === 'finalized', 10_000);
    expect((await fixture.runtime.getTask(orphan.taskId))?.terminalOutcome).toBe('failed');
  });

  it('leaves the running task of a live turn alone when archiving is refused', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'live-turn', { stopped: false });

    await expect(fixture.chat.archiveConversation(orphan.conversationId))
      .rejects.toThrow('AGENT_CHAT_CONVERSATION_BUSY');

    expect((await fixture.runtime.getTask(orphan.taskId))?.status).toBe('running');
    expect(fixture.chat.store.getTurn(orphan.turnId)?.status).toBe('running');
  });

  it('archives right after a stop even when the stop settled the task between the failed close and the sweep', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'race-stop-archive', { stopped: false });
    const realMark = fixture.runtime.markTerminal.bind(fixture.runtime);
    let releaseMark!: () => void;
    const markGate = new Promise<void>(resolve => { releaseMark = resolve; });
    vi.spyOn(fixture.runtime, 'markTerminal').mockImplementation(async input => {
      await markGate;
      return realMark(input);
    });
    const realClose = fixture.runtime.closeSession.bind(fixture.runtime);
    let closes = 0;
    vi.spyOn(fixture.runtime, 'closeSession').mockImplementation(async sessionId => {
      closes += 1;
      if (closes > 1) return realClose(sessionId);
      // The first close reads the state while the stop's settle is parked; the settle then lands before the
      // sweep starts, so the sweep finds nothing running although the session was refused a moment ago.
      const failure = await realClose(sessionId).then(() => null, error => error as Error);
      releaseMark();
      await waitForAsync(async () => (await fixture.runtime.getTask(orphan.taskId))?.status === 'finalized', 10_000);
      if (failure) throw failure;
      return realClose(sessionId);
    });

    expect(fixture.chat.stopTurn(orphan.turnId)).toBe(true);
    await fixture.chat.archiveConversation(orphan.conversationId);

    expect(closes).toBe(2);
    expect((await fixture.runtime.getSession(orphan.sessionId))?.status).toBe('closed');
    expect(fixture.chat.store.getConversation(orphan.conversationId)?.status).toBe('archived');
  });

  it('lets a concurrent archive join the settle a stop already started instead of settling the task twice', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'join-settle', { stopped: false });
    const realMark = fixture.runtime.markTerminal.bind(fixture.runtime);
    let releaseMark!: () => void;
    const markGate = new Promise<void>(resolve => { releaseMark = resolve; });
    const mark = vi.spyOn(fixture.runtime, 'markTerminal').mockImplementation(async input => {
      await markGate;
      return realMark(input);
    });
    const finalize = vi.spyOn(fixture.runtime, 'finalizeTask');

    expect(fixture.chat.stopTurn(orphan.turnId)).toBe(true);
    const archiving = fixture.chat.archiveConversation(orphan.conversationId);
    setTimeout(releaseMark, 100);
    await archiving;

    expect(mark).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(await fixture.runtime.getTask(orphan.taskId)).toEqual(expect.objectContaining({
      status: 'finalized',
      terminalOutcome: 'failed',
    }));
    expect((await fixture.runtime.getSession(orphan.sessionId))?.status).toBe('closed');
  });

  it('does not finalize a task that another settler already ended', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'lost-race', { stopped: true });
    vi.spyOn(fixture.runtime, 'markTerminal').mockRejectedValue(new Error('AGENT_RUNTIME_TASK_NOT_RUNNING'));
    const finalize = vi.spyOn(fixture.runtime, 'finalizeTask');

    const settled = await (fixture.chat as any).settleEndedTurnTask(orphan.turnId, orphan.taskId);

    expect(settled).toBe(false);
    expect(finalize).not.toHaveBeenCalled();
  });

  it('survives a failing store query at startup and reports the original conflict on archive', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'store-failure', { stopped: true });
    const query = vi.spyOn(AgentChatStore.prototype, 'listEndedTurnTasks').mockImplementation(() => {
      throw new Error('SQLITE_BUSY');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const restarted = await AgentChatService.initialize(fixture.root, fixture.runtime, fixture.controller);
      expect(restarted).toBeInstanceOf(AgentChatService);
      await expect(restarted.archiveConversation(orphan.conversationId))
        .rejects.toThrow('AGENT_RUNTIME_SESSION_HAS_RUNNING_TASK');
    } finally {
      query.mockRestore();
      logged.mockRestore();
    }

    await fixture.chat.archiveConversation(orphan.conversationId);
    expect((await fixture.runtime.getSession(orphan.sessionId))?.status).toBe('closed');
  });

  it('does not hold a turn open while finalization hangs, and the session can still be archived', async () => {
    const fixture = await settleFixture();
    const orphan = await orphanTask(fixture, 'hung-finalize', { stopped: true });
    (fixture.chat as any).settleWaitMs = 25;
    vi.spyOn(fixture.runtime, 'finalizeTask').mockImplementation(() => new Promise(() => undefined));

    const started = Date.now();
    await (fixture.chat as any).settleIfEnded(orphan.turnId);

    expect(Date.now() - started).toBeLessThan(5_000);
    expect((await fixture.runtime.getTask(orphan.taskId))?.status).toBe('failed');
    await fixture.chat.archiveConversation(orphan.conversationId);
    expect((await fixture.runtime.getSession(orphan.sessionId))?.status).toBe('closed');
  });

  it('keeps a newer executor registration when an older executor of the same turn finishes', async () => {
    const requests: any[] = [];
    const baseUrl = await startProvider(requests);
    const fixture = await settleFixture(baseUrl);
    const created = await fixture.chat.createConversation({ workspace: 'fixture' });
    const newer = new AbortController();
    let turnId = '';

    await fixture.chat.runTurn({
      conversationId: created.conversation.id,
      clientRequestId: 'identity-delete-1',
      prompt: 'Finish while another executor registered for the same turn.',
      eventSink: event => {
        if (event.type === 'agent.planning') {
          turnId = event.turnId;
          (fixture.chat as any).activeTurns.set(event.turnId, newer);
        }
      },
    });

    expect(turnId).not.toBe('');
    expect((fixture.chat as any).activeTurns.get(turnId)).toBe(newer);
    (fixture.chat as any).activeTurns.delete(turnId);
  });
});

describe('AgentChatService manual compaction request', () => {
  it('schedules only for a running turn and hands the flag to the controller exactly once', async () => {
    const fixture = await settleFixture();
    const created = await fixture.chat.createConversation({ workspace: 'fixture' });
    let runningTurnId = '';
    const observed: Array<'scheduled' | 'not-running' | boolean> = [];
    vi.spyOn(fixture.controller, 'runConversationTurn').mockImplementationOnce(async input => {
      runningTurnId = input.continuation!.turnId;
      expect(fixture.chat.store.getTurn(runningTurnId)?.status).toBe('running');
      observed.push(fixture.chat.requestCompaction(runningTurnId));
      observed.push(input.continuation!.consumeCompactionRequest!());
      observed.push(input.continuation!.consumeCompactionRequest!());
      observed.push(fixture.chat.requestCompaction(runningTurnId));
      throw new Error('FIXTURE_COMPACTION_CHECKED');
    });
    await expect(fixture.chat.runTurn({ conversationId: created.conversation.id,
      clientRequestId: 'compact-request', prompt: 'Grow the context.' })).rejects.toThrow('FIXTURE_COMPACTION_CHECKED');
    expect(observed).toEqual(['scheduled', true, false, 'scheduled']);
    expect(fixture.chat.store.getTurn(runningTurnId)?.status).toBe('failed');
    expect(fixture.chat.requestCompaction(runningTurnId)).toBe('not-running');
    expect(fixture.chat.requestCompaction('no-such-turn')).toBe('not-running');
    expect((fixture.chat as any).compactionRequestedTurns.has(runningTurnId)).toBe(false);
  });
});
