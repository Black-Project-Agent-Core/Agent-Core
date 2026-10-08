import * as z from 'zod/v4';

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const counts = z.strictObject({ successes: count, opportunities: count });
const inputSchema = z.strictObject({
  testsPassed: z.boolean(), attributionComplete: z.boolean(), eligibleIdentityVerified: z.boolean(),
  substantiveActions: count, minimumSamples: count.min(1), candidate: counts, baseline: counts,
});
export interface ControlledOutcomeScore {
  correct: boolean;
  objective: number | null;
  reasonCode: string;
  metrics: Record<string, number>;
}
const rejected = (reasonCode: string): ControlledOutcomeScore => ({ correct:false, objective:null, reasonCode, metrics:{} });

/** Validity and rate difference only. No causal attribution or significance is inferred. */
export function scoreControlledOutcome(input: unknown): ControlledOutcomeScore {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return rejected('invalid-input');
  const value = parsed.data;
  if (!value.testsPassed) return rejected('hard-tests-failed');
  if (!value.attributionComplete) return rejected('attribution-incomplete');
  if (!value.eligibleIdentityVerified) return rejected('identity-unverified');
  if (value.substantiveActions < 1) return rejected('no-substantive-action');
  if (value.candidate.opportunities < value.minimumSamples || value.baseline.opportunities < value.minimumSamples)
    return rejected('insufficient-samples');
  if (value.candidate.successes > value.candidate.opportunities || value.baseline.successes > value.baseline.opportunities)
    return rejected('invalid-success-count');
  const candidateRate = value.candidate.successes / value.candidate.opportunities;
  const baselineRate = value.baseline.successes / value.baseline.opportunities;
  const objective = candidateRate - baselineRate;
  if (!Number.isFinite(objective)) return rejected('nonfinite-objective');
  return { correct:true, objective, reasonCode:'evaluated', metrics:{
    candidateSuccesses:value.candidate.successes, baselineSuccesses:value.baseline.successes,
    candidateSamples:value.candidate.opportunities, baselineSamples:value.baseline.opportunities,
    candidateRate, baselineRate, minimumSamples:value.minimumSamples, substantiveActions:value.substantiveActions,
  } };
}
