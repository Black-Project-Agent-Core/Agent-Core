import { z } from 'zod';
import { disclosureDigest, stableDisclosureJson } from '../memory/disclosure.js';
import { assertLearningTextSafe } from '../memory/safety.js';
import { safeEvidenceRefSchema } from './evaluation.js';
import type { ProposalDocumentReader } from './proposal-documents.js';
import type { LearningStateStore } from './state.js';

const text = z.string().min(1).max(2000).refine(value => Boolean(value.trim()));
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-z][a-z0-9-]{1,79}$/);
const refs = z.array(safeEvidenceRefSchema()).min(1).max(24);
const common = { id, operationId: id, expectedRevision: digest.nullable() };
export const externalImprovementInput = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('inspect'), id: id.optional() }),
  z.strictObject({ operation: z.literal('register'), ...common, documentPath: z.string().min(1).max(500), documentDigest: digest,
    evidenceRefs: refs, decisionNeeded: text, nextAction: text,
    question: z.strictObject({ decision: text, missingEvidence: text }).optional() }),
  z.strictObject({ operation: z.literal('notice'), ...common, busy: z.boolean().optional() }),
  z.strictObject({ operation: z.literal('feedback'), ...common, decision: z.enum(['accepted', 'deferred', 'rejected']),
    reason: text, evidenceRefs: refs, reviewAt: z.iso.datetime().optional() }),
  z.strictObject({ operation: z.literal('progress'), ...common, status: z.enum(['in-progress', 'completed']), evidenceRefs: refs }),
]);
export function parseExternalImprovement(raw:unknown){
  const input=externalImprovementInput.parse(raw);
  assertLearningTextSafe(stableDisclosureJson(input));
  return input;
}
const recordSchema = z.strictObject({
  id, ownerId: z.string().min(1).max(128), workspace: z.string().min(1).max(120), workspaceIdentity: z.string().min(1).max(200),
  sourceTaskId: z.string().min(1).max(200), originSession: z.string().min(1).max(200), documentPath: z.string().max(500), documentDigest: digest,
  evidenceRefs: refs, evidenceDigest: digest, decisionNeeded: text, nextAction: text,
  question: z.strictObject({ decision: text, missingEvidence: text }).optional(),
  status: z.enum(['observed', 'accepted', 'deferred', 'rejected', 'in-progress', 'completed']),
  feedback: z.array(z.strictObject({ decision: z.enum(['accepted', 'deferred', 'rejected']), reason: text, evidenceRefs: refs,
    documentDigest: digest, evidenceDigest: digest, at: z.iso.datetime(), reviewAt: z.iso.datetime().optional() })).max(64),
  notices: z.array(z.strictObject({ key: digest, at: z.iso.datetime(), delivery: z.literal('unconfirmed') })).max(64),
  operations: z.array(z.strictObject({ id, digest })).max(128),
  progress: z.array(z.strictObject({ status: z.enum(['in-progress', 'completed']), taskId: z.string().max(200), evidenceRefs: refs, at: z.iso.datetime() })).max(64),
});
export const externalImprovementRecords = z.array(recordSchema).max(128);
export type ExternalImprovementRecord = z.infer<typeof recordSchema>;
export interface ExternalImprovementScope { ownerId: string; workspace: string; workspaceIdentity: string; taskId: string; sessionId: string }
interface ExternalImprovementView {
  record: ExternalImprovementRecord; revision: string; responseAuthority: 'controller-reported';
  delivery: 'unconfirmed' | 'not-declared'; response: 'controller-reported' | 'unknown'; executionAuthority: false;
}
type ExternalImprovementNotice = Pick<ExternalImprovementRecord, 'documentPath' | 'documentDigest' | 'decisionNeeded' | 'nextAction' | 'question'>
  & { delivery: 'unconfirmed' };
interface ExternalImprovementMutationResult extends ExternalImprovementView {
  duplicate: boolean; notice: ExternalImprovementNotice | null; suppression?: string;
}

