import type { PhoneConfig, PhoneTransportMode } from './config.js';
import { AdbTransport } from './adb.js';
import { GatewayTransport } from './gateway.js';
import { NamedActionStore } from './named-actions.js';
import type {
  NamedAction,
  PhoneHealth,
  PhoneObservation,
  PhoneScreenshot,
  PhoneTransport,
  PhoneTransportKind,
  PhoneTransportStatus,
  ScreenshotOptions,
} from './types.js';

const HEALTH_PROBE_TIMEOUT_MS = 4_000;

const RESOLVE_CACHE_MS = 8_000;

export interface PhoneStatusReport {
  enabled: boolean;
  configuredMode: PhoneTransportMode;
  deviceId: string;
  activeTransport: PhoneTransportKind | null;
  gateway: PhoneTransportStatus & { url: string };
  adb: PhoneTransportStatus & { binaryPath: string };
  display: { width: number; height: number };
}

export interface Coordinate {
  x: number;
  y: number;
  normalized?: boolean;
}

/**
 * Single control surface over the phone. Owns both transports and, in `auto` mode,
 * routes each call to the gateway when the on-device app is online and otherwise to
 * local ADB. No persistent connections are opened at construction time.
 */
export class PhoneController {
  private readonly gateway: GatewayTransport;
  private readonly adb: AdbTransport;
  private resolveCache?: { transport: PhoneTransport; at: number };

