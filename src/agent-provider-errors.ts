export type AgentProviderFailureClass =
  | 'REQUEST_INVALID'
  | 'AUTH_INVALID'
  | 'RATE_LIMIT'
  | 'QUOTA_EXHAUSTED'
  | 'CREDIT_EXHAUSTED'
  | 'MODEL_ACCESS'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_CAPACITY'
  | 'PROVIDER_TRANSIENT'
  | 'TRANSPORT_TRANSIENT'
  | 'INTERNAL_CONTRACT';

export type AgentProviderFailureScope =
  | 'request'
  | 'credential'
  | 'model-credential'
  | 'model-provider'
  | 'provider';

export interface AgentProviderResponseObservation {
  status: number;
  retryAfterMs: number | null;
  resetAtMs: number | null;
  requestLimit: number | null;
  requestRemaining: number | null;
  errorCode: string | null;
  errorType: string | null;
}
export interface AgentProviderFailureDecision {
  failureClass: AgentProviderFailureClass;
  scope: AgentProviderFailureScope;
  shouldFailover: boolean;
  terminalCredential: boolean;
  affectsProviderBreaker: boolean;
  cooldownMs: number;
  retryAtMs: number | null;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function boundedText(value: unknown, max = 160): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function numericHeader(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function parseRetryAfterMs(headers: Headers, now = Date.now()): number | null {
  const value = headers.get('retry-after');
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * SECOND);
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, at - now);
}

function normalizeResetValue(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const duration = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/i);
  if (duration) {
    const amount = Number(duration[1]);
    const unit = duration[2]!.toLowerCase();
    const factor = unit === 'ms' ? 1 : unit === 's' ? 1_000 : unit === 'm' ? 60_000 : 3_600_000;
    return now + Math.round(amount * factor);
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric > 10_000_000_000) return Math.round(numeric);
    if (numeric > 1_000_000_000) return Math.round(numeric * 1_000);
    return now + Math.round(numeric * 1_000);
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseResetAtMs(headers: Headers, now = Date.now()): number | null {
  const candidates = [
    headers.get('x-ratelimit-reset'),
    headers.get('x-ratelimit-reset-requests'),
    headers.get('ratelimit-reset'),
  ].map(value => normalizeResetValue(value, now))
    .filter((value): value is number => value !== null && value > now);
  return candidates.length ? Math.min(...candidates) : null;
}
function payloadResetAtMs(payload: any, now = Date.now()): number | null {
  const candidates = [
    payload?.error?.reset_at,
    payload?.error?.resetAt,
    payload?.error?.resets_at,
    payload?.reset_at,
    payload?.resetAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      const ms = candidate > 10_000_000_000 ? candidate : candidate * 1_000;
      if (ms > now) return Math.round(ms);
    }
    if (typeof candidate === 'string') {
      const parsed = normalizeResetValue(candidate, now);
      if (parsed !== null && parsed > now) return parsed;
    }
  }
  return null;
}

export function observeProviderResponse(
  response: Response,
  payload?: any,
  now = Date.now(),
): AgentProviderResponseObservation {
  const retryAfterMs = parseRetryAfterMs(response.headers, now);
  const headerReset = parseResetAtMs(response.headers, now);
  const bodyReset = payloadResetAtMs(payload, now);
  const retryReset = retryAfterMs !== null && retryAfterMs > 0 ? now + retryAfterMs : null;
  return {
    status: response.status,
    retryAfterMs,
    resetAtMs: [headerReset, bodyReset, retryReset].filter((v): v is number => v !== null)
      .sort((a, b) => a - b)[0] ?? null,
    requestLimit: numericHeader(response.headers.get('x-ratelimit-limit-requests')),
    requestRemaining: numericHeader(response.headers.get('x-ratelimit-remaining-requests'))
      ?? (response.status === 429 || response.status === 402 ? 0 : null),
    errorCode: boundedText(payload?.error?.code),
    errorType: boundedText(payload?.error?.type),
  };
}
export class AgentProviderRequestError extends Error {
  readonly status: number;
  readonly safeCode: string | null;
  readonly safeType: string | null;
  readonly retryAfterMs: number | null;
  readonly resetAtMs: number | null;

