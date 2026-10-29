import { describe, expect, it } from 'vitest';
import { contextTokensFromUsage, contextUsagePercent } from './agent-context-usage.js';

describe('contextTokensFromUsage', () => {
  it('uses the last call input as the full prompt and never adds cache tokens again', () => {
    expect(contextTokensFromUsage({ inputTokens: 135_000, cacheReadInputTokens: 100_000, cacheWriteInputTokens: 5_000,
      outputTokens: 900 } as any)).toBe(135_000);
  });
  it('is undefined when the provider reported no usable input count', () => {
    expect(contextTokensFromUsage(undefined)).toBeUndefined();
    expect(contextTokensFromUsage({})).toBeUndefined();
    expect(contextTokensFromUsage({ inputTokens: -1 })).toBeUndefined();
    expect(contextTokensFromUsage({ inputTokens: 1.5 })).toBeUndefined();
    expect(contextTokensFromUsage({ inputTokens: 0 })).toBe(0);
  });
});

describe('contextUsagePercent', () => {
  it('computes the share of a known window', () => {
    expect(contextUsagePercent(135_000, 1_000_000)).toBeCloseTo(13.5);
    expect(contextUsagePercent(700_000, 1_000_000)).toBeCloseTo(70);
  });
  it('is null (never a guessed window) when capacity is unknown or invalid', () => {
    expect(contextUsagePercent(135_000, undefined)).toBeNull();
    expect(contextUsagePercent(135_000, null)).toBeNull();
    expect(contextUsagePercent(135_000, 0)).toBeNull();
  });
});
