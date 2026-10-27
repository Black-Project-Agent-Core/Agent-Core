import { PassThrough, Writable } from 'node:stream';
import { endianness } from 'node:os';
import { runInNewContext } from 'node:vm';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenBrowserUseRpc } from '../src/rdc/browser-control/open-browser-use-rpc.js';
import { OpenBrowserUseTransport, obuSocketCandidates, readObuConfiguration } from '../src/rdc/browser-control/open-browser-use.js';
import { BrowserControlService } from '../src/rdc/browser-control/service.js';
import { browserControl, externalBrowserControl } from '../src/mcp/rdc-schemas.js';
import { handleBrowserControl } from '../src/rdc/handlers/browser-control-handlers.js';
import { buildCapabilityExposure } from '../src/capability-awareness.js';

const SESSION = 'abcdefab-1234-1234-1234-123456789012';
const INSTANCE = '11111111-1234-1234-1234-123456789012';
const INFO = { type: 'extension', version: '1.1.0', metadata: {
  extensionId: 'bgjoihaepiejlfjinojjfgokghnodnhd', extensionInstanceId: INSTANCE,
  nativeHostName: 'com.ifuryst.open_browser_use.extension' } };
const resources: OpenBrowserUseRpc[] = [];
const clients: OpenBrowserUseTransport[] = [];
const HOLD = Symbol('hold response');
const directories: string[] = [];
afterEach(async () => { clients.splice(0).forEach(c => c.close()); resources.splice(0).forEach(r => r.close()); vi.restoreAllMocks(); vi.useRealTimers();
  await Promise.all(directories.splice(0).map(p => rm(p, { recursive: true, force: true }))); });

function frame(message: unknown): Buffer {
  const body = Buffer.from(typeof message === 'string' ? message : JSON.stringify(message));
  const header = Buffer.alloc(4);
  if (endianness() === 'LE') header.writeUInt32LE(body.length); else header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}
function harness(handler?: (request: any) => any, timeout = 100) {
  const output = new PassThrough(); const requests: any[] = []; const stop = vi.fn();
  const input = new Writable({ write(chunk, _encoding, callback) {
    const request = JSON.parse(chunk.subarray(4).toString()); requests.push(request);
    if (handler) queueMicrotask(() => {
      const value = handler(request);
      if (value === HOLD) return;
      output.write(frame({ jsonrpc: '2.0', id: request.id,
        ...(value instanceof Error ? { error: { code: -32000, message: value.message } } : { result: value ?? {} }) }));
    });
    callback();
  } });
  const rpc = new OpenBrowserUseRpc({ input, output, stop }, SESSION, timeout); resources.push(rpc);
  return { rpc, output, requests, stop, input };
}
async function transport(handler?: (request: any) => any, candidates = ['/fixture.sock']) {
  const records: ReturnType<typeof harness>[] = [];
  const client = await OpenBrowserUseTransport.connect('', SESSION, {
    instanceId: INSTANCE, candidates: async () => candidates,
    connect: async () => {
      const h = harness(r => r.method === 'getInfo' ? INFO : handler?.(r)); records.push(h); return h.rpc;
    },
  });
  clients.push(client);
  return { client, records, h: records[0]! };
}
const PAGE = { url: 'https://example.test/work', title: 'Task', text: 'Visible task text',
  actions: [{ id: 'wait', kind: 'wait', label: 'Wait' }], marker: ['same'], page_key: ['same'],
  guards: {}, omitted_actions: 0, control_states: { items: [], total: 0 }, document_key: ['doc'], focus_key: null, keyboard_safe: false };
function browser(request: any): any {
  if (request.method === 'createTab') return { id: 42 };
  if (request.method === 'getTabs') return [{ id: 42 }];
  if (request.method === 'executeCdp' && request.params.method === 'Runtime.evaluate') {
    const expression = request.params.commandParams.expression;
    return { result: { value: expression.includes('ready:document.readyState')
      ? { ready: 'complete', url: PAGE.url, visible: true, focused: true } : PAGE } };
  }
  return {};
}