  constructor(input: {
    status: number;
    message: string;
    safeCode?: string | null;
    safeType?: string | null;
    retryAfterMs?: number | null;
    resetAtMs?: number | null;
  }) {
    super(input.message);
    this.name = 'AgentProviderRequestError';
    this.status = input.status;
    this.safeCode = input.safeCode ?? null;
    this.safeType = input.safeType ?? null;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.resetAtMs = input.resetAtMs ?? null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase();
}

function containsAny(text: string, patterns: string[]): boolean {
  return patterns.some(pattern => text.includes(pattern));
}

/** Matches provider error codes as whole tokens, so `tpm_quota_exceeded` is not read as `quota_exceeded`. */
function containsToken(text: string, tokens: string[]): boolean {
  return tokens.some(token => new RegExp(`(?<![a-z0-9_])${token}(?![a-z0-9_])`).test(text));
}

// A response can fail after fetch returned its headers. Undici then throws an
// opaque TypeError("terminated") with the useful transport code in its cause.
// Preserve that boundary without treating every opaque/JSON/size error as retryable.
const TRANSPORT_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN', 'ENETDOWN', 'ENETRESET',
  'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'UND_ERR_RES_CONTENT_LENGTH_MISMATCH',
]);
function hasTransientTransportCause(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  for (let depth = 0; depth < 8 && typeof current === 'object' && current !== null; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    const value = current as { code?: unknown; cause?: unknown };
    if (typeof value.code === 'string' && TRANSPORT_ERROR_CODES.has(value.code)) return true;
    current = value.cause;
  }
  return false;
}
function retryAt(error: AgentProviderRequestError, fallbackMs: number, now: number): {
  cooldownMs: number;
  retryAtMs: number;
} {
  const hinted = error.resetAtMs && error.resetAtMs > now
    ? error.resetAtMs - now
    : error.retryAfterMs;
  const cooldownMs = Math.max(fallbackMs, hinted ?? 0);
  const bounded = Math.min(DAY, Math.max(SECOND, cooldownMs));
  return { cooldownMs: bounded, retryAtMs: now + bounded };
}

