import { createHash } from 'node:crypto';
import path from 'node:path';
import { BoundedJsonlEventLog } from '../persistence/bounded-event-log.js';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import type { TrackerEvent } from '../tracker/activity-tracker.js';
import type { MemoryFeedbackSnapshot } from './feedback.js';
import { withMemoryProcessLock } from './lock.js';
import { assertLearningTextSafe } from './safety.js';
import type { MemoryPaths } from './paths.js';

const VERSION = 1 as const;
const MAX_ATTEMPTS = 4_000;
const COMPACT_TO = 3_000;
const MAX_EXPOSURES = 50;
const MAX_REASON_CODES = 12;
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const MAX_REPLAY_RECORDS = 5_000;
const MAX_DIAGNOSTIC_ATTEMPTS = 200;
const MAX_RECEIPTS = 4_000;
const COMPACT_RECEIPTS_TO = 3_000;
const MAX_RECEIPT_REFS = 16;

export type MemoryRetrievalStatus = 'succeeded' | 'no-results' | 'failed';
export type MemoryRetrievalDeliveryStatus = 'not-attempted' | 'returned-to-controller' | 'failed';
export type MemoryRetrievalDisposition = 'selected' | 'dropped' | 'deduped' | 'trimmed';

export interface MemoryRetrievalExposure {
  memoryId: string;
  rank: number;
  disposition: MemoryRetrievalDisposition;
  handoffStatus: MemoryRetrievalDeliveryStatus;
  recordFingerprint: string;
  contentDigest?: string;
  scoreSummary?: Record<string, number | null>;
  reasonCodes?: string[];
}

export interface MemoryRetrievalAttempt {
  taskId?: string;
  version: typeof VERSION;
  attemptId: string;
  surface: 'memory_search' | 'memory_page';
  trigger: 'explicit';
  startedAt: string;
  completedAt: string;
  retrievalStatus: MemoryRetrievalStatus;
  deliveryStatus: MemoryRetrievalDeliveryStatus;
  candidateCount: number;
  selectedCount: number;
  workspace?: string;
  rankingProfile?: 'legacy' | 'bm25' | 'fusion';
  referenceTime?: string;
  limitRequested?: number;
  budgetChars?: number;
  queryHashSha256?: string;
  queryCharCount?: number;
  queryTokenEstimate?: number;
  latencyMs?: number;
  failureCode?: string;
  failureStage?: string;
  exposures: MemoryRetrievalExposure[];
}

export interface MemoryRetrievalDiagnosticsInput {
  workspace?: string;
  limit?: number;
  maxAgeDays?: number;
}

export type MemoryUseApplicability = 'applied' | 'adapted' | 'rejected';
export type MemoryUseResult = 'success' | 'failure' | 'unavailable';

export interface MemoryUseReceiptInput {
  taskId?: string;
  actionRefs?: string[];
  evidenceValidation?: 'resolved' | 'unavailable';
  useId: string;
  retrievalAttemptId: string;
  memoryId: string;
  contentDigest: string;
  workspace?: string;
  applicability: MemoryUseApplicability;
  result: MemoryUseResult;
  reasonCode: string;
  evidenceRefs?: string[];
  verificationRef?: string;
  summary?: string;
}

export interface MemoryUseReceipt extends MemoryUseReceiptInput {
  version: typeof VERSION;
  recordedAt: string;
  evidenceRefs: string[];
}

function stableDigest(value: unknown): string {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function iso(value: string, name: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`MEMORY_RETRIEVAL_${name.toUpperCase()}_INVALID`);
  return new Date(value).toISOString();
}

function nonNegativeInt(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`MEMORY_RETRIEVAL_${name.toUpperCase()}_INVALID`);
  return value;
}

function optionalText(value: string | undefined, max: number): string | undefined {
  const text = value?.trim();
  return text ? text.slice(0, max) : undefined;
}

function strictSafeText(value: string | undefined, max: number, code: string): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > max || /[\0\r\n]/.test(text)) throw new Error(code);
  try { assertLearningTextSafe(text); } catch { throw new Error(code); }
  return text;
}

