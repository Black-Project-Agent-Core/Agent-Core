import { createHash } from 'node:crypto';
import { evaluateEngineeringArtifact } from './outcome-safe-engineering.js';
import type { OutcomeSuite, OutcomeObservation, Arm } from './outcome-contract.js';
import type { OutcomeReport, OutcomeCohort, OutcomeDelta } from './outcome-evaluation.js';
// No scorer or schema runtime import. Validate the persisted bytes and repeat the arithmetic.
export const OUTCOME_VERIFIER_REVISION = 'agent-core-memory-outcome-independent/v2';
type Obj = Record<string, any>;
function requireValue(condition: unknown, reason: string): asserts condition { if (!condition) throw new Error(reason); }
function exact(value: unknown, keys: string[]): asserts value is Obj {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid-object');
  requireValue(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), 'invalid-fields');
}
function text(value: unknown): asserts value is string { requireValue(typeof value === 'string', 'invalid-text'); }
function id(value: unknown): asserts value is string { text(value); requireValue(value.length > 0 && value.length <= 240 && /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/.test(value), 'invalid-identity'); }
function hashId(value: unknown): asserts value is string { text(value); requireValue(/^sha256:[a-f0-9]{64}$/.test(value), 'invalid-digest'); }
function num(value: unknown, integer = false): asserts value is number { requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0 && (!integer || Number.isSafeInteger(value)), 'invalid-number'); }
function bool(value: unknown): asserts value is boolean { requireValue(typeof value === 'boolean', 'invalid-boolean'); }
function list(value: unknown): asserts value is any[] { requireValue(Array.isArray(value), 'invalid-list'); }
function hash(value: unknown): string { return 'sha256:' + createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function ref(value: string, kind: string, digest: string): boolean {
  const match = new RegExp('^' + kind + ':([^#]+)#(sha256:[a-f0-9]{64})$').exec(value);
  return !!match && match[2] === digest && match[1]!.startsWith('evidence/') && !match[1]!.includes('\\') && match[1]!.split('/').every(piece => !!piece && piece !== '.' && piece !== '..');
}
function readSuite(value: unknown): OutcomeSuite {
  exact(value, ['version', 'mode', 'driver', 'cases', 'expectedRunIds', 'sourceRevisions', 'armOrder', 'limits', 'preregistration', 'preregistrationDigest']);
  requireValue(value.version === 'memory-outcome/v2' && ['offline', 'live'].includes(value.mode) && ['scripted', 'real-controller'].includes(value.driver), 'unsupported-suite');
  list(value.cases); requireValue(value.cases.length > 0, 'empty-suite');
  const seen = new Set<string>();
  for (const item of value.cases) {
    exact(item, ['id', 'partition', 'domain', 'family', 'input', 'seed', 'oracle', 'config', 'inputDigest', 'oracleDigest', 'seedDigest', 'configDigest']); id(item.id); requireValue(item.id.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item.id), 'invalid-case-identity');
    requireValue(!seen.has(item.id), 'duplicate-case'); seen.add(item.id);
    requireValue(['development', 'heldout'].includes(item.partition) && ['engineering', 'research'].includes(item.domain) && ['relevant-reuse', 'irrelevant', 'stale-evidence', 'user-correction', 'poisoning', 'restart'].includes(item.family), 'invalid-case');
    exact(item.input, ['prompt', 'document']); text(item.input.prompt); text(item.input.document); requireValue(item.input.prompt.length > 0, 'empty-prompt');
    exact(item.seed, ['content', 'kind']); text(item.seed.content); requireValue(['fact', 'procedure'].includes(item.seed.kind), 'invalid-seed');
    exact(item.config, ['model', 'settings', 'tools', 'schemaRevision']); requireValue(item.config.model === null || typeof item.config.model === 'string', 'invalid-model'); exact(item.config.settings, ['driver']); requireValue(item.config.settings.driver === 'scripted-v1', 'invalid-driver'); list(item.config.tools); item.config.tools.forEach(id); id(item.config.schemaRevision);
    if (item.domain === 'engineering') { exact(item.oracle, ['domain', 'tests']); list(item.oracle.tests); requireValue(item.oracle.tests.length > 0 && item.oracle.tests.length <= 100, 'invalid-tests'); for (const test of item.oracle.tests) exact(test, ['input', 'expected']); }
    else { exact(item.oracle, ['domain', 'facts']); list(item.oracle.facts); requireValue(item.oracle.facts.length > 0 && item.oracle.facts.length <= 100, 'invalid-facts'); for (const fact of item.oracle.facts) { exact(fact, Object.hasOwn(fact, 'supersedes') ? ['key', 'value', 'source', 'supersedes'] : ['key', 'value', 'source']); id(fact.key); text(fact.value); id(fact.source); if (fact.supersedes !== undefined) { list(fact.supersedes); fact.supersedes.forEach(id); } } }
    requireValue(item.oracle.domain === item.domain, 'oracle-domain-mismatch');
    for (const key of ['input', 'seed', 'oracle', 'config']) { hashId(item[key + 'Digest']); requireValue(hash(item[key]) === item[key + 'Digest'], key + '-digest-mismatch'); }
    if (value.mode === 'offline') requireValue(value.driver === 'scripted' && item.config.model === null, 'offline-model-forbidden');
  }
  exact(value.expectedRunIds, ['baseline', 'compare']);
  for (const phase of ['baseline', 'compare']) {
    const expected = new Set<string>(); for (const item of value.cases.filter((c: Obj) => c.partition === 'heldout')) for (const controller of ['native', 'external']) for (const arm of phase === 'baseline' ? ['off', 'current'] : ['off', 'current', 'candidate']) expected.add(item.id + ':' + controller + ':' + arm);
    list(value.expectedRunIds[phase]); value.expectedRunIds[phase].forEach(id);
    requireValue(expected.size === value.expectedRunIds[phase].length && new Set(value.expectedRunIds[phase]).size === expected.size && value.expectedRunIds[phase].every((key: string) => expected.has(key)), 'expected-membership-invalid');
  }
  exact(value.sourceRevisions, ['current', 'candidate']); id(value.sourceRevisions.current); if (value.sourceRevisions.candidate !== null) id(value.sourceRevisions.candidate);
  list(value.armOrder); requireValue(value.armOrder.length === 3, 'invalid-arm-order');
  for (const order of value.armOrder) { list(order); requireValue(order.length === 3 && new Set(order).size === 3 && order.every(arm => ['off', 'current', 'candidate'].includes(arm)), 'invalid-arm-order'); }
  requireValue(new Set(value.armOrder.map((order: string[]) => order.join(':'))).size === 3, 'invalid-arm-rotation');
  exact(value.limits, ['minimumPairedSamples', 'maxToolIterations', 'efficiencyBenchmark']); num(value.limits.minimumPairedSamples, true); num(value.limits.maxToolIterations, true); requireValue(value.limits.minimumPairedSamples > 0 && value.limits.maxToolIterations > 0 && value.limits.efficiencyBenchmark === 'DEFERRED', 'invalid-limits');
  if (value.preregistration !== null) {
    const p = value.preregistration; exact(p, Object.hasOwn(p, 'developmentEvidence') ? ['registeredAt', 'candidateOpenedAt', 'baselineDigest', 'developmentDigest', 'correctnessMinDelta', 'usefulnessMinDelta', 'latency', 'cost', 'developmentEvidence'] : ['registeredAt', 'candidateOpenedAt', 'baselineDigest', 'developmentDigest', 'correctnessMinDelta', 'usefulnessMinDelta', 'latency', 'cost']);
    for (const key of ['registeredAt', 'candidateOpenedAt']) { text(p[key]); requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(p[key]) && Number.isFinite(Date.parse(p[key])), 'invalid-timestamp'); }
    hashId(p.baselineDigest); hashId(p.developmentDigest); requireValue(p.correctnessMinDelta === 0, 'invalid-correctness-threshold'); num(p.usefulnessMinDelta);
    exact(p.latency, ['status', 'baselineP95', 'mad', 'limitMs', 'unit', 'method']); requireValue(['DEFERRED', 'measured'].includes(p.latency.status) && p.latency.unit === 'ms' && p.latency.method === 'baseline-p95-plus-2-MAD', 'invalid-latency-registration'); for (const key of ['baselineP95', 'mad', 'limitMs']) if (p.latency[key] !== null) num(p.latency[key]);
    exact(p.cost, ['status', 'baselineAmount', 'ceiling', 'currency', 'method']); requireValue(['DEFERRED', 'measured'].includes(p.cost.status) && p.cost.method === 'measured-baseline-and-approved-ceiling', 'invalid-cost-registration'); for (const key of ['baselineAmount', 'ceiling']) if (p.cost[key] !== null) num(p.cost[key]); if (p.cost.currency !== null) text(p.cost.currency);
    if (p.developmentEvidence !== undefined) { exact(p.developmentEvidence, ['observedAt', 'observations']); text(p.developmentEvidence.observedAt); requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(p.developmentEvidence.observedAt) && Number.isFinite(Date.parse(p.developmentEvidence.observedAt)), 'invalid-development-timestamp'); readRows(p.developmentEvidence.observations); }
    hashId(value.preregistrationDigest); requireValue(hash(p) === value.preregistrationDigest, 'preregistration-digest-mismatch');
  } else requireValue(value.preregistrationDigest === null, 'preregistration-digest-mismatch');
  return value as OutcomeSuite;
}
function readRows(value: unknown): OutcomeObservation[] {
  list(value);
  for (const row of value) {
    exact(row, ['runId', 'caseId', 'arm', 'controller', 'taskId', 'hashes', 'adapter', 'artifactRef', 'verificationRef', 'receiptRefs', 'correct', 'violations', 'lifecycle', 'latencyMs', 'counters', 'usage', 'cost', 'evidence']);
    for (const key of ['runId', 'caseId', 'taskId']) id(row[key]); requireValue(['off', 'current', 'candidate'].includes(row.arm) && ['native', 'external'].includes(row.controller), 'invalid-arm-controller');
    exact(row.hashes, ['inputDigest', 'oracleDigest', 'seedDigest', 'configDigest', 'sourceRevision', 'rootDistDigest', 'memoryDistDigest', 'activationDigest']); for (const key of Object.keys(row.hashes)) key === 'sourceRevision' ? id(row.hashes[key]) : hashId(row.hashes[key]);
    exact(row.adapter, ['engineMode', 'activation', 'policy', 'factoryRevision', 'selected']); requireValue(row.adapter.engineMode === 'experience-v2' && row.adapter.activation === 'synthetic-v2' && ['baseline-v1', 'fusion-feedback-v1'].includes(row.adapter.policy), 'invalid-adapter'); id(row.adapter.factoryRevision); list(row.adapter.selected); for (const selected of row.adapter.selected) { exact(selected, ['id', 'revision', 'score']); id(selected.id); id(selected.revision); requireValue(typeof selected.score === 'number' && Number.isFinite(selected.score), 'invalid-score'); }
    text(row.artifactRef); text(row.verificationRef); requireValue(row.artifactRef.length > 0 && row.verificationRef.length > 0, 'empty-ref'); list(row.receiptRefs); for (const reference of row.receiptRefs) { text(reference); requireValue(reference.length > 0, 'empty-ref'); } bool(row.correct);
    exact(row.violations, ['scopeLeaks', 'staleTrust', 'unsupportedSuccess']); Object.values(row.violations).forEach(value => num(value, true));
    exact(row.lifecycle, ['capture', 'persist', 'restart', 'recall', 'action', 'verification', 'receipt', 'review', 'compliant', 'harnessRecovered']); Object.values(row.lifecycle).forEach(bool);
    exact(row.latencyMs, ['retrieval', 'total']); Object.values(row.latencyMs).forEach(value => num(value));
    exact(row.counters, ['toolCalls', 'repeatedFailures', 'injectedBytes', 'injectedTokenEstimate', 'inferenceCalls']); Object.values(row.counters).forEach(value => num(value, true));
    if (row.usage !== null) { exact(row.usage, ['status', 'inputTokens', 'outputTokens', 'provenance']); requireValue(['available', 'unavailable'].includes(row.usage.status), 'invalid-usage'); for (const key of ['inputTokens', 'outputTokens']) if (row.usage[key] !== null) num(row.usage[key], true); text(row.usage.provenance); requireValue(row.usage.provenance.length > 0, 'empty-provenance'); }
    if (row.cost !== null) { exact(row.cost, ['status', 'amount', 'currency', 'provenance']); requireValue(['billed', 'estimated', 'unavailable'].includes(row.cost.status), 'invalid-cost'); if (row.cost.amount !== null) num(row.cost.amount); if (row.cost.currency !== null) text(row.cost.currency); text(row.cost.provenance); requireValue(row.cost.provenance.length > 0, 'empty-provenance'); }
    exact(row.evidence, ['artifactText', 'verification', 'receipts']); text(row.evidence.artifactText); const verification = row.evidence.verification; exact(verification, ['taskId', 'artifactDigest', 'oracleDigest', 'verdict', 'unsupportedClaims']); id(verification.taskId); hashId(verification.artifactDigest); hashId(verification.oracleDigest); requireValue(['pass', 'fail'].includes(verification.verdict), 'invalid-verdict'); num(verification.unsupportedClaims, true); list(row.evidence.receipts);
    for (const receipt of row.evidence.receipts) { exact(receipt, ['id', 'taskId', 'actionRef', 'memoryId', 'memoryRevision', 'verificationRef', 'outcome', 'verified']); for (const key of ['id', 'taskId', 'memoryId', 'memoryRevision']) id(receipt[key]); text(receipt.actionRef); text(receipt.verificationRef); requireValue(receipt.actionRef.length > 0 && receipt.verificationRef.length > 0 && ['applied', 'adapted', 'rejected'].includes(receipt.outcome), 'invalid-receipt'); bool(receipt.verified); }
  }
  return value as OutcomeObservation[];
}
function checkOracle(oracle: OutcomeSuite['cases'][number]['oracle'], answer: string): { verdict: 'pass' | 'fail'; unsupportedClaims: number } {
  try {
    if (oracle.domain === 'engineering') {
      let passed = true;
      for (const test of oracle.tests) {
        const result = JSON.stringify(evaluateEngineeringArtifact(answer, test.input));
        if (result !== JSON.stringify(test.expected)) passed = false;
      }
      return { verdict: passed ? 'pass' : 'fail', unsupportedClaims: 0 };
    }
    const claims = JSON.parse(answer); requireValue(Array.isArray(claims) && claims.length <= 100, 'invalid-claims');
    let unsupportedClaims = 0, passed = true;
    for (const claim of claims) if (!oracle.facts.some(fact => fact.key === claim.key && fact.value === claim.value && fact.source === claim.source)) unsupportedClaims++;
    for (const fact of oracle.facts) {
      const matches = claims.filter(claim => claim.key === fact.key);
      if (matches.length !== 1 || matches[0].value !== fact.value || matches[0].source !== fact.source || JSON.stringify([...(matches[0].contradictions ?? [])].sort()) !== JSON.stringify([...(fact.supersedes ?? [])].sort())) passed = false;
    }
    return { verdict: passed && unsupportedClaims === 0 ? 'pass' : 'fail', unsupportedClaims };
  } catch { return { verdict: 'fail', unsupportedClaims: 1 }; }
}
function stable(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}
export interface OutcomeVerification { verdict: 'pass' | 'fail'; reasons: string[]; verifierRevision: string; inputsDigest: string; }
export function verifyOutcome(suiteBytes: Uint8Array, rowBytes: Uint8Array, reported: unknown): OutcomeVerification {
  const reasons: string[] = []; let inputsDigest = '';
  try {
    requireValue(suiteBytes.byteLength <= 16 * 1024 * 1024 && rowBytes.byteLength <= 64 * 1024 * 1024, 'artifact-too-large');
    const suite = readSuite(JSON.parse(Buffer.from(suiteBytes).toString('utf8'))), rows = readRows(JSON.parse(Buffer.from(rowBytes).toString('utf8')));
    requireValue(suite.mode === 'offline' && suite.driver === 'scripted', 'unsupported-live-evidence');
    const suiteDigest = hash(suite), observationsDigest = hash(rows); inputsDigest = hash('agent-core-memory-outcome-input/v2\0' + suiteDigest + '\0' + observationsDigest);
    const phase = rows.some(row => row.arm === 'candidate') ? 'compare' : 'baseline';
    const expected = new Set(suite.expectedRunIds[phase]), seen = new Set<string>(), caseMap = new Map(suite.cases.filter(item => item.partition === 'heldout').map(item => [item.id, item]));
    const identities = new Map<string, string>(), correct = new Map<string, boolean>(), attribution = new Map<string, boolean>(), completed = new Map<string, boolean>();
    const hardGates = { scopeLeaks: 0, staleTrust: 0, unsupportedSuccess: 0, passed: false };
    for (const row of rows) {
      requireValue(expected.has(row.runId) && !seen.has(row.runId), 'cohort-membership-invalid'); seen.add(row.runId);
      const item = caseMap.get(row.caseId); requireValue(item && row.runId === `${row.caseId}:${row.controller}:${row.arm}`, 'run-identity-mismatch');
      for (const key of ['inputDigest', 'oracleDigest', 'seedDigest', 'configDigest'] as const) requireValue(row.hashes[key] === item[key], key + '-mismatch');
      requireValue(row.hashes.sourceRevision === (row.arm === 'candidate' ? suite.sourceRevisions.candidate : suite.sourceRevisions.current), 'source-revision-mismatch');
      requireValue(row.arm === 'candidate' || row.adapter.policy === 'baseline-v1', 'baseline-policy-mismatch');
      const identity = JSON.stringify({ revision: row.hashes.sourceRevision, root: row.hashes.rootDistDigest, memory: row.hashes.memoryDistDigest, policy: row.adapter.policy, factory: row.adapter.factoryRevision }), key = row.arm === 'candidate' ? 'candidate' : 'baseline';
      requireValue(!identities.has(key) || identities.get(key) === identity, 'snapshot-drift'); identities.set(key, identity);
      const v = row.evidence.verification, artifactDigest = hash(row.evidence.artifactText);
      requireValue(ref(row.artifactRef, 'artifact', artifactDigest) && v.artifactDigest === artifactDigest, 'artifact-digest-mismatch');
      requireValue(v.taskId === row.taskId && v.oracleDigest === item.oracleDigest && ref(row.verificationRef, 'verification', hash(v)), 'verification-identity-mismatch');
      requireValue(row.receiptRefs.length === row.evidence.receipts.length && new Set(row.receiptRefs).size === row.receiptRefs.length && new Set(row.evidence.receipts.map(receipt => receipt.id)).size === row.evidence.receipts.length, 'receipt-membership-invalid');
      for (let index = 0; index < row.evidence.receipts.length; index++) requireValue(ref(row.receiptRefs[index]!, 'receipt', hash(row.evidence.receipts[index])), 'receipt-digest-mismatch');
      requireValue(suite.mode !== 'offline' || row.counters.inferenceCalls === 0, 'offline-inference-forbidden');
      if (row.usage) requireValue(row.usage.status === 'available' ? row.usage.inputTokens !== null && row.usage.outputTokens !== null : row.usage.inputTokens === null && row.usage.outputTokens === null, 'usage-status-invalid');
      if (row.cost) requireValue(row.cost.status === 'unavailable' ? row.cost.amount === null && row.cost.currency === null : row.cost.amount !== null && !!row.cost.currency, 'cost-status-invalid');
      const checked = checkOracle(item.oracle, row.evidence.artifactText), passed = checked.verdict === 'pass';
      requireValue(row.correct === passed && v.verdict === checked.verdict && v.unsupportedClaims === checked.unsupportedClaims, 'oracle-result-mismatch'); correct.set(row.runId, passed);
      attribution.set(row.runId, row.arm !== 'off' && row.evidence.receipts.some(receipt => (receipt.outcome === 'applied' || receipt.outcome === 'adapted') && receipt.verified && receipt.taskId === row.taskId && receipt.actionRef === row.artifactRef && receipt.verificationRef === row.verificationRef && row.adapter.selected.some(selected => selected.id === receipt.memoryId && selected.revision === receipt.memoryRevision)));
      completed.set(row.runId, row.lifecycle.compliant && !row.lifecycle.harnessRecovered && ['capture', 'persist', 'restart', 'recall', 'action', 'verification', 'receipt', 'review'].every(key => row.lifecycle[key as keyof OutcomeObservation['lifecycle']]));
      hardGates.scopeLeaks += row.violations.scopeLeaks; hardGates.staleTrust += row.violations.staleTrust; hardGates.unsupportedSuccess += Math.max(row.violations.unsupportedSuccess, row.correct && !passed ? 1 : 0);
    }
    requireValue(seen.size === expected.size, 'cohort-membership-invalid');
    hardGates.passed = hardGates.scopeLeaks === 0 && hardGates.staleTrust === 0 && hardGates.unsupportedSuccess === 0;
    const reportReasons = hardGates.passed ? [] : ['hard-gates-failed'];
    const cohorts: OutcomeCohort[] = [], arms: Arm[] = phase === 'baseline' ? ['off', 'current'] : ['off', 'current', 'candidate'];
    const percentile = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]! : null;
    for (const domain of ['engineering', 'research'] as const) for (const controller of ['native', 'external'] as const) for (const arm of arms) {
      const group = rows.filter(row => caseMap.get(row.caseId)!.domain === domain && row.controller === controller && row.arm === arm), n = suite.cases.filter(item => item.partition === 'heldout' && item.domain === domain).length;
      let successes = 0, useful = 0, attributed = 0, rejectedMemory = 0, lifecycleComplete = 0, toolCalls = 0, repeatedFailures = 0, injectedBytes = 0, injectedTokenEstimate = 0, inputTokens = 0, outputTokens = 0, amount = 0;
      let usageKnown = group.length > 0, costsKnown = group.length > 0, billed = true; const currencies = new Set<string | null>();
      for (const row of group) {
        if (correct.get(row.runId)) successes++; if (attribution.get(row.runId)) attributed++; if (correct.get(row.runId) && attribution.get(row.runId)) useful++; if (completed.get(row.runId)) lifecycleComplete++;
        if (row.evidence.receipts.some(receipt => receipt.outcome === 'rejected' && receipt.taskId === row.taskId)) rejectedMemory++;
        toolCalls += row.counters.toolCalls; repeatedFailures += row.counters.repeatedFailures; injectedBytes += row.counters.injectedBytes; injectedTokenEstimate += row.counters.injectedTokenEstimate;
        if (row.usage?.status === 'available') { inputTokens += row.usage.inputTokens!; outputTokens += row.usage.outputTokens!; } else usageKnown = false;
        if (row.cost && row.cost.status !== 'unavailable') { amount += row.cost.amount!; currencies.add(row.cost.currency); if (row.cost.status !== 'billed') billed = false; } else costsKnown = false;
      }
      costsKnown &&= currencies.size === 1;
      cohorts.push({ domain, controller, arm, samples: group.length, expectedSamples: n, correct: successes, correctnessRate: n ? successes / n : 0, verifiedUseful: useful, usefulnessRate: n ? useful / n : 0, attributed, rejectedMemory, lifecycleComplete, lifecycleRate: n ? lifecycleComplete / n : 0, toolCalls, repeatedFailures, injectedBytes, injectedTokenEstimate, retrievalP95Ms: percentile(group.map(row => row.latencyMs.retrieval)), totalP95Ms: percentile(group.map(row => row.latencyMs.total)), usage: { status: usageKnown ? 'available' : 'unavailable', inputTokens: usageKnown ? inputTokens : null, outputTokens: usageKnown ? outputTokens : null }, cost: { status: costsKnown ? billed ? 'billed' : 'estimated' : 'unavailable', amount: costsKnown ? amount : null, currency: costsKnown ? group[0]!.cost!.currency : null } });
    }
    const preregReasons: string[] = [], p = suite.preregistration;
    if (phase === 'baseline') preregReasons.push('candidate-not-run'); else if (p === null) preregReasons.push('preregistration-missing'); else {
      if (!p.developmentEvidence) preregReasons.push('development-measurement-evidence-unavailable');
      else {
        const evidence = p.developmentEvidence, development = evidence.observations, items = suite.cases.filter(item => item.partition === 'development');
        requireValue(items.length === 4 && ['engineering', 'research'].every(domain => items.filter(item => item.domain === domain).length === 2), 'development-fixture-membership-invalid');
        requireValue(hash(development) === p.developmentDigest, 'development-measurement-digest-mismatch');
        if (Date.parse(evidence.observedAt) >= Date.parse(p.registeredAt)) preregReasons.push('development-measurement-after-registration');
        const wanted = new Set<string>(); for (const item of items) for (const controller of ['native', 'external']) for (const arm of ['off', 'current']) wanted.add(`${item.id}:${controller}:${arm}`);
        const seenDevelopment = new Set<string>(), baseline = rows.find(row => row.arm === 'current'); requireValue(baseline, 'development-baseline-unavailable');
        const identity = (row: OutcomeObservation) => JSON.stringify({ source: row.hashes.sourceRevision, root: row.hashes.rootDistDigest, memory: row.hashes.memoryDistDigest, policy: row.adapter.policy, factory: row.adapter.factoryRevision });
        for (const row of development) {
          requireValue(wanted.has(row.runId) && !seenDevelopment.has(row.runId), 'development-membership-invalid'); seenDevelopment.add(row.runId);
          const item = items.find(item => item.id === row.caseId); requireValue(item && row.runId === `${row.caseId}:${row.controller}:${row.arm}` && row.arm !== 'candidate', 'development-identity-invalid');
          for (const key of ['inputDigest', 'oracleDigest', 'seedDigest', 'configDigest'] as const) requireValue(row.hashes[key] === item[key], 'development-' + key + '-mismatch');
          requireValue(row.hashes.sourceRevision === suite.sourceRevisions.current && row.adapter.policy === 'baseline-v1' && identity(row) === identity(baseline), 'development-snapshot-mismatch');
          const verified = row.evidence.verification, artifactDigest = hash(row.evidence.artifactText);
          requireValue(verified.taskId === row.taskId && verified.oracleDigest === item.oracleDigest && verified.artifactDigest === artifactDigest && ref(row.artifactRef, 'artifact', artifactDigest) && ref(row.verificationRef, 'verification', hash(verified)), 'development-artifact-verification-mismatch');
          requireValue(row.receiptRefs.length === row.evidence.receipts.length && new Set(row.receiptRefs).size === row.receiptRefs.length && new Set(row.evidence.receipts.map(receipt => receipt.id)).size === row.evidence.receipts.length, 'development-receipt-membership-invalid');
          for (let index = 0; index < row.evidence.receipts.length; index++) requireValue(ref(row.receiptRefs[index]!, 'receipt', hash(row.evidence.receipts[index])), 'development-receipt-digest-mismatch');
          requireValue(row.counters.inferenceCalls === 0, 'development-inference-forbidden');
          if (row.usage) requireValue(row.usage.status === 'available' ? row.usage.inputTokens !== null && row.usage.outputTokens !== null : row.usage.inputTokens === null && row.usage.outputTokens === null, 'development-usage-status-invalid');
          if (row.cost) requireValue(row.cost.status === 'unavailable' ? row.cost.amount === null && row.cost.currency === null : row.cost.amount !== null && !!row.cost.currency, 'development-cost-status-invalid');
          const checked = checkOracle(item.oracle, row.evidence.artifactText); requireValue(row.correct === (checked.verdict === 'pass') && verified.verdict === checked.verdict && verified.unsupportedClaims === checked.unsupportedClaims, 'development-oracle-result-mismatch');
          requireValue(Object.values(row.violations).every(count => count === 0), 'development-hard-gates-failed');
        }
        requireValue(seenDevelopment.size === wanted.size, 'development-membership-invalid');
        const measurements = development.filter(row => row.arm === 'current');
        if (p.latency.status === 'measured') {
          const values = measurements.map(row => row.latencyMs.total).sort((a, b) => a - b), middle = Math.floor(values.length / 2), center = values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
          const deviations = values.map(value => Math.abs(value - center)).sort((a, b) => a - b), mad = deviations.length % 2 ? deviations[middle]! : (deviations[middle - 1]! + deviations[middle]!) / 2;
          if (p.latency.baselineP95 !== values[Math.ceil(values.length * 0.95) - 1] || p.latency.mad !== mad || p.latency.limitMs !== values[Math.ceil(values.length * 0.95) - 1]! + 2 * mad) preregReasons.push('development-latency-does-not-reproduce');
        }
        if (p.cost.status === 'measured') {
          let sum = 0, known = measurements.length > 0;
          for (const row of measurements) { if (!row.cost || row.cost.status === 'unavailable' || row.cost.currency !== p.cost.currency) known = false; else sum += row.cost.amount!; }
          if (!known || p.cost.baselineAmount !== sum) preregReasons.push('development-cost-does-not-reproduce');
        }
      }

      if (Date.parse(p.registeredAt) >= Date.parse(p.candidateOpenedAt)) preregReasons.push('preregistration-after-candidate');
      if (p.baselineDigest !== hash(rows.filter(row => row.arm !== 'candidate'))) preregReasons.push('preregistration-baseline-mismatch');
      if (p.latency.status === 'measured' && (p.latency.baselineP95 === null || p.latency.mad === null || p.latency.limitMs !== p.latency.baselineP95 + 2 * p.latency.mad)) preregReasons.push('latency-preregistration-invalid');
      if (p.cost.status === 'measured' && (p.cost.baselineAmount === null || p.cost.ceiling === null || !p.cost.currency)) preregReasons.push('cost-preregistration-invalid');
    }
    const preregistration = { status: (preregReasons.length ? !p || preregReasons.every(reason => reason === 'development-measurement-evidence-unavailable') ? 'BLOCKED' : 'FAIL' : 'PASS') as 'PASS' | 'FAIL' | 'BLOCKED', reasons: preregReasons }, deltas: OutcomeDelta[] = [];
    if (phase === 'compare') for (const domain of ['engineering', 'research'] as const) for (const controller of ['native', 'external'] as const) {
      const current = cohorts.find(group => group.domain === domain && group.controller === controller && group.arm === 'current')!, candidate = cohorts.find(group => group.domain === domain && group.controller === controller && group.arm === 'candidate')!;
      const items = suite.cases.filter(item => item.partition === 'heldout' && item.domain === domain), pairedSamples = items.filter(item => seen.has(`${item.id}:${controller}:current`) && seen.has(`${item.id}:${controller}:candidate`)).length;
      const correctness = candidate.correctnessRate - current.correctnessRate, verifiedUsefulness = candidate.usefulnessRate - current.usefulnessRate;
      const latencyOkay = p?.latency.status !== 'measured' || candidate.totalP95Ms !== null && candidate.totalP95Ms <= p.latency.limitMs!, costOkay = p?.cost.status !== 'measured' || candidate.cost.amount !== null && candidate.cost.currency === p.cost.currency && candidate.cost.amount <= p.cost.ceiling!;
      deltas.push({ domain, controller, pairedSamples, correctness, verifiedUsefulness, lifecycle: candidate.lifecycleRate - current.lifecycleRate, cost: candidate.cost.amount !== null && current.cost.amount !== null && candidate.cost.currency === current.cost.currency ? candidate.cost.amount - current.cost.amount : null, passed: pairedSamples >= suite.limits.minimumPairedSamples && new Set(items.map(item => item.family)).size === 6 && correctness >= 0 && verifiedUsefulness > (p?.usefulnessMinDelta ?? 0) && candidate.lifecycleComplete === candidate.expectedSamples && latencyOkay && costOkay });
    }
    const complete = reportReasons.length === 0, candidateAccepted = phase === 'compare' && complete && preregistration.status === 'PASS' && deltas.length === 4 && deltas.every(delta => delta.passed);
    const candidateStatus = phase === 'baseline' || preregistration.status === 'BLOCKED' || !suite.sourceRevisions.candidate ? 'BLOCKED' : candidateAccepted ? 'PASS' : 'FAIL';
    const expectedReport: OutcomeReport = { version: 'memory-outcome-report/v2', evaluatorRevision: 'agent-core-memory-outcome/v2', suiteDigest, observationsDigest, inputsDigest, phase, mode: suite.mode, driver: suite.driver, runCount: rows.length, expectedRunCount: expected.size, complete, candidateAccepted, candidateStatus, benefitProven: false, cohorts, deltas, hardGates, preregistration, efficiencyBenchmark: 'DEFERRED', reasons: reportReasons, limitations: ['Scripted lifecycle results do not prove reasoning benefit.', 'Efficiency benchmark DEFERRED; unavailable usage and cost remain unknown.', 'Small fixed cohorts are not population or statistical-significance evidence.', 'Inline evidence is reproducible evidence, not independent source authentication.'] };
    requireValue(stable(reported) === stable(expectedReport), 'report-does-not-reproduce');
  } catch (error) { reasons.push(error instanceof SyntaxError ? 'invalid-json' : error instanceof Error ? error.message : 'verification-error'); }
  return { verdict: reasons.length ? 'fail' : 'pass', reasons, verifierRevision: OUTCOME_VERIFIER_REVISION, inputsDigest };
}
