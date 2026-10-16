import { evaluateDecisionRecord, type DecisionRecord, type DecisionEvidenceAccess } from './decision-review.js';

interface ForecastPair {
  taskId: string;
  contextKey: string;
  probability: number;
  passed: boolean;
  control: 'proceed' | 'inspect' | 'abstain';
  predictionMeaning: 'technical-invocation-outcome' | 'registered-oracle-check';
}

function summarize(pairs: ForecastPair[]) {
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const successes = pairs.filter(pair => pair.passed), failures = pairs.filter(pair => !pair.passed);
  const proceeded = pairs.filter(pair => pair.control === 'proceed');
  const thresholds = Array.from({ length: 11 }, (_, index) => index / 10);
  return {
    samples: pairs.length,
    distinctTasks: new Set(pairs.map(pair => pair.taskId)).size,
    brierScore: average(pairs.map(pair => (pair.probability - Number(pair.passed)) ** 2)),
    meanConfidence: average(pairs.map(pair => pair.probability)),
    successRate: average(pairs.map(pair => Number(pair.passed))),
    discrimination: {
      metric: 'auroc' as const,
      value: successes.length && failures.length
        ? successes.reduce((sum, positive) => sum + failures.reduce((score, negative) => score
          + (positive.probability > negative.probability ? 1 : positive.probability === negative.probability ? 0.5 : 0), 0), 0)
          / (successes.length * failures.length) : null,
      reason: successes.length && failures.length ? null : 'both-outcome-classes-required',
    },
    reliability: thresholds.slice(0, -1).map(lower => {
      const upper = Math.round((lower + 0.1) * 10) / 10;
      const group = pairs.filter(pair => pair.probability >= lower && (pair.probability < upper || upper === 1 && pair.probability === 1));
      return { lowerInclusive: lower, upper, upperInclusive: upper === 1, samples: group.length,
        meanConfidence: average(group.map(pair => pair.probability)), successRate: average(group.map(pair => Number(pair.passed))) };
    }),
    riskCoverage: thresholds.map(threshold => {
      const selected = pairs.filter(pair => pair.probability >= threshold);
      return { threshold, selected: selected.length, coverage: pairs.length ? selected.length / pairs.length : null,
        risk: average(selected.map(pair => Number(!pair.passed))) };
    }),
    declaredControl: {
      proceeded: proceeded.length,
      inspected: pairs.filter(pair => pair.control === 'inspect').length,
      abstained: pairs.filter(pair => pair.control === 'abstain').length,
      coverage: pairs.length ? proceeded.length / pairs.length : null,
      risk: average(proceeded.map(pair => Number(!pair.passed))),
      abstainedWithObservedPass: pairs.filter(pair => pair.control === 'abstain' && pair.passed).length,
      falseAbstention: 'not-established' as const,
    },
  };
}

/** Read-only replay of existing decision evidence; confidence never becomes authorization or policy. */
export async function evaluateDecisionCalibration(records: readonly DecisionRecord[], access: DecisionEvidenceAccess = { readFiles: false }) {
  const inspected = records.slice(-64), pairs: ForecastPair[] = [];
  const excluded: Array<{ taskId: string; decisionId: string; predictionId: string; reason: string }> = [];
  const monitoring: Array<{ taskId: string; decisionId: string; context: Awaited<ReturnType<typeof evaluateDecisionRecord>>['context']; suggestedControl: Awaited<ReturnType<typeof evaluateDecisionRecord>>['suggestedControl'] }> = [];
  const seen = new Set<string>();
  for (const record of inspected) {
    const evaluated = await evaluateDecisionRecord(record, access);
    monitoring.push({ taskId: record.taskId, decisionId: record.declaration.id,
      context: evaluated.context, suggestedControl: evaluated.suggestedControl });
    for (const prediction of evaluated.predictions) {
      const target = record.declaration.predictions.find(item => item.id === prediction.id);
      const key = JSON.stringify([record.taskId, prediction.predictionMeaning,
        target?.expectedTool ?? [record.verifier?.case.digest, target?.checkIndex]]);
      const reason = seen.has(key) ? 'duplicate-forecast'
        : prediction.probability === undefined ? 'probability-not-declared'
        : !Number.isFinite(prediction.probability) || prediction.probability < 0 || prediction.probability > 1 ? 'probability-invalid'
        : prediction.outcome === 'unknown' ? prediction.reason ?? 'independent-outcome-unavailable'
        : !prediction.prospective ? 'prospective-evidence-unavailable' : undefined;
      seen.add(key);
      if (reason) {
        excluded.push({ taskId: record.taskId, decisionId: record.declaration.id, predictionId: prediction.id, reason });
        continue;
      }
      pairs.push({ taskId: record.taskId, contextKey: evaluated.contextKey, probability: prediction.probability!,
        passed: prediction.outcome === 'pass', control: record.declaration.control, predictionMeaning: prediction.predictionMeaning });
    }
  }
  return {
    version: 1,
    status: pairs.length ? 'descriptive' as const : 'insufficient-evidence' as const,
    unit: 'prospective-verified-prediction' as const,
    goalSuccess: 'not-inferred-from-calibration' as const,
    inspectedDecisions: inspected.length,
    omittedDecisions: records.length - inspected.length,
    ...summarize(pairs),
    populations: [...new Set(pairs.map(pair => pair.predictionMeaning))].map(predictionMeaning => ({ predictionMeaning,
      ...summarize(pairs.filter(pair => pair.predictionMeaning === predictionMeaning)) })),
    contexts: [...new Set(pairs.map(pair => JSON.stringify([pair.contextKey, pair.predictionMeaning])))].map(key => {
      const [contextKey, predictionMeaning] = JSON.parse(key) as [string, ForecastPair['predictionMeaning']];
      return { contextKey, predictionMeaning, ...summarize(pairs.filter(pair => pair.contextKey === contextKey && pair.predictionMeaning === predictionMeaning)) };
    }),
    monitoring,
    excluded,
    calibratedCompetence: 'not-established' as const,
    causalInfluence: 'not-established' as const,
    limitations: [
      'Only prospectively bound oracle checks or host-observed technical invocation outcomes enter these diagnostics; free-text predictions remain unverified.',
      'Technical invocation success does not establish functional or user-goal success. Separate populations identify each forecast meaning; aggregate scores summarize declared binary predictions only.',
      'Known context means sourced observation; inferred context and missing evidence do not establish current applicability or authorization.',
      'Multiple checks in one task are correlated observations, not independent trials; these descriptive scores establish neither statistical significance nor transfer to unseen contexts.',
      'Risk–coverage thresholds describe this observed sample and never select a production policy. Missing outcomes and excluded forecasts may introduce selection bias.',
      'An observed pass after an abstention does not establish a counterfactual false abstention or causal benefit of monitoring or Memory.',
    ],
  };
}
