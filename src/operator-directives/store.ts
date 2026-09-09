import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import type { AuthenticationMode } from '../auth/key-types.js';
import type { OperatorDirectiveConfig } from '../config.js';
import {
  isOperatorDirectiveKey,
  operatorDirectiveCatalogEntry,
  type OperatorDirectiveKey,
} from './catalog.js';
import {
  OPERATOR_DIRECTIVE_STATE_VERSION,
  operatorDirectiveStatePaths,
  type OperatorDirectiveEventType,
  type OperatorDirectiveRecoveryReport,
  type OperatorDirectiveStatePaths,
  type PersistedOperatorDirectiveEvent,
  type PersistedOperatorDirectiveJournal,
  type PersistedOperatorDirectiveState,
} from './types.js';

export interface StoredOperatorDirective {
  id: string;
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  revisionNo: number;
  verbatimText: string;
  verbatimSha256: string;
  scope: 'principal_global';
  trustClass: 'authenticated_user_explicit';
  effectVersion: number;
  projectionSha256: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  revokedAt?: number;
  createdByKeyId: string;
  createdAuthentication: AuthenticationMode;
}

export interface StoredOperatorDirectiveEvent {
  id: string;
  directiveId: string;
  principalId: string;
  eventType: OperatorDirectiveEventType;
  revisionNo: number;
  verbatimSha256: string;
  snapshotSha256: string;
  actorKeyId: string;
  authenticationMode: AuthenticationMode;
  reason: string;
  createdAt: number;
}

export interface OperatorDirectiveMutationInput {
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  verbatimText: string;
  actorKeyId: string;
  authenticationMode: AuthenticationMode;
  reason: string;
  now?: number;
}

export interface OperatorDirectiveRevokeInput {
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  actorKeyId: string;
  authenticationMode: AuthenticationMode;
  reason: string;
  now?: number;
}

export interface OperatorDirectiveMutationResult {
  directive: StoredOperatorDirective;
  event: StoredOperatorDirectiveEvent;
}

