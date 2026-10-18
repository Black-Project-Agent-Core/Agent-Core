import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { redactSensitiveString } from '../../security/redaction.js';
import {
  CONVERSATION_METHODS, conversationUrl, conversationDraftParams, conversationReadParams,
  conversationEmptyParams, conversationReadResult, conversationStatusResult, conversationDraftResult,
  type BrowserBridgeMode, type ConversationAction, type ConversationRead, type ConversationStatus,
} from './conversation-contract.js';

export interface BrowserTransport {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  close(): void;
  onEvent?: (method: string, params: any) => void;
}

const METHODS = new Set([
  'Page.enable', 'Runtime.enable', 'Runtime.evaluate', 'Page.getNavigationHistory',
  'Page.navigateToHistoryEntry', 'Input.dispatchMouseEvent', 'Input.dispatchKeyEvent',
  'Input.insertText', 'AgentCore.detach', ...Object.values(CONVERSATION_METHODS),
]);
const EVENTS = new Set(['Page.javascriptDialogOpening', 'Page.javascriptDialogClosed']);
export const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
type Command = { id: number; method: string; params: Record<string, unknown> };
type Reply = { id: number; result?: unknown; error?: string };
type Pending = { command: Command; delivered: boolean; resolve: (value: any) => void;
  reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** In-memory, single-tab grant. No browser process, profile or credential ownership. */
export class ExtensionBrowserClient implements BrowserTransport {
  readonly id = randomUUID();
  readonly code = randomBytes(16).toString('hex');
  readonly openedAt: number;
  state: 'pending' | 'paired' | 'attached' | 'closed' = 'pending';
  onEvent?: (method: string, params: any) => void;
  private origin = '';
  private token = '';
  private tabId?: number;
  private lastSeen: number;
  private nextId = 1;
  private readonly commands = new Map<number, Pending>();
  private wake?: () => void;
  private polling = false;
  private paired = false;
  private detached = false;
  private boundUrl = '';
  private conversationInFlight = false;
  private cursor = 0;
  private lastRead?: ConversationRead;
  private lastStatus?: ConversationStatus;
  private currentWindow: Map<string, ConversationRead['messages'][number]> | undefined = new Map();
  private lastReceipt: ConversationStatus['receipt'] = null;
  private lastDraft?: { id: string; url: string; revision: number; state: string };
  private draftCommand?: { id?: number; state: 'review' | 'failed' | 'unknown' | 'not-delivered'; error?: string };
  modeConfirmed = false;

  constructor(readonly expectedUrl: string, private readonly commandTimeoutMs = 10_000,
    private readonly now: () => number = Date.now, readonly mode: BrowserBridgeMode = 'browser') {
    if (mode === 'conversation') conversationUrl(expectedUrl);
    this.openedAt = this.now();
    this.lastSeen = this.openedAt;
  }

  expired(): boolean {
    const elapsed = this.now() - this.openedAt;
    return elapsed > 30 * 60_000 || (this.state === 'pending' && elapsed > 5 * 60_000)
      || (this.state !== 'pending' && this.now() - this.lastSeen > 60_000);
  }

  pair(code: string, origin: string, tabId: number, url: string): string {
    if (this.state !== 'pending' || this.expired() || !equal(this.code, code))
      throw new Error('BROWSER_BRIDGE_PAIR_REFUSED');
    if (!EXTENSION_ORIGIN.test(origin) || !Number.isSafeInteger(tabId) || tabId < 0)
      throw new Error('BROWSER_BRIDGE_PAIR_REFUSED');
    const target = new URL(url), expected = new URL(this.expectedUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.origin !== expected.origin)
      throw new Error('BROWSER_BRIDGE_TAB_ORIGIN_MISMATCH');
    if (this.mode === 'conversation' && conversationUrl(url) !== conversationUrl(this.expectedUrl))
      throw new Error('BROWSER_BRIDGE_CONVERSATION_URL_MISMATCH');
    this.boundUrl = this.mode === 'conversation' ? conversationUrl(url) : target.toString();
    this.origin = origin;
    this.tabId = tabId;
    this.token = randomBytes(32).toString('hex');
    this.state = 'paired';
    this.paired = true;
    this.lastSeen = this.now();
    return this.token;
  }

  pairedTo(origin: string, tabId: number): boolean {
    return this.state !== 'closed' && this.paired && this.origin === origin && this.tabId === tabId;
  }

  authorize(origin: string, token: string): void {
    if (this.expired()) this.close();
    if (this.state === 'pending' || this.state === 'closed' || origin !== this.origin
      || !equal(this.token, token)) throw new Error('BROWSER_BRIDGE_GRANT_REFUSED');
    this.lastSeen = this.now();
  }

  async poll(origin: string, token: string, replies: Reply[] = [],
    events: { method: string; params?: unknown }[] = [], signal?: AbortSignal,
    waitMs = 25_000): Promise<Record<string, unknown>> {
    this.authorize(origin, token);
    if (this.polling) throw new Error('BROWSER_BRIDGE_POLL_IN_FLIGHT');
    if (!Array.isArray(replies) || replies.length > 16 || !Array.isArray(events) || events.length > 16)
      throw new Error('BROWSER_BRIDGE_INVALID_REPLY');
    const ids = new Set<number>();
    for (const reply of replies) {
      if (!reply || !Number.isSafeInteger(reply.id) || ids.has(reply.id)
        || !this.commands.get(reply.id)?.delivered
        || Object.keys(reply).some(key => !['id', 'result', 'error'].includes(key))
        || Object.hasOwn(reply, 'result') === Object.hasOwn(reply, 'error')
        || (Object.hasOwn(reply, 'error') && (typeof reply.error !== 'string' || !reply.error || reply.error.length > 500)))
        throw new Error('BROWSER_BRIDGE_INVALID_REPLY');
      ids.add(reply.id);
    }
    for (const reply of replies) {
      const pending = this.commands.get(reply.id)!;
      this.commands.delete(reply.id);
      clearTimeout(pending.timer);
      if (reply.error) pending.reject(new Error('BROWSER_BRIDGE_CDP_ERROR: ' + redactSensitiveString(String(reply.error)).slice(0,500)));
      else pending.resolve(reply.result ?? {});
    }
    for (const event of events) if (EVENTS.has(event?.method)) this.onEvent?.(event.method, event.params ?? {});
    if (this.state === 'paired') this.state = 'attached';
    this.polling = true;
    try {
      if (![...this.commands.values()].some(p => !p.delivered) && this.state !== 'closed') {
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish);
            this.wake = undefined; resolve(); };
          const timer = setTimeout(finish, Math.min(25_000, Math.max(0, waitMs)));
          this.wake = finish;
          signal?.addEventListener('abort', finish, { once: true });
          if (signal?.aborted) finish();
        });
      }
      if (signal?.aborted) return { state: 'interrupted', commands: [] };
      const commands: Command[] = [];
      for (const pending of this.commands.values()) if (!pending.delivered && commands.length < 8) {
        pending.delivered = true;
        commands.push(pending.command);
      }
      return { state: this.state, tabId: this.tabId, commands };
    } finally { this.polling = false; }
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.expired()) this.close();
    if (this.state !== 'attached') throw new Error(this.state === 'closed'
      ? 'BROWSER_CONTROL_SESSION_CLOSED' : 'BROWSER_BRIDGE_PAIRING_PENDING');
    if (!METHODS.has(method)) throw new Error('BROWSER_BRIDGE_METHOD_REFUSED');
    const semantic = Object.values(CONVERSATION_METHODS).includes(method as any);
    if (this.mode === 'conversation' && !semantic && method !== 'AgentCore.detach')
      throw new Error('BROWSER_CONVERSATION_SCOPED_COMMAND_REQUIRED');
    if (semantic && this.mode !== 'conversation') throw new Error('BROWSER_CONVERSATION_MODE_REQUIRED');
    if (semantic || (this.mode === 'conversation' && method === 'AgentCore.detach')) {
      const schema = method === CONVERSATION_METHODS.conversation_read ? conversationReadParams
        : method === CONVERSATION_METHODS.conversation_draft ? conversationDraftParams : conversationEmptyParams;
      const parsed = schema.safeParse(params);
      if (!parsed.success) throw new Error('BROWSER_CONVERSATION_PARAMS_REFUSED');
      params = parsed.data;
      if (method === CONVERSATION_METHODS.conversation_draft) {
        if (params.url !== this.boundUrl) throw new Error('BROWSER_CONVERSATION_URL_MISMATCH');
        if (!this.lastRead || params.revision !== this.lastRead.revision
          || (this.lastStatus && this.lastStatus.revision !== params.revision))
          throw new Error('BROWSER_CONVERSATION_FRESH_READ_REQUIRED');
        if (this.lastRead.paused || this.lastRead.busy || this.lastRead.error
          || this.lastStatus?.paused || this.lastStatus?.busy || this.lastStatus?.error)
          throw new Error('BROWSER_CONVERSATION_PAUSED_BUSY_OR_ERROR');
      }
    }
    if (this.nextId > 4096) throw new Error('BROWSER_BRIDGE_COMMAND_BUDGET_EXCEEDED');
    if (this.commands.size >= 16) throw new Error('BROWSER_BRIDGE_COMMAND_BUDGET_EXCEEDED');
    const id = this.nextId++;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const delivered = this.commands.get(id)?.delivered;
        this.commands.delete(id);
        if (method === CONVERSATION_METHODS.conversation_draft)
          this.draftCommand = { id, state: delivered ? 'unknown' : 'not-delivered' };
        reject(new Error(delivered ? 'BROWSER_CONTROL_MUTATION_UNCERTAIN' : 'BROWSER_BRIDGE_COMMAND_NOT_DELIVERED'));
        // Invalidate the grant after a timeout; never dispatch or replay late actions.
        this.close();
      }, this.commandTimeoutMs);
      this.commands.set(id, { command: { id, method, params }, delivered: false, resolve, reject, timer });
      this.wake?.();
    });
  }

  /** One caller-driven semantic operation. The extension's sampler never wakes an AI. */
  async conversation(action: ConversationAction, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (this.mode !== 'conversation') throw new Error('BROWSER_CONVERSATION_MODE_REQUIRED');
    if (this.expired()) this.close();
    if (action === 'conversation_status' && this.state !== 'attached') return {
      mode: this.mode, modeConfirmed: this.modeConfirmed, connectionState: this.state, current: false,
      url: this.boundUrl || conversationUrl(this.expectedUrl), revision: this.cursor,
      paused: true, receipt: this.lastReceipt, receiptCurrent: false, lastObservedDraft: this.lastDraft,
      draftCommand: this.draftCommand, error: this.state === 'closed' ? 'BROWSER_CONTROL_SESSION_CLOSED' : 'BROWSER_BRIDGE_PAIRING_PENDING',
    };
    if (this.conversationInFlight) throw new Error('BROWSER_CONTROL_ACTION_IN_FLIGHT');
    this.conversationInFlight = true;
    try {
      const method = CONVERSATION_METHODS[action];
      if (!method) throw new Error('BROWSER_BRIDGE_METHOD_REFUSED');
      const params = action === 'conversation_read' ? { sinceRevision: input.sinceRevision ?? this.cursor } : input;
      const raw = await this.send(method, params);
      if (this.state !== 'attached') throw new Error('BROWSER_CONTROL_SESSION_CLOSED');
      if (action === 'conversation_read') {
        const parsed = conversationReadResult.safeParse(raw);
        if (!parsed.success) throw new Error('BROWSER_CONVERSATION_RESULT_INVALID');
        const value = parsed.data, since = params.sinceRevision as number;
        this.assertConversationTarget(value.url);
        if (value.revision < this.cursor || value.changed !== (since !== value.revision)
          || (!value.changed && (value.messages.length > 0 || value.windowExits.length > 0)))
          throw new Error('BROWSER_CONVERSATION_REVISION_INVALID');
        if (value.reset || since === 0) this.currentWindow = new Map();
        else if (since !== this.cursor) this.currentWindow = undefined;
        for (const id of value.windowExits) this.currentWindow?.delete(id); // Window exit, never history deletion.
        for (const item of value.messages) this.currentWindow?.set(item.id, item);
        if (this.currentWindow && (this.currentWindow.size > 80
          || [...this.currentWindow.values()].reduce((sum, item) => sum + item.text.length, 0) > 48000))
          throw new Error('BROWSER_CONVERSATION_WINDOW_INVALID');
        this.cursor = value.revision;
        this.lastRead = value;
        this.lastStatus = undefined;
        this.modeConfirmed = true;
        return { ...value, mode: this.mode, modeConfirmed: true, connectionState: this.state, current: !value.paused && !value.error,
          truncated: value.coverage.truncated, cachedWindowSize: this.currentWindow?.size ?? null,
          windowExitsMeaning: 'left-observation-window-not-deletion', untrustedContent: true };
      }
      if (action === 'conversation_status') {
        const parsed = conversationStatusResult.safeParse(raw);
        if (!parsed.success) throw new Error('BROWSER_CONVERSATION_RESULT_INVALID');
        const value = parsed.data;
        this.assertConversationTarget(value.url);
        if (value.draft) this.assertConversationTarget(value.draft.url);
        if (value.receipt?.state === 'confirmed') this.assertConversationTarget(value.receipt.url);
        if (value.revision < this.cursor) throw new Error('BROWSER_CONVERSATION_REVISION_INVALID');
        this.lastStatus = value;
        this.lastReceipt = value.receipt;
        this.lastDraft = value.draft ? { id: value.draft.id, state: value.draft.state,
          url: value.draft.url, revision: value.draft.revision } : undefined;
        this.modeConfirmed = true;
        return { ...value, mode: this.mode, modeConfirmed: true, connectionState: this.state, current: !value.paused && !value.error,
          truncated: value.coverage.truncated, draftCommand: this.draftCommand, untrustedContent: true };
      }
      const parsed = conversationDraftResult.safeParse(raw);
      if (!parsed.success) throw new Error('BROWSER_CONVERSATION_RESULT_INVALID');
      this.assertConversationTarget(parsed.data.url);
      this.draftCommand = { state: 'review' };
      this.lastDraft = { ...parsed.data, revision: input.revision as number };
      return { ...parsed.data, connectionState: this.state, delivered: false, reviewRequired: true };
    } catch (error) {
      if (action === 'conversation_draft' && this.state !== 'closed')
        this.draftCommand = { state: 'failed', error: redactSensitiveString(error instanceof Error ? error.message : 'Draft command failed').slice(0,500) };
      if (error instanceof Error && /BROWSER_CONVERSATION_(RESULT|REVISION|WINDOW)_INVALID/.test(error.message)) this.close();
      throw error;
    } finally { this.conversationInFlight = false; }
  }

  private assertConversationTarget(url: string): void {
    if (url !== this.boundUrl) { this.close(); throw new Error('BROWSER_CONVERSATION_URL_MISMATCH'); }
  }

  async detach(): Promise<'confirmed' | 'uncertain'> {
    if (this.state === 'pending' || this.state === 'closed') {
      this.close(); return !this.paired || this.detached ? 'confirmed' : 'uncertain';
    }
    if (this.state === 'paired') { this.close(); return 'uncertain'; }
    try {
      const result = await this.send('AgentCore.detach');
      this.detached = result?.detached === true;
      this.close(); return this.detached ? 'confirmed' : 'uncertain';
    }
    catch { this.close(); return 'uncertain'; }
  }

  close(): void {
    this.lastRead = undefined;
    this.lastStatus = undefined;
    this.currentWindow?.clear();
    this.state = 'closed';
    this.token = '';
    for (const pending of this.commands.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('BROWSER_CONTROL_SESSION_CLOSED'));
    }
    this.commands.clear();
    this.wake?.();
  }
}

