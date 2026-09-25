import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isSensitiveKey, redactSensitiveString, redactSensitiveValue } from '../security/redaction.js';

export type TrackerLevel = 'info' | 'success' | 'warn' | 'error' | 'sys';

export interface TrackerEvent {
  id: string;
  timestamp: string;
  time: string;
  module: string;
  level: TrackerLevel;
  message: string;
  source: 'node' | 'launcher';
  kind: string;
  context?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

const MAX_RING_BYTES = 64 * 1024;
const MAX_RING_EVENTS = 256;
const MAX_TEXT = 2_000;
const MAX_REPORT_AGE_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_REPORT_BYTES = 128 * 1024 * 1024;
const LOCK_STALE_MS = 30_000;
const LOCK_ATTEMPTS = 40;
const LOCK_WAIT_MS = 5;
const LOCK_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
function forEachTextLineSync(filePath: string, visit: (line: string) => void): void {
  const fd = openSync(filePath, 'r');
  const decoder = new StringDecoder('utf8');
  const chunk = Buffer.allocUnsafe(64 * 1024);
  let carry = '';
  try {
    while (true) {
      const read = readSync(fd, chunk, 0, chunk.length, null);
      if (read <= 0) break;
      carry += decoder.write(chunk.subarray(0, read));
      let newline: number;
      while ((newline = carry.indexOf('\n')) >= 0) {
        const raw = carry.slice(0, newline);
        carry = carry.slice(newline + 1);
        visit(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
      }
    }
    carry += decoder.end();
    if (carry) visit(carry.endsWith('\r') ? carry.slice(0, -1) : carry);
  } finally {
    closeSync(fd);
  }
}

function truncate(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? '');
  const text = redactSensitiveString(raw);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (isSensitiveKey(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    const safe = redactSensitiveValue(value);
    if (typeof safe === 'string') output[key] = truncate(safe);
    else if (typeof safe === 'number' || typeof safe === 'boolean' || safe === null) output[key] = safe;
    else if (Array.isArray(safe)) output[key] = safe.slice(0, 20).map((item) => typeof item === 'string' ? truncate(item) : item);
    else output[key] = truncate(JSON.stringify(safe));
  }
  return output;
}
function normalizeError(error: unknown): TrackerEvent['error'] {
  if (error instanceof Error) {
    return { name: error.name, message: truncate(error.message), stack: error.stack ? truncate(error.stack) : undefined };
  }
  return { name: 'Error', message: truncate(error) };
}

export class ActivityTracker {
  private readonly root: string;
  private readonly journalPath: string;
  private readonly textLogPath: string;
  private readonly clearMarkerPath: string;
  private readonly reportsDir: string;
  private readonly ring: Array<{ event: TrackerEvent; bytes: number }> = [];
  private ringBytes = 0;
  private processHooksInstalled = false;

  constructor(root = path.join(process.cwd(), 'runtime', 'tracker')) {
    this.root = root;
    this.journalPath = path.join(root, 'activity.jsonl');
    this.textLogPath = path.join(root, 'activity log.txt');
    this.clearMarkerPath = path.join(root, 'activity.clear');
    this.reportsDir = path.join(root, 'reports');
    mkdirSync(this.reportsDir, { recursive: true });
    this.recoverJournal();
    this.sanitizeReports();
    this.rebuildTextMirror();
    this.pruneReports();
  }
  record(
    module: string,
    level: TrackerLevel,
    message: string,
    kind = 'event',
    context?: Record<string, unknown>,
  ): TrackerEvent {
    const now = new Date();
    const event: TrackerEvent = {
      id: randomUUID().replaceAll('-', ''),
      timestamp: now.toISOString(),
      time: now.toTimeString().slice(0, 8),
      module: module.toUpperCase(),
      level,
      message: truncate(message),
      source: 'node',
      kind,
      ...(sanitizeContext(context) ? { context: sanitizeContext(context) } : {}),
    };
    this.persist(event);
    return event;
  }
  captureFailure(
    module: string,
    error: unknown,
    kind = 'failure',
    context?: Record<string, unknown>,
  ): TrackerEvent {
    const now = new Date();
    const event: TrackerEvent = {
      id: randomUUID().replaceAll('-', ''),
      timestamp: now.toISOString(),
      time: now.toTimeString().slice(0, 8),
      module: module.toUpperCase(),
      level: 'error',
      message: normalizeError(error)?.message ?? 'Unknown failure',
      source: 'node',
      kind,
      ...(sanitizeContext(context) ? { context: sanitizeContext(context) } : {}),
      error: normalizeError(error),
    };
    this.persist(event);
    this.writeFailureSnapshot(event);
    return event;
  }
  private withJournalLock(action: () => void): boolean {
    const lockPath = `${this.journalPath}.lock`;
    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
      let fd: number | undefined;
      try {
        fd = openSync(lockPath, 'wx');
        action();
        return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') return false;
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) unlinkSync(lockPath);
        } catch { }
        Atomics.wait(LOCK_WAIT_BUFFER, 0, 0, LOCK_WAIT_MS);
      } finally {
        if (fd !== undefined) {
          try { closeSync(fd); } catch { }
          try { unlinkSync(lockPath); } catch { }
        }
      }
    }
    return false;
  }

  private recoverJournal(): void {
    if (!existsSync(this.journalPath)) return;
    this.withJournalLock(() => {
      const temporary = path.join(this.root, `.activity.recover-${process.pid}-${randomUUID()}.jsonl`);
      writeFileSync(temporary, '', 'utf8');
      let corruptCount = 0;
      let rewriteNeeded = false;
      try {
        forEachTextLineSync(this.journalPath, (line) => {
          if (!line) return;
          try {
            const parsed = JSON.parse(line) as TrackerEvent;
            const sanitized = redactSensitiveValue(parsed) as TrackerEvent;
            const encoded = JSON.stringify(sanitized);
            appendFileSync(temporary, `${encoded}\n`, 'utf8');
            if (JSON.stringify(parsed) !== encoded) rewriteNeeded = true;
          } catch {
            corruptCount += 1;
            rewriteNeeded = true;
          }
        });
        if (!rewriteNeeded) return;
        if (corruptCount > 0) {
          const stamp = new Date().toISOString().replaceAll(':', '-');
          writeFileSync(
            path.join(this.root, `activity.corrupt.${stamp}.jsonl`),
            `Recovered ${corruptCount} corrupt line(s); original content omitted for security.\n`,
            'utf8',
          );
        }
        copyFileSync(temporary, this.journalPath);
      } finally {
        try { unlinkSync(temporary); } catch { }
      }
    });
  }

  private sanitizeReports(): void {
    try {
      for (const name of readdirSync(this.reportsDir).filter((item) => item.endsWith('.json'))) {
        const filePath = path.join(this.reportsDir, name);
        const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
        const sanitized = redactSensitiveValue(parsed);
        if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
          writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
        }
      }
    } catch {
      // Historical-report scrubbing is best-effort and must not crash the host.
    }
  }

  private readClearCutoffMs(): number {
    try {
      if (!existsSync(this.clearMarkerPath)) return Number.NEGATIVE_INFINITY;
      const parsed = Date.parse(readFileSync(this.clearMarkerPath, 'utf8').trim());
      return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    } catch { return Number.NEGATIVE_INFINITY; }
  }

  private formatTextEvent(event: TrackerEvent): string {
    return `${event.time} | ${event.module} | ${event.level.toUpperCase()} | ${event.message}`;
  }

  private rebuildTextMirror(): void {
    this.withJournalLock(() => {
      const cutoff = this.readClearCutoffMs();
      const temporary = path.join(this.root, `.activity-log-${process.pid}-${randomUUID()}.txt`);
      writeFileSync(temporary, '', 'utf8');
      try {
        if (existsSync(this.journalPath)) {
          forEachTextLineSync(this.journalPath, (line) => {
            if (!line) return;
            try {
              const event = JSON.parse(line) as TrackerEvent;
              if (Date.parse(event.timestamp) <= cutoff) return;
              appendFileSync(temporary, `${this.formatTextEvent(event)}\n`, 'utf8');
            } catch { }
          });
        }
        copyFileSync(temporary, this.textLogPath);
      } finally {
        try { unlinkSync(temporary); } catch { }
      }
    });
  }

  private pruneReports(): void {
    try {
      const now = Date.now();
      let retainedBytes = 0;
      const reports = readdirSync(this.reportsDir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => {
          const filePath = path.join(this.reportsDir, name);
          const stat = statSync(filePath);
          return { filePath, mtimeMs: stat.mtimeMs, size: stat.size };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (const report of reports) {
        const tooOld = now - report.mtimeMs > MAX_REPORT_AGE_MS;
        const exceedsBudget = retainedBytes + report.size > MAX_REPORT_BYTES;
        if (tooOld || exceedsBudget) {
          try { unlinkSync(report.filePath); } catch { }
        } else {
          retainedBytes += report.size;
        }
      }
    } catch { }
  }

  private persist(event: TrackerEvent): void {
    try {
      const line = JSON.stringify(event);
      const bytes = Buffer.byteLength(line, 'utf8');
      this.ring.push({ event, bytes });
      this.ringBytes += bytes;
      while (this.ring.length > MAX_RING_EVENTS || this.ringBytes > MAX_RING_BYTES) {
        const removed = this.ring.shift();
        if (removed) this.ringBytes -= removed.bytes;
      }
      this.withJournalLock(() => {
        appendFileSync(this.journalPath, `${line}\n`, { encoding: 'utf8', flush: true });
        appendFileSync(this.textLogPath, `${this.formatTextEvent(event)}\n`, { encoding: 'utf8', flush: true });
      });
    } catch {
      // Tracker failures must never take down Agent Core.
    }
  }

  private writeFailureSnapshot(event: TrackerEvent): void {
    try {
      const snapshot = {
        reportId: event.id,
        createdAt: event.timestamp,
        failure: event,
        annotations: {
          pid: process.pid,
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          uptimeSeconds: process.uptime(),
          cwd: process.cwd(),
          memory: process.memoryUsage(),
        },
        recentEvents: this.ring.map((item) => item.event),
      };
      const reportPath = path.join(this.reportsDir, `${event.timestamp.replaceAll(':', '-')}-${event.id}.json`);
      writeFileSync(reportPath, JSON.stringify(snapshot, null, 2), 'utf8');
      this.pruneReports();
    } catch {
      // Failure snapshots are best-effort and must not crash the host.
    }
  }

  installProcessHooks(): void {
    if (this.processHooksInstalled) return;
    this.processHooksInstalled = true;

    process.on('uncaughtExceptionMonitor', (error, origin) => {
      this.captureFailure('PROCESS', error, 'uncaught-exception', { origin });
    });
    process.on('unhandledRejection', (reason) => {
      this.captureFailure('PROCESS', reason, 'unhandled-rejection');
    });
    process.on('warning', (warning) => {
      this.record('PROCESS', 'warn', warning.message, 'process-warning', { name: warning.name, stack: warning.stack ?? '' });
    });
    process.on('exit', (code) => {
      this.record('PROCESS', code === 0 ? 'info' : 'error', `Node process exiting with code ${code}`, 'process-exit', { code });
    });
  }
}

export const activityTracker = new ActivityTracker();
