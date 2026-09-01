import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { redactMemoryText } from '../memory/redaction.js';
import { correlationFields } from './correlation.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import type { AuditRecordBroadcaster, AuditRecordListener, AuditRecordSubscription } from './audit-stream.js';

export type AuditJson = null | boolean | number | string | AuditJson[] | { [key: string]: AuditJson };

export interface AuditJournalInput {
  category: string;
  event: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

export interface AuditJournalRecord {
  schemaVersion: 1;
  sequence: number;
  timestamp: string;
  category: string;
  event: string;
  requestId?: string;
  trace_id?: string;
  span_id?: string;
  trace_flags?: string;
  routeContextId?: string;
  toolName?: string;
  runId?: string;
  nodeId?: string;
  attemptId?: string;
  data: Record<string, AuditJson>;
  previousHash: string | null;
  hash: string;
}

export interface AuditJournalStatus {
  queueDepth: number;
  queueCapacity: number;
  written: number;
  dropped: number;
  writeErrors: number;
  sequence: number;
  headHash: string | null;
  currentFileBytes: number;
  rotatedFiles: number;
  lastWriteErrorCode?: string;
}

export interface AuditJournalOptions {
  queueCapacity?: number;
  maxFileBytes?: number;
  maxRotatedFiles?: number;
  retentionMs?: number;
  now?: () => number;
  appendLine?: (filePath: string, line: string) => Promise<void>;
  metrics?: RuntimeMetricRegistry;
  broadcaster?: AuditRecordBroadcaster;
}

export type AuditVerificationResult = {
  ok: true;
  auditRoot: string;
  firstSequence: number;
  lastSequence: number;
  records: number;
  files: number;
  headHash: string | null;
  anchorSequence: number;
} | {
  ok: false;
  auditRoot: string;
  code: string;
  file?: string;
  sequence?: number;
};

interface QueuedAuditEvent {
  category: string;
  event: string;
  timestamp: string;
  data: Record<string, AuditJson>;
  correlation: Record<string, string>;
}

interface AuditChainPointer {
  schemaVersion: 1;
  sequence: number;
  hash: string | null;
  updatedAt: string;
}

interface SegmentDescriptor {
  name: string;
  filePath: string;
  firstSequence: number;
  lastSequence: number;
}

const MAX_DATA_DEPTH = 4;
const MAX_OBJECT_KEYS = 64;
const MAX_ARRAY_ITEMS = 64;
const MAX_STRING_CHARS = 2_000;
const DEFAULT_MAX_FILE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_ROTATED_FILES = 16;
const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const SENSITIVE_KEY = /(?:^|[_-])(authorization|cookie|set-cookie|api[_-]?key|apikey|token|secret|password|passwd|pwd|credential)(?:$|[_-])/i;
const SEGMENT_RE = /^audit\.(\d+)-(\d+)\..+\.jsonl$/;
const HASH_RE = /^[a-f0-9]{64}$/;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return String((error as { code: string }).code).normalize('NFKC').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 160) || 'AUDIT_WRITE_ERROR';
  }
  return error instanceof Error
    ? error.name.normalize('NFKC').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 160) || 'AUDIT_WRITE_ERROR'
    : 'AUDIT_WRITE_ERROR';
}

function boundedString(value: string): string {
  const redacted = redactMemoryText(value).text;
  if (redacted.length <= MAX_STRING_CHARS) return redacted;
  return `${redacted.slice(0, MAX_STRING_CHARS)}…`;
}

function sanitizeValue(value: unknown, depth: number, key?: string): AuditJson | undefined {
  if (key && SENSITIVE_KEY.test(key.replace(/([a-z])([A-Z])/g, '$1_$2'))) return '[REDACTED]';
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return boundedString(value);
  if (depth >= MAX_DATA_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) {
    const result: AuditJson[] = [];
    for (const item of value.slice(0, MAX_ARRAY_ITEMS)) {
      const safe = sanitizeValue(item, depth + 1);
      if (safe !== undefined) result.push(safe);
    }
    return result;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, AuditJson> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(0, MAX_OBJECT_KEYS)) {
      const safe = sanitizeValue(entryValue, depth + 1, entryKey);
      if (safe !== undefined) result[entryKey.slice(0, 160)] = safe;
    }
    return result;
  }
  return undefined;
}

