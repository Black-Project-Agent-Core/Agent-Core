import { pathToFileURL } from 'node:url';
import type { SemanticLanguageServerDefinition } from './types.js';
import { scanWorkspaceSources } from './workspace-policy.js';

export interface FreshnessSession {
  notify(method: string, params?: unknown): void;
  bindCreatedFile(filePath: string, languageId: string): Promise<void>;
  closeDeletedFile(filePath: string): Promise<void>;
  noteFreshness(result: WorkspaceFreshnessResult): void;
}

interface Stamp {
  mtimeMs: number;
  size: number;
}

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

function stampEqual(left: Stamp, right: Stamp): boolean {
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

export class WorkspaceFreshnessCoordinator {
  private readonly snapshots = new Map<string, Map<string, Stamp>>();
  private readonly inFlight = new Map<string, Promise<WorkspaceFreshnessResult>>();
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
    const cached = this.recent.get(key);
    if (cached && Date.now() - cached.at <= this.reuseWithinMs) {
      session.noteFreshness(cached.result);
      return cached.result;
    }
    const running = this.inFlight.get(key);
    if (running) return running;

    const task = this.reconcileInternal(session, key, root, definition, ignoredDirectories)
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, task);
    return task;
  }

  private async reconcileInternal(
    session: FreshnessSession,
    key: string,
    root: string,
    definition: SemanticLanguageServerDefinition,
    ignoredDirectories: readonly string[],
  ): Promise<WorkspaceFreshnessResult> {
    try {
      const scan = await scanWorkspaceSources(root, definition.extensions, ignoredDirectories, this.maxFiles, this.maxMs);
      const next = new Map(scan.files.map(file => [file.absolutePath, { mtimeMs: file.mtimeMs, size: file.size } satisfies Stamp]));
      const previous = this.snapshots.get(key);
      if (!previous) {
        this.snapshots.set(key, next);
        const result: WorkspaceFreshnessResult = {
          state: scan.truncated ? 'degraded' : 'baseline',
          scannedFiles: next.size,
          eventCount: 0,
          created: 0,
          changed: 0,
          deleted: 0,
          truncated: scan.truncated,
          durationMs: scan.durationMs,
          ...(scan.truncated ? { reason: 'SEMANTIC_FRESHNESS_SCAN_TRUNCATED' } : {}),
        };
        this.recent.set(key, { at: Date.now(), result });
        session.noteFreshness(result);
        return result;
      }

      const events: Array<{ uri: string; type: 1 | 2 | 3; path: string }> = [];
      let created = 0;
      let changed = 0;
      let deleted = 0;
      for (const [filePath, stamp] of next) {
        const old = previous.get(filePath);
        if (!old) {
          created += 1;
          events.push({ uri: pathToFileURL(filePath).href, type: 1, path: filePath });
        } else if (!stampEqual(old, stamp)) {
          changed += 1;
          events.push({ uri: pathToFileURL(filePath).href, type: 2, path: filePath });
        }
      }
      for (const filePath of previous.keys()) {
        if (next.has(filePath)) continue;
        deleted += 1;
        events.push({ uri: pathToFileURL(filePath).href, type: 3, path: filePath });
      }

      const boundedEvents = events.slice(0, this.maxEvents);
      if (boundedEvents.length) {
        session.notify('workspace/didChangeWatchedFiles', {
          changes: boundedEvents.map(({ uri, type }) => ({ uri, type })),
        });
        for (const event of boundedEvents) {
          if (event.type === 1) {
            const extension = event.path.slice(event.path.lastIndexOf('.')).toLowerCase();
            const languageId = definition.languageIds[extension] ?? definition.id;
            await session.bindCreatedFile(event.path, languageId).catch(() => undefined);
          } else if (event.type === 3) {
            await session.closeDeletedFile(event.path).catch(() => undefined);
          }
        }
      }

      const truncated = scan.truncated || events.length > this.maxEvents;
      if (!truncated) this.snapshots.set(key, next);
      const result: WorkspaceFreshnessResult = {
        state: truncated ? 'degraded' : 'fresh',
        scannedFiles: next.size,
        eventCount: boundedEvents.length,
        created,
        changed,
        deleted,
        truncated,
        durationMs: scan.durationMs,
        ...(truncated ? { reason: scan.truncated ? 'SEMANTIC_FRESHNESS_SCAN_TRUNCATED' : 'SEMANTIC_FRESHNESS_EVENT_LIMIT' } : {}),
      };
      this.recent.set(key, { at: Date.now(), result });
      session.noteFreshness(result);
      return result;
    } catch (error) {
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

  clear(root?: string): void {
    if (!root) {
      this.snapshots.clear();
      this.recent.clear();
      return;
    }
    const suffix = `|${root.toLowerCase()}`;
    for (const key of [...this.snapshots.keys()]) if (key.endsWith(suffix)) this.snapshots.delete(key);
    for (const key of [...this.recent.keys()]) if (key.endsWith(suffix)) this.recent.delete(key);
  }
}
