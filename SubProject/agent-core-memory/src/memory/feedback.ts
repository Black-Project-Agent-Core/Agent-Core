import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MemoryPaths } from './paths.js';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { withMemoryProcessLock } from './lock.js';
import {preservesMemoryHistory,retainTelemetry} from './archive.js';
import {fingerprintText} from './transaction.js';
import { assertMemoryFeedbackDigest } from './feedback-target.js';

export type MemoryFeedbackKind = 'helpful' | 'not-helpful' | 'stale' | 'wrong';
export type MemoryLifecycleAction = 'forget' | 'restore';

const VERSION = 1 as const;
const DEFAULT_SALIENCE = 1.0;
export const MEMORY_SALIENCE_MIN = 0.25;
export const MEMORY_SALIENCE_MAX = 2.0;
export const MEMORY_SALIENCE_STEP = 0.25;
const MAX_RECORDS = 512;
const MAX_EVENTS_PER_MEMORY = 64;

export interface MemoryFeedbackEvent {
  eventId: string;
  kind: MemoryFeedbackKind;
  at: string;
  contentDigest?: string;
}
export interface MemoryLifecycleEvent {
  eventId: string;
  action: MemoryLifecycleAction;
  at: string;
  reason?: string;
}
export interface MemoryFeedbackSnapshot {
  id: string;
  salience: number;
  events: MemoryFeedbackEvent[];
  forgotten: boolean;
  lifecycleEvents: MemoryLifecycleEvent[];
}
interface FeedbackRecord {
  id: string;
  salience: number;
  events: MemoryFeedbackEvent[];
  forgotten: boolean;
  lifecycleEvents: MemoryLifecycleEvent[];
}
interface FeedbackState {
  version: typeof VERSION;
  records: FeedbackRecord[];
}
export interface MemoryFeedbackResult {
  id: string;
  kind: MemoryFeedbackKind;
  eventId: string;
  duplicate: boolean;
  salience: number;
  contentDigest?: string;
}
export interface MemoryLifecycleResult {
  id: string;
  action: MemoryLifecycleAction;
  eventId: string;
  duplicate: boolean;
  forgotten: boolean;
}

function safeEventId(raw: string): string {
  const value = raw.trim();
  if (!value || value.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    throw new Error('MEMORY_FEEDBACK_EVENT_ID_INVALID');
  }
  return value;
}
function nextSalience(current: number | undefined, kind: MemoryFeedbackKind): number {
  const value = Number.isFinite(current) ? Number(current) : DEFAULT_SALIENCE;
  const next = kind === 'helpful'
    ? value + MEMORY_SALIENCE_STEP
    : kind === 'not-helpful'
      ? value - MEMORY_SALIENCE_STEP
      : MEMORY_SALIENCE_MIN;
  return Math.max(MEMORY_SALIENCE_MIN, Math.min(MEMORY_SALIENCE_MAX, next));
}
function validateRecord(raw: unknown): FeedbackRecord {
  if (!raw || typeof raw !== 'object') throw new Error('MEMORY_FEEDBACK_RECORD_INVALID');
  const value = raw as Partial<FeedbackRecord>;
  if (typeof value.id !== 'string' || !value.id
    || typeof value.salience !== 'number' || !Number.isFinite(value.salience)
    || value.salience < MEMORY_SALIENCE_MIN || value.salience > MEMORY_SALIENCE_MAX
    || !Array.isArray(value.events)) {
    throw new Error('MEMORY_FEEDBACK_RECORD_INVALID');
  }
  const events = value.events.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('MEMORY_FEEDBACK_EVENT_INVALID');
    const event = item as Partial<MemoryFeedbackEvent>;
    if (typeof event.eventId !== 'string'
      || !['helpful', 'not-helpful', 'stale', 'wrong'].includes(String(event.kind))
      || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))) {
      throw new Error('MEMORY_FEEDBACK_EVENT_INVALID');
    }
    if (event.contentDigest !== undefined) assertMemoryFeedbackDigest(event.contentDigest);
    return {
      eventId: safeEventId(event.eventId),
      kind: event.kind as MemoryFeedbackKind,
      at: new Date(event.at).toISOString(),
      ...(event.contentDigest !== undefined ? { contentDigest: event.contentDigest } : {}),
    };
  });
  const lifecycleEvents = (Array.isArray(value.lifecycleEvents) ? value.lifecycleEvents : [])
    .map((item) => {
      if (!item || typeof item !== 'object') throw new Error('MEMORY_LIFECYCLE_EVENT_INVALID');
      const event = item as Partial<MemoryLifecycleEvent>;
      if (typeof event.eventId !== 'string'
        || !['forget', 'restore'].includes(String(event.action))
        || typeof event.at !== 'string' || !Number.isFinite(Date.parse(event.at))) {
        throw new Error('MEMORY_LIFECYCLE_EVENT_INVALID');
      }
      return {
        eventId: safeEventId(event.eventId),
        action: event.action as MemoryLifecycleAction,
        at: new Date(event.at).toISOString(),
        ...(typeof event.reason === 'string' && event.reason.trim() ? { reason: event.reason.trim().slice(0, 500) } : {}),
      };
    });
  return { id: value.id, salience: value.salience, events, forgotten: value.forgotten === true, lifecycleEvents };
}

