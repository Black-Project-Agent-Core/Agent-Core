import { createServer, request, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { BrowserExtensionBridge, ExtensionBrowserClient } from '../src/rdc/browser-control/extension-bridge.js';
import { BrowserControlService } from '../src/rdc/browser-control/service.js';
import { handleBrowserBridge } from '../src/http/browser-bridge.js';
import { browserControl } from '../src/mcp/rdc-schemas.js';
import { BrowserControlArgsSchema } from '../src/rdc/tools/schemas.js';

const ORIGIN = 'chrome-extension://' + 'a'.repeat(32);
const OTHER = 'chrome-extension://' + 'b'.repeat(32);
const servers: Server[] = [];
const clients: ExtensionBrowserClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach(c => c.close());
  await Promise.all(servers.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); })));
});
function paired(timeout = 1000) {
  const bridge = new BrowserExtensionBridge(timeout);
  const client = bridge.request('https://example.test/work'); clients.push(client);
  const token = String(bridge.pair({ code: client.code, tabId: 7, url: 'https://example.test/work' }, ORIGIN).token);
  return { bridge, client, token };
}
async function attached(timeout = 1000) {
  const result = paired(timeout);
  await result.client.poll(ORIGIN, result.token, [], [], undefined, 0);
  return result;
}

describe('existing-tab bridge grant and delivery', () => {
  it('requires a one-use code and matching extension/tab origin', () => {
    const bridge = new BrowserExtensionBridge();
    const client = bridge.request('https://example.test/work'); clients.push(client);
    expect(() => bridge.pair({ code: '0'.repeat(32), tabId: 7, url: 'https://example.test' }, ORIGIN)).toThrow('PAIR_REFUSED');
    expect(() => bridge.pair({ code: client.code, tabId: 7, url: 'https://wrong.test' }, ORIGIN)).toThrow('TAB_ORIGIN_MISMATCH');
    expect(() => bridge.pair({ code: client.code, tabId: 7, url: 'https://example.test' }, 'https://example.test')).toThrow('PAIR_REFUSED');
    const grant = bridge.pair({ code: client.code, tabId: 7, url: 'https://example.test' }, ORIGIN);
    expect(() => bridge.pair({ code: client.code, tabId: 7, url: 'https://example.test' }, ORIGIN)).toThrow('PAIR_REFUSED');
    expect(() => client.authorize(OTHER, String(grant.token))).toThrow('GRANT_REFUSED');
    expect(() => client.authorize(ORIGIN, 'wrong')).toThrow('GRANT_REFUSED');
  });

  it('rejects expired pairing and expires an attached idle grant', () => {
    let now = Date.now();
    const client = new ExtensionBrowserClient('https://example.test', 100, () => now); clients.push(client);
    now += 301_000;
    expect(() => client.pair(client.code, ORIGIN, 7, 'https://example.test')).toThrow('PAIR_REFUSED');
    const live = new ExtensionBrowserClient('https://example.test', 100, () => now); clients.push(live);
    const token = live.pair(live.code, ORIGIN, 7, 'https://example.test');
    now += 61_000;
    expect(() => live.authorize(ORIGIN, token)).toThrow('GRANT_REFUSED');
    expect(live.state).toBe('closed');
  });

  it('delivers once, correlates replies and refuses unobserved CDP methods', async () => {
    const { client, token } = await attached();
    await expect(client.send('Network.getAllCookies')).rejects.toThrow('METHOD_REFUSED');
    const sending = client.send('Page.enable');
    const first: any = await client.poll(ORIGIN, token, [], [], undefined, 0);
    expect(first.commands).toHaveLength(1);
    expect((await client.poll(ORIGIN, token, [], [], undefined, 0)).commands).toEqual([]);
    await expect(client.poll(ORIGIN, token, [{ id: 999 }], [], undefined, 0)).rejects.toThrow('INVALID_REPLY');
    await client.poll(ORIGIN, token, [{ id: first.commands[0].id, result: { enabled: true } }], [], undefined, 0);
    await expect(sending).resolves.toEqual({ enabled: true });
    await expect(client.poll(ORIGIN, token, [{ id: first.commands[0].id }], [], undefined, 0)).rejects.toThrow('INVALID_REPLY');
  });

  it('never dispatches a queued command after timeout', async () => {
    const { client, token } = await attached(20);
    await expect(client.send('Input.insertText', { text: 'must not dispatch' })).rejects.toThrow('COMMAND_NOT_DELIVERED');
    expect(client.state).toBe('closed');
    await expect(client.poll(ORIGIN, token, [], [], undefined, 0)).rejects.toThrow('GRANT_REFUSED');
    expect(await client.detach()).toBe('uncertain');
  });

  it('marks delivered timeout UNKNOWN and invalidates rather than replaying', async () => {
    const { client, token } = await attached(20);
    const sending = client.send('Input.dispatchMouseEvent', { type: 'mousePressed' });
    const expected = expect(sending).rejects.toThrow('MUTATION_UNCERTAIN');
    expect((await client.poll(ORIGIN, token, [], [], undefined, 0)).commands).toHaveLength(1);
    await expected;
    await expect(client.send('Input.dispatchMouseEvent')).rejects.toThrow('SESSION_CLOSED');
    await expect(client.poll(ORIGIN, token, [], [], undefined, 0)).rejects.toThrow('GRANT_REFUSED');
  });

  it('invalid duplicate reply batches cannot partially acknowledge commands', async () => {
    const { client, token } = await attached();
    const sending = client.send('Page.enable');
    const batch: any = await client.poll(ORIGIN, token, [], [], undefined, 0);
    const id = batch.commands[0].id;
    await expect(client.poll(ORIGIN, token, [{ id }, { id }], [], undefined, 0)).rejects.toThrow('INVALID_REPLY');
    await client.poll(ORIGIN, token, [{ id, result: { confirmed: true } }], [], undefined, 0);
    expect(await sending).toEqual({ confirmed: true });
  });

  it('permits only one in-flight poll and wakes on close', async () => {
    const { client, token } = await attached();
    const poll = client.poll(ORIGIN, token);
    await expect(client.poll(ORIGIN, token)).rejects.toThrow('POLL_IN_FLIGHT');
    client.close();
    expect((await poll).state).toBe('closed');
  });

  it('confirms detach only after the debugger acknowledges it', async () => {
    const { client, token } = await attached();
    const detach = client.detach();
    const batch: any = await client.poll(ORIGIN, token, [], [], undefined, 0);
    expect(batch.commands[0].method).toBe('AgentCore.detach');
    await client.poll(ORIGIN, token, [{ id: batch.commands[0].id, result: { detached: true } }], [], undefined, 0);
    expect(await detach).toBe('confirmed');
    expect(await client.detach()).toBe('confirmed');
  });
});

