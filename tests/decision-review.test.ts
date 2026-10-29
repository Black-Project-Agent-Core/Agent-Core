import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const tracker = vi.hoisted(() => ({ events: [] as any[] }));
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readToolInvocationEvents: () => tracker.events,
} }));
import { LearningStateStore } from '../src/learning/state.js';
import { LearningService } from '../src/learning/service.js';
import { updateDecisionReview as updateReview, reviewDecisions as reviewRecords, evaluateDecisionRecord as evaluateRecord, type DecisionDeclaration, type DecisionRecord, type DecisionRequest } from '../src/learning/decision-review.js';
import { evaluateDecisionCalibration } from '../src/learning/decision-calibration.js';
import * as evidenceSnapshots from '../src/verification/evidence-snapshot.js';
import { registerWorkflowVerification, WORKFLOW_VERIFIER_REVISION } from '../src/memory/workflow-verifier.js';
import { registerLearningTools } from '../src/mcp/learning-tools.js';
import { learning as learningSchema } from '../src/mcp/learning-schemas.js';
import { decisionDeclarationSchema } from '../src/learning/decision-review.js';

const roots: string[] = [];
const inquiry = () => ({ schemaVersion: 1 as const, question: 'Which transport lost the callback?',
  assumptions: [{ id: 'scope', statement: 'Credential is current', basis: 'observed' as const, evidenceRefs: [] }],
  alternatives: [{ id: 'callback', claim: 'Factory dropped callback', distinguishingObservation: 'Direct works, HTTP fails',
    falsifier: 'Both paths forward the same callback', evidenceRefs: [] }] });

it('keeps inquiry optional, strict, unique and bounded by UTF-8 bytes', async () => {
  const f = await fixture();
  expect(decisionDeclarationSchema.safeParse(f.declaration).success).toBe(true);
  const value = { ...f.declaration, inquiry: inquiry() };
  expect(decisionDeclarationSchema.safeParse(value).success).toBe(true);
  value.inquiry.alternatives[0]!.id = 'scope';
  expect(decisionDeclarationSchema.safeParse(value).success).toBe(false);
  const oversized = { ...inquiry(), assumptions: Array.from({ length: 4 }, (_, i) => ({ id: 'a' + i,
    statement: '😀'.repeat(300), basis: 'unknown', evidenceRefs: [] })) };
  expect(decisionDeclarationSchema.safeParse({ ...f.declaration, inquiry: oversized }).success).toBe(false);
  expect(decisionDeclarationSchema.safeParse({ ...f.declaration, inquiry: { ...inquiry(), execute: true } }).success).toBe(false);
});

