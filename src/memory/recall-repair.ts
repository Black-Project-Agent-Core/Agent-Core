import { z } from 'zod';
import { safeIdSchema, digestSchema } from './experience-types.js';
import { disclosureDigest, memorySemanticRevision, stableDisclosureJson, MemoryControllerError, type ControllerScope } from './disclosure.js';
import { assertLearningTextSafe } from './safety.js';
import { boundedHistory } from './note-format.js';
import { memoryRecordFingerprint, type MemoryRetrievalLedger, type MemoryRetrievalAttempt } from './retrieval-ledger.js';
import type { FileMemoryStore } from './store.js';
import type { MemoryEpisodes } from './episodes.js';

const op = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const keyword = z.string().trim().min(1).max(80);
const base = { memoryId: safeIdSchema, operationId: op, expectedRevision: digestSchema, expectedRepairRevision: digestSchema.nullable() };
const write = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('preview'), ...base, retrievalAttemptId: op, foundAttemptId: op,
    keywords: z.array(keyword).min(1).max(8), observedCause: z.enum(['keyword-gap', 'ranking-gap', 'budget', 'unknown']) }),
  z.strictObject({ operation: z.enum(['apply', 'reject']), ...base, repairId: op }),
  z.strictObject({ operation: z.literal('verify'), ...base, repairId: op, originalAttemptId: op, paraphraseAttemptId: op, negativeAttemptId: op }),
]);
const entry = z.strictObject({ id: op, taskId: op, sourceRevision: digestSchema, originalAttemptId: op,
  queryHash: digestSchema, rankingProfile: z.string().max(32), foundAttemptId: op, keywords: z.array(keyword).max(8),
  observedCause: z.string().max(32), status: z.enum(['preview', 'applied', 'rejected', 'verified']),
  appliedRevision: digestSchema.optional(), proof: z.array(op).max(3).optional(), at: z.iso.datetime() });
export const recallRepairStateSchema = z.strictObject({ version: z.literal(1), rootId: safeIdSchema, workspaceKey: z.string().max(120), memoryId: safeIdSchema,
  entries: z.array(entry).max(32), blockedKeywords: z.array(digestSchema).max(128),
  operations: z.array(z.strictObject({ id: op, digest: digestSchema })).max(128) });
type State = z.infer<typeof recallRepairStateSchema>;
export const RECALL_REPAIR_GUIDE = {
  read: { tool: 'memory_v2_read', action: 'recall_repair', payload: ['memoryId'] },
  write: { tool: 'memory_v2_write', action: 'recall_repair', operations: ['preview', 'apply', 'reject', 'verify'],
    common: ['memoryId', 'operationId', 'expectedRevision (Memory semantic revision)', 'expectedRepairRevision:null|digest'],
    preview: ['retrievalAttemptId (actual miss)', 'foundAttemptId (returned current target)', 'keywords (1–8)', 'observedCause'],
    applyOrReject: ['repairId'], verify: ['repairId', 'originalAttemptId', 'paraphraseAttemptId', 'negativeAttemptId'] },
  limitations: 'Only keywords are amended through the canonical batch transaction owner. Query hashes only; no raw query replay claim. Human-rejected keyword hashes persist. Proof covers declared queries, not general semantic benefit.',
} as const;
export const recallRepairStateKey = (workspace: string, id: string) => 'recall-repairs/' + disclosureDigest([workspace, id]).slice(7) + '.json';
const blockedKey = (word: string) => disclosureDigest(word.toLocaleLowerCase('en-US'));
const fail = (code: ConstructorParameters<typeof MemoryControllerError>[0]): never => { throw new MemoryControllerError(code); };

