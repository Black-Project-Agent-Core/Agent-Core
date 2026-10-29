import { assertCredentialBearingUrl } from './net/endpoint-policy.js';
import { fetchWithPolicy } from './net/outbound-request.js';
import { readResponseJsonBounded } from './net/bounded-response.js';
import { redactSensitiveString } from './security/redaction.js';
import {
  AgentProviderRequestError,
  classifyAgentProviderFailure,
  observeProviderResponse,
  type AgentProviderFailureClass,
  type AgentProviderFailureScope,
  type AgentProviderResponseObservation,
} from './agent-provider-errors.js';
import {
  PersistentCredentialScheduler,
  type ProviderRouteStatus,
  type ProviderSchedulerCredential,
  type ProviderSelectionDiagnostics,
  type ProviderSkipReason,
} from './agent-provider-scheduler.js';
import type { AgentCapabilityFamily } from './agent-capability-catalog.js';
import type { AgentCapabilityPolicyMode } from './agent-capability-resolver.js';
import { MODEL_CONTEXT_INSUFFICIENT_FOR_REQUEST, ProviderModelReadinessService } from './agent-provider-readiness.js';
import type { ProviderModelReadiness } from './agent-provider-state.js';
import {
  accountContext, completionCap, contextBytes, contextRefusal, type ContextAccounting, type ObservedContextUsage,
} from './agent-context-accounting.js';

export interface AgentProviderCredentialConfig {
  id: string;
  secret: string;
  ordinal: number;
}

export interface AgentProviderContinuationMetadata {
  supportsTools: boolean;
  modalities: Array<'text'>;
  contextWindowTokens: number;
  maxOutputTokens: number;
  toolCallFormat: 'openai-chat-tool-calls-v1';
}

export interface AgentProviderRouteConfig {
  id: string;
  baseUrl: string | null;
  model: string | null;
  continuation?: AgentProviderContinuationMetadata;
  credentials?: AgentProviderCredentialConfig[];
  /** Backward-compatible input only. Stable IDs are synthesized in order. */
  apiKeys?: string[];
}
export interface AgentProviderConfig {
  enabled: boolean;
  baseUrl: string | null;
  model: string | null;
  apiKey: string | null;
  requestTimeoutMs: number;
  maxToolIterations: number;
  providers?: AgentProviderRouteConfig[];
  providerOrder?: string[];
  maxProviderAttempts?: number;
}

export interface AgentRuntimeConfig extends AgentProviderConfig {
  allowedTools: string[];
  capabilityPolicy?: AgentCapabilityPolicyMode;
  allowedCapabilities?: AgentCapabilityFamily[];
}

export interface AgentModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: AgentModelToolCall[];
}

export interface AgentModelTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface AgentModelToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface AgentModelResponse {
  content: string | null;
  toolCalls: AgentModelToolCall[];
  finishReason: string | null;
  providerId?: string;
  /** Requested model/alias used for continuation; resolvedModel comes from the response. */
  model?: string;
  resolvedModel?: string | null;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number };
  elapsedMs?: number;
}

export interface AgentProviderRouteHealth {
  id: string;
  configured: boolean;
  keyCount: number;
  baseUrl?: string;
  model?: string;
  activeKeyCount?: number;
  cooldownKeyCount?: number;
  quotaBlockedKeyCount?: number;
  invalidKeyCount?: number;
  breakerState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextAvailableAt?: string;
  issue?: string;
  modelReadiness?: { ready: number; pending: number; unavailable: number; models: string[] };
}

export interface AgentProviderHealth {
  provider: 'openai-compatible';
  configured: boolean;
  enabled: boolean;
  baseUrl?: string;
  model?: string;
  providerCount?: number;
  configuredProviderCount?: number;
  keyCount?: number;
  routes?: AgentProviderRouteHealth[];
  issue?: string;
}

type ProviderResponseObserver = (observation: AgentProviderResponseObservation) => void;

interface NormalizedProviderRoute {
  id: string;
  baseUrl: string | null;
  model: string | null;
  continuation?: AgentProviderContinuationMetadata;
  credentials: ProviderSchedulerCredential[];
  keyCount: number;
}

export interface AgentProviderContinuationRequirement {
  sourceProviderId: string;
  model: string;
  minContextTokens: number;
  minOutputTokens: number;
  toolCallFormat: 'openai-chat-tool-calls-v1';
}

/** How this attempt relates to the persisted sticky cursor. */
export type AgentProviderRouteTransition = 'initial' | 'keep' | 'sibling-key' | 'provider-switch';
export interface AgentProviderRoutingKey {
  providerId: string;
  /** Configured credential alias (for example openrouter:02); never the secret. */
  credentialId: string;
  model: string | null;
}
export interface AgentProviderRoutingRoute {
  providerId: string;
  configured: number;
  eligible: number;
  skipped: ProviderSelectionDiagnostics['skipped'];
  status: ProviderRouteStatus;
  /** Network attempts made against this route in the current window. */
  attempts: number;
}
/**
 * Secret-free routing evidence. Every attempt ends in exactly one of success, failure or
 * skip; a window that cannot continue ends in paused with fresh per-route eligibility.
 */
