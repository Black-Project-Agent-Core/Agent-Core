import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OpenBrowserUseRpc, type ObuPipe } from './open-browser-use-rpc.js';
import { managedBrowserUseRuntime, obuManagedDirectory, OBU_MANAGED_HOST, selectObuConnection } from './open-browser-use-runtime.js';

export interface BrowserTransport {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  close(): void;
  onEvent?: (method: string, params: any) => void;
}

const HOST = 'com.ifuryst.open_browser_use.extension';
const EXTENSION_ID = 'bgjoihaepiejlfjinojjfgokghnodnhd';
const CDP_METHODS = new Set(['Page.enable', 'Runtime.enable', 'Page.navigate', 'Page.bringToFront', 'Runtime.evaluate',
  'Page.getNavigationHistory', 'Page.navigateToHistoryEntry', 'Input.dispatchMouseEvent',
  'Input.dispatchKeyEvent', 'Input.insertText', 'Emulation.setFocusEmulationEnabled']);
const EVENTS = new Set(['Page.javascriptDialogOpening', 'Page.javascriptDialogClosed']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
type Info = { type: string; version: string; metadata: { extensionId: string; extensionInstanceId: string; nativeHostName: string } };
export interface ObuConfiguration { version: 1; socketDir?: string; socketPath?: string; extensionInstanceId?: string; discovery?: 'auto' }
export interface ObuDependencies {
  connect(socketPath: string, sessionId: string): Promise<OpenBrowserUseRpc>;
  candidates(): Promise<string[]>;
  instanceId?: string;
}

function digest(value: Buffer): string { return createHash('sha256').update(value).digest('hex'); }
async function boundedJson(file: string, limit = 16384): Promise<any> {
  if ((await stat(file)).size > limit) throw new Error('BROWSER_OBU_CONFIG_TOO_LARGE');
  const bytes = await readFile(file);
  if (bytes.length > limit) throw new Error('BROWSER_OBU_CONFIG_TOO_LARGE');
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error('BROWSER_OBU_CONFIG_INVALID'); }
}

export async function readObuConfiguration(root: string): Promise<ObuConfiguration> {
  let value: any;
  try { value = await boundedJson(path.join(root, 'runtime', 'browser-control', 'open-browser-use.json')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; value = { version: 1 }; }
  if (!value || Array.isArray(value) || value.version !== 1
    || Object.keys(value).some(key => !['version', 'socketDir', 'socketPath', 'extensionInstanceId', 'discovery'].includes(key))
    || (value.discovery !== undefined && value.discovery !== 'auto'))
    throw new Error('BROWSER_OBU_CONFIG_INVALID');
  const config: ObuConfiguration = { ...value,
    ...(process.env.AGENT_CORE_OPEN_BROWSER_USE_SOCKET_DIR ? { socketDir: process.env.AGENT_CORE_OPEN_BROWSER_USE_SOCKET_DIR } : {}),
    ...(process.env.AGENT_CORE_OPEN_BROWSER_USE_INSTANCE_ID ? { extensionInstanceId: process.env.AGENT_CORE_OPEN_BROWSER_USE_INSTANCE_ID } : {}) };
  for (const p of [config.socketDir, config.socketPath]) if (p !== undefined
    && (typeof p !== 'string' || !path.isAbsolute(p) || p.length > 4096 || /[\0\r\n]/.test(p)))
    throw new Error('BROWSER_OBU_CONFIG_PATH_INVALID');
  if (config.extensionInstanceId !== undefined && (typeof config.extensionInstanceId !== 'string' || !UUID.test(config.extensionInstanceId)))
    throw new Error('BROWSER_OBU_CONFIG_INSTANCE_INVALID');
  return config;
}

/** Read-only, bounded directory discovery. active.json is neither trusted nor changed. */
export async function obuSocketCandidates(config: ObuConfiguration, root?: string): Promise<string[]> {
  if (config.socketPath) return [config.socketPath];
  const dir = config.socketDir ?? (process.platform === 'win32' ? path.join(tmpdir(), 'open-browser-use') : '/tmp/open-browser-use');
  if (config.discovery === 'auto' && root) {
    const found = [...new Set([...(await obuSocketCandidates({ version: 1, socketDir: obuManagedDirectory(root) })),
      ...(await obuSocketCandidates({ version: 1, socketDir: dir }))])];
    if (found.length > 16) throw new Error('BROWSER_OBU_TOO_MANY_SOCKETS_SELECT_EXACT_PATH');
    return found;
  }
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new Error('BROWSER_OBU_SOCKET_DIRECTORY_UNAVAILABLE'); }
  // libuv reports Windows AF_UNIX reparse points as symlinks; Go validates socket mode before dial.
  const candidates = entries.filter(entry => entry.name.endsWith('.sock') && !entry.isDirectory()
    && (process.platform === 'win32' || !entry.isSymbolicLink()));
  if (candidates.length > 16) throw new Error('BROWSER_OBU_TOO_MANY_SOCKETS_SELECT_EXACT_PATH');
  return candidates.map(entry => path.join(dir, entry.name)).sort();
}

