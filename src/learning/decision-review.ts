import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { safeEvidenceRefSchema, safeMetadataSchema } from './evaluation.js';
import { resolveWorkflowEvidence, validateWorkflowUse } from './workflow-evidence.js';
import { recheckWorkflowReport, verifyWorkflowAnswer, type WorkflowVerificationManifest } from '../memory/workflow-verifier.js';
import { readEvidenceSnapshot } from '../verification/evidence-snapshot.js';
import type { LearningStateStore } from './state.js';
import { salienceReviewSchema, reviewSalience } from './salience-review.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { validatePath } from '../rdc/tools/filesystem.js';
import type { WorkflowEvidence } from './workflow-evidence.js';

const identity = safeMetadataSchema(160);
const refs = z.array(safeEvidenceRefSchema()).max(8);
export const decisionDeclarationSchema = z.strictObject({
  id: identity, strategyId: identity, goal: safeMetadataSchema(2000),
  goalCheckIndexes: z.array(z.number().int().min(0).max(99)).min(1).max(8).optional(),
  context: z.array(z.strictObject({
    attribute: identity, historical: safeMetadataSchema(500).optional(), current: safeMetadataSchema(500),
    compatibility: z.enum(['compatible', 'incompatible', 'unknown']), basis: z.enum(['observed', 'inferred']), evidenceRefs: refs,
  })).max(12),
  authority: z.enum(['authorized', 'denied', 'unknown']), risk: z.enum(['low', 'high']),
  control: z.enum(['proceed', 'inspect', 'abstain']),
  predictions: z.array(z.strictObject({
    id: identity, expected: safeMetadataSchema(1000), probability: z.number().min(0).max(1).optional(),
    checkIndex: z.number().int().min(0).max(99).optional(),
    expectedTool: safeMetadataSchema(120).optional(), expectedOutcome: z.enum(['success', 'failure']).optional(),
  })).max(8),
});
export const decisionAssessmentSchema = z.strictObject({
  id: identity, verificationRef: safeEvidenceRefSchema().optional(), observationRefs: refs, actionRefs: refs,
  attribution: z.enum(['supported', 'unknown']), sideEffects: z.enum(['observed', 'unknown']),
  summary: safeMetadataSchema(2000).optional(),
});
export const decisionRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('declare'), declaration: decisionDeclarationSchema }),
  z.strictObject({ operation: z.literal('assess'), assessment: decisionAssessmentSchema }),
  z.strictObject({ operation: z.literal('inspect'), id: identity.optional(), strategyId: identity.optional(), salience: salienceReviewSchema.optional() }),
]);
export type DecisionDeclaration = z.infer<typeof decisionDeclarationSchema>;
export type DecisionAssessment = z.infer<typeof decisionAssessmentSchema> & { assessedAt: string };
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;
export interface DecisionRecord {
  taskId: string; workspace: string; declaredAt: string; declaration: DecisionDeclaration;
  verifier?: Omit<WorkflowVerificationManifest, 'taskId'> & { beforeAnswerDigest?: string; beforeAnswerState: 'absent' | 'present' | 'unavailable' };
  assessments: DecisionAssessment[];
}
const iso = z.iso.datetime();
export const decisionRecordSchema = z.strictObject({
  taskId: identity, workspace: identity, declaredAt: iso, declaration: decisionDeclarationSchema,
  verifier: z.strictObject({ case: z.strictObject({ path: z.string().min(1), digest: z.string().regex(/^sha256:[a-f0-9]{64}$/) }),
    answerPath: z.string().min(1), beforeAnswerDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
    beforeAnswerState: z.enum(['absent', 'present', 'unavailable']) }).optional(),
  assessments: z.array(decisionAssessmentSchema.extend({ assessedAt: iso })).max(16),
});
const digest = (value: unknown) => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
export interface DecisionEvidenceAccess { readFiles: boolean }
async function permittedFile(file: string, access: DecisionEvidenceAccess) {
  if (!access.readFiles) return false;
  try { await validatePath(file); return true; } catch { return false; }
}
async function decisionEvidence(ref: string, access: DecisionEvidenceAccess): Promise<WorkflowEvidence> {
  const file = /^(?:file|source|verification):(.+)#sha256:[a-f0-9]{64}$/i.exec(ref);
  if (file && !await permittedFile(file[1]!, access)) return { ref, status: 'unavailable', semanticSupport: 'not-established', reason: 'file-read-not-authorized' };
  return resolveWorkflowEvidence(ref);
}