describe('Open Browser Use framed connection', () => {
  it('closes the epoch for a backend CDP timeout before the outer timer, with no action replay', async () => {
    const h = harness(r => r.method === 'executeCdp' ? new Error('CDP timeout; underlying action still running') : {});
    await expect(h.rpc.request('executeCdp')).rejects.toThrow('CDP_ERROR_UNKNOWN');
    expect(h.rpc.closed).toBe(true); expect(h.stop).toHaveBeenCalledTimes(1);
    await expect(h.rpc.request('executeCdp')).rejects.toThrow('SESSION_CLOSED');
    expect(h.requests).toHaveLength(1);
  });
  it('handles fragmented/coalesced UTF-8 frames, out-of-order replies and own session scope', async () => {
    const h = harness();
    const first = h.rpc.request('one', { session_id: 'forged', turn_id: 'forged' });
    const second = h.rpc.request('two');
    expect(h.requests[0].params.session_id).toBe(SESSION);
    expect(h.requests[0].params.turn_id).not.toBe('forged');
    const response = Buffer.concat([frame({ jsonrpc: '2.0', id: h.requests[1].id, result: 'dua \u65e5' }),
      frame({ jsonrpc: '2.0', id: h.requests[0].id, result: 'satu \ud83d\ude80' })]);
    h.output.write(response.subarray(0, 2)); h.output.write(response.subarray(2, 7)); h.output.write(response.subarray(7));
    await expect(first).resolves.toBe('satu \ud83d\ude80'); await expect(second).resolves.toBe('dua \u65e5');
  });
  it('does not acknowledge unknown IDs and has no timeout replay or live late epoch', async () => {
    const h = harness(undefined, 15); const request = h.rpc.request('executeCdp');
    h.output.write(frame({ jsonrpc: '2.0', id: 'foreign', result: {} }));
    await expect(request).rejects.toThrow('TIMEOUT_UNKNOWN');
    h.output.write(frame({ jsonrpc: '2.0', id: h.requests[0].id, result: {} }));
    await expect(h.rpc.request('executeCdp')).rejects.toThrow('SESSION_CLOSED');
    expect(h.requests).toHaveLength(1); expect(h.stop).toHaveBeenCalledTimes(1);
  });
  it.each(['{\n', { jsonrpc: '2.0', id: 'OWN', result: {}, error: {} }])('fails closed on malformed owned data %#', async invalid => {
    const h = harness(); const pending = h.rpc.request('getInfo');
    if (typeof invalid === 'object') invalid.id = h.requests[0].id;
    h.output.write(frame(invalid));
    await expect(pending).rejects.toThrow(/FRAME_INVALID|RESPONSE_INVALID/); expect(h.rpc.closed).toBe(true);
  });
  it('rejects oversized headers before waiting for payload and rejects all pending on EOF', async () => {
    const h = harness(); const a = h.rpc.request('one'); const b = h.rpc.request('two');
    const header = Buffer.alloc(4);
    if (endianness() === 'LE') header.writeUInt32LE(1024 * 1024 + 1); else header.writeUInt32BE(1024 * 1024 + 1);
    h.output.write(header);
    await expect(a).rejects.toThrow('FRAME_INVALID'); await expect(b).rejects.toThrow('FRAME_INVALID');
    const other = harness(); const pending = other.rpc.request('x'); other.output.end();
    await expect(pending).rejects.toThrow('CONNECTION_LOST_UNKNOWN'); other.rpc.close();
    expect(other.stop).toHaveBeenCalledTimes(1);
  });
  it('surfaces backend refusal without page/argument content and bounds pending requests', async () => {
    const h = harness(); const pending = h.rpc.request('x');
    h.output.write(frame({ jsonrpc: '2.0', id: h.requests[0].id, error: { message: 'private page body' } }));
    await expect(pending).rejects.toThrow('BROWSER_OBU_BACKEND_REFUSED');
    const all = Array.from({ length: 16 }, () => h.rpc.request('waiting').catch(e => e.message));
    await expect(h.rpc.request('overflow')).rejects.toThrow('PENDING_LIMIT'); h.rpc.close();
    expect(await Promise.all(all)).toHaveLength(16);
  });
});