export function sanitizeAuditData(input: Record<string, unknown> | undefined): Record<string, AuditJson> {
  const safe = sanitizeValue(input ?? {}, 0);
  return safe && !Array.isArray(safe) && typeof safe === 'object' ? safe as Record<string, AuditJson> : {};
}

export function computeAuditRecordHash(record: Omit<AuditJournalRecord, 'hash'> | AuditJournalRecord): string {
  const { hash: _hash, ...withoutHash } = record as AuditJournalRecord;
  return createHash('sha256').update(stableJson(withoutHash), 'utf8').digest('hex');
}

async function pathExists(target: string): Promise<boolean> {
  try { await stat(target); return true; } catch { return false; }
}

async function atomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, filePath);
}

function validPointer(value: unknown): value is AuditChainPointer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<AuditChainPointer>;
  return item.schemaVersion === 1
    && Number.isSafeInteger(item.sequence) && Number(item.sequence) >= 0
    && (item.hash === null || (typeof item.hash === 'string' && HASH_RE.test(item.hash)))
    && typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt));
}

async function readPointer(filePath: string): Promise<AuditChainPointer | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return validPointer(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function listSegments(auditRoot: string): Promise<SegmentDescriptor[]> {
  let names: string[] = [];
  try { names = await readdir(auditRoot); } catch { return []; }
  return names.flatMap((name): SegmentDescriptor[] => {
    const match = SEGMENT_RE.exec(name);
    if (!match) return [];
    const firstSequence = Number(match[1]);
    const lastSequence = Number(match[2]);
    if (!Number.isSafeInteger(firstSequence) || !Number.isSafeInteger(lastSequence) || firstSequence < 1 || lastSequence < firstSequence) return [];
    return [{ name, filePath: path.join(auditRoot, name), firstSequence, lastSequence }];
  }).sort((left, right) => left.firstSequence - right.firstSequence || left.lastSequence - right.lastSequence || left.name.localeCompare(right.name));
}

async function readRecordFile(filePath: string): Promise<AuditJournalRecord[]> {
  let text: string;
  try { text = await readFile(filePath, 'utf8'); } catch { return []; }
  if (!text.trim()) return [];
  const records: AuditJournalRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line) as AuditJournalRecord); }
    catch { throw Object.assign(new Error('invalid audit JSON'), { auditCode: 'AUDIT_RECORD_JSON_INVALID' }); }
  }
  return records;
}

function recordShapeValid(record: AuditJournalRecord): boolean {
  return Boolean(record && typeof record === 'object'
    && record.schemaVersion === 1
    && Number.isSafeInteger(record.sequence) && record.sequence > 0
    && typeof record.timestamp === 'string' && Number.isFinite(Date.parse(record.timestamp))
    && typeof record.category === 'string' && typeof record.event === 'string'
    && record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    && (record.previousHash === null || (typeof record.previousHash === 'string' && HASH_RE.test(record.previousHash)))
    && typeof record.hash === 'string' && HASH_RE.test(record.hash));
}

