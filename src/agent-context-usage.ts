import type { AgentModelMessage } from './agent-provider.js';
import { IMAGE_TOKEN_ESTIMATE } from './agent-context-accounting.js';

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
  /** Host Skill guidance text plus the content of any 'skills' tool-role message; absent when there is none to report. */
  skills?: number;
  /** Every other tool-role message (ordinary tool results); absent when there is none to report. */
  toolResults?: number;
}

export interface ContextBreakdownOptions {
  /** Chars of the host-injected Skill guidance text already folded into message 0 (the core system prompt); moved out of `system` into `skills`. */
  skillGuidanceChars?: number;
}

export const CHARS_PER_TOKEN = 4;

function messageChars(message: AgentModelMessage): number {
  // A picture counts as a fixed token estimate (in chars), never as the length of its base64 text.
  const pictureChars = (message.images?.length ?? 0) * IMAGE_TOKEN_ESTIMATE * CHARS_PER_TOKEN;
  // What the provider actually receives for an assistant turn with Anthropic content (text/tool_use/thinking blocks),
  // not the OpenAI-shape content + tool_calls mirror kept for the rest of the pipeline.
  if (message.role === 'assistant' && message.anthropicContent) return JSON.stringify(message.anthropicContent).length + pictureChars;
  const content = (message as { content?: unknown }).content;
  const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
  const contentChars = typeof content === 'string' ? content.length : JSON.stringify(content ?? '').length;
  return contentChars + (toolCalls ? JSON.stringify(toolCalls).length : 0) + pictureChars;
}

function toolsChars(tools: unknown): number {
  return tools === undefined || tools === null || (Array.isArray(tools) && tools.length === 0) ? 0 : JSON.stringify(tools).length;
}

/** Total estimated chars of one provider call's prompt (every message plus the tool definitions), ungrouped. */
export function estimatePromptChars(messages: AgentModelMessage[], tools: unknown): number {
  return messages.reduce((sum, message) => sum + messageChars(message), 0) + toolsChars(tools);
}

/**
 * Estimates how the prompt of ONE provider call splits across the UI categories.
 * Message 0 with role 'system' is the system instructions; message 1 with role 'system' is the memory
 * injection (memory packet + guidance); a 'tool' message named 'skills' is skills, every other 'tool'
 * message is toolResults; everything else (history summary, history, prompt, assistant replies) is
 * conversation. Tools are the serialized tool definitions sent with the call. `skillGuidanceChars` (the
 * host Skill guidance text baked into message 0) is moved out of system and into skills.
 */
export function estimateContextBreakdown(messages: AgentModelMessage[], tools: unknown, options?: ContextBreakdownOptions): ContextBreakdown {
  const skillGuidanceChars = Math.max(0, options?.skillGuidanceChars ?? 0);
  const chars = { system: 0, tools: 0, conversation: 0, memory: 0, skills: 0, toolResults: 0 };
  messages.forEach((message, index) => {
    const size = messageChars(message);
    if (index === 0 && message.role === 'system') chars.system += size;
    else if (index === 1 && message.role === 'system') chars.memory += size;
    else if (message.role === 'tool' && message.name === 'skills') chars.skills += size;
    else if (message.role === 'tool') chars.toolResults += size;
    else chars.conversation += size;
  });
  chars.system = Math.max(0, chars.system - skillGuidanceChars);
  chars.skills += skillGuidanceChars;
  chars.tools = toolsChars(tools);
  const toTokens = (count: number): number => Math.ceil(count / CHARS_PER_TOKEN);
  const breakdown: ContextBreakdown = { system: toTokens(chars.system), tools: toTokens(chars.tools),
    conversation: toTokens(chars.conversation), memory: toTokens(chars.memory) };
  if (chars.skills > 0) breakdown.skills = toTokens(chars.skills);
  if (chars.toolResults > 0) breakdown.toolResults = toTokens(chars.toolResults);
  return breakdown;
}