describe('Installed extension identity and tab ownership', () => {
  it('never claims cleanup after a create request whose tab ID was not observed', async () => {
    const { client, h } = await transport(r => r.method === 'createTab' ? new Error('created then failed grouping') : browser(r));
    await expect(client.open(PAGE.url)).rejects.toThrow('BACKEND_REFUSED');
    expect(await client.dispose()).toMatchObject({ cleanup: 'uncertain', ownedTabId: null, manualInspectionRequired: true });
    expect(h.requests.some(r => r.method === 'finalizeTabs' || r.method === 'getTabs')).toBe(false);
    expect(h.stop).toHaveBeenCalledTimes(1);
  });
  it('admits one open and denies actions immediately when disposal starts', async () => {
    const { client, h } = await transport(r => ['createTab', 'getTabs'].includes(r.method) ? HOLD : browser(r));
    const first = client.open(PAGE.url);
    await expect(client.open(PAGE.url)).rejects.toThrow('ALREADY_OPEN_OR_CLOSED');
    const create = h.requests.find(r => r.method === 'createTab');
    h.output.write(frame({ jsonrpc: '2.0', id: create.id, result: { id: 42 } })); await first;
    const closing = client.dispose();
    await expect(client.send('Input.insertText', { text: 'late' })).rejects.toThrow('SESSION_DISPOSING');
    const getTabs = h.requests.find(r => r.method === 'getTabs');
    h.output.write(frame({ jsonrpc: '2.0', id: getTabs.id, result: [{ id: 42 }] })); await closing;
    expect(h.requests.filter(r => r.method === 'createTab')).toHaveLength(1);
    expect(h.requests.some(r => r.params.method === 'Input.insertText')).toBe(false);
  });
  it('stops the owned helper on idle expiry without guessing cleanup', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { client, h } = await transport(browser); await client.open(PAGE.url);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(client.closed).toBe(true); expect(h.stop).toHaveBeenCalledTimes(1);
    expect(await client.dispose()).toMatchObject({ cleanup: 'uncertain', manualInspectionRequired: true });
    expect(h.requests.some(r => r.method === 'finalizeTabs')).toBe(false);
  });
  it('does not reopen admission when a readiness reply arrives during disposal', async () => {
    const { client, h } = await transport(r => r.method === 'getTabs'
      || (r.method === 'executeCdp' && r.params.method === 'Runtime.evaluate') ? HOLD : browser(r));
    const opening = client.open(PAGE.url);
    await vi.waitFor(() => expect(h.requests.some(r => r.params.method === 'Runtime.evaluate')).toBe(true), { interval: 1, timeout: 80 });
    const ready = h.requests.find(r => r.params.method === 'Runtime.evaluate');
    const closing = client.dispose();
    h.output.write(frame({ jsonrpc: '2.0', id: ready.id, result: { result: { value: { ready: 'complete', url: PAGE.url, visible: true, focused: true } } } }));
    await expect(opening).rejects.toThrow('SESSION_CLOSED');
    await expect(client.send('Input.insertText', { text: 'late' })).rejects.toThrow('SESSION_DISPOSING');
    const getTabs = h.requests.find(r => r.method === 'getTabs');
    h.output.write(frame({ jsonrpc: '2.0', id: getTabs.id, result: [{ id: 42 }] })); await closing;
  });
  it('refuses duplicate cleanup scope and cleans known tabs after an attach failure', async () => {
    const duplicate = await transport(r => r.method === 'getTabs' ? [{ id: 42 }, { id: 42 }] : browser(r));
    await duplicate.client.open(PAGE.url);
    expect(await duplicate.client.dispose()).toMatchObject({ cleanup: 'uncertain', manualInspectionRequired: true });
    expect(duplicate.h.requests.some(r => r.method === 'finalizeTabs')).toBe(false);
    const failed = await transport(r => r.method === 'attach' ? new Error('attach failed') : browser(r));
    await expect(failed.client.open(PAGE.url)).rejects.toThrow('BACKEND_REFUSED');
    expect(await failed.client.dispose()).toMatchObject({ cleanup: 'acknowledged', ownedTabId: 42 });
    expect(failed.h.stop).toHaveBeenCalledTimes(1);
  });
  it('requires the selected extension instance and refuses ambiguous live sockets before opening a tab', async () => {
    const opened: ReturnType<typeof harness>[] = [];
    const deps = { instanceId: INSTANCE, candidates: async () => ['/one.sock', '/two.sock'], connect: async () => {
      const h = harness(() => INFO); opened.push(h); return h.rpc;
    } };
    await expect(OpenBrowserUseTransport.connect('', SESSION, deps)).rejects.toThrow('AMBIGUOUS');
    expect(opened.every(h => h.rpc.closed && h.requests.length === 1 && h.requests[0].method === 'getInfo')).toBe(true);
    const wrong = harness(() => ({ ...INFO, metadata: { ...INFO.metadata, extensionInstanceId: SESSION } }));
    await expect(OpenBrowserUseTransport.connect('', SESSION, { ...deps, candidates: async () => ['/wrong.sock'], connect: async () => wrong.rpc }))
      .rejects.toThrow('MATCHING_EXTENSION_UNAVAILABLE'); expect(wrong.rpc.closed).toBe(true);
  });
  it('requires installed native-host identity and supported protocol, including source-compatible 1.0.0', async () => {
    for (const info of [{ ...INFO, version: '2.0.0' }, { ...INFO, metadata: { ...INFO.metadata, extensionId: 'a'.repeat(32) } }]) {
      const h = harness(() => info);
      await expect(OpenBrowserUseTransport.connect('', SESSION, { candidates: async () => ['/x.sock'], connect: async () => h.rpc }))
        .rejects.toThrow('MATCHING_EXTENSION_UNAVAILABLE');
    }
    const legacy = harness(() => ({ ...INFO, version: '1.0.0' }));
    const c = await OpenBrowserUseTransport.connect('', SESSION, { candidates: async () => ['/x.sock'], connect: async () => legacy.rpc });
    expect(c.info.version).toBe('1.0.0'); c.close();
  });
  it('creates only its own tab, restricts CDP and filters broadcasts by exact main-frame tab', async () => {
    const { client, h } = await transport(browser); const event = vi.fn(); client.onEvent = event;
    await client.open(PAGE.url);
    expect(h.requests.some(r => r.method === 'claimUserTab' || r.method === 'getUserTabs')).toBe(false);
    const notification = (tabId: number, sourceExtra = {}) => frame({ jsonrpc: '2.0', method: 'onCDPEvent',
      params: { source: { tabId, ...sourceExtra }, method: 'Page.javascriptDialogOpening', params: { type: 'alert' } } });
    h.output.write(notification(13)); h.output.write(notification(42, { sessionId: 'child-frame' }));
    h.output.write(notification(42)); expect(event).toHaveBeenCalledExactlyOnceWith('Page.javascriptDialogOpening', { type: 'alert' });
    await expect(client.send('Network.getAllCookies')).rejects.toThrow('METHOD_REFUSED');
    expect(h.requests.filter(r => r.method === 'executeCdp').every(r => r.params.target.tabId === 42)).toBe(true);
    client.close(); h.output.write(notification(42)); expect(event).toHaveBeenCalledTimes(1);
  });
  it('refuses interaction when the task tab loses foreground focus', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let focused = false;
    const { client, h } = await transport(r => r.params.commandParams?.expression === '({visible:!document.hidden,focused:document.hasFocus()})'
      ? { result: { value: { visible: true, focused } } } : browser(r));
    await client.open(PAGE.url);
    const checking = client.assertForeground().then(() => 'focused', error => error.message);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await checking).toContain('TAB_NOT_FOREGROUND');
    expect(h.requests.filter(r => r.params.method === 'Page.bringToFront')).toHaveLength(2);
    expect(h.requests.some(r => String(r.params.method).startsWith('Input.'))).toBe(false);
    focused = true; await expect(client.assertForeground()).resolves.toBeUndefined();
    expect(h.requests.filter(r => r.params.method === 'Page.bringToFront')).toHaveLength(2);
  });
  it('restores the owned task tab once and waits for document focus before admitting input', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let opening = true, focused = true;
    const { client, h } = await transport(r => {
      if (!opening && r.params.method === 'Page.bringToFront') setTimeout(() => { focused = true; }, 80);
      const expression = r.params.commandParams?.expression;
      if (expression === '(!document.hidden && document.hasFocus())') return { result: { value: focused } };
      if (expression === '({visible:!document.hidden,focused:document.hasFocus()})')
        return { result: { value: { visible: true, focused } } };
      return browser(r);
    });
    await client.open(PAGE.url); opening = false; focused = false;
    const checking = client.assertForeground().then(() => 'focused', error => error.message);
    await vi.advanceTimersByTimeAsync(50);
    expect(focused).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(await checking).toBe('focused');
    expect(h.requests.filter(r => r.params.method === 'Page.bringToFront')).toHaveLength(2);
    expect(h.requests.filter(r => r.method === 'executeCdp').every(r => r.params.target.tabId === 42)).toBe(true);
    expect(h.requests.some(r => r.method === 'attach' && r.params.tabId !== 42)).toBe(false);
    expect(h.requests.some(r => String(r.params.method).startsWith('Input.'))).toBe(false);
  });
  it.each([
    { result: {} },
    { exceptionDetails: { text: 'Evaluation failed' } },
    { result: { value: { visible: true } } },
  ])('keeps an unverified focus probe distinct from a confirmed background tab %#', async reply => {
    const { client, h } = await transport(r => r.params.commandParams?.expression?.includes('document.hasFocus()')
      && !r.params.commandParams.expression.includes('ready:') ? reply : browser(r));
    await client.open(PAGE.url);
    await expect(client.assertForeground()).rejects.toThrow('FOCUS_UNVERIFIED');
    expect(h.requests.filter(r => r.params.method === 'Page.bringToFront')).toHaveLength(1);
    expect(h.requests.some(r => String(r.params.method).startsWith('Input.'))).toBe(false);
  });
  it('finalizes once, preserving a user-added tab; moved-away or lost sessions are never reclaimed', async () => {
    const a = await transport(r => r.method === 'getTabs' ? [{ id: 42 }, { id: 99 }] : browser(r));
    await a.client.open(PAGE.url); const first = a.client.dispose(); const second = a.client.dispose(); expect(first).toBe(second);
    expect(await first).toMatchObject({ cleanup: 'acknowledged', browserRetained: true, detach: 'not-independently-observed' });
    const finalize = a.h.requests.filter(r => r.method === 'finalizeTabs'); expect(finalize).toHaveLength(1);
    expect(finalize[0].params.keep).toEqual([{ tabId: 99, status: 'handoff' }]);
    const moved = await transport(r => r.method === 'getTabs' ? [] : browser(r)); await moved.client.open(PAGE.url);
    expect(await moved.client.dispose()).toMatchObject({ cleanup: 'scope-changed', manualInspectionRequired: true });
    expect(moved.h.requests.some(r => r.method === 'finalizeTabs')).toBe(false);
    const lost = await transport(browser); await lost.client.open(PAGE.url); lost.client.close();
    expect(await lost.client.dispose()).toMatchObject({ cleanup: 'uncertain', manualInspectionRequired: true });
  });
  it('keeps directory discovery read-only and rejects corrupt operator configuration', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'obu-discovery-')); directories.push(dir);
    const active = '{"socketPath":"stale.sock"}\n'; await writeFile(path.join(dir, 'active.json'), active);
    await writeFile(path.join(dir, 'one.sock'), ''); await writeFile(path.join(dir, 'unrelated.txt'), 'keep');
    expect(await obuSocketCandidates({ version: 1, socketDir: dir })).toEqual([path.join(dir, 'one.sock')]);
    expect(await readFile(path.join(dir, 'active.json'), 'utf8')).toBe(active);
    const { mkdir } = await import('node:fs/promises'); const runtime = path.join(dir, 'runtime', 'browser-control');
    await mkdir(runtime, { recursive: true }); await writeFile(path.join(runtime, 'open-browser-use.json'), '{broken');
    await expect(readObuConfiguration(dir)).rejects.toThrow('CONFIG_INVALID');
  });
});

