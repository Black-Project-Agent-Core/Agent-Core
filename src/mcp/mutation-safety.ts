import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { BoundedJsonlEventLog } from '../persistence/bounded-event-log.js';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';
import { activityTracker } from '../tracker/activity-tracker.js';

const INVOCATION_META_KEY = 'io.agentcore/invocation-id';
const MAX_INVOCATION_ID = 200;
const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const MAX_JOURNAL_RECORDS = 20_000;
const MAX_ACTIVE_ENTRIES = 1_024;
const COMPACT_TO_ENTRIES = 768;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type MutationOutcome = 'success' | 'handled-failure' | 'exception';

interface ReceivedRecord {
  version: 1;
  type: 'received';
  key: string;
  tool: string;
  argsDigest: string;
  recordedAt: string;
}
interface TerminalRecord {
  version: 1;
  type: 'terminal';
  key: string;
  outcome: MutationOutcome;
  recordedAt: string;
}
type JournalRecord = ReceivedRecord | TerminalRecord;

interface JournalEntry {
  received: ReceivedRecord;
  terminal?: TerminalRecord;
}

export interface MutationSafetyStatus {
  status: 'available' | 'degraded';
  draining: boolean;
  activeMutations: number;
  journalEntries: number;
  issueCount: number;
  issue?: string;
  invocationMetaKey: typeof INVOCATION_META_KEY;
}

function sha256(value: string): string {
  return 'sha256:' + createHash('sha256').update(value, 'utf8').digest('hex');
}
function normalizeForDigest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForDigest);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(input).sort().map(key => [key, normalizeForDigest(input[key])]),
  );
}
function digestArguments(args: unknown): string {
  return sha256(JSON.stringify(normalizeForDigest(args ?? {})));
}
function safeInvocationId(ctx: any): string | undefined {
  const raw = ctx?.mcpReq?._meta?.[INVOCATION_META_KEY];
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string'
    || raw.length > MAX_INVOCATION_ID
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(raw)) {
    throw new Error('MCP_MUTATION_INVOCATION_ID_INVALID');
  }
  return raw;
}
function handled(text: string, isError = true) {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) } as any;
}

export class McpMutationSafety {
  private readonly log: BoundedJsonlEventLog;
  private readonly entries = new Map<string, JournalEntry>();
  private issue: string | null = null;
  private active = 0;
  private draining = false;
  private readonly drainWaiters = new Set<() => void>();
  private journalTail: Promise<void> = Promise.resolve();

  private constructor(private readonly root: string) {
    this.log = new BoundedJsonlEventLog(path.join(root, 'mutation-invocations.jsonl'), {
      maxBytes: MAX_JOURNAL_BYTES,
      maxRecords: MAX_JOURNAL_RECORDS,
      onDiagnostic: message => activityTracker.record(
        'MCP',
        'info',
        'Mutation invocation journal repaired bounded crash tail',
        'mutation-journal-repair',
        { message },
      ),
    });
    this.load();
  }

  static initialize(root: string): McpMutationSafety {
    return new McpMutationSafety(path.resolve(root));
  }

  private load(): void {
    try {
      const records = this.log.replaySync<JournalRecord>((line) => {
        const value = JSON.parse(line) as Partial<JournalRecord>;
        if (value.version !== 1 || typeof value.key !== 'string' || typeof value.recordedAt !== 'string') {
          throw new Error('MCP_MUTATION_JOURNAL_RECORD_INVALID');
        }
        if (value.type === 'received') {
          if (typeof value.tool !== 'string' || typeof value.argsDigest !== 'string') {
            throw new Error('MCP_MUTATION_JOURNAL_RECEIPT_INVALID');
          }
          return value as ReceivedRecord;
        }
        if (value.type === 'terminal') {
          if (!['success', 'handled-failure', 'exception'].includes(String(value.outcome))) {
            throw new Error('MCP_MUTATION_JOURNAL_TERMINAL_INVALID');
          }
          return value as TerminalRecord;
        }
        throw new Error('MCP_MUTATION_JOURNAL_TYPE_INVALID');
      });
      for (const record of records) {
        if (record.type === 'received') this.entries.set(record.key, { received: record });
        else {
          const entry = this.entries.get(record.key);
          if (entry) entry.terminal = record;
        }
      }
      this.pruneInMemory();
      this.issue = null;
    } catch (error) {
      this.issue = `Mutation invocation journal degraded: ${error instanceof Error ? error.message : String(error)}`;
      this.entries.clear();
    }
  }