async function verifyChain(auditRoot: string, requireHead: boolean): Promise<AuditVerificationResult> {
  const resolved = path.resolve(auditRoot);
  const anchorPath = path.join(resolved, 'audit-anchor.json');
  const headPath = path.join(resolved, 'audit-head.json');
  const currentPath = path.join(resolved, 'audit.current.jsonl');
  const anchor = await readPointer(anchorPath) ?? { schemaVersion: 1 as const, sequence: 0, hash: null, updatedAt: new Date(0).toISOString() };
  const segments = (await listSegments(resolved)).filter((segment) => segment.lastSequence > anchor.sequence);
  const files: Array<{ filePath: string; descriptor?: SegmentDescriptor }> = segments.map((descriptor) => ({ filePath: descriptor.filePath, descriptor }));
  if (await pathExists(currentPath)) files.push({ filePath: currentPath });

  let expectedSequence = anchor.sequence + 1;
  let previousHash = anchor.hash;
  let records = 0;
  let firstSequence = expectedSequence;
  let lastSequence = anchor.sequence;

  for (const file of files) {
    let items: AuditJournalRecord[];
    try { items = await readRecordFile(file.filePath); }
    catch (error) {
      return { ok: false, auditRoot: resolved, code: (error as { auditCode?: string }).auditCode ?? 'AUDIT_RECORD_JSON_INVALID', file: path.basename(file.filePath) };
    }
    if (file.descriptor && items.length === 0) return { ok: false, auditRoot: resolved, code: 'AUDIT_SEGMENT_EMPTY', file: file.descriptor.name };
    if (file.descriptor && items.length > 0
      && (items[0]!.sequence !== file.descriptor.firstSequence || items.at(-1)!.sequence !== file.descriptor.lastSequence)) {
      return { ok: false, auditRoot: resolved, code: 'AUDIT_SEGMENT_NAME_MISMATCH', file: file.descriptor.name };
    }
    for (const record of items) {
      if (!recordShapeValid(record)) return { ok: false, auditRoot: resolved, code: 'AUDIT_RECORD_SHAPE_INVALID', file: path.basename(file.filePath), sequence: record?.sequence };
      if (record.sequence !== expectedSequence) return { ok: false, auditRoot: resolved, code: 'AUDIT_SEQUENCE_GAP', file: path.basename(file.filePath), sequence: record.sequence };
      if (record.previousHash !== previousHash) return { ok: false, auditRoot: resolved, code: 'AUDIT_PREVIOUS_HASH_MISMATCH', file: path.basename(file.filePath), sequence: record.sequence };
      if (computeAuditRecordHash(record) !== record.hash) return { ok: false, auditRoot: resolved, code: 'AUDIT_RECORD_HASH_MISMATCH', file: path.basename(file.filePath), sequence: record.sequence };
      if (records === 0) firstSequence = record.sequence;
      records += 1;
      lastSequence = record.sequence;
      previousHash = record.hash;
      expectedSequence += 1;
    }
  }

  const head = await readPointer(headPath);
  if (requireHead && !head) return { ok: false, auditRoot: resolved, code: 'AUDIT_HEAD_MISSING' };
  if (head && (head.sequence !== lastSequence || head.hash !== previousHash)) {
    return { ok: false, auditRoot: resolved, code: 'AUDIT_HEAD_MISMATCH', sequence: head.sequence };
  }
  return {
    ok: true,
    auditRoot: resolved,
    firstSequence: records > 0 ? firstSequence : anchor.sequence + 1,
    lastSequence,
    records,
    files: files.length,
    headHash: previousHash,
    anchorSequence: anchor.sequence,
  };
}

export async function verifyAuditJournal(auditRoot: string): Promise<AuditVerificationResult> {
  return verifyChain(auditRoot, true);
}

export class AuditJournal {
  readonly auditRoot: string;
  readonly filePath: string;
  readonly headPath: string;
  readonly anchorPath: string;
  private readonly queue: QueuedAuditEvent[] = [];
  private readonly queueCapacity: number;
  private readonly maxFileBytes: number;
  private readonly maxRotatedFiles: number;
  private readonly retentionMs: number;
  private readonly now: () => number;
  private readonly appendLine: (filePath: string, line: string) => Promise<void>;
  private readonly broadcaster: AuditRecordBroadcaster | undefined;
  private metrics?: RuntimeMetricRegistry;
  private drainPromise: Promise<void> | undefined;
  private inFlight = 0;
  private closed = false;
  private initialized = false;
  private written = 0;
  private dropped = 0;
  private writeErrors = 0;
  private sequence = 0;
  private headHash: string | null = null;
  private currentFileBytes = 0;
  private activeFirstSequence: number | undefined;
  private rotatedFiles = 0;
  private lastWriteErrorCode: string | undefined;

