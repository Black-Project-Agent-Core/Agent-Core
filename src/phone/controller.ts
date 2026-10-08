import type { PhoneConfig, PhoneTransportMode } from './config.js';
import { AdbTransport } from './adb.js';
import { GatewayTransport } from './gateway.js';
import { GameModeService } from './game-mode-service.js';
import { NamedActionStore } from './named-actions.js';
import { screenDifference } from './image.js';
import type {
  NamedAction,
  PhoneCropRegion,
  PhoneHealth,
  PhoneObservation,
  PhoneScreenshot,
  PhoneSequenceStep,
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
  display: { width: number; height: number; orientation: 'portrait' | 'landscape' | 'square'; source: 'configured' | 'observed' };
  operationMetrics: Record<string, { calls: number; failures: number; lastMs: number; meanMs: number; p90Ms: number }>;
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
  readonly gameMode: GameModeService;
  private resolveCache?: { transport: PhoneTransport; at: number };
  private lastDisplay: { width: number; height: number };
  private hasObservedDisplay = false;
  private readonly operationSamples = new Map<string, { durations: number[]; calls: number; failures: number }>();

  constructor(private readonly config: PhoneConfig) {
    this.lastDisplay = { ...config.display };
    this.gateway = new GatewayTransport(config.gateway, config.deviceId, config.display);
    this.adb = new AdbTransport(
      config.adb,
      config.deviceId,
      config.display,
      new NamedActionStore(config.dataDir, config.deviceId),
    );
    this.gameMode = new GameModeService(config.dataDir);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  private captureDuration(kind: PhoneTransportKind, operation: string, durationMs: number, failed: boolean): void {
    const key = kind + ':' + operation;
    const metric = this.operationSamples.get(key) ?? { durations: [], calls: 0, failures: 0 };
    metric.calls += 1;
    if (failed) metric.failures += 1;
    metric.durations.push(durationMs);
    if (metric.durations.length > 32) metric.durations.shift();
    this.operationSamples.set(key, metric);
  }

  private operationMetrics() {
    return Object.fromEntries([...this.operationSamples.entries()].map(([key, value]) => {
      const sorted = [...value.durations].sort((a, b) => a - b);
      const mean = value.durations.reduce((sum, n) => sum + n, 0) / Math.max(1, value.durations.length);
      return [key, {
        calls: value.calls, failures: value.failures,
        lastMs: value.durations[value.durations.length - 1] ?? 0,
        meanMs: Math.round(mean),
        p90Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] ?? 0,
      }];
    }));
  }

  private async timed<T>(transport: PhoneTransport, operation: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      const result = await fn();
      this.captureDuration(transport.kind, operation, Date.now() - started, false);
      return result;
    } catch (error) {
      this.captureDuration(transport.kind, operation, Date.now() - started, true);
      throw error;
    }
  }

  private async safeRead<T>(
    operation: string,
    override: PhoneTransportMode | undefined,
    fn: (transport: PhoneTransport) => Promise<T>,
  ): Promise<T> {
    const primary = await this.resolve(override);
    try {
      return await this.timed(primary, operation, () => fn(primary));
    } catch (originalError) {
      if ((override ?? this.config.mode) !== 'auto') throw originalError;
      // Read-only retry only. Unknown-result actions are never replayed across transports.
      const alternate = primary.kind === 'adb' ? this.gateway : this.adb;
      const status = await alternate.status().catch(() => null);
      if (!status?.online) throw originalError;
      this.resolveCache = { transport: alternate, at: Date.now() };
      return this.timed(alternate, operation, () => fn(alternate));
    }
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

  private rememberDisplay(screenshot: PhoneScreenshot): void {
    if (screenshot.deviceWidth > 0 && screenshot.deviceHeight > 0) {
      this.lastDisplay = { width: screenshot.deviceWidth, height: screenshot.deviceHeight };
      this.hasObservedDisplay = true;
    }
  }

  private displayOrientation(): 'portrait' | 'landscape' | 'square' {
    if (this.lastDisplay.width === this.lastDisplay.height) return 'square';
    return this.lastDisplay.width > this.lastDisplay.height ? 'landscape' : 'portrait';
  }

  private device(coord: Coordinate): { x: number; y: number } {
    if (!Number.isFinite(coord.x) || !Number.isFinite(coord.y)) throw new Error('PHONE_COORDINATE_INVALID');
    if (!coord.normalized) return { x: Math.round(coord.x), y: Math.round(coord.y) };
    if (coord.x < 0 || coord.x > 1 || coord.y < 0 || coord.y > 1) {
      throw new Error('PHONE_NORMALIZED_COORDINATE_OUT_OF_RANGE');
    }
    return {
      x: Math.min(this.lastDisplay.width - 1, Math.round(coord.x * this.lastDisplay.width)),
      y: Math.min(this.lastDisplay.height - 1, Math.round(coord.y * this.lastDisplay.height)),
    };
  }

  async status(): Promise<PhoneStatusReport> {
    const [gateway, adb] = await Promise.all([this.gateway.status(), this.adb.status()]);
    let activeTransport: PhoneTransportKind | null = null;
    if (this.config.mode === 'gateway') activeTransport = 'gateway';
    else if (this.config.mode === 'adb') activeTransport = 'adb';
    else activeTransport = adb.online ? 'adb' : (gateway.online ? 'gateway' : null);
    return {
      enabled: this.config.enabled,
      configuredMode: this.config.mode,
      deviceId: this.config.deviceId,
      activeTransport,
      gateway: { ...gateway, url: this.config.gateway.url },
      adb: { ...adb, binaryPath: this.config.adb.binaryPath },
      display: {
        ...this.lastDisplay,
        orientation: this.displayOrientation(),
        source: this.hasObservedDisplay ? 'observed' : 'configured',
      },
      operationMetrics: this.operationMetrics(),
    };
  }

  async observe(options: ScreenshotOptions, override?: PhoneTransportMode): Promise<PhoneObservation> {
    const observation = await this.safeRead('observe', override, transport => transport.observe(options));
    this.rememberDisplay(observation.screenshot);
    return observation;
  }

  async screenshot(options: ScreenshotOptions, override?: PhoneTransportMode): Promise<PhoneScreenshot> {
    const screenshot = await this.safeRead('screenshot', override, transport => transport.screenshot(options));
    this.rememberDisplay(screenshot);
    return screenshot;
  }

  async structuredContext(packageName?: string, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    const transport = await this.resolve(override);
    const foreground = await transport.foregroundApp();
    if (transport.kind !== 'adb') {
      return {
        transport: transport.kind,
        foreground,
        hierarchy: { available: false, reason: 'adb-required' },
        telemetry: { available: false, reason: 'adb-required' },
      };
    }
    const [hierarchy, telemetry] = await Promise.all([
      this.adb.uiHierarchy().catch((error) => ({ available: false, error: error instanceof Error ? error.message : String(error) })),
      this.adb.deviceTelemetry(packageName ?? foreground.packageName ?? undefined)
        .catch((error) => ({ available: false, error: error instanceof Error ? error.message : String(error) })),
    ]);
    return { transport: 'adb', foreground, hierarchy, telemetry };
  }

  async recordScreen(durationSeconds: number, localPath: string, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    const transport = await this.resolve(override);
    if (transport.kind !== 'adb') throw new Error('GAME_MODE_SCREEN_RECORD_REQUIRES_ADB');
    return this.adb.recordScreen(durationSeconds, localPath);
  }

  async tap(coord: Coordinate, override?: PhoneTransportMode): Promise<Record<string, unknown>> {
    const { x, y } = this.device(coord);
    const transport = await this.resolve(override);
    return this.timed(transport, 'tap', () => transport.tap(x, y));
  }

  async swipe(
    from: Coordinate,
    to: Coordinate,
    durationMs: number,
    override?: PhoneTransportMode,
  ): Promise<Record<string, unknown>> {
    const a = this.device(from);
    const b = this.device(to);
    const transport = await this.resolve(override);
    return this.timed(transport, 'swipe', () => transport.swipe(a.x, a.y, b.x, b.y, durationMs));
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

  private async waitForStable(
    transport: PhoneTransport,
    options: { timeoutMs?: number; intervalMs?: number; threshold?: number; stableSamples?: number },
  ): Promise<Record<string, unknown>> {
    const timeoutMs = Math.max(500, Math.min(30_000, options.timeoutMs ?? 8_000));
    const intervalMs = Math.max(100, Math.min(2_000, options.intervalMs ?? 300));
    const threshold = Math.max(0.001, Math.min(0.25, options.threshold ?? 0.02));
    const stableSamples = Math.max(1, Math.min(6, options.stableSamples ?? 2));
    const started = Date.now();

    let previous = await transport.screenshot({ maxWidth: 320, format: 'jpeg', quality: 40 });
    this.rememberDisplay(previous);
    let stableCount = 0;
    let samples = 1;
    let lastDifference = 1;
    let maximumDifference = 0;

    while (Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      const current = await transport.screenshot({ maxWidth: 320, format: 'jpeg', quality: 40 });
      this.rememberDisplay(current);
      lastDifference = await screenDifference(
        Buffer.from(previous.base64, 'base64'),
        Buffer.from(current.base64, 'base64'),
      );
      maximumDifference = Math.max(maximumDifference, lastDifference);
      samples += 1;
      stableCount = lastDifference <= threshold ? stableCount + 1 : 0;
      if (stableCount >= stableSamples) {
        return {
          stable: true,
          samples,
          threshold,
          lastDifference,
          maximumDifference,
          durationMs: Date.now() - started,
        };
      }
      previous = current;
    }

    throw new Error(
      'PHONE_SCREEN_STABILITY_TIMEOUT:lastDifference=' + lastDifference.toFixed(4)
      + ':threshold=' + threshold.toFixed(4),
    );
  }

  private async waitForRegion(
    transport: PhoneTransport,
    region: PhoneCropRegion,
    mode: 'stable' | 'change',
    options: { timeoutMs?: number; intervalMs?: number; threshold?: number; stableSamples?: number },
  ): Promise<Record<string, unknown>> {
    const timeoutMs = Math.max(500, Math.min(30_000, options.timeoutMs ?? 8_000));
    const intervalMs = Math.max(100, Math.min(2_000, options.intervalMs ?? 250));
    const threshold = Math.max(0.001, Math.min(0.25, options.threshold ?? 0.03));
    const stableSamples = Math.max(1, Math.min(6, options.stableSamples ?? 2));
    const started = Date.now();
    let previous = await transport.screenshot({ crop: region, maxWidth: 320, format: 'jpeg', quality: 45 });
    const baseline = previous;
    let stableCount = 0;
    let samples = 1;
    let lastDifference = 0;
    while (Date.now() - started < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      const current = await transport.screenshot({ crop: region, maxWidth: 320, format: 'jpeg', quality: 45 });
      lastDifference = await screenDifference(
        Buffer.from((mode === 'change' ? baseline : previous).base64, 'base64'),
        Buffer.from(current.base64, 'base64'),
      );
      samples += 1;
      if (mode === 'change' && lastDifference >= threshold) return { changed: true, samples, lastDifference, threshold, durationMs: Date.now() - started };
      if (mode === 'stable') {
        stableCount = lastDifference <= threshold ? stableCount + 1 : 0;
        if (stableCount >= stableSamples) return { stable: true, samples, lastDifference, threshold, durationMs: Date.now() - started };
      }
      previous = current;
    }
    throw new Error('PHONE_REGION_' + mode.toUpperCase() + '_TIMEOUT:difference=' + lastDifference.toFixed(4));
  }

  private async waitForForeground(transport: PhoneTransport, packageName: string, timeoutMs = 8_000, intervalMs = 250) {
    const started = Date.now();
    while (Date.now() - started < Math.max(500, Math.min(30_000, timeoutMs))) {
      const foreground = await transport.foregroundApp();
      if (foreground.packageName === packageName) return { matched: true, foreground, durationMs: Date.now() - started };
      await new Promise(resolve => setTimeout(resolve, Math.max(100, Math.min(2_000, intervalMs))));
    }
    throw new Error('PHONE_FOREGROUND_TIMEOUT:' + packageName);
  }

  async runSequence(steps: PhoneSequenceStep[], override?: PhoneTransportMode, expectedPackage?: string): Promise<Record<string, unknown>> {
    const estimatedMs = steps.reduce((total, step) => {
      if (step.action === 'wait') return total + step.durationMs;
      if (step.action === 'waitStable') return total + (step.timeoutMs ?? 8_000);
      if (step.action === 'waitRegionStable' || step.action === 'waitRegionChange' || step.action === 'waitForeground') {
        return total + (step.timeoutMs ?? 8_000);
      }
      if (step.action === 'swipe' || step.action === 'longPress') return total + (step.durationMs ?? 300);
      return total;
    }, 0);
    if (estimatedMs > 120_000) throw new Error('PHONE_SEQUENCE_DURATION_LIMIT');

    const transport = await this.resolve(override);
    const started = Date.now();
    const completed: Array<{ index: number; action: PhoneSequenceStep['action'] }> = [];
    const checkpoints: Array<Record<string, unknown>> = [];
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]!;
      try {
        const passive = new Set(['wait', 'waitStable', 'waitRegionStable', 'waitRegionChange', 'waitForeground', 'observeCheckpoint']);
        if (expectedPackage && !passive.has(step.action)) {
          const foreground = await transport.foregroundApp();
          if (foreground.packageName !== expectedPackage) {
            throw new Error('PHONE_APP_GUARD_MISMATCH:expected=' + expectedPackage + ':actual=' + (foreground.packageName ?? 'unknown'));
          }
        }
        if (step.action === 'tap') {
          const point = this.device(step);
          await transport.tap(point.x, point.y);
        } else if (step.action === 'swipe') {
          const from = this.device({ x: step.x1, y: step.y1, normalized: step.normalized });
          const to = this.device({ x: step.x2, y: step.y2, normalized: step.normalized });
          await transport.swipe(from.x, from.y, to.x, to.y, step.durationMs ?? 300);
        } else if (step.action === 'longPress') {
          const point = this.device(step);
          await transport.longPress(point.x, point.y, step.durationMs ?? 700);
        } else if (step.action === 'inputText') {
          await transport.inputText(step.text);
        } else if (step.action === 'key') {
          await transport.key(step.keycode);
        } else if (step.action === 'back') {
          await transport.back();
        } else if (step.action === 'home') {
          await transport.home();
        } else if (step.action === 'launchApp') {
          await transport.launchApp(step.packageName, step.activity);
        } else if (step.action === 'namedAction') {
          await transport.runNamedAction(step.name);
        } else if (step.action === 'waitStable') {
          await this.waitForStable(transport, step);
        } else if (step.action === 'waitRegionStable') {
          await this.waitForRegion(transport, step.region, 'stable', step);
        } else if (step.action === 'waitRegionChange') {
          await this.waitForRegion(transport, step.region, 'change', step);
        } else if (step.action === 'waitForeground') {
          await this.waitForForeground(transport, step.packageName, step.timeoutMs, step.intervalMs);
        } else if (step.action === 'observeCheckpoint') {
          const observation = await transport.observe({ maxWidth: step.maxWidth ?? 480, format: 'jpeg', quality: 50 });
          this.rememberDisplay(observation.screenshot);
          checkpoints.push({
            label: step.label ?? 'checkpoint-' + (index + 1),
            at: new Date().toISOString(),
            foreground: observation.foreground,
            deviceWidth: observation.screenshot.deviceWidth,
            deviceHeight: observation.screenshot.deviceHeight,
            bytes: observation.screenshot.bytes,
          });
        } else if (step.action === 'setOverlay') {
          if (transport.kind !== 'gateway') throw new Error('PHONE_OVERLAY_REQUIRES_GATEWAY');
          await this.gateway.setOverlay(step.enabled);
        } else if (step.action === 'clearMarkers') {
          if (transport.kind !== 'gateway') throw new Error('PHONE_OVERLAY_REQUIRES_GATEWAY');
          await this.gateway.clearMarkers();
        } else {
          await new Promise((resolve) => setTimeout(resolve, step.durationMs));
        }
        completed.push({ index: index + 1, action: step.action });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error('PHONE_SEQUENCE_STEP_FAILED:' + (index + 1) + ':' + step.action + ':' + message);
      }
    }
    return {
      ok: true,
      action: 'runSequence',
      transport: transport.kind,
      completed,
      checkpoints,
      expectedPackage: expectedPackage ?? null,
      durationMs: Date.now() - started,
    };
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