/** Exact captured visibility bytes for declared transaction read sets; no missing-state fallback. */
function persistedFeedbackRecords(content:string|null) {
  if (content === null) throw new Error('MEMORY_FEEDBACK_STATE_MISSING');
  const raw = JSON.parse(content) as Partial<FeedbackState>;
  if (raw.version !== VERSION || !Array.isArray(raw.records)) throw new Error('MEMORY_FEEDBACK_STATE_INVALID');
  if(raw.records.some(record=>typeof record.forgotten!=='boolean')||new Set(raw.records.map(record=>record.id)).size!==raw.records.length)throw new Error('MEMORY_FEEDBACK_STATE_INVALID');
  return raw.records.map(validateRecord);
}

export function strictForgottenIdsFromContent(content:string|null):Set<string> {
  return new Set(persistedFeedbackRecords(content).filter(record=>record.forgotten).map(record=>record.id));
}
/** Domain-owned record subjects used to authorize retained feedback metadata. */
export function feedbackRecordSubjects(content:string):string[] {
  return persistedFeedbackRecords(content).map(record=>record.id);
}

export class MemoryFeedbackStore {
  private readonly filePath: string;
  private readonly lockPath: string;
  private issue: string | null = null;

  constructor(private readonly paths: MemoryPaths) {
    this.filePath = path.join(paths.state, 'feedback.json');
    this.lockPath = paths.lock;
  }

  getIssue(): string | null {
    return this.issue;
  }