/** Advisory only: a controller declaration never changes a tool grant or authenticates a claim. */
export async function evaluateDecisionRecord(record: DecisionRecord, access: DecisionEvidenceAccess = { readFiles: false }) {
  const declaration = record.declaration;
  const context = await Promise.all(declaration.context.map(async attribute => {
    const resolved = attribute.evidenceRefs.length > 0 && (await Promise.all(attribute.evidenceRefs.map(ref => decisionEvidence(ref, access))))
      .every(item => item.status === 'resolved');
    const state = !resolved ? 'unknown' as const : attribute.basis === 'observed' ? 'known' as const : 'inferred' as const;
    return { attribute: attribute.attribute, state, compatibility: attribute.compatibility,
      evidenceValidation: resolved ? 'resolved' : 'unavailable', semanticSupport: 'controller-declared' as const,
      stateMeaning: 'known means declared observed with available source; semantic compatibility is not independently established' };
  }));
  const applicability = context.some(item => item.state === 'known' && item.compatibility === 'incompatible') ? 'incompatible'
    : context.length && context.every(item => item.state === 'known' && item.compatibility === 'compatible') ? 'supported' : 'unknown';
  const suggestedControl = declaration.authority !== 'authorized' || applicability === 'incompatible' ? 'abstain'
    : applicability === 'unknown' ? 'inspect' : 'proceed';
  const contextKey = digest(declaration.context.map(item => [item.attribute, item.current]).sort((a, b) => a[0]!.localeCompare(b[0]!)));
  const assessment = record.assessments.at(-1);
  let goal: 'pass' | 'fail' | 'unknown' = 'unknown';
  let checks: boolean[] = [], prospective = false;
  let reason = 'verification-unavailable';
  const actionEvents = assessment?.actionRefs.length ? activityTracker.readToolInvocationEvents({ maxEvents: 10_000,
    maxAgeMs: Math.min(30 * 86_400_000, Math.max(60_000, Date.now() - Date.parse(record.declaredAt) + 1000)) }) : [];
  const observedActions = assessment?.actionRefs.flatMap(ref => {
    const id = /^tool:([a-zA-Z0-9:._-]+)$/.exec(ref)?.[1];
    if (!id) return [];
    const same = (event: typeof actionEvents[number]) => event.context?.taskId === record.taskId
      && (event.context.invocationId === id || event.context.durableInvocationId === id)
      && Date.parse(event.timestamp) > Date.parse(record.declaredAt) && Date.parse(event.timestamp) <= Date.parse(assessment.assessedAt);
    const starts = actionEvents.filter(event => same(event) && event.kind === 'tool-invocation-start');
    const ends = actionEvents.filter(event => same(event) && ['tool-call', 'handled-tool-failure', 'tool-exception'].includes(event.kind));
    const start = starts[0], end = ends[0];
    return starts.length === 1 && ends.length === 1 && start && end
      && typeof start.context?.processInstanceDigest === 'string' && /^sha256:[a-f0-9]{64}$/.test(start.context.processInstanceDigest)
      && start.context.processInstanceDigest === end.context?.processInstanceDigest
      && typeof start.context.tool === 'string' && start.context.tool === end.context?.tool
      && Date.parse(start.timestamp) > Date.parse(record.declaredAt)
      && Date.parse(end.timestamp) >= Date.parse(start.timestamp)
      && Date.parse(end.timestamp) <= Date.parse(assessment.assessedAt) ? [end] : [];
  }) ?? [];
  if (assessment?.verificationRef && record.verifier) {
    const match = /^verification:(.+)#(sha256:[a-f0-9]{64})$/i.exec(assessment.verificationRef);
    if (match && (await Promise.all([match[1]!, record.verifier.case.path, record.verifier.answerPath].map(file => permittedFile(file, access)))).every(Boolean)) {
      try {
        const reportSnapshot = await readEvidenceSnapshot(match[1]!);
        if (reportSnapshot.digest !== match[2]!.toLowerCase()) throw new Error('changed-report');
        const report = JSON.parse(reportSnapshot.text);
        if (report.case.path === record.verifier.case.path && report.case.digest === record.verifier.case.digest
          && report.answer.path === record.verifier.answerPath) {
          if (await recheckWorkflowReport(assessment.verificationRef, record.taskId) === 'unavailable') throw new Error('unverified-report');
          const [oracle, answer] = await Promise.all([readEvidenceSnapshot(report.case.path), readEvidenceSnapshot(report.answer.path)]);
          if (oracle.digest === record.verifier.case.digest && answer.digest === report.answer.digest) {
            const replay = verifyWorkflowAnswer(JSON.parse(oracle.text), answer.text);
            goal = declaration.goalCheckIndexes ? declaration.goalCheckIndexes.some(index => replay.checks[index] === undefined) ? 'unknown'
              : declaration.goalCheckIndexes.every(index => replay.checks[index]) ? 'pass' : 'fail' : replay.verdict;
            checks = replay.checks;
            prospective = observedActions.length > 0 && record.verifier.beforeAnswerState !== 'unavailable' && Date.parse(assessment.assessedAt) >= Date.parse(record.declaredAt)
              && answer.digest !== record.verifier.beforeAnswerDigest;
            reason = prospective ? 'registered-oracle-check' : !observedActions.length ? 'post-declaration-action-unavailable' : 'answer-unchanged-since-declaration';
          }
        }
      } catch { /* Missing or changed evidence remains unknown. */ }
    }
  }
  const predictions = declaration.predictions.map(prediction => {
    if (prediction.expectedTool) {
      const starts = actionEvents.filter(event => event.kind === 'tool-invocation-start' && event.context?.taskId === record.taskId
        && event.context.tool === prediction.expectedTool && Date.parse(event.timestamp) > Date.parse(record.declaredAt)
        && Date.parse(event.timestamp) <= Date.parse(assessment?.assessedAt ?? '')).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const first = starts[0];
      const uniqueFirst = first && (!starts[1] || starts[1].timestamp !== first.timestamp);
      const event = uniqueFirst && actionEvents.length < 10_000 && Date.now() - Date.parse(record.declaredAt) < 30 * 86_400_000
        ? observedActions.find(event => event.context?.tool === prediction.expectedTool
          && event.context?.invocationId === first.context?.invocationId && event.context?.processInstanceDigest === first.context?.processInstanceDigest) : undefined;
      const actual = event?.context?.outcome === 'success' ? 'success'
        : ['handled-failure', 'exception'].includes(String(event?.context?.outcome)) ? 'failure' : undefined;
      return { id: prediction.id, probability: prediction.probability,
        outcome: actual ? actual === prediction.expectedOutcome ? 'pass' as const : 'fail' as const : 'unknown' as const,
        prospective: Boolean(actual), reason: actual ? 'host-observed-tool-outcome' : 'exact-post-declaration-tool-outcome-unavailable',
        predictionMeaning: 'technical-invocation-outcome' as const };
    }
    return {
    id: prediction.id, probability: prediction.probability,
    outcome: prediction.checkIndex === undefined || checks[prediction.checkIndex] === undefined ? 'unknown' as const
      : checks[prediction.checkIndex] ? 'pass' as const : 'fail' as const,
    prospective: prospective && prediction.checkIndex !== undefined && checks[prediction.checkIndex] !== undefined,
    reason: prediction.checkIndex === undefined ? 'descriptive-prediction-without-oracle-check' : reason,
    predictionMeaning: 'registered-oracle-check' as const,
  }; });
  const observationEvidence = assessment ? await Promise.all(assessment.observationRefs.map(ref => decisionEvidence(ref, access))) : [];
  const actionEvidence = assessment ? await Promise.all(assessment.actionRefs.map(ref => decisionEvidence(ref, access))) : [];
  const use = assessment && goal !== 'unknown' && actionEvidence.every(item => item.status === 'resolved') ? await validateWorkflowUse({ taskId: record.taskId, actionRefs: assessment.actionRefs,
    verificationRef: assessment.verificationRef }) : undefined;
  return { id: declaration.id, taskId: record.taskId, strategyId: declaration.strategyId, contextKey, context, applicability,
    authority: { declared: declaration.authority, executionPermission: 'unchanged' as const }, suggestedControl,
    control: declaration.control, goal, predictions, observationEvidence,
    sideEffects: { declared: assessment?.sideEffects ?? 'unknown', verification: 'not-established' },
    attribution: assessment?.attribution === 'supported' && use?.status === 'resolved' ? 'action-bound' : 'unknown',
    causalAttribution: 'not-established' as const, goalMeaning: 'prospectively selected registered oracle checks; not a claim that arbitrary goal text is proven',
    forecastMeaning: 'probability of the registered oracle check passing or the first matching post-declaration tool invocation reaching expectedOutcome; expected text is descriptive' };
}

