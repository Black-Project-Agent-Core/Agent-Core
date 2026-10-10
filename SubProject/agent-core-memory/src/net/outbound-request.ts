import { normalizeFailureFamily } from '../failure-evidence.js';
import { redactSensitiveString } from '../security/redaction.js';

export type OutboundSafety = 'safe' | 'idempotent' | 'non-idempotent';

export interface OutboundAttemptEvent {
  attempt: number;
  maxAttempts: number;
  safety: OutboundSafety;
  target: string;
  outcome: 'response' | 'error';
  retry: boolean;
  status?: number;
  correlationId?: string;
  retryDelayMs?: number;
  errorFamily?: string;
}

export interface OutboundRequestPolicy {
  safety: OutboundSafety;
  maxAttempts?: number;
  maxTotalDelayMs?: number;
  timeoutMs?: number;
  onAttempt?: (event: OutboundAttemptEvent) => void;
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETDOWN', 'ENETRESET',
  'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
]);

function errorChain(error: unknown): unknown[] {
  const values: unknown[] = [];
  let current = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current) && values.length < 8) {
    values.push(current);
    seen.add(current);
    current = typeof current === 'object' && current !== null
      ? (current as { cause?: unknown }).cause
      : undefined;
  }
  return values;
}
function retryableNetworkError(error: unknown): boolean {
  return errorChain(error).some((item) => {
    if (!(item instanceof Error) && (typeof item !== 'object' || item === null)) return false;
    const value = item as Error & { code?: string };
    if (value.code && RETRYABLE_CODES.has(value.code)) return true;
    return value.name === 'TimeoutError' || value.name === 'AbortError';
  });
}

const MAX_TIMER_DELAY_MS = 2_147_483_647;

function nonnegativeDelay(raw: string | null): number | null {
  const value = raw?.trim();
  if (!value || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null;
  // An overflowing but syntactically valid value remains out-of-budget,
  // rather than falling back to an earlier retry.
  return Number(value);
}

function retryAfterMs(headers: Headers): number | null {
  const ms = nonnegativeDelay(headers.get('retry-after-ms'));
  if (ms !== null) return ms;
  const raw = headers.get('retry-after')?.trim();
  if (!raw) return null;
  const seconds = nonnegativeDelay(raw);
  if (seconds !== null) return seconds * 1000;
  // Prevent Date.parse from reinterpreting rejected numeric hints as dates.
  if (!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(raw)) return null;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function throwIfCallerAborted(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  throwIfCallerAborted(signal);
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error !== undefined) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(), ms);
    timer.unref?.();
    const onAbort = () => finish(abortReason(signal!));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function boundedDelay(attempt: number, response?: Response): number {
  const providerDelay = response ? retryAfterMs(response.headers) : null;
  if (providerDelay !== null) return Math.ceil(providerDelay);
  const cap = Math.min(4_000, 200 * (2 ** Math.max(0, attempt - 1)));
  return Math.floor(Math.random() * Math.max(1, cap));
}

function safeTargetLabel(input: string | URL): string {
  const raw = String(input);
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname
      .split('/')
      .map(segment => segment.length > 64 ? '[REDACTED_SEGMENT]' : redactSensitiveString(segment))
      .join('/');
    return `${parsed.protocol}//${parsed.host}${path}`.slice(0, 500);
  } catch {
    return redactSensitiveString(raw.split(/[?#]/, 1)[0] ?? raw).slice(0, 500);
  }
}

function responseCorrelationId(response: Response): string | undefined {
  for (const name of ['request-id', 'x-request-id', 'cf-ray']) {
    const value = response.headers.get(name)?.trim();
    if (!value) continue;
    const safe = value.replace(/[^A-Za-z0-9._:/-]/g, '').slice(0, 200);
    if (safe) return `${name}=${safe}`;
  }
  return undefined;
}

function notifyAttempt(policy: OutboundRequestPolicy, event: OutboundAttemptEvent): void {
  try {
    policy.onAttempt?.(event);
  } catch {
    // Observation must never alter request behavior.
  }
}

function hasReplayableBody(body: RequestInit['body']): boolean {
  if (body == null || typeof body === 'string') return true;
  if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer) return true;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return true;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return true;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return true;
  // Streams, iterators and unknown objects get one send. Do not inspect
  // iterator accessors or buffer an arbitrary body just to enable retries.
  return false;
}

export async function fetchWithPolicy(
  input: string | URL,
  init: RequestInit = {},
  policy: OutboundRequestPolicy,
): Promise<Response> {
  const requestedAttempts = Math.max(1, Math.min(5, policy.maxAttempts ?? 3));
  const attempts = policy.safety === 'non-idempotent' || !hasReplayableBody(init.body) ? 1 : requestedAttempts;
  const timeoutMs = Math.max(1, policy.timeoutMs ?? 30_000);
  const maxTotalDelayMs = Math.max(0, policy.maxTotalDelayMs ?? 10_000);
  let delayed = 0;
  let lastError: unknown;
  const target = safeTargetLabel(input);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfCallerAborted(init.signal);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    let responseObserved = false;
    try {
      const response = await fetch(input, { ...init, signal });
      const retryable = RETRYABLE_STATUS.has(response.status) && attempt < attempts;
      const delay = retryable ? boundedDelay(attempt, response) : 0;
      const retry = retryable && Number.isFinite(delay) && delay <= MAX_TIMER_DELAY_MS
        && delayed + delay <= maxTotalDelayMs;
      const correlationId = responseCorrelationId(response);
      notifyAttempt(policy, {
        attempt,
        maxAttempts: attempts,
        safety: policy.safety,
        target,
        outcome: 'response',
        retry,
        status: response.status,
        ...(correlationId ? { correlationId } : {}),
        ...(retry ? { retryDelayMs: delay } : {}),
      });
      responseObserved = true;
      if (!retry) return response;
      try { await response.body?.cancel(); } catch { /* best effort */ }
      delayed += delay;
      await sleep(delay, init.signal);
    } catch (error) {
      if (responseObserved) throw error;
      lastError = error;
      const callerAborted = init.signal?.aborted === true;
      const retryable = !callerAborted && attempt < attempts && retryableNetworkError(error);
      const delay = retryable ? boundedDelay(attempt) : 0;
      const retry = retryable && Number.isFinite(delay) && delay <= MAX_TIMER_DELAY_MS
        && delayed + delay <= maxTotalDelayMs;
      notifyAttempt(policy, {
        attempt,
        maxAttempts: attempts,
        safety: policy.safety,
        target,
        outcome: 'error',
        retry,
        errorFamily: normalizeFailureFamily(error),
        ...(retry ? { retryDelayMs: delay } : {}),
      });
      if (callerAborted || !retry) throw error;
      delayed += delay;
      await sleep(delay, init.signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OUTBOUND_REQUEST_FAILED');
}

export function correlationSuffix(response: Response): string {
  const id = responseCorrelationId(response);
  return id ? ` (${id})` : '';
}
