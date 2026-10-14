import { createHash } from 'node:crypto';
import * as z from 'zod/v4';

export type Arm = 'off' | 'current' | 'candidate';
export type Mode = 'offline' | 'live';
export const OUTCOME_CONTRACT_REVISION = 'memory-outcome/v2';
const identifier = z.string().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metric = z.number().finite().nonnegative();
const arm = z.enum(['off', 'current', 'candidate']);
const domain = z.enum(['engineering', 'research']);
const family = z.enum(['relevant-reuse', 'irrelevant', 'stale-evidence', 'user-correction', 'poisoning', 'restart']);
const oracleSchema = z.union([
  z.strictObject({ domain: z.literal('engineering'), tests: z.array(z.strictObject({ input: z.json(), expected: z.json() })).min(1).max(100) }),
  z.strictObject({ domain: z.literal('research'), facts: z.array(z.strictObject({ key: identifier, value: z.string(), source: identifier, supersedes: z.array(identifier).optional() })).min(1).max(100) }),
]);
const caseSchema = z.strictObject({
  id: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/), partition: z.enum(['development', 'heldout']), domain, family,
  input: z.strictObject({ prompt: z.string().min(1), document: z.string() }),
  seed: z.strictObject({ content: z.string(), kind: z.enum(['fact', 'procedure']) }),
  oracle: oracleSchema,
  config: z.strictObject({ model: z.string().nullable(), settings: z.strictObject({ driver: z.literal('scripted-v1') }), tools: z.array(identifier), schemaRevision: identifier }),
  inputDigest: digest, oracleDigest: digest, seedDigest: digest, configDigest: digest,
});
const preregistrationSchema = z.strictObject({
  registeredAt: z.iso.datetime(), candidateOpenedAt: z.iso.datetime(), baselineDigest: digest, developmentDigest: digest,
  correctnessMinDelta: z.literal(0), usefulnessMinDelta: metric,
  latency: z.strictObject({ status: z.enum(['DEFERRED', 'measured']), baselineP95: metric.nullable(), mad: metric.nullable(), limitMs: metric.nullable(), unit: z.literal('ms'), method: z.literal('baseline-p95-plus-2-MAD') }),
  cost: z.strictObject({ status: z.enum(['DEFERRED', 'measured']), baselineAmount: metric.nullable(), ceiling: metric.nullable(), currency: z.string().nullable(), method: z.literal('measured-baseline-and-approved-ceiling') }),
  developmentEvidence: z.strictObject({ observedAt: z.iso.datetime(), observations: z.array(z.lazy(() => outcomeObservationSchema)) }).optional(),
});
const suiteSchema = z.strictObject({
  version: z.literal(OUTCOME_CONTRACT_REVISION), mode: z.enum(['offline', 'live']), driver: z.enum(['scripted', 'real-controller']),
  cases: z.array(caseSchema).min(1),
  expectedRunIds: z.strictObject({ baseline: z.array(identifier), compare: z.array(identifier) }),
  sourceRevisions: z.strictObject({ current: identifier, candidate: identifier.nullable() }),
  armOrder: z.array(z.array(arm).length(3)).length(3),
  limits: z.strictObject({ minimumPairedSamples: count.min(1), maxToolIterations: count.min(1), efficiencyBenchmark: z.literal('DEFERRED') }),
  preregistration: preregistrationSchema.nullable(), preregistrationDigest: digest.nullable(),
});
const receiptSchema = z.strictObject({ id: identifier, taskId: identifier, actionRef: z.string().min(1), memoryId: identifier, memoryRevision: identifier, verificationRef: z.string().min(1), outcome: z.enum(['applied', 'adapted', 'rejected']), verified: z.boolean() });
export const outcomeObservationSchema = z.strictObject({
  runId: identifier, caseId: identifier, arm, controller: z.enum(['native', 'external']), taskId: identifier,
  hashes: z.strictObject({ inputDigest: digest, oracleDigest: digest, seedDigest: digest, configDigest: digest, sourceRevision: identifier, rootDistDigest: digest, memoryDistDigest: digest, activationDigest: digest }),
  adapter: z.strictObject({ engineMode: z.literal('experience-v2'), activation: z.literal('synthetic-v2'), policy: z.enum(['baseline-v1', 'fusion-feedback-v1']), factoryRevision: identifier, selected: z.array(z.strictObject({ id: identifier, revision: identifier, score: z.number().finite() })) }),
  artifactRef: z.string().min(1), verificationRef: z.string().min(1), receiptRefs: z.array(z.string().min(1)), correct: z.boolean(),
  violations: z.strictObject({ scopeLeaks: count, staleTrust: count, unsupportedSuccess: count }),
  lifecycle: z.strictObject({ capture: z.boolean(), persist: z.boolean(), restart: z.boolean(), recall: z.boolean(), action: z.boolean(), verification: z.boolean(), receipt: z.boolean(), review: z.boolean(), compliant: z.boolean(), harnessRecovered: z.boolean() }),
  latencyMs: z.strictObject({ retrieval: metric, total: metric }),
  counters: z.strictObject({ toolCalls: count, repeatedFailures: count, injectedBytes: count, injectedTokenEstimate: count, inferenceCalls: count }),
  usage: z.strictObject({ status: z.enum(['available', 'unavailable']), inputTokens: count.nullable(), outputTokens: count.nullable(), provenance: z.string().min(1) }).nullable(),
  cost: z.strictObject({ status: z.enum(['billed', 'estimated', 'unavailable']), amount: metric.nullable(), currency: z.string().nullable(), provenance: z.string().min(1) }).nullable(),
  evidence: z.strictObject({ artifactText: z.string(), verification: z.strictObject({ taskId: identifier, artifactDigest: digest, oracleDigest: digest, verdict: z.enum(['pass', 'fail']), unsupportedClaims: count }), receipts: z.array(receiptSchema) }),
});
export type OutcomeSuite = z.infer<typeof suiteSchema>;
export type OutcomeCase = OutcomeSuite['cases'][number];
export type OutcomeObservation = z.infer<typeof outcomeObservationSchema>;
export function outcomeDigest(value: unknown): string { return 'sha256:' + createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
export function parseOutcomeSuite(input: unknown): OutcomeSuite {
  suiteSchema.parse(input);
  // Schemas have no coercions/defaults. Preserve the recorded JSON key order,
  // because the sealed canonical digests bind those exact values and ordering.
  const suite = structuredClone(input) as OutcomeSuite;
  const seen = new Set<string>();
  for (const item of suite.cases) {
    if (seen.has(item.id)) throw new Error('duplicate-case:' + item.id);
    seen.add(item.id);
    if (item.oracle.domain !== item.domain) throw new Error('oracle-domain-mismatch:' + item.id);
    for (const key of ['input', 'oracle', 'seed', 'config'] as const) if (outcomeDigest(item[key]) !== item[`${key}Digest`]) throw new Error(`${key}-digest-mismatch:${item.id}`);
    if (suite.mode === 'offline' && (suite.driver !== 'scripted' || item.config.model !== null)) throw new Error('offline-model-forbidden');
  }
  const heldout = suite.cases.filter(item => item.partition === 'heldout');
  for (const [phase, arms] of [['baseline', ['off', 'current']], ['compare', ['off', 'current', 'candidate']]] as const) {
    const expected = heldout.flatMap(item => ['native', 'external'].flatMap(controller => arms.map(value => `${item.id}:${controller}:${value}`)));
    const declared = suite.expectedRunIds[phase];
    if (declared.length !== expected.length || new Set(declared).size !== declared.length || expected.some(value => !declared.includes(value))) throw new Error('expected-membership-invalid:' + phase);
  }
  for (const order of suite.armOrder) if (new Set(order).size !== 3) throw new Error('arm-order-invalid');
  if (new Set(suite.armOrder.map(order => order.join(':'))).size !== 3) throw new Error('arm-order-rotation-invalid');
  if (suite.preregistration === null ? suite.preregistrationDigest !== null : outcomeDigest(suite.preregistration) !== suite.preregistrationDigest) throw new Error('preregistration-digest-mismatch');
  return suite;
}
export function parseOutcomeObservation(input: unknown): OutcomeObservation { outcomeObservationSchema.parse(input); return structuredClone(input) as OutcomeObservation; }
function portableRef(ref: string, kind: string, expectedDigest: string): boolean {
  const match = new RegExp(`^${kind}:([^#]+)#(sha256:[a-f0-9]{64})$`).exec(ref);
  return !!match && match[2] === expectedDigest && match[1]!.startsWith('evidence/') && !match[1]!.includes('\\') && match[1]!.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
/** Every required run remains in the denominator, including failures/timeouts. */
export function validateOutcomePairs(suite: OutcomeSuite, rows: OutcomeObservation[]): string[] {
  const reasons: string[] = [], seen = new Set<string>();
  const phase = rows.some(row => row.arm === 'candidate') ? 'compare' : 'baseline';
  const expected = new Set(suite.expectedRunIds[phase]);
  const cases = new Map(suite.cases.filter(item => item.partition === 'heldout').map(item => [item.id, item]));
  const armIdentity = new Map<string, string>();
  for (const raw of rows) {
    const parsed = outcomeObservationSchema.safeParse(raw);
    if (!parsed.success) { reasons.push('invalid-observation:' + (raw?.runId ?? 'unknown')); continue; }
    const row = structuredClone(raw);
    if (seen.has(row.runId)) reasons.push('duplicate-run:' + row.runId);
    seen.add(row.runId);
    if (!expected.has(row.runId)) reasons.push('foreign-run:' + row.runId);
    const item = cases.get(row.caseId);
    if (!item) { reasons.push('foreign-case:' + row.caseId); continue; }
    if (row.runId !== `${row.caseId}:${row.controller}:${row.arm}`) reasons.push('run-identity-mismatch:' + row.runId);
    for (const key of ['inputDigest', 'oracleDigest', 'seedDigest', 'configDigest'] as const) if (row.hashes[key] !== item[key]) reasons.push(`${key}-mismatch:${row.runId}`);
    const revision = row.arm === 'candidate' ? suite.sourceRevisions.candidate : suite.sourceRevisions.current;
    if (!revision || revision !== row.hashes.sourceRevision) reasons.push('source-revision-mismatch:' + row.runId);
    if (row.arm !== 'candidate' && row.adapter.policy !== 'baseline-v1') reasons.push('baseline-policy-mismatch:' + row.runId);
    const identity = JSON.stringify({ revision: row.hashes.sourceRevision, root: row.hashes.rootDistDigest, memory: row.hashes.memoryDistDigest, policy: row.adapter.policy, factory: row.adapter.factoryRevision });
    const key = row.arm === 'candidate' ? 'candidate' : 'baseline';
    if (armIdentity.has(key) && armIdentity.get(key) !== identity) reasons.push('snapshot-drift:' + row.runId);
    armIdentity.set(key, identity);
    const artifactDigest = outcomeDigest(row.evidence.artifactText), verification = row.evidence.verification;
    if (!portableRef(row.artifactRef, 'artifact', artifactDigest) || artifactDigest !== verification.artifactDigest) reasons.push('artifact-digest-mismatch:' + row.runId);
    if (!portableRef(row.verificationRef, 'verification', outcomeDigest(verification)) || verification.taskId !== row.taskId || verification.oracleDigest !== item.oracleDigest) reasons.push('verification-identity-mismatch:' + row.runId);
    if (row.receiptRefs.length !== row.evidence.receipts.length || new Set(row.receiptRefs).size !== row.receiptRefs.length || new Set(row.evidence.receipts.map(receipt => receipt.id)).size !== row.evidence.receipts.length) reasons.push('receipt-membership-invalid:' + row.runId);
    row.evidence.receipts.forEach((receipt, index) => { if (!portableRef(row.receiptRefs[index] ?? '', 'receipt', outcomeDigest(receipt))) reasons.push('receipt-digest-mismatch:' + row.runId); });
    if (suite.mode === 'offline' && row.counters.inferenceCalls !== 0) reasons.push('offline-inference-forbidden:' + row.runId);
    if (row.usage && (row.usage.status === 'available' ? row.usage.inputTokens === null || row.usage.outputTokens === null : row.usage.inputTokens !== null || row.usage.outputTokens !== null)) reasons.push('usage-status-invalid:' + row.runId);
    if (row.cost && (row.cost.status === 'unavailable' ? row.cost.amount !== null || row.cost.currency !== null : row.cost.amount === null || !row.cost.currency)) reasons.push('cost-status-invalid:' + row.runId);
  }
  for (const runId of expected) if (!seen.has(runId)) reasons.push('missing-run:' + runId);
  return reasons;
}