export async function reviewDecisions(records: DecisionRecord[], salience?: z.infer<typeof salienceReviewSchema>, access: DecisionEvidenceAccess = { readFiles: false }) {
  const evaluations = await Promise.all(records.map(record => evaluateDecisionRecord(record, access)));
  const groups = new Map<string, { strategyId: string; contextKey: string; successes: string[]; failures: string[]; unknown: string[] }>();
  for (const row of evaluations) {
    const key = row.strategyId + ':' + row.contextKey;
    const group = groups.get(key) ?? { strategyId: row.strategyId, contextKey: row.contextKey, successes: [], failures: [], unknown: [] };
    const field = row.attribution !== 'action-bound' ? 'unknown' : row.goal === 'pass' ? 'successes' : row.goal === 'fail' ? 'failures' : 'unknown';
    if (!group[field].includes(row.taskId)) group[field].push(row.taskId);
    groups.set(key, group);
  }
  const salienceEvidence = salience ? await Promise.all([...new Set(salience.observations.filter(item => item.inspectionAuthority === 'granted')
    .flatMap(item => item.evidenceRefs))].map(ref => decisionEvidence(ref, access))) : [];
  return { evaluations, ...(salience ? { salience: reviewSalience(salience, salienceEvidence) } : {}), contextualStrategies: [...groups.values()].map(group => ({ ...group,
    recommendation: group.failures.length ? 'review-context-specific-evidence' : 'preserve-history',
    policyChanged: false, causalAttribution: 'not-established', associationOnly: true,
  })), executionPermission: 'unchanged', historyPreserved: true };
}

