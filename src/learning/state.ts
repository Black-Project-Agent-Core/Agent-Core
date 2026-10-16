import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isNewState, writeStateFile } from '../persistence/state-file.js';
import type { LearningRejectionFingerprint, LearningState, PendingLearningReview } from './types.js';
import type { LearningPaths } from './paths.js';
import { procedureContractDigest } from '../agent-learning-loop.js';
import { safeEvidenceRefSchema } from './evaluation.js';
import { decisionRecordSchema } from './decision-review.js';

const MAX_IDEMPOTENCY = 64;
const MAX_REJECTIONS = 128;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/i;
const STATE_MUTATION_TAILS = new Map<string, Promise<void>>();

export type LearningStateOwner = 'checkpoint' | 'review' | 'curator' | 'procedures' | 'verification' | 'proposals' | 'decisions';
const OWNER_FIELDS: Record<LearningStateOwner, ReadonlySet<keyof LearningState>> = {
  decisions: new Set(['decisionReviews']),
  proposals: new Set(['skillProposals']),
  verification: new Set(['verificationManifests']),
  procedures: new Set(['procedures']),
  checkpoint: new Set(['checkpointCount', 'sinceReview', 'lastCheckpointAt', 'recentIdempotency', 'pendingReviews']),
  review: new Set(['sinceReview', 'lastReviewAt', 'recentRejections', 'pendingReviews', 'reviewDecisions']),
  curator: new Set(['lastCuratorAt']),
};

export function defaultLearningState(): LearningState {
  return {
    version: 1,
    workflowVersion: 2,
    verificationManifests: [],
    checkpointCount: 0,
    sinceReview: 0,
    lastCheckpointAt: null,
    lastReviewAt: null,
    lastCuratorAt: null,
    recentIdempotency: [],
    recentRejections: [],
    pendingReviews: [],
    reviewDecisions: {},
    procedures: [],
    skillProposals: [],
    decisionReviews: [],
  };
}