interface ReplayedStream {
  principalId: string;
  events: PersistedOperatorDirectiveEvent[];
  directives: StoredOperatorDirective[];
  seq: number;
  headHash: string;
  /** Bytes of an interrupted (unterminated) trailing append that replay refused to trust. */
  interruptedAppendBytes: number;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableProjection(input: {
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  revisionNo: number;
  verbatimSha256: string;
  active: boolean;
}): string {
  const catalog = operatorDirectiveCatalogEntry(input.directiveKey);
  return JSON.stringify({
    active: input.active,
    directiveKey: input.directiveKey,
    effectVersion: catalog.effectVersion,
    principalId: input.principalId,
    revisionNo: input.revisionNo,
    scope: catalog.scope,
    trustClass: catalog.trustClass,
    verbatimSha256: input.verbatimSha256,
  });
}

function projectionHash(input: Parameters<typeof stableProjection>[0]): string {
  return sha256(stableProjection(input));
}

/** Integrity hash of one event, chained onto the previous event hash. */
function eventHash(event: Omit<PersistedOperatorDirectiveEvent, 'hash'>): string {
  return sha256(JSON.stringify([
    OPERATOR_DIRECTIVE_STATE_VERSION, event.prevHash, event.seq, event.id, event.directiveId,
    event.principalId, event.directiveKey, event.eventType, event.revisionNo, event.verbatimText,
    event.verbatimSha256, event.snapshotSha256, event.actorKeyId, event.authenticationMode,
    event.reason, event.createdAt,
  ]));
}

/** Filesystem-safe, collision-free, one-way-stable file name for a principal. */
function principalFileName(principalId: string): string {
  const readable = principalId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'principal';
  return `${readable}-${sha256(principalId).slice(0, 16)}`;
}

function corrupt(detail: string): Error {
  return new Error(`OPERATOR_DIRECTIVE_EVENT_STREAM_CORRUPT:${detail}`);
}

function mapEvent(event: PersistedOperatorDirectiveEvent): StoredOperatorDirectiveEvent {
  return {
    id: event.id,
    directiveId: event.directiveId,
    principalId: event.principalId,
    eventType: event.eventType,
    revisionNo: event.revisionNo,
    verbatimSha256: event.verbatimSha256,
    snapshotSha256: event.snapshotSha256,
    actorKeyId: event.actorKeyId,
    authenticationMode: event.authenticationMode as AuthenticationMode,
    reason: event.reason,
    createdAt: event.createdAt,
  };
}

async function readTextOrEmpty(file: string): Promise<string | null> {
  try { return await readFile(file, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  const handle = await open(temp, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try { await rename(temp, target); }
  catch (error) { await rm(temp, { force: true }).catch(() => {}); throw error; }
}

async function appendLine(target: string, line: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(target, 'a');
  try {
    await handle.writeFile(`${line}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export class OperatorDirectiveStore {
  private readonly paths: OperatorDirectiveStatePaths;
  private opening?: Promise<void>;
  private opened = false;

  constructor(readonly config: OperatorDirectiveConfig) {
    this.paths = operatorDirectiveStatePaths(config.stateRoot);
  }

  async open(): Promise<void> {
    if (!this.config.enabled) return;
    if (this.opened) return;
    this.opening ??= this.openOnce().finally(() => { this.opening = undefined; });
    await this.opening;
  }

  async grantOrRevise(input: OperatorDirectiveMutationInput): Promise<OperatorDirectiveMutationResult> {
    if (!input.principalId.trim()) throw new Error('OPERATOR_DIRECTIVE_PRINCIPAL_REQUIRED');
    if (!isOperatorDirectiveKey(String(input.directiveKey))) throw new Error('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
    if (!input.verbatimText) throw new Error('OPERATOR_DIRECTIVE_VERBATIM_REQUIRED');
    if (!input.actorKeyId.trim()) throw new Error('OPERATOR_DIRECTIVE_ACTOR_REQUIRED');
    if (!input.reason.trim()) throw new Error('OPERATOR_DIRECTIVE_REASON_REQUIRED');
    await this.requireOpen();

    return this.withLock(async () => {
      const stream = await this.replay(input.principalId);
      const existing = stream.directives.find((item) => item.directiveKey === input.directiveKey);
      const now = input.now ?? Date.now();
      const revisionNo = (existing?.revisionNo ?? 0) + 1;
      const verbatimSha256 = sha256(input.verbatimText);
      return this.commit(stream, {
        directiveId: existing?.id ?? randomUUID(),
        directiveKey: input.directiveKey,
        eventType: existing ? 'revised' : 'granted',
        revisionNo,
        verbatimText: input.verbatimText,
        verbatimSha256,
        snapshotSha256: projectionHash({
          principalId: input.principalId,
          directiveKey: input.directiveKey,
          revisionNo,
          verbatimSha256,
          active: true,
        }),
        actorKeyId: input.actorKeyId,
        authenticationMode: input.authenticationMode,
        reason: input.reason,
        createdAt: now,
      });
    });
  }

  async revoke(input: OperatorDirectiveRevokeInput): Promise<OperatorDirectiveMutationResult> {
    if (!input.principalId.trim()) throw new Error('OPERATOR_DIRECTIVE_PRINCIPAL_REQUIRED');
    if (!isOperatorDirectiveKey(String(input.directiveKey))) throw new Error('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
    if (!input.reason.trim()) throw new Error('OPERATOR_DIRECTIVE_REASON_REQUIRED');
    await this.requireOpen();

    return this.withLock(async () => {
      const stream = await this.replay(input.principalId);
      const existing = stream.directives.find((item) => item.directiveKey === input.directiveKey);
      if (!existing) throw new Error('OPERATOR_DIRECTIVE_NOT_FOUND');
      if (!existing.active) throw new Error('OPERATOR_DIRECTIVE_NOT_ACTIVE');
      const now = input.now ?? Date.now();
      const revisionNo = existing.revisionNo + 1;
      return this.commit(stream, {
        directiveId: existing.id,
        directiveKey: existing.directiveKey,
        eventType: 'revoked',
        revisionNo,
        verbatimText: existing.verbatimText,
        verbatimSha256: existing.verbatimSha256,
        snapshotSha256: projectionHash({
          principalId: existing.principalId,
          directiveKey: existing.directiveKey,
          revisionNo,
          verbatimSha256: existing.verbatimSha256,
          active: false,
        }),
        actorKeyId: input.actorKeyId,
        authenticationMode: input.authenticationMode,
        reason: input.reason,
        createdAt: now,
      });
    });
  }

  async listCurrent(principalId: string, options: { includeRevoked?: boolean } = {}): Promise<StoredOperatorDirective[]> {
    await this.requireOpen();
    const { directives } = await this.replay(principalId);
    return directives.filter((directive) => options.includeRevoked || directive.active);
  }

  async listEvents(principalId: string): Promise<StoredOperatorDirectiveEvent[]> {
    await this.requireOpen();
    const { events } = await this.replay(principalId);
    return events.map(mapEvent);
  }

  /**
   * Replay-validates every stream and checks it against the materialized state.
   * ponytail: full replay of every principal per call; add a headHash/seq fast path if the
   * directive catalog ever grows beyond a handful of events per principal.
   */
  async integrity(): Promise<{ ok: boolean; result: string }> {
    await this.requireOpen();
    try {
      const materialized = new Set(await this.listStateFiles(this.paths.current, '.json'));
      for (const name of await this.listStateFiles(this.paths.events, '.jsonl')) {
        const stream = await this.replayFile(path.join(this.paths.events, `${name}.jsonl`));
        if (stream.interruptedAppendBytes > 0) return { ok: false, result: `OPERATOR_DIRECTIVE_INTERRUPTED_APPEND:${name}` };
        materialized.delete(name);
        const match = await this.materializedMatches(stream);
        if (match !== 'ok') return { ok: false, result: `${match}:${name}` };
      }
      if (materialized.size) return { ok: false, result: `OPERATOR_DIRECTIVE_STATE_ORPHANED:${[...materialized][0]}` };
      return { ok: true, result: 'ok' };
    } catch (error) {
      return { ok: false, result: error instanceof Error ? error.message : String(error) };
    }
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  private async openOnce(): Promise<void> {
    await mkdir(this.paths.events, { recursive: true });
    await mkdir(this.paths.current, { recursive: true });
    await mkdir(this.paths.journal, { recursive: true });
    this.opened = true;
    try {
      await this.withLock(() => this.recover());
    } catch (error) {
      this.opened = false;
      throw error;
    }
  }

  /** Crash recovery: redo pending journals, heal interrupted appends, rebuild materialized state. */
  private async recover(): Promise<void> {
    const report: OperatorDirectiveRecoveryReport = {
      at: Date.now(),
      interruptedAppendsDropped: 0,
      journalsRedone: 0,
      journalsDiscarded: 0,
      materializedStateRebuilt: false,
    };
    for (const name of (await this.listStateFiles(this.paths.journal, '.json')).sort()) {
      const journalPath = path.join(this.paths.journal, `${name}.json`);
      const raw = await readTextOrEmpty(journalPath);
      if (raw === null) continue;
      let parsed: PersistedOperatorDirectiveJournal | undefined;
      try { parsed = JSON.parse(raw) as PersistedOperatorDirectiveJournal; } catch { parsed = undefined; }
      if (!parsed || parsed.stateVersion !== OPERATOR_DIRECTIVE_STATE_VERSION || !parsed.event?.principalId) {
        // Journal write itself was interrupted: the transaction never became durable.
        await rm(journalPath, { force: true });
        report.journalsDiscarded += 1;
        continue;
      }
      const pending = parsed.event;
      const stream = await this.replay(parsed.principalId, report);
      if (!stream.events.some((event) => event.hash === pending.hash)) {
        if (pending.prevHash === stream.headHash && pending.seq === stream.seq + 1) {
          await appendLine(this.eventsFile(parsed.principalId), JSON.stringify(pending));
          report.journalsRedone += 1;
        } else {
          report.journalsDiscarded += 1;
        }
      }
      await rm(journalPath, { force: true });
    }
    for (const name of await this.listStateFiles(this.paths.events, '.jsonl')) {
      const stream = await this.replayFile(path.join(this.paths.events, `${name}.jsonl`), report);
      if (!stream.events.length) continue;
      if (principalFileName(stream.principalId) !== name) throw corrupt(`PRINCIPAL_FILE_MISMATCH:${name}`);
      if (await this.materializedMatches(stream) === 'ok') continue;
      report.materializedStateRebuilt = true;
      await atomicWrite(this.currentFile(stream.principalId), this.stateDocument(stream, report));
    }
  }

  private async commit(
    stream: ReplayedStream,
    draft: Omit<PersistedOperatorDirectiveEvent, 'seq' | 'id' | 'principalId' | 'prevHash' | 'hash'>,
  ): Promise<OperatorDirectiveMutationResult> {
    const unsealed = {
      ...draft,
      seq: stream.seq + 1,
      id: randomUUID(),
      principalId: stream.principalId,
      prevHash: stream.headHash,
    };
    const event: PersistedOperatorDirectiveEvent = { ...unsealed, hash: eventHash(unsealed) };
    const journalPath = path.join(this.paths.journal, `${event.id}.json`);
    const journal: PersistedOperatorDirectiveJournal = {
      stateVersion: OPERATOR_DIRECTIVE_STATE_VERSION,
      transactionId: event.id,
      principalId: stream.principalId,
      createdAt: event.createdAt,
      event,
    };
    await atomicWrite(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    await appendLine(this.eventsFile(stream.principalId), JSON.stringify(event));
    const committed = this.fold(stream.principalId, [...stream.events, event]);
    await atomicWrite(this.currentFile(stream.principalId), this.stateDocument(committed));
    await rm(journalPath, { force: true });
    const directive = committed.directives.find((item) => item.directiveKey === draft.directiveKey);
    if (!directive) throw new Error('OPERATOR_DIRECTIVE_WRITE_FAILED');
    return { directive, event: mapEvent(event) };
  }

  private eventsFile(principalId: string): string {
    return path.join(this.paths.events, `${principalFileName(principalId)}.jsonl`);
  }

  private currentFile(principalId: string): string {
    return path.join(this.paths.current, `${principalFileName(principalId)}.json`);
  }

  private stateDocument(stream: ReplayedStream, recovery?: OperatorDirectiveRecoveryReport): string {
    const state: PersistedOperatorDirectiveState<StoredOperatorDirective> = {
      ...this.stateCore(stream),
      ...(recovery ? { recovery } : {}),
    };
    return `${JSON.stringify(state, null, 2)}\n`;
  }

  private stateCore(stream: ReplayedStream): PersistedOperatorDirectiveState<StoredOperatorDirective> {
    return {
      stateVersion: OPERATOR_DIRECTIVE_STATE_VERSION,
      principalId: stream.principalId,
      seq: stream.seq,
      headHash: stream.headHash,
      directives: stream.directives,
    };
  }

  /** Compares materialized state against the replayed stream, ignoring the recovery report. */
  private async materializedMatches(
    stream: ReplayedStream,
  ): Promise<'ok' | 'OPERATOR_DIRECTIVE_STATE_MISSING' | 'OPERATOR_DIRECTIVE_STATE_UNREADABLE' | 'OPERATOR_DIRECTIVE_STATE_DIVERGED'> {
    const raw = await readTextOrEmpty(this.currentFile(stream.principalId));
    if (raw === null) return 'OPERATOR_DIRECTIVE_STATE_MISSING';
    let parsed: PersistedOperatorDirectiveState<StoredOperatorDirective>;
    try { parsed = JSON.parse(raw) as PersistedOperatorDirectiveState<StoredOperatorDirective>; }
    catch { return 'OPERATOR_DIRECTIVE_STATE_UNREADABLE'; }
    const { recovery: _recovery, ...core } = parsed;
    return JSON.stringify(core) === JSON.stringify(this.stateCore(stream)) ? 'ok' : 'OPERATOR_DIRECTIVE_STATE_DIVERGED';
  }

  private async listStateFiles(dir: string, suffix: string): Promise<string[]> {
    try {
      return (await readdir(dir))
        .filter((name) => name.endsWith(suffix) && !name.startsWith('.'))
        .map((name) => name.slice(0, -suffix.length));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private async replay(principalId: string, report?: OperatorDirectiveRecoveryReport): Promise<ReplayedStream> {
    const stream = await this.replayFile(this.eventsFile(principalId), report);
    if (stream.events.length && stream.principalId !== principalId) throw corrupt('PRINCIPAL_SCOPE_MISMATCH');
    return { ...stream, principalId };
  }

  /**
   * Reads one append-only stream, validating the hash chain and revision sequence.
   * A trailing line without its terminating newline is an interrupted append and is dropped;
   * anything else that fails validation is surfaced as a corrupt-state error.
   */
  private async replayFile(file: string, report?: OperatorDirectiveRecoveryReport): Promise<ReplayedStream> {
    const text = await readTextOrEmpty(file);
    if (text === null || !text.length) return this.fold('', []);
    const lines = text.split('\n');
    const trailing = lines.pop() ?? '';
    let interruptedAppendBytes = 0;
    if (trailing.length) {
      interruptedAppendBytes = Buffer.byteLength(trailing, 'utf8');
      if (report) report.interruptedAppendsDropped += 1;
    }

    const events: PersistedOperatorDirectiveEvent[] = [];
    let prevHash = '';
    for (const [index, line] of lines.entries()) {
      if (!line.length) throw corrupt(`EMPTY_LINE:${index + 1}`);
      let event: PersistedOperatorDirectiveEvent;
      try { event = JSON.parse(line) as PersistedOperatorDirectiveEvent; }
      catch { throw corrupt(`UNPARSEABLE_EVENT:${index + 1}`); }
      if (event.seq !== index + 1) throw corrupt(`SEQUENCE_BROKEN:${index + 1}`);
      if (event.prevHash !== prevHash) throw corrupt(`CHAIN_BROKEN:${index + 1}`);
      if (event.hash !== eventHash(event)) throw corrupt(`HASH_MISMATCH:${index + 1}`);
      if (events[0] && event.principalId !== events[0].principalId) throw corrupt(`PRINCIPAL_MIXED:${index + 1}`);
      events.push(event);
      prevHash = event.hash;
    }
    if (interruptedAppendBytes > 0 && report) {
      await atomicWrite(file, events.map((event) => `${JSON.stringify(event)}\n`).join(''));
      interruptedAppendBytes = 0;
    }
    return { ...this.fold(events[0]?.principalId ?? '', events), interruptedAppendBytes };
  }

  /** Materializes current directive state from the validated event stream. */
  private fold(principalId: string, events: PersistedOperatorDirectiveEvent[]): ReplayedStream {
    const directives = new Map<string, StoredOperatorDirective>();
    for (const event of events) {
      if (!isOperatorDirectiveKey(event.directiveKey)) throw new Error('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
      const catalog = operatorDirectiveCatalogEntry(event.directiveKey);
      const previous = directives.get(event.directiveKey);
      if (event.revisionNo !== (previous?.revisionNo ?? 0) + 1) throw corrupt(`REVISION_NOT_MONOTONIC:${event.seq}`);
      if (event.eventType === 'revoked') {
        if (!previous || !previous.active) throw corrupt(`REVOKE_WITHOUT_ACTIVE_DIRECTIVE:${event.seq}`);
        directives.set(event.directiveKey, {
          ...previous,
          revisionNo: event.revisionNo,
          projectionSha256: event.snapshotSha256,
          active: false,
          updatedAt: event.createdAt,
          revokedAt: event.createdAt,
        });
        continue;
      }
      if (previous && event.directiveId !== previous.id) throw corrupt(`DIRECTIVE_IDENTITY_CHANGED:${event.seq}`);
      const base = previous ?? {
        createdAt: event.createdAt,
        createdByKeyId: event.actorKeyId,
        createdAuthentication: event.authenticationMode as AuthenticationMode,
      };
      directives.set(event.directiveKey, {
        id: event.directiveId,
        principalId: event.principalId,
        directiveKey: event.directiveKey,
        revisionNo: event.revisionNo,
        verbatimText: event.verbatimText,
        verbatimSha256: event.verbatimSha256,
        scope: catalog.scope,
        trustClass: catalog.trustClass,
        effectVersion: catalog.effectVersion,
        projectionSha256: event.snapshotSha256,
        active: true,
        createdAt: base.createdAt,
        updatedAt: event.createdAt,
        createdByKeyId: base.createdByKeyId,
        createdAuthentication: base.createdAuthentication,
      });
    }
    const sorted = [...directives.values()].sort((left, right) => (left.directiveKey < right.directiveKey ? -1 : left.directiveKey > right.directiveKey ? 1 : 0));
    for (const directive of sorted) this.assertDirectiveIntegrity(directive);
    const head = events[events.length - 1];
    return {
      principalId,
      events,
      directives: sorted,
      seq: head?.seq ?? 0,
      headHash: head?.hash ?? '',
      interruptedAppendBytes: 0,
    };
  }

  private assertDirectiveIntegrity(directive: StoredOperatorDirective): void {
    const catalog = operatorDirectiveCatalogEntry(directive.directiveKey);
    const expectedVerbatimSha = sha256(directive.verbatimText);
    const expectedProjectionSha = projectionHash({
      principalId: directive.principalId,
      directiveKey: directive.directiveKey,
      revisionNo: directive.revisionNo,
      verbatimSha256: directive.verbatimSha256,
      active: directive.active,
    });
    if (
      directive.verbatimSha256 !== expectedVerbatimSha
      || directive.projectionSha256 !== expectedProjectionSha
      || directive.scope !== catalog.scope
      || directive.trustClass !== catalog.trustClass
      || directive.effectVersion !== catalog.effectVersion
    ) {
      throw new Error('OPERATOR_DIRECTIVE_INTEGRITY_FAILED');
    }
  }

  /** Cross-process owner-token lock with stale-owner detection and bounded retry. */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const ttl = Math.max(1, Math.floor(this.config.lockTimeoutMs));
    const token = `${hostname()}:${process.pid}:${randomUUID()}`;
    const deadline = Date.now() + ttl;
    for (;;) {
      try {
        const handle = await open(this.paths.lock, 'wx');
        try {
          await handle.writeFile(JSON.stringify({ token, pid: process.pid, host: hostname(), acquiredAt: Date.now(), expiresAt: Date.now() + ttl }), 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await this.clearStaleLock(ttl);
        if (Date.now() >= deadline) throw new Error('OPERATOR_DIRECTIVE_LOCK_TIMEOUT');
        await delay(5 + Math.floor(Math.random() * 10));
      }
    }
    try {
      return await operation();
    } finally {
      const held = await readTextOrEmpty(this.paths.lock);
      if (held !== null && held.includes(token)) await rm(this.paths.lock, { force: true }).catch(() => {});
    }
  }

  private async clearStaleLock(ttl: number): Promise<void> {
    const raw = await readTextOrEmpty(this.paths.lock).catch(() => null);
    if (raw === null) return;
    let expiresAt: number | undefined;
    try { expiresAt = (JSON.parse(raw) as { expiresAt?: number }).expiresAt; } catch { expiresAt = undefined; }
    if (typeof expiresAt !== 'number') {
      // Lock file write was itself interrupted; fall back to its age.
      const info = await stat(this.paths.lock).catch(() => null);
      if (info && Date.now() - info.mtimeMs > ttl) await rm(this.paths.lock, { force: true }).catch(() => {});
      return;
    }
    if (Date.now() > expiresAt) await rm(this.paths.lock, { force: true }).catch(() => {});
  }

  private async requireOpen(): Promise<void> {
    if (!this.config.enabled) throw new Error('OPERATOR_DIRECTIVES_DISABLED');
    if (!this.opened) await this.open();
    if (!this.opened) throw new Error('OPERATOR_DIRECTIVE_STATE_UNAVAILABLE');
  }
}
