import { describe, expect, it } from 'vitest';

async function loadGateEvaluator() {
  const module = await import('../scripts/benchmark-memory-observatory.mjs');
  return module.evaluateObservatoryGates as (input: any) => { passed: boolean; checks: Record<string, boolean> };
}

describe('Memory Observatory benchmark gates', () => {
  it('enforces the published performance and correctness thresholds without widening them', async () => {
    const evaluate = await loadGateEvaluator();
    const passing = evaluate({
      existingPreflightP95Ms: 90,
      baselinePreflightP95Ms: 91,
      instrumentedPreflightP95Ms: 98,
      subscriberPreflightP95Ms: 99,
      persistedToSubscriberP95Ms: 12,
      browserConvergenceP95Ms: 220,
      duplicateSequences: 0,
      undetectedSequenceGaps: 0,
      observerCausedMutationFailures: 0,
      auditWriteOrderRegressions: 0,
    });
    expect(passing.passed).toBe(true);
    expect(Object.values(passing.checks).every(Boolean)).toBe(true);

    const tooSlow = evaluate({
      existingPreflightP95Ms: 90,
      baselinePreflightP95Ms: 100,
      instrumentedPreflightP95Ms: 111,
      subscriberPreflightP95Ms: 109,
      persistedToSubscriberP95Ms: 250,
      browserConvergenceP95Ms: 500,
      duplicateSequences: 0,
      undetectedSequenceGaps: 0,
      observerCausedMutationFailures: 0,
      auditWriteOrderRegressions: 0,
    });
    expect(tooSlow.passed).toBe(false);
    expect(tooSlow.checks.instrumentationOverhead).toBe(false);
    expect(tooSlow.checks.activityLatency).toBe(false);
    expect(tooSlow.checks.graphConvergence).toBe(false);
  });
});