describe('Existing external browser owner integration', () => {
  it('emulates focus only around keys on its owned background tab and restores it after release', async () => {
    const focus = ['doc', PAGE.url, 1, 'textbox', 'text', false, false, null, 'value'];
    let emulated = false;
    const page = {...PAGE,focus_key:focus,keyboard_safe:true};
    const t = await transport(r => {
      const method = r.params.method, params = r.params.commandParams;
      if (method === 'Emulation.setFocusEmulationEnabled') {emulated=params.enabled;return {};}
      if (method === 'Input.dispatchKeyEvent') {expect(emulated).toBe(true);return {};}
      if (params?.expression === 'window.__agentCoreBrowser?.focusKey() ?? null') return {result:{value:focus}};
      if (params?.expression?.includes('ready:document.readyState'))
        return {result:{value:{ready:'complete',url:PAGE.url,visible:false,focused:false}}};
      if (method === 'Runtime.evaluate') return {result:{value:page}};
      return browser(r);
    });
    vi.spyOn(OpenBrowserUseTransport,'connect').mockResolvedValueOnce(t.client);
    const service = new BrowserControlService();
    const opened:any = await service.open(PAGE.url,true,{interactionCapabilities:['keyboard']});
    const observed:any = await service.observe(opened.sessionId);
    await service.act(opened.sessionId,observed.observationId,'key-Escape');
    expect(emulated).toBe(false);
    expect(t.h.requests.filter(r=>r.params.method==='Emulation.setFocusEmulationEnabled').map(r=>r.params.commandParams.enabled)).toEqual([true,false]);
    expect(t.h.requests.filter(r=>r.params.method==='Input.dispatchKeyEvent').map(r=>r.params.commandParams.type)).toEqual(['keyDown','keyUp']);
    expect(t.h.requests.some(r=>r.params.method==='Page.bringToFront')).toBe(false);
    await service.close(opened.sessionId);
  });
  it('activates the observed HTML control in background without ineffective foreground mouse input', async () => {
    let submitted = false;
    class HtmlControl {
      isConnected=true; matches(){return false;} closest(){return null;} checkVisibility(){return true;}
      getBoundingClientRect(){return {x:40,y:50,width:20,height:20};}
      contains(e:any){return e===this;} click(){submitted=true;}
    }
    const button = new HtmlControl();
    button.click=()=>{throw new Error('Overridden click must not be called');};
    const page = {...PAGE,actions:[{id:'click',kind:'click',node:1,label:'Submit'}],guards:{'1':['stable']}};
    const t=await transport(r=>{
      const expression=r.params.commandParams?.expression;
      if(expression?.includes('ready:document.readyState'))
        return {result:{value:{ready:'complete',url:PAGE.url,visible:false,focused:false}}};
      if(expression?.startsWith('(() => { const c=window.__agentCoreBrowser;'))return {result:{value:[['same'],['stable']]}};
      if(expression?.startsWith('(action =>'))return {result:{value:{x:50,y:60}}};
      if(expression?.startsWith('(() => { const e=window.__agentCoreBrowser?.nodes.get('))
        return {result:{value:runInNewContext(expression,{window:{__agentCoreBrowser:{nodes:new Map([[1,button]])}},
          HTMLElement:HtmlControl,document:{elementFromPoint:()=>button},innerWidth:100,innerHeight:100})}};
      if(r.params.method==='Runtime.evaluate')return {result:{value:page}};
      return browser(r);
    });
    vi.spyOn(OpenBrowserUseTransport,'connect').mockResolvedValueOnce(t.client);
    const service=new BrowserControlService();
    const opened:any=await service.open(PAGE.url,true,{transport:'open-browser-use'});
    const observed:any=await service.observe(opened.sessionId);
    await service.act(opened.sessionId,observed.observationId,'click');
    expect(submitted).toBe(true);
    expect(t.h.requests.some(r=>r.params.method==='Page.bringToFront'||r.params.method==='Input.dispatchMouseEvent')).toBe(false);
    await service.close(opened.sessionId);
  });
  it('opens and fills a hidden owned task tab without any foreground activation', async () => {
    let inserted = '';
    const dom: any = { activeElement: null };
    const field: any = { isConnected: true, matches: () => false, closest: () => null,
      contains: () => false, focus: () => { dom.activeElement = field; } };
    const page = { ...PAGE, actions: [{ id: 'fill', kind: 'fill', node: 1, label: 'Probe' }] };
    const t = await transport(r => {
      if (r.params.method === 'Page.bringToFront') return new Error('Foreground activation forbidden');
      if (r.params.method === 'Input.insertText') inserted = r.params.commandParams.text;
      const expression = r.params.commandParams?.expression;
      if (expression?.includes('ready:document.readyState'))
        return { result: { value: { ready: 'complete', url: PAGE.url, visible: false, focused: false } } };
      if (expression?.startsWith('(action =>')) return { result: { value: { x: 50, y: 60 } } };
      if (expression?.startsWith('(() => { const e=window.__agentCoreBrowser?.nodes.get('))
        return { result: { value: runInNewContext(expression, {window:{__agentCoreBrowser:{nodes:new Map([[1,field]])}},document:dom}) } };
      if (r.params.method === 'Runtime.evaluate') return { result: { value: page } };
      return browser(r);
    });
    vi.spyOn(OpenBrowserUseTransport, 'connect').mockResolvedValueOnce(t.client);
    const service = new BrowserControlService();
    const opened: any = await service.open(PAGE.url, true, { transport: 'open-browser-use' });
    expect(opened).toMatchObject({ headless: false, background: true, tabId: 42 });
    const observed: any = await service.observe(opened.sessionId);
    await expect(service.act(opened.sessionId, observed.observationId, 'fill', 'background-proof'))
      .resolves.toMatchObject({ operation: 'fill' });
    expect(inserted).toBe('background-proof');
    expect(t.h.requests.some(r => r.params.method === 'Page.bringToFront')).toBe(false);
    expect(t.h.requests.filter(r => r.method === 'executeCdp').every(r => r.params.target.tabId === 42)).toBe(true);
    await expect(t.client.send('Page.bringToFront')).rejects.toThrow('BACKGROUND_ACTIVATION_REFUSED');
    await service.close(opened.sessionId);
  });
  it('does not insert background text when the CDP click did not focus the intended DOM field', async () => {
    const page = { ...PAGE, actions: [{ id: 'fill', kind: 'fill', node: 1, label: 'Probe' }] };
    const t = await transport(r => {
      const expression = r.params.commandParams?.expression;
      if (expression?.includes('ready:document.readyState'))
        return { result: { value: { ready: 'complete', url: PAGE.url, visible: false, focused: false } } };
      if (expression?.startsWith('(action =>')) return { result: { value: { x: 50, y: 60 } } };
      if (expression?.startsWith('(() => { const e=window.__agentCoreBrowser?.nodes.get(')) return { result: { value: false } };
      if (r.params.method === 'Runtime.evaluate') return { result: { value: page } };
      return browser(r);
    });
    vi.spyOn(OpenBrowserUseTransport, 'connect').mockResolvedValueOnce(t.client);
    const service = new BrowserControlService();
    const opened: any = await service.open(PAGE.url, true, { transport: 'open-browser-use' });
    const observed: any = await service.observe(opened.sessionId);
    await expect(service.act(opened.sessionId, observed.observationId, 'fill', 'never-insert'))
      .rejects.toThrow('BACKGROUND_FIELD_NOT_FOCUSED');
    expect(t.h.requests.some(r => r.params.method === 'Input.insertText' || r.params.method === 'Input.dispatchKeyEvent')).toBe(false);
    await service.close(opened.sessionId);
  });
  it('requires an existing unambiguous connection for background use instead of starting a fallback', async () => {
    await expect(OpenBrowserUseTransport.connect('', SESSION, {
      candidates: async () => [], connect: async () => { throw new Error('No endpoints'); },
    }, true)).rejects.toThrow('BACKGROUND_CONNECTION_REQUIRED');
  });
  it.each([{}, { result: { value: { ready: 'loading', url: PAGE.url } } },
    { exceptionDetails: { text: 'Unavailable' } }])('refuses unverified background readiness before input %#', async invalid => {
    let opened = false;
    const t = await transport(r => opened && r.params.commandParams?.expression?.includes('ready:document.readyState')
      ? invalid : browser(r));
    await t.client.open(PAGE.url, true); opened = true;
    await expect(t.client.assertForeground()).rejects.toThrow('BACKGROUND_DOCUMENT_UNVERIFIED');
    expect(t.h.requests.some(r => r.params.method === 'Page.bringToFront' || String(r.params.method).startsWith('Input.'))).toBe(false);
  });
  it('refuses a stale observed action when focus recovery changes the page', async () => {
    let activated = false, opened = false;
    const page = { ...PAGE, actions: [{ id: 'click', kind: 'click', label: 'Submit' }] };
    const t = await transport(r => {
      if (opened && r.params.method === 'Page.bringToFront') activated = true;
      if (r.params.commandParams?.expression === '({visible:!document.hidden,focused:document.hasFocus()})')
        return { result: { value: { visible: true, focused: activated } } };
      if (r.method === 'executeCdp' && r.params.method === 'Runtime.evaluate'
        && !r.params.commandParams.expression.includes('ready:document.readyState'))
        return { result: { value: { ...page, marker: activated ? ['changed-on-focus'] : ['same'] } } };
      return browser(r);
    });
    vi.spyOn(OpenBrowserUseTransport, 'connect').mockResolvedValueOnce(t.client);
    const service = new BrowserControlService();
    const result: any = await service.open(PAGE.url, false, { transport: 'open-browser-use' }); opened = true;
    const observed: any = await service.observe(result.sessionId);
    await expect(service.act(result.sessionId, observed.observationId, 'click')).rejects.toThrow('STALE_OBSERVATION');
    expect(t.h.requests.some(r => String(r.params.method).startsWith('Input.'))).toBe(false);
    await service.close(result.sessionId);
  });
  it('reports an uncertain open and keeps the four-session admission bound across owners', async () => {
    const t = await transport(r => r.method === 'createTab' ? new Error('unknown tab creation') : browser(r));
    vi.spyOn(OpenBrowserUseTransport, 'connect').mockResolvedValueOnce(t.client);
    const service = new BrowserControlService();
    await expect(service.open(PAGE.url, true, { transport: 'open-browser-use' })).rejects.toThrow('OPEN_OUTCOME_UNCERTAIN');
    expect(service.status().sessions).toEqual([]); expect(t.h.stop).toHaveBeenCalledTimes(1);
    // Opens are serialized per service and one owner reuses its tab, so the bound is reached with four owners, one after another.
    for (const owner of ['a', 'b', 'c', 'd']) {
      const healthy = await transport(browser);
      vi.mocked(OpenBrowserUseTransport.connect).mockResolvedValueOnce(healthy.client);
      await service.open(PAGE.url, true, { transport: 'open-browser-use', owner });
    }
    expect(service.status().sessions).toHaveLength(4);
    await expect(service.open(PAGE.url, true, { transport: 'open-browser-use', owner: 'e' })).rejects.toThrow('SESSION_LIMIT');
    for (const session of service.status().sessions as Array<{ sessionId: string }>) await service.close(session.sessionId);
    expect(service.status().sessions).toEqual([]);
  });
  it('reuses observe/act budgets and closes only the transport, without an isolated browser process', async () => {
    const t = await transport(browser); vi.spyOn(OpenBrowserUseTransport, 'connect').mockResolvedValueOnce(t.client);
    const service = new BrowserControlService({ maxActions: 1, maxObservations: 2 });
    const opened: any = await service.open(PAGE.url, true, { transport: 'open-browser-use' });
    expect(opened).toMatchObject({ transport: 'open-browser-use', status: 'attached', headless: false, pid: null, tabId: 42 });
    expect(service.status().sessions).toHaveLength(1);
    const observation: any = await service.observe(opened.sessionId);
    expect(observation.tabs.scope).toBe('task-created-tab'); expect(observation.text).toBe(PAGE.text);
    await expect(service.act(opened.sessionId, observation.observationId, 'not-observed')).rejects.toThrow('ACTION_NOT_OBSERVED');
    await expect(service.act(opened.sessionId, observation.observationId, 'wait')).resolves.toMatchObject({ operation: 'wait', remainingActions: 0 });
    await expect(service.act(opened.sessionId, observation.observationId, 'wait')).rejects.toThrow('ACTION_BUDGET_EXCEEDED');
    expect(await service.close(opened.sessionId)).toMatchObject({ closed: true, cleanup: 'acknowledged', browserRetained: true });
    expect(service.status().sessions).toEqual([]);
  });
  it('exposes OBU to both controllers while keeping conversation/general-schema boundaries', async () => {
    const args = { action: 'open', transport: 'open-browser-use', url: PAGE.url };
    expect(externalBrowserControl.safeParse(args).success).toBe(true);
    expect(browserControl.safeParse(args).success).toBe(true);
    for (const extra of [{ mode: 'conversation' }, { mode: 'browser' }, { socketPath: '/x.sock' }, { tabId: 42 }])
      expect(externalBrowserControl.safeParse({ ...args, ...extra }).success).toBe(false);
    expect(externalBrowserControl.safeParse({ ...args, action: 'status' }).success).toBe(false);
    expect(externalBrowserControl.safeParse({ action: 'act', sessionId: SESSION, observationId: SESSION, actionId: 'x', text: 'x'.repeat(2001) }).success).toBe(false);
    const t = await transport(browser); vi.spyOn(OpenBrowserUseTransport, 'connect').mockResolvedValueOnce(t.client);
    const opened = await handleBrowserControl(args, undefined, false);
    expect(opened.isError).not.toBe(true);
    const id = String(opened.structuredContent?.sessionId);
    expect((await handleBrowserControl({ action: 'observe', sessionId: id })).isError).not.toBe(true);
    expect((await handleBrowserControl({ action: 'status' })).structuredContent?.sessions).toEqual(expect.arrayContaining([expect.objectContaining({sessionId: id})]));
    expect((await handleBrowserControl({ action: 'conversation_read', sessionId: id })).isError).toBe(true);
    expect((await handleBrowserControl({ action: 'close', sessionId: id })).isError).not.toBe(true);
    const input = { availableTools: ['browser_control'], artifacts: [], owners: {} };
    const external = buildCapabilityExposure({ ...input, externalController: true });
    const native = buildCapabilityExposure(input);
    expect(external.inventory.find(i => i.capabilityId === 'family:browser.navigate')?.description).toContain('Open Browser Use');
    expect(native.inventory.find(i => i.capabilityId === 'family:browser.navigate')?.description).toContain('Open Browser Use');
  });
});
