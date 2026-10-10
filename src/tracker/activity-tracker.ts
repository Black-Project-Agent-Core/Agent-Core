import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isSensitiveKey, redactSensitiveString, redactSensitiveValue } from '../security/redaction.js';
import { resolveModuleProjectRoot } from '../portability/paths.js';
import { BoundedJsonlEventLog } from '../persistence/bounded-event-log.js';

export type TrackerLevel = 'info' | 'success' | 'warn' | 'error' | 'sys';
export type TrackerOutcomeProperty = string | number | boolean | null;

export interface TrackerFeatureOutcome {
  featureId: string;
  outcome: string;
  properties?: Record<string, TrackerOutcomeProperty>;
}

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
  featureOutcome?: TrackerFeatureOutcome;
  error?: { name: string; message: string; stack?: string };
}

const MAX_RING_BYTES = 64 * 1024;
const MAX_RING_EVENTS = 256;
const MAX_TEXT = 2_000;
const MAX_REPORT_AGE_MS = 365 * 24 * 60 * 60 * 1_000;
const MAX_REPORT_BYTES = 128 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 128 * 1024 * 1024;
const MAX_JOURNAL_RECORDS = 200_000;
const LOCK_STALE_MS = 30_000;
const LOCK_ATTEMPTS = 40;
const LOCK_WAIT_MS = 5;
const LOCK_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4));
const MODULE_PROJECT_ROOT = resolveModuleProjectRoot(import.meta.url);
const DEFAULT_TRACKER_ROOT = path.join(MODULE_PROJECT_ROOT, 'runtime', 'tracker');
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
function sanitizeFeatureOutcome(input: TrackerFeatureOutcome): TrackerFeatureOutcome {
  const featureId = input.featureId.trim().toLowerCase();
  const outcome = input.outcome.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(featureId)) throw new Error('TRACKER_FEATURE_ID_INVALID');
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(outcome)) throw new Error('TRACKER_OUTCOME_INVALID');
  const properties: Record<string, TrackerOutcomeProperty> = {};
  for (const [key, raw] of Object.entries(input.properties ?? {}).slice(0, 16)) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(key)) continue;
    if (typeof raw === 'number' && !Number.isFinite(raw)) continue;
    if (typeof raw === 'string') properties[key] = truncate(raw).slice(0, 200);
    else if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) properties[key] = raw;
  }
  return { featureId, outcome, ...(Object.keys(properties).length ? { properties } : {}) };
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
  private readonly journal: BoundedJsonlEventLog;
  private journalIssue: string | null = null;
  private readonly ring: Array<{ event: TrackerEvent; bytes: number }> = [];
  private ringBytes = 0;
  private processHooksInstalled = false;

  constructor(root = DEFAULT_TRACKER_ROOT) {
    this.root = root;
    this.journalPath = path.join(root, 'activity.jsonl');
    this.textLogPath = path.join(root, 'activity log.txt');
    this.clearMarkerPath = path.join(root, 'activity.clear');
    this.reportsDir = path.join(root, 'reports');
    this.journal = new BoundedJsonlEventLog(this.journalPath, {
      maxBytes: MAX_JOURNAL_BYTES,
      maxRecords: MAX_JOURNAL_RECORDS,
    });
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

  recordOutcome(
    module: string,
    level: TrackerLevel,
    message: string,
    featureOutcome: TrackerFeatureOutcome,
    kind = 'feature-outcome',
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
      featureOutcome: sanitizeFeatureOutcome(featureOutcome),
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
  readFeatureOutcomes(options: { maxEvents?: number; maxAgeMs?: number; workspace?: string } = {}): TrackerEvent[] {
    const maxEvents = Math.max(1, Math.min(2_000, options.maxEvents ?? 512));
    const maxAgeMs = Math.max(60_000, Math.min(365 * 24 * 60 * 60 * 1000, options.maxAgeMs ?? 90 * 24 * 60 * 60 * 1000));
    const cutoff = Date.now() - maxAgeMs;
    const workspace = options.workspace?.trim().toLowerCase();
    const seen = new Set<string>();
    try {
      const events = this.journal.replaySync((line) => JSON.parse(line) as TrackerEvent);
      const output: TrackerEvent[] = [];
      for (const event of events) {
        if (!event.featureOutcome || !event.id || seen.has(event.id)) continue;
        const timestamp = Date.parse(event.timestamp);
        if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;
        if (workspace) {
          const eventWorkspace = typeof event.context?.workspace === 'string'
            ? event.context.workspace.trim().toLowerCase()
            : '';
          if (eventWorkspace !== workspace) continue;
        }
        seen.add(event.id);
        output.push(event);
        if (output.length > maxEvents) output.shift();
      }
      return output;
    } catch {
      return [];
    }
  }

  readToolInvocationEvents(options: { maxEvents?: number; maxAgeMs?: number } = {}): TrackerEvent[] {
    const maxEvents = Math.max(1, Math.min(10_000, options.maxEvents ?? 2_000));
    const maxAgeMs = Math.max(60_000, Math.min(30 * 24 * 60 * 60 * 1000, options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000));
    const cutoff = Date.now() - maxAgeMs;
    const acceptedKinds = new Set([
      'tool-invocation-start',
      'tool-call',
      'handled-tool-failure',
      'tool-exception',
      'tool-invocation-interrupted',
    ]);
    try {
      const events = this.journal.replaySync((line) => JSON.parse(line) as TrackerEvent);
      return events
        .filter(event => acceptedKinds.has(event.kind))
        .filter(event => {
          const timestamp = Date.parse(event.timestamp);
          return Number.isFinite(timestamp) && timestamp >= cutoff;
        })
        .slice(-maxEvents);
    } catch {
      return [];
    }
  }

  getJournalIssue(): string | null {
    return this.journalIssue;
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
      let rewriteNeeded = false;
      try {
        const records = this.journal.replaySync((line) => {
          const parsed = JSON.parse(line) as TrackerEvent;
          const sanitized = redactSensitiveValue(parsed) as TrackerEvent;
          if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) rewriteNeeded = true;
          return sanitized;
        });
        this.journalIssue = null;
        if (!rewriteNeeded) return;
        writeFileSync(
          temporary,
          records.length ? records.map((record) => JSON.stringify(record)).join('\n') + '\n' : '',
          'utf8',
        );
        copyFileSync(temporary, this.journalPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.journalIssue = truncate(message);
        const stamp = new Date().toISOString().replaceAll(':', '-');
        writeFileSync(
          path.join(this.root, `activity.corrupt.${stamp}.jsonl`),
          'Activity journal replay failed; original journal preserved; corrupt content omitted.\n',
          'utf8',
        );
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
        const events = this.journal.replaySync((line) => JSON.parse(line) as TrackerEvent);
        for (const event of events) {
          if (Date.parse(event.timestamp) <= cutoff) continue;
          appendFileSync(temporary, `${this.formatTextEvent(event)}\n`, 'utf8');
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
        this.journal.appendSync([event], { durable: true });
        appendFileSync(this.textLogPath, `${this.formatTextEvent(event)}\n`, { encoding: 'utf8', flush: true });
        this.journalIssue = null;
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
          projectRoot: MODULE_PROJECT_ROOT,
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
