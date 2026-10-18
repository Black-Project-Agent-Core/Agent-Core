import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createContext, runInContext, runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

export const SOURCE_ROOT = process.env.AGENT_CORE_BROWSER_BRIDGE_FIXTURE;
export const CHAT = 'https://chatgpt.com/c/bridge-fixture';
export const EXTENSION_ID = 'a'.repeat(32);
export const ORIGIN = 'chrome-extension://' + EXTENSION_ID;
export const POPUP = ORIGIN + '/popup.html';
export type FixtureMessage = { id: string; role: 'user' | 'assistant'; text: string };
export function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

/** Executes the exact donor worker and its page functions; all DOM and popup data are synthetic. */
export function donorWorker(base: string, tabId = 7, initialUrl = CHAT) {
  if (!SOURCE_ROOT) throw new Error('Use scripts/verify/browser-bridge-v020.mjs with the exact source ZIP');
  const state = {
    url: initialUrl, messages: [{ id: 'initial', role: 'user', text: 'fixture hello' }] as FixtureMessage[],
    busy: false, attachment: false, composer: '', clicks: 0, confirm: true, clockOffset: 0,
    editorCount: 1, buttonCount: 1, detached: 0, attached: 0, evaluations: [] as string[],
    wire: [] as { route: string; body: any; data: any }[],
    beforeEvaluate: undefined as undefined | ((expression: string) => Promise<void>),
    beforePoll: undefined as undefined | ((body: any) => Promise<void>),
    afterPoll: undefined as undefined | ((data: any, body: any) => Promise<any>),
    beforeDetach: undefined as undefined | (() => Promise<void>),
  };
  let message: any, onEvent: any, onDetach: any;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const timer = (fn: (...args: any[]) => void, ms: number) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms === 500 ? 1 : ms);
    t.unref(); timers.add(t); return t;
  };
  const clear = (t: ReturnType<typeof setTimeout>) => { timers.delete(t); clearTimeout(t); };
  class FixtureDate extends Date {
    constructor(...args: any[]) { super(args.length ? args[0] : Date.now() + state.clockOffset); }
    static now() { return Date.now() + state.clockOffset; }
  }
  const messageNode = (m: FixtureMessage) => ({
    getClientRects: () => [1],
    getAttribute: (key: string) => key === 'data-message-author-role' ? m.role : m.id,
    querySelectorAll: () => [{ getClientRects: () => [1], innerText: m.text }],
  });
  const button = { getClientRects: () => [1], disabled: false, click() {
    state.clicks++;
    if (state.confirm) state.messages.push({ id: 'sent-' + state.clicks, role: 'user', text: state.composer });
    state.composer = '';
  } };
  const form = {
    querySelectorAll: (selector: string) => selector === 'input[type="file"]'
      ? [{ files: state.attachment ? ['fixture'] : [] }]
      : Array.from({ length: state.buttonCount }, () => button),
    querySelector: () => state.attachment ? {} : null,
  };
  class Textarea {
    tagName = 'TEXTAREA';
    get value() { return state.composer; }
    set value(text: string) { state.composer = text; }
    getClientRects() { return [1]; }
    closest() { return form; }
    focus() {}
    dispatchEvent() {}
  }
  const editor = new Textarea();
  const fixtureWindow: any = {}; fixtureWindow.top = fixtureWindow;
  const page = {
    window: fixtureWindow, performance: { now: () => 0 },
    get location() { const u = new URL(state.url); return { origin: u.origin, pathname: u.pathname }; },
    Date: FixtureDate, HTMLTextAreaElement: Textarea, Event: class {},
    document: {
      readyState: 'complete', visibilityState: 'visible', documentElement: {},
      createTreeWalker: () => ({ nextNode: () => null }),
      querySelector: () => state.busy ? {} : null,
      querySelectorAll: (selector: string) => selector === '#prompt-textarea'
        ? Array.from({ length: state.editorCount }, () => editor)
        : state.messages.filter(m => !selector.includes('="user"') || selector.includes('="assistant"') || m.role === 'user').map(messageNode),
    },
  };
  const chrome = {
    runtime: { id: EXTENSION_ID, getURL: (p: string) => ORIGIN + '/' + p,
      onMessage: { addListener: (fn: any) => { message = fn; } } },
    tabs: { query: async () => [{ id: tabId, url: state.url }] },
    debugger: {
      attach: async () => { state.attached++; },
      detach: async (target: any) => { await state.beforeDetach?.(); state.detached++; onDetach?.(target); },
      onEvent: { addListener: (fn: any) => { onEvent = fn; } },
      onDetach: { addListener: (fn: any) => { onDetach = fn; } },
      sendCommand: async (_target: any, method: string, params: any) => {
        if (method === 'Page.enable') return {};
        if (method !== 'Runtime.evaluate') { state.evaluations.push(method); return {}; }
        state.evaluations.push(params.expression);
        await state.beforeEvaluate?.(params.expression);
        try { return { result: { value: runInNewContext(params.expression, page) } }; }
        catch (error) { return { exceptionDetails: { exception: { description: (error as Error).message } } }; }
      },
    },
  };
  const context = createContext({ chrome, crypto: webcrypto, URL, Date: FixtureDate, AbortSignal,
    setTimeout: timer, clearTimeout: clear,
    fetch: async (url: string, options: any) => {
      if (!url.startsWith('http://127.0.0.1:8765/browser-bridge/')) throw new Error('Unexpected donor endpoint');
      if (options.headers['X-Agent-Core-Extension'] !== EXTENSION_ID) throw new Error('Missing extension identity');
      const route = new URL(url).pathname, body = JSON.parse(options.body);
      if (route.endsWith('/poll')) await state.beforePoll?.(body);
      const response = await fetch(base + route, { ...options, headers: { ...options.headers, Origin: ORIGIN } });
      let data = await response.json();
      if (route.endsWith('/poll') && state.afterPoll) data = await state.afterPoll(data, body);
      state.wire.push({ route, body, data });
      return { ok: response.ok, json: async () => data };
    },
  });
  const source = (file: string) => readFileSync(path.join(SOURCE_ROOT!, file), 'utf8');
  const exports = (file: string, names: string[]) => runInContext(
    '(() => {\n' + source(file).replace(/\bexport /g, '') + '\nreturn {' + names.join(',') + '};\n})()', context);
  Object.assign(context, exports('protocol.js', ['executeCommand', 'releaseInput']));
  Object.assign(context, exports('conversation.js', ['Conversation', 'identity', 'pageRead', 'pageSend', 'pageUserIds',
    ...(source('conversation.js').includes('export function selectChatTurns') ? ['selectChatTurns'] : [])]));
  if (existsSync(path.join(SOURCE_ROOT!, 'dom-diagnostic.js')))
    Object.assign(context, exports('dom-diagnostic.js', ['inspectBoundDOM']));
  runInContext(source('worker.js').replace(/^import .*\r?\n/gm, ''), context);
  const local = (body: any, sender = { id: EXTENSION_ID, url: POPUP }) => new Promise<any>(resolve => {
    if (!message(body, sender, resolve)) resolve({ refused: true });
  });
  return {
    state, local,
    navigate(url: string) { state.url = url; onEvent({ tabId }, 'Page.navigatedWithinDocument', { url }); },
    async dispose() { await local({ action: 'disconnect' }); for (const t of timers) clearTimeout(t); timers.clear(); },
  };
}
