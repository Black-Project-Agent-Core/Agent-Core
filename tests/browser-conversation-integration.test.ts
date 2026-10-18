import { createServer, type Server } from 'node:http';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserExtensionBridge } from '../src/rdc/browser-control/extension-bridge.js';
import { BrowserControlService, browserControlService } from '../src/rdc/browser-control/service.js';
import { handleBrowserBridge } from '../src/http/browser-bridge.js';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { browserControl, externalBrowserControl } from '../src/mcp/rdc-schemas.js';
import { RDC_TOOL_METADATA } from '../src/mcp/rdc-tool-metadata.js';
import { toolHistory } from '../src/rdc/utils/toolHistory.js';
import { usageTracker } from '../src/rdc/utils/usageTracker.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';
import { attachControllerContract } from './controller-contract-fixture.js';
import { CHAT, ORIGIN, POPUP, SOURCE_ROOT, donorWorker, deferred } from './browser-conversation-fixture.js';

const closers: Array<() => Promise<void>> = [];
beforeEach(() => {
  vi.spyOn(toolHistory, 'addCall').mockReturnValue(true);
  vi.spyOn(usageTracker, 'trackSuccess').mockResolvedValue(undefined);
  vi.spyOn(usageTracker, 'trackFailure').mockResolvedValue(undefined);
  vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
  vi.spyOn(activityTracker, 'captureFailure').mockImplementation(() => undefined as any);
});
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
async function connected(timeout = 2000) {
  const bridge = new BrowserExtensionBridge(timeout);
  const service = new BrowserControlService({ extensionBridge: bridge });
  for (const name of ['open', 'observe', 'act', 'conversation', 'status', 'close'] as const)
    vi.spyOn(browserControlService, name).mockImplementation(service[name].bind(service) as any);
  const http: Server = createServer((req, res) => { void handleBrowserBridge(req, res, bridge, req.url!); });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (http.address() as any).port;
  const server = createAgentCoreMcpServer();
  const ai = new Client({ name: 'browser-conversation-isolated-fixture', version: '0.2.0' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await ai.connect(ct); await attachControllerContract(ai);
  closers.push(async () => {
    await service.closeAll(); await ai.close(); await server.close();
    await new Promise<void>(resolve => { http.closeAllConnections(); http.close(() => resolve()); });
  });
  const raw = (args: any) => ai.callTool({ name: 'browser_control', arguments: args }) as Promise<any>;
  const call = async (args: any) => {
    const result = await raw(args);
    if (result.isError) throw new Error(result.content.find((c: any) => c.type === 'text')?.text);
    return result.structuredContent ?? JSON.parse(result.content.find((c: any) => c.type === 'text').text);
  };
  const open = async (url = CHAT, tab = 7, mode = 'conversation') => {
    const opened = await call({ action: 'open', transport: 'extension', mode: 'conversation', url });
    const worker = donorWorker(base, tab, url);
    closers.push(() => worker.dispose());
    expect(await worker.local({ action: 'connect', code: opened.pairingCode, mode })).toMatchObject({ connected: true });
    const grant = worker.state.wire.find(x => x.route.endsWith('/pair'))!.data;
    const client = bridge.get(grant, ORIGIN);
    await vi.waitFor(() => expect(client.state).toBe('attached'));
    const sessionId = opened.sessionId;
    return { worker, client, grant, sessionId,
      read: (sinceRevision?: number) => call({ action: 'conversation_read', sessionId, ...(sinceRevision === undefined ? {} : { sinceRevision }) }),
      status: () => call({ action: 'conversation_status', sessionId }),
      draft: (revision: number, text = 'fixture approved', target = url) => call({
        action: 'conversation_draft', sessionId, url: target, revision, text }),
    };
  };
  return { bridge, service, ai, raw, call, open, base };
}

describe.skipIf(!SOURCE_ROOT)('exact v0.2.0 worker through MCP and the existing HTTP browser owner', () => {
  it('publishes three conversation actions externally and preserves the Native schema and descriptor', async () => {
    const h = await connected();
    const descriptor: any = (await h.ai.listTools()).tools.find(t => t.name === 'browser_control');
    expect(descriptor.inputSchema.properties.action.enum).toEqual(expect.arrayContaining([
      'conversation_read', 'conversation_draft', 'conversation_status']));
    expect(externalBrowserControl.safeParse({ action: 'open', transport: 'extension', mode: 'conversation', url: CHAT }).success).toBe(true);
    expect(browserControl.safeParse({ action: 'conversation_read', sessionId: crypto.randomUUID() }).success).toBe(false);
    for (const args of [
      { action: 'approve' }, { action: 'conversation_draft', sessionId: crypto.randomUUID(), url: CHAT, revision: 1, text: ' ', approved: true },
      { action: 'open', mode: 'conversation', transport: 'isolated', url: CHAT },
      { action: 'open', mode: 'conversation', transport: 'extension', url: 'https://chatgpt.com/share/fixture' },
    ]) expect(externalBrowserControl.safeParse(args).success).toBe(false);
    const native = createAgentCoreMcpServer(undefined, { nativeTaskId: 'frozen-fixture' });
    const registrations = (native as any)._registeredTools;
    expect(registrations.browser_control.inputSchema.toJSONSchema()).toEqual(browserControl.toJSONSchema());
    const words = (s: string) => s.replace(/\s+/g, ' ').trim();
    expect(words(registrations.browser_control.description)).toBe(words(RDC_TOOL_METADATA.browser_control.description));
    await native.close();
  });

  it('read-only extraction errors carry the actual fixed diagnostic through MCP and HTTP without a draft', async () => {
    const h = await connected();
    const pending = await h.call({action:'open',transport:'extension',mode:'conversation',url:CHAT});
    const worker = donorWorker(h.base,7,CHAT); worker.state.messages=[]; closers.push(()=>worker.dispose());
    expect(await worker.local({action:'connect',mode:'conversation',code:pending.pairingCode})).toMatchObject({connected:true});
    const grant=worker.state.wire.find(x=>x.route.endsWith('/pair'))!.data;
    await vi.waitFor(()=>expect(h.bridge.get(grant,ORIGIN).state).toBe('attached'));
    const read=await h.call({action:'conversation_read',sessionId:pending.sessionId,sinceRevision:0});
    expect(read).toMatchObject({current:false,revision:0,messages:[],error:expect.stringContaining('DOM_UNSUPPORTED'),diagnostics:{schema:1,targetMatches:true,contentIncluded:false,counts:{candidate:0}}});
    const status=await h.call({action:'conversation_status',sessionId:pending.sessionId});
    expect(status).toMatchObject({current:false,revision:0,draft:null,receipt:null,diagnostics:{schema:1,contentIncluded:false}});
    await worker.local({action:'pause'});
    const count=worker.state.evaluations.length;
    expect(await h.call({action:'conversation_status',sessionId:pending.sessionId})).toMatchObject({current:false,paused:true});
    expect(worker.state.evaluations.length).toBe(count);expect(worker.state.clicks).toBe(0);expect(worker.state.composer).toBe('');
  });

  it('reads initial, unchanged, delta, window exits, explicit reset and independent grant cursors', async () => {
    const h = await connected(), a = await h.open(), b = await h.open(CHAT + '-second', 8);
    const first = await a.read();
    expect(first).toMatchObject({ revision: 1, changed: true, reset: false, truncated: false,
      modeConfirmed: true, current: true, untrustedContent: true, cachedWindowSize: 1,
      coverage: { kind: 'loaded-visible-DOM-window', completeHistory: false } });
    expect((await a.read()).messages).toEqual([]);
    a.worker.state.messages.push({ id: 'reply', role: 'assistant', text: 'fixture response' });
    expect((await a.read()).messages.map((m: any) => m.id)).toEqual(['reply']);
    a.worker.state.messages.shift();
    const exit = await a.read();
    expect(exit.messages).toEqual([]); expect(exit.windowExits).toEqual(['initial']);
    expect(exit.windowExitsMeaning).toBe('left-observation-window-not-deletion');
    expect((await b.read()).messages).toHaveLength(1);
    for (let i = 0; i < 9; i++) { a.worker.state.messages[0].text = 'revision ' + i; await a.read(); }
    const reset = await a.read(1);
    expect(reset.reset).toBe(true); expect(reset.messages).toHaveLength(1);
    expect((await a.read()).messages).toEqual([]);
    const reads = a.worker.state.wire.flatMap(x => x.data?.commands ?? []).filter(c => c.method === 'AgentCore.conversationRead');
    expect(reads[0].params).toEqual({ sinceRevision: 0 }); expect(reads[1].params).toEqual({ sinceRevision: 1 });
    const evidence = vi.mocked(toolHistory.addCall).mock.calls.filter(c => c[0] === 'browser_control');
    expect(evidence.length).toBeGreaterThan(0);
    for (const call of evidence) expect(call[4]).toMatchObject({ disposition: 'metadata-only' });
  });

  it('passes the full bounded DOM window without spilling private data to an artifact', async () => {
    const h = await connected(), a = await h.open();
    a.worker.state.messages = Array.from({ length: 100 }, (_, i) => ({
      id: 'm' + i, role: 'user' as const, text: '\u0001'.repeat(7000),
    }));
    const read = await a.read();
    expect(read.coverage).toMatchObject({ truncated: true, completeHistory: false });
    expect(read.messages.reduce((n: number, m: any) => n + m.text.length, 0)).toBe(48000);
    expect(read.messages.every((m: any) => m.truncated)).toBe(true);
    expect(read.artifact).toBeUndefined(); expect(read.cachedWindowSize).toBe(8);
    const ordinary = h.bridge.request('https://example.test');
    const grant = h.bridge.pair({ code: ordinary.code, tabId: 20, url: 'https://example.test' }, ORIGIN);
    const oversized = await fetch(h.base + '/browser-bridge/poll', { method: 'POST',
      headers: { Origin: ORIGIN, 'X-Agent-Core-Extension': 'a'.repeat(32), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...grant, replies: [], events: [], padding: 'x'.repeat(270000) }) });
    expect(oversized.status).toBe(400); expect(await oversized.json()).toEqual({ error: 'BROWSER_BRIDGE_BODY_TOO_LARGE' });
    ordinary.close();
  });

  it('rejects wrong-URL pairing, mismatched draft URL and stale reads before staging', async () => {
    const h = await connected();
    const pending = await h.call({ action: 'open', transport: 'extension', mode: 'conversation', url: CHAT });
    const wrong = donorWorker(h.base, 9, CHAT + '-other'); closers.push(() => wrong.dispose());
    expect((await wrong.local({ action: 'connect', code: pending.pairingCode, mode: 'conversation' })).error).toMatch(/URL_MISMATCH/);
    const a = await h.open(); const read = await a.read();
    await expect(a.draft(read.revision, 'wrong', CHAT + '-wrong')).rejects.toThrow('URL_MISMATCH');
    await expect(a.draft(read.revision - 1)).rejects.toThrow('FRESH_READ_REQUIRED');
    a.worker.state.messages.push({ id: 'changed', role: 'assistant', text: 'new content' });
    await expect(a.draft(read.revision)).rejects.toThrow(/revision is stale/);
    expect((await a.status()).draftCommand.state).toBe('failed');
    expect(a.worker.state.clicks).toBe(0);
  });

  it('latches navigation, exposes paused/error and requires a fresh binding even after returning', async () => {
    const h = await connected(), a = await h.open(); const read = await a.read();
    await a.draft(read.revision); a.worker.navigate(CHAT + '-other');
    expect(await a.status()).toMatchObject({ paused: true, draft: null, error: expect.stringContaining('Navigation') });
    const paused = await a.read();
    expect(paused).toMatchObject({ current: false, paused: true, url: CHAT });
    await expect(a.draft(read.revision)).rejects.toThrow('PAUSED_BUSY_OR_ERROR');
    a.worker.navigate(CHAT);
    expect((await a.worker.local({ action: 'resume' })).error).toMatch(/new pairing/);
    expect(a.worker.state.clicks).toBe(0);
  });

  it('refuses remote approve and generic bypass and does not fall back on a popup mode mismatch', async () => {
    const h = await connected(), a = await h.open();
    for (const method of ['AgentCore.approve', 'Runtime.evaluate', 'Input.insertText', 'Page.navigateToHistoryEntry'])
      await expect(a.client.send(method, {})).rejects.toThrow(/REFUSED|SCOPED_COMMAND_REQUIRED/);
    await expect(h.call({ action: 'observe', sessionId: a.sessionId })).rejects.toThrow('SCOPED_COMMAND_REQUIRED');
    expect(await a.worker.local({ action: 'approve', id: 'forged', text: 'x' },
      { id: 'a'.repeat(32), url: POPUP + '?forged' })).toEqual({ refused: true });
    const mismatch = await h.open(CHAT + '-mode', 8, 'browser');
    await expect(mismatch.read()).rejects.toThrow(/refused|Unsupported/i);
    expect(mismatch.client.modeConfirmed).toBe(false); expect(mismatch.worker.state.clicks).toBe(0);
    expect(a.worker.state.evaluations.every(e => e.includes('function pageRead'))).toBe(true);
  });

  it.each(['my existing draft', '  '])('preserves a nonempty composer and reports actual unknown receipt (%j)', async text => {
    const h = await connected(), a = await h.open(); const read = await a.read();
    const d = await a.draft(read.revision); a.worker.state.composer = text;
    expect(d).toMatchObject({ state: 'review', delivered: false, reviewRequired: true });
    expect((await a.status()).receipt).toBeNull();
    expect((await a.worker.local({ action: 'approve', id: d.id, text: 'fixture approved' })).error).toMatch(/preserved/);
    const status = await a.status();
    expect(status).toMatchObject({ draft: { state: 'unknown' }, receipt: { state: 'unknown', draftId: d.id } });
    expect(a.worker.state.composer).toBe(text); expect(a.worker.state.clicks).toBe(0);
    await expect(a.draft(read.revision)).rejects.toThrow(/pending send/);
  });

  it('edits review identity, exposes sending/submitted, confirms one matching message and consumes approval once', async () => {
    const h = await connected(), a = await h.open(); const read = await a.read();
    const draft = await a.draft(read.revision);
    const edited = await a.worker.local({ action: 'editDraft', id: draft.id, text: 'edited fixture' });
    const id = edited.conversation.draft.id;
    expect(id).not.toBe(draft.id);
    expect((await a.worker.local({ action: 'approve', id: draft.id, text: 'fixture approved' })).error).toMatch(/changed/);
    const ids = deferred(), receipt = deferred(); let waitingIds = false, waitingReceipt = false;
    a.worker.state.beforeEvaluate = async expression => {
      if (expression.includes('function pageUserIds')) { waitingIds = true; await ids.promise; }
      if (a.worker.state.clicks && expression.includes('function pageRead')) { waitingReceipt = true; await receipt.promise; }
    };
    const approval = a.worker.local({ action: 'approve', id, text: 'edited fixture' });
    await vi.waitFor(() => expect(waitingIds).toBe(true));
    expect((await a.status()).draft.state).toBe('sending');
    ids.resolve(); await vi.waitFor(() => expect(waitingReceipt).toBe(true));
    expect((await a.status()).draft.state).toBe('submitted');
    receipt.resolve(); expect((await approval).conversation.receipt.state).toBe('confirmed');
    expect(await a.status()).toMatchObject({ draft: { id, text: 'edited fixture', state: 'confirmed' },
      receipt: { draftId: id, url: CHAT, state: 'confirmed', messageId: 'sent-1' } });
    expect((await a.worker.local({ action: 'approve', id, text: 'edited fixture' })).error).toBeTruthy();
    expect(a.worker.state.clicks).toBe(1);
  });

  it.each(['busy', 'expiry', 'attachment'])('keeps the extension approval guard for %s', async guard => {
    const h = await connected(), a = await h.open(); const read = await a.read();
    const d = await a.draft(read.revision);
    if (guard === 'busy') a.worker.state.busy = true;
    if (guard === 'expiry') a.worker.state.clockOffset = 600001;
    if (guard === 'attachment') a.worker.state.attachment = true;
    expect((await a.worker.local({ action: 'approve', id: d.id, text: 'fixture approved' })).error).toBeTruthy();
    expect(a.worker.state.clicks).toBe(0);
    const status = await a.status();
    expect(status.draft.state).toBe(guard === 'attachment' ? 'unknown' : 'review');
    expect(status.receipt?.state ?? null).toBe(guard === 'attachment' ? 'unknown' : null);
  });

  it('reports unconfirmed submission as unknown and never sends it again', async () => {
    const h = await connected(), a = await h.open(); const read = await a.read();
    const d = await a.draft(read.revision); a.worker.state.confirm = false;
    expect((await a.worker.local({ action: 'approve', id: d.id, text: 'fixture approved' })).error).toMatch(/not confirmed/);
    expect((await a.status()).receipt.state).toBe('unknown');
    await a.status(); await a.status();
    expect((await a.worker.local({ action: 'approve', id: d.id, text: 'fixture approved' })).error).toBeTruthy();
    await expect(a.draft(read.revision)).rejects.toThrow(/pending send/);
    expect(a.worker.state.clicks).toBe(1);
  });

  it('invalidates delivered timeout, keeps uncertainty and never retries a draft command', async () => {
    const h = await connected(400), a = await h.open(); const read = await a.read();
    const gate = deferred(); let held = false;
    a.worker.state.beforePoll = async body => {
      if (body.replies.some((r: any) => r.result?.state === 'review')) { held = true; await gate.promise; }
    };
    const result = h.raw({ action: 'conversation_draft', sessionId: a.sessionId, url: CHAT, revision: read.revision, text: 'fixture timeout' });
    try {
      await vi.waitFor(() => expect(held).toBe(true));
      expect((await result).isError).toBe(true);
      expect(await a.status()).toMatchObject({ connectionState: 'closed', current: false,
        receiptCurrent: false, draftCommand: { state: 'unknown' } });
      expect(a.worker.state.wire.flatMap(x => x.data?.commands ?? []).filter(c => c.method === 'AgentCore.conversationDraft')).toHaveLength(1);
      expect(a.worker.state.clicks).toBe(0);
    } finally { gate.resolve(); }
  });

  it('does not execute an old delivered batch after reconnect and rejects the old grant/token', async () => {
    const h = await connected(), a = await h.open(); await a.read();
    const gate = deferred(); let held = false;
    a.worker.state.afterPoll = async data => {
      if (data.commands?.length) { held = true; await gate.promise; }
      return data;
    };
    const old = h.raw({ action: 'conversation_read', sessionId: a.sessionId });
    await vi.waitFor(() => expect(held).toBe(true));
    await a.worker.local({ action: 'disconnect' });
    expect((await old).isError).toBe(true);
    const opened = await h.call({ action: 'open', transport: 'extension', mode: 'conversation', url: CHAT });
    a.worker.state.afterPoll = undefined;
    expect(await a.worker.local({ action: 'connect', mode: 'conversation', code: opened.pairingCode })).toMatchObject({ connected: true });
    const evaluations = a.worker.state.evaluations.length;
    gate.resolve(); await new Promise(resolve => setTimeout(resolve, 20));
    expect(a.worker.state.evaluations).toHaveLength(evaluations);
    expect(() => h.bridge.get(a.grant, ORIGIN)).toThrow('GRANT_REFUSED');
    const fresh = await h.call({ action: 'conversation_read', sessionId: opened.sessionId });
    expect(fresh.messages).toHaveLength(1); expect(fresh.revision).toBe(1);
  });

  it('revokes another old queue on same-tab pairing and never treats scoped disconnect as debugger acknowledgement', async () => {
    const h = await connected(), a = await h.open(); await a.read();
    const gate = deferred(); let held = false;
    a.worker.state.afterPoll = async data => { if (data.commands?.length) { held = true; await gate.promise; } return data; };
    const old = a.client.conversation('conversation_read');
    const rejected = expect(old).rejects.toThrow('SESSION_CLOSED');
    await vi.waitFor(() => expect(held).toBe(true));
    const b = await h.open(CHAT, 7); await rejected; gate.resolve();
    expect(() => h.bridge.get(a.grant, ORIGIN)).toThrow('GRANT_REFUSED');
    const closed = await h.call({ action: 'close', sessionId: b.sessionId });
    expect(closed).toMatchObject({ closed: true, detach: 'uncertain', tabRetained: true, browserRetained: true });
    expect(b.worker.state.detached).toBe(1);
  });
});