function normalizeState(value: unknown): LearningState {
  if (!value || typeof value !== 'object') throw new Error('Invalid learning state');
  const raw = value as Partial<LearningState>;
  if (raw.version !== 1) throw new Error('Unsupported learning state version');
  if (raw.workflowVersion !== undefined && raw.workflowVersion !== 2) throw new Error('Unsupported learning workflow version');
  if (raw.decisionReviews !== undefined && (!Array.isArray(raw.decisionReviews) || raw.decisionReviews.length > 256
    || raw.decisionReviews.some(item => !decisionRecordSchema.safeParse(item).success))) throw new Error('Invalid learning decision review');
  for (const key of ['pendingReviews', 'procedures', 'verificationManifests', 'skillProposals'] as const) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) throw new Error('Invalid learning ' + key);
  }
  for (const item of raw.skillProposals ?? []) {
    if (!item || item.version !== 1 || typeof item.id !== 'string' || !item.id.startsWith('skill-proposal:')
      || !DIGEST_RE.test(item.revisionDigest) || !DIGEST_RE.test(item.contentKey)
      || typeof item.workspace !== 'string' || typeof item.workspaceIdentity !== 'string' || !item.input
      || !Array.isArray(item.input.steps) || !Array.isArray(item.sourceTaskIds) || !Array.isArray(item.supportTaskIds)
      || !Array.isArray(item.failureTaskIds) || !Array.isArray(item.evidenceRefs) || !Array.isArray(item.notices)
      || !Array.isArray(item.decisions) || !Array.isArray(item.history)) throw new Error('Invalid skill proposal state');
  }
  for (const item of raw.procedures ?? []) {
    if (!item || !DIGEST_RE.test(item.fingerprint) || !item.name || !Array.isArray(item.steps)
      || !Array.isArray(item.supportTaskIds) || !Array.isArray(item.failureTaskIds)) throw new Error('Invalid learning procedure');
    if (item.contractVersion !== undefined || item.contractDigest !== undefined || item.contractReceipts !== undefined) {
      if (item.contractVersion !== 1 || !item.contractDigest || !DIGEST_RE.test(item.contractDigest)
        || item.contractDigest !== procedureContractDigest(item) || !Array.isArray(item.contractReceipts)
        || item.contractReceipts.length > 32) throw new Error('Invalid learning procedure contract');
      const keys = new Set<string>();
      for (const receipt of item.contractReceipts) {
        const key = receipt.taskId + ':' + receipt.outcome;
        if (typeof receipt.taskId !== 'string' || !receipt.taskId.trim() || receipt.taskId.length > 200
          || receipt.contractDigest !== item.contractDigest || !['verified', 'failed'].includes(receipt.outcome)
          || !Array.isArray(receipt.evidenceRefs) || !receipt.evidenceRefs.length || receipt.evidenceRefs.length > 32
          || receipt.evidenceRefs.some(ref => !safeEvidenceRefSchema().safeParse(ref).success)
          || keys.has(key)) throw new Error('Invalid learning procedure receipt');
        keys.add(key);
      }
    }
  }
  for (const item of raw.verificationManifests ?? []) {
    if (!item || typeof item.taskId !== 'string' || !item.taskId || typeof item.case?.path !== 'string'
      || !DIGEST_RE.test(item.case.digest) || typeof item.answerPath !== 'string') throw new Error('Invalid verification manifest');
  }
  if (raw.reviewDecisions !== undefined && (!raw.reviewDecisions || typeof raw.reviewDecisions !== 'object'
    || Array.isArray(raw.reviewDecisions))) throw new Error('Invalid learning decisions');
  for (const item of Object.values(raw.reviewDecisions ?? {})) {
    if (!item || typeof item.complete !== 'boolean' || typeof item.status !== 'string'
      || !item.candidateResults || typeof item.candidateResults !== 'object' || Array.isArray(item.candidateResults)) throw new Error('Invalid learning decision');
  }
  const integer = (v: unknown, name: string) => {
    if (!Number.isSafeInteger(v) || Number(v) < 0) throw new Error(`Invalid learning ${name}`);
    return Number(v);
  };

  const nullableIso = (v: unknown, name: string): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new Error(`Invalid learning ${name}`);
    return new Date(v).toISOString();
  };
  const recent = Array.isArray(raw.recentIdempotency)
    ? raw.recentIdempotency.slice(-MAX_IDEMPOTENCY).map((item) => {
      if (!item || typeof item !== 'object') throw new Error('Invalid learning idempotency record');
      const record = item as { key?: unknown; at?: unknown };
      if (typeof record.key !== 'string' || !record.key.trim()) throw new Error('Invalid learning idempotency key');
      return { key: record.key.trim().slice(0, 200), at: nullableIso(record.at, 'idempotency timestamp')! };
    })
    : [];
  const recentRejections = Array.isArray(raw.recentRejections)
    ? raw.recentRejections.slice(-MAX_REJECTIONS).map((item) => {
      if (!item || typeof item !== 'object') throw new Error('Invalid learning rejection record');
      const record = item as unknown as Record<string, unknown>;
      const fingerprint = String(record.fingerprint ?? '');
      const evidenceDigest = String(record.evidenceDigest ?? '');
      const workspaceKey = String(record.workspaceKey ?? '');
      const rawStatus = record.status;
      if (!DIGEST_RE.test(fingerprint) || !DIGEST_RE.test(evidenceDigest) || !DIGEST_RE.test(workspaceKey)) {
        throw new Error('Invalid learning rejection digest');
      }
      if (rawStatus !== 'proposal' && rawStatus !== 'rejected') throw new Error('Invalid learning rejection status');
      const status: LearningRejectionFingerprint['status'] = rawStatus;
      const reasonCode = String(record.reasonCode ?? '').trim().slice(0, 120);
      if (!reasonCode) throw new Error('Invalid learning rejection reason');
      return {
        fingerprint: fingerprint.toLowerCase(),
        evidenceDigest: evidenceDigest.toLowerCase(),
        workspaceKey: workspaceKey.toLowerCase(),
        status,
        reasonCode,
        at: nullableIso(record.at, 'rejection timestamp')!,
      };
    })
    : [];
  const pendingReviews: PendingLearningReview[] = Array.isArray(raw.pendingReviews)
    ? raw.pendingReviews.map((item) => {
      if (!item || typeof item !== 'object') throw new Error('Invalid pending learning review');
      const record = item as unknown as Record<string, unknown>;
      const idempotencyKey = String(record.idempotencyKey ?? '').trim().slice(0, 200);
      if (!idempotencyKey) throw new Error('Invalid pending learning idempotency key');
      const rawReason = record.reason;
      if (rawReason !== 'task-complete' && rawReason !== 'user-correction'
        && rawReason !== 'verified-recovery' && rawReason !== 'explicit-learn') {
        throw new Error('Invalid pending learning reason');
      }
      const evidenceRefs = Array.isArray(record.evidenceRefs)
        ? [...new Set(record.evidenceRefs.map((value) => String(value).trim()).filter(Boolean))].slice(0, 32)
        : [];
      for (const ref of evidenceRefs) {
        if (ref.length > 1000) throw new Error('Invalid pending learning evidence reference');
      }
      const workspace = record.workspace === undefined ? undefined : String(record.workspace).trim().slice(0, 200);
      return {
        idempotencyKey,
        reason: rawReason,
        evidenceRefs,
        ...(workspace ? { workspace } : {}),
        createdAt: nullableIso(record.createdAt, 'pending review timestamp')!,
        ...(typeof record.taskId === 'string' ? { taskId: record.taskId.slice(0, 200) } : {}),
      };
    })
    : [];

  return {
    version: 1,
    checkpointCount: integer(raw.checkpointCount ?? 0, 'checkpointCount'),
    sinceReview: integer(raw.sinceReview ?? 0, 'sinceReview'),
    lastCheckpointAt: nullableIso(raw.lastCheckpointAt, 'lastCheckpointAt'),
    lastReviewAt: nullableIso(raw.lastReviewAt, 'lastReviewAt'),
    lastCuratorAt: nullableIso(raw.lastCuratorAt, 'lastCuratorAt'),
    recentIdempotency: recent,
    recentRejections,
    pendingReviews,
    reviewDecisions: raw.reviewDecisions && typeof raw.reviewDecisions === 'object' && !Array.isArray(raw.reviewDecisions)
      ? raw.reviewDecisions : {},
    procedures: Array.isArray(raw.procedures) ? raw.procedures : [],
    skillProposals: Array.isArray(raw.skillProposals) ? raw.skillProposals : [],
    decisionReviews: raw.decisionReviews ?? [],
    verificationManifests: Array.isArray(raw.verificationManifests) ? raw.verificationManifests : [],
    workflowVersion: 2,
  };
}