  private pruneInMemory(now = Date.now()): void {
    const cutoff = now - RETENTION_MS;
    for (const [key, entry] of this.entries) {
      const parsed = Date.parse(entry.terminal?.recordedAt ?? entry.received.recordedAt);
      if (!Number.isFinite(parsed) || parsed < cutoff) this.entries.delete(key);
    }
    if (this.entries.size <= MAX_ACTIVE_ENTRIES) return;
    const ordered = [...this.entries.entries()]
      .sort((a, b) => Date.parse(a[1].received.recordedAt) - Date.parse(b[1].received.recordedAt));
    for (const [key] of ordered.slice(0, Math.max(0, ordered.length - COMPACT_TO_ENTRIES))) {
      this.entries.delete(key);
    }
  }

  private async compact(): Promise<void> {
    this.pruneInMemory();
    const records: JournalRecord[] = [];
    for (const entry of [...this.entries.values()]
      .sort((a, b) => a.received.recordedAt.localeCompare(b.received.recordedAt))) {
      records.push(entry.received);
      if (entry.terminal) records.push(entry.terminal);
    }
    const serialized = records.length
      ? records.map(record => JSON.stringify(record)).join('\n') + '\n'
      : '';
    await writeOwnedFileAtomic(this.log.filePath, serialized, { mode: 0o600 });
  }

