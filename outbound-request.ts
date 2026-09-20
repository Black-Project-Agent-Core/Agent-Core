export type OutboundSafety = 'safe' | 'idempotent' | 'non-idempotent';

export interface OutboundRequestPolicy {
  safety: OutboundSafety;
  maxAttempts?: number;
  maxTotalDelayMs?: number;
  timeoutMs?: number;
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

function retryAfterMs(headers: Headers): number | null {
  const ms = Number.parseInt(headers.get('retry-after-ms') ?? '', 10);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const raw = headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

function boundedDelay(attempt: number, response?: Response): number {
  const providerDelay = response ? retryAfterMs(response.headers) : null;
  if (providerDelay !== null) return Math.min(providerDelay, 10_000);
  const cap = Math.min(4_000, 200 * (2 ** Math.max(0, attempt - 1)));
  return Math.floor(Math.random() * Math.max(1, cap));
}
export async function fetchWithPolicy(
  input: string | URL,
  init: RequestInit = {},
  policy: OutboundRequestPolicy,
): Promise<Response> {
  const requestedAttempts = Math.max(1, Math.min(5, policy.maxAttempts ?? 3));
  const attempts = policy.safety === 'non-idempotent' ? 1 : requestedAttempts;
  const timeoutMs = Math.max(1, policy.timeoutMs ?? 30_000);
  const maxTotalDelayMs = Math.max(0, policy.maxTotalDelayMs ?? 10_000);
  let delayed = 0;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await fetch(input, { ...init, signal });
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) return response;
      const delay = boundedDelay(attempt, response);
      if (delayed + delay > maxTotalDelayMs) return response;
      delayed += delay;
      await sleep(delay);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !retryableNetworkError(error)) throw error;
      const delay = boundedDelay(attempt);
      if (delayed + delay > maxTotalDelayMs) throw error;
      delayed += delay;
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('OUTBOUND_REQUEST_FAILED');
}

export function correlationSuffix(response: Response): string {
  for (const name of ['request-id', 'x-request-id', 'cf-ray']) {
    const value = response.headers.get(name)?.trim();
    if (!value) continue;
    const safe = value.replace(/[^A-Za-z0-9._:/-]/g, '').slice(0, 200);
    if (safe) return ` (${name}=${safe})`;
  }
  return '';
}
