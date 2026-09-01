import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { verifyAuditJournal, type AuditJournalRecord } from './audit-journal.js';

export interface AuditReplayRequest {
  afterSequence: number;
  limit: number;
  categories?: string[];
}

export type AuditReplayResult =
  | {
      ok: true;
      records: AuditJournalRecord[];
      earliestSequence: number;
      latestSequence: number;
    }
  | {
      ok: false;
      code: 'AUDIT_HISTORY_GAP';
      earliestSequence: number;
      latestSequence: number;
    };

export interface AuditRecordSubscription {
  close(): void;
}

export type AuditRecordListener = (record: AuditJournalRecord) => void | Promise<void>;

interface SubscriberState {
  closed: boolean;
  tail: Promise<void>;
  listener: AuditRecordListener;
}

const SEGMENT_RE = /^audit\.(\d+)-(\d+)\..+\.jsonl$/;
const MAX_REPLAY_LIMIT = 2_000;
const MAX_REPLAY_CATEGORIES = 32;

export class AuditRecordBroadcaster {
  private readonly subscribers = new Set<SubscriberState>();

  publish(record: AuditJournalRecord): void {
    for (const subscriber of this.subscribers) {
      if (subscriber.closed) continue;
      const snapshot = structuredClone(record);
      subscriber.tail = subscriber.tail
        .then(async () => {
          if (subscriber.closed) return;
          await subscriber.listener(snapshot);
        })
        .catch(() => undefined);
    }
  }

  subscribe(listener: AuditRecordListener): AuditRecordSubscription {
    const subscriber: SubscriberState = {
      closed: false,
      tail: Promise.resolve(),
      listener,
    };
    this.subscribers.add(subscriber);
    return {
      close: () => {
        subscriber.closed = true;
        this.subscribers.delete(subscriber);
      },
    };
  }

  async drain(): Promise<void> {
    await Promise.all([...this.subscribers].map((subscriber) => subscriber.tail));
  }
}

interface AuditPointer {
  schemaVersion: 1;
  sequence: number;
  hash: string | null;
  updatedAt: string;
}

function validateRequest(request: AuditReplayRequest): Set<string> | undefined {
  if (!Number.isSafeInteger(request.afterSequence) || request.afterSequence < 0) {
    throw new Error('AUDIT_REPLAY_AFTER_SEQUENCE_INVALID');
  }
  if (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > MAX_REPLAY_LIMIT) {
    throw new Error('AUDIT_REPLAY_LIMIT_INVALID');
  }
  if (request.categories === undefined) return undefined;
  if (request.categories.length < 1 || request.categories.length > MAX_REPLAY_CATEGORIES) {
    throw new Error('AUDIT_REPLAY_CATEGORIES_INVALID');
  }
  const normalized = request.categories.map((category) => category.trim()).filter(Boolean);
  if (normalized.length !== request.categories.length || normalized.some((category) => category.length > 160)) {
    throw new Error('AUDIT_REPLAY_CATEGORIES_INVALID');
  }
  return new Set(normalized);
}

async function readPointer(filePath: string): Promise<AuditPointer | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Partial<AuditPointer>;
    if (parsed.schemaVersion !== 1 || !Number.isSafeInteger(parsed.sequence) || Number(parsed.sequence) < 0) return null;
    return parsed as AuditPointer;
  } catch {
    return null;
  }
}

async function orderedRecordFiles(auditRoot: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(auditRoot);
  } catch {
    return [];
  }
  const segments = names
    .flatMap((name): Array<{ name: string; first: number; last: number }> => {
      const match = SEGMENT_RE.exec(name);
      if (!match) return [];
      return [{ name, first: Number(match[1]), last: Number(match[2]) }];
    })
    .sort((left, right) => left.first - right.first || left.last - right.last || left.name.localeCompare(right.name))
    .map((entry) => path.join(auditRoot, entry.name));
  if (names.includes('audit.current.jsonl')) segments.push(path.join(auditRoot, 'audit.current.jsonl'));
  return segments;
}

async function readRecords(filePath: string): Promise<AuditJournalRecord[]> {
  const text = await readFile(filePath, 'utf8');
  if (!text.trim()) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as AuditJournalRecord);
}

export async function replayAuditRecords(auditRoot: string, request: AuditReplayRequest): Promise<AuditReplayResult> {
  const categories = validateRequest(request);
  const root = path.resolve(auditRoot);
  let verified = await verifyAuditJournal(root);
  for (let attempt = 0; !verified.ok && ['AUDIT_HEAD_MISMATCH', 'AUDIT_SEQUENCE_GAP'].includes(verified.code) && attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    verified = await verifyAuditJournal(root);
  }
  if (!verified.ok) throw new Error(`AUDIT_REPLAY_JOURNAL_INVALID:${verified.code}`);

  const anchor = await readPointer(path.join(root, 'audit-anchor.json'));
  if (!anchor) throw new Error('AUDIT_REPLAY_ANCHOR_INVALID');
  const earliestSequence = verified.records > 0 ? verified.firstSequence : anchor.sequence + 1;
  const latestSequence = verified.lastSequence;

  if (request.afterSequence < anchor.sequence) {
    return { ok: false, code: 'AUDIT_HISTORY_GAP', earliestSequence, latestSequence };
  }

  const records: AuditJournalRecord[] = [];
  for (const filePath of await orderedRecordFiles(root)) {
    for (const record of await readRecords(filePath)) {
      if (record.sequence <= request.afterSequence) continue;
      if (categories && !categories.has(record.category)) continue;
      records.push(record);
      if (records.length >= request.limit) {
        return { ok: true, records, earliestSequence, latestSequence };
      }
    }
  }
  return { ok: true, records, earliestSequence, latestSequence };
}
