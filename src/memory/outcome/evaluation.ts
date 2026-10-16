import { parseOutcomeSuite, parseOutcomeObservation, validateOutcomePairs, outcomeDigest, type Arm, type OutcomeSuite, type OutcomeObservation } from './contract.js';
import { verifyWorkflowAnswer } from '../workflow-verifier.js';

export const OUTCOME_EVALUATOR_REVISION = 'agent-core-memory-outcome/v2';
export interface OutcomeCohort {
  domain: 'engineering' | 'research'; controller: 'native' | 'external'; arm: Arm;
  samples: number; expectedSamples: number; correct: number; correctnessRate: number; verifiedUseful: number; usefulnessRate: number;
  attributed: number; rejectedMemory: number; lifecycleComplete: number; lifecycleRate: number;
  toolCalls: number; repeatedFailures: number; injectedBytes: number; injectedTokenEstimate: number;
  retrievalP95Ms: number | null; totalP95Ms: number | null;
  usage: { status: 'available' | 'unavailable'; inputTokens: number | null; outputTokens: number | null };
  cost: { status: 'billed' | 'estimated' | 'unavailable'; amount: number | null; currency: string | null };
}
export interface OutcomeDelta {
  domain: 'engineering' | 'research'; controller: 'native' | 'external'; pairedSamples: number;
  correctness: number; verifiedUsefulness: number; lifecycle: number; cost: number | null; passed: boolean;
}
export interface OutcomeReport {
  version: 'memory-outcome-report/v2'; evaluatorRevision: string; suiteDigest: string; observationsDigest: string; inputsDigest: string;
  phase: 'baseline' | 'compare'; mode: 'offline' | 'live'; driver: 'scripted' | 'real-controller'; runCount: number; expectedRunCount: number;
  complete: boolean; candidateAccepted: boolean; candidateStatus: 'BLOCKED' | 'PASS' | 'FAIL'; benefitProven: boolean;
  cohorts: OutcomeCohort[]; deltas: OutcomeDelta[];
  hardGates: { scopeLeaks: number; staleTrust: number; unsupportedSuccess: number; passed: boolean };
  preregistration: { status: 'BLOCKED' | 'PASS' | 'FAIL'; reasons: string[] };
  efficiencyBenchmark: 'DEFERRED'; reasons: string[]; limitations: string[];
}
const p95 = (values: number[]): number | null => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]! : null;
const median = (values: number[]): number => { const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2); return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2; };
const snapshotIdentity = (row: OutcomeObservation): string => JSON.stringify({ source: row.hashes.sourceRevision, root: row.hashes.rootDistDigest, memory: row.hashes.memoryDistDigest, policy: row.adapter.policy, factory: row.adapter.factoryRevision });
const lifecycle = (row: OutcomeObservation): boolean => row.lifecycle.compliant && !row.lifecycle.harnessRecovered && ['capture', 'persist', 'restart', 'recall', 'action', 'verification', 'receipt', 'review'].every(key => row.lifecycle[key as keyof OutcomeObservation['lifecycle']] === true);
const attributed = (row: OutcomeObservation): boolean => row.arm !== 'off' && row.evidence.receipts.some(receipt => ['applied', 'adapted'].includes(receipt.outcome) && receipt.verified && receipt.taskId === row.taskId && receipt.actionRef === row.artifactRef && receipt.verificationRef === row.verificationRef && row.adapter.selected.some(selected => selected.id === receipt.memoryId && selected.revision === receipt.memoryRevision));
/** Pure replay checks for sealed development evidence. Sidecar creation may defer only the as-yet-unopened candidate timestamp. */
export function validateOutcomePreregistration(suite: OutcomeSuite, rows: OutcomeObservation[], options: { checkCandidateTimestamp?: boolean } = {}): OutcomeReport['preregistration'] {
  const preregReasons: string[] = [], registration = suite.preregistration;
  if (!registration) preregReasons.push('preregistration-missing');
  else {
    const evidence = registration.developmentEvidence;
    if (!evidence) preregReasons.push('development-measurement-evidence-unavailable');
    else {
      const development = evidence.observations, items = suite.cases.filter(item => item.partition === 'development');
      if (items.length !== 4 || ['engineering', 'research'].some(domain => items.filter(item => item.domain === domain).length !== 2)) preregReasons.push('development-fixture-membership-invalid');
      if (outcomeDigest(development) !== registration.developmentDigest) preregReasons.push('development-measurement-digest-mismatch');
      if (Date.parse(evidence.observedAt) >= Date.parse(registration.registeredAt)) preregReasons.push('development-measurement-after-registration');
      const expectedRunIds = items.flatMap(item => ['native', 'external'].flatMap(controller => ['off', 'current'].map(arm => `${item.id}:${controller}:${arm}`)));
      const developmentSuite: OutcomeSuite = { ...suite, cases: suite.cases.map(item => ({ ...item, partition: item.partition === 'development' ? 'heldout' : 'development' })), expectedRunIds: { baseline: expectedRunIds, compare: [] } };
      if (development.some(row => row.arm === 'candidate')) preregReasons.push('development-candidate-forbidden');
      preregReasons.push(...validateOutcomePairs(developmentSuite, development).map(reason => 'development-' + reason));
      const baselineIdentity = rows.find(row => row.arm === 'current');
      for (const row of development) {
        const item = items.find(item => item.id === row.caseId), verification = item ? verifyWorkflowAnswer(item.oracle, row.evidence.artifactText) : null;
        if (!verification || row.correct !== (verification.verdict === 'pass') || row.evidence.verification.verdict !== verification.verdict || row.evidence.verification.unsupportedClaims !== verification.unsupportedClaims) preregReasons.push('development-oracle-result-mismatch:' + row.runId);
        if (!baselineIdentity || snapshotIdentity(row) !== snapshotIdentity(baselineIdentity)) preregReasons.push('development-snapshot-mismatch:' + row.runId);
        if (Object.values(row.violations).some(count => count > 0)) preregReasons.push('development-hard-gates-failed:' + row.runId);
      }
      const baselineMeasurements = development.filter(row => row.arm === 'current');
      if (registration.latency.status === 'measured') {
        const values = baselineMeasurements.map(row => row.latencyMs.total), center = values.length ? median(values) : 0, mad = values.length ? median(values.map(value => Math.abs(value - center))) : null;
        if (!values.length || registration.latency.baselineP95 !== p95(values) || registration.latency.mad !== mad || registration.latency.limitMs !== p95(values)! + 2 * mad!) preregReasons.push('development-latency-does-not-reproduce');
      }
      if (registration.cost.status === 'measured') {
        const known = baselineMeasurements.length > 0 && baselineMeasurements.every(row => row.cost && row.cost.status !== 'unavailable' && row.cost.currency === registration.cost.currency);
        if (!known || registration.cost.baselineAmount !== baselineMeasurements.reduce((sum, row) => sum + (row.cost?.amount ?? 0), 0)) preregReasons.push('development-cost-does-not-reproduce');
      }
    }
    if (options.checkCandidateTimestamp !== false && Date.parse(registration.registeredAt) >= Date.parse(registration.candidateOpenedAt)) preregReasons.push('preregistration-after-candidate');
    if (registration.baselineDigest !== outcomeDigest(rows.filter(row => row.arm !== 'candidate'))) preregReasons.push('preregistration-baseline-mismatch');
    if (registration.latency.status === 'measured' && (registration.latency.baselineP95 === null || registration.latency.mad === null || registration.latency.limitMs !== registration.latency.baselineP95 + 2 * registration.latency.mad)) preregReasons.push('latency-preregistration-invalid');
    if (registration.cost.status === 'measured' && (registration.cost.baselineAmount === null || registration.cost.ceiling === null || !registration.cost.currency)) preregReasons.push('cost-preregistration-invalid');
  }
  return { status: (preregReasons.length ? !registration || preregReasons.every(reason => reason === 'development-measurement-evidence-unavailable') ? 'BLOCKED' : 'FAIL' : 'PASS') as 'BLOCKED' | 'PASS' | 'FAIL', reasons: preregReasons };
}
/** Offline immutable observations only. No provider calls, host configuration or production Memory. */
export function evaluateOutcome(suiteInput: OutcomeSuite, rowInput: OutcomeObservation[]): OutcomeReport {
  const suiteDigest = outcomeDigest(suiteInput), observationsDigest = outcomeDigest(rowInput);
  const base = { version: 'memory-outcome-report/v2' as const, evaluatorRevision: OUTCOME_EVALUATOR_REVISION, suiteDigest, observationsDigest, inputsDigest: outcomeDigest('agent-core-memory-outcome-input/v2\0' + suiteDigest + '\0' + observationsDigest) };
  const phase = rowInput.some(row => row.arm === 'candidate') ? 'compare' as const : 'baseline' as const;
  const rejected = (reason: string): OutcomeReport => ({ ...base, phase, mode: suiteInput?.mode === 'live' ? 'live' : 'offline', driver: suiteInput?.driver === 'real-controller' ? 'real-controller' : 'scripted', runCount: rowInput.length, expectedRunCount: 0, complete: false, candidateAccepted: false, candidateStatus: 'BLOCKED', benefitProven: false, cohorts: [], deltas: [], hardGates: { scopeLeaks: 0, staleTrust: 0, unsupportedSuccess: 0, passed: false }, preregistration: { status: 'BLOCKED', reasons: ['invalid-input'] }, efficiencyBenchmark: 'DEFERRED', reasons: [reason], limitations: ['Invalid input is not a completed experiment.'] });
  // Only the offline scripted evidence contract is currently implemented.
  // A caller-controlled mode label cannot manufacture live-controller provenance.
  if (suiteInput?.mode === 'live' || suiteInput?.driver === 'real-controller') return rejected('unsupported-live-evidence');
  let suite: OutcomeSuite, rows: OutcomeObservation[];
  try { suite = parseOutcomeSuite(suiteInput); rows = rowInput.map(parseOutcomeObservation); } catch { return rejected('invalid-input'); }
  const reasons = validateOutcomePairs(suite, rows), cases = new Map(suite.cases.map(item => [item.id, item]));
  const correct = new Map<string, boolean>();
  const hardGates = { scopeLeaks: 0, staleTrust: 0, unsupportedSuccess: 0, passed: false };
  for (const row of rows) {
    const item = cases.get(row.caseId), actual = item ? verifyWorkflowAnswer(item.oracle, row.evidence.artifactText) : { verdict: 'fail', unsupportedClaims: 0 };
    const passed = actual.verdict === 'pass'; correct.set(row.runId, passed);
    if (row.correct !== passed || row.evidence.verification.verdict !== actual.verdict || row.evidence.verification.unsupportedClaims !== actual.unsupportedClaims) reasons.push('oracle-result-mismatch:' + row.runId);
    hardGates.scopeLeaks += row.violations.scopeLeaks; hardGates.staleTrust += row.violations.staleTrust;
    hardGates.unsupportedSuccess += Math.max(row.violations.unsupportedSuccess, row.correct && !passed ? 1 : 0);
  }
  hardGates.passed = hardGates.scopeLeaks === 0 && hardGates.staleTrust === 0 && hardGates.unsupportedSuccess === 0;
  if (!hardGates.passed) reasons.push('hard-gates-failed');
  const cohorts: OutcomeCohort[] = [];
  const arms: Arm[] = phase === 'baseline' ? ['off', 'current'] : ['off', 'current', 'candidate'];
  for (const domain of ['engineering', 'research'] as const) for (const controller of ['native', 'external'] as const) for (const arm of arms) {
    const group = rows.filter(row => cases.get(row.caseId)?.domain === domain && row.controller === controller && row.arm === arm);
    const expectedSamples = suite.cases.filter(item => item.partition === 'heldout' && item.domain === domain).length;
    const correctness = group.filter(row => correct.get(row.runId)).length, attribution = group.filter(attributed).length;
    const useful = group.filter(row => correct.get(row.runId) && attributed(row)).length, completed = group.filter(lifecycle).length;
    const usageAvailable = group.length > 0 && group.every(row => row.usage?.status === 'available');
    const costsKnown = group.length > 0 && group.every(row => row.cost?.status !== undefined && row.cost.status !== 'unavailable') && new Set(group.map(row => row.cost?.currency)).size === 1;
    cohorts.push({ domain, controller, arm, samples: group.length, expectedSamples, correct: correctness, correctnessRate: expectedSamples ? correctness / expectedSamples : 0, verifiedUseful: useful, usefulnessRate: expectedSamples ? useful / expectedSamples : 0, attributed: attribution, rejectedMemory: group.filter(row => row.evidence.receipts.some(receipt => receipt.outcome === 'rejected' && receipt.taskId === row.taskId)).length, lifecycleComplete: completed, lifecycleRate: expectedSamples ? completed / expectedSamples : 0, toolCalls: group.reduce((sum, row) => sum + row.counters.toolCalls, 0), repeatedFailures: group.reduce((sum, row) => sum + row.counters.repeatedFailures, 0), injectedBytes: group.reduce((sum, row) => sum + row.counters.injectedBytes, 0), injectedTokenEstimate: group.reduce((sum, row) => sum + row.counters.injectedTokenEstimate, 0), retrievalP95Ms: p95(group.map(row => row.latencyMs.retrieval)), totalP95Ms: p95(group.map(row => row.latencyMs.total)), usage: { status: usageAvailable ? 'available' : 'unavailable', inputTokens: usageAvailable ? group.reduce((sum, row) => sum + row.usage!.inputTokens!, 0) : null, outputTokens: usageAvailable ? group.reduce((sum, row) => sum + row.usage!.outputTokens!, 0) : null }, cost: { status: costsKnown ? group.every(row => row.cost!.status === 'billed') ? 'billed' : 'estimated' : 'unavailable', amount: costsKnown ? group.reduce((sum, row) => sum + row.cost!.amount!, 0) : null, currency: costsKnown ? group[0]!.cost!.currency : null } });
  }
  const registration = suite.preregistration;
  const preregistration: OutcomeReport['preregistration'] = phase === 'baseline' ? { status: registration ? 'FAIL' : 'BLOCKED', reasons: ['candidate-not-run'] } : validateOutcomePreregistration(suite, rows);
  const deltas: OutcomeDelta[] = [];
  if (phase === 'compare') for (const domain of ['engineering', 'research'] as const) for (const controller of ['native', 'external'] as const) {
    const current = cohorts.find(cohort => cohort.domain === domain && cohort.controller === controller && cohort.arm === 'current')!;
    const candidate = cohorts.find(cohort => cohort.domain === domain && cohort.controller === controller && cohort.arm === 'candidate')!;
    const ids = suite.cases.filter(item => item.partition === 'heldout' && item.domain === domain).map(item => item.id);
    const pairedSamples = ids.filter(caseId => rows.some(row => row.caseId === caseId && row.controller === controller && row.arm === 'current') && rows.some(row => row.caseId === caseId && row.controller === controller && row.arm === 'candidate')).length;
    const allFamilies = new Set(suite.cases.filter(item => item.partition === 'heldout' && item.domain === domain).map(item => item.family)).size === 6;
    const correctness = candidate.correctnessRate - current.correctnessRate, verifiedUsefulness = candidate.usefulnessRate - current.usefulnessRate;
    const latencyOkay = registration?.latency.status !== 'measured' || candidate.totalP95Ms !== null && candidate.totalP95Ms <= registration.latency.limitMs!;
    const costOkay = registration?.cost.status !== 'measured' || candidate.cost.amount !== null && candidate.cost.currency === registration.cost.currency && candidate.cost.amount <= registration.cost.ceiling!;
    deltas.push({ domain, controller, pairedSamples, correctness, verifiedUsefulness, lifecycle: candidate.lifecycleRate - current.lifecycleRate, cost: candidate.cost.amount !== null && current.cost.amount !== null && candidate.cost.currency === current.cost.currency ? candidate.cost.amount - current.cost.amount : null, passed: pairedSamples >= suite.limits.minimumPairedSamples && allFamilies && correctness >= 0 && verifiedUsefulness > (registration?.usefulnessMinDelta ?? 0) && candidate.lifecycleComplete === candidate.expectedSamples && latencyOkay && costOkay });
  }
  const complete = reasons.length === 0;
  const candidateAccepted = phase === 'compare' && complete && preregistration.status === 'PASS' && deltas.length === 4 && deltas.every(delta => delta.passed);
  const candidateStatus = phase === 'baseline' || preregistration.status === 'BLOCKED' || !suite.sourceRevisions.candidate ? 'BLOCKED' : candidateAccepted ? 'PASS' : 'FAIL';
  return { ...base, phase, mode: suite.mode, driver: suite.driver, runCount: rows.length, expectedRunCount: suite.expectedRunIds[phase].length, complete, candidateAccepted, candidateStatus, benefitProven: false, cohorts, deltas, hardGates, preregistration, efficiencyBenchmark: 'DEFERRED', reasons, limitations: ['Scripted lifecycle results do not prove reasoning benefit.', 'Efficiency benchmark DEFERRED; unavailable usage and cost remain unknown.', 'Small fixed cohorts are not population or statistical-significance evidence.', 'Inline evidence is reproducible evidence, not independent source authentication.'] };
}
