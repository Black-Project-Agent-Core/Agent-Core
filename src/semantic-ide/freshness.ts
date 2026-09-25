import { pathToFileURL } from 'node:url';
import type { SemanticLanguageServerDefinition } from './types.js';
import { scanWorkspaceSources, type WorkspaceFileStamp } from './workspace-policy.js';
import { sameSemanticFileIdentity } from './source-io.js';

export interface FreshnessSession {
  notify(method: string, params?: unknown): void;
  bindCreatedFile(filePath: string, languageId: string): Promise<void>;
  closeDeletedFile(filePath: string): Promise<void>;
  noteFreshness(result: WorkspaceFreshnessResult): void;
}

type Stamp = WorkspaceFileStamp;

export interface WorkspaceFreshnessResult {
  state: 'baseline' | 'fresh' | 'degraded';
  scannedFiles: number;
  eventCount: number;
  created: number;
  changed: number;
  deleted: number;
  truncated: boolean;
  durationMs: number;
  reason?: string;
}

function compareStamp(left: Stamp, right: Stamp): 'same' | 'changed' | 'unknown' {
  if (!left.identity || !right.identity) return 'unknown';
  if (!sameSemanticFileIdentity(left.identity, right.identity)) return 'changed';
  if (left.evidence === 'metadata' && right.evidence === 'metadata') return 'same';
  if (left.digest && right.digest) return left.digest === right.digest ? 'same' : 'changed';
  return 'unknown';
}
function acceptedStamp(stamp: Stamp): Stamp {
  return stamp.cacheable && stamp.evidence === 'digest' ? { ...stamp, evidence: 'metadata' } : stamp;
}

interface FreshnessEpoch { session: FreshnessSession }
interface FreshnessOwner { epoch: FreshnessEpoch; promise: Promise<WorkspaceFreshnessResult> }
function superseded(): WorkspaceFreshnessResult {
  return { state: 'degraded', scannedFiles: 0, eventCount: 0, created: 0, changed: 0,
    deleted: 0, truncated: false, durationMs: 0, reason: 'SEMANTIC_FRESHNESS_SUPERSEDED' };
}

export class WorkspaceFreshnessCoordinator {
  private readonly snapshots = new Map<string, Map<string, Stamp>>();
  private readonly inFlight = new Map<string, FreshnessOwner>();
  private readonly epochs = new Map<string, FreshnessEpoch>();
  private readonly recent = new Map<string, { at: number; result: WorkspaceFreshnessResult }>();

  constructor(
    private readonly maxFiles = 4000,
    private readonly maxEvents = 1000,
    private readonly maxMs = 5000,
    private readonly reuseWithinMs = 100,
  ) {}

  async reconcile(
    session: FreshnessSession,
    root: string,
    definition: SemanticLanguageServerDefinition,
    ignoredDirectories: readonly string[],
  ): Promise<WorkspaceFreshnessResult> {
    const key = `${definition.id}|${root.toLowerCase()}`;
    let epoch = this.epochs.get(key);
    if (!epoch || epoch.session !== session) {
      this.clearKey(key);
      epoch = { session };
      this.epochs.set(key, epoch);
    }
    const cached = this.recent.get(key);
    if (cached && Date.now() - cached.at <= this.reuseWithinMs) {
      session.noteFreshness(cached.result);
      return cached.result;
    }
    const running = this.inFlight.get(key);
    if (running?.epoch === epoch) return running.promise;

    const owner: FreshnessOwner = { epoch, promise: undefined! };
    const isCurrent = () => this.epochs.get(key) === owner.epoch && this.inFlight.get(key) === owner;
    owner.promise = this.reconcileInternal(session, key, root, definition, ignoredDirectories, isCurrent)
      .finally(() => { if (this.inFlight.get(key) === owner) this.inFlight.delete(key); });
    this.inFlight.set(key, owner);
    return owner.promise;
  }