it('binds inquiry parents and findings to the same task and preserves immutable declarations', async () => {
  const f = await fixture();
  await f.declare();
  const declaration = { ...f.declaration, id: 'followup', inquiry: { ...inquiry(), parentDecisionId: 'attempt' } };
  const saved = await f.declare(declaration);
  expect(saved.declaration.inquiry).toEqual(declaration.inquiry);
  await expect(f.declare({ ...declaration, inquiry: { ...declaration.inquiry, question: 'Changed question' } }))
    .rejects.toThrow('LEARNING_DECISION_FORECAST_IMMUTABLE');
  await expect(updateReview(f.store, { taskId: 'foreign', workspace: 'fixture' }, { operation: 'declare', declaration }))
    .rejects.toThrow('LEARNING_INQUIRY_PARENT_SCOPE_INVALID');
  await expect(f.declare({ ...declaration, id: 'unknown-parent', inquiry: { ...inquiry(), parentDecisionId: 'absent' } }))
    .rejects.toThrow('LEARNING_INQUIRY_PARENT_SCOPE_INVALID');
  await expect(updateReview(f.store, f.binding, { operation: 'assess', assessment: { id: 'followup',
    observationRefs: [], actionRefs: [], attribution: 'unknown', sideEffects: 'unknown',
    inquiryFindings: [{ alternativeId: 'foreign', status: 'supported', evidenceRefs: [] }] } }))
    .rejects.toThrow('LEARNING_INQUIRY_FINDING_INVALID');
  expect((await evaluateDecisionRecord(saved)).goal).toBe('unknown');
});
const hash = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
const updateDecisionReview = (store: LearningStateStore, binding: {taskId:string;workspace:string}, request:DecisionRequest) => updateReview(store, binding, request, { readFiles: true });
const evaluateDecisionRecord = (record: DecisionRecord) => evaluateRecord(record, { readFiles: true });
const reviewDecisions = (records: DecisionRecord[]) => reviewRecords(records, undefined, { readFiles: true });
afterEach(async () => { tracker.events = []; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(taskId = 'decision-task') {
  const parent = fileURLToPath(new URL('../runtime/tmp/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'decision-review-')); roots.push(root);
  const store = new LearningStateStore({ root, state: path.join(root, 'state.json') });
  const oracle = JSON.stringify({ domain: 'research', facts: [
    { key: 'http', value: '200', source: 'fixture-observation' },
    { key: 'feature', value: 'correct', source: 'fixture-observation' },
  ] });
  const casePath = path.join(root, 'case.json'), answerPath = path.join(root, 'answer.json');
  await writeFile(casePath, oracle);
  const manifest = { taskId, case: { path: casePath, digest: hash(oracle) }, answerPath };
  registerWorkflowVerification(manifest);
  await store.mutate('verification', state => ({ state: { ...state, verificationManifests: [manifest] }, result: null }));
  const binding = { taskId, workspace: 'fixture' };
  const declaration: DecisionDeclaration = { id: 'attempt', strategyId: 'config-repair', goal: 'Feature works', goalCheckIndexes: [1],
    context: [{ attribute: 'api-contract', historical: 'compatible previous version', current: 'active contract', compatibility: 'compatible',
      basis: 'observed', evidenceRefs: ['file:' + casePath + '#' + hash(oracle)] }], authority: 'authorized', risk: 'low', control: 'proceed',
    predictions: [{ id: 'transport', expected: 'HTTP 200', probability: 0.9, checkIndex: 0 },
      { id: 'feature', expected: 'Feature correct', probability: 0.8, checkIndex: 1 }] };
  const declare = async (value = declaration) => (await updateDecisionReview(store, binding, { operation: 'declare', declaration: value }))[0]!;
  async function report(http = '200', feature = 'correct') {
    const answer = JSON.stringify([{ key: 'http', value: http, source: 'fixture-observation', contradictions: [] },
      { key: 'feature', value: feature, source: 'fixture-observation', contradictions: [] }]);
    await writeFile(answerPath, answer);
    const text = JSON.stringify({ taskId, verifierRevision: WORKFLOW_VERIFIER_REVISION, case: manifest.case,
      answer: { path: answerPath, digest: hash(answer) } });
    const reportPath = path.join(root, 'report.json'); await writeFile(reportPath, text);
    const at = new Date().toISOString();
    tracker.events.push(...['tool-invocation-start', 'tool-call'].map(kind => ({ id: kind + taskId, timestamp: at, kind,
      context: { taskId, invocationId: 'action-' + taskId, processInstanceDigest: hash('fixture-process'), tool: 'write_file', outcome: 'success' } })));
    return { verificationRef: 'verification:' + reportPath + '#' + hash(text), actionRefs: ['file:' + answerPath + '#' + hash(answer), 'tool:action-' + taskId] };
  }
  async function assess(http = '200', feature = 'correct') {
    const evidence = await report(http, feature);
    return (await updateDecisionReview(store, binding, { operation: 'assess', assessment: { id: 'attempt', ...evidence,
      observationRefs: [], attribution: 'supported', sideEffects: 'unknown' } }))[0]!;
  }
  return { root, store, binding, declaration, declare, assess, report, answerPath, casePath };
}

describe('shared prospective decision review', () => {
  it('separates HTTP success from functional failure and preserves the frozen forecast', async () => {
    const fx = await fixture(); const before = await fx.declare(); const record = await fx.assess('200', 'wrong');
    const result = await evaluateDecisionRecord(record);
    expect(result.goal).toBe('fail');
    expect(result.predictions.map(row => row.outcome)).toEqual(['pass', 'fail']);
    expect(result.predictions.every(row => row.prospective)).toBe(true);
    expect(result.sideEffects).toEqual({ declared: 'unknown', verification: 'not-established' });
    expect(result.causalAttribution).toBe('not-established');
    const calibration = await evaluateDecisionCalibration([record], { readFiles: true });
    expect(calibration).toMatchObject({ samples: 2, distinctTasks: 1 });
    expect(calibration.brierScore).toBeCloseTo(0.325);
    expect(record.declaration).toEqual(before.declaration);
    await expect(fx.declare({ ...fx.declaration, predictions: [{ id: 'rewritten', expected: 'I knew it failed' }] })).rejects.toThrow('FORECAST_IMMUTABLE');
    expect((await fx.store.load()).decisionReviews).toHaveLength(1);
  });
  it('keeps functional success independent from a missed transport prediction', async () => {
    const fx = await fixture(); await fx.declare();
    const result = await evaluateDecisionRecord(await fx.assess('201', 'correct'));
    expect(result.goal).toBe('pass'); expect(result.predictions.map(row => row.outcome)).toEqual(['fail', 'pass']);
  });
  it('keeps absent evidence and timeout effects unknown, then appends verified assessment', async () => {
    const fx = await fixture(); await fx.declare();
    const [unknown] = await updateDecisionReview(fx.store, fx.binding, { operation: 'assess', assessment: {
      id: 'attempt', actionRefs: [], observationRefs: [], attribution: 'unknown', sideEffects: 'unknown', summary: 'Request timed out.' } });
    expect((await evaluateDecisionRecord(unknown!)).goal).toBe('unknown');
    const record = await fx.assess(); expect(record.assessments).toHaveLength(2);
    expect(record.assessments[0]?.summary).toBe('Request timed out.');
    expect((await evaluateDecisionRecord(record)).goal).toBe('pass');
  });
  it('does not calibrate a pre-existing answer, unobserved action, or narrative forecast', async () => {
    const fx = await fixture(); await fx.report(); await fx.declare({ ...fx.declaration, predictions: [{ id: 'claim', expected: 'Everything is solved', probability: 1 }] });
    const result = await evaluateDecisionRecord(await fx.assess());
    expect(result.predictions[0]).toMatchObject({ outcome: 'unknown', prospective: false });
    const fx2 = await fixture('second-task'); await fx2.declare(); const record = await fx2.assess(); tracker.events = [];
    expect((await evaluateDecisionRecord(record)).predictions.every(row => !row.prospective)).toBe(true);
  });
  it('replays current bytes and rejects changed answer, oracle, and foreign task reports', async () => {
    const fx = await fixture(); await fx.declare(); const record = await fx.assess();
    await writeFile(fx.answerPath, 'changed');
    expect((await evaluateDecisionRecord(record)).goal).toBe('unknown');
    const record2 = await fx.assess(); await writeFile(fx.casePath, 'changed');
    expect((await evaluateDecisionRecord(record2)).goal).toBe('unknown');
    const other = await fixture('foreign'); await other.declare(); const foreign = await other.assess();
    expect((await evaluateDecisionRecord({ ...foreign, taskId: 'wrong-owner-task' })).goal).toBe('unknown');
  });
  it('uses contract evidence instead of an exact-version ban and never changes authority', async () => {
    const fx = await fixture();
    const record = await fx.declare({ ...fx.declaration, context: [{ ...fx.declaration.context[0]!, attribute: 'api', historical: 'v1', current: 'v2' }] });
    expect(await evaluateDecisionRecord(record)).toMatchObject({ applicability: 'supported', suggestedControl: 'proceed', authority: { executionPermission: 'unchanged' } });
    const mismatch: DecisionRecord = { ...record, declaration: { ...record.declaration, context: [{ ...record.declaration.context[0]!, compatibility: 'incompatible' }] } };
    expect((await evaluateDecisionRecord(mismatch)).suggestedControl).toBe('abstain');
    const unknown = { ...mismatch, declaration: { ...mismatch.declaration, context: [{ ...mismatch.declaration.context[0]!, evidenceRefs: [] }] } };
    expect((await evaluateDecisionRecord(unknown)).suggestedControl).toBe('inspect');
    expect((await evaluateDecisionRecord({ ...record, declaration: { ...record.declaration, authority: 'denied' } })).suggestedControl).toBe('abstain');
  });
  it('preserves old successes while reviewing only the failing context without automatic policy changes', async () => {
    const old = await fixture('old-task'); await old.declare(); const success = await old.assess();
    const next = await fixture('new-task'); await next.declare({ ...next.declaration, context: [{ ...next.declaration.context[0]!, current: 'breaking active contract' }] });
    const failure = await next.assess('200', 'wrong');
    const result = await reviewDecisions([success, failure]);
    expect(result.contextualStrategies).toHaveLength(2);
    expect(result.contextualStrategies.find(group => group.successes.includes('old-task'))?.recommendation).toBe('preserve-history');
    expect(result.contextualStrategies.find(group => group.failures.includes('new-task'))?.recommendation).toBe('review-context-specific-evidence');
    expect(result.contextualStrategies.every(group => !group.policyChanged)).toBe(true);
    const unbound = structuredClone(failure); unbound.assessments[0]!.attribution = 'unknown';
    expect((await reviewDecisions([unbound])).contextualStrategies[0]?.failures).toEqual([]);
  });
  it('rejects duplicate targets, unsafe schemas, unknown decisions and cross-task mutation', async () => {
    const fx = await fixture();
    await expect(fx.declare({ ...fx.declaration, predictions: fx.declaration.predictions.map(item => ({ ...item, checkIndex: 0 })) })).rejects.toThrow('DUPLICATE_ORACLE');
    await expect(fx.declare({ ...fx.declaration, predictions: [{ id: 'invalid', expected: 'A result', expectedTool: 'get_config' }] })).rejects.toThrow('INVALID_TOOL_FORECAST');
    await expect(fx.declare({ ...fx.declaration, predictions: [{ id: 'invalid', expected: 'A result', expectedTool: 'get_config', expectedOutcome: 'success', checkIndex: 0 }] })).rejects.toThrow('INVALID_TOOL_FORECAST');
    await fx.declare();
    await expect(updateDecisionReview(fx.store, { ...fx.binding, taskId: 'other' }, { operation: 'assess', assessment: {
      id: 'attempt', actionRefs: [], observationRefs: [], attribution: 'unknown', sideEffects: 'unknown' } })).rejects.toThrow('NOT_FOUND');
    expect(learningSchema.safeParse({ action: 'decision' }).success).toBe(false);
    expect(learningSchema.safeParse({ action: 'status', decision: { operation: 'inspect' } }).success).toBe(false);
  });
  it('dispatches through the existing Learning tool with a host-resolved native/external task', async () => {
    const fx = await fixture();
    const service = { decisionReview: (binding: any, request: any, access: any) => LearningService.prototype.decisionReview.call({
      stateStore: fx.store, memory: { registeredWorkspaceIdentity: () => ({ name: 'fixture' }) },
    } as any, binding, request, access) } as any;
    let callback: any;
    const server = { registerTool: (_name: string, _config: any, handler: any) => { callback = handler; } } as any;
    const resolver = vi.fn(async (selector: any) => {
      if (selector?.taskId && selector.taskId !== fx.binding.taskId) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
      return { taskId: fx.binding.taskId, workspaceKey: 'fixture', controllerId: 'agent-core-native' };
    });
    registerLearningTools(server, service, undefined, undefined, undefined, resolver, true);
    const declared = await callback({ action: 'decision', decision: { operation: 'declare', declaration: fx.declaration } });
    expect(declared.isError).not.toBe(true); expect(resolver).toHaveBeenCalledWith(undefined);
    const inspect = await callback({ action: 'decision', taskId: fx.binding.taskId, decision: { operation: 'inspect' } });
    expect(JSON.parse(inspect.content[0].text).records[0].taskId).toBe(fx.binding.taskId);
    expect(JSON.parse(inspect.content[0].text).calibration.status).toBe('insufficient-evidence');
    const stopping = { stoppingContext: { requiredChecks: 'complete', userConstraints: 'satisfied' }, observations: [{
      id: 'optional-repeat', goalRelevance: 'direct', potentialSeverity: 'low', evidenceReliability: 'supported', uncertainty: [],
      evidenceRefs: fx.declaration.context[0]!.evidenceRefs, inspectionAuthority: 'granted', reviewState: 'reviewed-unchanged',
      requirement: 'optional', resolution: 'unresolved', marginalValue: 'low',
    }] };
    const stopped = await callback({ action: 'decision', taskId: fx.binding.taskId, decision: { operation: 'inspect', salience: stopping } });
    expect(JSON.parse(stopped.content[0].text).salience.stopping).toMatchObject({ recommendation: 'stop-optional-checks',
      evidenceIndependence: 'not-established', actionAuthorization: 'unchanged' });
    stopping.observations[0]!.requirement = 'mandatory';
    const continued = await callback({ action: 'decision', taskId: fx.binding.taskId, decision: { operation: 'inspect', salience: stopping } });
    expect(JSON.parse(continued.content[0].text).salience.stopping.recommendation).toBe('continue-verification');
    expect((await callback({ action: 'decision', taskId: 'spoofed', decision: { operation: 'inspect' } })).isError).toBe(true);
    expect((await callback({ action: 'decision', workspace: 'foreign', decision: { operation: 'inspect' } })).isError).toBe(true);
    registerLearningTools(server, service);
    expect((await callback({ action: 'decision', decision: { operation: 'inspect' } })).isError).toBe(true);
  });
  it('evaluates real host tool outcomes without an oracle and never converts them into goal success', async () => {
    const fx = await fixture();
    await fx.store.mutate('verification', state => ({ state: { ...state, verificationManifests: [] }, result: null }));
    await fx.declare({ ...fx.declaration, predictions: [{ id: 'write', expected: 'Write completes', probability: 0.8,
      expectedTool: 'write_file', expectedOutcome: 'success' }] });
    const record = await fx.assess();
    const result = await evaluateRecord(record);
    expect(result.goal).toBe('unknown');
    expect(result.predictions[0]).toMatchObject({ outcome: 'pass', prospective: true, predictionMeaning: 'technical-invocation-outcome' });
    expect((await evaluateDecisionCalibration([record])).samples).toBe(1);
    tracker.events[1].context.outcome = 'handled-failure'; tracker.events[1].kind = 'handled-tool-failure';
    expect((await evaluateRecord(record)).predictions[0]?.outcome).toBe('fail');
    tracker.events[1].context.taskId = 'foreign';
    expect((await evaluateRecord(record)).predictions[0]?.outcome).toBe('unknown');
  });
  it('cannot cherry-pick a later successful retry to overwrite the first predicted tool failure', async () => {
    const fx = await fixture();
    await fx.declare({ ...fx.declaration, predictions: [{ id: 'write', expected: 'First write completes', expectedTool: 'write_file', expectedOutcome: 'success' }] });
    const record = await fx.assess();
    const initial = new Date(Date.parse(record.declaredAt) + 1).toISOString();
    tracker.events.unshift(...['tool-invocation-start', 'handled-tool-failure'].map(kind => ({ id: 'first-' + kind, timestamp: initial, kind,
      context: { taskId: record.taskId, invocationId: 'first-failed-action', processInstanceDigest: hash('fixture-process'), tool: 'write_file', outcome: 'handled-failure' } })));
    expect((await evaluateRecord(record)).predictions[0]?.outcome).toBe('unknown');
    record.assessments[0]!.actionRefs.push('tool:first-failed-action');
    expect((await evaluateRecord(record)).predictions[0]?.outcome).toBe('fail');
  });
  it('uses host process digests and excludes earlier uses of the same native durable invocation alias', async () => {
    const fx = await fixture();
    await fx.declare({ ...fx.declaration, predictions: [{ id: 'write', expected: 'Write completes', expectedTool: 'write_file', expectedOutcome: 'success' }] });
    const record = await fx.assess();
    const alias = 'dtc:' + record.taskId + ':write-call';
    for (const event of tracker.events) Object.assign(event.context, { durableInvocationId: alias, processSessionId: '[REDACTED]' });
    const prior = tracker.events.map(event => ({ ...event, timestamp: new Date(Date.parse(record.declaredAt) - 1000).toISOString(),
      context: { ...event.context, invocationId: 'earlier-invocation', processInstanceDigest: hash('older-process') } }));
    tracker.events.unshift(...prior);
    record.assessments[0]!.actionRefs = ['tool:' + alias];
    expect((await evaluateRecord(record)).predictions[0]).toMatchObject({ outcome: 'pass', prospective: true });
    delete tracker.events.at(-1)!.context.processInstanceDigest;
    expect((await evaluateRecord(record)).predictions[0]?.outcome).toBe('unknown');
  });
  it('does not read supplied files without the current host read grant or declared salience inspection authority', async () => {
    const fx = await fixture(); const record = await fx.declare();
    const read = vi.spyOn(evidenceSnapshots, 'readEvidenceSnapshot'); read.mockClear();
    expect((await evaluateRecord(record)).applicability).toBe('unknown');
    expect(read).not.toHaveBeenCalled();
    const observation = { id: 'risk', goalRelevance: 'unrelated' as const, potentialSeverity: 'critical' as const,
      evidenceReliability: 'unverified' as const, uncertainty: [], evidenceRefs: fx.declaration.context[0]!.evidenceRefs,
      inspectionAuthority: 'not-granted' as const, reviewState: 'new' as const };
    const result = await reviewRecords([], { observations: [observation] }, { readFiles: true });
    expect(read).not.toHaveBeenCalled(); expect(result.salience?.observations[0]?.nextStep).toBe('request-inspection-authority');
    read.mockRestore();
  });
});
