import { randomUUID } from 'node:crypto';
import { assertCredentialBearingUrl } from './net/endpoint-policy.js';
import { fetchWithPolicy } from './net/outbound-request.js';
import { readResponseJsonBounded } from './net/bounded-response.js';
import { AnthropicStreamError, readAnthropicMessageStream, statusForStreamError } from './anthropic-stream.js';
import { redactSensitiveString } from './security/redaction.js';
import {
  AgentProviderEmptyResponseError,
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
import { MODEL_CONTEXT_INSUFFICIENT_FOR_REQUEST, ProviderModelReadinessService, REASONING_EFFORT_LEVELS } from './agent-provider-readiness.js';
import type { AgentReasoningEffort, ProviderModelReadiness } from './agent-provider-state.js';

export function validateAgentReasoningEffort(value: unknown, routeId?: string, supported?: readonly AgentReasoningEffort[]): asserts value is AgentReasoningEffort | undefined {
  if (value === undefined) return;
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(value as string)) throw new Error('AGENT_CHAT_REASONING_EFFORT_INVALID');
  if (routeId !== 'anthropic') throw new Error('AGENT_CHAT_REASONING_PROVIDER_UNSUPPORTED');
  if (supported && !supported.includes(value as AgentReasoningEffort)) throw new Error('AGENT_CHAT_REASONING_EFFORT_UNSUPPORTED');
}
export function validateAgentProviderModel(value: unknown, routeId?: string, supported?: readonly string[]): asserts value is string | undefined {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/.test(value)) throw new Error('AGENT_CHAT_MODEL_INVALID');
  if (routeId !== 'anthropic') throw new Error('AGENT_CHAT_MODEL_PROVIDER_UNSUPPORTED');
  if (supported && !supported.includes(value)) throw new Error('AGENT_CHAT_MODEL_UNAVAILABLE');
}
import {
  accountContext, completionCap, contextBytes, contextRefusal, pictureTokens, type ContextAccounting, type ObservedContextUsage,
} from './agent-context-accounting.js';
import { classifyFinishReason } from './agent-turn-outcomes.js';

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
  workspaceId?: string;
  models?: string[];
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
  workspaceId?: string;
  anthropicPromptCaching?: boolean;
  /** Ceiling of the default reasoning effort for the anthropic route; each model gets the highest level it supports up to it. */
  anthropicDefaultReasoningEffort?: AgentReasoningEffort;
  requestTimeoutMs: number;
  maxToolIterations: number;
  /** Window size for goal-mode turns; a window end parks the turn as resumable instead of failing it. */
  goalMaxToolIterations?: number;
  providers?: AgentProviderRouteConfig[];
  providerOrder?: string[];
  maxProviderAttempts?: number;
}

export interface AgentRuntimeConfig extends AgentProviderConfig {
  profile?: import('./agent-profile.js').AgentProfileConfig;
  allowedTools: string[];
  capabilityPolicy?: AgentCapabilityPolicyMode;
  allowedCapabilities?: AgentCapabilityFamily[];
}

/** A picture the model may look at, carried on a tool message; never stored in a checkpoint. */
export interface AgentModelImage {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  dataBase64: string;
}

/** Only the newest `keep` messages that carry pictures stay attached to later provider calls; older ones keep their text. */
export function keepRecentImages(messages: AgentModelMessage[], keep = 2): void {
  let seen = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (!message.images?.length) continue;
    seen += 1;
    if (seen <= keep) continue;
    delete message.images;
    message.content = (message.content ?? '') + '\n[A picture shown on an earlier call is no longer attached.]';
  }
}

/** The copy stored in a checkpoint: pictures are never persisted. */
export function withoutImages(message: AgentModelMessage): AgentModelMessage {
  if (!message.images?.length) return message;
  const { images: _images, ...rest } = message;
  return { ...rest, content: (rest.content ?? '') + '\n[A picture was shown to the model on that call and is not stored.]' };
}

export interface AgentModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  images?: AgentModelImage[];
  name?: string;
  tool_calls?: AgentModelToolCall[];
  anthropicContent?: AgentAnthropicContentBlock[];
  cacheControl?: { type: 'ephemeral' };
}

