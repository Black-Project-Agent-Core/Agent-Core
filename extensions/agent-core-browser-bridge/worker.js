import { executeCommand, releaseInput } from './protocol.js';

const BASE = 'http://127.0.0.1:8765/browser-bridge';
let grant = null;
let connecting = false;
let lastStatus = 'Disconnected';

async function bounded(work) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Debugger timeout; result unknown')), 8000);
  })]); } finally { clearTimeout(timer); }
}

async function call(route, body) {
  const response = await fetch(BASE + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Core-Extension': chrome.runtime.id },
    body: JSON.stringify(body), signal: AbortSignal.timeout(35_000), cache: 'no-store',
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
  lastStatus = status;
  if (grant === current) grant = null;
  await detach(current).catch(() => { lastStatus = 'Disconnected; debugger detach could not be confirmed'; });
  await call('/disconnect', { sessionId: current.sessionId, token: current.token }).catch(() => {});
  current.token = '';
}

async function poll(current) {
  let replies = [];
  try {
    while (grant === current && !current.closing) {
      const events = current.events.splice(0, 16);
      const batch = await call('/poll', { sessionId: current.sessionId, token: current.token, replies, events });
      replies = [];
      if (batch.state === 'closed') { await disconnect(current, 'Disconnected by Agent Core'); return; }
      if (!Array.isArray(batch.commands) || batch.commands.length > 8 || batch.tabId !== current.tabId)
        throw new Error('Invalid bridge response');
      for (const command of batch.commands) {
        if (current.seen.has(command.id)) throw new Error('Repeated command refused');
        current.seen.add(command.id);
        if (current.seen.size > 4096) throw new Error('Bridge command budget exceeded');
        try {
          replies.push(await bounded(executeCommand(chrome.debugger, current.tabId, command, current.pressed, () => detach(current))));
        } catch (error) {
          if (error?.message === 'Debugger timeout; result unknown') throw error;
          replies.push({ id: command.id, error: String(error?.message || 'Debugger command failed').slice(0,500) });
        }
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
  let current;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Select the intended HTTP(S) tab first');
    const paired = await call('/pair', { code, tabId: tab.id, url: tab.url });
    current = { ...paired, attached: false, detaching: false, closing: false, events: [], pressed: new Map(), seen: new Set() };
    await bounded(chrome.debugger.attach({ tabId: tab.id }, '1.3'));
    current.attached = true;
    grant = current;
    lastStatus = 'Connected to tab ' + tab.id;
    void poll(current);
    return { status: lastStatus, connected: true };
  } catch (error) {
    if (current) await disconnect(current, 'Connection failed');
    throw error;
  } finally { connecting = false; }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (grant?.tabId !== source.tabId || source.sessionId || grant.events.length >= 16) return;
  if (method === 'Page.javascriptDialogOpening' || method === 'Page.javascriptDialogClosed')
    grant.events.push({ method, params });
});
chrome.debugger.onDetach.addListener(source => {
  if (grant?.tabId === source.tabId && !grant.detaching) void disconnect(grant, 'Debugger detached; reconnect manually');
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('popup.html'))) return false;
  const action = message.action === 'connect' ? connect(String(message.code || '').trim())
    : message.action === 'disconnect' ? disconnect(grant, 'Disconnected by user').then(() => ({ status: lastStatus, connected: false }))
    : Promise.resolve({ status: lastStatus, connected: !!grant });
  action.then(reply, error => reply({ error: String(error?.message || 'Bridge error') }));
  return true;
});
