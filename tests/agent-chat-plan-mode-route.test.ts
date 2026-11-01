import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';

const UI_TOKEN = 'fixture-ui-token';
const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function routeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-chat-plan-mode-route-'));
  roots.push(root);
  const runTurn = vi.fn(async (_input: any) => ({
    conversationId: 'conversation-1', turnId: 'turn-1', taskId: 'task-1', status: 'finalized',
    response: 'ok', iterations: 1, retrievalAttemptIds: [], replayed: false,
  }));
  const agentChat = { runTurn, listProviders: vi.fn(() => []), validateProviderModel: vi.fn(), validateReasoningEffort: vi.fn() };
  const server = createServer(createHttpHandler({
    keyStore: new FileKeyStore(path.join(root, 'auth')),
    security: new HttpSecurityPolicy({ publicBaseUrl: null, protectedResourceUrl: null, trustProxy: true, allowedOrigins: [] }),
    agentUiToken: UI_TOKEN,
    agentChat: agentChat as any,
    mcpHandler: async (_request, response) => { response.writeHead(200); response.end('{}'); },
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = (body: object) => fetch(`${baseUrl}/agent/chat/conversations/conversation-1/turns`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent-core-ui-token': UI_TOKEN },
    body: JSON.stringify({ clientRequestId: 'plan-mode-route', prompt: 'Draft a plan.', ...body }),
  });
  return { runTurn, send };
}

describe('POST /agent/chat/conversations/:id/turns planMode', () => {
  it('refuses a non-boolean planMode with 400 and never runs the turn', async () => {
    const { runTurn, send } = await routeFixture();
    for (const planMode of ['yes', 1, {}, []]) {
      const response = await send({ planMode });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_agent_chat_plan_mode' });
    }
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('refuses goalMode and planMode together with 400 and never runs the turn', async () => {
    const { runTurn, send } = await routeFixture();
    const response = await send({ goalMode: true, planMode: true });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'agent_chat_goal_and_plan_mode_exclusive' });
    expect(runTurn).not.toHaveBeenCalled();
  });

  it('passes planMode true through to the service, and omits it (like goalMode) when false or absent', async () => {
    const { runTurn, send } = await routeFixture();
    const on = await send({ planMode: true });
    expect(on.status).toBe(200);
    await on.text();
    expect(runTurn.mock.calls[0]![0]).toMatchObject({ planMode: true });

    runTurn.mockClear();
    const off = await send({ planMode: false });
    expect(off.status).toBe(200);
    await off.text();
    expect(runTurn.mock.calls[0]![0]).not.toHaveProperty('planMode');

    runTurn.mockClear();
    const absent = await send({});
    expect(absent.status).toBe(200);
    await absent.text();
    expect(runTurn.mock.calls[0]![0]).not.toHaveProperty('planMode');
  });
});
