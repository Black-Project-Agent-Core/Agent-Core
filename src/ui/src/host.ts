export type DesktopStatus = {
  overall: 'online' | 'degraded' | 'offline';
  connection: 'on' | 'off';
  memory: 'not-used' | 'available' | 'degraded' | 'error';
  tunnel: 'on' | 'off';
  execution: 'available' | 'unavailable';
  gameMode: 'on' | 'off';
  autostart: boolean;
  root: string;
};

export type ProviderServerSnapshot = {
  id: string;
  observedVersion?: string;
  compatibility?: string;
};

export type DesktopHealthSnapshot = {
  memory: {
    status: string;
    canonicalStore?: string;
    noteCount: number;
    issueCount: number;
    index?: string;
    embedding?: string;
    intelligence?: string;
  };
  execution: { status: string; mode?: string };
  phone: {
    status: string;
    mode?: string;
    transport?: string;
    deviceOnline: boolean;
    deviceId?: string;
  };
  codeIntelligence: {
    status: string;
    provider?: string;
    index?: string;
    daemon?: string;
    issueCount: number;
    issue?: string;
    isolationOk: boolean;
  };
  semanticIde: {
    status: string;
    issueCount: number;
    issue?: string;
    configuredServers: ProviderServerSnapshot[];
  };
  learning: {
    status: string;
    issueCount: number;
    sinkStatus: Array<{ name: string; available: boolean }>;
  };
  partner: {
    status: string;
    provider?: string;
    transport?: string;
    issueCount: number;
    issue?: string;
  };
};

export type DesktopSnapshot = {
  status: DesktopStatus;
  capturedAt: string;
  version: string;
  core: {
    pid?: number;
    uptimeSeconds?: number;
    workingSetBytes?: number;
    memoryCapacityBytes?: number;
    cpuPercent?: number;
    port: number;
    httpHealthy: boolean;
  };
  tunnel: { port: number; ready: boolean };
  paths: {
    root: string;
    memory: string;
    runtimeCache: string;
    logs: string;
  };
  health: DesktopHealthSnapshot;
};

export type ActivityEntry = {
  id: string;
  time: string;
  module: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'sys';
  message: string;
};

type HostEnvelope =
  | { type: 'status'; status: DesktopStatus }
  | { type: 'snapshot'; snapshot: DesktopSnapshot }
  | { type: 'log'; entry: ActivityEntry }
  | { type: 'logs'; entries: ActivityEntry[] }
  | { type: 'error'; message: string };

export type HostListener = (message: HostEnvelope) => void;

type WebViewBridge = {
  addEventListener(name: 'message', listener: (event: { data: HostEnvelope }) => void): void;
  removeEventListener(name: 'message', listener: (event: { data: HostEnvelope }) => void): void;
  postMessage(message: unknown): void;
};

const webview = (): WebViewBridge | undefined => (window as any).chrome?.webview;

export const postHost = (message: unknown) => webview()?.postMessage(message);

export function subscribeHost(listener: HostListener): () => void {
  const bridge = webview();
  if (!bridge) return () => undefined;
  const wrapped = (event: { data: HostEnvelope }) => listener(event.data);
  bridge.addEventListener('message', wrapped);
  return () => bridge.removeEventListener('message', wrapped);
}