function normalizeUseEvidenceRef(value: string, code: string): string {
  const text = strictSafeText(value, 1_000, code);
  if (!text || !/^(?:tool|activity|memory|file|grafel|source|verification|user-correction):\S.*$/i.test(text)) {
    throw new Error(code);
  }
  return text;
}

function normalizeUseReceiptInput(raw: MemoryUseReceiptInput): MemoryUseReceiptInput & { evidenceRefs: string[] } {
  const useId = String(raw.useId ?? '').trim();
  const retrievalAttemptId = String(raw.retrievalAttemptId ?? '').trim();
  const memoryId = String(raw.memoryId ?? '').trim();
  const contentDigest = String(raw.contentDigest ?? '').trim().toLowerCase();
  const workspace = optionalText(raw.workspace, 120)?.toLowerCase();
  const reasonCode = String(raw.reasonCode ?? '').trim().toLowerCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(useId)) throw new Error('MEMORY_USE_RECEIPT_USE_ID_INVALID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(retrievalAttemptId)) throw new Error('MEMORY_USE_RECEIPT_ATTEMPT_ID_INVALID');
  if (!memoryId || memoryId.length > 128) throw new Error('MEMORY_USE_RECEIPT_MEMORY_ID_INVALID');
  if (!/^sha256:[0-9a-f]{64}$/.test(contentDigest)) throw new Error('MEMORY_USE_RECEIPT_DIGEST_INVALID');
  if (!['applied', 'adapted', 'rejected'].includes(raw.applicability)) throw new Error('MEMORY_USE_RECEIPT_APPLICABILITY_INVALID');
  if (!['success', 'failure', 'unavailable'].includes(raw.result)) throw new Error('MEMORY_USE_RECEIPT_RESULT_INVALID');
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(reasonCode)) throw new Error('MEMORY_USE_RECEIPT_REASON_INVALID');
  const evidenceRefs = [...new Set((raw.evidenceRefs ?? []).map(value => normalizeUseEvidenceRef(value, 'MEMORY_USE_RECEIPT_EVIDENCE_INVALID')))];
  if (evidenceRefs.length > MAX_RECEIPT_REFS) throw new Error('MEMORY_USE_RECEIPT_EVIDENCE_LIMIT');
  const verificationRef = raw.verificationRef === undefined ? undefined
    : normalizeUseEvidenceRef(raw.verificationRef, 'MEMORY_USE_RECEIPT_VERIFICATION_INVALID');
  if ((raw.result === 'success' || raw.result === 'failure') && !verificationRef) throw new Error('MEMORY_USE_RECEIPT_VERIFICATION_REQUIRED');
  const summary = strictSafeText(raw.summary, 500, 'MEMORY_USE_RECEIPT_SUMMARY_INVALID');
  return { useId, retrievalAttemptId, memoryId, contentDigest, ...(workspace ? { workspace } : {}),
    ...(raw.taskId ? { taskId: strictSafeText(raw.taskId, 200, 'MEMORY_USE_RECEIPT_TASK_INVALID') } : {}),
    actionRefs: (raw.actionRefs ?? []).slice(0, MAX_RECEIPT_REFS).map(ref => normalizeUseEvidenceRef(ref, 'MEMORY_USE_RECEIPT_ACTION_INVALID')),
    evidenceValidation: raw.evidenceValidation === 'resolved' ? 'resolved' : 'unavailable',
    applicability: raw.applicability, result: raw.result, reasonCode, evidenceRefs,
    ...(verificationRef ? { verificationRef } : {}), ...(summary ? { summary } : {}) };
}

function normalizePersistedReceipt(raw: MemoryUseReceipt): MemoryUseReceipt {
  if (raw.version !== VERSION) throw new Error('MEMORY_USE_RECEIPT_VERSION_INVALID');
  const normalized = normalizeUseReceiptInput(raw);
  return { version: VERSION, recordedAt: iso(raw.recordedAt, 'receipt_recorded_at'), ...normalized };
}

function normalizeReasonCodes(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const output = [...new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean))]
    .filter(value => /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value))
    .slice(0, MAX_REASON_CODES);
  return output.length ? output : undefined;
}

