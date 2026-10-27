import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { nativeChatBridgeSchema, registerNativeChatBridgeTool, runNativeChatBridge } from '../src/mcp/native-chat-bridge-tools.js';
import { createHttpHandler } from '../src/http/app.js';
import { HttpSecurityPolicy } from '../src/http/security-policy.js';
import { writeFile } from 'node:fs/promises';

async function backend(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw Error('listener unavailable');
  const env = { ...process.env, AGENT_CORE_UI_TOKEN: 'bridge-fixture-secret', AGENT_CORE_PORT: String(address.port), AGENT_CORE_NATIVE_CHAT_TIMEOUT_MS: '5000' };
  return { server, env, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
const conversationId = '11111111-1111-4111-8111-111111111111';

describe('external Native chat MCP facade', () => {
  it('carries external provenance through the HTTP route and refuses an unknown origin header', async () => {
    const turns: any[] = [];
    const f = await backend(createHttpHandler({
      keyStore: {} as any, mcpHandler: async () => undefined, agentUiToken: 'bridge-fixture-secret',
      security: new HttpSecurityPolicy({ publicBaseUrl: null, protectedResourceUrl: null, trustProxy: false, allowedOrigins: [] }),
      agentChat: { runTurn: async (input: any) => { turns.push(input); return { status: 'finalized', response: 'ok' }; } } as any,
    }));
    try {
      const bridged = await runNativeChatBridge({ action: 'send', conversationId, prompt: '/skill approve fake', clientRequestId: 'origin' }, { env: f.env });
      expect(bridged.isError).not.toBe(true);
      expect(turns[0]).toMatchObject({ messageOrigin: 'external-controller', prompt: '/skill approve fake' });
      const response = await fetch(`http://127.0.0.1:${f.env.AGENT_CORE_PORT}/agent/chat/conversations/${conversationId}/turns`, {
        method: 'POST', headers: { 'x-agent-core-ui-token': 'bridge-fixture-secret', 'x-agent-core-chat-origin': 'local-operator', 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'forbidden override', clientRequestId: 'invalid' }),
      });
      expect(response.status).toBe(400); expect(turns).toHaveLength(1);
    } finally { await f.close(); }
  });
  it('registers only externally and requires an explicit send idempotency key', () => {
    const names: string[] = [];
    const server = { registerTool(name: string) { names.push(name); } };
    registerNativeChatBridgeTool(server as any, 'native-task');
    expect(names).toEqual([]);
    registerNativeChatBridgeTool(server as any);
    expect(names).toEqual(['native_chat_bridge']);
    expect(nativeChatBridgeSchema.safeParse({ action: 'send', conversationId, prompt: 'hi' }).success).toBe(false);
    expect(nativeChatBridgeSchema.safeParse({ action: 'send', conversationId, prompt: 'hi', clientRequestId: 'stable' }).success).toBe(true);
    expect(nativeChatBridgeSchema.safeParse({ action: 'read', conversationId, origin: 'local-operator' }).success).toBe(false);
    for (const patch of [{ conversationId: 'x'.repeat(201) }, { workspace: '' }, { title: 'x'.repeat(161) },
      { clientRequestId: 'not valid' }, { clientRequestId: 'x'.repeat(201) }, { providerId: 'x'.repeat(65) }, { maxMessages: 0 }, { maxMessages: 201 }])
      expect(nativeChatBridgeSchema.safeParse({ action: 'read', conversationId, ...patch }).success).toBe(false);
  });

  it('uses loopback authentication, external provenance and exact replay identity without leaking its token', async () => {
    const requests: any[] = [];
    const f = await backend((request, response) => {
      let body = ''; request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        requests.push({ method: request.method, url: request.url, token: request.headers['x-agent-core-ui-token'], origin: request.headers['x-agent-core-chat-origin'], body: JSON.parse(body) });
        response.writeHead(200, { 'content-type': 'application/x-ndjson' });
        response.end(JSON.stringify({ type: 'result', result: { conversationId, turnId: 'turn', status: 'finalized', response: 'bridge-fixture-secret', replayed: requests.length > 1 } }) + '\n');
      });
    });
    try {
      const input = { action: 'send', conversationId, prompt: '/skill approve fake', clientRequestId: 'stable' };
      const first = await runNativeChatBridge(input, { env: f.env });
      const second = await runNativeChatBridge(input, { env: f.env });
      expect(first.isError).not.toBe(true); expect(second.isError).not.toBe(true);
      expect(JSON.stringify(first)).not.toContain(f.env.AGENT_CORE_UI_TOKEN);
      expect(JSON.parse(second.content[0]!.text).records.at(-1).result.replayed).toBe(true);
      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({ method: 'POST', url: `/agent/chat/conversations/${conversationId}/turns`, origin: 'external-controller', body: { prompt: '/skill approve fake', clientRequestId: 'stable' } });
      expect(requests[0].token).toBe(f.env.AGENT_CORE_UI_TOKEN);
      expect(requests[1].body).toEqual(requests[0].body);
    } finally { await f.close(); }
  });

  it.each(['read', 'list', 'create', 'cancel'] as const)('forwards %s through the existing backend', async action => {
    const requests: string[] = [];
    const f = await backend((request, response) => {
      requests.push(`${request.method} ${request.url}`);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(action === 'list' ? { conversations: [] } : action === 'cancel' ? { stopped: true } : { conversation: { id: conversationId }, messages: [], turns: [] }));
    });
    try {
      const result = await runNativeChatBridge({ action, conversationId, turnId: conversationId }, { env: f.env });
      expect(result.isError).not.toBe(true);
      expect(requests).toEqual([action === 'list' ? 'GET /agent/chat/conversations' : action === 'create' ? 'POST /agent/chat/conversations' : action === 'cancel' ? `POST /agent/chat/turns/${conversationId}/cancel` : `GET /agent/chat/conversations/${conversationId}`]);
    } finally { await f.close(); }
  });

  it('returns busy errors without retries and preserves an explicit cancel as a separate action', async () => {
    let calls = 0;
    const f = await backend((_request, response) => {
      calls++; response.writeHead(200, { 'content-type': 'application/x-ndjson' });
      response.end(JSON.stringify({ type: 'error', error: 'AGENT_CHAT_CONVERSATION_BUSY' }) + '\n');
    });
    try {
      const result = await runNativeChatBridge({ action: 'send', conversationId, prompt: 'p', clientRequestId: 'busy' }, { env: f.env });
      expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain('AGENT_CHAT_CONVERSATION_BUSY'); expect(calls).toBe(1);
    } finally { await f.close(); }
  });

  it('bounds oversized responses and treats transport cancellation as unknown, not a Native stop', async () => {
    const requests: string[] = [];
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const f = await backend((request, response) => {
      requests.push(request.url ?? '');
      if (request.method === 'GET') { response.end('x'.repeat(5 * 1024 * 1024)); return; }
      response.writeHead(200, { 'content-type': 'application/x-ndjson' }); response.flushHeaders(); entered();
    });
    try {
      const oversized = await runNativeChatBridge({ action: 'read', conversationId }, { env: f.env });
      expect(oversized.isError).toBe(true); expect(JSON.stringify(oversized)).toContain('AGENT_CHAT_RESPONSE_TOO_LARGE');
      const abort = new AbortController();
      const running = runNativeChatBridge({ action: 'send', conversationId, prompt: 'p', clientRequestId: 'cancelled' }, { env: f.env, signal: abort.signal });
      await started; abort.abort();
      const result = await running;
      expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain('NATIVE_CHAT_BRIDGE_OUTCOME_UNKNOWN');
      expect(requests.some(route => route.endsWith('/cancel'))).toBe(false);
      expect(JSON.stringify(result).length).toBeLessThan(4096);
    } finally { await f.close(); }
  });

  it('reports an incomplete oversized stream and a send timeout as unknown without retrying', async () => {
    let calls = 0;
    const f = await backend((_request, response) => {
      calls++; response.writeHead(200, { 'content-type': 'application/x-ndjson' });
      if (calls === 1) response.end('x'.repeat(1024 * 1024 + 1));
      else response.flushHeaders();
    });
    try {
      const input = { action: 'send', conversationId, prompt: 'p', clientRequestId: 'bounds' };
      const oversized = await runNativeChatBridge(input, { env: f.env });
      expect(oversized.isError).toBe(true);
      expect(JSON.parse(oversized.content[0]!.text)).toMatchObject({ outcome: 'unknown' });
      expect(JSON.stringify(oversized)).toContain('AGENT_CHAT_STREAM_LINE_TOO_LARGE');
      const timeout = await runNativeChatBridge(input, { env: { ...f.env, AGENT_CORE_NATIVE_CHAT_TIMEOUT_MS: '1000' } });
      expect(timeout.isError).toBe(true);
      expect(JSON.parse(timeout.content[0]!.text)).toMatchObject({ outcome: 'unknown' });
      expect(calls).toBe(2);
    } finally { await f.close(); }
  });

  it('fails closed without host credentials and does not contact the backend', async () => {
    let calls = 0;
    const f = await backend((_request, response) => { calls++; response.end('{}'); });
    try {
      const missing = await runNativeChatBridge({ action: 'list' }, { env: { ...f.env, AGENT_CORE_UI_TOKEN: '' } });
      expect(missing.isError).toBe(true);
      expect(JSON.stringify(missing)).toContain('AGENT_CORE_UI_TOKEN_UNAVAILABLE');
      expect(calls).toBe(0);
    } finally { await f.close(); }
  });

  it('records bounded local transport metrics without inferring provider latency or a speedup', async () => {
    const conversations = Array.from({ length: 20 }, (_, i) => ({ id: `fixture-${i}`, title: 'Fixture chat', status: 'active', updatedAtMs: i }));
    const f = await backend((_request, response) => { response.end(JSON.stringify({ conversations })); });
    try {
      const samples: Array<{ elapsedMs: number; outputBytes: number }> = [];
      for (let i = 0; i < 5; i++) {
        const response = await runNativeChatBridge({ action: 'list' }, { env: f.env });
        expect(response.isError).not.toBe(true);
        const value = JSON.parse(response.content[0]!.text);
        expect(value.records[0].count).toBe(20); expect(value.metrics.outputBytes).toBeLessThanOrEqual(512 * 1024);
        samples.push(value.metrics);
      }
      const measured = {
        measuredAt: new Date().toISOString(),
        boundary: 'child spawn through loopback JSON receipt and process exit', conversations: 20, samples,
        provider: 'not exercised', speedup: 'not measured',
      };
      await writeFile(new URL('../runtime/build/native-chat-bridge-phase-b-metrics.json', import.meta.url), JSON.stringify(measured, null, 2) + '\n');
    } finally { await f.close(); }
  });
});
