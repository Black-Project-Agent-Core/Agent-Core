import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { redactSensitiveString } from '../../security/redaction.js';

export interface BrowserTransport {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  close(): void;
  onEvent?: (method: string, params: any) => void;
}

const METHODS = new Set([
  'Page.enable', 'Runtime.enable', 'Runtime.evaluate', 'Page.getNavigationHistory',
  'Page.navigateToHistoryEntry', 'Input.dispatchMouseEvent', 'Input.dispatchKeyEvent',
  'Input.insertText', 'Page.getLayoutMetrics', 'Page.captureScreenshot',
  'AgentCore.detach', 'AgentCore.pause', 'AgentCore.resume',
]);
const EVENTS = new Set(['Page.javascriptDialogOpening', 'Page.javascriptDialogClosed',
  'Page.frameNavigated', 'Page.navigatedWithinDocument', 'Page.frameResized']);
export const BROWSER_CAPTURE_MAX_BYTES = 128 * 1024;
export const BROWSER_BRIDGE_MAX_ENVELOPE_BYTES = 240 * 1024;
const METADATA_MAX_BYTES = 16 * 1024;

function validateCaptureParams(params: Record<string, unknown>): void {
  const clip = params.clip as Record<string, unknown> | undefined;
  if (Object.keys(params).some(k => !['format', 'quality', 'fromSurface', 'captureBeyondViewport', 'clip'].includes(k))
    || params.format !== 'jpeg' || params.fromSurface !== true || params.captureBeyondViewport !== false
    || !Number.isInteger(params.quality) || Number(params.quality) < 55 || Number(params.quality) > 100
    || !clip || Object.keys(clip).some(k => !['x', 'y', 'width', 'height', 'scale'].includes(k))
    || !['x', 'y', 'width', 'height', 'scale'].every(k => typeof clip[k] === 'number' && Number.isFinite(clip[k]))
    || Number(clip.x) < 0 || Number(clip.y) < 0 || Number(clip.width) <= 0 || Number(clip.width) > 8192
    || Number(clip.height) <= 0 || Number(clip.height) > 8192 || Number(clip.scale) <= 0 || Number(clip.scale) > 1)
    throw new Error('BROWSER_BRIDGE_CAPTURE_ARGUMENTS_REFUSED');
}

