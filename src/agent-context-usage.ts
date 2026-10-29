import type { AgentModelMessage } from './agent-provider.js';

/**
 * Size of the prompt the provider just received, from that ONE call's usage.
 *
 * Both response normalizers (agent-provider.ts) already report `inputTokens` as the FULL prompt:
 * Anthropic input + cache_creation + cache_read, and OpenAI-style prompt_tokens (which includes cached tokens).
 * Adding cacheRead/cacheWrite again would count the cached part twice. Per-turn metrics are cumulative
 * across calls and must never be used as the context size.
 */
export function contextTokensFromUsage(usage: { inputTokens?: number } | undefined | null): number | undefined {
  const tokens = usage?.inputTokens;
  return typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : undefined;
}

/** Share of the known window in use, in percent (unrounded); null when the capacity is not known. */
export function contextUsagePercent(contextTokens: number, contextWindow: number | null | undefined): number | null {
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0) return null;
  return (contextTokens / contextWindow) * 100;
}

/** Rough per-category prompt size in ESTIMATED tokens (chars / 4). The UI scales these to the provider total; never re-sum them here. */
export interface ContextBreakdown {
  system: number;
  tools: number;
  conversation: number;
  memory: number;
}

export const CHARS_PER_TOKEN = 4;

function messageChars(message: AgentModelMessage): number {
  const content = (message as { content?: unknown }).content;
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  const contentChars = typeof content === 'string' ? content.length : JSON.stringify(content ?? '').length;
  return contentChars + (toolCalls ? JSON.stringify(toolCalls).length : 0);
}

/**
 * Estimates how the prompt of ONE provider call splits across the four UI categories.
 * Message 0 with role 'system' is the system instructions; message 1 with role 'system' is the memory
 * injection (memory packet + guidance); everything else (history summary, history, prompt, assistant replies,
 * tool results) is conversation. Tools are the serialized tool definitions sent with the call.
 */
export function estimateContextBreakdown(messages: AgentModelMessage[], tools: unknown): ContextBreakdown {
  const chars = { system: 0, tools: 0, conversation: 0, memory: 0 };
  messages.forEach((message, index) => {
    const size = messageChars(message);
    if (index === 0 && message.role === 'system') chars.system += size;
    else if (index === 1 && message.role === 'system') chars.memory += size;
    else chars.conversation += size;
  });
  chars.tools = tools === undefined || tools === null || (Array.isArray(tools) && tools.length === 0) ? 0 : JSON.stringify(tools).length;
  const toTokens = (count: number): number => Math.ceil(count / CHARS_PER_TOKEN);
  return { system: toTokens(chars.system), tools: toTokens(chars.tools), conversation: toTokens(chars.conversation), memory: toTokens(chars.memory) };
}