export class BrowserExtensionBridge {
  private readonly clients = new Map<string, ExtensionBrowserClient>();
  constructor(private readonly timeoutMs = 10_000) {}
  request(url: string, mode: BrowserBridgeMode = 'browser'): ExtensionBrowserClient {
    for (const [id, client] of this.clients) if (client.expired() || client.state === 'closed') {
      client.close(); this.clients.delete(id);
    }
    if (this.clients.size >= 4) throw new Error('BROWSER_BRIDGE_SESSION_BUDGET_EXCEEDED');
    const client = new ExtensionBrowserClient(url, this.timeoutMs, Date.now, mode);
    this.clients.set(client.id, client);
    return client;
  }
  pair(body: Record<string, unknown>, origin: string): Record<string, unknown> {
    if (typeof body.code !== 'string' || !/^[a-f0-9]{32}$/.test(body.code)
      || typeof body.url !== 'string' || body.url.length > 4000 || typeof body.tabId !== 'number')
      throw new Error('BROWSER_BRIDGE_PAIR_REFUSED');
    const client = [...this.clients.values()].find(c => equal(c.code, body.code as string));
    if (!client) throw new Error('BROWSER_BRIDGE_PAIR_REFUSED');
    const token = client.pair(body.code, origin, body.tabId, body.url);
    // A fresh connection to this extension/tab revokes every old queue and token.
    for (const prior of this.clients.values())
      if (prior !== client && prior.pairedTo(origin, body.tabId)) prior.close();
    return { sessionId: client.id, token, tabId: body.tabId };
  }
  get(body: Record<string, unknown>, origin: string): ExtensionBrowserClient {
    const client = typeof body.sessionId === 'string' ? this.clients.get(body.sessionId) : undefined;
    if (!client || typeof body.token !== 'string') throw new Error('BROWSER_BRIDGE_GRANT_REFUSED');
    client.authorize(origin, body.token);
    return client;
  }
}

export const browserExtensionBridge = new BrowserExtensionBridge();