  private async reconcileInternal(
    session: FreshnessSession,
    key: string,
    root: string,
    definition: SemanticLanguageServerDefinition,
    ignoredDirectories: readonly string[],
    isCurrent: () => boolean,
  ): Promise<WorkspaceFreshnessResult> {
    try {
      const scan = await scanWorkspaceSources(root, definition.extensions, ignoredDirectories, this.maxFiles, this.maxMs, this.snapshots.get(key));
      if (!isCurrent()) return superseded();
      const next = new Map<string, Stamp>(scan.files.map(({ absolutePath, relativePath: _relativePath, ...stamp }) => [absolutePath, stamp]));
      let uncertain = [...next.values()].some(stamp => stamp.evidence === 'unknown');
      const previous = this.snapshots.get(key);
      if (!previous) {
        if (scan.complete) this.snapshots.set(key, next);
        const result: WorkspaceFreshnessResult = {
          state: scan.complete && !uncertain ? 'baseline' : 'degraded',
          scannedFiles: next.size,
          eventCount: 0,
          created: 0,
          changed: 0,
          deleted: 0,
          truncated: scan.truncated,
          durationMs: scan.durationMs,
          ...(!scan.complete || uncertain ? { reason: scan.truncated ? 'SEMANTIC_FRESHNESS_SCAN_TRUNCATED' : !scan.complete ? 'SEMANTIC_FRESHNESS_SCAN_INCOMPLETE' : 'SEMANTIC_FRESHNESS_STAMP_UNKNOWN' } : {}),
        };
        this.recent.set(key, { at: Date.now(), result });
        session.noteFreshness(result);
        return result;
      }

      const unchanged = new Map<string, Stamp>();
      const events: Array<{ uri: string; type: 1 | 2 | 3; path: string }> = [];
      let created = 0;
      let changed = 0;
      let deleted = 0;
      for (const [filePath, stamp] of next) {
        const old = previous.get(filePath);
        if (!old) {
          created += 1;
          events.push({ uri: pathToFileURL(filePath).href, type: 1, path: filePath });
        } else {
          const comparison = compareStamp(old, stamp);
          if (comparison === 'changed') {
            changed += 1;
            events.push({ uri: pathToFileURL(filePath).href, type: 2, path: filePath });
          } else if (comparison === 'same') {
            unchanged.set(filePath, acceptedStamp(stamp));
          } else {
            uncertain = true;
            // Prime missing digest evidence; this scan remains degraded. A later
            // comparison is required before reporting the entry unchanged.
            if (stamp.digest && !old.digest) unchanged.set(filePath, stamp);
          }
        }
      }
      for (const filePath of scan.complete ? previous.keys() : []) {
        if (next.has(filePath)) continue;
        deleted += 1;
        events.push({ uri: pathToFileURL(filePath).href, type: 3, path: filePath });
      }

      const boundedEvents = events.slice(0, this.maxEvents);
      if (boundedEvents.length) {
        if (!isCurrent()) return superseded();
        session.notify('workspace/didChangeWatchedFiles', {
          changes: boundedEvents.map(({ uri, type }) => ({ uri, type })),
        });
        for (const event of boundedEvents) {
          if (!isCurrent()) return superseded();
          if (event.type === 1) {
            const extension = event.path.slice(event.path.lastIndexOf('.')).toLowerCase();
            const languageId = definition.languageIds[extension] ?? definition.id;
            await session.bindCreatedFile(event.path, languageId).catch(() => undefined);
          } else if (event.type === 3) {
            await session.closeDeletedFile(event.path).catch(() => undefined);
          }
        }
      }

      if (!isCurrent()) return superseded();
      // Commit only delivered differences. Unseen or undispatched entries remain evidence.
      const committed = new Map(previous);
      for (const [filePath, stamp] of unchanged) committed.set(filePath, stamp);
      for (const event of boundedEvents) {
        if (event.type === 3) committed.delete(event.path);
        else committed.set(event.path, acceptedStamp(next.get(event.path)!));
      }
      this.snapshots.set(key, committed);
      created = boundedEvents.filter(event => event.type === 1).length;
      changed = boundedEvents.filter(event => event.type === 2).length;
      deleted = boundedEvents.filter(event => event.type === 3).length;
      const truncated = scan.truncated || events.length > this.maxEvents;
      const degraded = !scan.complete || truncated || uncertain;
      const result: WorkspaceFreshnessResult = {
        state: degraded ? 'degraded' : 'fresh',
        scannedFiles: next.size,
        eventCount: boundedEvents.length,
        created,
        changed,
        deleted,
        truncated,
        durationMs: scan.durationMs,
        ...(degraded ? { reason: scan.truncated ? 'SEMANTIC_FRESHNESS_SCAN_TRUNCATED' : !scan.complete ? 'SEMANTIC_FRESHNESS_SCAN_INCOMPLETE' : truncated ? 'SEMANTIC_FRESHNESS_EVENT_LIMIT' : 'SEMANTIC_FRESHNESS_STAMP_UNKNOWN' } : {}),
      };
      this.recent.set(key, { at: Date.now(), result });
      session.noteFreshness(result);
      return result;
    } catch (error) {
      if (!isCurrent()) return superseded();
      const result: WorkspaceFreshnessResult = {
        state: 'degraded',
        scannedFiles: 0,
        eventCount: 0,
        created: 0,
        changed: 0,
        deleted: 0,
        truncated: false,
        durationMs: 0,
        reason: error instanceof Error ? error.message : String(error),
      };
      this.recent.set(key, { at: Date.now(), result });
      session.noteFreshness(result);
      return result;
    }
  }

  private clearKey(key: string): void {
    this.epochs.delete(key);
    this.inFlight.delete(key);
    this.snapshots.delete(key);
    this.recent.delete(key);
  }

  clear(root?: string): void {
    if (!root) {
      this.epochs.clear();
      this.inFlight.clear();
      this.snapshots.clear();
      this.recent.clear();
      return;
    }
    const suffix = `|${root.toLowerCase()}`;
    for (const key of this.epochs.keys()) if (key.endsWith(suffix)) this.clearKey(key);
  }
}
