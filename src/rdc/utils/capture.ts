import { AsyncLocalStorage } from 'node:async_hooks';

const uiOrigin = new AsyncLocalStorage<boolean>();

export function runInUiOriginCallContext<T>(fn: () => T): T {
  return uiOrigin.run(true, fn);
}

export function isInsideUiOriginCall(): boolean {
  return uiOrigin.getStore() === true;
}

export function isTelemetryDisabledByEnv(): boolean {
  return true;
}

export function sanitizeError(error: any): { message: string; code?: string } {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : undefined;
  return { message, ...(code ? { code } : {}) };
}

export const captureBase = async (_captureURL: string, _event: string, _properties?: any) => {};
export const capture = async (_event: string, _properties?: any) => {};
export const capture_call_tool = capture;
export const capture_ui_event = capture;
export const captureRemote = capture;