export type AgentProviderRoutingEvent =
  | {
      type: 'attempt';
      attempt: number;
      attemptLimit: number;
      transition: AgentProviderRouteTransition;
      cause: AgentProviderFailureClass | null;
      from: { providerId: string; credentialId: string } | null;
      to: AgentProviderRoutingKey;
      selection: ProviderSelectionDiagnostics;
      left?: {
        providerId: string;
        reason: 'siblings-unavailable' | 'provider-open' | 'model-scope';
        diagnostics: ProviderSelectionDiagnostics | null;
      };
    }
  | {
      type: 'failure';
      attempt: number;
      key: AgentProviderRoutingKey;
      failureClass: AgentProviderFailureClass;
      scope: AgentProviderFailureScope;
      httpStatus: number | null;
      retryAtMs: number | null;
      failover: boolean;
    }
  | { type: 'success'; attempt: number; key: AgentProviderRoutingKey }
  | {
      type: 'skip';
      attempt: number;
      key: AgentProviderRoutingKey;
      reason: 'readiness' | 'context' | 'model-replaced';
    }
  | {
      type: 'paused';
      reason: 'attempt-budget' | 'unavailable' | 'contention';
      retryAtMs: number | null;
      attempt: number;
      attemptLimit: number;
      routes: AgentProviderRoutingRoute[];
    };

export interface AgentProviderCompletionOptions {
  /**
   * User-chosen route. Only this route is used: it is never rotated away from on failure, so an
   * unavailable choice pauses the turn instead of silently answering from another model.
   */
  routeId?: string;
  continuation?: AgentProviderContinuationRequirement;
  attemptLimit?: number;
  onAttempt?: (observation: {
    providerId: string;
    model: string | null;
    attempt: number;
  }) => void | Promise<void>;
  /** Observability only: a throwing sink never changes routing. */
  onRouting?: (event: AgentProviderRoutingEvent) => void | Promise<void>;
}

export class AgentProviderPoolPausedError extends Error {
  constructor(
    readonly reason: 'attempt-budget' | 'unavailable' | 'contention',
    readonly retryAtMs: number | null,
    detail = '',
  ) {
    super(`AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT:${reason}${detail ? ': ' + detail : ''}`);
    this.name = 'AgentProviderPoolPausedError';
  }
}
const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_PROVIDER_POOL_ATTEMPTS = 18;