export class LearningStateStore {
  private issue: string | null = null;
  private corruptionSnapshotTaken = false;

  constructor(readonly paths: LearningPaths) {}

  getIssue(): string | null {
    return this.issue;
  }

  async load(): Promise<LearningState> {
    await mkdir(this.paths.root, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.paths.state, 'utf8'));
      const state = normalizeState(parsed);
      this.issue = null;
      this.corruptionSnapshotTaken = false;
      return state;
    } catch (error) {
      if (await isNewState(this.paths.state, error)) {
        this.issue = null;
        return defaultLearningState();
      }
      this.issue = `Learning state degraded: ${error instanceof Error ? error.message : String(error)}`;
      if (!this.corruptionSnapshotTaken) {
        try {
          const stamp = new Date().toISOString().replaceAll(':', '-');
          await copyFile(this.paths.state, path.join(this.paths.root, `state.corrupt.${stamp}.json`));
          this.corruptionSnapshotTaken = true;
        } catch {
          // Preserve fail-soft startup even if the corrupt snapshot cannot be copied.
        }
      }
      return defaultLearningState();
    }
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    const key = path.resolve(this.paths.state).toLowerCase();
    const previous = STATE_MUTATION_TAILS.get(key) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>(resolve => { release = resolve; });
    STATE_MUTATION_TAILS.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (STATE_MUTATION_TAILS.get(key) === tail) STATE_MUTATION_TAILS.delete(key);
    }
  }

  private assertOwnerMutation(owner: LearningStateOwner, before: LearningState, after: LearningState): void {
    const allowed = OWNER_FIELDS[owner];
    for (const key of Object.keys(before) as Array<keyof LearningState>) {
      if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
      if (!allowed.has(key)) throw new Error(`LEARNING_STATE_OWNER_VIOLATION: ${owner} cannot mutate ${String(key)}`);
    }
  }

  async mutate<T>(
    owner: LearningStateOwner,
    transition: (current: LearningState) => Promise<{ state: LearningState; result: T; persist?: boolean }>
      | { state: LearningState; result: T; persist?: boolean },
  ): Promise<{ state: LearningState; result: T }> {
    return this.withMutationLock(async () => {
      const current = await this.load();
      if (this.issue) throw new Error('LEARNING_STATE_DEGRADED_WRITE_REFUSED');
      const next = await transition(current);
      const normalized = normalizeState(next.state);
      this.assertOwnerMutation(owner, current, normalized);
      if (next.persist !== false) await this.save(normalized);
      return { state: normalized, result: next.result };
    });
  }

  async save(state: LearningState): Promise<void> {
    await mkdir(this.paths.root, { recursive: true });
    const normalized = normalizeState({
      ...state,
      recentIdempotency: state.recentIdempotency.slice(-MAX_IDEMPOTENCY),
      recentRejections: state.recentRejections.slice(-MAX_REJECTIONS),
      pendingReviews: state.pendingReviews ?? [],
    });
    await writeStateFile(this.paths.state, normalized);
    this.issue = null;
    this.corruptionSnapshotTaken = false;
  }
}