export const EXTERNAL_IMPROVEMENT_GUIDE = {
  tool: 'controller_learning', action: 'improvement', payload: 'operation: inspect | register | notice | feedback | progress',
  register: ['id', 'operationId', 'expectedRevision:null', 'documentPath', 'documentDigest', 'evidenceRefs', 'decisionNeeded', 'nextAction', 'question?:{decision,missingEvidence}'],
  update: ['id', 'operationId', 'expectedRevision (from inspect)'],
  feedback: ['decision:accepted|deferred|rejected', 'reason', 'evidenceRefs', 'reviewAt?:explicit-user-time'],
  notice: ['busy?:true suppresses interruption', 'delivery remains unconfirmed; silence is unknown'],
  progress: ['status:in-progress|completed', 'evidenceRefs'],
  authority: 'Controller-reported feedback is advisory, never authenticated user consent or an execution grant. Notices stay in the origin task/session. Other tasks of the same owner/workspace may record explicit current-revision feedback/progress; no messages or timers are sent.',
} as const;

function quiet(record: ExternalImprovementRecord, scope: ExternalImprovementScope, busy = false): string | undefined {
  if (record.sourceTaskId !== scope.taskId || record.originSession !== scope.sessionId) return 'origin-task-required';
  if (busy) return 'user-busy';
  if (record.status === 'completed' || record.status === 'in-progress') return record.status;
  const feedback = record.feedback.at(-1);
  if (feedback && feedback.evidenceDigest === record.evidenceDigest) {
    if (feedback.decision === 'rejected') return 'rejected-unchanged-evidence';
    if (feedback.decision === 'deferred' && (!feedback.reviewAt || Date.parse(feedback.reviewAt) > Date.now())) return 'deferred';
    if (feedback.decision === 'accepted' && feedback.documentDigest === record.documentDigest) return 'accepted-awaiting-action';
  }
  return undefined;
}