/** Explicit, revision-bound metadata repair within existing Memory transactions and retrieval evidence. */
export class MemoryRecallRepairs {
  constructor(private readonly store: FileMemoryStore, private readonly episodes: MemoryEpisodes,
    private readonly ledger: MemoryRetrievalLedger, private readonly refresh: () => Promise<void>) {}
  private external(scope: ControllerScope) { if (scope.controllerId !== 'agent-core-external') fail('MEMORY_SCOPE_MISMATCH'); }
  private state(raw: string | null, scope: ControllerScope, rootId: string, memoryId: string): State {
    const state = raw === null ? { version: 1 as const, rootId, workspaceKey: scope.workspaceKey, memoryId, entries: [], blockedKeywords: [], operations: [] }
      : recallRepairStateSchema.parse(JSON.parse(raw));
    if (state.rootId !== rootId || state.workspaceKey !== scope.workspaceKey || state.memoryId !== memoryId) fail('MEMORY_SCOPE_MISMATCH');
    return state;
  }
  async read(scope: ControllerScope, raw: unknown, assertCurrent?: () => void | Promise<void>) {
    this.external(scope); const input = z.strictObject({ memoryId: safeIdSchema }).parse(raw); await assertCurrent?.();
    const result = await this.episodes.promotionSnapshot(scope, async p => {
      const record = p.visible(input.memoryId), state = this.state(await p.read(recallRepairStateKey(scope.workspaceKey, input.memoryId)), scope, p.owner.rootId, input.memoryId);
      return { state, revision: state.operations.length ? disclosureDigest(state) : null, recordRevision: memorySemanticRevision(record), guide: RECALL_REPAIR_GUIDE, executionAuthority: false };
    });
    await assertCurrent?.(); return result;
  }
  private async attempt(scope: ControllerScope, id: string) {
    const attempt = await this.ledger.readAttempt(id);
    if (!attempt || attempt.taskId !== scope.taskId || attempt.workspace !== scope.workspaceKey) return fail('MEMORY_SCOPE_MISMATCH');
    if (!['succeeded', 'no-results'].includes(attempt.retrievalStatus) || attempt.failureCode
      || attempt.deliveryStatus !== 'returned-to-controller' || !attempt.queryHashSha256
      || !['memory_recall', 'memory_search'].includes(attempt.surface)) return fail('MEMORY_SOURCE_UNAVAILABLE');
    return attempt;
  }
  private returned(attempt: MemoryRetrievalAttempt, id: string, fingerprint?: string) {
    return attempt.exposures.some(e => e.memoryId === id && e.handoffStatus === 'returned-to-controller'
      && ['selected', 'trimmed'].includes(e.disposition) && (!fingerprint || e.recordFingerprint === fingerprint));
  }
  async write(scope: ControllerScope, raw: unknown, assertCurrent?: () => void | Promise<void>) {
    this.external(scope); const input = write.parse(raw); assertLearningTextSafe(stableDisclosureJson(input)); await assertCurrent?.();
    const prepared = await this.episodes.promotionSnapshot(scope, async p => {
      const record = p.visible(input.memoryId); if (record.pinned) fail('MEMORY_INPUT_INVALID');
      const key = recallRepairStateKey(scope.workspaceKey, input.memoryId), state = this.state(await p.read(key), scope, p.owner.rootId, input.memoryId);
      const payloadDigest = disclosureDigest(input), replay = state.operations.find(o => o.id === input.operationId);
      if (replay) { if (replay.digest !== payloadDigest) fail('MEMORY_OPERATION_CONFLICT'); return { p, key, state, record, duplicate: true }; }
      if (memorySemanticRevision(record) !== input.expectedRevision || (state.operations.length ? disclosureDigest(state) : null) !== input.expectedRepairRevision) fail('MEMORY_REVISION_CONFLICT');
      if (state.operations.length >= 128) fail('MEMORY_CONSOLIDATION_REVIEW_REQUIRED');
      const current = input.operation === 'preview' ? undefined : state.entries.find(e => e.id === input.repairId && e.taskId === scope.taskId);
      if (input.operation === 'preview') {
        if (state.entries.length >= 32) fail('MEMORY_CONSOLIDATION_REVIEW_REQUIRED');
        if (input.keywords.some(word => state.blockedKeywords.includes(blockedKey(word)))) fail('MEMORY_PRESERVATION_REQUIRED');
        const miss = await this.attempt(scope, input.retrievalAttemptId), found = await this.attempt(scope, input.foundAttemptId);
        if (this.returned(miss, record.id) || !this.returned(found, record.id, memoryRecordFingerprint(record.id, record.updatedAt))) fail('MEMORY_REVISION_CONFLICT');
        state.entries.push({ id: input.operationId, taskId: scope.taskId, sourceRevision: input.expectedRevision,
          originalAttemptId: miss.attemptId, queryHash: miss.queryHashSha256!, rankingProfile: miss.rankingProfile ?? 'legacy',
          foundAttemptId: found.attemptId, keywords: input.keywords, observedCause: input.observedCause, status: 'preview', at: new Date().toISOString() });
      } else {
        if (!current) fail('MEMORY_OPERATION_CONFLICT');
        if (input.operation === 'reject') {
          if (current!.status !== 'preview') fail('MEMORY_OPERATION_CONFLICT');
          state.blockedKeywords = [...new Set([...state.blockedKeywords, ...current!.keywords.map(blockedKey)])];
          current!.status = 'rejected';
        } else if (input.operation === 'apply') {
          if (current!.status !== 'preview' || current!.sourceRevision !== input.expectedRevision
            || current!.keywords.some(word => state.blockedKeywords.includes(blockedKey(word)))) fail('MEMORY_REVISION_CONFLICT');
          current!.status = 'applied';
        } else if (input.operation === 'verify') {
          if (current!.status !== 'applied' || current!.appliedRevision !== input.expectedRevision) fail('MEMORY_REVISION_CONFLICT');
          const positive = await this.attempt(scope, input.originalAttemptId), paraphrase = await this.attempt(scope, input.paraphraseAttemptId), negative = await this.attempt(scope, input.negativeAttemptId);
          const profile = (a: MemoryRetrievalAttempt) => (a.rankingProfile ?? 'legacy') === current!.rankingProfile;
          const fingerprint = memoryRecordFingerprint(record.id, record.updatedAt);
          if (new Set([positive.attemptId, paraphrase.attemptId, negative.attemptId]).size !== 3
            || positive.queryHashSha256 !== current!.queryHash || positive.queryHashSha256 === paraphrase.queryHashSha256
            || [positive.queryHashSha256, paraphrase.queryHashSha256].includes(negative.queryHashSha256)
            || ![positive, paraphrase, negative].every(profile)
            || !this.returned(positive, record.id, fingerprint) || !this.returned(paraphrase, record.id, fingerprint)
            || this.returned(negative, record.id)) fail('MEMORY_OPERATION_CONFLICT');
          current!.status = 'verified'; current!.proof = [positive.attemptId, paraphrase.attemptId, negative.attemptId];
        }
      }
      state.operations.push({ id: input.operationId, digest: payloadDigest });
      return { p, key, state, record, duplicate: false };
    });
    await assertCurrent?.();
    const committed = await this.store.transact([...prepared.p.dependencies.keys()], snapshot => {
      prepared.p.assert(snapshot);
      const record = snapshot.records.find(r => r.id === input.memoryId);
      if (!record || !prepared.duplicate && memorySemanticRevision(record) !== input.expectedRevision) fail('MEMORY_REVISION_CONFLICT');
      let next = record!;
      if (!prepared.duplicate && input.operation === 'apply') {
        const repair = prepared.state.entries.find(e => e.id === input.repairId)!;
        const now = new Date().toISOString();
        next = { ...record!, keywords: [...new Set([...record!.keywords, ...repair.keywords])], updatedAt: now,
          evolutionHistory: boundedHistory(record!.evolutionHistory, { kind: 'metadata_enriched', timestamp: now, source: 'controller',
            changedFields: ['keywords'], details: { recallRepair: repair.id } }) };
        repair.appliedRevision = memorySemanticRevision(next);
      }
      recallRepairStateSchema.parse(prepared.state);
      return { records: snapshot.records.map(r => r.id === next.id ? next : r), touchedIds: next === record ? [] : [next.id],
        stateWrites: prepared.duplicate ? [] : [{ key: prepared.key, content: stableDisclosureJson(prepared.state) + '\n' }],
        validateSources: async () => { await assertCurrent?.(); }, result: { duplicate: prepared.duplicate, revision: disclosureDigest(prepared.state), recordRevision: memorySemanticRevision(next), entries: prepared.state.entries } };
    });
    let indexStatus = 'not-required';
    if (input.operation === 'apply' && !committed.result.duplicate) { try { await this.refresh(); indexStatus = 'current'; } catch { indexStatus = 'unavailable'; } }
    return { ...committed.result, indexStatus, evidenceScope: 'declared-query-tests-only', semanticBenefit: 'unknown', executionAuthority: false };
  }
}
