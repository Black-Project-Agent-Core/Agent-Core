export type PhoneTransportKind = 'gateway' | 'adb';

export interface PhoneTransportStatus {
  kind: PhoneTransportKind;
  /** Transport is configured and its prerequisites (binary / URL) are present. */
  available: boolean;
  /** Device is currently reachable and controllable through this transport. */
  online: boolean;
  deviceId: string;
  model?: string;
  detail?: Record<string, unknown>;
  error?: string;
}

export interface ScreenshotOptions {
  /** Longest edge width to downscale to for vision. 0 or undefined keeps native size. */
  maxWidth?: number;
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
  /** Return the original device-encoded image untouched (no resize/re-encode). */
  raw?: boolean;
}

export interface PhoneScreenshot {
  base64: string;
  mimeType: string;
  /** Encoded image pixel size (after any downscale). */
  imageWidth: number;
  imageHeight: number;
  /** Native device pixel size — tap/swipe coordinates are in this space. */
  deviceWidth: number;
  deviceHeight: number;
  bytes: number;
}

export interface ForegroundApp {
  packageName: string | null;
  activity: string | null;
  raw?: string;
}

export interface PhoneObservation {
  transport: PhoneTransportKind;
  deviceId: string;
  screenshot: PhoneScreenshot;
  foreground: ForegroundApp;
}

export interface NamedAction {
  name: string;
  x: number;
  y: number;
  verified: boolean;
  updatedAt: number;
}

export interface PhoneHealth {
  /** Live control readiness of the phone controller within this Agent Core process. */
  status: 'available' | 'unavailable' | 'disabled';
  enabled: boolean;
  mode: string;
  /** Transport actually probed for this health result (local adb by default). */
  transport: PhoneTransportKind | null;
  deviceId: string;
  deviceOnline: boolean;
  model?: string;
  reason?: string;
  gatewayUrl: string;
  adbBinary: string;
}

export interface PhoneTransport {
  readonly kind: PhoneTransportKind;
  status(): Promise<PhoneTransportStatus>;
  screenshot(options?: ScreenshotOptions): Promise<PhoneScreenshot>;
  observe(options?: ScreenshotOptions): Promise<PhoneObservation>;
  tap(x: number, y: number): Promise<Record<string, unknown>>;
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): Promise<Record<string, unknown>>;
  longPress(x: number, y: number, durationMs: number): Promise<Record<string, unknown>>;
  inputText(text: string): Promise<Record<string, unknown>>;
  key(keycode: string): Promise<Record<string, unknown>>;
  back(): Promise<Record<string, unknown>>;
  home(): Promise<Record<string, unknown>>;
  launchApp(packageName: string, activity?: string): Promise<Record<string, unknown>>;
  foregroundApp(): Promise<ForegroundApp>;
  listNamedActions(): Promise<NamedAction[] | Record<string, unknown>>;
  saveVerifiedAction(name: string, x: number, y: number): Promise<Record<string, unknown>>;
  runNamedAction(name: string): Promise<Record<string, unknown>>;
  runMacro(actions: string[], delayMs: number): Promise<Record<string, unknown>>;
}