function validateCaptureReply(result: unknown): void {
  const capture = result as { data?: unknown };
  if (!capture || typeof capture.data !== 'string' || Object.keys(capture).some(k => k !== 'data'))
    throw new Error('BROWSER_BRIDGE_CAPTURE_INVALID');
  if (capture.data.length > Math.ceil(BROWSER_CAPTURE_MAX_BYTES / 3) * 4)
    throw new Error('BROWSER_BRIDGE_CAPTURE_TOO_LARGE');
  if (!capture.data.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(capture.data))
    throw new Error('BROWSER_BRIDGE_CAPTURE_INVALID');
  const data = Buffer.from(capture.data, 'base64');
  if (data.byteLength > BROWSER_CAPTURE_MAX_BYTES) throw new Error('BROWSER_BRIDGE_CAPTURE_TOO_LARGE');
  if (data.toString('base64') !== capture.data) throw new Error('BROWSER_BRIDGE_CAPTURE_INVALID');
}
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
  state: 'pending' | 'paired' | 'attached' | 'paused' | 'closed' = 'pending';
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
  private readonly cancelled = new Set<number>();

  constructor(readonly expectedUrl: string, private readonly commandTimeoutMs = 10_000,
    private readonly now: () => number = Date.now) {
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
    this.origin = origin;
    this.tabId = tabId;
    this.token = randomBytes(32).toString('hex');
    this.state = 'paired';
    this.paired = true;
    this.lastSeen = this.now();
    return this.token;
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
    if (Buffer.byteLength(JSON.stringify({ replies, events })) >= BROWSER_BRIDGE_MAX_ENVELOPE_BYTES)
      throw new Error('BROWSER_BRIDGE_ENVELOPE_TOO_LARGE');
    if (Buffer.byteLength(JSON.stringify(events)) > METADATA_MAX_BYTES)
      throw new Error('BROWSER_BRIDGE_METADATA_TOO_LARGE');
    const ids = new Set<number>();
    for (const reply of replies) {
      if (!reply || !Number.isSafeInteger(reply.id) || ids.has(reply.id)
        || (!this.commands.get(reply.id)?.delivered && !this.cancelled.has(reply.id)))
        throw new Error('BROWSER_BRIDGE_INVALID_REPLY');
      if (this.commands.get(reply.id)?.command.method === 'Page.captureScreenshot' && !reply.error)
        validateCaptureReply(reply.result);
      if (this.commands.get(reply.id)?.command.method === 'Page.getLayoutMetrics'
        && Buffer.byteLength(JSON.stringify(reply.result ?? {})) > METADATA_MAX_BYTES)
        throw new Error('BROWSER_BRIDGE_METADATA_TOO_LARGE');
      ids.add(reply.id);
    }
    for (const reply of replies) {
      if (this.cancelled.delete(reply.id)) continue;
      const pending = this.commands.get(reply.id)!;
      this.commands.delete(reply.id);
      clearTimeout(pending.timer);
      if (reply.error) pending.reject(new Error(reply.error === 'BROWSER_CONTROL_CAPTURE_TOO_LARGE'
        ? reply.error : 'BROWSER_BRIDGE_CDP_ERROR: ' + redactSensitiveString(String(reply.error)).slice(0,500)));
      else pending.resolve(reply.result ?? {});
    }
    for (const event of events) if (EVENTS.has(event?.method)
      && !(event.method === 'Page.frameNavigated' && (event.params as any)?.frame?.parentId)) {
        if (['Page.frameNavigated', 'Page.navigatedWithinDocument', 'Page.frameResized'].includes(event.method))
          this.cancelPending('BROWSER_CONTROL_STALE_OBSERVATION', false);
      this.onEvent?.(event.method, event.params ?? {});
    }
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
    if (this.state !== 'attached' && !(this.state === 'paused' && ['AgentCore.detach', 'AgentCore.pause', 'AgentCore.resume'].includes(method)))
      throw new Error(this.state === 'closed' ? 'BROWSER_CONTROL_SESSION_CLOSED'
        : this.state === 'paused' ? 'BROWSER_CONTROL_PAUSED' : 'BROWSER_BRIDGE_PAIRING_PENDING');
    if (!METHODS.has(method)) throw new Error('BROWSER_BRIDGE_METHOD_REFUSED');
    if (method === 'Page.captureScreenshot') validateCaptureParams(params);
    if (method === 'Page.getLayoutMetrics' && Object.keys(params).length) throw new Error('BROWSER_BRIDGE_METHOD_REFUSED');
    if (this.commands.size >= 16) throw new Error('BROWSER_BRIDGE_COMMAND_BUDGET_EXCEEDED');
    const id = this.nextId++;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const delivered = this.commands.get(id)?.delivered;
        this.commands.delete(id);
        reject(new Error(delivered ? 'BROWSER_CONTROL_MUTATION_UNCERTAIN' : 'BROWSER_BRIDGE_COMMAND_NOT_DELIVERED'));
        // Invalidate the grant after a timeout; never dispatch or replay late actions.
        this.close();
      }, this.commandTimeoutMs);
      this.commands.set(id, { command: { id, method, params }, delivered: false, resolve, reject, timer });
      this.wake?.();
    });
  }

  private cancelPending(reason: string, includeControls = true): void {
    for (const [id, pending] of this.commands) {
      if (!includeControls && pending.command.method.startsWith('AgentCore.')) continue;
      clearTimeout(pending.timer);
      if (pending.delivered) this.cancelled.add(id);
      pending.reject(new Error(pending.delivered ? 'BROWSER_CONTROL_MUTATION_UNCERTAIN' : reason));
      this.commands.delete(id);
    }
    if (this.cancelled.size > 64) { this.close(); throw new Error('BROWSER_BRIDGE_COMMAND_BUDGET_EXCEEDED'); }
  }

  /** User pause immediately invalidates queued work; late delivered replies are discarded once. */
  setPaused(paused: boolean): void {
    if (!['attached', 'paused'].includes(this.state)) throw new Error('BROWSER_BRIDGE_CONTROL_REFUSED');
    if (!paused && this.state === 'attached') return;
    this.state = paused ? 'paused' : 'attached';
    if (paused) this.cancelPending('BROWSER_CONTROL_PAUSED');
    this.onEvent?.(paused ? 'AgentCore.paused' : 'AgentCore.resumed', {});
    this.wake?.();
  }

  async pause(): Promise<{ paused: true; released: boolean }> {
    this.setPaused(true);
    const result = await this.send('AgentCore.pause');
    return { paused: true, released: result?.released === true };
  }

  async resume(): Promise<{ paused: false }> {
    if (this.state !== 'paused') throw new Error('BROWSER_BRIDGE_CONTROL_REFUSED');
    const result = await this.send('AgentCore.resume');
    if (result?.paused !== false) throw new Error('BROWSER_BRIDGE_CONTROL_REFUSED');
    this.setPaused(false);
    return { paused: false };
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
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.onEvent?.('AgentCore.detached', {});
    this.token = '';
    for (const pending of this.commands.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('BROWSER_CONTROL_SESSION_CLOSED'));
    }
    this.commands.clear();
    this.cancelled.clear();
    this.wake?.();
  }
}

export class BrowserExtensionBridge {
  private readonly clients = new Map<string, ExtensionBrowserClient>();
  constructor(private readonly timeoutMs = 10_000) {}
  request(url: string): ExtensionBrowserClient {
    for (const [id, client] of this.clients) if (client.expired() || client.state === 'closed') {
      client.close(); this.clients.delete(id);
    }
    if (this.clients.size >= 4) throw new Error('BROWSER_BRIDGE_SESSION_BUDGET_EXCEEDED');
    const client = new ExtensionBrowserClient(url, this.timeoutMs);
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