  constructor(logDir: string, options: AuditJournalOptions = {}) {
    this.auditRoot = path.join(path.resolve(logDir), 'audit');
    this.filePath = path.join(this.auditRoot, 'audit.current.jsonl');
    this.headPath = path.join(this.auditRoot, 'audit-head.json');
    this.anchorPath = path.join(this.auditRoot, 'audit-anchor.json');
    this.queueCapacity = Math.max(1, Math.min(options.queueCapacity ?? 4096, 65_536));
    this.maxFileBytes = Math.max(256, Math.min(options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES, 1024 * 1024 * 1024));
    this.maxRotatedFiles = Math.max(1, Math.min(options.maxRotatedFiles ?? DEFAULT_MAX_ROTATED_FILES, 1024));
    this.retentionMs = Math.max(1, options.retentionMs ?? DEFAULT_RETENTION_MS);
    this.now = options.now ?? Date.now;
    this.metrics = options.metrics;
    this.broadcaster = options.broadcaster;
    this.appendLine = options.appendLine ?? (async (filePath, line) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, line, 'utf8');
    });
  }

  attachMetrics(metrics: RuntimeMetricRegistry): void {
    this.metrics = metrics;
  }

  enqueue(input: AuditJournalInput): boolean {
    if (this.closed || this.queue.length + this.inFlight >= this.queueCapacity) {
      this.dropped += 1;
      this.metrics?.increment('audit.dropped.count');
      return false;
    }
    const category = boundedString(input.category.normalize('NFKC')).slice(0, 160) || 'unknown';
    const event = boundedString(input.event.normalize('NFKC')).slice(0, 200) || 'unknown';
    const parsedTimestamp = input.timestamp && Number.isFinite(Date.parse(input.timestamp))
      ? new Date(input.timestamp).toISOString()
      : new Date(this.now()).toISOString();
    this.queue.push({ category, event, timestamp: parsedTimestamp, data: sanitizeAuditData(input.data), correlation: correlationFields() });
    this.scheduleDrain();
    return true;
  }

  subscribe(listener: AuditRecordListener): AuditRecordSubscription {
    if (!this.broadcaster) throw new Error('AUDIT_STREAM_UNAVAILABLE');
    return this.broadcaster.subscribe(listener);
  }

  status(): AuditJournalStatus {
    return {
      queueDepth: this.queue.length + this.inFlight,
      queueCapacity: this.queueCapacity,
      written: this.written,
      dropped: this.dropped,
      writeErrors: this.writeErrors,
      sequence: this.sequence,
      headHash: this.headHash,
      currentFileBytes: this.currentFileBytes,
      rotatedFiles: this.rotatedFiles,
      ...(this.lastWriteErrorCode ? { lastWriteErrorCode: this.lastWriteErrorCode } : {}),
    };
  }

  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.inFlight > 0 || this.drainPromise) {
      if (!this.drainPromise && this.queue.length > 0) this.scheduleDrain();
      const current = this.drainPromise;
      if (current) await current;
      else await Promise.resolve();
    }
  }

  async prepareReplay(): Promise<void> {
    if (this.closed) throw new Error('AUDIT_JOURNAL_CLOSED');
    await this.drain();
    await this.initialize();
  }

  async close(): Promise<void> {
    if (!this.closed) this.closed = true;
    await this.drain();
  }

  private scheduleDrain(): void {
    if (this.drainPromise) return;
    this.drainPromise = Promise.resolve()
      .then(() => this.drainLoop())
      .finally(() => {
        this.drainPromise = undefined;
        if (this.queue.length > 0) this.scheduleDrain();
      });
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.auditRoot, { recursive: true });
    if (!await pathExists(this.anchorPath)) {
      await atomicJson(this.anchorPath, { schemaVersion: 1, sequence: 0, hash: null, updatedAt: new Date(this.now()).toISOString() });
    }
    const hasAnyRecords = (await listSegments(this.auditRoot)).length > 0 || await pathExists(this.filePath);
    if (!await pathExists(this.headPath) && !hasAnyRecords) {
      await atomicJson(this.headPath, { schemaVersion: 1, sequence: 0, hash: null, updatedAt: new Date(this.now()).toISOString() });
    }
    const verified = await verifyChain(this.auditRoot, true);
    if (!verified.ok) throw Object.assign(new Error(`Audit journal initialization failed: ${verified.code}`), { code: verified.code });
    this.sequence = verified.lastSequence;
    this.headHash = verified.headHash;
    this.rotatedFiles = (await listSegments(this.auditRoot)).filter((segment) => segment.lastSequence > verified.anchorSequence).length;
    try { this.currentFileBytes = (await stat(this.filePath)).size; } catch { this.currentFileBytes = 0; }
    if (this.currentFileBytes > 0) {
      const current = await readRecordFile(this.filePath);
      this.activeFirstSequence = current[0]?.sequence;
    }
    this.initialized = true;
  }

  private async drainLoop(): Promise<void> {
    try { await this.initialize(); }
    catch (error) {
      const failures = this.queue.length;
      this.writeErrors += failures;
      this.metrics?.increment('audit.write_errors.count', failures);
      this.lastWriteErrorCode = errorCode(error);
      this.queue.splice(0);
      return;
    }
    while (this.queue.length > 0) {
      const input = this.queue.shift()!;
      this.inFlight = 1;
      const sequence = this.sequence + 1;
      const withoutHash = {
        schemaVersion: 1 as const,
        sequence,
        timestamp: input.timestamp,
        category: input.category,
        event: input.event,
        ...input.correlation,
        data: input.data,
        previousHash: this.headHash,
      };
      const record: AuditJournalRecord = { ...withoutHash, hash: computeAuditRecordHash(withoutHash) };
      const line = `${JSON.stringify(record)}\n`;
      const lineBytes = Buffer.byteLength(line, 'utf8');
      try {
        if (this.currentFileBytes > 0 && this.currentFileBytes + lineBytes > this.maxFileBytes) await this.rotateCurrent();
        await this.appendLine(this.filePath, line);
        if (this.currentFileBytes === 0) this.activeFirstSequence = sequence;
        this.sequence = sequence;
        this.headHash = record.hash;
        this.written += 1;
        this.metrics?.increment('audit.written.count');
        this.currentFileBytes += lineBytes;
        try {
          await atomicJson(this.headPath, { schemaVersion: 1, sequence: this.sequence, hash: this.headHash, updatedAt: new Date(this.now()).toISOString() });
          this.lastWriteErrorCode = undefined;
          this.broadcaster?.publish(record);
        } catch (error) {
          this.writeErrors += 1;
          this.metrics?.increment('audit.write_errors.count');
          this.lastWriteErrorCode = errorCode(error);
        }
      } catch (error) {
        this.writeErrors += 1;
        this.metrics?.increment('audit.write_errors.count');
        this.lastWriteErrorCode = errorCode(error);
      } finally {
        this.inFlight = 0;
      }
    }
  }

  private async rotateCurrent(): Promise<void> {
    if (!this.activeFirstSequence || this.currentFileBytes <= 0) return;
    const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
    const name = `audit.${this.activeFirstSequence}-${this.sequence}.${stamp}.jsonl`;
    await rename(this.filePath, path.join(this.auditRoot, name));
    this.currentFileBytes = 0;
    this.activeFirstSequence = undefined;
    this.rotatedFiles += 1;
    this.metrics?.increment('audit.rotation.count');
    await this.enforceRetention();
  }

  private async enforceRetention(): Promise<void> {
    const anchor = await readPointer(this.anchorPath);
    if (!anchor) throw Object.assign(new Error('Audit retention anchor is invalid'), { code: 'AUDIT_ANCHOR_INVALID' });
    const segments = (await listSegments(this.auditRoot)).filter((segment) => segment.lastSequence > anchor.sequence);
    const cutoff = this.now() - this.retentionMs;
    const deletePrefix: SegmentDescriptor[] = [];
    let remaining = segments.length;
    for (const segment of segments) {
      const records = await readRecordFile(segment.filePath);
      const last = records.at(-1);
      if (!last) continue;
      const tooMany = remaining > this.maxRotatedFiles;
      const tooOld = Date.parse(last.timestamp) < cutoff;
      if (!tooMany && !tooOld) break;
      deletePrefix.push(segment);
      remaining -= 1;
    }
    if (deletePrefix.length === 0) {
      this.rotatedFiles = segments.length;
      return;
    }
    const lastDeletedRecords = await readRecordFile(deletePrefix.at(-1)!.filePath);
    const lastDeleted = lastDeletedRecords.at(-1);
    if (!lastDeleted) throw Object.assign(new Error('Audit retention segment is empty'), { code: 'AUDIT_SEGMENT_EMPTY' });
    await atomicJson(this.anchorPath, {
      schemaVersion: 1,
      sequence: lastDeleted.sequence,
      hash: lastDeleted.hash,
      updatedAt: new Date(this.now()).toISOString(),
    });
    for (const segment of deletePrefix) await rm(segment.filePath, { force: true });
    this.rotatedFiles = segments.length - deletePrefix.length;
  }
}
