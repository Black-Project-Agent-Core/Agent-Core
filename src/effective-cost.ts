// Leaf module of the Native runtime: its only dependency is a type, so loading it (as scripts/inspect/shadow-replay.mjs does
// from dist) can never reach the ActivityTracker singleton. Keep it free of runtime dependencies.
import type { AgentTaskMetrics } from './agent-learning-loop.js';

// Effective task cost (V1 of docs/proposals/Biaya-Efektif-dan-Replay-Tugas-Macet-Native.md). The weights are an accounting
// convention, not an invoice. Priced 2026-07-27 as in the proposal and NOT yet verified against the official price
// documentation. `models` lists the only ids the weights are claimed for; re-verify and re-date before adding one.
const EFFECTIVE_COST_TABLE: {
  pricedOn: string;
  weights: { freshInput: number; cacheRead: number; cacheWrite: number; output: number };
  models: readonly string[];
} = {
  pricedOn: '2026-07-27',
  weights: { freshInput: 1.0, cacheRead: 0.10, cacheWrite: 1.25, output: 5.0 },
  models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
};
type EffectiveCostCounters = Pick<AgentTaskMetrics, 'inputTokens' | 'outputTokens' | 'cacheReadInputTokens' | 'cacheWriteInputTokens'>;
interface EffectiveCostBreakdown {
  total: number;
  components: { fresh: number; cacheRead: number; cacheWrite: number; output: number };
}
interface EffectiveTaskCost {
  label: 'complete' | 'parsial' | 'tidak-berharga';
  total: number | null;
  components: EffectiveCostBreakdown['components'] | null;
  weightsDate: string;
  overhead: EffectiveCostBreakdown | null;
}
function costAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
function weighEffectiveCost(counters: EffectiveCostCounters): EffectiveCostBreakdown {
  const input = costAmount(counters.inputTokens);
  const cacheRead = costAmount(counters.cacheReadInputTokens);
  const cacheWrite = costAmount(counters.cacheWriteInputTokens);
  const { weights } = EFFECTIVE_COST_TABLE;
  // Hundredths of a weighted token keep decimal weights (0.10, 1.25) free of floating-point noise.
  const hundredths = (tokens: number, weight: number) => Math.round(tokens * weight * 100);
  const parts = {
    fresh: hundredths(Math.max(0, input - cacheRead - cacheWrite), weights.freshInput),
    cacheRead: hundredths(cacheRead, weights.cacheRead),
    cacheWrite: hundredths(cacheWrite, weights.cacheWrite),
    output: hundredths(costAmount(counters.outputTokens), weights.output),
  };
  return {
    total: (parts.fresh + parts.cacheRead + parts.cacheWrite + parts.output) / 100,
    components: { fresh: parts.fresh / 100, cacheRead: parts.cacheRead / 100, cacheWrite: parts.cacheWrite / 100, output: parts.output / 100 },
  };
}
/**
 * Effective, cache-aware cost of one Native task in weighted tokens:
 * fresh * 1.0 + cacheRead * 0.10 + cacheWrite * 1.25 + output * 5.0, where
 * fresh = max(0, inputTokens - cacheRead - cacheWrite) because Native's inputTokens already include the cache tokens.
 * Pure: reads and writes nothing and never throws.
 * - metrics: AgentRuntimeTask.metrics, or any object with the same counters.
 * - models: model id(s) the task ran on (AgentRuntimeTask.modelIdentity.identities[].model).
 * - overhead: usage of non-task model calls (REM) that the caller actually measured. It is priced separately and never added
 *   to `total`; null means "not measured", which is not the same as zero cost.
 * Label: 'tidak-berharga' when a model id is missing or not in the dated table (total and components are then null instead
 * of a guessed number); 'parsial' unless modelCalls > 0 and usage, cache read and cache write were each observed on every
 * model call (costUsd coverage does not matter for token weighting); otherwise 'complete'.
 */
export function effectiveTaskCost(
  metrics: EffectiveCostCounters
    & Pick<AgentTaskMetrics, 'modelCalls' | 'usageObservedCalls' | 'cacheReadObservedCalls' | 'cacheWriteObservedCalls'>,
  models: string | readonly (string | null | undefined)[] | null | undefined,
  overhead?: EffectiveCostCounters | null,
): EffectiveTaskCost {
  const ids: readonly (string | null | undefined)[] = typeof models === 'string' ? [models] : models ?? [];
  const weightsDate = EFFECTIVE_COST_TABLE.pricedOn;
  if (!ids.length || !ids.every(id => typeof id === 'string' && EFFECTIVE_COST_TABLE.models.includes(id))) {
    return { label: 'tidak-berharga', total: null, components: null, weightsDate, overhead: null };
  }
  const calls = costAmount(metrics.modelCalls);
  const covered = calls > 0
    && costAmount(metrics.usageObservedCalls) >= calls
    && costAmount(metrics.cacheReadObservedCalls) >= calls
    && costAmount(metrics.cacheWriteObservedCalls) >= calls;
  return { label: covered ? 'complete' : 'parsial', ...weighEffectiveCost(metrics), weightsDate,
    overhead: overhead ? weighEffectiveCost(overhead) : null };
}
