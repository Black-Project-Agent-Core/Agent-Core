import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExecutionArtifactType, ExecutionResourceSpec, ValidatedExecutionArtifact, ValidatedExecutionNode } from './dag.js';
import type { ExecutionAttemptPaths, ExecutionResultMarker } from './log-store.js';
import type { ParsedExecutionOutput } from './output-parser.js';
import {
  EXECUTION_STATE_VERSION,
  type ExecutionAttemptState,
  type ExecutionNodeState,
  type ExecutionRunState,
  type ExecutionScope,
} from './types.js';
import type { ExecutionEventFilter, ExecutionEventRecord, ExecutionEventType } from './wake.js';

export class ExecutionStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ExecutionStoreError';
  }
}

export interface ExecutionStoreOpenResult {
  stateRoot: string;
  stateVersion: number;
  priorStateVersion?: number;
  journalsRecovered: number;
  runsRepaired: string[];
  openedAt: number;
}

export interface ExecutionRunRecord {
  runId: string;
  principalId: string;
  projectId?: string;
  continuityTaskId?: string;
  originRouteContextId?: string;
  state: ExecutionRunState;
  objective: string;
  maxConcurrency: number;
  lastEventSequence: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
}

export interface ExecutionWorkflowPendingAttempt { nodeId: string; attemptId: string; attemptNo: number; error?: string }

export function executionWorkflowPending(run: ExecutionRunRecord): ExecutionWorkflowPendingAttempt[] {
  const value = run.metadata.workflowPendingAttempts;
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => !item || typeof item.nodeId !== 'string' || typeof item.attemptId !== 'string'
    || !Number.isSafeInteger(item.attemptNo) || item.attemptNo < 1 || (item.error !== undefined && typeof item.error !== 'string'))) {
    fail('EXECUTION_WORKFLOW_PENDING_INVALID', 'Pending workflow attempt metadata is invalid');
  }
  return value as ExecutionWorkflowPendingAttempt[];
}

export interface ExecutionNodeRecord {
  runId: string;
  nodeId: string;
  purpose: string;
  command: string;
  cwd: string;
  state: ExecutionNodeState;
  timeoutMs: number;
  expectedArtifacts: ValidatedExecutionArtifact[];
  stepIds?: string[];
  resources?: ExecutionResourceSpec;
  inputs?: string[];
  toolchain?: string[];
  attemptCount: number;
  lastError?: Record<string, unknown>;
  dependsOn: string[];
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface ExecutionAttemptRecord {
  attemptId: string;
  runId: string;
  nodeId: string;
  attemptNo: number;
  state: ExecutionAttemptState;
  processPid?: number;
  stdoutPath: string;
  stderrPath: string;
  resultPath: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  signal?: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutSha256?: string;
  stderrSha256?: string;
  error?: Record<string, unknown>;
}

interface StoredParsedOutput {
  parserVersion: string;
  status: 'available' | 'degraded';
  markerBinding?: { runId: string; attemptId: string; planHash?: string; planRevision?: string };
  sourceStdoutSha256?: string;
  sourceStderrSha256?: string;
  parsed?: ParsedExecutionOutput;
  confidence?: number;
  failureCode?: string;
  createdAt: number;
}

interface StoredAttempt extends ExecutionAttemptRecord {
  parsedOutputs?: StoredParsedOutput[];
}

export type ExecutionParsedOutputView = {
  available: true;
  status: 'available';
  parserVersion: string;
  confidence: number;
  source: { stdoutSha256: string; stderrSha256: string };
  structured: ParsedExecutionOutput['structured'];
  coverageStatus: 'complete' | 'partial' | 'legacy_unknown';
  coverage?: ParsedExecutionOutput['coverage'];
  projection?: ParsedExecutionOutput['projection'];
  binding?: ParsedExecutionOutput['binding'];
  rawAccess?: ParsedExecutionOutput['rawAccess'];
} | {
  available: false;
  status: 'degraded';
  parserVersion: string;
  failureCode: string;
};

export interface CreateExecutionRunInput {
  objective: string;
  continuityTaskId?: string;
  originRouteContextId?: string;
  maxConcurrency: number;
  metadata?: Record<string, unknown>;
}

export interface ExecutionStoreStatus {
  healthy: boolean;
  stateVersion: number;
  integrity: string;
  stateRoot: string;
  lastIntegrityCheckAt?: number;
}

export interface ExecutionRecoverableAttempt extends ExecutionAttemptRecord {
  principalId: string;
  projectId?: string;
  runState: ExecutionRunState;
  nodeState: ExecutionNodeState;
}

export interface ExecutionArtifactRecord {
  artifactId: string;
  runId: string;
  nodeId: string;
  attemptNo: number;
  path: string;
  artifactType: ExecutionArtifactType;
  verification: 'verified';
  sha256?: string;
  size?: number;
  modifiedAt?: number;
  sourceResultRef: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface NewExecutionArtifact {
  path: string;
  artifactType: ExecutionArtifactType;
  sha256?: string;
  size?: number;
  modifiedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ExecutionArtifactQuery {
  runId?: string;
  nodeId?: string;
  attemptNo?: number;
  sha256?: string;
  artifactType?: ExecutionArtifactType;
  terminalRunsOnly?: boolean;
  createdAtMax?: number;
  order?: 'newest' | 'oldest';
  limit?: number;
}

export interface ExecutionMemorySyncRecord {
  queueId: string;
  runId: string;
  eventSequence?: number;
  syncKey: string;
  payload: Record<string, unknown>;
  state: 'queued' | 'syncing' | 'failed';
  attempts: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

interface StoredSyncEntry extends Omit<ExecutionMemorySyncRecord, 'state'> {
  state: 'queued' | 'syncing' | 'synced' | 'failed';
}

/** Scope + state facts kept in the deterministic run manifest so lookups never scan every run body. */
interface RunIndexEntry {
  runId: string;
  principalId: string;
  projectId: string;
  state: ExecutionRunState;
  continuityTaskId?: string;
  createdAt: number;
}

interface StoredEvent extends ExecutionEventRecord {
  globalSequence: number;
  payloadHash: string;
}

interface LockRecord {
  pid: number;
  token: string;
  acquiredAt: number;
}

interface Transaction {
  writes?: Array<{ path: string; content: string }>;
  /** Line appends. `guardSequence` makes an event append idempotent across journal replay. */
  appends?: Array<{ path: string; line: string; guardSequence?: number }>;
  removes?: string[];
}

const RUN_TERMINAL = new Set<ExecutionRunState>(['completed', 'failed', 'blocked', 'interrupted', 'cancelled']);
const NODE_TERMINAL = new Set<ExecutionNodeState>(['succeeded', 'failed', 'blocked', 'interrupted', 'cancelled']);
const SYNC_PENDING = new Set(['queued', 'syncing', 'failed']);
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const GLOBAL_SEQUENCE_BLOCK = 64;
const TRANSACTION_WRITE_CONCURRENCY = 4;

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw new ExecutionStoreError(code, message, details);
}

function scopeProject(scope: ExecutionScope): string {
  return scope.projectId ?? '';
}

function assertScope(scope: ExecutionScope): void {
  if (!scope?.principalId?.trim()) fail('EXECUTION_SCOPE_REQUIRED', 'principalId is required');
}

function boundedText(value: unknown, field: string, max = 20_000): string {
  if (typeof value !== 'string') fail(`EXECUTION_${field.toUpperCase()}_REQUIRED`, `${field} is required`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized) fail(`EXECUTION_${field.toUpperCase()}_REQUIRED`, `${field} is required`);
  if (normalized.length > max) fail('EXECUTION_TEXT_TOO_LONG', `${field} exceeds ${max} characters`);
  return normalized;
}

function optionalText(value: unknown, field: string, max = 5_000): string | undefined {
  if (value === undefined || value === null) return undefined;
  return boundedText(value, field, max);
}

export function stableExecutionJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableExecutionJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableExecutionJson(item)}`)
    .join(',')}}`;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Every identifier that becomes a path segment is checked here, so no caller-supplied run or node
 * ID can escape the state root. The DAG validator already rejects IDs that differ only in case.
 */
function safeSegment(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value)) {
    fail(`EXECUTION_${field.toUpperCase()}_INVALID`, `${field} is not a safe execution state segment`);
  }
  return value;
}

