import { randomUUID } from 'node:crypto';
import { projectBrowserShape, type BrowserShapeProfile, type BrowserShapeKind } from './procedure-context.js';
import { stageBrowserObservationUse } from '../../tracker/tool-invocation.js';
import type { ExternalInvocationContext } from '../../learning/external-controller.js';
import { projectControlStates } from './control-state.js';
import { CanvasObserver, canvasOptionsSchema, type CanvasOptions } from './canvas-observation.js';
import { isPageUrl } from './owned-tabs.js';
import { KeyboardActions, PRESS_KEYS, HOLD_KEYS, HOLD_DURATIONS, validateCapabilities, type InteractionCapability } from './keyboard-actions.js';
import { redactSensitiveString } from '../../security/redaction.js';
import { OpenBrowserUseTransport, type BrowserTransport } from './open-browser-use.js';
import { OwnedConversationReader, type OwnedConversationRead } from './owned-conversation-reader.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProjectRoot } from '../../portability/paths.js';

const MAX_ACTIONS = 60;
const MAX_OBSERVATIONS = 120;
const MAX_CANDIDATES = 250;
const MAX_TEXT_LENGTH = 2000;
const MODULE_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PROJECT_ROOT = resolveProjectRoot(process.env, MODULE_PROJECT_ROOT);

type ActionKind = 'click' | 'fill' | 'select' | 'scroll' | 'wait' | 'press_key' | 'hold_key' | 'back';
export interface BrowserOpenOptions { interactionCapabilities?: InteractionCapability[]; transport?: 'open-browser-use'; owner?: string }
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
  scrollKey?: unknown;
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
  owner?: string;
  client: BrowserTransport;
  openBrowserUse?: OpenBrowserUseTransport;
  conversationReader?: OwnedConversationReader;
  initialized?: boolean;
  headless: boolean;
  executable: string;
  lastObservation?: Observation;
  actionCount: number;
  observationCount: number;
  openedAt: string;
  targetId: string;
  canvas: CanvasObserver;
  keyboard: KeyboardActions;
  interactionCapabilities: InteractionCapability[];
  actionInFlight: boolean;
  dialog?: {type:string;message:string};
}