/** General proposals share the Learning state owner; feedback never becomes tool authorization. */
export async function externalImprovement(store: LearningStateStore, documents: ProposalDocumentReader,
  scope: ExternalImprovementScope, raw: unknown, assertCurrent: () => Promise<void>) {
  const input = parseExternalImprovement(raw);
  const belongs = (record: ExternalImprovementRecord) => record.ownerId === scope.ownerId && record.workspace === scope.workspace
    && record.workspaceIdentity === scope.workspaceIdentity;
  const view = (record: ExternalImprovementRecord): ExternalImprovementView => ({ record, revision: disclosureDigest(record), responseAuthority: 'controller-reported',
    delivery: record.notices.length ? 'unconfirmed' : 'not-declared', response: record.feedback.length ? 'controller-reported' : 'unknown', executionAuthority: false });
  await assertCurrent();
  if (input.operation === 'inspect') {
    const records = (await store.load()).externalImprovements?.filter(belongs).filter(r => !input.id || r.id === input.id) ?? [];
    await assertCurrent();
    return { items: records.map(view), guide: EXTERNAL_IMPROVEMENT_GUIDE, executionAuthority: false };
  }
  const payloadDigest = disclosureDigest(input);
  return (await store.mutate<ExternalImprovementMutationResult>('proposals', async state => {
    await assertCurrent();
    const records = structuredClone(state.externalImprovements ?? []);
    let record = records.find(r => belongs(r) && r.id === input.id);
    const replay = record?.operations.find(op => op.id === input.operationId);
    if (replay) {
      if (replay.digest !== payloadDigest) throw new Error('IMPROVEMENT_OPERATION_CONFLICT');
      return { state, result: { ...view(record!), duplicate: true, notice: null }, persist: false };
    }
    if ((record ? disclosureDigest(record) : null) !== input.expectedRevision) throw new Error('IMPROVEMENT_REVISION_CONFLICT');
    if ((record?.operations.length ?? 0) >= 128) throw new Error('IMPROVEMENT_HISTORY_LIMIT');
    const requestedPath = input.operation === 'register' ? input.documentPath : record?.documentPath;
    const normalized = requestedPath?.replaceAll('\\', '/');
    if (!normalized || !/^docs\/proposals\/(?:[a-zA-Z0-9_-]+\/)?[^/]+\.md$/.test(normalized)
      || normalized.split('/').some(part => part === '..')) throw new Error('IMPROVEMENT_DOCUMENT_PATH_INVALID');
    const listing = await documents.list();
    const item = listing.items.find(item => item.path.replaceAll('\\', '/').endsWith('/' + normalized));
    if (!item || item.kind !== 'improvement' || item.readStatus !== 'available' || !item.documentDigest) throw new Error('IMPROVEMENT_DOCUMENT_UNAVAILABLE');
    const document = await documents.read({ id: item.id, revisionDigest: item.revisionDigest, documentDigest: item.documentDigest });
    const expected = input.operation === 'register' ? input.documentDigest : record!.documentDigest;
    if (document.documentDigest !== expected) throw new Error('IMPROVEMENT_DOCUMENT_DRIFT');
    const now = new Date().toISOString();
    if (input.operation === 'register') {
      if (!record && records.some(r => belongs(r) && r.sourceTaskId === scope.taskId)) throw new Error('IMPROVEMENT_ONE_PER_TASK');
      const fields = { documentPath: normalized, documentDigest: input.documentDigest, evidenceRefs: input.evidenceRefs,
        evidenceDigest: disclosureDigest([...new Set(input.evidenceRefs)].sort()), decisionNeeded: input.decisionNeeded, nextAction: input.nextAction,
        ...(input.question ? { question: input.question } : {}) };
      if (record) {
        const changed = record.documentDigest !== fields.documentDigest || record.evidenceDigest !== fields.evidenceDigest;
        Object.assign(record, fields);
        if (changed) record.status = 'observed';
      }
      else {
        if (records.length >= 128) throw new Error('IMPROVEMENT_HISTORY_LIMIT');
        record = { id: input.id, ownerId: scope.ownerId, workspace: scope.workspace, workspaceIdentity: scope.workspaceIdentity,
          sourceTaskId: scope.taskId, originSession: scope.sessionId, ...fields,
          status: 'observed', feedback: [], notices: [], operations: [], progress: [] };
        records.push(record);
      }
    } else if (!record) throw new Error('IMPROVEMENT_NOT_FOUND');
    let notice: ExternalImprovementNotice | null = null, suppression: string | undefined;
    if (input.operation === 'feedback') {
      if (record!.feedback.length >= 64) throw new Error('IMPROVEMENT_HISTORY_LIMIT');
      record!.feedback.push({ decision: input.decision, reason: input.reason, evidenceRefs: input.evidenceRefs,
        documentDigest: record!.documentDigest, evidenceDigest: record!.evidenceDigest, at: now, ...(input.reviewAt ? { reviewAt: input.reviewAt } : {}) });
      record!.status = input.decision;
    } else if (input.operation === 'progress') {
      const accepted = record!.feedback.at(-1);
      if (accepted?.decision !== 'accepted' || accepted.documentDigest !== record!.documentDigest
        || accepted.evidenceDigest !== record!.evidenceDigest) throw new Error('IMPROVEMENT_FEEDBACK_REQUIRED');
      if (record!.status !== 'accepted' && !(record!.status === 'in-progress' && input.status === 'completed')) throw new Error('IMPROVEMENT_FEEDBACK_REQUIRED');
      if (record!.progress.length >= 64) throw new Error('IMPROVEMENT_HISTORY_LIMIT');
      record!.progress.push({ status: input.status, taskId: scope.taskId, evidenceRefs: input.evidenceRefs, at: now });
      record!.status = input.status;
    } else if (input.operation === 'notice') {
      suppression = quiet(record!, scope, input.busy);
      const due = record!.feedback.at(-1)?.reviewAt ?? null;
      const key = disclosureDigest([record!.documentDigest, record!.evidenceDigest, due]);
      suppression ??= record!.notices.some(n => n.key === key) ? 'already-exposed' : undefined;
      if (!suppression) {
        if (record!.notices.length >= 64) throw new Error('IMPROVEMENT_HISTORY_LIMIT');
        record!.notices.push({ key, at: now, delivery: 'unconfirmed' });
        notice = { documentPath: record!.documentPath, documentDigest: record!.documentDigest,
          decisionNeeded: record!.decisionNeeded, nextAction: record!.nextAction, question: record!.question, delivery: 'unconfirmed' };
      }
    }
    record!.operations.push({ id: input.operationId, digest: payloadDigest });
    externalImprovementRecords.parse(records);
    await assertCurrent();
    return { state: { ...state, externalImprovements: records }, result: { ...view(record!), duplicate: false, notice, ...(suppression ? { suppression } : {}) } };
  })).result;
}