  constructor(private readonly config: PhoneConfig) {
    this.gateway = new GatewayTransport(config.gateway, config.deviceId, config.display);
    this.adb = new AdbTransport(
      config.adb,
      config.deviceId,
      config.display,
      new NamedActionStore(config.dataDir, config.deviceId),
    );
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  private transportFor(kind: PhoneTransportKind): PhoneTransport {
    return kind === 'gateway' ? this.gateway : this.adb;
  }

  /** Choose the transport for this call, honouring an explicit per-call override. */
  async resolve(override?: PhoneTransportMode): Promise<PhoneTransport> {
    const mode = override ?? this.config.mode;
    if (mode === 'gateway') return this.gateway;
    if (mode === 'adb') return this.adb;

    const now = Date.now();
    if (this.resolveCache && now - this.resolveCache.at < RESOLVE_CACHE_MS) return this.resolveCache.transport;

    // Prefer the local ADB path (USB/Wi-Fi, lowest latency) when reachable; otherwise
    // fall back to the online Cloudflare relay. Both are driven by this process.
    let chosen: PhoneTransport = this.adb;
    const adbStatus = await this.adb.status().catch(() => null);
    if (adbStatus?.online) {
      chosen = this.adb;
    } else {
      const gatewayStatus = await this.gateway.status().catch(() => null);
      if (gatewayStatus?.online) chosen = this.gateway;
    }
    this.resolveCache = { transport: chosen, at: now };
    return chosen;
  }

  private device(coord: Coordinate): { x: number; y: number } {
    if (!coord.normalized) return { x: Math.round(coord.x), y: Math.round(coord.y) };
    return {
      x: Math.round(coord.x * this.config.display.width),
      y: Math.round(coord.y * this.config.display.height),
    };
  }

  async status(): Promise<PhoneStatusReport> {
    const [gateway, adb] = await Promise.all([this.gateway.status(), this.adb.status()]);
    let activeTransport: PhoneTransportKind | null = null;
    if (this.config.mode === 'gateway') activeTransport = 'gateway';
    else if (this.config.mode === 'adb') activeTransport = 'adb';
    else activeTransport = gateway.online ? 'gateway' : (adb.online ? 'adb' : null);
    return {
      enabled: this.config.enabled,
      configuredMode: this.config.mode,
      deviceId: this.config.deviceId,
      activeTransport,
      gateway: { ...gateway, url: this.config.gateway.url },
      adb: { ...adb, binaryPath: this.config.adb.binaryPath },
      display: { ...this.config.display },
    };
  }

  async observe(options: ScreenshotOptions, override?: PhoneTransportMode): Promise<PhoneObservation> {
    return (await this.resolve(override)).observe(options);
  }

  async screenshot(options: ScreenshotOptions, override?: PhoneTransportMode): Promise<PhoneScreenshot> {
    return (await this.resolve(override)).screenshot(options);
  }

  async tap(coord: Coordinate, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    const { x, y } = this.device(coord);
    return (await this.resolve(override)).tap(x, y);
  }

  async swipe(
    from: Coordinate,
    to: Coordinate,
    durationMs: number,
    override?: PhoneTransportMode,
  ): Promise<Record<string, unknown>> {
    const a = this.device(from);
    const b = this.device(to);
    return (await this.resolve(override)).swipe(a.x, a.y, b.x, b.y, durationMs);
  }

  async longPress(coord: Coordinate, durationMs: number, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    const { x, y } = this.device(coord);
    return (await this.resolve(override)).longPress(x, y, durationMs);
  }

  async inputText(text: string, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    return (await this.resolve(override)).inputText(text);
  }

  async key(keycode: string, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    return (await this.resolve(override)).key(keycode);
  }

  async back(override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    return (await this.resolve(override)).back();
  }

  async home(override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    return (await this.resolve(override)).home();
  }

  async launchApp(packageName: string, activity: string | undefined, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    return (await this.resolve(override)).launchApp(packageName, activity);
  }

  async listNamedActions(override?: PhoneTransportMode): Promise<NamedAction[] | Record<string, unknown>> {
    return (await this.resolve(override)).listNamedActions();
  }

  async saveVerifiedAction(name: string, coord: Coordinate, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    const { x, y } = this.device(coord);
    return (await this.resolve(override)).saveVerifiedAction(name, x, y);
  }

  async runNamedAction(name: string, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    return (await this.resolve(override)).runNamedAction(name);
  }

  async runMacro(actions: string[], delayMs: number, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    return (await this.resolve(override)).runMacro(actions, delayMs);
  }

  /** Lightweight static descriptor for /health without probing the device. */
  describe(): Record<string, unknown> {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      deviceId: this.config.deviceId,
      gatewayUrl: this.config.gateway.url,
      adbBinary: this.config.adb.binaryPath,
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('phone health probe timed out')), ms);
        timer.unref?.();
      }),
    ]);
  }

  private async probeKind(kind: PhoneTransportKind): Promise<PhoneTransportStatus> {
    try {
      return await this.withTimeout(this.transportFor(kind).status(), HEALTH_PROBE_TIMEOUT_MS);
    } catch (error) {
      return {
        kind,
        available: false,
        online: false,
        deviceId: this.config.deviceId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Live control readiness of the phone controller, for the Agent Core /health
   * surface and the launcher "Game Mode" indicator. Reports ON if the phone can be
   * controlled through ANY Agent-Core-driven transport (local ADB or the online
   * relay). It is always driven by this process, so it goes off when Agent Core dies.
   */
  async health(): Promise<PhoneHealth> {
    const base = {
      enabled: this.config.enabled,
      mode: this.config.mode,
      deviceId: this.config.deviceId,
      gatewayUrl: this.config.gateway.url,
      adbBinary: this.config.adb.binaryPath,
    };
    if (!this.config.enabled) {
      return { ...base, status: 'disabled', transport: null, deviceOnline: false };
    }

    const order: PhoneTransportKind[] = this.config.mode === 'gateway'
      ? ['gateway']
      : this.config.mode === 'adb'
        ? ['adb']
        : ['adb', 'gateway']; // auto: local first, then online relay

    let lastReason: string | undefined;
    for (const kind of order) {
      const status = await this.probeKind(kind);
      if (status.online) {
        return {
          ...base,
          status: 'available',
          transport: kind,
          deviceOnline: true,
          ...(status.model ? { model: status.model } : {}),
        };
      }
      if (status.error) lastReason = status.error;
    }
    return {
      ...base,
      status: 'unavailable',
      transport: order[0],
      deviceOnline: false,
      ...(lastReason ? { reason: lastReason } : {}),
    };
  }
}
