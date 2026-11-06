import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { PhoneAdbConfig, PhoneDisplayConfig } from './config.js';
import { encodeScreenshot } from './image.js';
import { buildMachineShellEnv } from '../security/environment.js';
import type { NamedActionStore } from './named-actions.js';
import type {
  ForegroundApp,
  NamedAction,
  PhoneObservation,
  PhoneScreenshot,
  PhoneTransport,
  PhoneTransportStatus,
  ScreenshotOptions,
} from './types.js';

const SCREENCAP_MAX_BUFFER = 64 * 1024 * 1024;

interface ExecResult {
  stdout: Buffer;
  stderr: string;
}

/**
 * Escape a string for Android's `input text`, which is re-parsed by the device shell.
 * Spaces become %s and shell metacharacters are backslash-escaped. ASCII only —
 * `input text` cannot type arbitrary Unicode; use the gateway/device app for that.
 */
function escapeInputText(text: string): string {
  return text
    .replace(/([\\"'`$&|;<>()*?~#\s])/g, (char) => (char === ' ' ? '%s' : `\\${char}`));
}

export class AdbTransport implements PhoneTransport {
  readonly kind = 'adb' as const;

  constructor(
    private readonly config: PhoneAdbConfig,
    private readonly deviceId: string,
    private readonly display: PhoneDisplayConfig,
    private readonly actions: NamedActionStore,
  ) {}

  private targetArgs(): string[] {
    return this.config.serial ? ['-s', this.config.serial] : [];
  }

  private exec(args: string[], binary = false, timeoutMs = 20_000): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      execFile(
        this.config.binaryPath,
        args,
        { encoding: binary ? 'buffer' : 'utf8', maxBuffer: SCREENCAP_MAX_BUFFER, windowsHide: true, timeout: timeoutMs,
          env: buildMachineShellEnv(this.config.homeDir ? { ANDROID_USER_HOME: this.config.homeDir } : {}, { ...process.env }) }, 
        (error, stdout, stderr) => {
          if (error) {
            const detail = (typeof stderr === 'string' ? stderr : stderr?.toString('utf8')) || error.message;
            reject(new Error(`adb ${args.join(' ')} failed: ${detail.trim()}`));
            return;
          }
          resolve({
            stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout),
            stderr: typeof stderr === 'string' ? stderr : (stderr as Buffer).toString('utf8'),
          });
        },
      );
    });
  }

  private async shell(command: string[], binary = false): Promise<ExecResult> {
    return this.exec([...this.targetArgs(), 'shell', ...command], binary);
  }

  private async shellText(command: string[]): Promise<string> {
    const { stdout } = await this.shell(command);
    return stdout.toString('utf8').trim();
  }

  async status(): Promise<PhoneTransportStatus> {
    const base: PhoneTransportStatus = { kind: 'adb', available: true, online: false, deviceId: this.deviceId };
    let listing: string;
    try {
      const { stdout } = await this.exec(['devices', '-l']);
      listing = stdout.toString('utf8');
    } catch (error) {
      return { ...base, available: false, error: error instanceof Error ? error.message : String(error) };
    }
    const lines = listing.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean);
    const entries = lines.map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial, state };
    });
    const match = this.config.serial
      ? entries.find((entry) => entry.serial === this.config.serial)
      : entries.find((entry) => entry.state === 'device') ?? entries[0];
    if (!match) return { ...base, online: false, detail: { attached: entries } };
    const online = match.state === 'device';
    let model: string | undefined;
    if (online) {
      try {
        model = await this.shellText(['getprop', 'ro.product.model']);
      } catch {
        model = undefined;
      }
    }
    return {
      ...base,
      online,
      ...(model ? { model } : {}),
      detail: { serial: match.serial, state: match.state, attached: entries },
    };
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<PhoneScreenshot> {
    // Use exec-out (not shell) so the raw PNG stream is not mangled by PTY CRLF translation.
    const { stdout } = await this.exec([...this.targetArgs(), 'exec-out', 'screencap', '-p'], true);
    if (stdout.length === 0) throw new Error('adb screencap returned no data');
    const encoded = await encodeScreenshot(stdout, 'image/png', options);
    return {
      base64: encoded.base64,
      mimeType: encoded.mimeType,
      imageWidth: encoded.width,
      imageHeight: encoded.height,
      deviceWidth: encoded.sourceWidth || this.display.width,
      deviceHeight: encoded.sourceHeight || this.display.height,
      bytes: encoded.bytes,
    };
  }

  async foregroundApp(): Promise<ForegroundApp> {
    let raw = '';
    try {
      raw = await this.shellText(['dumpsys', 'activity', 'activities']);
    } catch {
      raw = '';
    }
    const line = raw.split(/\r?\n/).find((entry) => /topResumedActivity=|mResumedActivity=|ResumedActivity:/.test(entry));
    const match = line?.match(/\s([A-Za-z0-9_.]+)\/([A-Za-z0-9_.$]+)/);
    if (match) return { packageName: match[1], activity: match[2], raw: line?.trim() };
    // Fallback via window focus.
    try {
      const focus = await this.shellText(['dumpsys', 'window']);
      const focusLine = focus.split(/\r?\n/).find((entry) => /mCurrentFocus=/.test(entry));
      const focusMatch = focusLine?.match(/\s([A-Za-z0-9_.]+)\/([A-Za-z0-9_.$]+)/);
      if (focusMatch) return { packageName: focusMatch[1], activity: focusMatch[2], raw: focusLine?.trim() };
    } catch {
      // ignore
    }
    return { packageName: null, activity: null };
  }

  async observe(options: ScreenshotOptions = {}): Promise<PhoneObservation> {
    const [screenshot, foreground] = await Promise.all([this.screenshot(options), this.foregroundApp()]);
    return { transport: this.kind, deviceId: this.deviceId, screenshot, foreground };
  }

  async tap(x: number, y: number): Promise<Record<string, unknown>> {
    await this.shell(['input', 'tap', String(x), String(y)]);
    return { ok: true, action: 'tap', x, y };
  }

  async swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): Promise<Record<string, unknown>> {
    await this.shell(['input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(durationMs)]);
    return { ok: true, action: 'swipe', x1, y1, x2, y2, durationMs };
  }

  async longPress(x: number, y: number, durationMs: number): Promise<Record<string, unknown>> {
    await this.shell(['input', 'swipe', String(x), String(y), String(x), String(y), String(durationMs)]);
    return { ok: true, action: 'longPress', x, y, durationMs };
  }

  async inputText(text: string): Promise<Record<string, unknown>> {
    await this.shell(['input', 'text', escapeInputText(text)]);
    return { ok: true, action: 'inputText', length: text.length };
  }

  async key(keycode: string): Promise<Record<string, unknown>> {
    await this.shell(['input', 'keyevent', keycode]);
    return { ok: true, action: 'key', keycode };
  }

  async back(): Promise<Record<string, unknown>> {
    return this.key('KEYCODE_BACK');
  }

  async home(): Promise<Record<string, unknown>> {
    return this.key('KEYCODE_HOME');
  }

  async launchApp(packageName: string, activity?: string): Promise<Record<string, unknown>> {
    if (activity) {
      const component = activity.includes('/') ? activity : `${packageName}/${activity}`;
      const { stdout } = await this.shell(['am', 'start', '-n', component]);
      return { ok: true, action: 'launchApp', packageName, activity, output: stdout.toString('utf8').trim() };
    }
    const { stdout } = await this.shell(['monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
    return { ok: true, action: 'launchApp', packageName, output: stdout.toString('utf8').trim() };
  }

  async uiHierarchy(maxNodes = 120): Promise<Record<string, unknown>> {
    const remote = '/sdcard/agent_core_ui_' + Date.now() + '_' + randomBytes(3).toString('hex') + '.xml';
    let xml = '';
    try {
      await this.shell(['uiautomator', 'dump', '--compressed', remote]);
      xml = await this.shellText(['cat', remote]);
    } finally {
      await this.shell(['rm', '-f', remote]).catch(() => undefined);
    }
    const nodes: Array<Record<string, string>> = [];
    const nodePattern = /<node\s+([^>]+?)\/?>(?:<\/node>)?/g;
    const attrPattern = /([A-Za-z0-9_-]+)="([^"]*)"/g;
    for (const match of xml.matchAll(nodePattern)) {
      const attrs: Record<string, string> = {};
      for (const attr of match[1]!.matchAll(attrPattern)) attrs[attr[1]!] = attr[2]!;
      if (attrs.password === 'true') {
        delete attrs.text;
        delete attrs['content-desc'];
      }
      if (attrs.text || attrs['content-desc'] || attrs['resource-id'] || attrs.clickable === 'true') nodes.push(attrs);
      if (nodes.length >= Math.max(1, Math.min(300, maxNodes))) break;
    }
    return { available: true, nodes, nodeCount: nodes.length, xmlBytes: Buffer.byteLength(xml) };
  }

  async deviceTelemetry(packageName?: string): Promise<Record<string, unknown>> {
    const [battery, display, android, thermal, pkg] = await Promise.all([
      this.shellText(['dumpsys', 'battery']).catch(() => ''),
      this.shellText(['wm', 'size']).catch(() => ''),
      this.shellText(['getprop', 'ro.build.version.release']).catch(() => ''),
      this.shellText(['dumpsys', 'thermalservice']).catch(() => ''),
      packageName ? this.shellText(['dumpsys', 'package', packageName]).catch(() => '') : Promise.resolve(''),
    ]);
    const batteryLevel = battery.match(/level:\s*(\d+)/)?.[1];
    const status = battery.match(/status:\s*(\d+)/)?.[1];
    const size = display.match(/Physical size:\s*(\d+)x(\d+)/);
    const versionName = pkg.match(/versionName=([^\s]+)/)?.[1];
    const versionCode = pkg.match(/versionCode=(\d+)/)?.[1];
    return {
      androidVersion: android || null,
      display: size ? { width: Number(size[1]), height: Number(size[2]) } : null,
      battery: { level: batteryLevel ? Number(batteryLevel) : null, status: status ? Number(status) : null },
      thermalPreview: thermal.split(/\r?\n/).filter(Boolean).slice(0, 12),
      package: packageName ? { name: packageName, versionName: versionName ?? null, versionCode: versionCode ?? null } : null,
    };
  }

  async recordScreen(durationSeconds: number, localPath: string): Promise<Record<string, unknown>> {
    const seconds = Math.max(1, Math.min(30, Math.round(durationSeconds)));
    const remote = '/sdcard/agent_core_game_' + Date.now() + '.mp4';
    try {
      await this.exec([...this.targetArgs(), 'shell', 'screenrecord', '--time-limit', String(seconds), remote], false, (seconds + 8) * 1000);
      await this.exec([...this.targetArgs(), 'pull', remote, localPath], false, 60_000);
      return { ok: true, durationSeconds: seconds, localPath };
    } finally {
      await this.shell(['rm', '-f', remote]).catch(() => undefined);
    }
  }

  async listNamedActions(): Promise<NamedAction[]> {
    return this.actions.list();
  }

  async saveVerifiedAction(name: string, x: number, y: number): Promise<Record<string, unknown>> {
    const action = await this.actions.put(name, x, y, true);
    return { ok: true, action: 'saveVerifiedAction', saved: action };
  }

  async runNamedAction(name: string): Promise<Record<string, unknown>> {
    const action = await this.actions.get(name);
    if (!action) throw new Error(`named action not found: ${name}`);
    await this.tap(action.x, action.y);
    return { ok: true, action: 'runNamedAction', name, x: action.x, y: action.y };
  }

  async runMacro(actions: string[], delayMs: number): Promise<Record<string, unknown>> {
    const store = await this.actions.list();
    const byName = new Map(store.map((entry) => [entry.name, entry]));
    const missing = actions.filter((name) => !byName.has(name));
    if (missing.length) throw new Error(`named actions not found: ${missing.join(', ')}`);
    const ran: string[] = [];
    for (const name of actions) {
      const action = byName.get(name)!;
      await this.tap(action.x, action.y);
      ran.push(name);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return { ok: true, action: 'runMacro', ran, delayMs };
  }
}