function normalizeScoreSummary(input: Record<string, number | null> | undefined): Record<string, number | null> | undefined {
  if (!input) return undefined;
  const output: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(input).slice(0, 24)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(key)) continue;
    if (value !== null && !Number.isFinite(value)) continue;
    output[key] = value;
  }
  return Object.keys(output).length ? output : undefined;
}

function normalizeAttempt(raw: MemoryRetrievalAttempt): MemoryRetrievalAttempt {
  if (raw.version !== VERSION) throw new Error('MEMORY_RETRIEVAL_LEDGER_VERSION_INVALID');
  const attemptId = raw.attemptId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(attemptId)) throw new Error('MEMORY_RETRIEVAL_ATTEMPT_ID_INVALID');
  if (!['memory_search', 'memory_page'].includes(raw.surface)) throw new Error('MEMORY_RETRIEVAL_SURFACE_INVALID');
  if (raw.trigger !== 'explicit') throw new Error('MEMORY_RETRIEVAL_TRIGGER_INVALID');
  if (!['succeeded', 'no-results', 'failed'].includes(raw.retrievalStatus)) throw new Error('MEMORY_RETRIEVAL_STATUS_INVALID');
  if (!['not-attempted', 'returned-to-controller', 'failed'].includes(raw.deliveryStatus)) throw new Error('MEMORY_RETRIEVAL_DELIVERY_INVALID');
  const startedAt = iso(raw.startedAt, 'started_at');
  const completedAt = iso(raw.completedAt, 'completed_at');
  if (Date.parse(completedAt) < Date.parse(startedAt)) throw new Error('MEMORY_RETRIEVAL_TIME_ORDER_INVALID');
  const exposures = (raw.exposures ?? []).slice(0, MAX_EXPOSURES).map((exposure, index) => {
    const memoryId = exposure.memoryId.trim();
    if (!memoryId || memoryId.length > 128) throw new Error('MEMORY_RETRIEVAL_EXPOSURE_ID_INVALID');
    if (!Number.isSafeInteger(exposure.rank) || exposure.rank < 1 || exposure.rank > MAX_EXPOSURES) {
      throw new Error('MEMORY_RETRIEVAL_EXPOSURE_RANK_INVALID');
    }
    if (!['selected', 'dropped', 'deduped', 'trimmed'].includes(exposure.disposition)) {
      throw new Error('MEMORY_RETRIEVAL_EXPOSURE_DISPOSITION_INVALID');
    }
    if (!['not-attempted', 'returned-to-controller', 'failed'].includes(exposure.handoffStatus)) {
      throw new Error('MEMORY_RETRIEVAL_EXPOSURE_HANDOFF_INVALID');
    }
    if (!/^sha256:[0-9a-f]{64}$/i.test(exposure.recordFingerprint)) {
      throw new Error('MEMORY_RETRIEVAL_EXPOSURE_FINGERPRINT_INVALID');
    }
    const contentDigest = exposure.contentDigest?.trim().toLowerCase();
    if (contentDigest && !/^sha256:[0-9a-f]{64}$/.test(contentDigest)) {
      throw new Error('MEMORY_RETRIEVAL_EXPOSURE_CONTENT_DIGEST_INVALID');
    }
    return {
      memoryId,
      rank: exposure.rank || index + 1,
      disposition: exposure.disposition,
      handoffStatus: exposure.handoffStatus,
      recordFingerprint: exposure.recordFingerprint.toLowerCase(),
      ...(contentDigest ? { contentDigest } : {}),
      ...(normalizeScoreSummary(exposure.scoreSummary) ? { scoreSummary: normalizeScoreSummary(exposure.scoreSummary) } : {}),
      ...(normalizeReasonCodes(exposure.reasonCodes) ? { reasonCodes: normalizeReasonCodes(exposure.reasonCodes) } : {}),
    } satisfies MemoryRetrievalExposure;
  });
  const workspace = optionalText(raw.workspace, 120);
  const referenceTime = raw.referenceTime === undefined ? undefined : iso(raw.referenceTime, 'reference_time');
  const failureCode = optionalText(raw.failureCode, 120);
  const failureStage = optionalText(raw.failureStage, 120);
  const queryHashSha256 = raw.queryHashSha256?.toLowerCase();
  if (queryHashSha256 && !/^sha256:[0-9a-f]{64}$/.test(queryHashSha256)) throw new Error('MEMORY_RETRIEVAL_QUERY_HASH_INVALID');
  return {
    version: VERSION,
    attemptId,
    ...(raw.taskId ? { taskId: strictSafeText(raw.taskId, 200, 'MEMORY_RETRIEVAL_TASK_INVALID') } : {}),
    surface: raw.surface,
    trigger: 'explicit',
    startedAt,
    completedAt,
    retrievalStatus: raw.retrievalStatus,
    deliveryStatus: raw.deliveryStatus,
    candidateCount: nonNegativeInt(raw.candidateCount, 'candidate_count'),
    selectedCount: nonNegativeInt(raw.selectedCount, 'selected_count'),
    ...(workspace ? { workspace } : {}),
    ...(raw.rankingProfile ? { rankingProfile: raw.rankingProfile } : {}),
    ...(referenceTime ? { referenceTime } : {}),
    ...(raw.limitRequested !== undefined ? { limitRequested: nonNegativeInt(raw.limitRequested, 'limit') } : {}),
    ...(raw.budgetChars !== undefined ? { budgetChars: nonNegativeInt(raw.budgetChars, 'budget') } : {}),
    ...(queryHashSha256 ? { queryHashSha256 } : {}),
    ...(raw.queryCharCount !== undefined ? { queryCharCount: nonNegativeInt(raw.queryCharCount, 'query_chars') } : {}),
    ...(raw.queryTokenEstimate !== undefined ? { queryTokenEstimate: nonNegativeInt(raw.queryTokenEstimate, 'query_tokens') } : {}),
    ...(raw.latencyMs !== undefined ? { latencyMs: nonNegativeInt(raw.latencyMs, 'latency') } : {}),
    ...(failureCode ? { failureCode } : {}),
    ...(failureStage ? { failureStage } : {}),
    exposures,
  };
}

