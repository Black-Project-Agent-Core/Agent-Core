import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { projectBrowserShape, type BrowserShapeProfile, type BrowserShapeKind } from './procedure-context.js';
import { stageBrowserObservationUse } from '../../tracker/tool-invocation.js';
import type { ExternalInvocationContext } from '../../learning/external-controller.js';
import { projectControlStates } from './control-state.js';
import { CanvasObserver, canvasOptionsSchema, type CanvasOptions } from './canvas-observation.js';
import { OwnedTabs, listOwnedPageTargets, isPageUrl, type PageTarget } from './owned-tabs.js';
import { KeyboardActions, PRESS_KEYS, HOLD_KEYS, HOLD_DURATIONS, validateCapabilities, type InteractionCapability } from './keyboard-actions.js';
import { redactSensitiveString } from '../../security/redaction.js';
import { browserExtensionBridge, BrowserExtensionBridge, ExtensionBrowserClient, type BrowserTransport } from './extension-bridge.js';
import { access, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePortableProjectPath, resolveProjectRoot } from '../../portability/paths.js';
import { snapshotDescendantPids, terminateOwnedProcessTree } from '../../process/owned-process-tree.js';

const MAX_ACTIONS = 60;
const MAX_OBSERVATIONS = 120;
const MAX_CANDIDATES = 250;
const MAX_TEXT_LENGTH = 2000;
const START_TIMEOUT_MS = 15_000;
const MODULE_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PROJECT_ROOT = resolveProjectRoot(process.env, MODULE_PROJECT_ROOT);

type ActionKind = 'click' | 'fill' | 'select' | 'scroll' | 'wait' | 'switch_tab' | 'press_key' | 'hold_key' | 'back';
export interface BrowserOpenOptions { interactionCapabilities?: InteractionCapability[]; transport?: 'isolated' | 'extension' }
export interface BrowserObserveOptions { canvas?: CanvasOptions; host?: ExternalInvocationContext }

interface RawAction {
  id: string;
  kind: ActionKind;
  label: string;
  node?: number;
  role?: string;
  value?: string;
  current_value?: string;
  delta?: number;
  checked?: string;
  selected?: string;
  expanded?: string;
  key?: string;
  durationMs?: number;
  targetId?: string;
  tabId?: string;
  targetUrl?: string;
  history?: {currentId:number;entryId:number;url:string};
}

interface RawPage {
  url: string;
  title: string;
  text: string;
  actions: RawAction[];
  marker: unknown;
  page_key: unknown;
  guards: Record<string, unknown>;
  omitted_actions: number;
  control_states: {items: any[]; total: number};
  document_key: unknown;
  focus_key: unknown;
  keyboard_safe: boolean;
}

interface Observation {
  id: string;
  page: RawPage;
  targetId: string;
  capturedAt: string;
  browserProfile?: BrowserShapeProfile;
  browserBinding?: Readonly<BrowserObservationBinding>;
}
interface BrowserObservationBinding {
  ownerId:string; sessionId:string; taskId:string; workspace:string;
  workspaceIdentityKey:string; processSessionId:string;
}
function browserBinding(context?:ExternalInvocationContext): Readonly<BrowserObservationBinding> | undefined {
  return context?.binding==='bound' && context.ownerId && context.sessionId && context.taskId
    && context.workspace && context.workspaceIdentityKey && context.processSessionId
    ? Object.freeze({ownerId:context.ownerId, sessionId:context.sessionId,
      taskId:context.taskId, workspace:context.workspace,
      workspaceIdentityKey:context.workspaceIdentityKey, processSessionId:context.processSessionId}) : undefined;
}
function sameBrowserBinding(a?:Readonly<BrowserObservationBinding>, b?:Readonly<BrowserObservationBinding>):boolean {
  return Boolean(a && b && a.ownerId===b.ownerId && a.sessionId===b.sessionId
    && a.taskId===b.taskId && a.workspace===b.workspace
    && a.workspaceIdentityKey===b.workspaceIdentityKey && a.processSessionId===b.processSessionId);
}

interface BrowserSession {
  id: string;
  process: ChildProcess | null;
  runtimeDir: string;
  profileDir: string;
  port: number;
  client: BrowserTransport;
  extension?: ExtensionBrowserClient;
  initialized?: boolean;
  headless: boolean;
  executable: string;
  lastObservation?: Observation;
  actionCount: number;
  observationCount: number;
  openedAt: string;
  targetId: string;
  tabs: OwnedTabs;
  canvas: CanvasObserver;
  keyboard: KeyboardActions;
  interactionCapabilities: InteractionCapability[];
  actionInFlight: boolean;
  dialog?: {type:string;message:string};
}