function endpoint(config: Pick<AgentProviderConfig, 'baseUrl'>): URL {
  if (!config.baseUrl) throw new Error('AGENT_RUNTIME_PROVIDER_BASE_URL_MISSING');
  const parsed = assertCredentialBearingUrl(config.baseUrl, 'AGENT_CORE_AI_BASE_URL');
  const suffix = parsed.pathname.endsWith('/') ? 'chat/completions' : '/chat/completions';
  parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}${suffix}`;
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function sanitizeBaseUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeCredentialId(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return normalized || fallback;
}
export class OpenAICompatibleProvider {
  constructor(
    readonly config: AgentProviderConfig,
    private readonly responseObserver?: ProviderResponseObserver,
  ) {}

  health(): AgentProviderHealth {
    if (!this.config.enabled) {
      return { provider: 'openai-compatible', configured: false, enabled: false };
    }
    const baseUrl = sanitizeBaseUrl(this.config.baseUrl);
    if (!this.config.baseUrl || !this.config.model) {
      return {
        provider: 'openai-compatible', configured: false, enabled: true,
        ...(baseUrl ? { baseUrl } : {}),
        ...(this.config.model ? { model: this.config.model } : {}),
        issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE',
      };
    }
    try {
      endpoint(this.config);
    } catch (error) {
      return {
        provider: 'openai-compatible', configured: false, enabled: true,
        ...(baseUrl ? { baseUrl } : {}),
        model: this.config.model,
        issue: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      provider: 'openai-compatible', configured: true, enabled: true,
      ...(baseUrl ? { baseUrl } : {}), model: this.config.model,
    };
  }
  async complete(
    messages: AgentModelMessage[],
    tools: AgentModelTool[] = [],
    signal?: AbortSignal,
    probeMaxTokens?: number,
  ): Promise<AgentModelResponse> {
    const startedAt = performance.now();
    const health = this.health();
    if (!health.configured || !this.config.model) {
      throw new Error(health.issue ?? 'AGENT_RUNTIME_PROVIDER_NOT_CONFIGURED');
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
    const response = await fetchWithPolicy(endpoint(this.config), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages,
        ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
        stream: false,
        ...(probeMaxTokens ? { max_tokens: probeMaxTokens } : {}),
      }),
      ...(signal ? { signal } : {}),
    }, {
      safety: 'non-idempotent',
      maxAttempts: 1,
      timeoutMs: this.config.requestTimeoutMs,
      maxTotalDelayMs: 0,
    });
    const payload = await readResponseJsonBounded<any>(
      response, MAX_PROVIDER_RESPONSE_BYTES, 'agent provider response',
    );
    const observation = observeProviderResponse(response, payload);
    try { this.responseObserver?.(observation); } catch {}
    if (!response.ok) {
      const providerMessage = typeof payload?.error?.message === 'string'
        ? redactSensitiveString(payload.error.message).slice(0, 500)
        : `HTTP_${response.status}`;
      throw new AgentProviderRequestError({
        status: response.status,
        message: `AGENT_RUNTIME_PROVIDER_REQUEST_FAILED:${response.status}: ${providerMessage}`,
        safeCode: observation.errorCode,
        safeType: observation.errorType,
        retryAfterMs: observation.retryAfterMs,
        resetAtMs: observation.resetAtMs,
      });
    }
    const choice = payload?.choices?.[0];
    const message = choice?.message;
    if (!message || typeof message !== 'object') {
      throw new Error('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
    }
    const toolCalls: AgentModelToolCall[] = Array.isArray(message.tool_calls)
      ? message.tool_calls.slice(0, 32).map((call: any) => {
          const id = String(call?.id ?? '').trim().slice(0, 200);
          const name = String(call?.function?.name ?? '').trim().slice(0, 200);
          const args = String(call?.function?.arguments ?? '').slice(0, 200_000);
          if (!id || !name) throw new Error('AGENT_RUNTIME_PROVIDER_TOOL_CALL_INVALID');
          return {
            id,
            type: 'function' as const,
            function: { name, arguments: args },
          };
        })
      : [];
    const content = message.content === null || message.content === undefined
      ? null
      : String(message.content).slice(0, 200_000);
    const reportedModel = typeof payload.model === 'string' ? payload.model.trim() : '';
    return {
      content,
      toolCalls,
      model: this.config.model,
      resolvedModel: reportedModel && reportedModel !== 'openrouter/free'
        && reportedModel.length <= 240 && !/[\u0000-\u001f\u007f]/.test(reportedModel)
        ? reportedModel : null,
      finishReason: choice?.finish_reason === undefined || choice.finish_reason === null
        ? null
        : String(choice.finish_reason).slice(0, 100),
      elapsedMs: Math.max(0, performance.now() - startedAt),
      ...(payload.usage && typeof payload.usage === 'object' ? { usage: {
        ...(Number.isFinite(payload.usage.prompt_tokens) && payload.usage.prompt_tokens >= 0 ? { inputTokens: payload.usage.prompt_tokens } : {}),
        ...(Number.isFinite(payload.usage.completion_tokens) && payload.usage.completion_tokens >= 0 ? { outputTokens: payload.usage.completion_tokens } : {}),
        ...(Number.isFinite(payload.usage.total_tokens) && payload.usage.total_tokens >= 0 ? { totalTokens: payload.usage.total_tokens } : {}),
        ...(Number.isFinite(payload.usage.cost) && payload.usage.cost >= 0 ? { costUsd: payload.usage.cost } : {}),
      } } : {}),
    };
  }
}

function credentialList(routeId: string, route: AgentProviderRouteConfig): ProviderSchedulerCredential[] {
  const raw = route.credentials?.length
    ? route.credentials.map((credential, index) => ({
        id: normalizeCredentialId(
          credential.id,
          `${routeId}:${String(index + 1).padStart(2, '0')}`,
        ),
        secret: credential.secret.trim(),
        ordinal: Number.isSafeInteger(credential.ordinal) && credential.ordinal >= 0
          ? credential.ordinal : index + 1,
      }))
    : (route.apiKeys ?? []).map((secret, index) => ({
        id: `${routeId}:${String(index + 1).padStart(2, '0')}`,
        secret: secret.trim(),
        ordinal: index + 1,
      }));
  const seenSecrets = new Set<string>();
  const seenIds = new Set<string>();
  const credentials: ProviderSchedulerCredential[] = [];
  for (const candidate of raw) {
    if (!candidate.secret || seenSecrets.has(candidate.secret) || seenIds.has(candidate.id)) continue;
    seenSecrets.add(candidate.secret);
    seenIds.add(candidate.id);
    credentials.push(candidate);
  }
  return credentials.sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
}

function normalizeRoute(route: AgentProviderRouteConfig): NormalizedProviderRoute | null {
  const id = normalizeProviderId(route.id);
  if (!id) return null;
  const credentials = credentialList(id, route);
  return {
    id,
    baseUrl: route.baseUrl,
    model: route.model,
    ...(route.continuation ? { continuation: { ...route.continuation, modalities: [...route.continuation.modalities] } } : {}),
    credentials: credentials.length
      ? credentials
      : [{ id: `${id}:keyless`, secret: '', ordinal: 0 }],
    keyCount: credentials.length,
  };
}

function configuredRoutes(config: AgentProviderConfig): NormalizedProviderRoute[] {
  const named = (config.providers ?? [])
    .map(normalizeRoute)
    .filter((route): route is NormalizedProviderRoute => Boolean(route));
  const byId = new Map(named.map(route => [route.id, route]));
  const ordered: NormalizedProviderRoute[] = [];
  for (const rawId of config.providerOrder ?? []) {
    const id = normalizeProviderId(rawId);
    const route = byId.get(id);
    if (route && !ordered.some(item => item.id === id)) ordered.push(route);
  }
  for (const route of named) {
    if (!ordered.some(item => item.id === route.id)) ordered.push(route);
  }
  if (ordered.length > 0) return ordered;
  if (!config.baseUrl && !config.model && !config.apiKey) return [];
  return [{
    id: 'default',
    baseUrl: config.baseUrl,
    model: config.model,
    credentials: [{
      id: 'default:01',
      secret: config.apiKey?.trim() ?? '',
      ordinal: 1,
    }],
    keyCount: config.apiKey?.trim() ? 1 : 0,
  }];
}

function endpointHealth(route: NormalizedProviderRoute): Omit<AgentProviderRouteHealth, 'activeKeyCount'
  | 'cooldownKeyCount' | 'quotaBlockedKeyCount' | 'invalidKeyCount'
  | 'breakerState' | 'nextAvailableAt'> {
  const baseUrl = sanitizeBaseUrl(route.baseUrl);
  if (!route.baseUrl || !route.model) {
    return {
      id: route.id,
      configured: false,
      keyCount: route.keyCount,
      ...(baseUrl ? { baseUrl } : {}),
      ...(route.model ? { model: route.model } : {}),
      issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE',
    };
  }
  try {
    endpoint({ baseUrl: route.baseUrl });
  } catch (error) {
    return {
      id: route.id,
      configured: false,
      keyCount: route.keyCount,
      ...(baseUrl ? { baseUrl } : {}),
      model: route.model,
      issue: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    id: route.id,
    configured: true,
    keyCount: route.keyCount,
    ...(baseUrl ? { baseUrl } : {}),
    model: route.model,
  };
}

function safeFailureSummary(routeId: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return `${routeId}:${redactSensitiveString(raw).slice(0, 180)}`;
}

function isoOrUndefined(ms: number | null): string | undefined {
  if (ms === null || !Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export class OpenAICompatibleProviderPool {
  private readonly routes: NormalizedProviderRoute[];
  private readonly affinity = new Map<string, string>();
  /** Last provider-reported input tokens per route/model. shortcut: in-memory, lost on restart; persist if cold-start estimates matter. */
  private readonly observedInput = new Map<string, ObservedContextUsage>();
  private readonly scheduler: PersistentCredentialScheduler;
  private readonly readiness: ProviderModelReadinessService;
  private readinessPreparation?: Promise<void>;

  constructor(
    readonly config: AgentProviderConfig,
    providerStatePath: string,
  ) {
    this.routes = configuredRoutes(config);
    this.scheduler = new PersistentCredentialScheduler(providerStatePath);
    this.readiness = new ProviderModelReadinessService(this.scheduler.state, config.requestTimeoutMs);
  }

  private validateModel(route: NormalizedProviderRoute, credential: { id: string; secret: string }, signal?: AbortSignal, minimumContextTokens?: number): Promise<ProviderModelReadiness> {
    return this.readiness.ensure(route, credential, async (model, messages, tools, probeSignal) => {
      const provider = new OpenAICompatibleProvider({ ...this.config, baseUrl: route.baseUrl, model, apiKey: credential.secret }, observation => {
        this.scheduler.recordObservation({ providerId: route.id, credentialId: credential.id, model, observation });
      });
      return provider.complete(messages, tools, probeSignal, 1_024);
    }, signal, minimumContextTokens);
  }

  /** Configuration onboarding never selects a task cursor or creates another state owner. */
  prepareReadiness(): Promise<void> {
    if (this.readinessPreparation) return this.readinessPreparation;
    const work = this.prepareConfiguredModels().finally(() => { this.readinessPreparation = undefined; });
    this.readinessPreparation = work;
    return work;
  }

  private async prepareConfiguredModels(): Promise<void> {
    if (!this.config.enabled) return;
    const work = this.routes.flatMap(route => endpointHealth(route).configured
      ? route.credentials.filter(credential => credential.secret).map(credential => ({ route, credential })) : []);
    let index = 0;
    const results = await Promise.allSettled(Array.from({ length: Math.min(2, work.length) }, async () => {
      while (index < work.length) {
        const item = work[index++]!;
        await this.validateModel(item.route, item.credential);
      }
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }

  health(): AgentProviderHealth {
    if (!this.config.enabled) {
      return {
        provider: 'openai-compatible',
        configured: false,
        enabled: false,
        providerCount: this.routes.length,
        configuredProviderCount: 0,
        keyCount: this.routes.reduce((sum, route) => sum + route.keyCount, 0),
      };
    }
    const routes = this.routes.map(route => {
      const base = endpointHealth(route);
      if (!base.configured) return base;
      const operational = this.scheduler.health(route.id, route.credentials);
      const readiness = this.readiness.readForHealth(route, route.credentials.filter(credential => credential.secret))
        .map(metadata => metadata && metadata.retryAtMs > Date.now() ? metadata : null);
      return {
        ...base,
        activeKeyCount: route.keyCount > 0 ? operational.activeCount : 0,
        cooldownKeyCount: route.keyCount > 0 ? operational.cooldownCount : 0,
        quotaBlockedKeyCount: route.keyCount > 0 ? operational.quotaBlockedCount : 0,
        invalidKeyCount: route.keyCount > 0 ? operational.invalidCount : 0,
        breakerState: operational.breakerState,
        modelReadiness: {
          ready: readiness.filter(item => item?.status === 'ready').length,
          pending: readiness.filter(item => !item || item.status === 'pending').length,
          unavailable: readiness.filter(item => item?.status === 'unavailable').length,
          models: [...new Set(readiness.filter(item => item?.status === 'ready').map(item => item!.model!))].slice(0, 12),
        },
        ...(isoOrUndefined(operational.nextAvailableAtMs)
          ? { nextAvailableAt: isoOrUndefined(operational.nextAvailableAtMs)! }
          : {}),
        ...(!operational.available && operational.issue ? { issue: operational.issue } : {}),
      };
    });
    const endpointConfigured = routes.filter(route => route.configured);
    const operationalIssue = this.scheduler.issue()
      ?? routes.find(route => route.issue?.startsWith('AGENT_RUNTIME_PROVIDER_STATE_'))?.issue;
    const readinessPending = endpointConfigured.length > 0 && !this.routes.some(route => route.keyCount === 0)
      && !routes.some(route => 'modelReadiness' in route && route.modelReadiness?.ready);
    return {
      provider: 'openai-compatible',
      configured: endpointConfigured.length > 0,
      enabled: true,
      providerCount: routes.length,
      configuredProviderCount: endpointConfigured.length,
      keyCount: routes.reduce((sum, route) => sum + route.keyCount, 0),
      routes,
      ...(operationalIssue
        ? { issue: operationalIssue }
        : readinessPending ? { issue: 'AGENT_RUNTIME_MODEL_READINESS_PENDING' }
        : endpointConfigured.length === 0
          ? { issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE' }
          : {}),
    };
  }

  /**
   * Context window the pool knows for a route: the configured contract, else the lowest window a credential
   * of that route was qualified with. Without a route, the lowest known across routes. Null when nothing is known.
   */
  knownContextWindow(providerId?: string): number | null {
    const id = providerId ? normalizeProviderId(providerId) : undefined;
    const windows: number[] = [];
    for (const route of this.routes) {
      if (id && route.id !== id) continue;
      const qualified = route.credentials.flatMap(credential => {
        const ready = credential.secret ? this.readiness.read(route, credential) : null;
        return ready?.status === 'ready' && ready.contextWindowTokens ? [ready.contextWindowTokens] : [];
      });
      const known = route.continuation?.contextWindowTokens ?? (qualified.length ? Math.min(...qualified) : undefined);
      if (known) windows.push(known);
    }
    return windows.length ? Math.min(...windows) : null;
  }

  releaseAffinity(affinityKey: string): void {
    this.affinity.delete(affinityKey);
  }

  setAffinity(affinityKey: string, providerId: string | null | undefined): void {
    const key = affinityKey.trim();
    if (!key) return;
    if (!providerId) {
      this.affinity.delete(key);
      return;
    }
    const id = normalizeProviderId(providerId);
    if (this.routes.some(route => route.id === id)) this.affinity.set(key, id);
  }

  private routeCompatibleWithContinuation(
    route: NormalizedProviderRoute,
    requirement: AgentProviderContinuationRequirement,
  ): boolean {
    if (route.model === requirement.model && route.id === requirement.sourceProviderId) return true;
    const contract = route.continuation;
    if (!contract || contract.supportsTools !== true) return false;
    if (!contract.modalities.includes('text')) return false;
    if (contract.toolCallFormat !== requirement.toolCallFormat) return false;
    if (!Number.isSafeInteger(contract.contextWindowTokens)
      || contract.contextWindowTokens < requirement.minContextTokens) return false;
    if (!Number.isSafeInteger(contract.maxOutputTokens)
      || contract.maxOutputTokens < requirement.minOutputTokens) return false;
    return true;
  }

  private orderedRoutes(
    affinityKey?: string,
    continuation?: AgentProviderContinuationRequirement,
    activeProviderId?: string,
    pinnedRouteId?: string,
  ): NormalizedProviderRoute[] {
    const available = this.routes.filter(route =>
      endpointHealth(route).configured
      && (!pinnedRouteId || route.id === pinnedRouteId)
      && (!continuation || route.keyCount > 0 || this.routeCompatibleWithContinuation(route, continuation)));
    if (pinnedRouteId) return available;
    const preferred = activeProviderId ?? (affinityKey ? this.affinity.get(affinityKey) : undefined);
    if (!preferred) return available;
    const route = available.find(item => item.id === preferred);
    if (!route) return available;
    return [route, ...available.filter(item => item.id !== preferred)];
  }

  async complete(
    messages: AgentModelMessage[],
    tools: AgentModelTool[] = [],
    affinityKey?: string,
    signal?: AbortSignal,
    options: AgentProviderCompletionOptions = {},
  ): Promise<AgentModelResponse> {
    signal?.throwIfAborted();
    // Recovery belongs to a real task and also supports keyless local providers.
    // It validates the existing store without selecting or qualifying a credential.
    this.scheduler.state.recoverAvailability();
    const health = this.health();
    if (!health.enabled || !health.configured) {
      throw new Error(health.issue ?? 'AGENT_RUNTIME_PROVIDER_NOT_CONFIGURED');
    }
    if (health.issue?.startsWith('AGENT_RUNTIME_PROVIDER_STATE_')) {
      throw new Error(health.issue);
    }

    const pinned = options.routeId ? normalizeProviderId(options.routeId) : undefined;
    if (pinned && !this.routes.some(route => route.id === pinned && endpointHealth(route).configured)) {
      throw new Error('AGENT_RUNTIME_PROVIDER_ROUTE_UNAVAILABLE');
    }
    if (!this.orderedRoutes(affinityKey, options.continuation, undefined, pinned).length) {
      throw new Error(pinned ? 'AGENT_RUNTIME_CONTINUATION_ROUTE_INCOMPATIBLE' : options.continuation
        ? 'AGENT_RUNTIME_CONTINUATION_ROUTE_INCOMPATIBLE'
        : 'AGENT_RUNTIME_PROVIDER_NOT_CONFIGURED');
    }
    const configuredMaxAttempts = Math.max(
      1,
      Math.min(
        MAX_PROVIDER_POOL_ATTEMPTS,
        this.config.maxProviderAttempts ?? Math.min(6, Math.max(1, this.routes.length * 2)),
      ),
    );
    const maxAttempts = options.attemptLimit === undefined
      ? configuredMaxAttempts
      : Math.min(configuredMaxAttempts, Math.max(0, Math.trunc(options.attemptLimit)));
    if (maxAttempts < 1) throw new Error('AGENT_RUNTIME_PROVIDER_ATTEMPT_BUDGET_EXHAUSTED');
    const wireBytes = contextBytes(messages, tools);
    let networkAttempts = 0;
    let cursorConflicts = 0;
    const failures: string[] = [];
    const nextAvailable: number[] = [];
    const exhausted = new Set<string>();
    const excluded = new Map<string, Set<string>>();
    const excludedWhy = new Map<string, Map<string, ProviderSkipReason>>();
    const routeAttempts = new Map<string, number>();
    const leftRoutes = new Map<string, NonNullable<Extract<AgentProviderRoutingEvent, { type: 'attempt' }>['left']>>();
    let lastFailureClass: AgentProviderFailureClass | null = null;
    const emitRouting = async (event: AgentProviderRoutingEvent): Promise<void> => {
      if (!options.onRouting) return;
      try { await options.onRouting(event); } catch { /* observability must never become routing authority */ }
    };
    const markWhy = (routeId: string, credentialId: string, reason: ProviderSkipReason): void => {
      const reasons = excludedWhy.get(routeId) ?? new Map<string, ProviderSkipReason>();
      reasons.set(credentialId, reason);
      excludedWhy.set(routeId, reasons);
    };
    const qualifiedFor = (route: NormalizedProviderRoute): Map<string, ProviderModelReadiness> => {
      const qualified = new Map<string, ProviderModelReadiness>();
      for (const credential of route.credentials) {
        const ready = credential.secret ? this.readiness.read(route, credential) : null;
        if (ready?.status === 'ready') qualified.set(credential.id, ready);
      }
      return qualified;
    };
    const diagnoseRoute = (route: NormalizedProviderRoute): ProviderSelectionDiagnostics | null =>
      this.scheduler.diagnose({
        providerId: route.id,
        model: route.model,
        credentials: route.credentials,
        excludedCredentialIds: excluded.get(route.id) ?? new Set<string>(),
        excludedReasons: excludedWhy.get(route.id),
        qualifiedModels: qualifiedFor(route),
      });
    const pausedError = async (
      reason: 'attempt-budget' | 'unavailable' | 'contention',
      retryAtMs: number | null,
      detail = '',
    ): Promise<AgentProviderPoolPausedError> => {
      if (options.onRouting) {
        const routes: AgentProviderRoutingRoute[] = [];
        for (const route of this.orderedRoutes(affinityKey, options.continuation, undefined, pinned)) {
          const diagnostics = diagnoseRoute(route);
          if (!diagnostics) continue;
          routes.push({
            providerId: route.id,
            configured: diagnostics.configured,
            eligible: diagnostics.eligible,
            skipped: diagnostics.skipped,
            status: diagnostics.status,
            attempts: routeAttempts.get(route.id) ?? 0,
          });
        }
        await emitRouting({ type: 'paused', reason, retryAtMs, attempt: networkAttempts, attemptLimit: maxAttempts, routes });
      }
      return new AgentProviderPoolPausedError(reason, retryAtMs, detail);
    };
    while (networkAttempts < maxAttempts) {
        signal?.throwIfAborted();
        const cursor = this.scheduler.readPoolCursor(this.routes.map(route => route.id));
        const route = this.orderedRoutes(affinityKey, options.continuation, cursor?.providerId, pinned)
          .find(candidate => !exhausted.has(candidate.id));
        if (!route) break;
        const skipped = excluded.get(route.id) ?? new Set<string>();
        excluded.set(route.id, skipped);
        const qualifiedModels = new Map<string, ProviderModelReadiness>();
        for (const credential of route.credentials) {
          if (!credential.secret || skipped.has(credential.id)) continue;
          const ready = this.readiness.read(route, credential);
          if (ready?.status === 'ready') qualifiedModels.set(credential.id, ready);
          if (ready && ready.status !== 'ready') {
            skipped.add(credential.id);
            markWhy(route.id, credential.id, 'readiness');
            if (ready.retryAtMs <= Date.now()) {
              // Expired qualification is still unproven. Refresh with the existing
              // bounded workers; selecting it again must not stall a ready route.
              void this.prepareReadiness().catch(() => {});
              nextAvailable.push(Date.now() + 1_000);
            } else nextAvailable.push(ready.retryAtMs);
          }
        }
        const scheduled = await this.scheduler.select({
          providerId: route.id,
          model: route.model,
          credentials: route.credentials,
          excludedCredentialIds: skipped,
          excludedReasons: excludedWhy.get(route.id),
          qualifiedModels,
          trackPool: true,
          expectedPoolRevision: cursor?.revision ?? 0,
          probeLeaseMs: Math.min(this.config.requestTimeoutMs, 15_000) + 4 * this.config.requestTimeoutMs + 1_000,
        });
        if (scheduled.reason === 'pool-changed') {
          if (++cursorConflicts >= 32) throw await pausedError('contention', Date.now() + 1_000);
          continue;
        }
        if (!scheduled.credential) {
          if (scheduled.nextAvailableAtMs !== null) nextAvailable.push(scheduled.nextAvailableAtMs);
          leftRoutes.set(route.id, {
            providerId: route.id,
            reason: scheduled.reason === 'provider-open' ? 'provider-open' : 'siblings-unavailable',
            diagnostics: scheduled.diagnostics ?? null,
          });
          exhausted.add(route.id);
          continue;
        }

        const selected = scheduled.credential;
        let attemptSignal = signal;
        try {
          if (selected.selection.probeExpiresAtMs !== undefined) attemptSignal = AbortSignal.any([
            ...(signal ? [signal] : []), AbortSignal.timeout(Math.max(1, selected.selection.probeExpiresAtMs - Date.now())),
          ]);
          await options.onAttempt?.({
            providerId: route.id,
            model: route.model,
            attempt: networkAttempts + 1,
          });
          if (!this.scheduler.probeIsCurrent(selected.selection)) throw await pausedError('contention', Date.now() + 1_000);
          attemptSignal?.throwIfAborted();
          networkAttempts += 1;
          routeAttempts.set(route.id, (routeAttempts.get(route.id) ?? 0) + 1);
          const attemptNumber = networkAttempts;
          const attemptKey = (model: string | null): AgentProviderRoutingKey => ({
            providerId: route.id, credentialId: selected.id, model,
          });
          if (options.onRouting) {
            const from = cursor ? { providerId: cursor.providerId, credentialId: cursor.credentialId } : null;
            const transition: AgentProviderRouteTransition = !from ? 'initial'
              : from.providerId !== route.id ? 'provider-switch'
                : from.credentialId !== selected.id ? 'sibling-key' : 'keep';
            const left = transition === 'provider-switch' && from ? leftRoutes.get(from.providerId) : undefined;
            await emitRouting({
              type: 'attempt',
              attempt: attemptNumber,
              attemptLimit: maxAttempts,
              transition,
              cause: lastFailureClass,
              from,
              to: attemptKey(route.model),
              selection: scheduled.diagnostics ?? {
                configured: route.credentials.length, eligible: 1, skipped: {}, breaker: 'CLOSED', status: 'available',
              },
              ...(left ? { left } : {}),
            });
          }
          if (!this.scheduler.probeIsCurrent(selected.selection)) throw await pausedError('contention', Date.now() + 1_000);
          attemptSignal?.throwIfAborted();
          let effectiveModel = route.model;
          let capacity = route.continuation;
          if (selected.secret) {
            const ready = await this.validateModel(route, selected, attemptSignal,
              Math.max(options.continuation?.minContextTokens ?? 0, accountContext(messages, tools, { bytes: wireBytes }).requiredTokens));
            if (ready.status !== 'ready') {
              skipped.add(selected.id);
              // A size shortfall cannot be waited out: no retry time, and the reason carries the accounting.
              const tooLarge = ready.reason === MODEL_CONTEXT_INSUFFICIENT_FOR_REQUEST;
              markWhy(route.id, selected.id, tooLarge ? 'context' : 'readiness');
              if (!tooLarge) nextAvailable.push(ready.retryAtMs);
              failures.push(`${route.id}:${(tooLarge
                && contextRefusal(accountContext(messages, tools, { bytes: wireBytes }), ready.contextWindowTokens ?? 0))
                || ready.reason}`);
              await emitRouting({ type: 'skip', attempt: attemptNumber, key: attemptKey(route.model), reason: tooLarge ? 'context' : 'readiness' });
              continue;
            }
            // Qualification may replace a model to satisfy this task's context.
            // Re-select so the replacement's own blocks and quota are checked.
            if ((selected.selection.model ?? route.model) !== ready.model) {
              await emitRouting({ type: 'skip', attempt: attemptNumber, key: attemptKey(route.model), reason: 'model-replaced' });
              continue;
            }
            effectiveModel = ready.model;
            capacity = { supportsTools: true, modalities: ['text'], contextWindowTokens: ready.contextWindowTokens!,
              maxOutputTokens: ready.maxOutputTokens!, toolCallFormat: 'openai-chat-tool-calls-v1' };
          }
          if (options.continuation && capacity && (capacity.contextWindowTokens < options.continuation.minContextTokens
            || capacity.maxOutputTokens < options.continuation.minOutputTokens)) {
            skipped.add(selected.id);
            markWhy(route.id, selected.id, 'context');
            await emitRouting({ type: 'skip', attempt: attemptNumber, key: attemptKey(effectiveModel), reason: 'context' });
            continue;
          }
          // shortcut: JSON bytes conservatively bound input tokens; use a provider tokenizer if tighter packing is needed.
          const observedKey = `${route.id}::${effectiveModel}`;
          const accounting: ContextAccounting | null = capacity
            ? accountContext(messages, tools, { bytes: wireBytes, maxOutputTokens: capacity.maxOutputTokens,
                observed: this.observedInput.get(observedKey) })
            : null;
          const refusal = capacity && accounting ? contextRefusal(accounting, capacity.contextWindowTokens) : null;
          if (refusal) {
            skipped.add(selected.id);
            markWhy(route.id, selected.id, 'context');
            failures.push(`${route.id}:${refusal}`);
            await emitRouting({ type: 'skip', attempt: attemptNumber, key: attemptKey(effectiveModel), reason: 'context' });
            continue;
          }
          if (!this.scheduler.probeIsCurrent(selected.selection)) throw await pausedError('contention', Date.now() + 1_000);
          attemptSignal?.throwIfAborted();
          const provider = new OpenAICompatibleProvider({
            enabled: true,
            baseUrl: route.baseUrl,
            model: effectiveModel,
            apiKey: selected.secret || null,
            requestTimeoutMs: this.config.requestTimeoutMs,
            maxToolIterations: this.config.maxToolIterations,
          }, observation => {
            this.scheduler.recordObservation({
              providerId: route.id,
              credentialId: selected.id,
              model: effectiveModel,
              observation,
            });
          });
          try {
            const response = await provider.complete(messages, tools, attemptSignal,
              capacity && accounting ? completionCap(accounting, capacity) : undefined);
            if (response.usage?.inputTokens) {
              this.observedInput.set(observedKey, { inputTokens: response.usage.inputTokens, bytes: wireBytes });
            }
            this.scheduler.recordSuccess(selected.selection);
            await emitRouting({ type: 'success', attempt: attemptNumber, key: attemptKey(effectiveModel) });
            if (affinityKey) this.affinity.set(affinityKey, route.id);
            return {
              ...response,
              providerId: route.id,
              resolvedModel: response.resolvedModel ?? null,
              ...(effectiveModel ? { model: effectiveModel } : {}),
            };
          } catch (error) {
            attemptSignal?.throwIfAborted();
            const decision = classifyAgentProviderFailure(error);
            const status = error instanceof AgentProviderRequestError ? error.status : null;
            let persistedRetryAt: number | null = null;
            try {
              persistedRetryAt = this.scheduler.recordFailure({
                selection: selected.selection,
                decision,
                model: effectiveModel,
                httpStatus: status,
              });
            } catch (stateError) {
              throw new Error(
                `AGENT_RUNTIME_PROVIDER_STATE_UPDATE_FAILED: ${safeFailureSummary(route.id, stateError)}`,
              );
            }
            failures.push(
              `${route.id}/${selected.id}:${decision.failureClass}:${safeFailureSummary(route.id, error)}`,
            );
            lastFailureClass = decision.failureClass;
            await emitRouting({
              type: 'failure',
              attempt: attemptNumber,
              key: attemptKey(effectiveModel),
              failureClass: decision.failureClass,
              scope: decision.scope,
              httpStatus: status,
              retryAtMs: persistedRetryAt,
              failover: decision.shouldFailover,
            });
            if (!decision.shouldFailover) throw error;
            skipped.add(selected.id);
            // Transient outages leave no persisted per-key verdict; keep the cause for evidence.
            if (decision.failureClass === 'PROVIDER_TRANSIENT' || decision.failureClass === 'TRANSPORT_TRANSIENT') {
              markWhy(route.id, selected.id, 'transient');
            }
            if (persistedRetryAt !== null) nextAvailable.push(persistedRetryAt);
            if (decision.scope === 'model-provider') {
              leftRoutes.set(route.id, { providerId: route.id, reason: 'model-scope', diagnostics: diagnoseRoute(route) });
              exhausted.add(route.id);
            }
          }
        } catch (error) {
          signal?.throwIfAborted();
          if (attemptSignal?.aborted) throw await pausedError('contention', Date.now() + 1_000);
          throw error;
        } finally {
          this.scheduler.releaseProbe(selected.selection);
        }
    }

    const earliest = nextAvailable.filter(value => value > Date.now()).sort((a, b) => a - b)[0];
    const budgetReached = networkAttempts >= maxAttempts;
    throw await pausedError(
      budgetReached ? 'attempt-budget' : 'unavailable',
      budgetReached ? Date.now() + 1_000 : earliest ?? null,
      failures.slice(-maxAttempts).join(' | '),
    );
  }

  resetCredential(providerId: string, credentialId: string): boolean {
    return this.scheduler.resetCredential(providerId, credentialId);
  }
}
