import { executeCommand, releaseInput } from './protocol.js';

const BASE = 'http://127.0.0.1:8765/browser-bridge';
const MAX_ENVELOPE_BYTES = 240 * 1024;
let grant = null;
let connecting = false;
let connectionCancelled = false;
let pendingGrant = null;
let lastStatus = 'Disconnected';

async function bounded(work) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Debugger timeout; result unknown')), 8000);
  })]); } finally { clearTimeout(timer); }
}

async function call(route, body) {
  const encoded = JSON.stringify(body);
  if (new TextEncoder().encode(encoded).byteLength >= MAX_ENVELOPE_BYTES)
    throw new Error('BROWSER_BRIDGE_ENVELOPE_TOO_LARGE');
  const response = await fetch(BASE + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Core-Extension': chrome.runtime.id },
    body: encoded, signal: AbortSignal.timeout(35_000), cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Agent Core connection failed');
  return data;
}

async function detach(current) {
  current.detaching = true;
  await bounded(releaseInput(chrome.debugger, current.tabId, current.pressed)).catch(() => {});
  if (current.attached) await bounded(chrome.debugger.detach({ tabId: current.tabId }));
  current.attached = false;
}

async function disconnect(current, status) {
  if (!current || current.closing) return;
  current.closing = true;
  current.generation++;
  lastStatus = status;
  if (grant === current) grant = null;
  await detach(current).catch(() => { lastStatus = 'Disconnected; debugger detach could not be confirmed'; });
  await call('/disconnect', { sessionId: current.sessionId, token: current.token }).catch(() => {});
  current.token = '';
}

async function setPaused(current, paused, notifyHost = true) {
  if (!current || grant !== current || current.closing || !current.attached)
    throw new Error('No attached tab');
  if (current.controlling) throw new Error('Tab control change already in progress');
  current.controlling = true;
  try {
    // Stop new dispatch synchronously, including commands already returned by a poll.
    if (paused) { current.paused = true; current.generation++; }
    else current.paused = false; // Host remains paused until this request is accepted.
    if (notifyHost) await call('/control', { sessionId: current.sessionId, token: current.token, paused });
    if (paused) {
      // A popup pause can interrupt an awaited CDP command. Release after it settles.
      // An AgentCore.pause command is already serialized and must not await itself.
      if (notifyHost && current.executing) await current.executing.catch(() => {});
      if (current.closing || grant !== current) throw new Error('Tab disconnected during pause');
      if (!await bounded(releaseInput(chrome.debugger, current.tabId, current.pressed)))
        throw new Error('Input release could not be confirmed');
    }
    lastStatus = (paused ? 'Paused on tab ' : 'Connected to tab ') + current.tabId;
    return { paused, released: true };
  } catch (error) {
    await disconnect(current, String(error?.message || 'Tab control failed'));
    throw error;
  } finally { current.controlling = false; }
}

function releaseAfterInvalidation(current) {
  if (current.releasing || !current.pressed.size) return;
  current.releasing = (async () => {
    if (current.executing) await current.executing.catch(() => {});
    if (current.closing || !current.attached) return;
    if (!await bounded(releaseInput(chrome.debugger, current.tabId, current.pressed)))
      throw new Error('Input release could not be confirmed after navigation');
  })().catch(error => disconnect(current, String(error?.message || 'Input release failed')))
    .finally(() => { current.releasing = null; });
}

async function poll(current) {
  let replies = [];
  try {
    while (grant === current && !current.closing) {
      const events = current.events.splice(0, 16);
      const generation = current.generation;
      const batch = await call('/poll', { sessionId: current.sessionId, token: current.token, replies, events });
      replies = [];
      // An in-flight poll can finish after the user has detached. Never dispatch it.
      if (grant !== current || current.closing) return;
      if (batch.state === 'closed') { await disconnect(current, 'Disconnected by Agent Core'); return; }
      if (!Array.isArray(batch.commands) || batch.commands.length > 8 || batch.tabId !== current.tabId)
        throw new Error('Invalid bridge response');
      for (const command of batch.commands) {
        if (current.releasing) await current.releasing;
        if (grant !== current || current.closing) return;
        if (current.seen.has(command.id)) throw new Error('Repeated command refused');
        current.seen.add(command.id);
        if (current.seen.size > 4096) throw new Error('Bridge command budget exceeded');
        const control = ['AgentCore.detach', 'AgentCore.pause', 'AgentCore.resume'].includes(command.method);
        if (!current.attached || (!control && (current.paused || generation !== current.generation))) {
          replies.push({ id: command.id, error: 'BROWSER_CONTROL_PAUSED: command cancelled; observe again' });
          continue;
        }
        try {
          const executing = bounded(executeCommand(chrome.debugger, current.tabId, command, current.pressed,
            () => detach(current), paused => setPaused(current, paused, false)));
          current.executing = executing;
          replies.push(await executing);
        } catch (error) {
          if (error?.message === 'Debugger timeout; result unknown') throw error;
          replies.push({ id: command.id, error: String(error?.message || 'Debugger command failed').slice(0,500) });
        } finally { current.executing = null; }
      }
    }
  } catch (error) {
    // A lost response may follow a mutation. Detach; do not replay commands or reconnect automatically.
    await disconnect(current, String(error?.message || 'Connection lost; reconnect manually'));
  }
}

async function connect(code) {
  if (grant || connecting) throw new Error('A tab is already connected or connecting');
  if (!/^[a-f0-9]{32}$/.test(code)) throw new Error('Enter the one-use Agent Core pairing code');
  connecting = true;
  connectionCancelled = false;
  let current;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Select the intended HTTP(S) tab first');
    if (connectionCancelled) throw new Error('Connection cancelled');
    const paired = await call('/pair', { code, tabId: tab.id, url: tab.url });
    if (paired.tabId !== tab.id || typeof paired.sessionId !== 'string' || typeof paired.token !== 'string')
      throw new Error('Invalid tab grant');
    current = { ...paired, attached: false, detaching: false, closing: false, paused: false,
      controlling: false, generation: 0, executing: null, releasing: null, events: [], pressed: new Map(), seen: new Set() };
    pendingGrant = current;
    if (connectionCancelled) throw new Error('Connection cancelled');
    await bounded(chrome.debugger.attach({ tabId: tab.id }, '1.3').then(async () => {
      current.attached = true;
      // A debugger attach cannot be cancelled; a late success must clean itself up.
      if (current.closing || connectionCancelled) { await detach(current); throw new Error('Connection cancelled'); }
    }));
    if (current.closing) { await detach(current); throw new Error('Connection cancelled'); }
    grant = current;
    lastStatus = 'Connected to tab ' + tab.id;
    void poll(current);
    return { status: lastStatus, connected: true, paused: false };
  } catch (error) {
    if (current) await disconnect(current, 'Connection failed');
    throw error;
  } finally { connecting = false; pendingGrant = null; }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (grant?.tabId !== source.tabId || source.sessionId) return;
  if (method === 'Page.frameNavigated' && params?.frame?.parentId) return;
  let boundedParams;
  if (method === 'Page.frameNavigated') boundedParams = { frame: { id: String(params?.frame?.id ?? '').slice(0, 256) } };
  else if (method === 'Page.navigatedWithinDocument') boundedParams = { frameId: String(params?.frameId ?? '').slice(0, 256) };
  else if (method === 'Page.frameResized' || method === 'Page.javascriptDialogClosed') boundedParams = {};
  else if (method === 'Page.javascriptDialogOpening') boundedParams = {
    type: String(params?.type ?? 'dialog').slice(0, 64), message: String(params?.message ?? '').slice(0, 500),
  };
  else return;
  const invalidation = ['Page.frameNavigated', 'Page.navigatedWithinDocument', 'Page.frameResized'].includes(method);
  if (invalidation) { grant.generation++; releaseAfterInvalidation(grant); }
  // Only bounded lifecycle metadata crosses the bridge, never whole frame payloads.
  if (grant.events.length < 16) grant.events.push({ method, params: boundedParams });
  else if (invalidation) grant.events[15] = { method, params: boundedParams };
});
chrome.debugger.onDetach.addListener(source => {
  if (grant?.tabId === source.tabId && !grant.detaching) {
    grant.attached = false;
    void disconnect(grant, 'Debugger detached; reconnect manually');
  }
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  if (message.action === 'disconnect' || message.action === 'takeover') connectionCancelled = true;
  const status = () => ({ status: lastStatus, connected: !!grant, paused: !!grant?.paused, connecting });
  const action = message.action === 'connect' ? connect(String(message.code || '').trim())
    : message.action === 'disconnect' || message.action === 'takeover'
      ? disconnect(grant ?? pendingGrant, 'Disconnected by user').then(status)
    : message.action === 'pause' || message.action === 'resume'
      ? setPaused(grant, message.action === 'pause').then(status)
    : Promise.resolve(status());
  action.then(reply, error => reply({ ...status(), error: String(error?.message || 'Bridge error') }));
  return true;
});