export function memoryRecordFingerprint(id: string, updatedAt: string): string {
  return 'sha256:' + createHash('sha256').update(`${id}\0${updatedAt}`).digest('hex');
}

export function hashMemoryRetrievalQuery(query: string): string {
  return 'sha256:' + createHash('sha256').update(query).digest('hex');
}

export class MemoryRetrievalLedger {
  private readonly filePath: string;
  private readonly receiptFilePath: string;
  private readonly lockPath: string;
  private readonly log: BoundedJsonlEventLog;
  private readonly receiptLog: BoundedJsonlEventLog;
  private issue: string | null = null;
  private receiptIssue: string | null = null;

  constructor(paths: MemoryPaths) {
    this.filePath = path.join(paths.state, 'retrieval-ledger.jsonl');
    this.receiptFilePath = path.join(paths.state, 'retrieval-use-receipts.jsonl');
    this.lockPath = paths.lock;
    this.log = new BoundedJsonlEventLog(this.filePath, {
      maxBytes: MAX_JSON_BYTES,
      maxRecords: MAX_REPLAY_RECORDS,
      mode: 0o600,
      onDiagnostic: message => { this.issue = `Memory retrieval ledger: ${message}`; },
    });
    this.receiptLog = new BoundedJsonlEventLog(this.receiptFilePath, {
      maxBytes: MAX_JSON_BYTES,
      maxRecords: MAX_REPLAY_RECORDS,
      mode: 0o600,
      onDiagnostic: message => { this.receiptIssue = `Memory use receipt ledger: ${message}`; },
    });
  }

  getIssue(): string | null {
    return this.issue;
  }

  private readAll(): MemoryRetrievalAttempt[] {
    try {
      const rows = this.log.replaySync(line => normalizeAttempt(JSON.parse(line) as MemoryRetrievalAttempt));
      this.issue = null;
      return rows.slice(-MAX_ATTEMPTS);
    } catch (error) {
      this.issue = `Memory retrieval ledger degraded: ${error instanceof Error ? error.message : String(error)}`;
      throw new Error('MEMORY_RETRIEVAL_LEDGER_DEGRADED');
    }
  }

