import { createHash, randomBytes } from 'node:crypto';
import { assertCredentialBearingUrl } from './net/endpoint-policy.js';
import { fetchWithPolicy } from './net/outbound-request.js';
import { readResponseJsonBounded } from './net/bounded-response.js';
import { AgentProviderRequestError, classifyAgentProviderFailure, observeProviderResponse } from './agent-provider-errors.js';
import { secretRevisionDigest, type AgentReasoningEffort, type ProviderModelReadiness, type ProviderStateStore } from './agent-provider-state.js';
import type { AgentProviderContinuationMetadata, AgentModelMessage, AgentModelTool, AgentModelResponse } from './agent-provider.js';

interface ModelCandidate { id: string; context: number; output: number; tools: boolean | null; price: number; reasoningEfforts?: ProviderModelReadiness['reasoningEfforts'] }
export interface ReadinessRoute {
  id: string; baseUrl: string | null; model: string | null;
  workspaceId?: string;
  continuation?: AgentProviderContinuationMetadata;
}
interface ReadinessCredential { id: string; secret: string }
type Probe = (model: string, messages: AgentModelMessage[], tools: AgentModelTool[], signal?: AbortSignal) => Promise<AgentModelResponse>;

/** OpenRouter's routing alias can resolve to different models between calls.
 * Tool qualification is usable only for a stable, concrete free model ID. */
function requiresConcreteFreeModel(route: ReadinessRoute): boolean {
  return route.id === 'openrouter' && route.model === 'openrouter/free';
}
function fixedOpenRouterModel(route: ReadinessRoute): boolean {
  return route.id === 'openrouter' && Boolean(route.model) && route.model !== 'openrouter/free';
}
/** Named routes with an explicit model must not probe or use another model. */
function fixedNamedModel(route: ReadinessRoute): boolean {
  return fixedOpenRouterModel(route)
    || (['gonka', 'atria', 'anthropic'].includes(route.id) && Boolean(route.model));
}
function unpinnedAlias(route: ReadinessRoute, ready: ProviderModelReadiness | null): boolean {
  return ready?.status === 'ready' && (
    (requiresConcreteFreeModel(route) && ready.model === route.model)
    || (fixedNamedModel(route) && ready.model !== route.model)
  );
}

function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Catalog schema 2.x (Duanyan TokenPlan) lists limits per modality; the text entry carries what Native needs. */
function textModality(list: unknown): any {
  return Array.isArray(list) ? list.find(item => item && item.type === 'text') : undefined;
}

/** A nested `tools` entry counts only when it declares support: `false`, `null` and `{ supported: false }` do not. */
function nestedToolsSupported(parameters: Record<string, unknown>): boolean {
  if (!('tools' in parameters)) return false;
  const entry = parameters.tools;
  if (entry === undefined || entry === null || entry === false) return false;
  if (typeof entry === 'object' && !Array.isArray(entry) && (entry as { supported?: unknown }).supported === false) return false;
  return true;
}

/**
 * The model qualifies, but not for this request's size. A property of the request, not of the key or
 * model, so it is returned to the caller and never persisted over a previous (possibly ready) verdict.
 */
export const MODEL_CONTEXT_INSUFFICIENT_FOR_REQUEST = 'MODEL_CONTEXT_INSUFFICIENT_FOR_REQUEST';

export function readinessDigest(route: ReadinessRoute, credential: ReadinessCredential): string {
  return createHash('sha256').update(JSON.stringify([
    route.baseUrl, route.model, route.continuation ?? null, secretRevisionDigest(credential.secret),
    ...(route.workspaceId ? [route.workspaceId] : []),
  ])).digest('hex');
}

export const REASONING_EFFORT_LEVELS: readonly AgentReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** Levels an Anthropic catalog entry advertises: the effort capability must be on and the level individually supported. */
function supportedEfforts(raw: any): AgentReasoningEffort[] {
  return REASONING_EFFORT_LEVELS.filter(level => raw?.capabilities?.effort?.supported === true && raw.capabilities.effort[level]?.supported === true);
}

