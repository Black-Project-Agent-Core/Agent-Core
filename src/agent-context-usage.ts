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