  private readReceipts(): MemoryUseReceipt[] {
    try {
      const rows = this.receiptLog.replaySync(line => normalizePersistedReceipt(JSON.parse(line) as MemoryUseReceipt));
      this.receiptIssue = null;
      return rows.slice(-MAX_RECEIPTS);
    } catch (error) {
      this.receiptIssue = `Memory use receipt ledger degraded: ${error instanceof Error ? error.message : String(error)}`;
      throw new Error('MEMORY_USE_RECEIPT_LEDGER_DEGRADED');
    }
  }

  async recordUseReceipt(
    input: MemoryUseReceiptInput,
    currentContentDigest: string,
  ): Promise<{ duplicate: boolean; receipt: MemoryUseReceipt }> {
    const normalized = normalizeUseReceiptInput(input);
    const currentDigest = String(currentContentDigest ?? '').trim().toLowerCase();
    if (!/^sha256:[0-9a-f]{64}$/.test(currentDigest)) throw new Error('MEMORY_USE_RECEIPT_CURRENT_DIGEST_INVALID');

    return withMemoryProcessLock(this.lockPath, async () => {
      const attempt = this.readAll().find(row => row.attemptId === normalized.retrievalAttemptId);
      if (!attempt) throw new Error('MEMORY_USE_RECEIPT_ATTEMPT_NOT_FOUND');
      if (normalized.taskId && attempt.taskId !== normalized.taskId) throw new Error('MEMORY_USE_RECEIPT_TASK_MISMATCH');
      if (!normalized.taskId) { normalized.result = 'unavailable'; normalized.evidenceValidation = 'unavailable'; }
      if ((attempt.workspace ?? '') !== (normalized.workspace ?? '')) throw new Error('MEMORY_USE_RECEIPT_WORKSPACE_MISMATCH');
      const exposure = attempt.exposures.find(row => row.memoryId === normalized.memoryId);
      if (!exposure) throw new Error('MEMORY_USE_RECEIPT_EXPOSURE_NOT_FOUND');
      if (!['selected', 'trimmed'].includes(exposure.disposition) || exposure.handoffStatus !== 'returned-to-controller') {
        throw new Error('MEMORY_USE_RECEIPT_EXPOSURE_NOT_ELIGIBLE');
      }
      if (!exposure.contentDigest) throw new Error('MEMORY_USE_RECEIPT_EXPOSURE_DIGEST_UNAVAILABLE');
      if (exposure.contentDigest !== normalized.contentDigest) throw new Error('MEMORY_USE_RECEIPT_DIGEST_MISMATCH');

      const contentChanged = currentDigest !== normalized.contentDigest;
      if (contentChanged && !(normalized.applicability === 'rejected' && normalized.reasonCode === 'stale-content')) {
        throw new Error('MEMORY_USE_RECEIPT_CONTENT_CHANGED');
      }
      if (!contentChanged && normalized.reasonCode === 'stale-content') {
        throw new Error('MEMORY_USE_RECEIPT_STALE_REASON_INVALID');
      }

      const rows = this.readReceipts();
      const existing = rows.find(row => row.useId === normalized.useId);
      if (existing) {
        const { version: _version, recordedAt: _recordedAt, ...existingPayload } = existing;
        if (stableDigest(existingPayload) !== stableDigest(normalized)) throw new Error('MEMORY_USE_RECEIPT_CONFLICT');
        return { duplicate: true, receipt: existing };
      }

      const receipt: MemoryUseReceipt = { version: VERSION, recordedAt: new Date().toISOString(), ...normalized };
      if (rows.length >= MAX_RECEIPTS) {
        const retained = [...rows.slice(-(COMPACT_RECEIPTS_TO - 1)), receipt];
        await writeOwnedFileAtomic(
          this.receiptFilePath,
          retained.map(row => JSON.stringify(row)).join('\n') + '\n',
          { mode: 0o600 },
        );
      } else {
        this.receiptLog.appendSync([receipt], { durable: true });
      }
      this.receiptIssue = null;
      return { duplicate: false, receipt };
    });
  }