interface BrowserControlLimits {
  maxActions?: number;
  maxObservations?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

const SNAPSHOT_EXPRESSION = String.raw`(panelScrolling => {
  const cache = window.__agentCoreBrowser || (window.__agentCoreBrowser = {
    next: 1, ids: new WeakMap(), nodes: new Map()
  });
  // Compare exact state in the renderer; large values and guards must not cross the capped wire.
  cache.keys ||= new Map();
  cache.epoch ||= [...crypto.getRandomValues(new Uint32Array(4))].join('-');
  cache.revision ||= 0;
  cache.key = (name, value) => {
    const text = JSON.stringify(value), prior = cache.keys.get(name);
    if (prior?.text === text) return [cache.epoch, prior.revision];
    const revision = ++cache.revision;
    cache.keys.set(name, {text, revision});
    return [cache.epoch, revision];
  };
  const identity = e => {
    let id = cache.ids.get(e);
    if (!id) { id = cache.next++; cache.ids.set(e, id); cache.nodes.set(id, e); }
    return id;
  };
  for (const [id, e] of cache.nodes) if (!e.isConnected) {
    cache.nodes.delete(id); cache.keys.delete('guard:'+id);
  }
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
  };
  const panels = [];
  const rootScroller = document.scrollingElement;
  const hit = (e, r) => {
    const x=(Math.max(0,r.left)+Math.min(innerWidth,r.right))/2;
    const y=(Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2;
    if(r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)return false;
    const top=document.elementFromPoint(x,y);
    return Boolean(top && (top===e || e.contains(top)));
  };
  if(panelScrolling) {
    // Fixed sampling and bounded ancestor walks avoid scanning every page element.
    const seen=new Set();
    const visit=start=>{
      for(let e=start,depth=0;e&&depth<12&&seen.size<256;e=e.parentElement,depth++) {
        if(seen.has(e))continue;seen.add(e);
        if(panels.length>=8||e===rootScroller||e===document.body||!visible(e))continue;
        if(e.clientHeight<24||e.scrollHeight<=e.clientHeight+2)continue;
        if(!['auto','scroll','overlay'].includes(getComputedStyle(e).overflowY))continue;
        if(hit(e,e.getBoundingClientRect()))panels.push(e);
      }
    };
    for(const [x,y] of [[.5,.5],[.75,.5],[.25,.5],[.5,.25],[.5,.75],[.25,.25],[.75,.25],[.25,.75],[.75,.75]])
      visit(document.elementFromPoint(innerWidth*x,innerHeight*y));
    let count=0;for(const e of document.querySelectorAll(selector)) {if(count++>=64)break;visit(e);}
    cache.scrollGuard=e=>{
      if(!e?.isConnected || (e!==rootScroller&&!visible(e)))return null;
      const r=e.getBoundingClientRect();
      return [identity(e),e.scrollTop,e.scrollLeft,e.scrollHeight,e.clientHeight,e.scrollWidth,e.clientWidth,
        r.x,r.y,r.width,r.height,getComputedStyle(e).overflowY,
        e===rootScroller&&document.body?getComputedStyle(document.body).overflowY:null];
    };
  }
  cache.pageKey = () => {
    const key=[performance.timeOrigin, location.href, scrollX, scrollY, innerWidth, innerHeight,
    [...document.querySelectorAll('input,textarea,select')].filter(safe)
      .map(e => [identity(e), e.value, e.checked, e.selectedIndex, e.disabled, e.readOnly])];
    if(panelScrolling)key.push(panels.map(e=>cache.scrollGuard(e)));
    return cache.key('page', key);
  };
  cache.guard = e => {
    if (!e?.isConnected || !visible(e)) return null;
    const scope = e.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]') || e.parentElement;
    return cache.key('guard:'+identity(e), [identity(e), role(e), name(e), e.value ?? null, e.checked ?? null, e.selectedIndex ?? null,
      e.readOnly ?? null, e.matches(':disabled'), e.getAttribute('aria-disabled'),
      e.getAttribute('aria-expanded'), e.getAttribute('aria-checked'), e.getAttribute('aria-selected'),
      e.getAttribute('href'), scope?.innerText?.slice(0, 6000) || '']);
  };
  cache.focusKey = () => {
    const e=document.activeElement;
    if(!e || e.tagName==='IFRAME' || !safe(e) || !visible(e)) return null;
    return [performance.timeOrigin,location.href,identity(e),role(e),e.getAttribute('type'),
      e.readOnly===true,e.matches(':disabled'),e.getAttribute('aria-disabled'),
      cache.key('focus-value', e.value ?? (e.isContentEditable ? e.innerText.slice(0,2000) : null))];
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
    if (panelScrolling && !hit(e,r)) continue;
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
    if(panelScrolling && !hit(parent,r))continue;
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
      words.push(value); length += value.length;
    }
  }  const text = words.join('\n').slice(0, 6000), height = document.documentElement.scrollHeight;
  const scrollActions=[];
  if(panelScrolling)for(const e of [...panels,...(rootScroller?[rootScroller]:[])]) {
    if(e===rootScroller && [getComputedStyle(e).overflowY,document.body?getComputedStyle(document.body).overflowY:''].some(v=>['hidden','clip'].includes(v)))continue;
    const node=identity(e),scrollKey=cache.scrollGuard(e);
    const label=e===rootScroller?'page':(e.getAttribute('aria-label')||e.getAttribute('role')||'panel '+(panels.indexOf(e)+1)).slice(0,80);
    if(e.scrollTop+e.clientHeight<e.scrollHeight-2)scrollActions.push({id:'scroll-'+node+'-down',kind:'scroll',label:'Scroll down in '+label,node,delta:560,scrollKey});
    if(e.scrollTop>0)scrollActions.push({id:'scroll-'+node+'-up',kind:'scroll',label:'Scroll up in '+label,node,delta:-560,scrollKey});
  }
  const page_key = cache.pageKey(), guards = {};
  const marker = cache.key('marker', [performance.timeOrigin, location.href, scrollX, scrollY, innerWidth, innerHeight,
    document.title, text, actions, page_key, scrollActions]);
  const domLimit=panelScrolling?Math.min(247,249-scrollActions.length):247;
  const encoder = new TextEncoder();
  let actionBytes=0, omitted_actions=0;
  const admitted=actions.filter(a => {
    const bytes=encoder.encode(JSON.stringify(a)).length;
    if (actionBytes+bytes>256*1024) { omitted_actions++; return false; }
    actionBytes+=bytes;
    return true;
  });
  omitted_actions+=Math.max(0,admitted.length-domLimit);
  actions.splice(0,actions.length,...admitted.slice(0,domLimit));
  for (const a of actions) if (!(a.node in guards)) guards[a.node] = cache.guard(cache.nodes.get(a.node));
  actions.forEach((a, i) => a.id = 'e' + (i + 1));
  if(panelScrolling)actions.push(...scrollActions);
  else {
    if (scrollY + innerHeight < height - 2) actions.push({ id: 'scroll_down', kind: 'scroll', label: 'Scroll down', delta: 560 });
    if (scrollY > 0) actions.push({ id: 'scroll_up', kind: 'scroll', label: 'Scroll up', delta: -560 });
  }
  actions.push({ id: 'wait', kind: 'wait', label: 'Wait briefly for the page to update' });
  const result={ url: location.href, title: document.title, text, actions, marker, page_key, guards, omitted_actions, control_states, document_key:[performance.timeOrigin,location.href], focus_key, keyboard_safe };
  return encoder.encode(JSON.stringify(result)).length<=512*1024 ? result : {error:'BROWSER_CONTROL_SNAPSHOT_TOO_LARGE'};
})`;
const SNAPSHOT_SCRIPT = SNAPSHOT_EXPRESSION + '(false)';
const PANEL_SNAPSHOT_SCRIPT = SNAPSHOT_EXPRESSION + '(true)';

async function runtimeEvaluate(client: BrowserTransport, expression: string, awaitPromise = false): Promise<any> {
  const response = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (response.exceptionDetails) throw new Error('BROWSER_CONTROL_DOCUMENT_CHANGED');
  return response.result?.value;
}

function publicActions(actions: RawAction[]): Array<Record<string, unknown>> {
  return actions.map(action => ({
    id: action.id,
    operation: action.kind === 'fill' ? 'TYPE_TEXT'
      : action.kind === 'select' ? 'SELECT'
      : action.kind === 'scroll' ? 'SCROLL'
      : action.kind === 'wait' ? 'WAIT'
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
  private openBrowserUseOpening = 0;
  private openQueue: Promise<unknown> = Promise.resolve();
  private readonly maxActions: number;
  private readonly maxObservations: number;

  constructor(limits: BrowserControlLimits = {}) {
    this.maxActions = limits.maxActions ?? MAX_ACTIONS;
    this.maxObservations = limits.maxObservations ?? MAX_OBSERVATIONS;
  }

  open(urlValue: string, headless = true, options: BrowserOpenOptions = {}): Promise<Record<string, unknown>> {
    // Serialized so two concurrent opens for one owner cannot each create a tab.
    return this.serializeOpen(() => this.openOwnedTab(urlValue, headless, options));
  }

  private serializeOpen<T>(task: () => Promise<T>): Promise<T> {
    const run = this.openQueue.then(task);
    this.openQueue = run.catch(() => undefined);
    return run;
  }

  private async openOwnedTab(urlValue: string, headless: boolean, options: BrowserOpenOptions): Promise<Record<string, unknown>> {
    const interactionCapabilities=validateCapabilities(options.interactionCapabilities);
    const url = assertOpenUrl(urlValue);
    const transport = options.transport ?? 'open-browser-use';
    if (transport === 'open-browser-use') {
      // One owned tab per owner: reuse it, navigating only when the URL differs.
      const owned = [...this.sessions.values()].find(s => s.openBrowserUse?.usable && s.owner === options.owner);
      if (owned?.openBrowserUse) {
        if (owned.actionInFlight) throw new Error('BROWSER_CONTROL_ACTION_IN_FLIGHT');
        const client = owned.openBrowserUse;
        if (client.url !== url.toString()) {
          await client.navigate(url.toString());
          owned.lastObservation = undefined;
        }
        return { sessionId: owned.id, transport: 'open-browser-use', status: 'attached', url: url.toString(),
          tabId: client.tabId, extensionVersion: client.info.version, headless: false, background: client.background, pid: null,
          scope: 'task-created-tab', reused: true, maxActions: this.maxActions, maxObservations: this.maxObservations };
      }
      if (this.openBrowserUseOpening + [...this.sessions.values()].filter(s => s.openBrowserUse).length >= 4) throw new Error('BROWSER_OBU_SESSION_LIMIT');
      this.openBrowserUseOpening++;
      try {
      const id = randomUUID();
      // Installed browsers stay physically headed. headless=true requests a background task
      // in an already connected extension, without foreground activation or fallback launch.
      const client = await OpenBrowserUseTransport.connect(PROJECT_ROOT, id, undefined, headless);
      const session: BrowserSession = {
        id, owner: options.owner, client, openBrowserUse: client,
        headless: false, executable: 'open-browser-use', initialized: true,
        actionCount: 0, observationCount: 0, openedAt: new Date().toISOString(),
        targetId: '', canvas: new CanvasObserver(), keyboard: new KeyboardActions(),
        interactionCapabilities, actionInFlight: false,
      };
      this.bindEvents(session, client);
      try {
        await client.open(url.toString(), headless);
        session.targetId = 'obu:' + client.tabId;
        this.sessions.set(id, session);
        return { sessionId: id, transport: 'open-browser-use', status: 'attached', url: url.toString(),
          tabId: client.tabId, extensionVersion: client.info.version, headless: false, background: client.background, pid: null,
          scope: 'task-created-tab', maxActions: this.maxActions, maxObservations: this.maxObservations };
      } catch (error) {
        const cleanup = await client.dispose();
        if (cleanup.manualInspectionRequired) throw new Error(
          `BROWSER_OBU_OPEN_OUTCOME_UNCERTAIN: sessionId=${id}; ownedTabId=${client.tabId ?? 'unknown'}; inspect the task tab before retrying`);
        throw error;
      }
      } finally { this.openBrowserUseOpening--; }
    }
    throw new Error('BROWSER_CONTROL_TRANSPORT_UNSUPPORTED');
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
    if (session.openBrowserUse?.closed) { session.openBrowserUse.close(); throw new Error('BROWSER_CONTROL_SESSION_CLOSED'); }
    return session;
  }

  async observe(sessionId: string, options: BrowserObserveOptions = {}): Promise<Record<string, unknown>> {
    const session = this.session(sessionId);
    const canvasOptions=options.canvas===undefined?undefined:canvasOptionsSchema.parse(options.canvas);
    if (session.observationCount >= this.maxObservations) throw new Error('BROWSER_CONTROL_OBSERVATION_BUDGET_EXCEEDED');
    if (session.actionInFlight) throw new Error('BROWSER_CONTROL_ACTION_IN_FLIGHT');
    if (session.dialog) {
      session.lastObservation=undefined;session.observationCount++;
      return {sessionId,status:'blocked-dialog',dialog:session.dialog,actions:[],observationCount:session.observationCount,
        remainingObservations:this.maxObservations-session.observationCount};
    }
    const page = await runtimeEvaluate(session.client, session.openBrowserUse ? PANEL_SNAPSHOT_SCRIPT : SNAPSHOT_SCRIPT) as RawPage;
    if ((page as any)?.error === 'BROWSER_CONTROL_SNAPSHOT_TOO_LARGE') throw new Error('BROWSER_CONTROL_SNAPSHOT_TOO_LARGE');
    if (!page || !Array.isArray(page.actions)) throw new Error('BROWSER_CONTROL_OBSERVATION_INVALID');
    if (!isPageUrl(page.url)) throw new Error('BROWSER_CONTROL_URL_SCHEME_REFUSED');
    if (page.actions.length > MAX_CANDIDATES) throw new Error('BROWSER_CONTROL_CANDIDATE_BUDGET_EXCEEDED');
    const extras:RawAction[]=[];
    const tabs = { state: 'available', scope: session.openBrowserUse ? 'task-created-tab' : 'user-connected-tab', items: [{ id: session.targetId, active: true,
      title: redactSensitiveString(page.title).slice(0,200), url: redactSensitiveString(page.url).slice(0,4000) }] };
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
      tabs:0,additionalActions:extras.length-selectedExtras.length};
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
    if(action.kind==='scroll' && action.node!==undefined && session.openBrowserUse) {
      const current=await runtimeEvaluate(session.client,`(() => {const c=window.__agentCoreBrowser;return c?.scrollGuard ? [c.pageKey(),c.scrollGuard(c.nodes.get(${action.node}))] : null;})()`);
      if(comparable(current)!==comparable([observation.page.page_key,action.scrollKey]))throw new Error('BROWSER_CONTROL_STALE_OBSERVATION');
      return;
    }
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
    const current = await runtimeEvaluate(session.client, session.openBrowserUse ? PANEL_SNAPSHOT_SCRIPT : SNAPSHOT_SCRIPT) as RawPage;
    if (comparable(current?.marker) !== comparable(observation.page.marker)) {
      throw new Error('BROWSER_CONTROL_STALE_OBSERVATION');
    }
  }

  private async settle(session: BrowserSession, action: RawAction): Promise<void> {
    if (action.kind === 'wait' || (session.openBrowserUse && session.dialog)) return;
    // Installed-browser tabs can remain backgrounded: renderer timers/animation frames may pause.
    // A bounded host delay does not assert page readiness; the next observation owns that evidence.
    if (session.openBrowserUse) { await sleep(action.kind === 'fill' ? 200 : 50); return; }
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
    if (session.openBrowserUse && action.kind !== 'wait') {
      await session.openBrowserUse.assertForeground();
      // Focus handlers may mutate the document while the owned target is activated.
      await this.assertFresh(session, observation, action);
    }
    if(action.kind==='press_key'||action.kind==='hold_key'){
      session.actionCount++;
      const background = session.openBrowserUse?.background;
      if (background) {
        // CDP focus emulation delivers keys to the owned hidden tab without OS activation.
        await session.client.send('Emulation.setFocusEmulationEnabled', {enabled:true});
      }
      try {
        if (background) await this.assertFresh(session, observation, action);
        await session.keyboard.execute(session.client,action.key!,action.kind==='hold_key'?action.durationMs!:0);
      } finally {
        if (background && !session.openBrowserUse?.closed)
          await session.client.send('Emulation.setFocusEmulationEnabled', {enabled:false});
      }
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
      if(session.openBrowserUse && action.node!==undefined) {
        const result=await runtimeEvaluate(session.client,`(expected => {
          const c=window.__agentCoreBrowser,e=c?.nodes.get(expected.node);
          if(!c?.scrollGuard||!e||JSON.stringify([c.pageKey(),c.scrollGuard(e)])!==JSON.stringify(expected.key))return 'stale';
          const root=e===document.scrollingElement;
          if(!root) {
            const r=e.getBoundingClientRect(),x=(Math.max(0,r.left)+Math.min(innerWidth,r.right))/2,y=(Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2;
            const top=document.elementFromPoint(x,y);
            if(!top||!(top===e||e.contains(top)))return 'covered';
          }
          const before=e.scrollTop,max=e.scrollHeight-e.clientHeight;
          const distance=Math.sign(expected.delta)*Math.min(560,Math.max(1,e.clientHeight*.8));
          const next=Math.max(0,Math.min(max,before+distance));
          if(root)window.scrollTo({left:e.scrollLeft,top:next,behavior:'instant'});
          else Element.prototype.scrollTo.call(e,{left:e.scrollLeft,top:next,behavior:'instant'});
          return Math.sign(e.scrollTop-before)===Math.sign(expected.delta)?'moved':'no-effect';
        })(${JSON.stringify({node:action.node,delta:action.delta,key:[observation.page.page_key,action.scrollKey]})})`);
        if(result==='stale')throw new Error('BROWSER_CONTROL_STALE_OBSERVATION');
        if(result==='covered')throw new Error('BROWSER_CONTROL_TARGET_CHANGED_OR_COVERED');
        if(result!=='moved')throw new Error('BROWSER_CONTROL_SCROLL_NO_EFFECT');
      } else await session.client.send('Input.dispatchMouseEvent', {
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
      if (session.openBrowserUse?.background && action.kind === 'click') {
        const clicked = await runtimeEvaluate(session.client, `(() => { const e=window.__agentCoreBrowser?.nodes.get(${action.node});
          if (!(e instanceof HTMLElement) || !e.isConnected || e.matches(':disabled')
            || e.closest('[aria-disabled="true"],[inert]')
            || (typeof e.checkVisibility==='function' && !e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))) return false;
          const r=e.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
          if (!r.width || !r.height || x<0 || y<0 || x>=innerWidth || y>=innerHeight
            || !e.contains(document.elementFromPoint(x,y))) return false;
          HTMLElement.prototype.click.call(e); return true; })()`);
        if (clicked !== true) throw new Error('BROWSER_CONTROL_BACKGROUND_CLICK_UNAVAILABLE');
      } else if (!session.openBrowserUse?.background) for (const type of ['mousePressed', 'mouseReleased']) {
        await session.client.send('Input.dispatchMouseEvent', {
          type, x: target.x, y: target.y, button: 'left', clickCount: 1,
        });
      }      if (action.kind === 'fill') {
        if (session.openBrowserUse?.background) {
          const focused = await runtimeEvaluate(session.client, `(() => { const e=window.__agentCoreBrowser?.nodes.get(${action.node});
            if (!e?.isConnected || e.readOnly || e.matches(':disabled') || e.closest('[aria-disabled="true"],[inert]')) return false;
            e.focus({preventScroll:true});
            return Boolean(e?.isConnected && (e===document.activeElement || e.contains(document.activeElement))); })()`);
          if (focused !== true) throw new Error('BROWSER_CONTROL_BACKGROUND_FIELD_NOT_FOCUSED');
          if (session.dialog) throw new Error('BROWSER_CONTROL_DIALOG_BLOCKED');
          await this.assertFresh(session, observation, action);
        }
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
    if (session.openBrowserUse?.closed) throw new Error('BROWSER_CONTROL_MUTATION_UNCERTAIN');
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
    if (!session || session.openBrowserUse?.closed)
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

  async conversation(sessionId: string, params: { read?: OwnedConversationRead } = {}): Promise<Record<string, unknown>> {
    const session = this.sessions.get(sessionId);
    if(!session)throw new Error('BROWSER_CONTROL_SESSION_NOT_FOUND');
    if(!session.openBrowserUse) throw new Error('BROWSER_CONTROL_TRANSPORT_UNSUPPORTED');
    this.session(sessionId);
    if(session.actionInFlight)throw new Error('BROWSER_CONTROL_ACTION_IN_FLIGHT');
    if(session.dialog)throw new Error('BROWSER_CONTROL_DIALOG_BLOCKED');
    if(session.observationCount>=this.maxObservations)throw new Error('BROWSER_CONTROL_OBSERVATION_BUDGET_EXCEEDED');
    session.actionInFlight=true;
    session.observationCount++;
    try {
      session.conversationReader??=new OwnedConversationReader((expression,awaitPromise)=>runtimeEvaluate(session.client,expression,awaitPromise));
      const value=await session.conversationReader.read(params.read);
      return {sessionId,transport:'open-browser-use',background:session.openBrowserUse.background,...value,
        observationCount:session.observationCount,remainingObservations:this.maxObservations-session.observationCount};
    }finally{session.actionInFlight=false;}
  }

  async close(sessionId: string): Promise<Record<string, unknown>> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('BROWSER_CONTROL_SESSION_NOT_FOUND');
    this.sessions.delete(sessionId);
    session.lastObservation = undefined;
    session.canvas.clear();
    let inputRelease: string = 'confirmed';
    await session.keyboard.close().catch(()=>{inputRelease='uncertain';});
    if (session.openBrowserUse) return { sessionId, closed: true, inputRelease, ...(await session.openBrowserUse.dispose()) };
    session.client.close();

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
        this.sessions.delete(id);
      }
    }
    return { requested: ids.length, closed, remaining: this.sessions.size };
  }

  assertOwner(sessionId: string, owner?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.owner !== owner) throw new Error('BROWSER_CONTROL_SESSION_NOT_FOUND');
  }

  status(owner?: string): Record<string, unknown> {
    return {
      sessions: [...this.sessions.values()].filter(session => owner === undefined || session.owner === owner).map(session => ({
        sessionId: session.id,
        pid: null,
        transport: 'open-browser-use',
        ...(session.openBrowserUse ? { state: session.openBrowserUse.closed ? 'closed' : 'attached',
          tabId: session.openBrowserUse.tabId, extensionVersion: session.openBrowserUse.info.version,
          background: session.openBrowserUse.background } : {}),
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