  private async maybeCompact(): Promise<void> {
    let bytes = 0;
    try { bytes = (await stat(this.log.filePath)).size; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (bytes >= Math.floor(MAX_JOURNAL_BYTES * 0.75) || this.entries.size >= MAX_ACTIVE_ENTRIES) {
      await this.compact();
    }
  }

  private append(record: JournalRecord): void {
    if (this.issue) throw new Error('MCP_MUTATION_JOURNAL_DEGRADED');
    this.log.appendSync([record], { durable: true });
  }

  private invocationKey(callerId: string, tool: string, invocationId: string): string {
    return sha256(JSON.stringify([callerId, tool, invocationId]));
  }

  private async withJournalLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.journalTail;
    let release!: () => void;
    this.journalTail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async begin(
    callerId: string,
    tool: string,
    invocationId: string,
    args: unknown,
  ): Promise<'new' | 'pending' | 'success' | 'handled-failure' | 'exception' | 'mismatch'> {
    return this.withJournalLock(async () => {
      if (this.issue) return 'pending';
      const key = this.invocationKey(callerId, tool, invocationId);
      const argsDigest = digestArguments(args);
      const existing = this.entries.get(key);
      if (existing) {
        if (existing.received.tool !== tool || existing.received.argsDigest !== argsDigest) return 'mismatch';
        return existing.terminal?.outcome ?? 'pending';
      }

      await this.maybeCompact();
      const received: ReceivedRecord = {
        version: 1,
        type: 'received',
        key,
        tool: tool.slice(0, 120),
        argsDigest,
        recordedAt: new Date().toISOString(),
      };
      this.append(received);
      this.entries.set(key, { received });
      return 'new';
    });
  }

  private async finish(
    callerId: string,
    tool: string,
    invocationId: string,
    outcome: MutationOutcome,
  ): Promise<void> {
    await this.withJournalLock(async () => {
      const key = this.invocationKey(callerId, tool, invocationId);
      const entry = this.entries.get(key);
      if (!entry) throw new Error('MCP_MUTATION_JOURNAL_RECEIPT_MISSING');
      const terminal: TerminalRecord = {
        version: 1,
        type: 'terminal',
        key,
        outcome,
        recordedAt: new Date().toISOString(),
      };
      this.append(terminal);
      entry.terminal = terminal;
      await this.maybeCompact();
    });
  }

  private enter(): boolean {
    if (this.draining) return false;
    this.active += 1;
    return true;
  }
  private leave(): void {
    this.active = Math.max(0, this.active - 1);
    if (this.active === 0) {
      for (const resolve of this.drainWaiters) resolve();
      this.drainWaiters.clear();
    }
  }

  beginDraining(): void {
    this.draining = true;
  }

  async waitForDrain(timeoutMs = 5_000): Promise<boolean> {
    if (this.active === 0) return true;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.drainWaiters.delete(onDrain);
        resolve(value);
      };
      const onDrain = () => finish(true);
      timer = setTimeout(() => finish(false), Math.max(1, timeoutMs));
      timer.unref();
      this.drainWaiters.add(onDrain);
      if (this.active === 0) finish(true);
    });
  }

  status(): MutationSafetyStatus {
    return {
      status: this.issue ? 'degraded' : 'available',
      draining: this.draining,
      activeMutations: this.active,
      journalEntries: this.entries.size,
      issueCount: this.issue ? 1 : 0,
      ...(this.issue ? { issue: this.issue } : {}),
      invocationMetaKey: INVOCATION_META_KEY,
    };
  }

  async runMutation(
    callerId: string,
    tool: string,
    args: unknown,
    ctx: any,
    execute: () => Promise<any>,
  ): Promise<any> {
    if (!this.enter()) return handled('Agent Core is draining mutating MCP work; this mutation was not started.');
    try {
      let invocationId: string | undefined;
      try {
        invocationId = safeInvocationId(ctx);
      } catch (error) {
        return handled(error instanceof Error ? error.message : String(error));
      }

      if (invocationId) {
        const begin = await this.begin(callerId, tool, invocationId, args);
        if (begin === 'mismatch') return handled('MCP_MUTATION_INVOCATION_MISMATCH');
        if (begin === 'pending') return handled('MCP_MUTATION_INVOCATION_UNCERTAIN: prior receipt exists without a terminal result; mutation was not replayed.');
        if (begin === 'success') return handled('MCP_MUTATION_INVOCATION_ALREADY_COMPLETED: mutation was not executed again.', false);
        if (begin === 'handled-failure') return handled('MCP_MUTATION_INVOCATION_ALREADY_COMPLETED_WITH_FAILURE: mutation was not executed again.');
        if (begin === 'exception') return handled('MCP_MUTATION_INVOCATION_ALREADY_COMPLETED_WITH_EXCEPTION: mutation was not executed again.');
      }

      try {
        const result = await execute();
        if (invocationId) {
          await this.finish(
            callerId,
            tool,
            invocationId,
            result?.isError === true ? 'handled-failure' : 'success',
          );
        }
        return result;
      } catch (error) {
        if (invocationId) {
          try { await this.finish(callerId, tool, invocationId, 'exception'); }
          catch (journalError) {
            activityTracker.captureFailure('MCP', journalError, 'mutation-journal-terminal-write-failure', { tool });
          }
        }
        throw error;
      }
    } finally {
      this.leave();
    }
  }
}

/** Tools that mix reads and writes under one name, with the actions that only read; those calls need no mutation journal. */
const READ_ONLY_ACTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  skills: new Set(['list', 'inspect', 'search', 'read']),
};

/** One call, not one tool: a read-only tool, or a read-only action of a mixed tool. Anything unclear counts as a mutation. */
export function isReadOnlyToolCall(name: string, annotations: { readOnlyHint?: unknown } | undefined, args?: unknown): boolean {
  if (annotations?.readOnlyHint === true) return true;
  const action = (args as { action?: unknown } | null | undefined)?.action;
  return typeof action === 'string' && Object.hasOwn(READ_ONLY_ACTIONS, name) && READ_ONLY_ACTIONS[name]!.has(action);
}

export function installMcpMutationSafety(
  server: McpServer,
  safety: McpMutationSafety,
  callerId: string,
): void {
  const target = server as any;
  const original = target.registerTool.bind(server);
  target.registerTool = (name: string, config: any, callback: any) => {
    if (config?.annotations?.readOnlyHint === true) return original(name, config, callback);
    return original(name, config, async (args: unknown, ctx: unknown) =>
      isReadOnlyToolCall(name, config?.annotations, args)
        ? callback(args, ctx)
        : safety.runMutation(callerId, name, args, ctx, () => callback(args, ctx)));
  };
}
