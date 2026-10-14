import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server =>
    new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map(root =>
    rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-ui-transport-'));
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
    getConversation: vi.fn(() => ({
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
    stopTurn: vi.fn(() => true),
    archiveConversation: vi.fn(async () => undefined),
  };
  const server = createServer(createHttpHandler({
    keyStore,
    security,
    agentUiToken: 'fixture-ui-token',
    agentRun,
    agentChat: agentChat as any,
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
  });
});
