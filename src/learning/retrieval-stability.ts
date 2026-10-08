export interface StabilityRound {
  iteration: number;
  comparisonKey: string;
  mean: number;
  populationStdDev: number | null;
  sampleCount: number;
}
export interface StabilityConfig {
  absoluteTolerance: number;
  zMultiplier: number;
  consecutiveWindows: number;
}
export interface StabilityWindow {
  fromIteration: number;
  toIteration: number;
  delta: number;
  threshold: number | null;
  stable: boolean | null;
  streak: number;
}

export function analyzeRetrievalStability(rounds: StabilityRound[], config: StabilityConfig) {
  if (!Array.isArray(rounds) || rounds.length > 100) throw new Error('STABILITY_ROUND_COUNT_INVALID');
  if (!Number.isFinite(config.absoluteTolerance) || config.absoluteTolerance <= 0 || config.absoluteTolerance > 1) {
    throw new Error('STABILITY_ABSOLUTE_TOLERANCE_INVALID');
  }
  if (!Number.isFinite(config.zMultiplier) || config.zMultiplier < 0 || config.zMultiplier > 5) {
    throw new Error('STABILITY_Z_MULTIPLIER_INVALID');
  }
  if (!Number.isSafeInteger(config.consecutiveWindows) || config.consecutiveWindows < 1 || config.consecutiveWindows > 20) {
    throw new Error('STABILITY_CONSECUTIVE_WINDOWS_INVALID');
  }
  if (rounds.length < 2) {
    return {
      schemaVersion: 1,
      kind: 'retrieval-stability-advisory',
      status: 'insufficient-data' as const,
      reason: 'at-least-two-comparable-rounds-required',
      windows: [] as StabilityWindow[],
      stopsExecution: false,
    };
  }
  if (new Set(rounds.map(round => round.comparisonKey)).size !== 1) throw new Error('STABILITY_INCOMPARABLE_ROUNDS');
  const ordered = [...rounds].sort((a, b) => a.iteration - b.iteration);
  if (new Set(ordered.map(round => round.iteration)).size !== ordered.length) throw new Error('STABILITY_DUPLICATE_ITERATION');
  for (const round of ordered) {
    if (!Number.isSafeInteger(round.iteration) || round.iteration < 0) throw new Error('STABILITY_ITERATION_INVALID');
    if (!Number.isFinite(round.mean)) throw new Error('STABILITY_MEAN_INVALID');
    if (!Number.isSafeInteger(round.sampleCount) || round.sampleCount < 1) throw new Error('STABILITY_SAMPLE_COUNT_INVALID');
    if (round.populationStdDev !== null && (!Number.isFinite(round.populationStdDev) || round.populationStdDev < 0)) {
      throw new Error('STABILITY_STDDEV_INVALID');
    }
  }

  const windows: StabilityWindow[] = [];
  let streak = 0;
  let unknownDispersion = false;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const delta = Math.abs(current.mean - previous.mean);
    let threshold: number | null = null;
    let stable: boolean | null = null;
    if (previous.populationStdDev === null || current.populationStdDev === null) {
      unknownDispersion = true;
      streak = 0;
    } else {
      const standardError = Math.sqrt(
        (previous.populationStdDev ** 2) / previous.sampleCount
        + (current.populationStdDev ** 2) / current.sampleCount,
      );
      threshold = config.absoluteTolerance + config.zMultiplier * standardError;
      stable = delta <= threshold;
      streak = stable ? streak + 1 : 0;
    }
    windows.push({
      fromIteration: previous.iteration,
      toIteration: current.iteration,
      delta,
      threshold,
      stable,
      streak,
    });
  }

  const stableWindowObserved = windows.some(window => window.streak >= config.consecutiveWindows);
  return {
    schemaVersion: 1,
    kind: 'retrieval-stability-advisory',
    status: stableWindowObserved
      ? 'stable-window-observed' as const
      : unknownDispersion && windows.every(window => window.stable === null)
        ? 'insufficient-data' as const
        : 'not-stable' as const,
    comparisonKey: ordered[0].comparisonKey,
    config: { ...config },
    rounds: ordered,
    windows,
    dispersionEvidence: unknownDispersion ? 'partial-or-missing' : 'observed',
    stopsExecution: false,
    approvalAuthority: false,
  };
}