  private async load(requireExisting = false): Promise<FeedbackState> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<FeedbackState>;
      if (raw.version !== VERSION || !Array.isArray(raw.records)) throw new Error('MEMORY_FEEDBACK_STATE_INVALID');
      if(requireExisting)strictForgottenIdsFromContent(JSON.stringify(raw));
      const records = raw.records.map(validateRecord);
      this.issue = null;
      return { version: VERSION, records };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (requireExisting) {
          this.issue = 'Memory visibility state is missing';
          throw new Error('MEMORY_FEEDBACK_STATE_MISSING');
        }
        this.issue = null;
        return { version: VERSION, records: [] };
      }
      this.issue = `Memory feedback state degraded: ${error instanceof Error ? error.message : String(error)}`;
      throw new Error('MEMORY_FEEDBACK_STATE_DEGRADED');
    }
  }

  private async save(state: FeedbackState): Promise<void> {
    const preserve=await preservesMemoryHistory(this.paths);
    if(preserve&&state.records.length)await retainTelemetry(this.paths,'feedback',fingerprintText(JSON.stringify(state)),state);
    // Visibility is authoritative state, not bounded telemetry. Forgotten entries never rotate out.
    const retained=new Set(state.records.slice(-MAX_RECORDS).map(record=>record.id));
    const records=state.records.filter(record=>retained.has(record.id)||(preserve&&record.forgotten)).map(record=>({...record,
      events:record.events.slice(-MAX_EVENTS_PER_MEMORY),lifecycleEvents:record.lifecycleEvents.slice(-MAX_EVENTS_PER_MEMORY)}));
    await writeOwnedFileAtomic(
      this.filePath,
      JSON.stringify({ version: VERSION, records }, null, 2) + '\n',
      { mode: 0o600 },
    );
    this.issue = null;
  }

  async apply(
    id: string, eventId: string, kind: MemoryFeedbackKind,
    validateContent?: () => Promise<string>,
  ): Promise<MemoryFeedbackResult> {
    const key = safeEventId(eventId);
    return withMemoryProcessLock(this.lockPath, async () => {
      // Canonical writers use this same lock. Validate before replay or state mutation.
      const contentDigest = validateContent === undefined ? undefined : await validateContent();
      if (validateContent !== undefined) assertMemoryFeedbackDigest(contentDigest);
      const binding = contentDigest === undefined ? {} : { contentDigest };
      const state = await this.load(await preservesMemoryHistory(this.paths));
      let record = state.records.find(item => item.id === id);
      if (!record) {
        record = { id, salience: DEFAULT_SALIENCE, events: [], forgotten: false, lifecycleEvents: [] };
        state.records.push(record);
      }
      const prior = record.events.find(event => event.eventId === key);
      if (prior) {
        if (prior.kind !== kind || (contentDigest !== undefined && prior.contentDigest !== contentDigest)) {
          throw new Error('MEMORY_FEEDBACK_EVENT_CONFLICT');
        }
        return { id, kind, eventId: key, duplicate: true, salience: record.salience,
          ...(prior.contentDigest === undefined ? {} : { contentDigest: prior.contentDigest }) };
      }
      record.salience = nextSalience(record.salience, kind);
      record.events = [...record.events, { eventId: key, kind, at: new Date().toISOString(), ...binding }];
      await this.save(state);
      return { id, kind, eventId: key, duplicate: false, salience: record.salience, ...binding };
    });
  }

  async applyLifecycle(
    id: string,
    eventId: string,
    action: MemoryLifecycleAction,
    reason?: string,
  ): Promise<MemoryLifecycleResult> {
    const key = safeEventId(eventId);
    return withMemoryProcessLock(this.lockPath, async () => {
      const state = await this.load(await preservesMemoryHistory(this.paths));
      let record = state.records.find(item => item.id === id);
      if (!record) {
        record = { id, salience: DEFAULT_SALIENCE, events: [], forgotten: false, lifecycleEvents: [] };
        state.records.push(record);
      }
      const prior = record.lifecycleEvents.find(event => event.eventId === key);
      if (prior) {
        if (prior.action !== action) throw new Error('MEMORY_LIFECYCLE_EVENT_CONFLICT');
        return { id, action, eventId: key, duplicate: true, forgotten: record.forgotten };
      }
      const target = action === 'forget';
      if (record.forgotten === target) {
        return { id, action, eventId: key, duplicate: true, forgotten: record.forgotten };
      }
      record.forgotten = target;
      record.lifecycleEvents = [...record.lifecycleEvents, {
        eventId: key,
        action,
        at: new Date().toISOString(),
        ...(reason?.trim() ? { reason: reason.trim().slice(0, 500) } : {}),
      }];
      await this.save(state);
      return { id, action, eventId: key, duplicate: false, forgotten: record.forgotten };
    });
  }

  async lifecycle(id: string): Promise<{ forgotten: boolean; events: MemoryLifecycleEvent[] }> {
    const state = await this.load(await preservesMemoryHistory(this.paths));
    const record = state.records.find(item => item.id === id);
    return { forgotten: record?.forgotten === true, events: record?.lifecycleEvents.map(event => ({ ...event })) ?? [] };
  }

  async forgottenIds(validIds?: ReadonlySet<string>): Promise<Set<string>> {
    const state = await this.load(await preservesMemoryHistory(this.paths));
    return new Set(state.records
      .filter(record => record.forgotten && (!validIds || validIds.has(record.id)))
      .map(record => record.id));
  }

  /** Facade read: missing state is not evidence that no memories were forgotten. */
  async strictForgottenIds(validIds?: ReadonlySet<string>): Promise<Set<string>> {
    const state = await this.load(true);
    return new Set(state.records
      .filter(record => record.forgotten && (!validIds || validIds.has(record.id)))
      .map(record => record.id));
  }

  /** Bootstrap only a host-confirmed complete, foundation-only store.
   * Recheck canonical eligibility while holding the same lock as all writers.
   * Existing/corrupt visibility is never overwritten by this initializer.
   */
  async initializeEmptyVisibilityIf(canInitialize: () => Promise<boolean>): Promise<void> {
    await withMemoryProcessLock(this.lockPath, async () => {
      try { await this.load(true); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'MEMORY_FEEDBACK_STATE_MISSING') throw error;
        if (!await canInitialize()) return;
        await this.save({ version: VERSION, records: [] });
      }
    });
  }

  async salience(id: string): Promise<number> {
    const state = await this.load(await preservesMemoryHistory(this.paths));
    return state.records.find(record => record.id === id)?.salience ?? DEFAULT_SALIENCE;
  }

  async salienceMap(validIds?: ReadonlySet<string>): Promise<Map<string, number>> {
    const state = await this.load(await preservesMemoryHistory(this.paths));
    const output = new Map<string, number>();
    for (const record of state.records) {
      if (!validIds || validIds.has(record.id)) output.set(record.id, record.salience);
    }
    return output;
  }

  async reset(id: string): Promise<void> {
    await withMemoryProcessLock(this.lockPath, async () => {
      const state = await this.load(await preservesMemoryHistory(this.paths));
      const preserve=await preservesMemoryHistory(this.paths);
      const records = state.records.filter(record => record.id !== id||(preserve&&record.forgotten));
      if(preserve&&state.records.length)await retainTelemetry(this.paths,'feedback',fingerprintText(JSON.stringify(state)),state);
      if (records.length !== state.records.length) await this.save({ version: VERSION, records });
    });
  }

  async reconcile(validIds: ReadonlySet<string>): Promise<void> {
    await withMemoryProcessLock(this.lockPath, async () => {
      const state = await this.load(await preservesMemoryHistory(this.paths));
      const preserve=await preservesMemoryHistory(this.paths);
      const records = state.records.filter(record => validIds.has(record.id)||(preserve&&record.forgotten));
      if(preserve&&state.records.length)await retainTelemetry(this.paths,'feedback',fingerprintText(JSON.stringify(state)),state);
      if (records.length !== state.records.length) await this.save({ version: VERSION, records });
    });
  }

  async snapshot(validIds?: ReadonlySet<string>): Promise<MemoryFeedbackSnapshot[]> {
    const state = await this.load(await preservesMemoryHistory(this.paths));
    return state.records
      .filter(record => !validIds || validIds.has(record.id))
      .map(record => ({
        id: record.id,
        salience: record.salience,
        events: record.events.map(event => ({ ...event })),
        forgotten: record.forgotten,
        lifecycleEvents: record.lifecycleEvents.map(event => ({ ...event })),
      }));
  }

  async status(validIds?: ReadonlySet<string>): Promise<{
    recordCount: number;
    helpfulAboveDefault: number;
    reducedBelowDefault: number;
    forgottenCount: number;
    issue?: string;
  }> {
    try {
      const state = await this.load(await preservesMemoryHistory(this.paths));
      const records = validIds ? state.records.filter(record => validIds.has(record.id)) : state.records;
      return {
        recordCount: records.length,
        helpfulAboveDefault: records.filter(record => record.salience > DEFAULT_SALIENCE).length,
        reducedBelowDefault: records.filter(record => record.salience < DEFAULT_SALIENCE).length,
        forgottenCount: records.filter(record => record.forgotten).length,
      };
    } catch {
      return {
        recordCount: 0,
        helpfulAboveDefault: 0,
        reducedBelowDefault: 0,
        forgottenCount: 0,
        ...(this.issue ? { issue: this.issue } : {}),
      };
    }
  }
}

export function applyFeedbackSalience(current: number | undefined, kind: MemoryFeedbackKind): number {
  return nextSalience(current, kind);
}
