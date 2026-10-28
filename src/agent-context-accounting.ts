import type { AgentModelMessage, AgentModelTool } from './agent-provider.js';

/** Tokens kept free for the answer when the provider's own output cap is unknown or larger. */
export const OUTPUT_RESERVE_TOKENS = 1_024;
/** Typical English/code ratio, used only for estimates and triggers, never to admit a request. */
const TYPICAL_BYTES_PER_TOKEN = 4;

export interface ObservedContextUsage {
  /** Provider-reported input tokens for a request whose wire size was `bytes`. */
  inputTokens: number;
  bytes: number;
}

export interface ContextAccounting {
  /** UTF-8 bytes of the request body parts that carry context: messages and tool schemas. */
  bytes: number;
  /** Hard bound: a token spans at least one byte, so tokens never exceed bytes. Any tokenizer. */
  upperBoundTokens: number;
  /** Best guess for triggers and diagnostics. Never used to admit a request the bound refuses. */
  estimatedTokens: number;
  method: 'observed-ratio' | 'bytes-per-4';
  confidence: 'calibrated' | 'heuristic';
  observed?: ObservedContextUsage;
  outputReserve: number;
  /** upperBoundTokens + outputReserve: what a route must hold before it is tried. */
  requiredTokens: number;
}

export function contextBytes(messages: AgentModelMessage[], tools: AgentModelTool[]): number {
  return Buffer.byteLength(JSON.stringify({ messages, tools }), 'utf8');
}

export type ContextSource = 'system' | 'user' | 'assistant' | 'tool' | 'tools';

/** Where the bytes of a request come from: one entry per message role plus the tool schemas. Measures only. */
export function contextBytesBySource(messages: AgentModelMessage[], tools: AgentModelTool[]): Record<ContextSource, number> {
  const bySource: Record<ContextSource, number> = { system: 0, user: 0, assistant: 0, tool: 0, tools: 0 };
  for (const message of messages) bySource[message.role] += Buffer.byteLength(JSON.stringify(message), 'utf8');
  bySource.tools = Buffer.byteLength(JSON.stringify(tools), 'utf8');
  return bySource;
}

/**
 * One accounting for continuation requirements, route admission and compaction triggers.
 * `bytes` may be passed when the caller already serialized the same request.
 */
export function accountContext(
  messages: AgentModelMessage[],
  tools: AgentModelTool[],
  options: { maxOutputTokens?: number; observed?: ObservedContextUsage; bytes?: number } = {},
): ContextAccounting {
  const bytes = options.bytes ?? contextBytes(messages, tools);
  const observed = options.observed && options.observed.inputTokens > 0 && options.observed.bytes > 0
    ? options.observed : undefined;
  const upperBoundTokens = bytes;
  // An observed ratio only ever tightens the estimate toward the bound; it cannot exceed the bound.
  const estimate = observed
    ? Math.ceil(bytes * observed.inputTokens / observed.bytes)
    : Math.ceil(bytes / TYPICAL_BYTES_PER_TOKEN);
  const outputReserve = Math.min(OUTPUT_RESERVE_TOKENS, options.maxOutputTokens ?? OUTPUT_RESERVE_TOKENS);
  return {
    bytes,
    upperBoundTokens,
    estimatedTokens: Math.max(1, Math.min(estimate, upperBoundTokens)),
    method: observed ? 'observed-ratio' : 'bytes-per-4',
    confidence: observed ? 'calibrated' : 'heuristic',
    ...(observed ? { observed } : {}),
    outputReserve,
    requiredTokens: upperBoundTokens + outputReserve,
  };
}

/** Why a route cannot hold the request; names both numbers so a refusal is explainable. */
export function contextRefusal(accounting: ContextAccounting, contextWindowTokens: number): string | null {
  if (accounting.requiredTokens <= contextWindowTokens) return null;
  return 'MODEL_CONTEXT_INSUFFICIENT(bytes=' + accounting.bytes
    + ';required=' + accounting.requiredTokens + ';window=' + contextWindowTokens
    + ';estimate=' + accounting.estimatedTokens + '/' + accounting.method + ')';
}

/** Completion cap that keeps input bytes plus output inside the window (conservative bound). */
export function completionCap(
  accounting: ContextAccounting,
  capacity: { contextWindowTokens: number; maxOutputTokens: number },
): number {
  return Math.min(capacity.maxOutputTokens, capacity.contextWindowTokens - accounting.bytes);
}