interface BrowserControlLimits {
  maxActions?: number;
  maxObservations?: number;
  extensionBridge?: BrowserExtensionBridge;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function registryAppPath(executable: string): string | undefined {
  if (process.platform !== 'win32') return undefined;
  for (const hive of ['HKLM', 'HKCU']) {
    try {
      const output = execFileSync('reg.exe', [
        'query',
        `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${executable}`,
        '/ve',
      ], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const match = output.match(/REG_SZ\s+(.+)$/m);
      const candidate = match?.[1]?.trim();
      if (candidate) return candidate;
    } catch {
      // Try the next registry hive.
    }
  }
  return undefined;
}

function whereExecutable(executable: string): string | undefined {
  try {
    const output = execFileSync(
      process.platform === 'win32' ? 'where.exe' : 'which',
      [executable],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output.split(/\r?\n/).map(value => value.trim()).find(Boolean);
  } catch {
    return undefined;
  }
}

async function projectLocalBrowserCandidates(): Promise<string[]> {
  const roots = [
    {
      root: path.join(PROJECT_ROOT, 'runtime', 'browser-control', 'headless-shell', 'chrome-headless-shell'),
      leaf: ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
    },
    {
      root: path.join(PROJECT_ROOT, 'runtime', 'browser-control', 'browsers', 'chrome'),
      leaf: ['chrome-win64', 'chrome.exe'],
    },
  ];
  const candidates: string[] = [];
  for (const item of roots) {
    try {
      const builds = (await readdir(item.root, { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && entry.name.startsWith('win64-'))
        .map(entry => entry.name)
        .sort()
        .reverse();
      for (const build of builds) candidates.push(path.join(item.root, build, ...item.leaf));
    } catch {
      // Optional project-local browser cache may not exist yet.
    }
  }
  return candidates;
}

async function resolveBrowserExecutable(headless: boolean): Promise<string> {
  const explicitBrowser = process.env.AGENT_CORE_BROWSER_EXECUTABLE?.trim();
  const portableExplicitBrowser = explicitBrowser
    ? resolvePortableProjectPath(
      PROJECT_ROOT,
      explicitBrowser,
      path.join('runtime', 'browser-control', 'browser.exe'),
    )
    : undefined;
  const candidates = [
    portableExplicitBrowser,
    ...await projectLocalBrowserCandidates(),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)']!, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    registryAppPath('chrome.exe'),
    whereExecutable('chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)']!, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    registryAppPath('msedge.exe'),
    whereExecutable('msedge.exe'),
    whereExecutable('chromium'),
    whereExecutable('chromium-browser'),
  ].filter((value): value is string => Boolean(value));
  let headlessCandidateFound = false;
  for (const candidate of candidates) {
    if (!await fileExists(candidate)) continue;
    if (!headless && path.basename(candidate).toLowerCase().includes('headless-shell')) {
      if (candidate === portableExplicitBrowser) throw new Error('BROWSER_CONTROL_HEADED_BROWSER_UNAVAILABLE');
      headlessCandidateFound = true;
      continue;
    }
    return candidate;
  }
  if (headlessCandidateFound) throw new Error('BROWSER_CONTROL_HEADED_BROWSER_UNAVAILABLE');
  throw new Error('BROWSER_CONTROL_EXECUTABLE_NOT_FOUND');
}

function assertOpenUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('BROWSER_CONTROL_URL_INVALID');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('BROWSER_CONTROL_URL_SCHEME_REFUSED');
  }
  return url;
}

class CdpClient {
  private readonly pending = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private nextId = 1;
  private closed = false;
  onEvent?: (method:string, params:any) => void;

  private constructor(private readonly socket: any) {
    socket.addEventListener('message', (event: any) => {
      if (typeof event.data !== 'string') return;
      let message: any;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message?.id) { if(typeof message?.method==='string')this.onEvent?.(message.method,message.params??{}); return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`CDP_${message.error.code}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    });
    socket.addEventListener('close', () => {
      this.closed = true;
      const error = new Error('BROWSER_CONTROL_CDP_CLOSED');
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
      this.pending.clear();
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const WebSocketImpl = (globalThis as any).WebSocket;
    if (typeof WebSocketImpl !== 'function') throw new Error('BROWSER_CONTROL_WEBSOCKET_UNAVAILABLE');
    const socket = new WebSocketImpl(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('BROWSER_CONTROL_CDP_CONNECT_TIMEOUT')), 5_000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('BROWSER_CONTROL_CDP_CONNECT_FAILED'));
      }, { once: true });
    });
    return new CdpClient(socket);
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if(this.closed)throw new Error('BROWSER_CONTROL_CDP_CLOSED');
    const id = this.nextId++;
    return await new Promise((resolve, reject) => {
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('BROWSER_CONTROL_CDP_TIMEOUT'));},10000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  close(): void {
    try { this.socket.close(); } catch { /* best effort */ }
  }
}

const SNAPSHOT_SCRIPT = String.raw`(() => {
  const cache = window.__agentCoreBrowser || (window.__agentCoreBrowser = {
    next: 1, ids: new WeakMap(), nodes: new Map()
  });
  const identity = e => {
    let id = cache.ids.get(e);
    if (!id) { id = cache.next++; cache.ids.set(e, id); cache.nodes.set(id, e); }
    return id;
  };
  for (const [id, e] of cache.nodes) if (!e.isConnected) cache.nodes.delete(id);
  const safe = e => !['password','file','hidden'].includes(String(e.type || '').toLowerCase());
  const visible = e => {
    if (!e || e.closest('[aria-hidden="true"],[inert]')) return false;
    if (typeof e.checkVisibility === 'function') {
      return e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };  const name = (e, seen = new Set()) => {
    if (!e || seen.has(e)) return '';
    seen.add(e);
    const refs = (e.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map(id => name(document.getElementById(id), seen)).filter(Boolean).join(' ');
    return refs || e.getAttribute('aria-label')
      || [...(e.labels || [])].map(l => name(l, seen)).filter(Boolean).join(' ')
      || (['button','submit','reset'].includes(e.type) ? e.value : '')
      || e.getAttribute('alt')
      || (e.tagName === 'INPUT' ? '' : [...e.childNodes].map(n =>
          n.nodeType === 3 ? n.textContent :
          n.nodeType === 1 && n.getAttribute('aria-hidden') !== 'true' ? name(n, seen) : ''
        ).join(' ').trim())
      || e.getAttribute('title') || e.getAttribute('placeholder') || '';
  };
  const roles = ['button','link','checkbox','radio','switch','tab','menuitem','menuitemradio',
    'option','gridcell','combobox','textbox','searchbox','spinbutton'];
  const selector = 'a[href],button,input,textarea,select,summary,[contenteditable="true"],'
    + roles.map(role => '[role="' + role + '"]').join(',');
  const role = e => {
    const explicit = e.getAttribute('role');
    if (roles.includes(explicit)) return explicit;
    if (e.tagName === 'BUTTON' || e.tagName === 'SUMMARY') return 'button';
    if (e.tagName === 'A') return 'link';
    if (e.tagName === 'SELECT') return 'combobox';
    if (e.tagName === 'TEXTAREA' || e.isContentEditable) return 'textbox';
    if (e.tagName === 'INPUT') {
      if (['checkbox','radio'].includes(e.type)) return e.type;
      if (['button','submit','reset','image'].includes(e.type)) return 'button';
      if (e.type === 'search') return 'searchbox';
      if (e.type === 'number') return 'spinbutton';
      if (['text','email','url','tel'].includes(e.type)) return 'textbox';
    }
    return null;
  };  cache.pageKey = () => [performance.timeOrigin, location.href, scrollX, scrollY, innerWidth, innerHeight,
    [...document.querySelectorAll('input,textarea,select')].filter(safe)
      .map(e => [identity(e), e.value, e.checked, e.selectedIndex, e.disabled, e.readOnly])];
  cache.guard = e => {
    if (!e?.isConnected || !visible(e)) return null;
    const scope = e.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]') || e.parentElement;
    return [identity(e), role(e), name(e), e.value ?? null, e.checked ?? null, e.selectedIndex ?? null,
      e.readOnly ?? null, e.matches(':disabled'), e.getAttribute('aria-disabled'),
      e.getAttribute('aria-expanded'), e.getAttribute('aria-checked'), e.getAttribute('aria-selected'),
      e.getAttribute('href'), scope?.innerText?.slice(0, 6000) || ''];
  };
  cache.focusKey = () => {
    const e=document.activeElement;
    if(!e || e.tagName==='IFRAME' || !safe(e) || !visible(e)) return null;
    return [performance.timeOrigin,location.href,identity(e),role(e),e.getAttribute('type'),
      e.readOnly===true,e.matches(':disabled'),e.getAttribute('aria-disabled'),
      e.value ?? (e.isContentEditable ? e.innerText.slice(0,2000) : null)];
  };
  const focus_key=cache.focusKey();
  const keyboard_safe=Boolean(focus_key) && ['http:','https:'].includes(location.protocol);
  const control_states={items:[],total:0};
  let stateBytes=0;
  for(const e of document.querySelectorAll('input,textarea,select,[contenteditable="true"],[role="checkbox"],[role="radio"],[role="switch"],[role="combobox"],[role="textbox"],[aria-expanded],[aria-selected]')) {
    if(!safe(e)||!visible(e))continue;
    const r=e.getBoundingClientRect();
    if(!r.width||!r.height||r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)continue;
    control_states.total++;
    if(control_states.items.length>=128)continue;
    let truncated=false;
    const clip=v=>{const s=String(v??'');if(s.length>500)truncated=true;return s.slice(0,500);};
    const item={node:identity(e),role:role(e)||e.tagName.toLowerCase(),label:clip(name(e)),
      readOnly:e.readOnly===true||e.getAttribute('aria-readonly')==='true',
      disabled:e.matches(':disabled')||Boolean(e.closest('[aria-disabled="true"]'))};
    if('value' in e)item.value=clip(e.value);
    else if(e.isContentEditable)item.value=clip(e.innerText);
    for(const key of ['checked','selected','expanded']) {
      const value=e.getAttribute('aria-'+key);if(value!==null)item[key]=clip(value);
    }
    if(['checkbox','radio'].includes(e.type))item.checked=e.indeterminate?'mixed':String(e.checked);
    if(e.tagName==='SELECT') {
      const selected=[...e.selectedOptions];if(selected.length>16)truncated=true;
      item.selectedLabels=selected.slice(0,16).map(o=>clip(o.label));
      item.selectedValues=selected.slice(0,16).map(o=>clip(o.value));
    }
    item.truncated=truncated;
    const size=JSON.stringify(item).length;
    if(stateBytes+size>7800)continue;
    control_states.items.push(item);stateBytes+=size;
  }
  const actions = [];
  for (const e of document.querySelectorAll(selector)) {
    if (!safe(e) || !visible(e) || e.matches(':disabled') || e.closest('[aria-disabled="true"]')) continue;
    const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2, rname = role(e);
    if (!rname || r.width <= 0 || r.height <= 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    if (rname === 'gridcell' && e.querySelector('button,[role="button"]')) continue;
    const base = { node: identity(e), role: rname, label: name(e) || rname };
    for (const key of ['checked','selected','expanded']) {
      const value = e.getAttribute('aria-' + key);
      if (value !== null) base[key] = value;
    }
    if (['checkbox','radio'].includes(e.type)) base.checked = String(e.checked);    if (e.tagName === 'SELECT') {
      for (const o of e.options) {
        if (o.selected || o.disabled || o.closest('optgroup[disabled]')) continue;
        actions.push({ ...base, kind: 'select', value: o.value,
          current_value: [...e.selectedOptions].map(o => o.label).join(', '),
          label: base.label + ' → ' + o.label });
      }
    } else {
      const editable = !e.readOnly && e.getAttribute('aria-readonly') !== 'true'
        && (['textbox','searchbox','spinbutton'].includes(rname)
          || (rname === 'combobox' && ['INPUT','TEXTAREA'].includes(e.tagName)));
      const value = 'value' in e ? String(e.value)
        : (e.isContentEditable || rname === 'combobox' ? e.innerText.trim() : '');
      actions.push({ ...base, kind: editable ? 'fill' : 'click', value });
      if (editable) actions.push({ ...base, kind: 'click', value, label: 'Open ' + base.label });
    }
  }
  const words = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange(); let node, length = 0;
  while ((node = walker.nextNode()) && length < 6000) {
    const value = node.textContent.trim(), parent = node.parentElement;
    if (!value || !parent || parent.closest('script,style,noscript,template') || !visible(parent)) continue;
    range.selectNodeContents(node); const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
      words.push(value); length += value.length;
    }
  }  const text = words.join('\n').slice(0, 6000), height = document.documentElement.scrollHeight;
  const page_key = cache.pageKey(), guards = {};
  for (const a of actions) if (!(a.node in guards)) guards[a.node] = cache.guard(cache.nodes.get(a.node));
  const semantics = actions.map(a => ({ ...a }));
  const marker = [performance.timeOrigin, location.href, scrollX, scrollY, innerWidth, innerHeight,
    document.title, text, semantics, page_key[6]];
  const omitted_actions = Math.max(0, actions.length - 247);
  actions.splice(247);
  actions.forEach((a, i) => a.id = 'e' + (i + 1));
  if (scrollY + innerHeight < height - 2) actions.push({ id: 'scroll_down', kind: 'scroll', label: 'Scroll down', delta: 560 });
  if (scrollY > 0) actions.push({ id: 'scroll_up', kind: 'scroll', label: 'Scroll up', delta: -560 });
  actions.push({ id: 'wait', kind: 'wait', label: 'Wait briefly for the page to update' });
  return { url: location.href, title: document.title, text, actions, marker, page_key, guards, omitted_actions, control_states, document_key:[performance.timeOrigin,location.href], focus_key, keyboard_safe };
})()`;

async function runtimeEvaluate(client: BrowserTransport, expression: string, awaitPromise = false): Promise<any> {
  const response = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (response.exceptionDetails) throw new Error('BROWSER_CONTROL_DOCUMENT_CHANGED');
  return response.result?.value;
}

async function pageTarget(port: number): Promise<PageTarget> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const values = await listOwnedPageTargets(port);
      const page = values.find(value => value.url==='about:blank'||isPageUrl(value.url));
      if (page) return page;
    } catch {
      // Browser may still be starting.
    }
    await sleep(50);
  }
  throw new Error('BROWSER_CONTROL_PAGE_TARGET_TIMEOUT');
}

async function waitForDevToolsPort(profileDir: string, child: ChildProcess): Promise<number> {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`BROWSER_CONTROL_BROWSER_EXITED_${child.exitCode}`);
    try {
      const first = (await readFile(portFile, 'utf8')).split(/\r?\n/)[0]?.trim();
      const port = Number(first);
      if (Number.isInteger(port) && port > 0 && port < 65536) return port;
    } catch {
      // File is created asynchronously by Chromium.
    }
    await sleep(50);
  }
  throw new Error('BROWSER_CONTROL_START_TIMEOUT');
}

function publicActions(actions: RawAction[]): Array<Record<string, unknown>> {
  return actions.map(action => ({
    id: action.id,
    operation: action.kind === 'fill' ? 'TYPE_TEXT'
      : action.kind === 'select' ? 'SELECT'
      : action.kind === 'scroll' ? 'SCROLL'
      : action.kind === 'wait' ? 'WAIT'
      : action.kind === 'switch_tab' ? 'SWITCH_TAB'
      : action.kind === 'press_key' ? 'PRESS_KEY'
      : action.kind === 'hold_key' ? 'HOLD_KEY'
      : action.kind === 'back' ? 'BACK' : 'CLICK',
    label: action.label,
    ...(action.key ? {key:action.key} : {}),
    ...(action.durationMs !== undefined ? {durationMs:action.durationMs} : {}),
    ...(action.tabId ? {tabId:action.tabId} : {}),
    ...(action.role ? { role: action.role } : {}),
    ...(action.value !== undefined && action.kind !== 'select' ? { currentValue: action.value } : {}),
    ...(action.current_value !== undefined ? { currentValue: action.current_value } : {}),
    ...(action.kind === 'select' ? { optionValue: action.value } : {}),
    ...(action.checked !== undefined ? { checked: action.checked } : {}),
    ...(action.selected !== undefined ? { selected: action.selected } : {}),
    ...(action.expanded !== undefined ? { expanded: action.expanded } : {}),
  }));
}

function comparable(value: unknown): string {
  return JSON.stringify(value);
}

export class BrowserControlService {
  private readonly sessions = new Map<string, BrowserSession>();
  private readonly maxActions: number;
  private readonly maxObservations: number;
  private readonly extensionBridge: BrowserExtensionBridge;

  constructor(limits: BrowserControlLimits = {}) {
    this.maxActions = limits.maxActions ?? MAX_ACTIONS;
    this.maxObservations = limits.maxObservations ?? MAX_OBSERVATIONS;
    this.extensionBridge = limits.extensionBridge ?? browserExtensionBridge;
  }

  async open(urlValue: string, headless = true, options: BrowserOpenOptions = {}): Promise<Record<string, unknown>> {
    const interactionCapabilities=validateCapabilities(options.interactionCapabilities);
    const url = assertOpenUrl(urlValue);
    if (options.transport === 'extension') {
      const client = this.extensionBridge.request(url.toString());
      const session: BrowserSession = {
        id: client.id, process: null, runtimeDir: '', profileDir: '', port: 0,
        client, extension: client, headless: false, executable: 'connected-tab',
        actionCount: 0, observationCount: 0, openedAt: new Date().toISOString(),
        targetId: 'extension:' + client.id, tabs: new OwnedTabs(), canvas: new CanvasObserver(),
        keyboard: new KeyboardActions(), interactionCapabilities, actionInFlight: false,
      };
      this.bindEvents(session, client);
      this.sessions.set(session.id, session);
      return { sessionId: session.id, transport: 'extension', status: 'pairing-required',
        pairingCode: client.code, pairingExpiresInSeconds: 300, expectedOrigin: url.origin,
        instructions: 'Activate the intended existing HTTP(S) tab, open Agent Core Browser Bridge and enter this one-use code.',
        pid: null, headless: false, maxActions: this.maxActions, maxObservations: this.maxObservations };
    }
    const executable = await resolveBrowserExecutable(headless);
    const id = randomUUID();
    const runtimeDir = path.join(PROJECT_ROOT, 'runtime', 'rdc', 'browser-control', id);
    const profileDir = path.join(runtimeDir, 'profile');
    const headlessOnly = path.basename(executable).toLowerCase().includes('headless-shell');
    if (!headless && headlessOnly) throw new Error('BROWSER_CONTROL_HEADED_BROWSER_UNAVAILABLE');
    await mkdir(profileDir, { recursive: true });
    const args = [
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,OptimizationHints',
      '--window-size=1120,780',
      ...(headless && !headlessOnly ? ['--headless=new', '--disable-gpu'] : []),
      ...(headlessOnly ? ['--disable-gpu'] : []),
      'about:blank',
    ];
    const child = spawn(executable, args, {
      stdio: 'ignore',
      windowsHide: headless,
    });
    let client: CdpClient | undefined;
    try {
      const port = await waitForDevToolsPort(profileDir, child);
      const target = await pageTarget(port);
      client = await CdpClient.connect(target.webSocketDebuggerUrl);
      await client.send('Page.enable');
      await client.send('Runtime.enable');
      const navigation=await client.send('Page.navigate', { url: url.toString() });
      if(navigation.errorText)throw new Error('BROWSER_CONTROL_NAVIGATION_FAILED');
      const deadline = Date.now() + START_TIMEOUT_MS;
      let documentReady=false;
      while (Date.now() < deadline) {
        try {
          const state = await runtimeEvaluate(client, '({ready:document.readyState,url:location.href})');
          if (isPageUrl(state?.url) && (state.ready === 'complete' || state.ready === 'interactive')) {documentReady=true;break;}
        } catch { /* navigation in progress */ }
        await sleep(50);
      }
      if(!documentReady)throw new Error('BROWSER_CONTROL_NAVIGATION_NOT_READY');
      const session: BrowserSession = {
        id, process: child, runtimeDir, profileDir, port, client, headless,
        executable, actionCount: 0, observationCount: 0, openedAt: new Date().toISOString(),
        targetId:target.id, tabs:new OwnedTabs(), canvas:new CanvasObserver(), keyboard:new KeyboardActions(),
        interactionCapabilities, actionInFlight:false,
      };
      this.bindEvents(session,client);
      this.sessions.set(id, session);
      child.once('exit', () => {
        if (this.sessions.get(id)?.process === child) this.sessions.delete(id);
      });
      return {
        sessionId: id,
        url: url.toString(),
        headless,
        pid: child.pid ?? null,
        browser: path.basename(executable),
        maxActions: this.maxActions,
        maxObservations: this.maxObservations,
      };
    } catch (error) {
      client?.close();
      try { child.kill(); } catch { /* best effort */ }
      await rm(runtimeDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  private bindEvents(session:BrowserSession,client:BrowserTransport):void {
    client.onEvent=(method,params)=>{
      if(method==='Page.javascriptDialogOpening')session.dialog={type:String(params.type??'dialog'),message:redactSensitiveString(String(params.message??'')).slice(0,500)};
      if(method==='Page.javascriptDialogClosed')session.dialog=undefined;
    };
  }

  private session(id: string): BrowserSession {
    const session = this.sessions.get(id);
    if (!session) throw new Error('BROWSER_CONTROL_SESSION_NOT_FOUND');
    if (session.extension) {
      if (session.extension.expired()) session.extension.close();
      if (session.extension.state !== 'attached') throw new Error(session.extension.state === 'closed'
        ? 'BROWSER_CONTROL_SESSION_CLOSED' : 'BROWSER_BRIDGE_PAIRING_PENDING');
    }
    if (session.process && session.process.exitCode !== null) {
      this.sessions.delete(id);
      throw new Error('BROWSER_CONTROL_SESSION_CLOSED');
    }
    return session;
  }

  async observe(sessionId: string, options: BrowserObserveOptions = {}): Promise<Record<string, unknown>> {
    const session = this.session(sessionId);
    if (session.extension && !session.initialized) {
      await session.client.send('Page.enable');
      await session.client.send('Runtime.enable');
      session.initialized = true;
    }
    const canvasOptions=options.canvas===undefined?undefined:canvasOptionsSchema.parse(options.canvas);
    if (session.observationCount >= this.maxObservations) throw new Error('BROWSER_CONTROL_OBSERVATION_BUDGET_EXCEEDED');
    if (session.actionInFlight) throw new Error('BROWSER_CONTROL_ACTION_IN_FLIGHT');
    if (session.dialog) {
      session.lastObservation=undefined;session.observationCount++;
      return {sessionId,status:'blocked-dialog',dialog:session.dialog,actions:[],observationCount:session.observationCount,
        remainingObservations:this.maxObservations-session.observationCount};
    }
    const page = await runtimeEvaluate(session.client, SNAPSHOT_SCRIPT) as RawPage;
    if (!page || !Array.isArray(page.actions)) throw new Error('BROWSER_CONTROL_OBSERVATION_INVALID');
    if (!isPageUrl(page.url)) throw new Error('BROWSER_CONTROL_URL_SCHEME_REFUSED');
    if (page.actions.length > MAX_CANDIDATES) throw new Error('BROWSER_CONTROL_CANDIDATE_BUDGET_EXCEEDED');
    const extras:RawAction[]=[];let tabs:any;
    if (session.extension) {
      tabs = { state: 'available', scope: 'user-connected-tab', items: [{ id: session.targetId, active: true,
        title: redactSensitiveString(page.title).slice(0,200), url: redactSensitiveString(page.url).slice(0,4000) }] };
    } else try {
      const listed=await session.tabs.inventory(session.port,session.targetId);tabs=listed.public;
      for(const entry of listed.entries)if(!entry.active&&!entry.pending)extras.push({
        id:'tab-'+entry.id,kind:'switch_tab',label:'Switch tab: '+redactSensitiveString(entry.target.title).slice(0,200),
        targetId:entry.target.id,targetUrl:entry.target.url,tabId:entry.id,
      });
    }catch{tabs={state:'unavailable',items:[],reason:'owned-target-list-unavailable'};}
    let history:any={state:'disabled'};
    if(session.interactionCapabilities.includes('history')) {
      try {
        const h=await session.client.send('Page.getNavigationHistory'),entries=h.entries;
        const i=h.currentIndex;
        if(!Array.isArray(entries)||entries.length>256||!Number.isInteger(i))throw new Error('invalid-history');
        const current=entries[i],prior=entries[i-1];history={state:'available',canGoBack:false};
        if(current?.url===page.url&&prior&&Number.isInteger(current.id)&&Number.isInteger(prior.id)&&isPageUrl(prior.url)){
          history.canGoBack=true;
          extras.push({id:'history-back',kind:'back',label:'Back to previous observed page',history:{currentId:current.id,entryId:prior.id,url:prior.url}});
        }
      }catch{history={state:'unavailable',reason:'history-unavailable'};}
    }
    const focus=page.focus_key as any[]|null;
    if(page.keyboard_safe&&focus&&!focus[5]&&!focus[6]&&focus[7]!=='true'){
      if(session.interactionCapabilities.includes('keyboard'))for(const key of PRESS_KEYS)extras.push({id:'key-'+key,kind:'press_key',key,label:'Press '+key});
      if(session.interactionCapabilities.includes('held-key'))for(const key of HOLD_KEYS)for(const durationMs of HOLD_DURATIONS)
        extras.push({id:'hold-'+key+'-'+durationMs,kind:'hold_key',key,durationMs,label:'Hold '+key+' for '+durationMs+' ms'});
    }
    const fixed=page.actions.filter(a=>a.kind==='wait'||a.kind==='scroll');
    const dom=page.actions.filter(a=>a.kind!=='wait'&&a.kind!=='scroll');
    const extraLimit=MAX_CANDIDATES-fixed.length;
    const selectedExtras=extras.slice(0,extraLimit);
    const selectedDom=dom.slice(0,MAX_CANDIDATES-fixed.length-selectedExtras.length);
    const omittedByCategory={dom:page.omitted_actions+dom.length-selectedDom.length,
      tabs:tabs.omitted??0,additionalActions:extras.length-selectedExtras.length};
    page.actions=[...selectedDom,...fixed,...selectedExtras];
    const observedBinding = browserBinding(options.host);
    const observation: Observation = { id: randomUUID(), page, targetId:session.targetId,
      capturedAt:new Date().toISOString(),
      ...(observedBinding ? {browserBinding:observedBinding,
        browserProfile:projectBrowserShape(page.actions, omittedByCategory.dom)} : {}) };
    let canvas:unknown;
    if(canvasOptions) {
      try {canvas=await session.canvas.observe(expr=>runtimeEvaluate(session.client,expr),page.document_key,session.targetId,canvasOptions);}
      catch{canvas={state:'unavailable',reason:'optional-canvas-readback-failed'};}
    }
    session.lastObservation = observation;
    session.observationCount += 1;
    return {
      sessionId, observationId: observation.id, url: page.url, title: page.title, text: page.text,
      actions: publicActions(page.actions),controlStates:projectControlStates(page.control_states,observation.id),
      tabs,history,...(canvasOptions?{canvas}:{}),
      omittedActions:omittedByCategory.dom+omittedByCategory.additionalActions,omittedByCategory,
      observationCount: session.observationCount, remainingObservations: this.maxObservations - session.observationCount,
    };
  }

  private async assertFresh(session: BrowserSession, observation: Observation, action: RawAction): Promise<void> {
    if(session.targetId!==observation.targetId)throw new Error('BROWSER_CONTROL_STALE_OBSERVATION');
    if(session.dialog)throw new Error('BROWSER_CONTROL_DIALOG_BLOCKED');
    if(action.kind==='press_key'||action.kind==='hold_key') {
      const focus=await runtimeEvaluate(session.client,'window.__agentCoreBrowser?.focusKey() ?? null');
      if(!focus||comparable(focus)!==comparable(observation.page.focus_key))throw new Error('BROWSER_CONTROL_STALE_FOCUS');
    }
    if (action.node !== undefined && ['click', 'select'].includes(action.kind)) {
      const current = await runtimeEvaluate(
        session.client,
        `(() => { const c=window.__agentCoreBrowser; return c ? [c.pageKey(),c.guard(c.nodes.get(${action.node}))] : null; })()`,
      );
      const expected = [observation.page.page_key, observation.page.guards[String(action.node)]];
      if (comparable(current) !== comparable(expected)) throw new Error('BROWSER_CONTROL_STALE_OBSERVATION');
      return;
    }
    const current = await runtimeEvaluate(session.client, SNAPSHOT_SCRIPT) as RawPage;
    if (comparable(current?.marker) !== comparable(observation.page.marker)) {
      throw new Error('BROWSER_CONTROL_STALE_OBSERVATION');
    }
  }

  private async settle(session: BrowserSession, action: RawAction): Promise<void> {
    if (action.kind === 'wait') return;
    const expression = `(action => new Promise(resolve => {
      const field=window.__agentCoreBrowser?.nodes.get(action.node);
      const autocomplete=action.kind==='fill' && field?.getAttribute('role')==='combobox';
      let frames=0, stopped=false;
      const finish=()=>{if(!stopped){stopped=true;resolve(true);}};
      setTimeout(finish,autocomplete ? 200 : 50);
      const ready=()=>{
        if(stopped)return;
        const ids=(field?.getAttribute('aria-controls')||field?.getAttribute('aria-owns')||'')
          .split(/\\s+/).filter(Boolean);
        const roots=ids.length ? ids.map(id=>document.getElementById(id)).filter(Boolean) : [document];
        const options=roots.flatMap(root=>[...root.querySelectorAll('[role="option"]')]);
        if(++frames>=2 && (!autocomplete || options.some(e=>{
          const r=e.getBoundingClientRect();
          return r.width && r.height && r.bottom>0 && r.top<innerHeight
            && (typeof e.checkVisibility!=='function' || e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
        }))) finish();
        else requestAnimationFrame(ready);
      };
      requestAnimationFrame(ready);
    }))(${JSON.stringify(action)})`;
    try { await runtimeEvaluate(session.client, expression, true); } catch { /* next observe owns freshness */ }
  }

  async act(
    sessionId: string,
    observationId: string,
    actionId: string,
    text?: string,
    host?: ExternalInvocationContext,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const session = this.session(sessionId);
    if (session.actionInFlight) throw new Error('BROWSER_CONTROL_ACTION_IN_FLIGHT');
    if (session.actionCount >= this.maxActions) throw new Error('BROWSER_CONTROL_ACTION_BUDGET_EXCEEDED');
    const observation = session.lastObservation;
    if (!observation || observation.id !== observationId) throw new Error('BROWSER_CONTROL_OBSERVATION_NOT_CURRENT');
    const action = observation.page.actions.find(value => value.id === actionId);
    if (!action) throw new Error('BROWSER_CONTROL_ACTION_NOT_OBSERVED');
    if (action.kind === 'fill' && (!text || text.length > MAX_TEXT_LENGTH)) {
      throw new Error('BROWSER_CONTROL_TEXT_REQUIRED_OR_TOO_LONG');
    }
    session.lastObservation = undefined;
    session.actionInFlight = true;
    try {
    await this.assertFresh(session, observation, action);
    if(action.kind==='switch_tab'){
      const target=await session.tabs.resolve(session.port,action.targetId!,action.targetUrl!);
      const next=await CdpClient.connect(target.webSocketDebuggerUrl);
      try {
        await next.send('Page.enable');await next.send('Runtime.enable');
        if(await runtimeEvaluate(next,'location.href')!==action.targetUrl)throw new Error('BROWSER_CONTROL_TAB_CHANGED');
        session.actionCount++;
        await next.send('Page.bringToFront');
      }catch(error){next.close();throw error;}
      session.client.close();session.client=next;session.targetId=target.id;session.canvas.clear();session.dialog=undefined;
      this.bindEvents(session,next);
    }else if(action.kind==='press_key'||action.kind==='hold_key'){
      session.actionCount++;
      await session.keyboard.execute(session.client,action.key!,action.kind==='hold_key'?action.durationMs!:0);
    }else if(action.kind==='back'){
      const h=await session.client.send('Page.getNavigationHistory'),current=h.entries?.[h.currentIndex],prior=h.entries?.[h.currentIndex-1];
      if(!action.history||current?.id!==action.history.currentId||prior?.id!==action.history.entryId||prior?.url!==action.history.url||!isPageUrl(prior.url))throw new Error('BROWSER_CONTROL_HISTORY_CHANGED');
      session.actionCount++;session.canvas.clear();
      try{await session.client.send('Page.navigateToHistoryEntry',{entryId:prior.id});}catch{throw new Error('BROWSER_CONTROL_MUTATION_UNCERTAIN');}
    }else if (action.kind === 'wait') {
      session.actionCount += 1;
      await sleep(100);
    } else if (action.kind === 'scroll') {
      session.actionCount += 1;
      await session.client.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x: 550, y: 650, deltaX: 0, deltaY: action.delta ?? 0,
      });
    } else if (action.kind === 'select') {
      if (typeof action.node !== 'number') throw new Error('BROWSER_CONTROL_ACTION_NODE_INVALID');
      session.actionCount += 1;
      const expression = `(action => {
        const e=window.__agentCoreBrowser?.nodes.get(action.node);
        if (!e?.isConnected || e.tagName!=='SELECT' || e.matches(':disabled')
          || e.closest('[aria-disabled="true"],[inert]')) return null;
        if (![...e.options].some(o=>o.value===action.value && !o.disabled && !o.closest('optgroup[disabled]'))) return null;
        e.value=action.value;
        e.dispatchEvent(new Event('input',{bubbles:true}));
        e.dispatchEvent(new Event('change',{bubbles:true}));
        return true;
      })(${JSON.stringify(action)})`;
      try {
        const result = await runtimeEvaluate(session.client, expression);
        if (result !== true) throw new Error('BROWSER_CONTROL_STALE_OBSERVATION');
      } catch (error) {
        if (error instanceof Error && error.message === 'BROWSER_CONTROL_STALE_OBSERVATION') throw error;
        throw new Error('BROWSER_CONTROL_MUTATION_UNCERTAIN');
      }
    } else {
      if (typeof action.node !== 'number') throw new Error('BROWSER_CONTROL_ACTION_NODE_INVALID');
      const target = await runtimeEvaluate(session.client, `(action => {
        const e=window.__agentCoreBrowser?.nodes.get(action.node);
        if (!e?.isConnected || e.matches(':disabled') || e.closest('[aria-disabled="true"],[inert]')
          || (typeof e.checkVisibility==='function' && !e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))) return null;
        if (action.kind==='fill' && (e.readOnly || e.getAttribute('aria-readonly')==='true')) return null;
        const r=e.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
        if(!r.width||!r.height||x<0||y<0||x>=innerWidth||y>=innerHeight) return null;
        if(!e.contains(document.elementFromPoint(x,y))) return null;
        return {x,y};
      })(${JSON.stringify(action)})`);
      if (!target) throw new Error('BROWSER_CONTROL_TARGET_CHANGED_OR_COVERED');
      session.actionCount += 1;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await session.client.send('Input.dispatchMouseEvent', {
          type, x: target.x, y: target.y, button: 'left', clickCount: 1,
        });
      }      if (action.kind === 'fill') {
        const modifiers = process.platform === 'darwin' ? 4 : 2;
        await session.client.send('Input.dispatchKeyEvent', {
          type: 'keyDown', key: 'a', code: 'KeyA', modifiers, commands: ['selectAll'],
        });
        await session.client.send('Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'a', code: 'KeyA', modifiers,
        });
        await session.client.send('Input.insertText', { text });
      }
    }
    await this.settle(session, action);
    // Only a host-bound, same-task successful DOM action can stage metadata.
    // Observation alone, unbound/native, dialog, failure or caller abort are not use.
    const actScope = browserBinding(host);
    if (!session.dialog && !signal?.aborted
      && ['click','fill','select'].includes(action.kind)
      && sameBrowserBinding(observation.browserBinding, actScope)
      && observation.browserProfile) {
      stageBrowserObservationUse({ version:1, observationUsed:true,
        actionKind: ({click:'C',fill:'F',select:'S'} as Record<string,BrowserShapeKind>)[action.kind]!,
        profile:observation.browserProfile });
    }
    return {
      sessionId,
      executed: action.id,
      operation: action.kind,
      label: action.label,
      actionCount: session.actionCount,
      remainingActions: this.maxActions - session.actionCount,
      status: session.dialog ? 'blocked-dialog' : 'ready-for-observe',
      ...(session.dialog ? {dialog:session.dialog} : {}),
    };
    } finally { session.actionInFlight=false; }
  }

  /** Advisory read of the explicitly chosen LAST observation; no CDP/network calls. */
  selectProcedureObservation(selector:{sessionId:string;observationId:string},
    host?:ExternalInvocationContext):
    {status:'available';profile:BrowserShapeProfile;capturedAt:string;freshness:'last-observed-not-revalidated'}
    | {status:'unknown';reason:string} {
    const bound = browserBinding(host);
    if (!bound) return {status:'unknown',reason:'host-task-unbound'};
    const session = this.sessions.get(selector.sessionId);
    if (!session || session.extension?.expired() || (session.process && session.process.exitCode !== null))
      return {status:'unknown',reason:'session-unavailable'};
    if (session.actionInFlight || session.dialog)
      return {status:'unknown',reason:'observation-in-flight-or-dialog'};
    const item = session.lastObservation;
    if (!item || item.id !== selector.observationId || item.targetId !== session.targetId)
      return {status:'unknown',reason:'observation-not-current'};
    if (!sameBrowserBinding(item.browserBinding,bound) || !item.browserProfile)
      return {status:'unknown',reason:'observation-task-or-principal-mismatch'};
    return {status:'available',profile:item.browserProfile,capturedAt:item.capturedAt,
      freshness:'last-observed-not-revalidated'};
  }

  async close(sessionId: string): Promise<Record<string, unknown>> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('BROWSER_CONTROL_SESSION_NOT_FOUND');
    this.sessions.delete(sessionId);
    session.lastObservation = undefined;
    session.canvas.clear();
    let inputRelease: string = 'confirmed';
    await session.keyboard.close().catch(()=>{inputRelease='uncertain';});
    if (session.extension) {
      const detached = await session.extension.detach();
      return { sessionId, closed: true, inputRelease, detach: detached, tabRetained: true, browserRetained: true };
    }
    session.client.close();

    const child = session.process!;
    const pid = child.pid;
    if (pid && Number.isSafeInteger(pid) && pid > 0) {
      const descendants = await snapshotDescendantPids(pid).catch(() => []);
      await terminateOwnedProcessTree(pid, descendants, true).catch(() => {
        try { child.kill(); } catch { /* best effort fallback */ }
      });
    } else {
      try { child.kill(); } catch { /* best effort */ }
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await rm(session.runtimeDir, { recursive: true, force: true });
        break;
      } catch {
        await sleep(50);
      }
    }
    return { sessionId, closed: true, inputRelease };
  }

  async closeAll(): Promise<{ requested: number; closed: number; remaining: number }> {
    const ids = [...this.sessions.keys()];
    let closed = 0;
    for (const id of ids) {
      try {
        await this.close(id);
        closed += 1;
      } catch {
        const session = this.sessions.get(id);
        this.sessions.delete(id);
        if (session?.process?.pid) {
          const descendants = await snapshotDescendantPids(session.process.pid).catch(() => []);
          await terminateOwnedProcessTree(session.process.pid, descendants, true).catch(() => undefined);
        }
      }
    }
    return { requested: ids.length, closed, remaining: this.sessions.size };
  }

  status(): Record<string, unknown> {
    return {
      sessions: [...this.sessions.values()].map(session => ({
        sessionId: session.id,
        pid: session.process?.pid ?? null,
        transport: session.extension ? 'extension' : 'isolated',
        ...(session.extension ? { state: session.extension.state } : {}),
        headless: session.headless,
        browser: path.basename(session.executable),
        actionCount: session.actionCount,
        observationCount: session.observationCount,
        openedAt: session.openedAt,
      })),
      maxActions: this.maxActions,
      maxObservations: this.maxObservations,
    };
  }
}

export const browserControlService = new BrowserControlService();
