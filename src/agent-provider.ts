import { assertCredentialBearingUrl } from './net/endpoint-policy.js';
import { fetchWithPolicy } from './net/outbound-request.js';
import { readResponseJsonBounded } from './net/bounded-response.js';
import { redactSensitiveString } from './security/redaction.js';
import {
  AgentProviderRequestError,
  classifyAgentProviderFailure,
  observeProviderResponse,
  type AgentProviderResponseObservation,
} from './agent-provider-errors.js';
import {
  PersistentCredentialScheduler,
  type ProviderSchedulerCredential,
} from './agent-provider-scheduler.js';
import type { AgentCapabilityFamily } from './agent-capability-catalog.js';
import type { AgentCapabilityPolicyMode } from './agent-capability-resolver.js';

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
  model?: string;
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

export interface AgentProviderCompletionOptions {
  continuation?: AgentProviderContinuationRequirement;
  attemptLimit?: number;
  onAttempt?: (observation: {
    providerId: string;
    model: string | null;
    attempt: number;
  }) => void | Promise<void>;
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
  ): Promise<AgentModelResponse> {
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
    return {
      content,
      toolCalls,
      finishReason: choice?.finish_reason === undefined || choice.finish_reason === null
        ? null
        : String(choice.finish_reason).slice(0, 100),
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
  private readonly scheduler: PersistentCredentialScheduler;

  constructor(
    readonly config: AgentProviderConfig,
    providerStatePath: string,
  ) {
    this.routes = configuredRoutes(config);
    this.scheduler = new PersistentCredentialScheduler(providerStatePath);
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
      return {
        ...base,
        activeKeyCount: route.keyCount > 0 ? operational.activeCount : 0,
        cooldownKeyCount: route.keyCount > 0 ? operational.cooldownCount : 0,
        quotaBlockedKeyCount: route.keyCount > 0 ? operational.quotaBlockedCount : 0,
        invalidKeyCount: route.keyCount > 0 ? operational.invalidCount : 0,
        breakerState: operational.breakerState,
        ...(isoOrUndefined(operational.nextAvailableAtMs)
          ? { nextAvailableAt: isoOrUndefined(operational.nextAvailableAtMs)! }
          : {}),
        ...(!operational.available && operational.issue ? { issue: operational.issue } : {}),
      };
    });
    const endpointConfigured = routes.filter(route => route.configured);
    const operationalIssue = routes.find(route => route.issue?.startsWith('AGENT_RUNTIME_PROVIDER_STATE_'))?.issue;
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
        : endpointConfigured.length === 0
          ? { issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE' }
          : {}),
    };
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
    if (route.model !== requirement.model) return false;
    if (route.id === requirement.sourceProviderId) return true;
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
  ): NormalizedProviderRoute[] {
    const available = this.routes.filter(route =>
      endpointHealth(route).configured
      && (!continuation || this.routeCompatibleWithContinuation(route, continuation)));
    if (!affinityKey) return available;
    const preferred = this.affinity.get(affinityKey);
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
    const health = this.health();
    if (!health.enabled || !health.configured) {
      throw new Error(health.issue ?? 'AGENT_RUNTIME_PROVIDER_NOT_CONFIGURED');
    }
    if (health.issue?.startsWith('AGENT_RUNTIME_PROVIDER_STATE_')) {
      throw new Error(health.issue);
    }

    const routes = this.orderedRoutes(affinityKey, options.continuation);
    if (!routes.length) {
      throw new Error(options.continuation
        ? 'AGENT_RUNTIME_CONTINUATION_ROUTE_INCOMPATIBLE'
        : 'AGENT_RUNTIME_PROVIDER_NOT_CONFIGURED');
    }
    const configuredMaxAttempts = Math.max(
      1,
      Math.min(
        MAX_PROVIDER_POOL_ATTEMPTS,
        this.config.maxProviderAttempts ?? Math.min(6, Math.max(1, routes.length * 2)),
      ),
    );
    const maxAttempts = options.attemptLimit === undefined
      ? configuredMaxAttempts
      : Math.min(configuredMaxAttempts, Math.max(0, Math.trunc(options.attemptLimit)));
    if (maxAttempts < 1) throw new Error('AGENT_RUNTIME_PROVIDER_ATTEMPT_BUDGET_EXHAUSTED');
    const baseBudget = Math.floor(maxAttempts / routes.length);
    let remainder = maxAttempts % routes.length;
    let networkAttempts = 0;
    const failures: string[] = [];
    const nextAvailable: number[] = [];
    for (const route of routes) {
      if (networkAttempts >= maxAttempts) break;
      const routeBudget = Math.max(1, baseBudget + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder -= 1;
      const excluded = new Set<string>();
      let routeAttempts = 0;

      while (routeAttempts < routeBudget && networkAttempts < maxAttempts) {
        const scheduled = await this.scheduler.select({
          providerId: route.id,
          model: route.model,
          credentials: route.credentials,
          excludedCredentialIds: excluded,
        });
        if (!scheduled.credential) {
          if (scheduled.nextAvailableAtMs !== null) nextAvailable.push(scheduled.nextAvailableAtMs);
          break;
        }

        const selected = scheduled.credential;
        await options.onAttempt?.({
          providerId: route.id,
          model: route.model,
          attempt: networkAttempts + 1,
        });
        const provider = new OpenAICompatibleProvider({
          enabled: true,
          baseUrl: route.baseUrl,
          model: route.model,
          apiKey: selected.secret || null,
          requestTimeoutMs: this.config.requestTimeoutMs,
          maxToolIterations: this.config.maxToolIterations,
        }, observation => {
          this.scheduler.recordObservation({
            providerId: route.id,
            credentialId: selected.id,
            model: route.model,
            observation,
          });
        });
        routeAttempts += 1;
        networkAttempts += 1;
        try {
          const response = await provider.complete(messages, tools, signal);
          this.scheduler.recordSuccess(selected.selection);
          if (affinityKey) this.affinity.set(affinityKey, route.id);
          return {
            ...response,
            providerId: route.id,
            ...(route.model ? { model: route.model } : {}),
          };
        } catch (error) {
          const decision = classifyAgentProviderFailure(error);
          const status = error instanceof AgentProviderRequestError ? error.status : null;
          let persistedRetryAt: number | null = null;
          try {
            persistedRetryAt = this.scheduler.recordFailure({
              selection: selected.selection,
              decision,
              model: route.model,
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
          if (!decision.shouldFailover) throw error;
          excluded.add(selected.id);
          if (persistedRetryAt !== null) nextAvailable.push(persistedRetryAt);
          if (decision.scope === 'provider' || decision.scope === 'model-provider') break;
        }
      }
    }

    const earliest = nextAvailable.filter(value => value > Date.now()).sort((a, b) => a - b)[0];
    const retry = earliest ? `; nextAvailableAt=${new Date(earliest).toISOString()}` : '';
    throw new Error(
      `AGENT_RUNTIME_PROVIDER_POOL_EXHAUSTED${retry}: ${failures.slice(-maxAttempts).join(' | ')}`,
    );
  }

  resetCredential(providerId: string, credentialId: string): boolean {
    return this.scheduler.resetCredential(providerId, credentialId);
  }
}