/** Why an owner key test failed. Codes and their texts are fixed here; nothing from the provider's body is echoed. */
export type ProviderModelListFailureCode =
  | 'NO_KEY' | 'ENDPOINT_MISSING' | 'ENDPOINT_INSECURE' | 'AUTH_REJECTED' | 'PERMISSION_DENIED' | 'RATE_LIMITED'
  | 'QUOTA_EXHAUSTED' | 'ENDPOINT_NOT_FOUND' | 'REQUEST_REJECTED' | 'PROVIDER_UNAVAILABLE' | 'TIMEOUT'
  | 'NETWORK_UNREACHABLE' | 'INVALID_RESPONSE';
export interface ProviderModelListFailure {
  code: ProviderModelListFailureCode;
  /** Owner-facing cause and next step. Never contains a key, a URL or provider error text. */
  message: string;
  httpStatus?: number;
  retryAt?: string;
}
export interface ProviderListedModel {
  id: string;
  displayName?: string;
  contextWindowTokens: number | null;
  maxOutputTokens: number | null;
  /** Anthropic only: the effort levels the catalog entry advertises for this key. */
  reasoningEfforts?: AgentReasoningEffort[];
}
interface ProviderKeyModelList {
  /** Configured alias such as `anthropic:01`; never the secret. */
  credentialId: string;
  ok: boolean;
  models: ProviderListedModel[];
  truncated?: boolean;
  failure?: ProviderModelListFailure;
}
export interface ProviderModelTestReport {
  providerId: string;
  checkedAt: string;
  status: 'ok' | 'partial' | 'failed';
  failure?: ProviderModelListFailure;
  keys: Array<Omit<ProviderKeyModelList, 'models'> & { modelCount: number }>;
  /** Union over the keys that answered; keyCount says how many of them list the model. */
  models: Array<ProviderListedModel & { keyCount: number }>;
}

const MAX_LISTED_MODELS = 2_000;
const MAX_MODEL_PAGES = 5;
const MODEL_LIST_FAILURE_TEXT: Record<ProviderModelListFailureCode, string> = {
  NO_KEY: 'No API key is configured for this provider.',
  ENDPOINT_MISSING: 'No base URL is configured for this provider.',
  ENDPOINT_INSECURE: 'The configured base URL is not HTTPS (only loopback may use HTTP), so the key was not sent.',
  AUTH_REJECTED: 'The provider rejected the API key (invalid, revoked or expired). Replace the key.',
  PERMISSION_DENIED: 'The key is valid but not allowed to list models (permission or workspace restriction).',
  RATE_LIMITED: 'The provider is rate limiting this key. Try again later.',
  QUOTA_EXHAUSTED: 'The key has no quota or credit left. Check the provider account balance.',
  ENDPOINT_NOT_FOUND: 'The provider has no model list at the configured base URL. Check the base URL.',
  REQUEST_REJECTED: 'The provider rejected the request.',
  PROVIDER_UNAVAILABLE: 'The provider is down or overloaded. Try again later.',
  TIMEOUT: 'The provider did not answer in time.',
  NETWORK_UNREACHABLE: 'The provider could not be reached (DNS, connection or proxy failure).',
  INVALID_RESPONSE: 'The provider answered with something that is not a model list.',
};
function describeModelListFailure(code: ProviderModelListFailureCode): ProviderModelListFailure {
  return { code, message: MODEL_LIST_FAILURE_TEXT[code] };
}
class ModelListShapeError extends Error {
  constructor(cause: unknown) { super('MODEL_LIST_INVALID_RESPONSE', { cause }); }
}
const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH',
  'ENETDOWN', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID']);
