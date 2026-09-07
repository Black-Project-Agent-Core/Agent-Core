import type { SubAgentCoreProviderId } from '../types.js';

export type ProviderFailureKind = 'auth' | 'credits_exhausted' | 'rate_limit' | 'model_entitlement' | 'forbidden' | 'model_not_found' | 'invalid_request' | 'server' | 'network' | 'timeout' | 'unknown';

export interface ProviderFailure {
  kind: ProviderFailureKind;
  status?: number;
  message: string;
  retryAfterMs?: number;
  model?: string;
}

export interface ProviderInvocation {
  provider: SubAgentCoreProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  taskPrompt: string;
  timeoutMs: number;
}

export interface ProviderInvocationResult {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  actualModel?: string;
  recordedCost?: number;
}

export interface SubAgentProvider { invoke(input: ProviderInvocation): Promise<ProviderInvocationResult>; }

export class ProviderInvocationError extends Error {
  constructor(readonly failure: ProviderFailure) {
    super(failure.message);
    this.name = 'ProviderInvocationError';
  }
}

function retryAfter(headers?: Headers): number | undefined {
  const raw = headers?.get('retry-after')?.trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) && at > Date.now() ? at - Date.now() : undefined;
}

export function classifyProviderFailure(status: number | undefined, message: string, headers?: Headers): ProviderFailure {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const retryAfterMs = retryAfter(headers);
  const authoritativeModelEntitlement = lower.includes('team_model_access_denied')
    || lower.includes('team not allowed to access model')
    || lower.includes('not allowed to access model')
    || lower.includes('model access denied');
  if (authoritativeModelEntitlement) {
    return { kind: 'model_entitlement', ...(status === undefined ? {} : { status }), message: text || 'Model entitlement denied' };
  }
  if (status === 401) return { kind: 'auth', status, message: text || 'Authentication failed' };
  if (status === 402) return { kind: 'credits_exhausted', status, message: text || 'Provider credits exhausted' };
  if (status === 403) return { kind: 'forbidden', status, message: text || 'Provider forbids this request' };
  if (status === 404 && lower.includes('model')) return { kind: 'model_not_found', status, message: text || 'Model not found' };
  if (status === 429 || (lower.includes('rate') && lower.includes('limit'))) return { kind: 'rate_limit', status, message: text || 'Rate limited', ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
  if (status === 408 || status === 504) return { kind: 'timeout', status, message: text || 'Provider timeout' };
  if (status !== undefined && status >= 500) return { kind: 'server', status, message: text || 'Provider server error' };
  if (status === 400 || status === 422) return { kind: 'invalid_request', status, message: text || 'Invalid provider request' };
  if (status === undefined || status === 0) return { kind: 'network', status, message: text || 'Provider network error' };
  return { kind: 'unknown', status, message: text || 'Provider request failed' };
}

export function redactProviderText(text: string, secrets: readonly string[]): string {
  let safe = String(text || '');
  for (const secret of secrets) if (secret) safe = safe.split(secret).join('[REDACTED]');
  safe = safe.replace(/Bearer\s+[^\s\"',}]+/gi, 'Bearer [REDACTED]').replace(/\b(?:sk|nvapi|nvidia|oh)[-_][A-Za-z0-9._-]{8,}\b/gi, '[REDACTED]');
  return safe.slice(0, 4_000);
}

export async function responseErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return response.statusText;
    try {
      const parsed = JSON.parse(text) as any;
      return String(parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? text);
    } catch { return text; }
  } catch { return response.statusText; }
}