/** Lock names are derived, never stored, so they are simply flattened into a safe file name. */
function lockName(value: string): string {
  return SAFE_SEGMENT.test(value) ? value : `${value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96)}~${sha256Hex(value).slice(0, 12)}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

const RENAME_CONTENDED = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Windows fails a replacing rename with a sharing violation while any reader still holds the
 * destination open - and this state root is read concurrently by design. The rename stays the
 * atomic commit point; it is simply retried until the reader's handle closes.
 */
async function renameOver(temporary: string, target: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 12 || !code || !RENAME_CONTENDED.has(code)) throw error;
      await delay(2 + attempt * 3);
    }
  }
}

async function openWithParent(target: string, flags: 'wx' | 'a'): Promise<Awaited<ReturnType<typeof open>>> {
  try {
    return await open(target, flags);
  } catch (error) {
    if (!isMissing(error)) throw error;
    // Existing run directories need no extra filesystem roundtrip. A missing parent is
    // recreated on demand; permission, collision and retry errors still reach the caller.
    await mkdir(path.dirname(target), { recursive: true });
    return open(target, flags);
  }
}

async function writeAtomic(target: string, content: string, sync = false): Promise<void> {
  const temporary = `${target}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
  const handle = await openWithParent(temporary, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    if (sync) await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await renameOver(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function appendLine(target: string, line: string): Promise<void> {
  const handle = await openWithParent(target, 'a');
  try {
    await handle.writeFile(`${line}\n`, 'utf8');
  } finally {
    await handle.close();
  }
}

async function readJson<T>(target: string): Promise<T | null> {
  let body: string;
  try {
    body = await readFile(target, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    fail('EXECUTION_STATE_CORRUPT', `Execution state file is not valid JSON: ${target}`, { path: target });
  }
}

/**
 * Read an append-only log. A single unparseable trailing line is a torn append from a crash and is
 * dropped; anything unparseable earlier in the file is real corruption and must never pass silently.
 */
async function readLines<T>(target: string): Promise<T[]> {
  let body: string;
  try {
    body = await readFile(target, 'utf8');
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const lines = body.split('\n');
  const out: T[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      const trailing = lines.slice(index + 1).every((rest) => !rest.trim());
      if (!trailing) fail('EXECUTION_STATE_CORRUPT', `Execution append log is corrupt at line ${index + 1}: ${target}`, { path: target, line: index + 1 });
    }
  }
  return out;
}

async function listDir(target: string): Promise<string[]> {
  try {
    return (await readdir(target)).sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

function eventRecord(stored: StoredEvent): ExecutionEventRecord {
  return {
    runId: stored.runId,
    sequence: stored.sequence,
    eventType: stored.eventType,
    ...(stored.nodeId ? { nodeId: stored.nodeId } : {}),
    ...(stored.attemptId ? { attemptId: stored.attemptId } : {}),
    payload: stored.payload ?? {},
    createdAt: stored.createdAt,
  };
}

function artifactKey(artifact: { nodeId: string; attemptNo: number; path: string }): string {
  return `${artifact.nodeId}\u0000${artifact.attemptNo}\u0000${artifact.path}`;
}

export class ExecutionStore {
  private opened = false;
  private closed = false;
  private root = '';
  private lockTimeoutMs = 5_000;
  private lastIntegrity = 'unknown';
  private globalSequence = 0;
  private globalSequenceCeiling = 0;
  private lastIntegrityCheckAt: number | undefined;
  /** In-process serialisation per lock name so co-operating callers never poll the on-disk lock. */
  private readonly chains = new Map<string, Promise<unknown>>();

  get stateRoot(): string {
    return this.root;
  }

  async open(options: { stateRoot: string; lockTimeoutMs?: number }): Promise<ExecutionStoreOpenResult> {
    if (this.closed) fail('EXECUTION_STORE_CLOSED', 'Execution store is closed');
    if (!options?.stateRoot?.trim()) fail('EXECUTION_STATE_ROOT_REQUIRED', 'Execution state root is required');
    const root = path.resolve(options.stateRoot);
    if (this.opened && root !== this.root) fail('EXECUTION_STATE_ROOT_CONFLICT', 'Execution store is already open on a different state root');
    this.root = root;
    if (typeof options.lockTimeoutMs === 'number' && Number.isFinite(options.lockTimeoutMs) && options.lockTimeoutMs > 0) {
      this.lockTimeoutMs = Math.min(60_000, Math.max(250, Math.trunc(options.lockTimeoutMs)));
    }
    for (const directory of ['state/runs', 'state/sync', 'events', 'artifacts', 'leases', 'checkpoints', 'journal/locks', 'index']) {
      await mkdir(path.join(root, ...directory.split('/')), { recursive: true });
    }

    const markerPath = path.join(root, 'state.json');
    const marker = await readJson<{ stateVersion: number }>(markerPath);
    const priorStateVersion = marker?.stateVersion;
    if (priorStateVersion !== undefined && (!Number.isInteger(priorStateVersion) || priorStateVersion > EXECUTION_STATE_VERSION)) {
      fail('EXECUTION_STATE_VERSION_UNSUPPORTED', `Execution state version ${priorStateVersion} is newer than runtime version ${EXECUTION_STATE_VERSION}`);
    }
    if (priorStateVersion !== EXECUTION_STATE_VERSION) {
      await writeAtomic(markerPath, `${JSON.stringify({ stateVersion: EXECUTION_STATE_VERSION, createdAt: Date.now() }, null, 2)}\n`, true);
    }

    const journalsRecovered = await this.replayJournals();
    await this.rebuildRunIndex();
    const runsRepaired = await this.repairRuns();
    this.opened = true;
    this.lastIntegrity = 'ok';
    this.lastIntegrityCheckAt = Date.now();
    return {
      stateRoot: root,
      stateVersion: EXECUTION_STATE_VERSION,
      ...(priorStateVersion === undefined ? {} : { priorStateVersion }),
      journalsRecovered,
      runsRepaired,
      openedAt: this.lastIntegrityCheckAt,
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.opened = false;
    await Promise.all([...this.chains.values()].map((chain) => chain.catch(() => undefined)));
    this.chains.clear();
  }

  async status(): Promise<ExecutionStoreStatus> {
    this.assertReady();
    this.lastIntegrityCheckAt = Date.now();
    try {
      const pending = (await listDir(this.path('journal'))).filter((name) => name.endsWith('.json'));
      this.lastIntegrity = pending.length === 0 ? 'ok' : `pending_transactions:${pending.length}`;
      return {
        healthy: pending.length === 0,
        stateVersion: EXECUTION_STATE_VERSION,
        integrity: this.lastIntegrity,
        stateRoot: this.root,
        lastIntegrityCheckAt: this.lastIntegrityCheckAt,
      };
    } catch (error) {
      this.lastIntegrity = `degraded:${error instanceof Error ? error.message : String(error)}`;
      return {
        healthy: false,
        stateVersion: EXECUTION_STATE_VERSION,
        integrity: this.lastIntegrity,
        stateRoot: this.root,
        lastIntegrityCheckAt: this.lastIntegrityCheckAt,
      };
    }
  }

  async systemCounts(): Promise<{ activeRuns: number; queuedSync: number; queuedNodes: number; runningNodes: number }> {
    this.assertReady();
    const index = await this.readRunIndex();
    let activeRuns = 0;
    let queuedNodes = 0;
    let runningNodes = 0;
    for (const entry of index.values()) {
      if (entry.state !== 'planned' && entry.state !== 'running') continue;
      activeRuns += 1;
      for (const node of await this.readNodes(entry.runId)) {
        if (node.state === 'queued' || node.state === 'ready') queuedNodes += 1;
        else if (node.state === 'running') runningNodes += 1;
      }
    }
    const queuedSync = (await this.readSyncEntries()).filter((entry) => SYNC_PENDING.has(entry.state)).length;
    return { activeRuns, queuedSync, queuedNodes, runningNodes };
  }

  async createRun(scope: ExecutionScope, input: CreateExecutionRunInput): Promise<ExecutionRunRecord> {
    this.assertReady();
    assertScope(scope);
    const objective = boundedText(input?.objective, 'objective');
    if (!Number.isInteger(input?.maxConcurrency) || input.maxConcurrency < 1 || input.maxConcurrency > 128) {
      fail('EXECUTION_CONCURRENCY_INVALID', 'maxConcurrency must be an integer between 1 and 128');
    }
    const continuityTaskId = optionalText(input.continuityTaskId, 'continuityTaskId');
    const originRouteContextId = optionalText(input.originRouteContextId, 'originRouteContextId');
    const metadataJson = stableExecutionJson(input.metadata ?? {});
    if (metadataJson.length > 20_000) fail('EXECUTION_METADATA_TOO_LARGE', 'metadata exceeds 20000 characters');
    const runId = randomUUID();
    const now = Date.now();
    const run: ExecutionRunRecord = {
      runId,
      principalId: scope.principalId,
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
      ...(continuityTaskId ? { continuityTaskId } : {}),
      ...(originRouteContextId ? { originRouteContextId } : {}),
      state: 'planned',
      objective,
      maxConcurrency: input.maxConcurrency,
      lastEventSequence: 0,
      metadata: JSON.parse(metadataJson) as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };
    await this.withLock(`run-${runId}`, async () => {
      await this.commit({
        writes: [{ path: this.runPath(runId), content: this.json(run) }],
        appends: [{ path: this.path('index', 'runs.jsonl'), line: JSON.stringify(this.indexEntry(run)) }],
      });
    });
    return run;
  }

  async persistGraph(scope: ExecutionScope, runId: string, nodes: ValidatedExecutionNode[]): Promise<void> {
    this.assertReady();
    const run = await this.requireRun(scope, runId);
    if (run.state !== 'planned') fail('EXECUTION_RUN_NOT_PLANNED', 'Graph can only be persisted while the run is planned');
    await this.writeNodes(run, nodes);
  }

  async appendGraphNodes(scope: ExecutionScope, runId: string, nodes: ValidatedExecutionNode[]): Promise<void> {
    this.assertReady();
    const run = await this.requireRun(scope, runId);
    if (run.state !== 'planned' && run.state !== 'running') {
      fail('EXECUTION_RUN_NOT_EXTENSIBLE', `Nodes can only be added while run is planned or running, not ${run.state}`);
    }
    if (nodes.length < 1) fail('EXECUTION_NODES_REQUIRED', 'At least one execution node is required');
    await this.writeNodes(run, nodes);
  }

  async getRun(scope: ExecutionScope, runId: string): Promise<ExecutionRunRecord | null> {
    this.assertReady();
    assertScope(scope);
    const normalizedRunId = boundedText(runId, 'runId', 5_000);
    // An ID that could never name a state directory simply does not exist, exactly as before.
    if (!SAFE_SEGMENT.test(normalizedRunId)) return null;
    const run = await this.readRun(normalizedRunId);
    if (!run) return null;
    if (run.principalId !== scope.principalId || (run.projectId ?? '') !== scopeProject(scope)) return null;
    return run;
  }

  async listRuns(scope: ExecutionScope, limit = 100): Promise<ExecutionRunRecord[]> {
    this.assertReady();
    assertScope(scope);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      fail('EXECUTION_LIMIT_INVALID', 'limit must be an integer between 1 and 1000');
    }
    const project = scopeProject(scope);
    const runs: ExecutionRunRecord[] = [];
    for (const entry of (await this.readRunIndex()).values()) {
      if (entry.principalId !== scope.principalId || entry.projectId !== project) continue;
      const run = await this.readRun(entry.runId);
      if (run) runs.push(run);
    }
    runs.sort((left, right) => right.updatedAt - left.updatedAt || left.runId.localeCompare(right.runId));
    return runs.slice(0, limit);
  }

  async getNodes(scope: ExecutionScope, runId: string): Promise<ExecutionNodeRecord[]> {
    this.assertReady();
    await this.requireRun(scope, runId);
    return this.readNodes(runId);
  }

  async getNode(scope: ExecutionScope, runId: string, nodeId: string): Promise<ExecutionNodeRecord | null> {
    const nodes = await this.getNodes(scope, runId);
    return nodes.find((node) => node.nodeId === nodeId) ?? null;
  }

  async bindWorkflow(scope: ExecutionScope, runId: string, binding?: import('./provenance.js').ExecutionWorkflowBinding, originRouteContextId?: string): Promise<void> {
    await this.requireRun(scope, runId);
    await this.withLock(`run-${runId}`, async () => {
      const run = await this.readRun(runId);
      if (!run) fail('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found');
      await this.commit({ writes: [{ path: this.runPath(runId), content: this.json({ ...run,
        ...(originRouteContextId ? { originRouteContextId } : {}),
        metadata: { ...run.metadata, ...(binding ? { workflowBinding: binding } : {}) } }) }] });
    });
  }

  async setRunState(scope: ExecutionScope, runId: string, state: ExecutionRunState): Promise<void> {
    const existing = await this.requireRun(scope, runId);
    if (existing.state === state) return;
    await this.withLock(`run-${runId}`, async () => {
      const run = await this.readRun(runId);
      if (!run) fail('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
      const now = Date.now();
      const terminal = RUN_TERMINAL.has(state);
      const next: ExecutionRunRecord = {
        ...run,
        state,
        ...(state === 'running' && run.startedAt === undefined ? { startedAt: now } : {}),
        updatedAt: now,
      };
      if (terminal) next.finishedAt = now;
      else delete next.finishedAt;
      const transaction: Transaction = {
        writes: [{ path: this.runPath(runId), content: this.json(next) }],
        appends: [{ path: this.path('index', 'runs.jsonl'), line: JSON.stringify(this.indexEntry(next)) }],
      };
      if (terminal) transaction.writes!.push(await this.checkpointWrite(next));
      await this.commit(transaction);
    });
  }

  async setNodeState(
    scope: ExecutionScope,
    runId: string,
    nodeId: string,
    state: ExecutionNodeState,
    lastError?: Record<string, unknown>,
  ): Promise<void> {
    await this.requireRun(scope, runId);
    await this.withLock(`run-${runId}`, async () => {
      const node = await this.readNode(runId, nodeId);
      if (!node) return;
      const now = Date.now();
      const next: ExecutionNodeRecord = {
        ...node,
        state,
        updatedAt: now,
        ...(state === 'running' && node.startedAt === undefined ? { startedAt: now } : {}),
      };
      if (lastError) next.lastError = lastError;
      else delete next.lastError;
      if (NODE_TERMINAL.has(state)) next.finishedAt = now;
      else delete next.finishedAt;
      const mutation = this.nodeMutation(next);
      await this.commit({ writes: [mutation.write], appends: [mutation.append] });
    });
  }

  async createAttempt(
    scope: ExecutionScope,
    runId: string,
    nodeId: string,
    attemptId: string,
    attemptNo: number,
    paths: ExecutionAttemptPaths,
  ): Promise<void> {
    await this.requireRun(scope, runId);
    await this.withLock(`run-${runId}`, async () => {
      const node = await this.readNode(runId, nodeId);
      if (!node) fail('EXECUTION_NODE_NOT_FOUND', 'Execution node was not found');
      if (attemptNo !== node.attemptCount + 1) fail('EXECUTION_ATTEMPT_SEQUENCE_INVALID', 'attemptNo must increment exactly by one');
      const now = Date.now();
      const attempt: StoredAttempt = {
        attemptId,
        runId,
        nodeId,
        attemptNo,
        state: 'running',
        stdoutPath: paths.stdoutPath,
        stderrPath: paths.stderrPath,
        resultPath: paths.resultPath,
        startedAt: now,
        stdoutBytes: 0,
        stderrBytes: 0,
      };
      const nextNode: ExecutionNodeRecord = {
        ...node,
        state: 'running',
        attemptCount: attemptNo,
        updatedAt: now,
        ...(node.startedAt === undefined ? { startedAt: now } : {}),
      };
      delete nextNode.finishedAt;
      delete nextNode.lastError;
      const mutation = this.nodeMutation(nextNode);
      await this.commit({
        writes: [{ path: this.attemptPath(runId, nodeId, attemptNo), content: this.json(attempt) }, mutation.write],
        appends: [mutation.append],
      });
    });
  }

  async setAttemptPid(
    scope: ExecutionScope,
    runId: string,
    nodeId: string,
    attemptNo: number,
    pid: number | null,
  ): Promise<void> {
    await this.requireRun(scope, runId);
    await this.withLock(`run-${runId}`, async () => {
      const attempt = await this.readAttempt(runId, nodeId, attemptNo);
      if (!attempt) return;
      const next: StoredAttempt = { ...attempt };
      if (pid === null) delete next.processPid;
      else next.processPid = pid;
      await this.commit({ writes: [{ path: this.attemptPath(runId, nodeId, attemptNo), content: this.json(next) }] });
    });
  }

  async completeAttempt(scope: ExecutionScope, marker: ExecutionResultMarker, options: { workflowPending?: boolean } = {}): Promise<void> {
    await this.requireRun(scope, marker.runId);
    const nodeState: ExecutionNodeState = marker.state;
    const error = marker.error
      ? { message: marker.error }
      : marker.state === 'failed'
        ? { exitCode: marker.exitCode, signal: marker.signal }
        : undefined;
    await this.withLock(`run-${marker.runId}`, async () => {
      const attempt = await this.readAttempt(marker.runId, marker.nodeId, marker.attemptNo);
      const node = await this.readNode(marker.runId, marker.nodeId);
      if (!attempt || !node || attempt.attemptId !== marker.attemptId || node.attemptCount !== marker.attemptNo) {
        fail('EXECUTION_RESULT_IDENTITY_MISMATCH', 'Result does not belong to the current node attempt');
      }
      if (attempt.state !== 'running' && (attempt.state !== marker.state
        || (attempt.stdoutSha256 !== undefined && attempt.stdoutSha256 !== marker.stdoutSha256)
        || (attempt.stderrSha256 !== undefined && attempt.stderrSha256 !== marker.stderrSha256))) {
        fail('EXECUTION_RESULT_CONFLICT', 'Terminal attempt evidence cannot be replaced with conflicting results');
      }
      const writes: Array<{ path: string; content: string }> = [];
      if (options.workflowPending && marker.state === 'succeeded' && marker.provenance?.sourceBound && marker.provenance.inputsStableDuringAttempt) {
        const run = (await this.readRun(marker.runId))!;
        const pending = executionWorkflowPending(run).filter(item => item.nodeId !== marker.nodeId);
        pending.push({ nodeId: marker.nodeId, attemptId: marker.attemptId, attemptNo: marker.attemptNo });
        writes.push({ path: this.runPath(marker.runId), content: this.json({ ...run, metadata: { ...run.metadata, workflowPendingAttempts: pending } }) });
      }
      if (attempt && attempt.attemptId === marker.attemptId) {
        const next: StoredAttempt = {
          ...attempt,
          state: marker.state,
          finishedAt: marker.finishedAt,
          stdoutBytes: marker.stdoutBytes,
          stderrBytes: marker.stderrBytes,
          stdoutSha256: marker.stdoutSha256,
          stderrSha256: marker.stderrSha256,
        };
        if (marker.exitCode === null) delete next.exitCode; else next.exitCode = marker.exitCode;
        if (marker.signal === null) delete next.signal; else next.signal = marker.signal;
        if (error) next.error = error; else delete next.error;
        writes.push({ path: this.attemptPath(marker.runId, marker.nodeId, marker.attemptNo), content: this.json(next) });
      }
      const appends: Array<{ path: string; line: string }> = [];
      if (node) {
        const nextNode: ExecutionNodeRecord = {
          ...node,
          state: nodeState,
          finishedAt: marker.finishedAt,
          updatedAt: marker.finishedAt,
        };
        if (error) nextNode.lastError = error; else delete nextNode.lastError;
        const mutation = this.nodeMutation(nextNode);
        writes.push(mutation.write);
        appends.push(mutation.append);
      }
      if (writes.length > 0) await this.commit({ writes, appends });
    });
  }

  async failAttemptStart(
    scope: ExecutionScope,
    runId: string,
    nodeId: string,
    attemptId: string,
    error: Error,
  ): Promise<void> {
    await this.requireRun(scope, runId);
    const payload = { message: error.message, name: error.name };
    await this.withLock(`run-${runId}`, async () => {
      const now = Date.now();
      const writes: Array<{ path: string; content: string }> = [];
      const located = await this.findAttemptById(runId, attemptId);
      if (!located || located.attempt.nodeId !== nodeId) fail('EXECUTION_RESULT_IDENTITY_MISMATCH', 'Failure does not match an existing node attempt');
      if (located.attempt.state !== 'running') return;
      if (located) {
        writes.push({
          path: located.path,
          content: this.json({ ...located.attempt, state: 'failed' as const, finishedAt: now, error: payload }),
        });
      }
      const appends: Array<{ path: string; line: string }> = [];
      const node = await this.readNode(runId, nodeId);
      if (node && node.attemptCount === located.attempt.attemptNo) {
        const mutation = this.nodeMutation({ ...node, state: 'failed', finishedAt: now, updatedAt: now, lastError: payload });
        writes.push(mutation.write);
        appends.push(mutation.append);
      }
      if (writes.length > 0) await this.commit({ writes, appends });
    });
  }

  async listAttempts(scope: ExecutionScope, runId: string, nodeId?: string): Promise<ExecutionAttemptRecord[]> {
    await this.requireRun(scope, runId);
    const attempts = await this.readAttempts(runId);
    return attempts
      .filter((attempt) => !nodeId || attempt.nodeId === nodeId)
      .map(({ parsedOutputs, ...record }) => { void parsedOutputs; return record; });
  }

  async persistParsedOutput(
    scope: ExecutionScope,
    marker: ExecutionResultMarker,
    parsed: ParsedExecutionOutput,
  ): Promise<void> {
    await this.requireRun(scope, marker.runId);
    if (parsed.nodeId !== marker.nodeId || parsed.attemptNo !== marker.attemptNo) {
      fail('EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH', 'Parsed output identity does not match terminal attempt');
    }
    if (parsed.source.stdoutSha256 !== marker.stdoutSha256 || parsed.source.stderrSha256 !== marker.stderrSha256
      || parsed.raw.stdoutBytes !== marker.stdoutBytes || parsed.raw.stderrBytes !== marker.stderrBytes
      || parsed.exitCode !== marker.exitCode) {
      fail('EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH', 'Parsed output does not describe the exact terminal source');
    }
    const binding = { runId: marker.runId, attemptId: marker.attemptId,
      ...(marker.provenance?.workflowBinding?.planHash ? { planHash: marker.provenance.workflowBinding.planHash } : {}),
      ...(marker.provenance?.workflowBinding?.planRevision ? { planRevision: marker.provenance.workflowBinding.planRevision } : {}),
    };
    const contractFailure = this.parsedOutputContractFailure(parsed, binding);
    if (contractFailure) fail(contractFailure, 'Parsed evidence metadata does not match its source coverage or attempt binding');
    const parsedJson = stableExecutionJson(parsed);
    if (parsedJson.length > 100_000) fail('EXECUTION_PARSED_OUTPUT_TOO_LARGE', 'Parsed execution output exceeds 100000 characters');
    await this.storeParsedOutput(marker, {
      parserVersion: parsed.parserVersion,
      status: 'available',
      sourceStdoutSha256: parsed.source.stdoutSha256,
      sourceStderrSha256: parsed.source.stderrSha256,
      parsed,
      confidence: parsed.confidence,
      createdAt: Date.now(),
    });
  }

  async persistParsedOutputFailure(
    scope: ExecutionScope,
    marker: ExecutionResultMarker,
    parserVersion: string,
    failureCode: string,
  ): Promise<void> {
    await this.requireRun(scope, marker.runId);
    const safeVersion = boundedText(parserVersion || 'unknown', 'parserVersion', 128);
    const safeCode = boundedText(failureCode || 'EXECUTION_OUTPUT_PARSE_FAILED', 'failureCode', 256)
      .replace(/[^A-Za-z0-9_.:-]/g, '_');
    await this.storeParsedOutput(marker, {
      parserVersion: safeVersion,
      status: 'degraded',
      sourceStdoutSha256: marker.stdoutSha256,
      sourceStderrSha256: marker.stderrSha256,
      failureCode: safeCode,
      createdAt: Date.now(),
    });
  }

  async getParsedOutput(
    scope: ExecutionScope,
    runId: string,
    nodeId: string,
    attemptNo: number,
  ): Promise<ExecutionParsedOutputView | null> {
    await this.requireRun(scope, runId);
    const attempt = await this.readAttempt(runId, nodeId, attemptNo);
    const latestByVersion = new Map<string, StoredParsedOutput>();
    for (const item of attempt?.parsedOutputs ?? []) latestByVersion.set(item.parserVersion, item);
    // A repaired observation supersedes older metadata from the same parser,
    // even when a persisted timestamp is corrupt or the system clock moved back.
    const stored = [...latestByVersion.values()].reverse()
      .sort((left, right) => right.createdAt - left.createdAt || right.parserVersion.localeCompare(left.parserVersion))[0];
    if (!stored) return null;
    if (attempt!.runId !== runId || attempt!.nodeId !== nodeId || attempt!.attemptNo !== attemptNo) {
      return { available: false, status: 'degraded', parserVersion: stored.parserVersion, failureCode: 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH' };
    }
    const invalid = this.parsedOutputReadFailure(attempt!, stored);
    if (invalid) return { available: false, status: 'degraded', parserVersion: stored.parserVersion, failureCode: invalid };
    if (stored.status === 'degraded') {
      return {
        available: false,
        status: 'degraded',
        parserVersion: stored.parserVersion,
        failureCode: stored.failureCode ?? 'EXECUTION_OUTPUT_PARSE_FAILED',
      };
    }
    if (!stored.parsed) return null;
    return {
      available: true,
      status: 'available',
      parserVersion: stored.parserVersion,
      confidence: stored.confidence ?? stored.parsed.confidence,
      source: {
        stdoutSha256: stored.sourceStdoutSha256 ?? stored.parsed.source.stdoutSha256,
        stderrSha256: stored.sourceStderrSha256 ?? stored.parsed.source.stderrSha256,
      },
      structured: stored.parsed.structured ?? {},
      coverageStatus: stored.parsed.coverage?.state ?? 'legacy_unknown',
      ...(stored.parsed.coverage ? { coverage: stored.parsed.coverage } : {}),
      ...(stored.parsed.projection ? { projection: stored.parsed.projection } : {}),
      ...(stored.parsed.binding ? { binding: stored.parsed.binding } : {}),
      ...(stored.parsed.rawAccess ? { rawAccess: stored.parsed.rawAccess } : {}),
    };
  }

  async listArtifactIndexCandidates(limit = 1000): Promise<Array<{
    principalId: string;
    projectId?: string;
    runId: string;
    nodeId: string;
    attemptNo: number;
  }>> {
    this.assertReady();
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
      fail('EXECUTION_ARTIFACT_RECONCILE_LIMIT_INVALID', 'artifact reconcile limit must be between 1 and 5000');
    }
    const out: Array<{ principalId: string; projectId?: string; runId: string; nodeId: string; attemptNo: number }> = [];
    for (const entry of [...(await this.readRunIndex()).values()].sort((left, right) => left.runId.localeCompare(right.runId))) {
      const nodes = new Map((await this.readNodes(entry.runId)).map((node) => [node.nodeId, node]));
      const indexed = new Set((await this.readRunArtifacts(entry.runId)).map(artifactKey));
      for (const attempt of await this.readAttempts(entry.runId)) {
        if (attempt.state !== 'succeeded') continue;
        const node = nodes.get(attempt.nodeId);
        if (!node || node.expectedArtifacts.length === 0) continue;
        if ([...indexed].some((key) => key.startsWith(`${attempt.nodeId}\u0000${attempt.attemptNo}\u0000`))) continue;
        out.push({
          principalId: entry.principalId,
          ...(entry.projectId ? { projectId: entry.projectId } : {}),
          runId: entry.runId,
          nodeId: attempt.nodeId,
          attemptNo: attempt.attemptNo,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async listRunsForRecovery(): Promise<ExecutionRunRecord[]> {
    this.assertReady();
    const runs: ExecutionRunRecord[] = [];
    for (const entry of (await this.readRunIndex()).values()) {
      if (entry.state !== 'running' && entry.state !== 'completed') continue;
      const run = await this.readRun(entry.runId);
      if (run?.state === 'running' || (run?.state === 'completed' && executionWorkflowPending(run).length > 0)) runs.push(run);
    }
    return runs.sort((a, b) => a.runId.localeCompare(b.runId));
  }

  async settleWorkflowAttempt(scope: ExecutionScope, marker: ExecutionResultMarker, error?: string, resumeState?: 'running' | 'completed'): Promise<void> {
    await this.requireRun(scope, marker.runId);
    await this.withLock(`run-${marker.runId}`, async () => {
      const run = (await this.readRun(marker.runId))!;
      const node = await this.readNode(marker.runId, marker.nodeId);
      const attempt = await this.readAttempt(marker.runId, marker.nodeId, marker.attemptNo);
      if (!node || node.attemptCount !== marker.attemptNo || attempt?.attemptId !== marker.attemptId || attempt.state !== 'succeeded') {
        fail('EXECUTION_RESULT_IDENTITY_MISMATCH', 'Pending workflow callback does not belong to the current successful attempt');
      }
      const pending = executionWorkflowPending(run).filter(item => item.nodeId !== marker.nodeId);
      if (error !== undefined) pending.push({ nodeId: marker.nodeId, attemptId: marker.attemptId, attemptNo: marker.attemptNo, error: error.slice(0, 2000) });
      const metadata = { ...run.metadata };
      if (pending.length) metadata.workflowPendingAttempts = pending;
      else delete metadata.workflowPendingAttempts;
      const next = { ...run, metadata };
      if (resumeState) {
        next.state = resumeState;
        next.updatedAt = Date.now();
        if (resumeState === 'completed') next.finishedAt = next.updatedAt;
        else delete next.finishedAt;
      }
      await this.commit({ writes: [{ path: this.runPath(marker.runId), content: this.json(next) }],
        ...(resumeState ? { appends: [{ path: this.path('index', 'runs.jsonl'), line: JSON.stringify(this.indexEntry(next)) }] } : {}) });
    });
  }

  async listRecoverableAttempts(): Promise<ExecutionRecoverableAttempt[]> {
    this.assertReady();
    const out: ExecutionRecoverableAttempt[] = [];
    for (const entry of [...(await this.readRunIndex()).values()].sort((left, right) => left.runId.localeCompare(right.runId))) {
      const run = await this.readRun(entry.runId);
      if (!run) continue;
      const nodes = new Map((await this.readNodes(entry.runId)).map((node) => [node.nodeId, node]));
      for (const attempt of await this.readAttempts(entry.runId)) {
        if (attempt.state !== 'running') continue;
        const node = nodes.get(attempt.nodeId);
        if (!node) continue;
        const { parsedOutputs, ...record } = attempt;
        void parsedOutputs;
        out.push({
          ...record,
          principalId: run.principalId,
          ...(run.projectId ? { projectId: run.projectId } : {}),
          runState: run.state,
          nodeState: node.state,
        });
      }
    }
    return out;
  }

  async markAttemptInterrupted(scope: ExecutionScope, runId: string, nodeId: string, attemptId: string, reason: string): Promise<void> {
    await this.requireRun(scope, runId);
    const payload = { reason: reason.slice(0, 2_000), recovery: true };
    await this.withLock(`run-${runId}`, async () => {
      const now = Date.now();
      const writes: Array<{ path: string; content: string }> = [];
      const located = await this.findAttemptById(runId, attemptId);
      if (located && located.attempt.nodeId === nodeId && located.attempt.state === 'running') {
        writes.push({
          path: located.path,
          content: this.json({ ...located.attempt, state: 'interrupted' as const, finishedAt: now, error: payload }),
        });
      }
      const appends: Array<{ path: string; line: string }> = [];
      const node = await this.readNode(runId, nodeId);
      if (node && node.state === 'running' && located?.attempt.nodeId === nodeId && node.attemptCount === located.attempt.attemptNo) {
        const mutation = this.nodeMutation({ ...node, state: 'interrupted', finishedAt: now, updatedAt: now, lastError: payload });
        writes.push(mutation.write);
        appends.push(mutation.append);
      }
      if (writes.length > 0) await this.commit({ writes, appends });
    });
  }

  async appendEvent(
    scope: ExecutionScope,
    runId: string,
    eventType: ExecutionEventType,
    options: { nodeId?: string; attemptId?: string; payload?: Record<string, unknown> } = {},
  ): Promise<ExecutionEventRecord> {
    await this.requireRun(scope, runId);
    const payloadJson = stableExecutionJson(options.payload ?? {});
    if (payloadJson.length > 20_000) fail('EXECUTION_EVENT_PAYLOAD_TOO_LARGE', 'Execution event payload exceeds 20000 characters');
    return this.withLock(`run-${runId}`, async () => {
      const run = await this.readRun(runId);
      if (!run) fail('EXECUTION_EVENT_PERSIST_FAILED', 'Execution run vanished before its event could be persisted');
      const createdAt = Date.now();
      const sequence = run.lastEventSequence + 1;
      const stored: StoredEvent = {
        runId,
        sequence,
        globalSequence: await this.nextGlobalSequence(),
        eventType,
        ...(options.nodeId ? { nodeId: options.nodeId } : {}),
        ...(options.attemptId ? { attemptId: options.attemptId } : {}),
        payload: JSON.parse(payloadJson) as Record<string, unknown>,
        payloadHash: sha256Hex(payloadJson),
        createdAt,
      };
      // Append first, materialise second: a crash between the two leaves the log ahead of run.json,
      // which is exactly the drift repairRuns() heals on the next open. No journal is needed.
      await appendLine(this.eventsPath(runId), JSON.stringify(stored));
      await writeAtomic(this.runPath(runId), this.json({ ...run, lastEventSequence: sequence, updatedAt: createdAt }));
      return eventRecord(stored);
    });
  }

  async getEvents(
    scope: ExecutionScope,
    runId: string,
    afterSequence = 0,
    filters?: ExecutionEventFilter,
    limit = 1000,
  ): Promise<ExecutionEventRecord[]> {
    await this.requireRun(scope, runId);
    if (!Number.isInteger(afterSequence) || afterSequence < 0) {
      fail('EXECUTION_EVENT_SEQUENCE_INVALID', 'afterSequence must be a non-negative integer');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) {
      fail('EXECUTION_EVENT_LIMIT_INVALID', 'event limit must be between 1 and 5000');
    }
    const eventTypes = new Set(filters?.eventTypes ?? []);
    const nodeIds = new Set(filters?.nodeIds ?? []);
    const out: ExecutionEventRecord[] = [];
    for (const stored of await readLines<StoredEvent>(this.eventsPath(runId))) {
      if (stored.sequence <= afterSequence) continue;
      if (eventTypes.size > 0 && !eventTypes.has(stored.eventType)) continue;
      if (nodeIds.size > 0 && (!stored.nodeId || !nodeIds.has(stored.nodeId))) continue;
      out.push(eventRecord(stored));
      if (out.length >= limit) break;
    }
    return out;
  }

  async recordArtifacts(
    scope: ExecutionScope,
    runId: string,
    nodeId: string,
    attemptNo: number,
    sourceResultRef: string,
    artifacts: NewExecutionArtifact[],
  ): Promise<ExecutionArtifactRecord[]> {
    await this.requireRun(scope, runId);
    if (artifacts.length === 0) return [];
    return this.withLock(`run-${runId}`, async () => {
      const existing = await this.readRunArtifacts(runId);
      const known = new Set(existing.map(artifactKey));
      const now = Date.now();
      const fresh: ExecutionArtifactRecord[] = [];
      for (const artifact of [...artifacts].sort((left, right) => left.path.localeCompare(right.path))) {
        const key = artifactKey({ nodeId, attemptNo, path: artifact.path });
        if (known.has(key)) continue;
        known.add(key);
        fresh.push({
          artifactId: randomUUID(),
          runId,
          nodeId,
          attemptNo,
          path: artifact.path,
          artifactType: artifact.artifactType,
          verification: 'verified',
          ...(artifact.sha256 ? { sha256: artifact.sha256 } : {}),
          ...(artifact.size === undefined ? {} : { size: artifact.size }),
          ...(artifact.modifiedAt === undefined ? {} : { modifiedAt: artifact.modifiedAt }),
          sourceResultRef,
          metadata: artifact.metadata ?? {},
          createdAt: now,
        });
      }
      if (fresh.length === 0) return [];
      await this.commit({
        appends: fresh.flatMap((record) => [
          { path: this.artifactsPath(runId), line: JSON.stringify(record) },
          { path: this.path('index', 'artifacts.jsonl'), line: JSON.stringify(record) },
        ]),
      });
      return fresh;
    });
  }

  async listArtifacts(scope: ExecutionScope, query: ExecutionArtifactQuery = {}): Promise<ExecutionArtifactRecord[]> {
    this.assertReady();
    assertScope(scope);
    const project = scopeProject(scope);
    const index = await this.readRunIndex();
    const source = query.runId
      ? await this.readRunArtifacts(query.runId)
      : await this.readArtifactIndex();
    const matched: ExecutionArtifactRecord[] = [];
    for (const artifact of source) {
      if (query.runId && artifact.runId !== query.runId) continue;
      if (query.nodeId && artifact.nodeId !== query.nodeId) continue;
      if (query.attemptNo !== undefined && artifact.attemptNo !== query.attemptNo) continue;
      if (query.sha256 && artifact.sha256 !== query.sha256) continue;
      if (query.artifactType && artifact.artifactType !== query.artifactType) continue;
      if (query.createdAtMax !== undefined && artifact.createdAt > query.createdAtMax) continue;
      const entry = index.get(artifact.runId);
      if (!entry || entry.principalId !== scope.principalId || entry.projectId !== project) continue;
      if (query.terminalRunsOnly && !RUN_TERMINAL.has(entry.state)) continue;
      matched.push(artifact);
    }
    const oldestFirst = query.order === 'oldest';
    matched.sort((left, right) => (oldestFirst ? left.createdAt - right.createdAt : right.createdAt - left.createdAt)
      || left.artifactId.localeCompare(right.artifactId));
    return query.limit === undefined ? matched : matched.slice(0, query.limit);
  }

  async enqueueMemorySync(
    scope: ExecutionScope,
    runId: string,
    eventSequence: number | undefined,
    syncKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.requireRun(scope, runId);
    const normalizedKey = boundedText(syncKey, 'syncKey', 5_000);
    const payloadJson = stableExecutionJson(payload);
    if (payloadJson.length > 50_000) fail('EXECUTION_SYNC_PAYLOAD_TOO_LARGE', 'Execution memory sync payload exceeds 50000 characters');
    const target = this.syncPath(normalizedKey);
    await this.withLock('sync', async () => {
      if (await readJson<StoredSyncEntry>(target)) return;
      const now = Date.now();
      const entry: StoredSyncEntry = {
        queueId: randomUUID(),
        runId,
        ...(eventSequence === undefined ? {} : { eventSequence }),
        syncKey: normalizedKey,
        payload: JSON.parse(payloadJson) as Record<string, unknown>,
        state: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      };
      await this.commit({ writes: [{ path: target, content: this.json(entry) }] });
    });
  }

  async listMemorySyncQueue(scope: ExecutionScope, limit = 100): Promise<ExecutionMemorySyncRecord[]> {
    this.assertReady();
    assertScope(scope);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      fail('EXECUTION_SYNC_LIMIT_INVALID', 'sync queue limit must be between 1 and 1000');
    }
    return (await this.scopedSyncEntries(scope))
      .sort((left, right) => left.createdAt - right.createdAt || left.queueId.localeCompare(right.queueId))
      .slice(0, limit) as ExecutionMemorySyncRecord[];
  }

  async countMemorySyncQueue(scope: ExecutionScope): Promise<number> {
    this.assertReady();
    assertScope(scope);
    return (await this.scopedSyncEntries(scope)).length;
  }

  async markMemorySyncState(
    scope: ExecutionScope,
    queueId: string,
    state: 'syncing' | 'synced' | 'failed',
    error?: string,
  ): Promise<void> {
    this.assertReady();
    assertScope(scope);
    const project = scopeProject(scope);
    const index = await this.readRunIndex();
    await this.withLock('sync', async () => {
      for (const name of await listDir(this.path('state', 'sync'))) {
        const target = path.join(this.path('state', 'sync'), name);
        const entry = await readJson<StoredSyncEntry>(target);
        if (!entry || entry.queueId !== queueId) continue;
        const run = index.get(entry.runId);
        if (!run || run.principalId !== scope.principalId || run.projectId !== project) return;
        const next: StoredSyncEntry = { ...entry, state, attempts: entry.attempts + 1, updatedAt: Date.now() };
        if (error) next.lastError = error.slice(0, 2_000);
        else delete next.lastError;
        await this.commit({ writes: [{ path: target, content: this.json(next) }] });
        return;
      }
    });
  }

  async resetNodeForRetry(scope: ExecutionScope, runId: string, nodeId: string): Promise<void> {
    await this.requireRun(scope, runId);
    await this.withLock(`run-${runId}`, async () => {
      const run = await this.readRun(runId);
      const node = await this.readNode(runId, nodeId);
      if (!run) fail('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
      if (!node) fail('EXECUTION_NODE_NOT_FOUND', 'Execution node was not found');
      if (!['failed', 'interrupted', 'cancelled'].includes(node.state) && !(node.state === 'blocked' && node.lastError?.reason === 'dispatch_guard')) {
        fail('EXECUTION_RETRY_NOT_ALLOWED', `Node ${nodeId} is not retryable from state ${node.state}`);
      }
      const now = Date.now();
      const requeue = (target: ExecutionNodeRecord) => {
        const next: ExecutionNodeRecord = { ...target, state: 'queued', updatedAt: now };
        delete next.lastError;
        delete next.finishedAt;
        return this.nodeMutation(next);
      };
      const mutations = [requeue(node)];
      for (const blocked of await this.readNodes(runId)) {
        if (blocked.state === 'blocked' && blocked.nodeId !== nodeId) mutations.push(requeue(blocked));
      }
      const nextRun: ExecutionRunRecord = { ...run, state: 'running', updatedAt: now };
      delete nextRun.finishedAt;
      await this.commit({
        writes: [...mutations.map((mutation) => mutation.write), { path: this.runPath(runId), content: this.json(nextRun) }],
        appends: [
          ...mutations.map((mutation) => mutation.append),
          { path: this.path('index', 'runs.jsonl'), line: JSON.stringify(this.indexEntry(nextRun)) },
        ],
      });
    });
  }

  // --- internals -------------------------------------------------------------------------------

  private path(...segments: string[]): string {
    return path.join(this.root, ...segments);
  }

  private runDir(runId: string): string {
    return this.path('state', 'runs', safeSegment(runId, 'runId'));
  }

  private runPath(runId: string): string {
    return path.join(this.runDir(runId), 'run.json');
  }

  private nodePath(runId: string, nodeId: string): string {
    return path.join(this.runDir(runId), 'nodes', `${safeSegment(nodeId, 'nodeId')}.json`);
  }

  private nodeIndexPath(runId: string): string {
    return path.join(this.runDir(runId), 'nodes.index.jsonl');
  }

  /**
   * One node file per node stays the observable materialised state; the per-run append-only node
   * manifest written in the same transaction is what makes reading a whole graph a single read.
   */
  private nodeMutation(node: ExecutionNodeRecord): { write: { path: string; content: string }; append: { path: string; line: string } } {
    return {
      write: { path: this.nodePath(node.runId, node.nodeId), content: this.json(node) },
      append: { path: this.nodeIndexPath(node.runId), line: JSON.stringify(node) },
    };
  }

  private attemptPath(runId: string, nodeId: string, attemptNo: number): string {
    return path.join(this.runDir(runId), 'attempts', safeSegment(nodeId, 'nodeId'), `${String(attemptNo).padStart(3, '0')}.json`);
  }

  private eventsPath(runId: string): string {
    return this.path('events', `${safeSegment(runId, 'runId')}.jsonl`);
  }

  private artifactsPath(runId: string): string {
    return this.path('artifacts', `${safeSegment(runId, 'runId')}.jsonl`);
  }

  private syncPath(syncKey: string): string {
    return this.path('state', 'sync', `${sha256Hex(syncKey)}.json`);
  }

  private json(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  private indexEntry(run: ExecutionRunRecord): RunIndexEntry {
    return {
      runId: run.runId,
      principalId: run.principalId,
      projectId: run.projectId ?? '',
      state: run.state,
      ...(run.continuityTaskId ? { continuityTaskId: run.continuityTaskId } : {}),
      createdAt: run.createdAt,
    };
  }

  private async checkpointWrite(run: ExecutionRunRecord): Promise<{ path: string; content: string }> {
    const nodes = await this.readNodes(run.runId);
    const body = {
      runId: run.runId,
      state: run.state,
      lastEventSequence: run.lastEventSequence,
      nodes: nodes.map((node) => ({ nodeId: node.nodeId, state: node.state, attemptCount: node.attemptCount })),
      checkpointedAt: Date.now(),
    };
    return {
      path: this.path('checkpoints', `${safeSegment(run.runId, 'runId')}.json`),
      content: this.json({ ...body, contentHash: sha256Hex(stableExecutionJson({ ...body, checkpointedAt: 0 })) }),
    };
  }

  private async writeNodes(run: ExecutionRunRecord, nodes: ValidatedExecutionNode[]): Promise<void> {
    const now = Date.now();
    await this.withLock(`run-${run.runId}`, async () => {
      const mutations = nodes.map((node) => this.nodeMutation({
        runId: run.runId,
        nodeId: node.id,
        purpose: node.purpose,
        command: node.command,
        cwd: node.cwd,
        state: 'queued',
        timeoutMs: node.timeoutMs,
        expectedArtifacts: node.expectedArtifacts ?? [],
        stepIds: node.stepIds ?? [],
        ...(node.resources ? { resources: node.resources } : {}),
        ...(node.inputs ? { inputs: node.inputs } : {}),
        ...(node.toolchain ? { toolchain: node.toolchain } : {}),
        attemptCount: 0,
        dependsOn: [...node.dependsOn].sort((left, right) => left.localeCompare(right)),
        createdAt: now,
        updatedAt: now,
      }));
      const current = (await this.readRun(run.runId)) ?? run;
      await this.commit({
        writes: [...mutations.map((mutation) => mutation.write), await this.checkpointWrite(current)],
        appends: mutations.map((mutation) => mutation.append),
      });
    });
  }

  private async storeParsedOutput(marker: ExecutionResultMarker, entry: StoredParsedOutput): Promise<void> {
    await this.withLock(`run-${marker.runId}`, async () => {
      const attempt = await this.readAttempt(marker.runId, marker.nodeId, marker.attemptNo);
      if (!attempt || attempt.attemptId !== marker.attemptId) {
        fail('EXECUTION_ATTEMPT_NOT_FOUND', 'Execution attempt was not found for parsed output');
      }
      if (attempt.runId !== marker.runId || attempt.nodeId !== marker.nodeId || attempt.attemptNo !== marker.attemptNo
        || attempt.state === 'running' || attempt.state !== marker.state
        || attempt.stdoutSha256 !== marker.stdoutSha256 || attempt.stderrSha256 !== marker.stderrSha256
        || attempt.stdoutBytes !== marker.stdoutBytes || attempt.stderrBytes !== marker.stderrBytes
        || (attempt.exitCode ?? null) !== marker.exitCode) {
        fail('EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH', 'Parsed evidence requires the matching persisted terminal attempt');
      }
      if (marker.provenance && (marker.provenance.runId !== marker.runId || marker.provenance.nodeId !== marker.nodeId
        || marker.provenance.attemptId !== marker.attemptId || marker.provenance.attemptNo !== marker.attemptNo)) {
        fail('EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH', 'Terminal provenance belongs to another attempt');
      }
      entry = { ...entry, markerBinding: { runId: marker.runId, attemptId: marker.attemptId,
        ...(marker.provenance?.workflowBinding?.planHash ? { planHash: marker.provenance.workflowBinding.planHash } : {}),
        ...(marker.provenance?.workflowBinding?.planRevision ? { planRevision: marker.provenance.workflowBinding.planRevision } : {}),
      } };
      const parsedOutputs = attempt.parsedOutputs ?? [];
      const prior = [...parsedOutputs].reverse().find(item => item.parserVersion === entry.parserVersion);
      // Invalid derived metadata cannot block recapture from the validated terminal source.
      // Append the repaired observation and retain the invalid record as history.
      if (prior && !this.parsedOutputReadFailure(attempt, prior)) {
        if (prior.status === 'available') {
          if (entry.status === 'degraded') return; // A later observer failure cannot erase a valid projection.
          if (stableExecutionJson(prior.parsed) !== stableExecutionJson(entry.parsed)) {
            fail('EXECUTION_PARSED_OUTPUT_CONFLICT', 'A successful parser version already has different derived evidence');
          }
          return;
        }
        if (entry.status === 'degraded' && prior.failureCode === entry.failureCode) return;
      }
      await this.commit({
        writes: [{
          path: this.attemptPath(marker.runId, marker.nodeId, marker.attemptNo),
          content: this.json({ ...attempt, parsedOutputs: [...parsedOutputs, entry] }),
        }],
      });
    });
  }

  private parsedOutputReadFailure(attempt: StoredAttempt, stored: StoredParsedOutput): string | undefined {
    if (attempt.state === 'running' || !attempt.stdoutSha256 || !attempt.stderrSha256
      || (stored.sourceStdoutSha256 ?? stored.parsed?.source?.stdoutSha256) !== attempt.stdoutSha256
      || (stored.sourceStderrSha256 ?? stored.parsed?.source?.stderrSha256) !== attempt.stderrSha256) {
      return 'EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH';
    }
    if (stored.markerBinding && (stored.markerBinding.runId !== attempt.runId || stored.markerBinding.attemptId !== attempt.attemptId)) {
      return 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH';
    }
    const parsed = stored.parsed;
    if (stored.status !== 'available') return undefined;
    if (!parsed) return 'EXECUTION_PARSED_OUTPUT_INVALID';
    if (parsed.nodeId !== attempt.nodeId || parsed.attemptNo !== attempt.attemptNo || parsed.parserVersion !== stored.parserVersion) return 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH';
    if (parsed.source?.stdoutSha256 !== attempt.stdoutSha256 || parsed.source?.stderrSha256 !== attempt.stderrSha256
      || parsed.raw?.stdoutBytes !== attempt.stdoutBytes || parsed.raw?.stderrBytes !== attempt.stderrBytes
      || parsed.exitCode !== (attempt.exitCode ?? null)) return 'EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH';
    if (parsed.binding && !stored.markerBinding) return 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH';
    return this.parsedOutputContractFailure(parsed, stored.markerBinding ?? { runId: attempt.runId, attemptId: attempt.attemptId });
  }

  private parsedOutputContractFailure(parsed: ParsedExecutionOutput, binding: NonNullable<StoredParsedOutput['markerBinding']>): string | undefined {
    if (parsed.binding && (parsed.binding.runId !== binding.runId || parsed.binding.attemptId !== binding.attemptId
      || parsed.binding.planHash !== binding.planHash || parsed.binding.planRevision !== binding.planRevision)) {
      return 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH';
    }
    const rawAccess = parsed.rawAccess;
    if (rawAccess && (rawAccess.tool !== 'execution_logs' || rawAccess.requiresRouteContext !== true
      || rawAccess.runId !== binding.runId || rawAccess.nodeId !== parsed.nodeId
      || rawAccess.attemptId !== binding.attemptId || rawAccess.attemptNo !== parsed.attemptNo)) {
      return 'EXECUTION_PARSED_OUTPUT_IDENTITY_MISMATCH';
    }
    const coverage = parsed.coverage;
    if (!coverage) return undefined;
    if (coverage.version !== 1 || coverage.integrity !== 'verified' || !['complete', 'partial'].includes(coverage.state)) {
      return 'EXECUTION_PARSED_OUTPUT_COVERAGE_INVALID';
    }
    let complete = true;
    for (const stream of ['stdout', 'stderr'] as const) {
      const item = coverage.streams?.[stream], total = parsed.raw[stream === 'stdout' ? 'stdoutBytes' : 'stderrBytes'];
      if (!item || !['full', 'head_tail'].includes(item.strategy) || item.totalBytes !== total
        || ![item.totalBytes, item.examinedBytes, item.omittedBytes].every(value => Number.isSafeInteger(value) && value >= 0)
        || item.examinedBytes + item.omittedBytes !== total || !Array.isArray(item.ranges)
        || item.ranges.length > (item.strategy === 'full' ? 1 : 2)) return 'EXECUTION_PARSED_OUTPUT_COVERAGE_INVALID';
      let cursor = 0, examined = 0;
      for (const range of item.ranges) {
        if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)
          || range.start < cursor || range.end < range.start || range.end > total) return 'EXECUTION_PARSED_OUTPUT_COVERAGE_INVALID';
        cursor = range.end; examined += range.end - range.start;
      }
      if (examined !== item.examinedBytes || item.strategy === 'full' && item.omittedBytes !== 0) return 'EXECUTION_PARSED_OUTPUT_COVERAGE_INVALID';
      complete &&= item.omittedBytes === 0;
    }
    return (coverage.state === 'complete') !== complete ? 'EXECUTION_PARSED_OUTPUT_COVERAGE_INVALID' : undefined;
  }

  private async scopedSyncEntries(scope: ExecutionScope): Promise<StoredSyncEntry[]> {
    const project = scopeProject(scope);
    const index = await this.readRunIndex();
    return (await this.readSyncEntries()).filter((entry) => {
      if (!SYNC_PENDING.has(entry.state)) return false;
      const run = index.get(entry.runId);
      return Boolean(run && run.principalId === scope.principalId && run.projectId === project);
    });
  }

  private async readSyncEntries(): Promise<StoredSyncEntry[]> {
    const directory = this.path('state', 'sync');
    const out: StoredSyncEntry[] = [];
    for (const name of await listDir(directory)) {
      if (!name.endsWith('.json')) continue;
      const entry = await readJson<StoredSyncEntry>(path.join(directory, name));
      if (entry) out.push(entry);
    }
    return out;
  }

  private async readRun(runId: string): Promise<ExecutionRunRecord | null> {
    return readJson<ExecutionRunRecord>(this.runPath(runId));
  }

  private async readNodes(runId: string): Promise<ExecutionNodeRecord[]> {
    const lines = await readLines<ExecutionNodeRecord>(this.nodeIndexPath(runId));
    if (lines.length === 0) return this.rebuildNodeIndex(runId);
    const byId = new Map<string, ExecutionNodeRecord>();
    for (const node of lines) byId.set(node.nodeId, this.normalizeNode(node));
    const nodes = [...byId.values()].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    if (lines.length > byId.size * 8 + 32) {
      await writeAtomic(this.nodeIndexPath(runId), `${nodes.map((node) => JSON.stringify(node)).join('\n')}\n`).catch(() => undefined);
    }
    return nodes;
  }

  private async readNodeFiles(runId: string): Promise<ExecutionNodeRecord[]> {
    const directory = path.join(this.runDir(runId), 'nodes');
    const out: ExecutionNodeRecord[] = [];
    for (const name of await listDir(directory)) {
      if (!name.endsWith('.json')) continue;
      const node = await readJson<ExecutionNodeRecord>(path.join(directory, name));
      if (node) out.push(this.normalizeNode(node));
    }
    return out.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  }

  private async rebuildNodeIndex(runId: string): Promise<ExecutionNodeRecord[]> {
    const nodes = await this.readNodeFiles(runId);
    if (nodes.length > 0) {
      await writeAtomic(this.nodeIndexPath(runId), `${nodes.map((node) => JSON.stringify(node)).join('\n')}\n`).catch(() => undefined);
    }
    return nodes;
  }

  private async readNode(runId: string, nodeId: string): Promise<ExecutionNodeRecord | null> {
    const node = await readJson<ExecutionNodeRecord>(this.nodePath(runId, nodeId));
    return node ? this.normalizeNode(node) : null;
  }

  /** Additive reader migration keeps historical files and markers intact. */
  private normalizeNode(raw: ExecutionNodeRecord): ExecutionNodeRecord {
    const { continueOnFailure: _legacy, ...node } = raw as ExecutionNodeRecord & { continueOnFailure?: boolean };
    void _legacy;
    return { ...node, expectedArtifacts: node.expectedArtifacts ?? [], stepIds: node.stepIds ?? [] };
  }

  private async readAttempt(runId: string, nodeId: string, attemptNo: number): Promise<StoredAttempt | null> {
    return readJson<StoredAttempt>(this.attemptPath(runId, nodeId, attemptNo));
  }

  private async readAttempts(runId: string): Promise<StoredAttempt[]> {
    const root = path.join(this.runDir(runId), 'attempts');
    const out: StoredAttempt[] = [];
    for (const nodeDirectory of await listDir(root)) {
      for (const name of await listDir(path.join(root, nodeDirectory))) {
        if (!name.endsWith('.json')) continue;
        const attempt = await readJson<StoredAttempt>(path.join(root, nodeDirectory, name));
        if (attempt) out.push(attempt);
      }
    }
    return out.sort((left, right) => left.nodeId.localeCompare(right.nodeId) || left.attemptNo - right.attemptNo);
  }

  private async findAttemptById(runId: string, attemptId: string): Promise<{ attempt: StoredAttempt; path: string } | null> {
    for (const attempt of await this.readAttempts(runId)) {
      if (attempt.attemptId === attemptId) {
        return { attempt, path: this.attemptPath(runId, attempt.nodeId, attempt.attemptNo) };
      }
    }
    return null;
  }

  /** First write wins per (run, node, attempt, path) - the append log keeps the original entry. */
  private async readRunArtifacts(runId: string): Promise<ExecutionArtifactRecord[]> {
    const seen = new Set<string>();
    const out: ExecutionArtifactRecord[] = [];
    for (const artifact of await readLines<ExecutionArtifactRecord>(this.artifactsPath(runId))) {
      const key = artifactKey(artifact);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(artifact);
    }
    return out;
  }

  private async readArtifactIndex(): Promise<ExecutionArtifactRecord[]> {
    const seen = new Set<string>();
    const out: ExecutionArtifactRecord[] = [];
    for (const artifact of await readLines<ExecutionArtifactRecord>(this.path('index', 'artifacts.jsonl'))) {
      const key = `${artifact.runId}\u0000${artifactKey(artifact)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(artifact);
    }
    return out;
  }

  /** Last line wins, so the manifest stays append-only while still reporting current run facts. */
  private async readRunIndex(): Promise<Map<string, RunIndexEntry>> {
    const index = new Map<string, RunIndexEntry>();
    for (const entry of await readLines<RunIndexEntry>(this.path('index', 'runs.jsonl'))) {
      index.set(entry.runId, entry);
    }
    return index;
  }

  /**
   * Global sequence numbers are handed out from a reserved block, so the shared counter is touched
   * once per block instead of once per event. A crash abandons the rest of the block: the sequence
   * stays strictly increasing, which is all any reader relies on.
   */
  private async nextGlobalSequence(): Promise<number> {
    if (this.globalSequence < this.globalSequenceCeiling) {
      this.globalSequence += 1;
      return this.globalSequence;
    }
    return this.withLock('sequence', async () => {
      const target = this.path('index', 'sequence.json');
      const current = await readJson<{ globalSequence: number }>(target);
      const base = Number.isSafeInteger(current?.globalSequence) ? Number(current!.globalSequence) : 0;
      const reserved = Math.max(base, this.globalSequenceCeiling) + GLOBAL_SEQUENCE_BLOCK;
      await writeAtomic(target, this.json({ globalSequence: reserved }));
      this.globalSequence = reserved - GLOBAL_SEQUENCE_BLOCK + 1;
      this.globalSequenceCeiling = reserved;
      return this.globalSequence;
    });
  }

  private async requireRun(scope: ExecutionScope, runId: string): Promise<ExecutionRunRecord> {
    this.assertReady();
    assertScope(scope);
    const run = await this.getRun(scope, runId);
    if (!run) fail('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    return run;
  }

  private assertReady(): void {
    if (!this.opened || this.closed) fail('EXECUTION_STORE_NOT_OPEN', 'Execution store is not open');
  }

  // --- transaction journal ---------------------------------------------------------------------

  /**
   * A single atomic rename is already all-or-nothing, so only genuinely multi-file transactions pay
   * for a journal entry.
   */
  private async commit(transaction: Transaction): Promise<void> {
    const parts = (transaction.writes?.length ?? 0) + (transaction.appends?.length ?? 0) + (transaction.removes?.length ?? 0);
    if (parts <= 1) {
      await this.applyTransaction(transaction, false);
      return;
    }
    const id = randomUUID();
    const journalPath = this.path('journal', `${id}.json`);
    await writeAtomic(journalPath, `${JSON.stringify({ id, createdAt: Date.now(), ...transaction })}\n`, true);
    await this.applyTransaction(transaction, false);
    await rm(journalPath, { force: true });
  }

  private async applyTransaction(transaction: Transaction, replay: boolean): Promise<void> {
    const writes = transaction.writes ?? [];
    const targets = writes.map(write => {
      const target = path.resolve(write.path);
      return process.platform === 'win32' ? target.toLowerCase() : target;
    });
    if (new Set(targets).size !== writes.length) {
      // Historical transactions can replace one target more than once. Their
      // original write order determines the final value and must stay serial.
      for (const write of writes) await writeAtomic(write.path, write.content);
    } else {
      for (let offset = 0; offset < writes.length; offset += TRANSACTION_WRITE_CONCURRENCY) {
        // commit() has already synced the recovery journal. Drain every started
        // write before throwing, so no write outlives the transaction's lock.
        const settled = await Promise.allSettled(writes.slice(offset, offset + TRANSACTION_WRITE_CONCURRENCY)
          .map(write => writeAtomic(write.path, write.content)));
        const failed = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failed) throw failed.reason;
      }
    }
    for (const append of transaction.appends ?? []) {
      // Appends are not idempotent, so a replay re-checks the log before re-adding a line. Event
      // sequences are strictly increasing; the other logs are de-duplicated by their readers.
      if (replay && append.guardSequence !== undefined) {
        const existing = await readLines<{ sequence?: number }>(append.path);
        const last = existing[existing.length - 1];
        if (last && Number(last.sequence) >= append.guardSequence) continue;
      }
      await appendLine(append.path, append.line);
    }
    for (const target of transaction.removes ?? []) await rm(target, { force: true });
  }

  private async replayJournals(): Promise<number> {
    const directory = this.path('journal');
    let recovered = 0;
    for (const name of await listDir(directory)) {
      if (!name.endsWith('.json')) continue;
      const journalPath = path.join(directory, name);
      let transaction: Transaction | null;
      try {
        transaction = await readJson<Transaction>(journalPath);
      } catch (error) {
        fail(
          'EXECUTION_STATE_JOURNAL_CORRUPT',
          `Execution transaction journal is unreadable: ${journalPath}`,
          { path: journalPath, cause: error instanceof Error ? error.message : String(error) },
        );
      }
      if (!transaction) continue;
      await this.applyTransaction(transaction, true);
      await rm(journalPath, { force: true });
      recovered += 1;
    }
    return recovered;
  }

  /** The run manifest is derived state: rebuild it whenever it no longer covers the run bodies. */
  private async rebuildRunIndex(): Promise<void> {
    const stored = await listDir(this.path('state', 'runs'));
    if (stored.length === 0) return;
    if ((await this.readRunIndex()).size >= stored.length) return;
    const lines: string[] = [];
    for (const name of stored) {
      const run = await readJson<ExecutionRunRecord>(path.join(this.path('state', 'runs'), name, 'run.json'));
      if (run) lines.push(JSON.stringify(this.indexEntry(run)));
    }
    await writeAtomic(this.path('index', 'runs.jsonl'), lines.length === 0 ? '' : `${lines.join('\n')}\n`, true);
  }

  /**
   * Materialised run state is derived from the event log, so an interrupted commit can leave
   * run.json behind its own events. Heal it truthfully rather than reporting a stale sequence.
   */
  private async repairRuns(): Promise<string[]> {
    const repaired: string[] = [];
    const index = await this.readRunIndex();
    if (index.size === 0) return repaired;
    for (const entry of index.values()) {
      const run = await this.readRun(entry.runId);
      if (!run) continue;
      const events = await readLines<StoredEvent>(this.eventsPath(entry.runId));
      const lastSequence = events.length === 0 ? 0 : Number(events[events.length - 1]!.sequence);
      if (!Number.isSafeInteger(lastSequence) || lastSequence <= run.lastEventSequence) continue;
      await writeAtomic(this.runPath(entry.runId), this.json({ ...run, lastEventSequence: lastSequence, updatedAt: Date.now() }));
      repaired.push(entry.runId);
    }
    return repaired;
  }

  // --- owner-token locking ---------------------------------------------------------------------

  private withLock<T>(name: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(name) ?? Promise.resolve();
    const next = previous.then(() => this.withFileLock(name, task), () => this.withFileLock(name, task));
    const settled = next.then(() => undefined, () => undefined);
    this.chains.set(name, settled);
    void settled.then(() => { if (this.chains.get(name) === settled) this.chains.delete(name); });
    return next;
  }

  private async withFileLock<T>(name: string, task: () => Promise<T>): Promise<T> {
    const lockPath = this.path('journal', 'locks', `${lockName(name)}.lock`);
    const token = randomUUID();
    const deadline = Date.now() + this.lockTimeoutMs;
    for (let attempt = 0; ; attempt += 1) {
      try {
        await writeFile(lockPath, JSON.stringify({ pid: process.pid, token, acquiredAt: Date.now() } satisfies LockRecord), { encoding: 'utf8', flag: 'wx' });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (await this.clearStaleLock(lockPath)) continue;
        if (Date.now() >= deadline) {
          fail('EXECUTION_STATE_LOCK_TIMEOUT', `Execution state lock '${name}' is held by another owner`, { lock: name });
        }
        await delay(Math.min(25, 2 + attempt));
      }
    }
    try {
      return await task();
    } finally {
      const holder = await readJson<LockRecord>(lockPath).catch(() => null);
      if (!holder || holder.token === token) await rm(lockPath, { force: true }).catch(() => undefined);
    }
  }

  private async clearStaleLock(lockPath: string): Promise<boolean> {
    let record: LockRecord | null = null;
    try {
      record = JSON.parse(await readFile(lockPath, 'utf8')) as LockRecord;
    } catch (error) {
      if (isMissing(error)) return true;
      // A lock file that is present but not yet readable belongs to an owner mid-acquire; only an
      // old unreadable file is genuinely abandoned.
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs < 1_000) return false;
    }
    const stale = !record
      || !Number.isSafeInteger(record.pid)
      || !pidAlive(record.pid)
      || Date.now() - Number(record.acquiredAt) > this.lockTimeoutMs * 4;
    if (!stale) return false;
    await rm(lockPath, { force: true }).catch(() => undefined);
    return true;
  }
}
