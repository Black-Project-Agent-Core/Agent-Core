import { spawn, execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile, unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

export const OBU_MANAGED_HOST = 'com.agent_core.browser_use';
export const OBU_EXTERNAL_HOST = 'com.ifuryst.open_browser_use.extension';
const EXTENSION_ID = 'bgjoihaepiejlfjinojjfgokghnodnhd';
const run = promisify(execFile);
export const obuManagedDirectory = (root: string): string => path.join(root, 'runtime', 'rdc', 'browser-control', 'managed');

/** Never use a filename, last-used file, or enumeration order as a profile identity. */
export function selectObuConnection<T extends { info: { metadata: { nativeHostName: string } } }>(connections: T[]): T | undefined {
  const external = connections.filter(c => c.info.metadata.nativeHostName === OBU_EXTERNAL_HOST);
  if (external.length === 1) return external[0];
  const managed = connections.filter(c => c.info.metadata.nativeHostName === OBU_MANAGED_HOST);
  return managed.length === 1 ? managed[0] : undefined;
}

interface OwnedBrowser { alive(): boolean; stop(): Promise<void> }
interface RuntimeDependencies { prepare(): Promise<void>; launch(): Promise<OwnedBrowser>; cleanup?(): Promise<void> }

export class ManagedBrowserUseRuntime {
  private flight?: Promise<void>;
  private browser?: OwnedBrowser;
  private closing = false;
  private state = 'idle';
  private prepared?: Promise<void>;
  constructor(readonly root: string, private readonly dependencies: RuntimeDependencies = {
    prepare: () => registerBrowserUseHosts(root), launch: () => launchBrowser(root), cleanup: () => removeOwner(root),
  }) {}

  prepare(): Promise<void> {
    if (this.closing) return Promise.reject(new Error('BROWSER_OBU_RUNTIME_CLOSED'));
    return this.prepared ??= this.dependencies.prepare().catch(error => { this.prepared = undefined; throw error; });
  }

  start(): Promise<void> {
    if (this.closing) return Promise.reject(new Error('BROWSER_OBU_RUNTIME_CLOSED'));
    if (this.browser?.alive()) return Promise.resolve();
    return this.flight ??= (async () => {
      this.state = 'starting';
      await this.prepare();
      if (this.closing) throw new Error('BROWSER_OBU_RUNTIME_CLOSED');
      const browser = await this.dependencies.launch();
      if (this.closing) { await browser.stop(); throw new Error('BROWSER_OBU_RUNTIME_CLOSED'); }
      this.browser = browser; this.state = 'running';
    })().catch(error => { this.state = this.closing ? 'stopped' : 'unavailable'; throw error; })
      .finally(() => { this.flight = undefined; });
  }

  status(): { state: string; owned: boolean } {
    return { state: this.state === 'running' && !this.browser?.alive() ? 'unavailable' : this.state,
      owned: Boolean(this.browser?.alive()) };
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.flight?.catch(() => {});
    await this.prepared?.catch(() => {});
    const browser = this.browser; this.browser = undefined;
    const failures: unknown[] = [];
    try { await this.dependencies.cleanup?.(); } catch (error) { failures.push(error); }
    try { if (browser?.alive()) await browser.stop(); } catch (error) { failures.push(error); }
    if (browser?.alive()) {
      this.browser = browser; this.state = 'cleanup-uncertain';
      failures.push(new Error('BROWSER_OBU_MANAGED_BROWSER_STOP_UNKNOWN'));
    } else this.state = 'stopped';
    if (failures.length) throw new AggregateError(failures, 'BROWSER_OBU_RUNTIME_CLEANUP_FAILED');
  }
}

const runtimes = new Map<string, ManagedBrowserUseRuntime>();
export function managedBrowserUseRuntime(root: string): ManagedBrowserUseRuntime {
  const key = path.resolve(root);
  let runtime = runtimes.get(key);
  if (!runtime) { runtime = new ManagedBrowserUseRuntime(key); runtimes.set(key, runtime); }
  return runtime;
}

/** Per-user native-messaging registration. Unrelated host registrations are preserved. */
async function registerBrowserUseHosts(root: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('BROWSER_OBU_MANAGED_WINDOWS_ONLY');
  const executable = path.join(root, 'Agent Core.exe'); await access(executable);
  const directory = obuManagedDirectory(root); await mkdir(directory, { recursive: true });
  const browsers = ['Google\\Chrome', 'Chromium', 'BraveSoftware\\Brave-Browser', 'Microsoft\\Edge'];
  for (const host of [OBU_MANAGED_HOST, OBU_EXTERNAL_HOST]) {
    const manifest = path.join(directory, host + '.json');
    const value = JSON.stringify({ name: host, description: 'Agent Core browser-use native relay',
      path: executable, type: 'stdio', allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] }, null, 2) + '\n';
    if (await readFile(manifest, 'utf8').catch(() => '') !== value) await writeFile(manifest, value);
    for (const browser of browsers) {
      const key = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${host}`;
      const current = await registryValue(key, '64') ?? await registryValue(key, '32');
      // A new HKCU entry would shadow a system registration. Preserve that effective host too.
      const machineKey = `HKLM\\Software\\${browser}\\NativeMessagingHosts\\${host}`;
      const machineHost = !current && (await registryValue(machineKey, '64') ?? await registryValue(machineKey, '32'));
      if (machineHost) {
        if (host === OBU_EXTERNAL_HOST) continue;
        if (path.resolve(machineHost).toLowerCase() !== path.resolve(manifest).toLowerCase())
          throw new Error('BROWSER_OBU_MANAGED_HOST_REGISTRATION_CONFLICT');
        continue;
      }
      if (current && path.resolve(current).toLowerCase() !== path.resolve(manifest).toLowerCase()) {
        if (host === OBU_EXTERNAL_HOST) continue;
        throw new Error('BROWSER_OBU_MANAGED_HOST_REGISTRATION_CONFLICT');
      }
      if (!current) await run('reg.exe', ['add', key, '/ve', '/t', 'REG_SZ', '/d', manifest, '/f'],
        { windowsHide: true, timeout: 3000 });
    }
  }
  const ownerFile = path.join(directory, 'core-owner.json');
  const staging = ownerFile + '.' + process.pid;
  await writeFile(staging, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
  await rename(staging, ownerFile);
}

async function registryValue(key: string, view: '32' | '64'): Promise<string | undefined> {
  try {
    const result = await run('reg.exe', ['query', key, '/ve', '/reg:' + view], { windowsHide: true, timeout: 3000 });
    const value = /REG_SZ\s+([^\r\n]+)/.exec(result.stdout)?.[1]?.trim();
    if (!value) throw new Error('BROWSER_OBU_HOST_REGISTRY_UNREADABLE');
    return value;
  } catch (error) { if ((error as any).code !== 1) throw error; return undefined; }
}

async function removeOwner(root: string): Promise<void> {
  const file = path.join(obuManagedDirectory(root), 'core-owner.json');
  try {
    if (JSON.parse(await readFile(file, 'utf8')).pid === process.pid) await unlink(file);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

async function launchBrowser(root: string): Promise<OwnedBrowser> {
  const { getInstalledBrowsers, Browser } = await import('@puppeteer/browsers');
  const cacheDir = path.join(root, 'runtime', 'rdc', 'puppeteer-cache');
  const installed = (await getInstalledBrowsers({ cacheDir })).filter(b => b.browser === Browser.CHROME)
    .sort((a, b) => b.buildId.localeCompare(a.buildId, undefined, { numeric: true }));
  const executable = installed[0]?.executablePath;
  if (!executable) throw new Error('BROWSER_OBU_MANAGED_BROWSER_NOT_INSTALLED');
  const extension = path.join(root, 'extensions', 'agent-core-open-browser-use');
  await access(path.join(extension, 'manifest.json')); await access(executable);
  const profile = path.join(obuManagedDirectory(root), 'profile'); await mkdir(profile, { recursive: true });
  const child = spawn(executable, [`--user-data-dir=${profile}`, `--load-extension=${extension}`,
    `--disable-extensions-except=${extension}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-mode', '--disable-session-crashed-bubble', 'about:blank'],
  { cwd: root, shell: false, windowsHide: false, stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', () => reject(new Error('BROWSER_OBU_MANAGED_BROWSER_START_FAILED'))); });
  // Keep the handle alive: it identifies only this runtime's child, never an external user browser.
  return { alive: () => child.exitCode === null && child.signalCode === null,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
      child.kill();
      await Promise.race([closed, new Promise<void>(resolve => { const timer = setTimeout(resolve, 2000); timer.unref(); })]);
      if (child.exitCode === null && child.signalCode === null) throw new Error('BROWSER_OBU_MANAGED_BROWSER_STOP_UNKNOWN');
    } };
}