function errorChainHas(error: unknown, test: (value: { name?: unknown; code?: unknown }) => boolean): boolean {
  let current = error;
  for (let depth = 0; depth < 8 && typeof current === 'object' && current !== null; depth += 1) {
    if (test(current as { name?: unknown; code?: unknown })) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
function classifyModelListError(error: unknown): [ProviderModelListFailureCode, { httpStatus?: number; retryAt?: string }] {
  if (error instanceof ModelListShapeError) return ['INVALID_RESPONSE', {}];
  if (error instanceof AgentProviderRequestError) {
    const status = { httpStatus: error.status };
    if (error.status === 404) return ['ENDPOINT_NOT_FOUND', status];
    const decision = classifyAgentProviderFailure(error);
    const retry = decision.retryAtMs ? { ...status, retryAt: new Date(decision.retryAtMs).toISOString() } : status;
    switch (decision.failureClass) {
      case 'AUTH_INVALID': return ['AUTH_REJECTED', status];
      case 'MODEL_ACCESS': return ['PERMISSION_DENIED', status];
      case 'RATE_LIMIT': return ['RATE_LIMITED', retry];
      case 'QUOTA_EXHAUSTED': case 'CREDIT_EXHAUSTED': return ['QUOTA_EXHAUSTED', retry];
      case 'PROVIDER_TRANSIENT': return ['PROVIDER_UNAVAILABLE', status];
      default: return ['REQUEST_REJECTED', status];
    }
  }
  if (errorChainHas(error, value => value.name === 'TimeoutError' || value.code === 'UND_ERR_HEADERS_TIMEOUT'
    || value.code === 'UND_ERR_BODY_TIMEOUT' || value.code === 'ETIMEDOUT')) return ['TIMEOUT', {}];
  if (errorChainHas(error, value => typeof value.code === 'string' && UNREACHABLE_CODES.has(value.code))
    || (error instanceof TypeError && /fetch failed/i.test(error.message))) return ['NETWORK_UNREACHABLE', {}];
  // A body over the size bound or cut off mid-read.
  return ['INVALID_RESPONSE', {}];
}
function listedModel(raw: any, anthropic: boolean): ProviderListedModel | null {
  if (!raw || typeof raw.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,239}$/.test(raw.id)) return null;
  if (anthropic && (raw.lifecycle === 'retired' || (raw.type !== undefined && raw.type !== 'model'))) return null;
  const name = typeof raw.display_name === 'string' ? raw.display_name : typeof raw.name === 'string' ? raw.name : null;
  const efforts = anthropic ? supportedEfforts(raw) : [];
  return {
    id: raw.id,
    ...(name && name.trim() && name.length <= 200 && name !== raw.id ? { displayName: name.trim() } : {}),
    contextWindowTokens: positive(raw.max_input_tokens) ?? positive(raw.top_provider?.context_length) ?? positive(raw.context_length)
      ?? positive(raw.max_model_len) ?? positive(raw.max_context_length)
      ?? positive(textModality(raw.input_modalities)?.supported_inputs?.max_context_length?.value),
    maxOutputTokens: (anthropic ? positive(raw.max_tokens) : null) ?? positive(raw.top_provider?.max_completion_tokens)
      ?? positive(raw.max_completion_tokens) ?? positive(raw.max_output_tokens),
    ...(anthropic ? { reasoningEfforts: efforts } : {}),
  };
}

/** Catalog metadata describes capacity; only an actual tool response proves key/model access. */
export class ProviderModelReadinessService {
  private readonly pending = new Map<string, Promise<ProviderModelReadiness>>();
  /** Per-model effort levels from the catalog alone. Readiness keeps one row per key, so it cannot describe every model. */
  private readonly catalogEfforts = new Map<string, { efforts: AgentReasoningEffort[] | null; expiresAtMs: number }>();
  constructor(private readonly state: ProviderStateStore, private readonly timeoutMs: number) {}

  private catalogEffortsKey(route: ReadinessRoute, credentials: ReadinessCredential[]): string {
    return `${route.id}:${route.model}:${credentials.map(credential => readinessDigest(route, credential)).join(',')}`;
  }

  /** Levels every key can run for the route's model, or null while unknown. Reads memory only; never calls the provider. */
  catalogEffortsOf(route: ReadinessRoute, credentials: ReadinessCredential[]): AgentReasoningEffort[] | null {
    const cached = this.catalogEfforts.get(this.catalogEffortsKey(route, credentials));
    return cached && cached.expiresAtMs > Date.now() ? cached.efforts : null;
  }

  /**
   * Reads the model's catalog entry with every key, without a tool probe, so the picker can offer its levels before
   * the first turn. One unreachable key leaves the levels unknown (retried soon): never claim what was not confirmed.
   */
  async refreshCatalogEfforts(route: ReadinessRoute, credentials: ReadinessCredential[], signal?: AbortSignal): Promise<void> {
    if (route.id !== 'anthropic' || !route.baseUrl || !route.model || !credentials.length) return;
    const key = this.catalogEffortsKey(route, credentials);
    const known = this.catalogEfforts.get(key);
    if (known && known.expiresAtMs > Date.now()) return;
    const url = this.catalogUrl(route);
    const perKey = await Promise.all(credentials.map(credential =>
      this.fetchCatalog(url, route, credential, signal).then(supportedEfforts, () => null)));
    const confirmed = perKey.filter((levels): levels is AgentReasoningEffort[] => levels !== null);
    const complete = confirmed.length === credentials.length;
    this.catalogEfforts.set(key, {
      efforts: complete ? REASONING_EFFORT_LEVELS.filter(level => confirmed.every(levels => levels.includes(level))) : null,
      expiresAtMs: Date.now() + (complete ? 24 * 60 * 60_000 : 30_000),
    });
  }

  private catalogUrl(route: ReadinessRoute): URL {
    const url = assertCredentialBearingUrl(route.baseUrl!, 'AGENT_CORE_AI_BASE_URL');
    url.pathname = `${url.pathname.replace(/\/$/, '')}/models`;
    if (route.id === 'anthropic' && route.model) url.pathname += `/${encodeURIComponent(route.model)}`;
    url.search = ''; url.hash = '';
    return url;
  }

  private async fetchCatalog(url: URL, route: ReadinessRoute, credential: ReadinessCredential, signal?: AbortSignal): Promise<unknown> {
    const response = await fetchWithPolicy(url, {
      headers: route.id === 'anthropic'
        ? { 'x-api-key': credential.secret, 'anthropic-version': '2023-06-01',
          ...(route.workspaceId ? { 'anthropic-workspace-id': route.workspaceId } : {}) }
        : { authorization: `Bearer ${credential.secret}` }, ...(signal ? { signal } : {}),
    }, { safety: 'safe', maxAttempts: 1, timeoutMs: Math.min(this.timeoutMs, 15_000), maxTotalDelayMs: 0 });
    const payload = await readResponseJsonBounded<any>(response, 2 * 1024 * 1024, 'provider model catalog');
    if (!response.ok) {
      const observation = observeProviderResponse(response, payload);
      throw new AgentProviderRequestError({ status: response.status, message: 'MODEL_CATALOG_UNAVAILABLE',
        safeCode: observation.errorCode, safeType: observation.errorType,
        retryAfterMs: observation.retryAfterMs, resetAtMs: observation.resetAtMs });
    }
    return payload;
  }

  /**
   * Owner-requested key test: lists every model the key can see (`GET {baseUrl}/models`, all pages for Anthropic).
   * Each key is tested on its own, so one rejected key does not hide the models of the others. The report carries
   * key aliases, model metadata and a classified cause; never a key value, a URL or the provider's own error text.
   */
  async testRoute(route: ReadinessRoute, credentials: ReadinessCredential[], signal?: AbortSignal): Promise<ProviderModelTestReport> {
    const keys = await Promise.all(credentials.map(credential => this.listModelsForKey(route, credential, signal)));
    const byId = new Map<string, ProviderListedModel & { keyCount: number }>();
    for (const key of keys) for (const model of key.models) {
      const known = byId.get(model.id);
      byId.set(model.id, known ? { ...known, keyCount: known.keyCount + 1 } : { ...model, keyCount: 1 });
    }
    return {
      providerId: route.id, checkedAt: new Date().toISOString(),
      status: keys.length === 0 ? 'failed' : keys.every(key => key.ok) ? 'ok' : keys.some(key => key.ok) ? 'partial' : 'failed',
      ...(keys.length === 0 ? { failure: describeModelListFailure('NO_KEY') } : {}),
      keys: keys.map(({ models, ...key }) => ({ ...key, modelCount: models.length })),
      models: [...byId.values()],
    };
  }

  private async listModelsForKey(route: ReadinessRoute, credential: ReadinessCredential, signal?: AbortSignal): Promise<ProviderKeyModelList> {
    const failed = (code: ProviderModelListFailureCode, extra: { httpStatus?: number; retryAt?: string } = {}): ProviderKeyModelList =>
      ({ credentialId: credential.id, ok: false, models: [], failure: { ...describeModelListFailure(code), ...extra } });
    if (!credential.secret) return failed('NO_KEY');
    if (!route.baseUrl) return failed('ENDPOINT_MISSING');
    let base: URL;
    try { base = assertCredentialBearingUrl(route.baseUrl, 'AGENT_CORE_AI_BASE_URL'); } catch { return failed('ENDPOINT_INSECURE'); }
    base.pathname = `${base.pathname.replace(/\/$/, '')}/models`;
    base.search = ''; base.hash = '';
    const anthropic = route.id === 'anthropic';
    const models: ProviderListedModel[] = [];
    let afterId: string | null = null;
    let truncated = false;
    try {
      for (let page = 0; ; page += 1) {
        const url = new URL(base);
        if (anthropic) {
          url.searchParams.set('limit', '1000');
          if (afterId) url.searchParams.set('after_id', afterId);
        }
        const payload = await this.fetchModelPage(url, route, credential, signal);
        const data = Array.isArray(payload?.data) ? payload.data : null;
        if (!data) return failed('INVALID_RESPONSE');
        for (const raw of data) {
          if (models.length >= MAX_LISTED_MODELS) { truncated = true; break; }
          const listed = listedModel(raw, anthropic);
          if (listed && !models.some(model => model.id === listed.id)) models.push(listed);
        }
        // Anthropic pages with has_more/last_id; OpenAI-compatible catalogs answer in one page.
        const next = anthropic && payload.has_more === true && typeof payload.last_id === 'string' && payload.last_id ? payload.last_id : null;
        if (!next || truncated) break;
        if (page + 1 >= MAX_MODEL_PAGES) { truncated = true; break; }
        afterId = next;
      }
    } catch (error) {
      signal?.throwIfAborted();
      return failed(...classifyModelListError(error));
    }
    return { credentialId: credential.id, ok: true, models, ...(truncated ? { truncated: true } : {}) };
  }

  private async fetchModelPage(url: URL, route: ReadinessRoute, credential: ReadinessCredential, signal?: AbortSignal): Promise<any> {
    const response = await fetchWithPolicy(url, {
      headers: route.id === 'anthropic'
        ? { 'x-api-key': credential.secret, 'anthropic-version': '2023-06-01',
          ...(route.workspaceId ? { 'anthropic-workspace-id': route.workspaceId } : {}) }
        : { authorization: `Bearer ${credential.secret}` }, ...(signal ? { signal } : {}),
    }, { safety: 'safe', maxAttempts: 1, timeoutMs: Math.min(this.timeoutMs, 15_000), maxTotalDelayMs: 0 });
    let payload: any;
    try { payload = await readResponseJsonBounded<any>(response, 4 * 1024 * 1024, 'provider model list'); }
    catch (error) {
      // An error page that is not JSON still has a status worth explaining; a 200 that is not JSON is a broken catalog.
      if (response.ok) throw new ModelListShapeError(error);
      payload = undefined;
    }
    if (!response.ok) {
      const observation = observeProviderResponse(response, payload);
      throw new AgentProviderRequestError({ status: response.status, message: 'MODEL_LIST_UNAVAILABLE',
        safeCode: observation.errorCode, safeType: observation.errorType,
        retryAfterMs: observation.retryAfterMs, resetAtMs: observation.resetAtMs });
    }
    return payload;
  }

  read(route: ReadinessRoute, credential: ReadinessCredential): ProviderModelReadiness | null {
    const cached = this.state.readModelReadiness(route.id, credential.id, readinessDigest(route, credential));
    return unpinnedAlias(route, cached) ? null : cached;
  }

  readForHealth(route: ReadinessRoute, credentials: ReadinessCredential[]): Array<ProviderModelReadiness | null> {
    if (!credentials.length) return [];
    try {
      const snapshot = this.state.readModelReadinessSnapshot(route.id, credentials.map(credential => ({
        id: credential.id, configurationDigest: readinessDigest(route, credential),
      })));
      return credentials.map(credential => {
        const row = snapshot.get(credential.id) ?? null;
        return unpinnedAlias(route, row)
          ? { ...row!, status: 'pending' as const,
            reason: fixedNamedModel(route) ? 'MODEL_EXPLICIT_SELECTION_REQUIRED' : 'MODEL_CONCRETE_TOOL_ROUTE_REQUIRED' } : row;
      });
    } catch { return credentials.map(() => null); }
  }

  async ensure(route: ReadinessRoute, credential: ReadinessCredential, probe: Probe, signal?: AbortSignal, minimumContextTokens = 4_096): Promise<ProviderModelReadiness> {
    signal?.throwIfAborted();
    const digest = readinessDigest(route, credential);
    const cached = this.read(route, credential);
    if (cached && (cached.status !== 'ready' || route.id !== 'anthropic' || cached.reasoningEfforts !== undefined) && cached.retryAtMs > Date.now()
      && (cached.status !== 'ready' || (cached.contextWindowTokens ?? 0) >= minimumContextTokens)) return cached;
    const key = `${route.id}:${credential.id}:${digest}`;
    const existing = this.pending.get(key);
    if (existing) {
      const abort = () => rejectAbort(signal?.reason ?? new Error('MODEL_READINESS_CANCELLED'));
      let rejectAbort!: (reason: unknown) => void;
      const cancelled = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        signal?.throwIfAborted();
        const ready = await Promise.race([existing, cancelled]);
        // The shared verdict was computed for another request size; redo it for this one.
        return (ready.status === 'ready' && (ready.contextWindowTokens ?? 0) < minimumContextTokens)
          || ready.reason === MODEL_CONTEXT_INSUFFICIENT_FOR_REQUEST
          ? this.ensure(route, credential, probe, signal, minimumContextTokens) : ready;
      } finally { signal?.removeEventListener('abort', abort); }
    }
    const work = this.inspect(route, credential, probe, signal, minimumContextTokens).then(metadata => {
      if (metadata.reason !== MODEL_CONTEXT_INSUFFICIENT_FOR_REQUEST) {
        this.state.saveModelReadiness(route.id, credential.id, digest, metadata);
      }
      return metadata;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async inspect(route: ReadinessRoute, credential: ReadinessCredential, probe: Probe, signal: AbortSignal | undefined, minimumContextTokens: number): Promise<ProviderModelReadiness> {
    const result = (status: ProviderModelReadiness['status'], reason: string, model: ModelCandidate | null = null): ProviderModelReadiness => ({
      status, reason, model: model?.id ?? route.model,
      contextWindowTokens: model?.context ?? null, maxOutputTokens: model?.output ?? null,
      checkedAtMs: Date.now(), retryAtMs: Date.now() + (status === 'ready' ? 24 * 60 * 60_000 : 60_000),
      source: 'provider-catalog-and-tool-probe',
      ...(model?.reasoningEfforts ? { reasoningEfforts: model.reasoningEfforts } : {}),
    });
    if (!route.baseUrl) return result('pending', 'MODEL_ENDPOINT_MISSING');
    const url = this.catalogUrl(route);
    let catalog: unknown;
    try {
      catalog = await this.fetchCatalog(url, route, credential, signal);
    } catch (error) {
      signal?.throwIfAborted();
      // No successful catalog means entitlement/capacity remain unknown, never an invented invalid key.
      return result('unavailable', error instanceof AgentProviderRequestError && error.status === 401
        ? 'MODEL_CATALOG_AUTH_UNCONFIRMED' : 'MODEL_CATALOG_UNAVAILABLE');
    }
    // Resolve the pinned alias directly; list pagination must not hide an accessible model.
    const models = route.id === 'anthropic' && route.model
      ? [catalog] : Array.isArray((catalog as any)?.data) ? (catalog as any).data : [];
    const candidates: ModelCandidate[] = [];
    for (const raw of models.slice(0, 2_000)) {
      if (!raw || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 240) continue;
      if (route.id === 'anthropic' && route.model) raw.id = route.model;
      // Keep the user's free-model choice; never substitute a paid model.
      if (requiresConcreteFreeModel(route) && !raw.id.endsWith(':free')) continue;
      // When the owner pins a named provider model, do not silently
      // qualify a different catalog model or override the selected Model ID.
      if (fixedNamedModel(route) && raw.id !== route.model) continue;
      const configured = raw.id === route.model ? route.continuation : undefined;
      // OpenRouter-style top-level fields win; the nested schema-2.x text modality is only a fallback.
      const textIn = textModality(raw.input_modalities), textOut = textModality(raw.output_modalities);
      // Schema 2.x lists output modalities as objects. An entry that offers none of them as text (an embedding,
      // image or audio model) cannot answer a chat turn, whatever its context window says.
      if (Array.isArray(raw.output_modalities) && !textOut
        && raw.output_modalities.some((item: unknown) => item !== null && typeof item === 'object')) continue;
      const context = positive(raw.top_provider?.context_length) ?? positive(raw.context_length)
        ?? positive(raw.max_model_len) ?? positive(raw.max_context_length)
        ?? (route.id === 'anthropic' ? positive(raw.max_input_tokens) : null)
        ?? positive(textIn?.supported_inputs?.max_context_length?.value) ?? positive(configured?.contextWindowTokens);
      const output = positive(raw.top_provider?.max_completion_tokens) ?? positive(raw.max_completion_tokens)
        ?? positive(raw.max_output_tokens) ?? (route.id === 'anthropic' ? positive(raw.max_tokens) : null)
        ?? positive(textOut?.supported_parameters?.max_tokens?.max)
        ?? positive(textOut?.max_length?.value) ?? positive(configured?.maxOutputTokens) ?? (context ? 1_024 : null);
      const supported = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : null;
      const nestedParameters = textOut?.supported_parameters && typeof textOut.supported_parameters === 'object'
        && !Array.isArray(textOut.supported_parameters) ? textOut.supported_parameters : null;
      const tools = typeof raw.supports_tools === 'boolean' ? raw.supports_tools
        : supported ? supported.includes('tools')
        : nestedParameters ? nestedToolsSupported(nestedParameters) : configured?.supportsTools ?? null;
      const promptPrice = Number(raw.pricing?.prompt), completionPrice = Number(raw.pricing?.completion);
      const price = raw.pricing?.prompt != null && raw.pricing?.completion != null
        && Number.isFinite(promptPrice) && promptPrice >= 0 && Number.isFinite(completionPrice) && completionPrice >= 0
        ? promptPrice + completionPrice : Infinity;
      const reasoningEfforts = route.id === 'anthropic' ? supportedEfforts(raw) : undefined;
      if (context && context >= 4_096 && output && tools !== false) candidates.push({ id: raw.id, context, output, tools, price, reasoningEfforts });
    }
    const fitting = candidates.filter(candidate => candidate.context >= minimumContextTokens);
    if (!fitting.length && candidates.length) {
      return result('pending', MODEL_CONTEXT_INSUFFICIENT_FOR_REQUEST,
        candidates.reduce((best, candidate) => candidate.context > best.context ? candidate : best));
    }
    candidates.splice(0, candidates.length, ...fitting);
    candidates.sort((a, b) => Number(b.id === route.model) - Number(a.id === route.model)
      || Number(b.tools === true) - Number(a.tools === true) || (a.price === b.price ? 0 : a.price - b.price) || a.id.localeCompare(b.id));
    if (!candidates.length) return result('pending', 'MODEL_CONTEXT_OR_TOOLS_UNPROVEN');
    const nonce = randomBytes(8).toString('hex');
    for (const model of candidates.slice(0, 3)) {
      try {
        const response = await probe(model.id, [{ role: 'user', content:
          `Compatibility check. Call agent_core_model_probe exactly once with nonce "${nonce}". Do not produce prose.` }],
        [{ type: 'function', function: { name: 'agent_core_model_probe', description: 'Return the supplied nonce; this is a validation probe with no side effects.',
          parameters: { type: 'object', properties: { nonce: { type: 'string', enum: [nonce] } }, required: ['nonce'], additionalProperties: false } } }], signal);
        const call = response.toolCalls.find(item => item.function.name === 'agent_core_model_probe');
        if (call && JSON.parse(call.function.arguments)?.nonce === nonce) return result('ready', 'MODEL_TOOL_PROBE_VERIFIED', model);
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof AgentProviderRequestError && (error.status === 429 || error.status >= 500)) {
          return result('unavailable', 'MODEL_PROBE_TEMPORARILY_UNAVAILABLE', model);
        }
      }
    }
    return result('pending', 'MODEL_ENTITLEMENT_OR_TOOL_PROTOCOL_UNPROVEN');
  }
}