async function internalConnector(root: string): Promise<(socket: string, session: string) => Promise<OpenBrowserUseRpc>> {
  const source = path.join(root, 'src', 'rdc', 'browser-control', 'open-browser-use-stdio.go');
  const runtime = path.join(root, 'runtime', 'browser-control', 'open-browser-use', process.platform + '-' + process.arch);
  let manifest: any;
  try { manifest = await boundedJson(path.join(runtime, 'build.json')); }
  catch { throw new Error('BROWSER_OBU_TRANSPORT_NOT_BUILT: run npm run build:browser-transport'); }
  if (manifest.version !== 1 || manifest.target !== process.platform + '-' + process.arch
    || !HASH.test(manifest.sourceSha256) || !HASH.test(manifest.binarySha256)
    || typeof manifest.binary !== 'string' || !/^transport-[0-9a-f]{16}(\.exe)?$/.test(manifest.binary))
    throw new Error('BROWSER_OBU_BUILD_MANIFEST_INVALID');
  const binary = path.join(runtime, manifest.binary);
  if (digest(await readFile(source)) !== manifest.sourceSha256 || digest(await readFile(binary)) !== manifest.binarySha256)
    throw new Error('BROWSER_OBU_TRANSPORT_STALE: run npm run build:browser-transport');
  return async (socket, session) => {
    const relative = path.relative(obuManagedDirectory(root), socket);
    const embedded = !relative.startsWith('..') && !path.isAbsolute(relative) && /^[0-9a-f]{32}\.sock$/i.test(relative);
    // .NET AF_UNIX files on Windows need the matching .NET connector; Go's ModeSocket probe
    // does not recognize their file metadata. The embedded mode accepts only owned endpoints.
    const child = spawn(embedded ? path.join(root, 'Agent Core.exe') : binary,
      embedded ? ['--browser-use-transport', socket] : ['--socket', socket],
      { cwd: root, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    // Only the owned IPC helper is stopped. Never stop Chrome/Brave or the installed native host.
    const pipe: ObuPipe = { input: child.stdin, output: child.stdout, stop: () => {
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      if (child.exitCode === null) child.kill();
    } };
    const rpc = new OpenBrowserUseRpc(pipe, session);
    child.stderr.resume(); // Never spill raw subprocess output into observations/history.
    child.once('error', () => rpc.close(new Error('BROWSER_OBU_HELPER_UNAVAILABLE')));
    child.once('close', () => rpc.close(new Error('BROWSER_OBU_CONNECTION_LOST_UNKNOWN')));
    return rpc;
  };
}

function validInfo(value: any): value is Info {
  return value?.type === 'extension' && ['1.0.0', '1.1.0'].includes(value.version)
    && value.metadata?.extensionId === EXTENSION_ID && [HOST, OBU_MANAGED_HOST].includes(value.metadata.nativeHostName)
    && typeof value.metadata.extensionInstanceId === 'string' && UUID.test(value.metadata.extensionInstanceId);
}

/** An internal transport of BrowserControlService, backed by the installed extension/host. */
export class OpenBrowserUseTransport implements BrowserTransport {
  onEvent?: (method: string, params: any) => void;
  tabId?: number;
  url?: string;
  private readonly expiresAt = Date.now() + 30 * 60_000;
  private readonly expiryTimer: ReturnType<typeof setTimeout>;
  private phase: 'connected' | 'opening' | 'open' | 'disposing' | 'closed' = 'connected';
  private createAttempted = false;
  private backgroundMode = false;
  get background(): boolean { return this.backgroundMode; }
  /** The owned tab is open and usable for reuse; never creates a tab. */
  get usable(): boolean { return this.phase === 'open' && !this.closed; }
  private disposed?: Promise<Record<string, unknown>>;
  get closed(): boolean { return this.phase === 'closed' || this.rpc.closed || Date.now() >= this.expiresAt; }
  private constructor(private readonly rpc: OpenBrowserUseRpc, readonly info: Info, readonly socketIdentity: string) {
    // Expiry must close the owned tab too, not only drop the RPC connection.
    this.expiryTimer = setTimeout(() => { void this.dispose(); }, 30 * 60_000);
    this.expiryTimer.unref();
    rpc.onNotification = (method, event) => {
      // Relay events are broadcast, including activity from other clients and tabs.
      if (!this.closed && this.phase !== 'disposing' && method === 'onCDPEvent' && Number.isSafeInteger(this.tabId)
        && event?.source?.tabId === this.tabId && !event.source.sessionId && EVENTS.has(event.method)
        && event.params && typeof event.params === 'object' && !Array.isArray(event.params))
        this.onEvent?.(event.method, event.params);
    };
  }

  static async connect(root: string, sessionId = randomUUID(), dependencies?: ObuDependencies, existingOnly = false): Promise<OpenBrowserUseTransport> {
    const config = dependencies ? undefined : await readObuConfiguration(root);
    const connector = dependencies?.connect ?? await internalConnector(root);
    const instanceId = dependencies?.instanceId ?? config?.extensionInstanceId;
    const automatic = config?.discovery === 'auto' && !config.socketPath && !instanceId;
    const runtime = automatic ? managedBrowserUseRuntime(root) : undefined;
    let prepared = false;
    let fallbackStarted = false;
    let externalGraceDeadline = 0;
    let deadline = 0;
    do {
      const candidates = await (dependencies?.candidates() ?? obuSocketCandidates(config!, root));
      if (candidates.length > 16) throw new Error('BROWSER_OBU_TOO_MANY_SOCKETS_SELECT_EXACT_PATH');
      const matches: OpenBrowserUseTransport[] = [];
      let next = 0;
      // Bound both directory discovery and simultaneous native helper handshakes.
      await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
        while (next < candidates.length) {
          const candidate = candidates[next++]!;
          let rpc: OpenBrowserUseRpc | undefined;
          try {
            rpc = await connector(candidate, 'agent-core:' + sessionId);
            const info = await rpc.request('getInfo', {}, 3000);
            if (!validInfo(info) || (instanceId && info.metadata.extensionInstanceId !== instanceId)) { rpc.close(); continue; }
            matches.push(new OpenBrowserUseTransport(rpc, info, digest(Buffer.from(candidate))));
          } catch { rpc?.close(); }
        }
      }));
      const selected = automatic ? selectObuConnection(matches) : matches.length === 1 ? matches[0] : undefined;
      for (const client of matches) if (client !== selected) client.close();
      if (selected) {
        if (automatic && selected.info.metadata.nativeHostName === OBU_MANAGED_HOST && !prepared) {
          selected.close(); await runtime!.prepare(); prepared = true; continue;
        }
        return selected;
      }
      if (existingOnly) throw new Error('BROWSER_OBU_BACKGROUND_CONNECTION_REQUIRED: enable one supported extension; no browser was started');
      if (!automatic) throw new Error(matches.length ? 'BROWSER_OBU_AMBIGUOUS_CONNECTION' : candidates.length
        ? 'BROWSER_OBU_MATCHING_EXTENSION_UNAVAILABLE' : 'BROWSER_OBU_NOT_CONNECTED: enable Open Browser Use and configure its actual socket directory');
      if (candidates.length && !matches.length)
        throw new Error('BROWSER_OBU_CONNECTION_PRESENT_UNVERIFIED: inspect the existing connection; no duplicate browser was started');
      if (!prepared) { await runtime!.prepare(); prepared = true; externalGraceDeadline = Date.now() + 10_000; continue; }
      if (!matches.length && Date.now() < externalGraceDeadline) {
        await new Promise(resolve => setTimeout(resolve, 150)); continue;
      }
      if (!fallbackStarted) { await runtime!.start(); fallbackStarted = true; deadline = Date.now() + 15_000; }
      if (Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, 150));
    } while (true);
    throw new Error('BROWSER_OBU_MANAGED_EXTENSION_NOT_READY');
  }

  async open(url: string, background = false): Promise<void> {
    if (this.phase !== 'connected' || this.closed) throw new Error('BROWSER_OBU_ALREADY_OPEN_OR_CLOSED');
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
      throw new Error('BROWSER_CONTROL_URL_SCHEME_REFUSED');
    this.phase = 'opening';
    this.backgroundMode = background;
    this.createAttempted = true;
    const tab = await this.rpc.request('createTab');
    if (!Number.isSafeInteger(tab?.id) || tab.id <= 0) { this.close(); throw new Error('BROWSER_OBU_TAB_ID_INVALID'); }
    this.tabId = tab.id;
    await this.rpc.request('attach', { tabId: this.tabId });
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.navigateOwnedTab(target, background);
    if (this.phase !== 'opening' || this.closed) throw new Error('BROWSER_OBU_SESSION_CLOSED');
    this.phase = 'open';
  }

  /** Moves the already-owned task tab to another URL. Never creates a tab. */
  async navigate(url: string): Promise<void> {
    if (!this.usable) throw new Error('BROWSER_OBU_SESSION_CLOSED');
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
      throw new Error('BROWSER_CONTROL_URL_SCHEME_REFUSED');
    await this.navigateOwnedTab(target, this.backgroundMode);
  }

  private async navigateOwnedTab(target: URL, background: boolean): Promise<void> {
    const navigation = await this.send('Page.navigate', { url: target.toString() });
    if (!navigation || navigation.errorText) throw new Error('BROWSER_CONTROL_NAVIGATION_FAILED');
    if (!background) await this.send('Page.bringToFront');
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const response = await this.send('Runtime.evaluate', { expression: '({ready:document.readyState,url:location.href,visible:!document.hidden,focused:document.hasFocus()})', returnByValue: true });
      const state = response?.result?.value;
      if (!response?.exceptionDetails && typeof state?.url === 'string' && /^https?:\/\//.test(state.url)
        && (background || (state.visible === true && state.focused === true)) && ['complete', 'interactive'].includes(state.ready)) {
        this.url = target.toString();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('BROWSER_CONTROL_NAVIGATION_NOT_READY');
  }

  async assertForeground(): Promise<void> {
    if (this.backgroundMode) {
      const result = await this.send('Runtime.evaluate', {
        expression: '({ready:document.readyState,url:location.href,visible:!document.hidden,focused:document.hasFocus()})', returnByValue: true,
      });
      if (this.phase !== 'open' || this.closed) throw new Error('BROWSER_OBU_SESSION_CLOSED');
      const state = result.result?.value;
      if (result.exceptionDetails || typeof state?.url !== 'string' || !/^https?:\/\//.test(state.url)
        || !['complete', 'interactive'].includes(state.ready))
        throw new Error('BROWSER_OBU_BACKGROUND_DOCUMENT_UNVERIFIED: observe the owned task tab again');
      return;
    }
    const probe = async () => {
      const result = await this.send('Runtime.evaluate', {
        expression: '({visible:!document.hidden,focused:document.hasFocus()})', returnByValue: true,
      });
      if (this.phase !== 'open' || this.closed) throw new Error('BROWSER_OBU_SESSION_CLOSED');
      const state = result.result?.value;
      if (result.exceptionDetails || typeof state?.visible !== 'boolean' || typeof state.focused !== 'boolean')
        throw new Error('BROWSER_OBU_FOCUS_UNVERIFIED: observe the owned task tab again');
      return state as { visible: boolean; focused: boolean };
    };
    let state = await probe();
    if (state.visible && state.focused) return;
    // OBU's active flag is logical session state, not browser/window focus. Restore only our known
    // target once, then verify actual document focus; never replay the caller's page mutation.
    await this.send('Page.bringToFront');
    const deadline = Date.now() + 1500;
    do {
      state = await probe();
      if (state.visible && state.focused) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    throw new Error(`BROWSER_OBU_TAB_NOT_FOREGROUND: owned task tab visible=${state.visible}, focused=${state.focused}; select it and observe again`);
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.phase === 'disposing') throw new Error('BROWSER_OBU_SESSION_DISPOSING');
    if (this.closed) { this.close(); throw new Error('BROWSER_OBU_SESSION_CLOSED'); }
    if (!CDP_METHODS.has(method)) throw new Error('BROWSER_OBU_METHOD_REFUSED');
    if (this.backgroundMode && method === 'Page.bringToFront') throw new Error('BROWSER_OBU_BACKGROUND_ACTIVATION_REFUSED');
    if (!Number.isSafeInteger(this.tabId)) throw new Error('BROWSER_OBU_TAB_NOT_OPEN');
    const result = await this.rpc.request('executeCdp', { target: { tabId: this.tabId }, method, commandParams: params, timeoutMs: 8000 });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      this.close(); throw new Error('BROWSER_OBU_CDP_RESULT_INVALID_UNKNOWN');
    }
    return result;
  }

  dispose(): Promise<Record<string, unknown>> {
    if (this.disposed) return this.disposed;
    this.phase = 'disposing';
    this.disposed = (async () => {
      let cleanup = this.createAttempted ? 'uncertain' : 'not-needed';
      try {
        if (!this.closed && this.tabId !== undefined) {
          const tabs = await this.rpc.request('getTabs');
          if (!Array.isArray(tabs) || tabs.length > 64 || tabs.some(tab => !Number.isSafeInteger(tab?.id) || tab.id <= 0)
            || new Set(tabs.map(tab => tab.id)).size !== tabs.length)
            throw new Error('BROWSER_OBU_CLEANUP_SCOPE_INVALID');
          // A manually moved tab leaves the group. Never regain or close it by guessing.
          if (!tabs.some(tab => tab.id === this.tabId)) cleanup = 'scope-changed';
          else {
            // Preserve any tab the user added to this group after open.
            await this.rpc.request('finalizeTabs', { keep: tabs.filter(tab => tab.id !== this.tabId).map(tab => ({ tabId: tab.id, status: 'handoff' })) });
            cleanup = 'acknowledged';
          }
        }
      } catch { cleanup = 'uncertain'; }
      finally { this.close(); }
      return { cleanup, ownedTabId: this.tabId ?? null, browserRetained: true,
        detach: 'not-independently-observed', ...(cleanup === 'uncertain' || cleanup === 'scope-changed' ? { manualInspectionRequired: true } : {}) };
    })();
    return this.disposed;
  }

  close(): void { this.phase = 'closed'; clearTimeout(this.expiryTimer); this.onEvent = undefined; this.rpc.close(); }
}