/** The caller supplies a host-resolved binding, never a task identity from the decision payload. */
export async function updateDecisionReview(store: LearningStateStore, binding: { taskId: string; workspace: string }, raw: DecisionRequest,
  access: DecisionEvidenceAccess = { readFiles: false }) {
  const request = decisionRequestSchema.parse(raw);
  if (!identity.safeParse(binding.taskId).success || !identity.safeParse(binding.workspace).success) throw new Error('LEARNING_DECISION_SCOPE_REQUIRED');
  if (request.operation === 'inspect') {
    const state = await store.load();
    if (store.getIssue()) throw new Error('LEARNING_DECISION_STATE_UNAVAILABLE');
    return (state.decisionReviews ?? []).filter(row => row.workspace === binding.workspace
      && (request.strategyId ? row.declaration.strategyId === request.strategyId : row.taskId === binding.taskId)
      && (!request.id || row.declaration.id === request.id));
  }
  let verifier: DecisionRecord['verifier'];
  if (request.operation === 'declare') {
    const state = await store.load();
    const manifest = state.verificationManifests?.find(item => item.taskId === binding.taskId);
    if (manifest) {
      let beforeAnswerDigest: string | undefined;
      let beforeAnswerState: 'absent' | 'present' | 'unavailable' = 'unavailable';
      if (await permittedFile(manifest.answerPath, access)) {
        try { beforeAnswerDigest = (await readEvidenceSnapshot(manifest.answerPath)).digest; beforeAnswerState = 'present'; }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') beforeAnswerState = 'absent'; }
      }
      verifier = { case: structuredClone(manifest.case), answerPath: manifest.answerPath, beforeAnswerState, ...(beforeAnswerDigest ? { beforeAnswerDigest } : {}) };
    }
  }
  const result = await store.mutate('decisions', state => {
    const records = structuredClone(state.decisionReviews ?? []);
    const id = request.operation === 'declare' ? request.declaration.id : request.assessment.id;
    let record = records.find(row => row.taskId === binding.taskId && row.workspace === binding.workspace && row.declaration.id === id);
    if (request.operation === 'declare') {
      const declaration = request.declaration;
      if (new Set(declaration.context.map(item => item.attribute)).size !== declaration.context.length
        || new Set(declaration.predictions.map(item => item.id)).size !== declaration.predictions.length) throw new Error('LEARNING_DECISION_DUPLICATE_ATTRIBUTE');
      const checkIndexes = declaration.predictions.flatMap(item => item.checkIndex === undefined ? [] : [item.checkIndex]);
      if (new Set(checkIndexes).size !== checkIndexes.length) throw new Error('LEARNING_DECISION_DUPLICATE_ORACLE_CHECK');
      const toolTargets = declaration.predictions.flatMap(item => item.expectedTool ? [item.expectedTool] : []);
      if (new Set(toolTargets).size !== toolTargets.length || declaration.predictions.some(item =>
        Boolean(item.expectedTool) !== Boolean(item.expectedOutcome) || item.expectedTool && item.checkIndex !== undefined)) throw new Error('LEARNING_DECISION_INVALID_TOOL_FORECAST');
      if (declaration.goalCheckIndexes && new Set(declaration.goalCheckIndexes).size !== declaration.goalCheckIndexes.length) throw new Error('LEARNING_DECISION_DUPLICATE_GOAL_CHECK');
      if (record && JSON.stringify(record.declaration) !== JSON.stringify(declaration)) throw new Error('LEARNING_DECISION_FORECAST_IMMUTABLE');
      if (!record) {
        if (records.length >= 256) throw new Error('LEARNING_DECISION_CAPACITY_REVIEW_REQUIRED');
        record = { ...binding, declaredAt: new Date().toISOString(), declaration, verifier, assessments: [] };
        records.push(record);
      }
    } else {
      if (!record) throw new Error('LEARNING_DECISION_NOT_FOUND');
      const last = record.assessments.at(-1);
      const same = last && JSON.stringify({ ...last, assessedAt: undefined }) === JSON.stringify(request.assessment);
      if (!same) {
        if (record.assessments.length >= 16) throw new Error('LEARNING_DECISION_ASSESSMENT_CAPACITY');
        record.assessments.push({ ...request.assessment, assessedAt: new Date().toISOString() });
      }
    }
    return { state: { ...state, decisionReviews: records }, result: record };
  });
  return [result.result!];
}
