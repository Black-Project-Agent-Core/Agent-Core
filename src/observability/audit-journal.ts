import { createHash } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { redactMemoryText } from '../memory/redaction.js';
import { correlationFields } from './correlation.js';

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
  now?: () => number;
  appendLine?: (filePath: string, line: string) => Promise<void>;
}

interface QueuedAuditEvent {
  category: string;
  event: string;
  timestamp: string;
  data: Record<string, AuditJson>;
  correlation: Record<string, string>;
}

const MAX_DATA_DEPTH = 4;
const MAX_OBJECT_KEYS = 64;
const MAX_ARRAY_ITEMS = 64;
const MAX_STRING_CHARS = 2_000;
const SENSITIVE_KEY = /(?:^|[_-])(authorization|cookie|set-cookie|api[_-]?key|apikey|token|secret|password|passwd|pwd|credential)(?:$|[_-])/i;

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

export class AuditJournal {
  readonly filePath: string;
  private readonly queue: QueuedAuditEvent[] = [];
  private readonly queueCapacity: number;
  private readonly now: () => number;
  private readonly appendLine: (filePath: string, line: string) => Promise<void>;
  private drainPromise: Promise<void> | undefined;
  private inFlight = 0;
  private closed = false;
  private written = 0;
  private dropped = 0;
  private writeErrors = 0;
  private sequence = 0;
  private headHash: string | null = null;
  private currentFileBytes = 0;
  private lastWriteErrorCode: string | undefined;

  constructor(logDir: string, options: AuditJournalOptions = {}) {
    this.filePath = path.join(path.resolve(logDir), 'audit.jsonl');
    this.queueCapacity = Math.max(1, Math.min(options.queueCapacity ?? 4096, 65_536));
    this.now = options.now ?? Date.now;
    this.appendLine = options.appendLine ?? (async (filePath, line) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await appendFile(filePath, line, 'utf8');
    });
  }

  enqueue(input: AuditJournalInput): boolean {
    if (this.closed || this.queue.length + this.inFlight >= this.queueCapacity) {
      this.dropped += 1;
      return false;
    }
    const category = boundedString(input.category.normalize('NFKC')).slice(0, 160) || 'unknown';
    const event = boundedString(input.event.normalize('NFKC')).slice(0, 200) || 'unknown';
    const parsedTimestamp = input.timestamp && Number.isFinite(Date.parse(input.timestamp))
      ? new Date(input.timestamp).toISOString()
      : new Date(this.now()).toISOString();
    this.queue.push({
      category,
      event,
      timestamp: parsedTimestamp,
      data: sanitizeAuditData(input.data),
      correlation: correlationFields(),
    });
    this.scheduleDrain();
    return true;
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
      rotatedFiles: 0,
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

  async close(): Promise<void> {
    if (this.closed) {
      await this.drain();
      return;
    }
    this.closed = true;
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

  private async drainLoop(): Promise<void> {
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
      try {
        await this.appendLine(this.filePath, line);
        this.sequence = sequence;
        this.headHash = record.hash;
        this.written += 1;
        this.currentFileBytes += Buffer.byteLength(line, 'utf8');
        this.lastWriteErrorCode = undefined;
      } catch (error) {
        this.writeErrors += 1;
        this.lastWriteErrorCode = errorCode(error);
      } finally {
        this.inFlight = 0;
      }
    }
  }
}
