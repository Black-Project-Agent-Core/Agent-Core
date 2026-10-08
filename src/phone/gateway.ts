import type { PhoneDisplayConfig, PhoneGatewayConfig } from './config.js';
import { base64ToBuffer, encodeScreenshot } from './image.js';
import { fetchWithPolicy, correlationSuffix } from '../net/outbound-request.js';
import { parseCallToolResultJson } from '../mcp/call-tool-result.js';
import { readJsonRpcHttpResponse } from '../mcp/streamable-http.js';
import { redactSensitiveString } from '../security/redaction.js';
import type {
  ForegroundApp,
  NamedAction,
  PhoneObservation,
  PhoneScreenshot,
  PhoneTransport,
  PhoneTransportStatus,
  ScreenshotOptions,
} from './types.js';

interface RpcEnvelope {
  result?: RpcToolResult;
  error?: unknown;
}

interface RpcToolResult {
  content?: Array<Record<string, unknown>>;
  structuredContent?: unknown;
  isError?: boolean;
  [key: string]: unknown;
}

const KEY_ALIASES: Record<string, 'back' | 'home'> = {
  '4': 'back',
  back: 'back',
  keycode_back: 'back',
  '3': 'home',
  home: 'home',
  keycode_home: 'home',
};

function truncate(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function toolErrorText(result: RpcToolResult): string {
  const first = result.content?.find((item) => item.type === 'text');
  return typeof first?.text === 'string' ? first.text : 'gateway tool error';
}

/** Android tools normally return JSON text, but MCP structuredContent is valid too. */
function firstJsonPayload(result: RpcToolResult): unknown {
  const parsed = parseCallToolResultJson(result);
  if (parsed !== null) return parsed;
  const textItem = result.content?.find((item) => item.type === 'text');
  return typeof textItem?.text === 'string' ? textItem.text : undefined;
}

function imageContent(result: RpcToolResult): { data: string; mimeType: string } | undefined {
  const image = result.content?.find((item) => item.type === 'image');
  if (image && typeof image.data === 'string') {
    return { data: image.data, mimeType: typeof image.mimeType === 'string' ? image.mimeType : 'image/png' };
  }
  return undefined;
}

export class GatewayTransport implements PhoneTransport {
  readonly kind = 'gateway' as const;

  constructor(
    private readonly config: PhoneGatewayConfig,
    private readonly deviceId: string,
    private readonly display: PhoneDisplayConfig,
  ) {}

  private async call(name: string, args: Record<string, unknown> = {}): Promise<RpcToolResult> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;
    const expectedId = 1;
    const signal = AbortSignal.timeout(30_000);
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: expectedId,
      method: 'tools/call',
      params: { name, arguments: { deviceId: this.deviceId, ...args } },
    });
    const response = await fetchWithPolicy(this.config.url, { method: 'POST', headers, body, signal }, {
      safety: 'non-idempotent',
      maxAttempts: 1,
      timeoutMs: 30_000,
    });
    let rpc: RpcEnvelope;
    try {
      rpc = await readJsonRpcHttpResponse(response, {
        expectedId, maxBytes: 32 * 1024 * 1024, maxFrameBytes: 32 * 1024 * 1024, signal,
      }) as RpcEnvelope;
    } catch (error) {
      const detail = response.ok ? (error instanceof Error ? error.message : 'MCP_RESPONSE_READ_FAILED') : `HTTP ${response.status}`;
      throw new Error(`gateway ${name} ${detail}${correlationSuffix(response)}`);
    }
    const result = rpc.result;
    if (!result) throw new Error(`gateway ${name} returned no result`);
    if (result.isError) throw new Error(`gateway ${name}: ${truncate(redactSensitiveString(toolErrorText(result)))}`);
    return result;
  }

  async status(): Promise<PhoneTransportStatus> {
    const base: PhoneTransportStatus = { kind: 'gateway', available: true, online: false, deviceId: this.deviceId };
    try {
      const result = await this.call('android_status');
      const payload = firstJsonPayload(result) as { online?: boolean } | undefined;
      return { ...base, online: Boolean(payload?.online), detail: (payload as Record<string, unknown>) ?? {} };
    } catch (error) {
      return { ...base, available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<PhoneScreenshot> {
    const result = await this.call('android_observe');
    const image = imageContent(result);
    if (!image) throw new Error('gateway android_observe returned no image');
    const encoded = await encodeScreenshot(base64ToBuffer(image.data), image.mimeType, options);
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

  async observe(options: ScreenshotOptions = {}): Promise<PhoneObservation> {
    const result = await this.call('android_observe');
    const image = imageContent(result);
    if (!image) throw new Error('gateway android_observe returned no image');
    const encoded = await encodeScreenshot(base64ToBuffer(image.data), image.mimeType, options);
    const meta = firstJsonPayload(result) as Record<string, unknown> | undefined;
    const pkg = typeof meta?.package === 'string' ? meta.package : (typeof meta?.foregroundPackage === 'string' ? meta.foregroundPackage : null);
    const activity = typeof meta?.activity === 'string' ? meta.activity : null;
    return {
      transport: this.kind,
      deviceId: this.deviceId,
      screenshot: {
        base64: encoded.base64,
        mimeType: encoded.mimeType,
        imageWidth: encoded.width,
        imageHeight: encoded.height,
        deviceWidth: encoded.sourceWidth || this.display.width,
        deviceHeight: encoded.sourceHeight || this.display.height,
        bytes: encoded.bytes,
      },
      foreground: { packageName: pkg, activity },
    };
  }

  async foregroundApp(): Promise<ForegroundApp> {
    const observation = await this.observe({ raw: true });
    return observation.foreground;
  }

  async tap(x: number, y: number): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_tap', { x, y }));
  }

  async swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_swipe', { x1, y1, x2, y2, durationMs }));
  }

  async longPress(x: number, y: number, durationMs: number): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_swipe', { x1: x, y1: y, x2: x, y2: y, durationMs }));
  }

  async inputText(text: string): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_input_text', { text }));
  }

  async key(keycode: string): Promise<Record<string, unknown>> {
    const alias = KEY_ALIASES[keycode.trim().toLowerCase()];
    if (alias === 'back') return this.back();
    if (alias === 'home') return this.home();
    throw new Error(`gateway transport supports only BACK/HOME keys; use adb transport for keyevent ${keycode}`);
  }

  async back(): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_back'));
  }

  async home(): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_home'));
  }

  async launchApp(packageName: string): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_launch_app', { packageName }));
  }

  async listNamedActions(): Promise<NamedAction[] | Record<string, unknown>> {
    return this.asRecord(await this.call('android_list_named_actions'));
  }

  async saveVerifiedAction(name: string, x: number, y: number): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_save_verified_action', { name, x, y }));
  }

  async runNamedAction(name: string): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_run_named_action', { name }));
  }

  async runMacro(actions: string[], delayMs: number): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_run_macro', { actions, delayMs }));
  }

  async setOverlay(enabled: boolean): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_set_overlay', { enabled }));
  }

  async clearMarkers(): Promise<Record<string, unknown>> {
    return this.asRecord(await this.call('android_clear_markers'));
  }

  private asRecord(result: RpcToolResult): Record<string, unknown> {
    const payload = firstJsonPayload(result);
    if (payload && typeof payload === 'object') return payload as Record<string, unknown>;
    return { ok: true, result: payload ?? null };
  }
}
