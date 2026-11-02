import { describe, expect, it } from 'vitest';
import { effectiveTaskCost } from '../src/agent-runtime.js';

// Counters as stored in AgentRuntimeTask.metrics. Native's inputTokens already include cache read and write tokens,
// so fresh = 13,000 - 10,000 - 2,000 = 1,000.
const MODEL = 'claude-sonnet-5-5';
const TOKENS = { inputTokens: 13_000, cacheReadInputTokens: 10_000, cacheWriteInputTokens: 2_000, outputTokens: 500 };
const FULL = { ...TOKENS, modelCalls: 3, usageObservedCalls: 3, cacheReadObservedCalls: 3, cacheWriteObservedCalls: 3 };

describe('effectiveTaskCost (V1)', () => {
  it('weighs fresh 1,000 + cache read 10,000 + cache write 2,000 + output 500 as 7,000', () => {
    const cost = effectiveTaskCost(FULL, MODEL);
    expect(cost.total).toBe(7_000);
    expect(cost.components).toEqual({ fresh: 1_000, cacheRead: 1_000, cacheWrite: 2_500, output: 2_500 });
    expect(cost.label).toBe('complete');
    expect(cost.weightsDate).toBe('2026-07-27');
    expect(cost.overhead).toBeNull();
  });

  it.each([
    ['usageObservedCalls', 2],
    ['cacheReadObservedCalls', 1],
    ['cacheWriteObservedCalls', 0],
  ])('labels %s below modelCalls as parsial and still prices the observed tokens', (flag, observed) => {
    const cost = effectiveTaskCost({ ...FULL, [flag]: observed }, MODEL);
    expect(cost.label).toBe('parsial');
    expect(cost.total).toBe(7_000);
  });

  it('labels counters without any coverage flag as parsial', () => {
    expect(effectiveTaskCost(TOKENS, MODEL).label).toBe('parsial');
  });

  it('returns tidak-berharga for an unknown or missing model id without throwing', () => {
    const unpriced = ['not-a-priced-model', [MODEL, 'not-a-priced-model'], [], null, undefined] as const;
    for (const models of unpriced) {
      expect(() => effectiveTaskCost(FULL, models)).not.toThrow();
      const cost = effectiveTaskCost(FULL, models);
      expect(cost.label).toBe('tidak-berharga');
      expect(cost.total).toBeNull();
      expect(cost.components).toBeNull();
    }
  });

  it('reports REM overhead separately and never adds it to the task total', () => {
    const overhead = { inputTokens: 400, cacheReadInputTokens: 100, cacheWriteInputTokens: 0, outputTokens: 20 };
    const cost = effectiveTaskCost(FULL, MODEL, overhead);
    expect(cost.total).toBe(7_000);
    expect(cost.total).toBe(effectiveTaskCost(FULL, MODEL).total);
    // fresh 300 + cache read 100 * 0.10 + output 20 * 5
    expect(cost.overhead?.total).toBe(410);
  });

  it('never lets fresh input go negative when cache counters exceed inputTokens', () => {
    const cost = effectiveTaskCost(
      { ...FULL, inputTokens: 1_000, cacheReadInputTokens: 800, cacheWriteInputTokens: 500, outputTokens: 100 }, MODEL);
    expect(cost.components?.fresh).toBe(0);
    // 800 * 0.10 + 500 * 1.25 + 100 * 5
    expect(cost.total).toBe(1_205);
  });
});
