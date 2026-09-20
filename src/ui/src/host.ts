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

export type ActivityEntry = {
  id: string;
  time: string;
  module: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'sys';
  message: string;
};

type HostEnvelope =
  | { type: 'status'; status: DesktopStatus }
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