describe('bridge HTTP boundary', () => {
  async function listen(bridge: BrowserExtensionBridge) {
    const server = createServer((req, res) => { void handleBrowserBridge(req, res, bridge, req.url!); }); servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    return `http://127.0.0.1:${address.port}`;
  }
  it('rejects ordinary origins, forged host, forwarded tunnel and extension-ID mismatch', async () => {
    const base = await listen(new BrowserExtensionBridge());
    const post = (extra: Record<string,string>) => fetch(base + '/browser-bridge/pair', { method: 'POST',
      headers: { Origin: ORIGIN, 'X-Agent-Core-Extension': 'a'.repeat(32), ...extra }, body: '{}' });
    expect((await post({ Origin: 'https://canva.com' })).status).toBe(403);
    // Fetch normalizes Host; a native HTTP request verifies the actual hostile header.
    const hostileHost = await new Promise<number>(resolve => {
      const req = request(base + '/browser-bridge/pair', { method: 'POST', headers: {
        Host: 'tunnel.example', Origin: ORIGIN, 'X-Agent-Core-Extension': 'a'.repeat(32),
      } }, res => { res.resume(); resolve(res.statusCode!); }); req.end('{}');
    });
    expect(hostileHost).toBe(403);
    expect((await post({ 'X-Forwarded-For': '127.0.0.1' })).status).toBe(403);
    expect((await post({ 'X-Agent-Core-Extension': 'b'.repeat(32) })).status).toBe(403);
    const preflight = await fetch(base + '/browser-bridge/pair', { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });
  it('pairs and polls through the actual loopback HTTP owner without leaking credentials in errors', async () => {
    const bridge = new BrowserExtensionBridge();
    const client = bridge.request('https://example.test'); clients.push(client);
    const base = await listen(bridge);
    const headers = { Origin: ORIGIN, 'X-Agent-Core-Extension': 'a'.repeat(32), 'Content-Type': 'application/json' };
    const response = await fetch(base + '/browser-bridge/pair', { method: 'POST', headers,
      body: JSON.stringify({ code: client.code, tabId: 7, url: 'https://example.test' }) });
    const grant = await response.json() as any;
    expect(response.status).toBe(200);
    expect(grant.sessionId).toBe(client.id);
    const poll = fetch(base + '/browser-bridge/poll', { method: 'POST', headers,
      body: JSON.stringify({ sessionId: client.id, token: grant.token, replies: [], events: [] }) });
    await new Promise(resolve => setTimeout(resolve, 10));
    const sending = client.send('Page.enable');
    const batch: any = await (await poll).json();
    expect(batch.commands[0].method).toBe('Page.enable');
    const replyPoll = fetch(base + '/browser-bridge/poll', { method: 'POST', headers,
      body: JSON.stringify({ sessionId: client.id, token: grant.token, replies: [{ id: batch.commands[0].id, result: {} }], events: [] }) });
    await sending; client.close();
    await replyPoll;
    const denied = await fetch(base + '/browser-bridge/poll', { method: 'POST', headers,
      body: JSON.stringify({ sessionId: client.id, token: grant.token }) });
    const error = await denied.text();
    expect(denied.status).toBe(400);
    expect(error).not.toContain(grant.token);
    expect(error).not.toContain(client.code);
  });
});

describe('native BrowserControlService extension integration', () => {
  it('reuses observed-action guards and closes only the grant while retaining tab/browser', async () => {
    const bridge = new BrowserExtensionBridge();
    const service = new BrowserControlService({ extensionBridge: bridge });
    const opened: any = await service.open('https://example.test', false, { transport: 'extension' });
    expect(opened.pid).toBeNull();
    await expect(service.observe(opened.sessionId)).rejects.toThrow('PAIRING_PENDING');
    const grant: any = bridge.pair({ code: opened.pairingCode, tabId: 7, url: 'https://example.test' }, ORIGIN);
    const client = bridge.get(grant, ORIGIN); clients.push(client);
    await client.poll(ORIGIN, grant.token, [], [], undefined, 0);
    let stale = false, stop = false;
    const methods: string[] = [];
    const pump = (async () => {
      let replies: any[] = [];
      while (!stop && client.state !== 'closed') {
        const batch: any = await client.poll(ORIGIN, grant.token, replies, [], undefined, 5); replies = [];
        for (const command of batch.commands) {
          methods.push(command.method); let result: any = {};
          if (command.method === 'Runtime.evaluate') {
            const expression = command.params.expression;
            const value = expression.includes('const cache = window.__agentCoreBrowser') ? {
              url: 'https://example.test', title: 'Fixture', text: 'READY',
              actions: [{ id: 'wait', kind: 'wait', label: 'Wait' }], marker: { value: stale ? 'changed' : 'original' },
              guards: {}, control_states: { items: [], total: 0 }, omitted_actions: 0,
            } : { value: stale ? 'changed' : 'original' };
            result = { result: { value } };
          }
          if (command.method === 'AgentCore.detach') result = { detached: true };
          replies.push({ id: command.id, result });
        }
      }
    })();
    const observed: any = await service.observe(opened.sessionId);
    expect(observed.tabs.scope).toBe('user-connected-tab');
    await expect(service.act(opened.sessionId, observed.observationId, 'invented')).rejects.toThrow('ACTION_NOT_OBSERVED');
    stale = true;
    await expect(service.act(opened.sessionId, observed.observationId, 'wait')).rejects.toThrow('STALE_OBSERVATION');
    stale = false;
    const fresh: any = await service.observe(opened.sessionId);
    // Consume once, then replay must fail even for a harmless wait.
    await service.act(opened.sessionId, fresh.observationId, 'wait');
    await expect(service.act(opened.sessionId, fresh.observationId, 'wait')).rejects.toThrow('OBSERVATION_NOT_CURRENT');
    const status = JSON.stringify(service.status());
    expect(status).not.toContain(opened.pairingCode); expect(status).not.toContain(grant.token);
    const closed: any = await service.close(opened.sessionId); stop = true; await pump;
    expect(closed).toMatchObject({ closed: true, detach: 'confirmed', tabRetained: true, browserRetained: true });
    expect(methods).toContain('AgentCore.detach'); expect(methods).not.toContain('Page.navigate');
    expect(service.status().sessions).toEqual([]);
  });
  it('allows cancellation before pairing without a browser process', async () => {
    const service = new BrowserControlService({ extensionBridge: new BrowserExtensionBridge() });
    const opened: any = await service.open('https://example.test', false, { transport: 'extension' });
    expect(await service.close(opened.sessionId)).toMatchObject({ detach: 'confirmed', tabRetained: true });
  });
  it.each([browserControl, BrowserControlArgsSchema])('keeps both published schemas in agreement', schema => {
    expect(schema.safeParse({ action: 'open', url: 'https://example.test', transport: 'extension' }).success).toBe(true);
    expect(schema.safeParse({ action: 'status', transport: 'extension' }).success).toBe(false);
    expect(schema.safeParse({ action: 'open', url: 'https://example.test', transport: 'external-cdp' }).success).toBe(false);
  });
});