  async record(input: MemoryRetrievalAttempt): Promise<{ duplicate: boolean; attempt: MemoryRetrievalAttempt }> {
    const attempt = normalizeAttempt(input);
    return withMemoryProcessLock(this.lockPath, async () => {
      const rows = this.readAll();
      const existing = rows.find(row => row.attemptId === attempt.attemptId);
      if (existing) {
        if (stableDigest(existing) !== stableDigest(attempt)) throw new Error('MEMORY_RETRIEVAL_ATTEMPT_CONFLICT');
        return { duplicate: true, attempt: existing };
      }
      if (rows.length >= MAX_ATTEMPTS) {
        const retained = [...rows.slice(-(COMPACT_TO - 1)), attempt];
        await writeOwnedFileAtomic(
          this.filePath,
          retained.map(row => JSON.stringify(row)).join('\n') + '\n',
          { mode: 0o600 },
        );
      } else {
        this.log.appendSync([attempt], { durable: true });
      }
      this.issue = null;
      return { duplicate: false, attempt };
    });
  }

  list(input: MemoryRetrievalDiagnosticsInput = {}): MemoryRetrievalAttempt[] {
    const limit = Math.max(1, Math.min(MAX_DIAGNOSTIC_ATTEMPTS, input.limit ?? 100));
    const maxAgeDays = Math.max(1, Math.min(365, input.maxAgeDays ?? 90));
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const workspace = input.workspace?.trim().toLowerCase();
    return this.readAll()
      .filter(row => Date.parse(row.completedAt) >= cutoff)
      .filter(row => !workspace || row.workspace?.trim().toLowerCase() === workspace)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.attemptId.localeCompare(a.attemptId))
      .slice(0, limit);
  }

  diagnostics(
    feedback: MemoryFeedbackSnapshot[],
    trackerEvents: TrackerEvent[],
    input: MemoryRetrievalDiagnosticsInput = {},
  ) {
    const attempts = this.list(input);
    let receiptStatus: 'available' | 'unavailable' = 'available';
    let allReceipts: MemoryUseReceipt[] = [];
    try { allReceipts = this.readReceipts(); }
    catch { receiptStatus = 'unavailable'; }
    const attemptIds = new Set(attempts.map(row => row.attemptId));
    const receipts = allReceipts.filter(row => attemptIds.has(row.retrievalAttemptId));
    const receiptAttemptIds = new Set(receipts.map(row => row.retrievalAttemptId));
    const feedbackByMemory = new Map(feedback.map(row => [row.id, row]));
    const trackerByAttempt = new Map<string, TrackerEvent[]>();
    for (const event of trackerEvents) {
      const attemptId = typeof event.context?.retrievalAttemptId === 'string'
        ? event.context.retrievalAttemptId
        : undefined;
      if (!attemptId) continue;
      trackerByAttempt.set(attemptId, [...(trackerByAttempt.get(attemptId) ?? []), event]);
    }

    let selectedExposures = 0;
    let handedOffExposures = 0;
    let assessedAttempts = 0;
    let helpful = 0;
    let stale = 0;
    let harmful = 0;
    let explicitFeedbackEvents = 0;
    let linkedFeatureOutcomes = 0;
    const latencies: number[] = [];

    for (const attempt of attempts) {
      if (attempt.latencyMs !== undefined) latencies.push(attempt.latencyMs);
      const labels = new Set<'helpful' | 'stale' | 'harmful'>();
      for (const exposure of attempt.exposures) {
        if (exposure.disposition === 'selected' || exposure.disposition === 'trimmed') selectedExposures += 1;
        if (exposure.handoffStatus === 'returned-to-controller') handedOffExposures += 1;
        const record = feedbackByMemory.get(exposure.memoryId);
        const eligible = record?.events.filter(event => Date.parse(event.at) >= Date.parse(attempt.completedAt)) ?? [];
        explicitFeedbackEvents += eligible.length;
        for (const event of eligible) {
          if (event.kind === 'helpful') labels.add('helpful');
          else if (event.kind === 'stale') labels.add('stale');
          else labels.add('harmful');
        }
      }
      linkedFeatureOutcomes += trackerByAttempt.get(attempt.attemptId)?.filter(event => Boolean(event.featureOutcome)).length ?? 0;
      if (labels.size > 0) {
        assessedAttempts += 1;
        if (labels.size === 1) {
          if (labels.has('helpful')) helpful += 1;
          if (labels.has('stale')) stale += 1;
          if (labels.has('harmful')) harmful += 1;
        }
      }
    }

    const receiptExposureKeys = new Set(receipts.map(row => `${row.retrievalAttemptId}\0${row.memoryId}`));
    const applied = receipts.filter(row => row.applicability === 'applied').length;
    const adapted = receipts.filter(row => row.applicability === 'adapted').length;
    const rejected = receipts.filter(row => row.applicability === 'rejected').length;
    const associatedSuccess = receipts.filter(row => row.result === 'success').length;
    const associatedFailure = receipts.filter(row => row.result === 'failure').length;
    const outcomeUnavailable = receipts.filter(row => row.result === 'unavailable').length;
    const totalLatencyMs = latencies.reduce((sum, value) => sum + value, 0);
    return {
      contractVersion: 1,
      lifecycle: {
        requestedAttempts: attempts.length,
        selectedAttempts: attempts.filter(row => row.selectedCount > 0).length,
        selectedExposures,
        returnedToControllerAttempts: attempts.filter(row => row.deliveryStatus === 'returned-to-controller').length,
        returnedToControllerExposures: handedOffExposures,
        noResults: attempts.filter(row => row.retrievalStatus === 'no-results').length,
        retrievalFailed: attempts.filter(row => row.retrievalStatus === 'failed').length,
        deliveryFailed: attempts.filter(row => row.deliveryStatus === 'failed').length,
      },
      evidenceCompleteness: {
        assessedAttempts,
        unassessedAttempts: attempts.length - assessedAttempts,
        explicitFeedbackEvents,
        linkedFeatureOutcomes,
        assessmentStatus: attempts.length === 0 ? 'no-attempts' : assessedAttempts === attempts.length ? 'complete-explicit-feedback' : 'observational-incomplete',
      },
      useEvidence: {
        status: receiptStatus,
        receiptCount: receipts.length,
        receiptAssessedAttempts: receiptAttemptIds.size,
        receiptAssessedExposures: receiptExposureKeys.size,
        unassessedAttempts: Math.max(0, attempts.length - receiptAttemptIds.size),
        applied,
        adapted,
        rejected,
        associatedSuccess,
        associatedFailure,
        outcomeUnavailable,
      },
      overhead: {
        latencySampleCount: latencies.length,
        totalLatencyMs,
        averageLatencyMs: latencies.length ? totalLatencyMs / latencies.length : null,
        maximumLatencyMs: latencies.length ? Math.max(...latencies) : null,
      },
      findings: { helpful, stale, harmful },
      limitations: [
        'returned-to-controller proves only the Agent Core MCP handoff boundary, not model use',
        'ordinary feedback and tracker evidence are observational and do not establish causation',
        'observed use is bounded controller evidence and is not causal proof of improvement',
        'missing receipt means use is unknown, not that the memory was not used',
        'a rejected memory can be the correct outcome when applicability or freshness fails',
        'cross-session improvement claims require a comparable MRR-4 control or baseline',
        'unassessed means no qualifying explicit post-retrieval feedback was observed in the bounded window',
        'no per-memory ROI, productivity score, automatic reranking, or automatic mutation is produced',
      ],
      ledgerIssue: this.issue,
      receiptIssue: this.receiptIssue,
    };
  }

  status() {
    let attemptCount = 0;
    let receiptCount = 0;
    let degraded = false;
    try { attemptCount = this.readAll().length; } catch { degraded = true; }
    try { receiptCount = this.readReceipts().length; } catch { degraded = true; }
    return {
      status: degraded ? 'degraded' as const : 'available' as const,
      attemptCount,
      receiptCount,
      issue: this.issue,
      receiptIssue: this.receiptIssue,
    };
  }
}
