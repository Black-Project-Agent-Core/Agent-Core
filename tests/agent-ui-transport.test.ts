import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler, type HttpHandlerOptions } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { validateAgentProviderModel } from '../src/agent-provider.js';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server =>
    new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(root =>
    rm(root, { recursive: true, force: true })));
});

async function setup(dreaming?: HttpHandlerOptions['dreaming']) {
  const fixtureDir = new URL('../runtime/tmp/', import.meta.url);
  await mkdir(fixtureDir, { recursive: true });
  const root = await mkdtemp(new URL('agent-core-ui-transport-', fixtureDir));
  roots.push(root);
  const keyStore = new FileKeyStore(path.join(root, 'auth'));
  const security = new HttpSecurityPolicy({
    publicBaseUrl: null, protectedResourceUrl: null, trustProxy: true, allowedOrigins: [],
  });
  const agentRun = vi.fn(async (input: { prompt: string; workspace?: string }) => ({
    sessionId: 'session-1',
    taskId: 'task-1',
    response: `handled:${input.prompt}`,
    status: 'finalized',
    iterations: 2,
    retrievalAttemptIds: ['attempt-1'],
  }));
  const conversation = {
    id: 'conversation-1',
    runtimeSessionId: 'session-chat-1',
    workspace: 'agent-core',
    title: 'Fixture Chat',
    status: 'active',
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  const agentChat = {
    listConversations: vi.fn(() => [conversation]),
    createConversation: vi.fn(async () => ({
      conversation, turns: [], messages: [],
    })),
    readConversation: vi.fn(async () => ({
      conversation, turns: [], messages: [],
    })),
    runTurn: vi.fn(async (input: any) => {
      await input.eventSink?.({
        type: 'memory.recall.completed',
        at: new Date(0).toISOString(),
        conversationId: conversation.id,
        turnId: 'turn-1',
        itemCount: 2,
      });
      return {
        conversationId: conversation.id,
        turnId: 'turn-1',
        taskId: 'task-chat-1',
        status: 'finalized',
        response: 'chat complete',
        providerId: 'fixture-provider',
        model: 'fixture-model',
        iterations: 1,
        retrievalAttemptIds: ['attempt-chat-1'],
        replayed: false,
      };
    }),
    listProviders: vi.fn(() => [{ id: 'atria', model: 'Atria-Dawn', configured: true, available: true }]),
    refreshProviderCapabilities: vi.fn(async () => undefined),
    readStepDetail: vi.fn((turnId: string, seq: number) => turnId === 'turn-1' && seq === 2
      ? { inputText: '{"path":"a.ts"}', outputText: 'ok', inputTruncated: false, outputTruncated: false } : null),
    getLastSelection: vi.fn((): unknown => undefined),
    recordOwnerSelection: vi.fn((body: Record<string, unknown>) => ({ providerId: String(body.providerId), model: String(body.model ?? ''), reasoningEffort: body.reasoningEffort ?? 'auto', updatedAtMs: 1 })),
    validateProviderModel: vi.fn((model: unknown, providerId?: string) =>
      validateAgentProviderModel(model, providerId, ['claude-sonnet-5-5', 'claude-opus-5-5'])),
    stopTurn: vi.fn(() => true),
    archiveConversation: vi.fn(async () => undefined),
  };
  const server = createServer(createHttpHandler({
    keyStore,
    security,
    agentUiToken: 'fixture-ui-token',
    agentRun,
    agentChat: agentChat as any,
    dreaming,
    mcpHandler: async (_request, response) => {
      response.writeHead(200);
      response.end('{}');
    },
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { baseUrl, agentRun, agentChat };
}

describe('launcher-only native agent HTTP transport', () => {
  it('connects Dreaming status and one REM-only run to the canonical owner', async () => {
    const status = { enabled: true, loopRunning: true, busy: false, intervalMs: 1800000 };
    const dreaming = { dreamingStatus: vi.fn(() => status), runCognitiveMaintenance: vi.fn(async () => undefined) } as any;
    const { baseUrl } = await setup(dreaming);
    const headers = { 'x-agent-core-ui-token': 'fixture-ui-token' };
    const read = await fetch(`${baseUrl}/agent/dreaming`, { headers });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual(status);
    const run = await fetch(`${baseUrl}/agent/dreaming`, { method: 'POST', headers });
    expect(run.status).toBe(200);
    expect(dreaming.runCognitiveMaintenance).toHaveBeenCalledExactlyOnceWith({ apply: true, remOnly: true });
  });

  it('refuses unauthenticated/external Dreaming mutation and disabled or busy engines', async () => {
    const status = { enabled: false, loopRunning: false, busy: false, intervalMs: 1800000 };
    const dreaming = { dreamingStatus: vi.fn(() => status), runCognitiveMaintenance: vi.fn() } as any;
    const { baseUrl } = await setup(dreaming);
    expect((await fetch(`${baseUrl}/agent/dreaming`, { method: 'POST' })).status).toBe(401);
    const headers = { 'x-agent-core-ui-token': 'fixture-ui-token' };
    expect((await fetch(`${baseUrl}/agent/dreaming`, { method: 'POST', headers: { ...headers, 'x-agent-core-chat-origin': 'external-controller' } })).status).toBe(403);
    expect((await fetch(`${baseUrl}/agent/dreaming`, { method: 'POST', headers })).status).toBe(409);
    status.enabled = true; status.busy = true;
    expect((await fetch(`${baseUrl}/agent/dreaming`, { method: 'POST', headers })).status).toBe(409);
    expect(dreaming.runCognitiveMaintenance).not.toHaveBeenCalled();
  });

  it('validates an explicit model before dispatch and forwards it without changing omitted defaults', async () => {
    const { baseUrl, agentChat } = await setup();
    const send = (body: object) => fetch(`${baseUrl}/agent/chat/conversations/conversation-1/turns`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-core-ui-token': 'fixture-ui-token' },
      body: JSON.stringify({ clientRequestId: 'model-http', prompt: 'Fixture', ...body }),
    });
    for (const body of [{ providerId: 'anthropic', model: null }, { providerId: 'anthropic', model: 4 },
      { providerId: 'anthropic', model: '../model' }, { providerId: 'anthropic', model: 'unknown' },
      { providerId: 'auto', model: 'claude-opus-5-5' }]) expect((await send(body)).status).toBe(400);
    expect(agentChat.runTurn).not.toHaveBeenCalled();
    const selected = await send({ providerId: 'anthropic', model: 'claude-opus-5-5' });
    expect(selected.status).toBe(200); await selected.text();
    expect(agentChat.runTurn).toHaveBeenLastCalledWith(expect.objectContaining({ providerRoute: 'anthropic', providerModel: 'claude-opus-5-5' }));
    await (await send({ providerId: 'anthropic' })).text();
    expect(agentChat.runTurn.mock.calls.at(-1)![0]).not.toHaveProperty('providerModel');
  });

  it('binds the external origin header and rejects callers claiming local operator origin', async () => {
    const { baseUrl, agentChat } = await setup();
    const send = (origin: string) => fetch(`${baseUrl}/agent/chat/conversations/conversation-1/turns`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-core-ui-token': 'fixture-ui-token',
        'x-agent-core-chat-origin': origin }, body: JSON.stringify({ clientRequestId: 'origin-test', prompt: '/skill approve test' }),
    });
    const external = await send('external-controller');
    expect(external.status).toBe(200); await external.text();
    expect(agentChat.runTurn).toHaveBeenCalledWith(expect.objectContaining({ messageOrigin: 'external-controller' }));
    const spoof = await send('local-operator');
    expect(spoof.status).toBe(400);
    expect(agentChat.runTurn).toHaveBeenCalledTimes(1);
  });
  it('requires the ephemeral UI token and forwards a bounded loopback request', async () => {
    const { baseUrl, agentRun } = await setup();
    const missing = await fetch(`${baseUrl}/agent/run`, {
      method: 'POST', body: JSON.stringify({ prompt: 'inspect fixture' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(missing.status).toBe(401);

    const response = await fetch(`${baseUrl}/agent/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-core-ui-token': 'fixture-ui-token',
      },
      body: JSON.stringify({ prompt: ' inspect fixture ', workspace: ' agent-core ' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      sessionId: 'session-1', taskId: 'task-1',
      response: 'handled:inspect fixture', status: 'finalized',
    }));
    expect(agentRun).toHaveBeenCalledWith({ prompt: 'inspect fixture', workspace: 'agent-core' });
  });

  it('rejects a proxy-identified non-loopback caller even with the UI token', async () => {
    const { baseUrl, agentRun } = await setup();
    const response = await fetch(`${baseUrl}/agent/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-core-ui-token': 'fixture-ui-token',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ prompt: 'never run' }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'loopback_required' });
    expect(agentRun).not.toHaveBeenCalled();
  });

  it('surfaces native runtime configuration failures without echoing the UI token', async () => {
    const { baseUrl, agentRun } = await setup();
    agentRun.mockRejectedValueOnce(new Error('AGENT_RUNTIME_PROVIDER_NOT_CONFIGURED'));
    const response = await fetch(`${baseUrl}/agent/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-core-ui-token': 'fixture-ui-token',
      },
      body: JSON.stringify({ prompt: 'run task' }),
    });
    const body = await response.text();
    expect(response.status).toBe(503);
    expect(body).toContain('AGENT_RUNTIME_PROVIDER_NOT_CONFIGURED');
    expect(body).not.toContain('fixture-ui-token');
  });

  it('protects conversation routes with the same loopback UI-token boundary', async () => {
    const { baseUrl, agentChat } = await setup();
    const missing = await fetch(`${baseUrl}/agent/chat/conversations`);
    expect(missing.status).toBe(401);

    const created = await fetch(`${baseUrl}/agent/chat/conversations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-core-ui-token': 'fixture-ui-token',
      },
      body: JSON.stringify({ workspace: 'agent-core' }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual(expect.objectContaining({
      conversation: expect.objectContaining({ id: 'conversation-1' }),
    }));
    expect(agentChat.createConversation).toHaveBeenCalledWith({
      workspace: 'agent-core',
    });

    const evidence = { status: 'unavailable', taskId: 'task-chat-1', records: [], truncated: false,
      attribution: 'controller-declared', goalVerification: 'not-established' };
    agentChat.readConversation.mockResolvedValueOnce({ conversation: { id: 'conversation-1' }, turns: [], messages: [], decisionEvidence: evidence } as any);
    const detail = await fetch(`${baseUrl}/agent/chat/conversations/conversation-1`, {
      headers: { 'x-agent-core-ui-token': 'fixture-ui-token' },
    });
    expect((await detail.json()).decisionEvidence).toEqual(evidence);
    expect(agentChat.readConversation).toHaveBeenCalledWith('conversation-1');

    const proxied = await fetch(`${baseUrl}/agent/chat/conversations`, {
      headers: {
        'x-agent-core-ui-token': 'fixture-ui-token',
        'x-forwarded-for': '203.0.113.10',
      },
    });
    expect(proxied.status).toBe(403);
  });

  it('streams safe chat events and a finalized result as NDJSON', async () => {
    const { baseUrl, agentChat } = await setup();
    const response = await fetch(
      `${baseUrl}/agent/chat/conversations/conversation-1/turns`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-agent-core-ui-token': 'fixture-ui-token',
        },
        body: JSON.stringify({
          clientRequestId: 'request-chat-1',
          prompt: 'Inspect the fixture.',
        }),
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const text = await response.text();
    const lines = text.trim().split('\n').map(line => JSON.parse(line));
    expect(lines[0]).toEqual(expect.objectContaining({
      type: 'event',
      event: expect.objectContaining({
        type: 'memory.recall.completed',
        itemCount: 2,
      }),
    }));
    expect(lines.at(-1)).toEqual(expect.objectContaining({
      type: 'result',
      result: expect.objectContaining({
        status: 'finalized',
        response: 'chat complete',
      }),
    }));
    expect(text).not.toContain('fixture-ui-token');
    expect(agentChat.runTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      clientRequestId: 'request-chat-1',
      prompt: 'Inspect the fixture.',
    }));
    expect(agentChat.runTurn.mock.calls[0]![0]).not.toHaveProperty('providerRoute');
  });

  it('lists selectable provider routes behind the UI token and forwards a chosen route per turn', async () => {
    const { baseUrl, agentChat } = await setup();
    expect((await fetch(`${baseUrl}/agent/chat/providers`)).status).toBe(401);
    const listed = await fetch(`${baseUrl}/agent/chat/providers`, { headers: { 'x-agent-core-ui-token': 'fixture-ui-token' } });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ providers: [{ id: 'atria', model: 'Atria-Dawn', configured: true, available: true }] });
    expect(agentChat.refreshProviderCapabilities).toHaveBeenCalledTimes(1);

    const turn = (providerId: unknown) => fetch(`${baseUrl}/agent/chat/conversations/conversation-1/turns`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-core-ui-token': 'fixture-ui-token' },
      body: JSON.stringify({ clientRequestId: 'request-pin-' + String(providerId).length, prompt: 'Halo', providerId }),
    });
    expect((await turn('atria')).status).toBe(200);
    expect(agentChat.runTurn).toHaveBeenLastCalledWith(expect.objectContaining({ providerRoute: 'atria' }));
    await (await turn('auto')).text();
    expect(agentChat.runTurn.mock.calls.at(-1)![0]).not.toHaveProperty('providerRoute');
    expect((await turn('bad route!')).status).toBe(400);
    expect((await turn(42)).status).toBe(400);
  });

  it('reports the last owner selection with the providers and records a new one for the owner only', async () => {
    const { baseUrl, agentChat } = await setup();
    const headers = { 'content-type': 'application/json', 'x-agent-core-ui-token': 'fixture-ui-token' };
    const providers = () => fetch(`${baseUrl}/agent/chat/providers`, { headers }).then(response => response.json() as Promise<Record<string, unknown>>);
    expect(await providers()).not.toHaveProperty('selection');
    const saved = { providerId: 'atria', model: '', reasoningEffort: 'high', updatedAtMs: 7 };
    agentChat.getLastSelection.mockReturnValueOnce(saved);
    expect((await providers()).selection).toEqual(saved);

    const put = (init: RequestInit) => fetch(`${baseUrl}/agent/chat/selection`, { method: 'PUT', ...init });
    expect((await fetch(`${baseUrl}/agent/chat/selection`, { headers })).status).toBe(405);
    expect((await put({ headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);
    expect((await put({ headers: { ...headers, 'x-agent-core-chat-origin': 'external-controller' }, body: '{}' })).status).toBe(403);
    expect((await put({ headers, body: '{bad' })).status).toBe(400);
    const body = { providerId: 'atria', model: '', reasoningEffort: 'high' };
    expect((await put({ headers, body: JSON.stringify(body) })).status).toBe(200);
    expect(agentChat.recordOwnerSelection).toHaveBeenCalledWith(body);
    agentChat.recordOwnerSelection.mockImplementationOnce(() => { throw new Error('agent_chat_selection_invalid'); });
    expect((await put({ headers, body: '{}' })).status).toBe(400);
  });

  it('serves the full Input and Output of one persisted tool step to the owner only', async () => {
    const { baseUrl } = await setup();
    const headers = { 'x-agent-core-ui-token': 'fixture-ui-token' };
    const step = (path: string, init: RequestInit = {}) => fetch(`${baseUrl}/agent/chat/steps/${path}`, { headers, ...init });
    const found = await step('turn-1/2');
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ inputText: '{"path":"a.ts"}', outputText: 'ok', inputTruncated: false, outputTruncated: false });
    expect((await step('turn-1/9')).status).toBe(404);
    expect((await step('turn-1/2', { method: 'POST' })).status).toBe(405);
    expect((await step('turn-1/2', { headers: { ...headers, 'x-agent-core-chat-origin': 'external-controller' } })).status).toBe(403);
    expect((await fetch(`${baseUrl}/agent/chat/steps/turn-1/2`)).status).toBe(401);
  });
});