export type AgentAnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking'; thinking: ''; signature: string }
  | { type: 'redacted_thinking'; data: string };

export function validateAnthropicContent(value: unknown): AgentAnthropicContentBlock[] {
  if (!Array.isArray(value) || value.length > 128) throw new Error('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
  try {
    if (Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024) throw new Error();
  } catch { throw new Error('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID'); }
  const ids = new Set<string>();
  return value.map(block => {
    if (block?.type === 'text' && typeof block.text === 'string') return { type: 'text', text: block.text };
    if (block?.type === 'thinking' && block.thinking === '' && typeof block.signature === 'string' && block.signature) {
      return { type: 'thinking', thinking: '', signature: block.signature };
    }
    if (block?.type === 'redacted_thinking' && typeof block.data === 'string' && block.data) {
      return { type: 'redacted_thinking', data: block.data };
    }
    if (block?.type === 'tool_use') {
      if (typeof block.id !== 'string' || !block.id || block.id !== block.id.trim() || block.id.length > 200 || ids.has(block.id)
        || typeof block.name !== 'string' || !block.name || block.name !== block.name.trim() || block.name.length > 200
        || !block.input || typeof block.input !== 'object' || Array.isArray(block.input) || ids.size >= 32
        || JSON.stringify(block.input).length > 200_000) throw new Error('AGENT_RUNTIME_PROVIDER_TOOL_CALL_INVALID');
      ids.add(block.id);
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    }
    throw new Error('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
  });
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
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number;
    cacheReadInputTokens?: number; cacheWriteInputTokens?: number };
  elapsedMs?: number;
  anthropicContent?: AgentAnthropicContentBlock[];
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
  reasoningEfforts?: AgentReasoningEffort[];
  models?: Array<{ id: string; reasoningEfforts: AgentReasoningEffort[] }>;
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
  workspaceId?: string;
  models?: string[];
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

export type AgentModelStreamEvent = { id: string; type: 'start' | 'end' | 'reset' }
  | { id: string; type: 'delta'; text: string };

export interface AgentProviderCompletionOptions {
  /** Temporary text only; not a completed response or persisted conversation message. */
  onStream?: (event: AgentModelStreamEvent) => void | Promise<void>;
  /**
   * User-chosen route. Only this route is used: it is never rotated away from on failure, so an
   * unavailable choice pauses the turn instead of silently answering from another model.
   */
  routeId?: string;
  model?: string;
  reasoningEffort?: AgentReasoningEffort;
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
// Event framing and many small deltas make a stream larger than the JSON message it rebuilds.
const MAX_PROVIDER_STREAM_BYTES = 8 * 1024 * 1024;
const MAX_PROVIDER_POOL_ATTEMPTS = 18;

function endpoint(config: Pick<AgentProviderConfig, 'baseUrl'>, providerId?: string): URL {
  if (!config.baseUrl) throw new Error('AGENT_RUNTIME_PROVIDER_BASE_URL_MISSING');
  const parsed = assertCredentialBearingUrl(config.baseUrl, 'AGENT_CORE_AI_BASE_URL');
  parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/${providerId === 'anthropic' ? 'messages' : 'chat/completions'}`;
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

function anthropicMessages(messages: AgentModelMessage[], caching: boolean) {
  const system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];
  const turns: Array<{ role: 'user' | 'assistant'; content: Array<Record<string, unknown>> }> = [];
  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content) system.push({ type: 'text', text: message.content,
        ...(caching && message.cacheControl ? { cache_control: message.cacheControl } : {}) });
      continue;
    }
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const content: Array<Record<string, unknown>> = [];
    if (message.role === 'assistant' && message.anthropicContent) {
      content.push(...validateAnthropicContent(message.anthropicContent));
    } else if (message.role === 'tool') {
      if (!message.tool_call_id) throw new Error('AGENT_RUNTIME_PROVIDER_TOOL_CALL_INVALID');
      content.push({ type: 'tool_result', tool_use_id: message.tool_call_id,
        content: message.images?.length
          ? [{ type: 'text', text: message.content ?? '' },
            ...message.images.map(image => ({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.dataBase64 } }))]
          : message.content ?? '' });
    } else {
      if (message.content) content.push({ type: 'text', text: message.content });
      for (const call of message.tool_calls ?? []) {
        let input: unknown;
        try { input = JSON.parse(call.function.arguments); } catch {
          throw new Error('AGENT_RUNTIME_PROVIDER_TOOL_CALL_INVALID');
        }
        if (!call.id || !call.function.name || !input || typeof input !== 'object' || Array.isArray(input)) {
          throw new Error('AGENT_RUNTIME_PROVIDER_TOOL_CALL_INVALID');
        }
        content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
      }
    }
    if (!content.length) continue;
    const previous = turns.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else turns.push({ role, content });
  }
  return { ...(system.length ? { system: caching ? system : system.map(block => block.text).join('\n\n') } : {}), messages: turns };
}

function anthropicResponse(payload: any) {
  if (payload?.type !== 'message' || payload.role !== 'assistant' || !Array.isArray(payload.content)
    || (payload.stop_reason !== null && typeof payload.stop_reason !== 'string')) {
    throw new Error('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
  }
  const text: string[] = [];
  const toolCalls: AgentModelToolCall[] = [];
  const content = validateAnthropicContent(payload.content);
  for (const block of content) {
    if (block.type === 'text') text.push(block.text);
    else if (block.type === 'tool_use') toolCalls.push({ id: block.id, type: 'function',
      function: { name: block.name, arguments: JSON.stringify(block.input) } });
  }
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number;
    prompt_tokens_details: { cached_tokens?: number; cache_write_tokens?: number } } | undefined;
  if (payload.usage !== undefined) {
    const counts = [payload.usage?.input_tokens, payload.usage?.output_tokens,
      payload.usage?.cache_creation_input_tokens ?? 0, payload.usage?.cache_read_input_tokens ?? 0];
    if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) {
      throw new Error('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
    }
    const input = counts[0] + counts[2] + counts[3];
    const total = input + counts[1];
    if (!Number.isSafeInteger(total)) throw new Error('AGENT_RUNTIME_PROVIDER_RESPONSE_INVALID');
    usage = { prompt_tokens: input, completion_tokens: counts[1], total_tokens: total,
      prompt_tokens_details: {
        ...(Number.isSafeInteger(payload.usage.cache_read_input_tokens) ? { cached_tokens: counts[3] } : {}),
        ...(Number.isSafeInteger(payload.usage.cache_creation_input_tokens) ? { cache_write_tokens: counts[2] } : {}),
      } };
  }
  return { model: payload.model, anthropicContent: content, choices: [{ finish_reason: payload.stop_reason,
    message: { content: text.length ? text.join('') : null, tool_calls: toolCalls } }], ...(usage ? { usage } : {}) };
}

export class OpenAICompatibleProvider {
  constructor(
    readonly config: AgentProviderConfig,
    private readonly responseObserver?: ProviderResponseObserver,
    private readonly providerId?: string,
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
      endpoint(this.config, this.providerId);
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
    maxOutputTokens?: number,
    reasoningEffort?: AgentReasoningEffort,
    options: { probe?: boolean; onTextDelta?: (text: string) => void | Promise<void> } = {},
  ): Promise<AgentModelResponse> {
    validateAgentReasoningEffort(reasoningEffort, this.providerId);
    const startedAt = performance.now();
    const health = this.health();
    if (!health.configured || !this.config.model) {
      throw new Error(health.issue ?? 'AGENT_RUNTIME_PROVIDER_NOT_CONFIGURED');
    }
    const anthropic = this.providerId === 'anthropic';
    const caching = anthropic && this.config.anthropicPromptCaching !== false;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (anthropic) {
      headers['anthropic-version'] = '2023-06-01';
      // Native changes system/tools and compacts locally; stale bound thinking must not block the next turn.
      headers['anthropic-beta'] = 'thinking-binding-controls-2026-08-01';
      if (this.config.apiKey) headers['x-api-key'] = this.config.apiKey;
      if (this.config.workspaceId) headers['anthropic-workspace-id'] = this.config.workspaceId;
    } else if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`;
    // Real Anthropic turns stream: one silent non-streaming wait ends at Node's ~5 minute header timeout, long
    // before a max-effort call on a large context is done. Readiness probes are short and stay non-streaming.
    const streaming = anthropic && options.probe !== true;
    const response = await fetchWithPolicy(endpoint(this.config, this.providerId), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        ...(reasoningEffort ? { output_config: { effort: reasoningEffort } } : {}),
        ...(caching ? { cache_control: { type: 'ephemeral' } } : {}),
        ...(anthropic ? { ...anthropicMessages(messages, caching), thinking: { type: 'adaptive', display: 'omitted',
          block_binding: { prefix_mismatch_behavior: 'drop_block' } } }
          : { messages: messages.map(({ anthropicContent: _anthropicContent, cacheControl: _cacheControl, images, ...message }) =>
            images?.length ? { ...message, content: (message.content ?? '') + '\n[A picture was returned but this route cannot show it.]' } : message) }),
        ...(tools.length ? {
          tools: anthropic ? tools.map(tool => ({ name: tool.function.name,
            ...(tool.function.description ? { description: tool.function.description } : {}),
            input_schema: tool.function.parameters })) : tools,
          tool_choice: anthropic ? { type: 'auto' } : 'auto',
        } : {}),
        stream: streaming,
        ...(anthropic || maxOutputTokens ? { max_tokens: maxOutputTokens ?? 4_096 } : {}),
      }),
      ...(signal ? { signal } : {}),
    }, {
      safety: 'non-idempotent',
      maxAttempts: 1,
      timeoutMs: this.config.requestTimeoutMs,
      maxTotalDelayMs: 0,
    });
    // A gateway that ignored `stream` answers with plain JSON; only a real event stream is reassembled.
    const eventStream = streaming && response.ok && /text\/event-stream/i.test(response.headers.get('content-type') ?? '');
    let payload: any;
    if (eventStream) {
      try {
        payload = await readAnthropicMessageStream(response, { maxBytes: MAX_PROVIDER_STREAM_BYTES, label: 'agent provider stream',
          signal, onTextDelta: options.onTextDelta });
      } catch (error) {
        if (!(error instanceof AnthropicStreamError)) throw error;
        const status = statusForStreamError(error.errorType);
        const observed = observeProviderResponse(new Response(null, { status, headers: response.headers }),
          { error: { type: error.errorType, message: error.message } });
        try { this.responseObserver?.(observed); } catch {}
        throw new AgentProviderRequestError({
          status,
          message: `AGENT_RUNTIME_PROVIDER_REQUEST_FAILED:${status}: ${redactSensitiveString(error.message).slice(0, 500)}`,
          safeCode: observed.errorCode,
          safeType: observed.errorType,
          retryAfterMs: observed.retryAfterMs,
          resetAtMs: observed.resetAtMs,
        });
      }
    } else {
      payload = await readResponseJsonBounded<any>(response, MAX_PROVIDER_RESPONSE_BYTES, 'agent provider response');
    }
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
    if (anthropic) payload = anthropicResponse(payload);
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
    const finishReason = choice?.finish_reason === undefined || choice.finish_reason === null
      ? null
      : String(choice.finish_reason).slice(0, 100);
    // An accepted reply that carries nothing is not a success: the turn would end without an answer and
    // the credential's failure history would be cleared. A provider refusal legitimately has no content.
    if (!toolCalls.length && !content?.trim() && classifyFinishReason(finishReason) !== 'refused-by-provider') {
      throw new AgentProviderEmptyResponseError(finishReason);
    }
    const reportedModel = typeof payload.model === 'string' ? payload.model.trim() : '';
    const cacheUsage: { cacheReadInputTokens?: number; cacheWriteInputTokens?: number } = {};
    for (const [wire, field] of [['cached_tokens', 'cacheReadInputTokens'], ['cache_write_tokens', 'cacheWriteInputTokens']] as const) {
      const value = payload.usage?.prompt_tokens_details?.[wire];
      if (Number.isSafeInteger(value) && value >= 0
        && (payload.usage?.prompt_tokens === undefined || value <= payload.usage.prompt_tokens)) cacheUsage[field] = value;
    }
    if (cacheUsage.cacheReadInputTokens !== undefined && cacheUsage.cacheWriteInputTokens !== undefined
      && (!Number.isSafeInteger(cacheUsage.cacheReadInputTokens + cacheUsage.cacheWriteInputTokens)
        || cacheUsage.cacheReadInputTokens + cacheUsage.cacheWriteInputTokens > payload.usage.prompt_tokens)) {
      delete cacheUsage.cacheReadInputTokens;
      delete cacheUsage.cacheWriteInputTokens;
    }
    return {
      content,
      toolCalls,
      ...(anthropic ? { anthropicContent: payload.anthropicContent as AgentAnthropicContentBlock[] } : {}),
      model: this.config.model,
      resolvedModel: reportedModel && reportedModel !== 'openrouter/free'
        && reportedModel.length <= 240 && !/[\u0000-\u001f\u007f]/.test(reportedModel)
        ? reportedModel : null,
      finishReason,
      elapsedMs: Math.max(0, performance.now() - startedAt),
      ...(payload.usage && typeof payload.usage === 'object' ? { usage: {
        ...cacheUsage,
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
    ...(route.workspaceId?.trim() ? { workspaceId: route.workspaceId.trim() } : {}),
    ...(route.models ? { models: [...new Set(route.models)].slice(0, 32) } : {}),
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
      const provider = new OpenAICompatibleProvider({ ...this.config, baseUrl: route.baseUrl, model, apiKey: credential.secret,
        workspaceId: route.workspaceId, anthropicPromptCaching: false }, observation => {
        this.scheduler.recordObservation({ providerId: route.id, credentialId: credential.id, model, observation });
      }, route.id);
      return provider.complete(messages, tools, probeSignal, 1_024, undefined, { probe: true });
    }, signal, minimumContextTokens);
  }

  /** Configuration onboarding never selects a task cursor or creates another state owner. */
  prepareReadiness(): Promise<void> {
    if (this.readinessPreparation) return this.readinessPreparation;
    const work = this.prepareConfiguredModels().finally(() => { this.readinessPreparation = undefined; });
    this.readinessPreparation = work;
    return work;
  }

  /** Reads each configured Anthropic model's catalog entry so the picker can offer its effort levels before the first turn. */
  async refreshModelCapabilities(signal?: AbortSignal): Promise<void> {
    if (!this.config.enabled) return;
    for (const route of this.routes.filter(item => item.id === 'anthropic' && endpointHealth(item).configured)) {
      const keyed = route.credentials.filter(credential => credential.secret);
      await Promise.allSettled([...new Set([route.model, ...(route.models ?? [])])]
        .filter((model): model is string => Boolean(model))
        .map(model => this.readiness.refreshCatalogEfforts({ ...route, model }, keyed, signal)));
    }
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
        ...(route.id === 'anthropic' ? { reasoningEfforts: REASONING_EFFORT_LEVELS.filter(level => {
          const ready = readiness.filter(item => item?.status === 'ready');
          return ready.length > 0 && ready.every(item => item!.reasoningEfforts?.includes(level));
        }) } : {}),
        ...(route.id === 'anthropic' ? { models: [...new Set([route.model, ...(route.models ?? [])])]
          .filter((model): model is string => Boolean(model)).map(id => {
            const keyed = route.credentials.filter(credential => credential.secret);
            const ready = id === route.model ? readiness : this.readiness.readForHealth({ ...route, model: id }, keyed);
            const qualified = ready.filter(item => item?.status === 'ready' && item.retryAtMs > Date.now());
            // Readiness holds one row per key, so only the model each key last probed has one; the catalog answers for the rest.
            return { id, reasoningEfforts: qualified.length > 0
              ? REASONING_EFFORT_LEVELS.filter(level => qualified.every(item => item!.reasoningEfforts?.includes(level)))
              : this.readiness.catalogEffortsOf({ ...route, model: id }, keyed) ?? [] };
          }) } : {}),
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
    requestedModel?: string,
  ): NormalizedProviderRoute[] {
    const available = this.routes.map(route => requestedModel && route.id === pinnedRouteId ? { ...route, model: requestedModel } : route).filter(route =>
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
    const selectedRoute = health.routes?.find(route => route.id === options.routeId);
    validateAgentProviderModel(options.model, options.routeId, selectedRoute?.models?.map(model => model.id) ?? []);
    const selectedEfforts = options.model ? selectedRoute?.models?.find(model => model.id === options.model)?.reasoningEfforts : undefined;
    validateAgentReasoningEffort(options.reasoningEffort, options.routeId, options.model
      ? selectedEfforts?.length ? selectedEfforts : undefined : selectedRoute?.reasoningEfforts ?? []);
    if (health.issue?.startsWith('AGENT_RUNTIME_PROVIDER_STATE_')) {
      throw new Error(health.issue);
    }

    const pinned = options.routeId ? normalizeProviderId(options.routeId) : undefined;
    if (pinned && !this.routes.some(route => route.id === pinned && endpointHealth(route).configured)) {
      throw new Error('AGENT_RUNTIME_PROVIDER_ROUTE_UNAVAILABLE');
    }
    if (!this.orderedRoutes(affinityKey, options.continuation, undefined, pinned, options.model).length) {
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
    const emitStream = async (event: AgentModelStreamEvent): Promise<void> => {
      try { await options.onStream?.(event); } catch { /* Presentation cannot change routing. */ }
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
         for (const route of this.orderedRoutes(affinityKey, options.continuation, undefined, pinned, options.model)) {
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
        const route = this.orderedRoutes(affinityKey, options.continuation, cursor?.providerId, pinned, options.model)
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
          let supportedEfforts: readonly AgentReasoningEffort[] = [];
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
            validateAgentReasoningEffort(options.reasoningEffort, route.id, ready.reasoningEfforts ?? []);
            supportedEfforts = ready.reasoningEfforts ?? [];
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
            workspaceId: route.workspaceId,
            anthropicPromptCaching: this.config.anthropicPromptCaching,
            requestTimeoutMs: this.config.requestTimeoutMs,
            maxToolIterations: this.config.maxToolIterations,
          }, observation => {
            this.scheduler.recordObservation({
              providerId: route.id,
              credentialId: selected.id,
              model: effectiveModel,
              observation,
            });
          }, route.id);
          const streamId = randomUUID();
          let previewChars = 0;
          await emitStream({ type: 'start', id: streamId });
          try {
            // No explicit effort: the anthropic route uses the highest level this model supports up to the configured ceiling.
            const ceiling = route.id === 'anthropic' ? this.config.anthropicDefaultReasoningEffort : undefined;
            const defaultEffort = ceiling
              ? REASONING_EFFORT_LEVELS.slice(0, REASONING_EFFORT_LEVELS.indexOf(ceiling) + 1).reverse()
                .find(level => supportedEfforts.includes(level))
              : undefined;
            const response = await provider.complete(messages, tools, attemptSignal,
              capacity && accounting ? completionCap(accounting, capacity) : undefined, options.reasoningEffort ?? defaultEffort,
              { onTextDelta: async text => {
                const fragment = text.slice(0, Math.max(0, 16_384 - previewChars));
                if (!fragment) return;
                previewChars += fragment.length;
                await emitStream({ type: 'delta', id: streamId, text: fragment });
              } });
            await emitStream({ type: 'end', id: streamId });
            if (response.usage?.inputTokens) {
              // Provider input tokens include the real picture tokens, while wireBytes is text-only: observe the text tokens.
              const textTokens = response.usage.inputTokens - pictureTokens(messages);
              if (textTokens > 0) this.observedInput.set(observedKey, { inputTokens: textTokens, bytes: wireBytes });
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
            await emitStream({ type: 'reset', id: streamId });
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

  /** Releases the temporary locks of one route and returns how many credentials changed. Ids and keys stay here. */
  resetRouteCredentials(providerId: string): number {
    const route = this.routes.find(item => item.id === normalizeProviderId(providerId));
    if (!route) return 0;
    return this.scheduler.releaseLocks(route.id, route.credentials.map(credential => credential.id));
  }

  /** Read-only eligibility counts of one route, for evidence and tests. Ids and keys stay here. */
  routeDiagnostics(providerId: string): ProviderSelectionDiagnostics | null {
    const route = this.routes.find(item => item.id === normalizeProviderId(providerId));
    return route ? this.scheduler.diagnose({ providerId: route.id, model: route.model, credentials: route.credentials }) : null;
  }
}