export function classifyAgentProviderFailure(
  error: unknown,
  now = Date.now(),
): AgentProviderFailureDecision {
  const rawText = errorMessage(error);
  const text = error instanceof AgentProviderRequestError
    ? [rawText, error.safeCode ?? '', error.safeType ?? ''].join(' ').toLowerCase()
    : rawText;
  if (error instanceof AgentProviderRequestError) {
    const status = error.status;
    const quotaText = containsAny(text, [
      'quota exceeded', 'quota exhausted', 'usage limit', 'resource_exhausted',
      'daily limit', 'monthly limit',
    ]) || containsToken(text, [
      // Duanyan TokenPlan answers "credit exhausted" with 429 + quota_exceeded; "too fast" is rate_limit_exceeded.
      // A prefixed code (tpm_, rpm_, concurrency_quota_exceeded) names a rate window, not spent credit.
      'quota_exceeded', 'insufficient_quota',
    ]);
    const creditText = containsAny(text, [
      'payment required', 'insufficient credit', 'insufficient balance', 'out of credits',
    ]);
    const authText = containsAny(text, [
      'invalid api key', 'invalid key', 'unauthorized', 'authentication failed',
      'revoked', 'expired api key',
    ]);
    const contextText = containsAny(text, [
      'context_length_exceeded', 'context window', 'maximum context', 'max_model_len',
      'too many tokens', 'input too long',
    ]);
    const modelText = containsAny(text, [
      'model_not_found', 'model not found', 'model_access', 'model access', 'model is not available',
      'does not have access to model', 'not entitled', 'subscription plan', 'model not supported',
      'tool calling not supported', 'does not support tools',
    ]);
    if (contextText || status === 413) {
      return {
        failureClass: 'MODEL_CAPACITY', scope: 'model-provider', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false,
        cooldownMs: 10 * MINUTE, retryAtMs: now + 10 * MINUTE,
      };
    }
    // The status line is the structured field. A gateway or overloaded host can put any words in a 408/5xx body
    // ("unauthorized", "model not found"), and those words must not retire a healthy credential or model.
    if (status === 408 || status >= 500) {
      return {
        failureClass: 'PROVIDER_TRANSIENT', scope: 'provider', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: true,
        cooldownMs: 30 * SECOND, retryAtMs: now + 30 * SECOND,
      };
    }
    // A 429 is a rate window unless the body says credit or quota is spent.
    if (status === 429 && !quotaText && !creditText) {
      const wait = retryAt(error, 90 * SECOND, now);
      return {
        failureClass: 'RATE_LIMIT', scope: 'model-credential', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false, ...wait,
      };
    }
    const credentialInvalid = containsAny(text, ['invalid api key', 'invalid key', 'authentication failed', 'revoked', 'expired api key']);
    if (status !== 401 && !credentialInvalid && containsAny(text, ['model_not_found', 'model not found', 'model is not available'])) {
      return {
        failureClass: 'MODEL_NOT_FOUND', scope: 'model-provider', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false,
        cooldownMs: DAY, retryAtMs: now + DAY,
      };
    }
    if (modelText && !credentialInvalid) {
      return {
        failureClass: 'MODEL_ACCESS', scope: 'model-credential', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false,
        cooldownMs: DAY, retryAtMs: now + DAY,
      };
    }
    if (authText || status === 401) {
      return {
        failureClass: 'AUTH_INVALID', scope: 'credential', shouldFailover: true,
        terminalCredential: true, affectsProviderBreaker: false,
        cooldownMs: 0, retryAtMs: null,
      };
    }
    if (creditText || status === 402) {
      const wait = retryAt(error, DAY, now);
      return {
        failureClass: 'CREDIT_EXHAUSTED', scope: 'credential', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false, ...wait,
      };
    }
    if (quotaText) {
      const wait = retryAt(error, 6 * HOUR, now);
      return {
        failureClass: 'QUOTA_EXHAUSTED', scope: 'credential', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false, ...wait,
      };
    }
    if (status === 403) {
      return {
        failureClass: 'MODEL_ACCESS', scope: 'model-credential', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false,
        cooldownMs: DAY, retryAtMs: now + DAY,
      };
    }
    if (status === 404 || status === 410) {
      return {
        failureClass: 'MODEL_NOT_FOUND', scope: 'model-provider', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false,
        cooldownMs: DAY, retryAtMs: now + DAY,
      };
    }
    if (status === 400 && text.includes('provider returned error')) {
      // The upstream provided no actionable request-validation detail. Do not
      // declare a malformed caller payload or strand the whole Native turn on
      // one tool-qualified model/key. Retry another eligible route, bounded by
      // the existing pool attempt budget; explicit invalid requests still stop.
      const wait = retryAt(error, 20 * SECOND, now);
      return {
        failureClass: 'PROVIDER_TRANSIENT', scope: 'model-credential', shouldFailover: true,
        terminalCredential: false, affectsProviderBreaker: false, ...wait,
      };
    }
    if (status >= 400 && status < 500) {
      return {
        failureClass: 'REQUEST_INVALID', scope: 'request', shouldFailover: false,
        terminalCredential: false, affectsProviderBreaker: false,
        cooldownMs: 0, retryAtMs: null,
      };
    }
  }

  if (hasTransientTransportCause(error)
    || containsAny(text, ['fetch failed', 'econnreset', 'econnrefused', 'etimedout', 'timeout', 'socket'])) {
    return {
      failureClass: 'TRANSPORT_TRANSIENT', scope: 'provider', shouldFailover: true,
      terminalCredential: false, affectsProviderBreaker: true,
      cooldownMs: 30 * SECOND, retryAtMs: now + 30 * SECOND,
    };
  }
  if (text.includes('agent_runtime_provider_response_invalid')
    || text.includes('agent_runtime_provider_tool_call_invalid')) {
    return {
      failureClass: 'PROVIDER_TRANSIENT', scope: 'provider', shouldFailover: true,
      terminalCredential: false, affectsProviderBreaker: true,
      cooldownMs: 30 * SECOND, retryAtMs: now + 30 * SECOND,
    };
  }

  return {
    failureClass: 'INTERNAL_CONTRACT', scope: 'request', shouldFailover: false,
    terminalCredential: false, affectsProviderBreaker: false,
    cooldownMs: 0, retryAtMs: null,
  };
}
