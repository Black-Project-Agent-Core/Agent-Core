import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MemoryObservatoryConfig } from '../config.js';
import type { MemoryService } from '../memory/service.js';
import type { MemoryPersistenceDecisionType, MemoryRelation, MemoryScope } from '../memory/types.js';
import type { AuditJournal, AuditJournalRecord, AuditJson } from '../observability/audit-journal.js';
import { replayAuditRecords } from '../observability/audit-stream.js';
import type { WorkspacePolicy } from '../runtime/workspace.js';

export interface MemoryObservatoryHttpDependencies {
  memory: MemoryService;
  workspace: WorkspacePolicy;
  auditJournal: AuditJournal;
  config: MemoryObservatoryConfig;
}

type ActivityCategory = 'memory' | 'continuity' | 'tool' | 'execution' | 'routing' | 'remote' | 'http' | 'system';
type ActivityState = 'started' | 'completed' | 'failed' | 'pending';

interface SafeActivity {
  sequence: number;
  timestamp: string;
  category: ActivityCategory;
  event: string;
  state?: ActivityState;
  requestId?: string;
  traceId?: string;
  routeContextId?: string;
  toolName?: string;
  runId?: string;
  executionNodeId?: string;
  memoryIds?: string[];
  relation?: MemoryRelation;
  decisionType?: MemoryPersistenceDecisionType;
  reasonCodes?: string[];
  statusCode?: string;
  durationMs?: number;
}

const BASE = '/internal/memory-observatory';
const ACTIVITY_CATEGORIES = new Set<ActivityCategory>([
  'memory', 'continuity', 'tool', 'execution', 'routing', 'remote', 'http', 'system',
]);
const ACTIVITY_STATES = new Set<ActivityState>(['started', 'completed', 'failed', 'pending']);
const DECISIONS = new Set<MemoryPersistenceDecisionType>([
  'NO_DURABLE_MEMORY', 'REVISE_EXISTING', 'LINK_EXISTING', 'WRITE_BRANCH', 'WRITE_NEW_ROOT', 'OPEN_CONFLICT',
]);
const MAX_ID_CHARS = 256;
const MAX_CODE_CHARS = 160;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

function stringValue(value: AuditJson | undefined, max = MAX_CODE_CHARS): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined;
}

function stringArray(value: AuditJson | undefined, maxItems: number, maxChars = MAX_CODE_CHARS): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .slice(0, maxItems)
    .filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= maxChars);
  return result.length > 0 ? result : undefined;
}

function numberValue(value: AuditJson | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function safeActivity(record: AuditJournalRecord): SafeActivity | null {
  const category = ACTIVITY_CATEGORIES.has(record.category as ActivityCategory)
    ? record.category as ActivityCategory
    : 'system';
  const stateRaw = stringValue(record.data.state, 32) as ActivityState | undefined;
  const relation = stringValue(record.data.relation, 80) as MemoryRelation | undefined;
  const decision = stringValue(record.data.decisionType, 80) as MemoryPersistenceDecisionType | undefined;
  const activity: SafeActivity = {
    sequence: record.sequence,
    timestamp: record.timestamp,
    category,
    event: record.event,
    ...(stateRaw && ACTIVITY_STATES.has(stateRaw) ? { state: stateRaw } : {}),
    ...(record.requestId ? { requestId: record.requestId } : {}),
    ...(record.trace_id ? { traceId: record.trace_id } : {}),
    ...(record.routeContextId ? { routeContextId: record.routeContextId } : {}),
    ...(record.toolName ? { toolName: record.toolName } : {}),
    ...(record.runId ? { runId: record.runId } : {}),
    ...(record.nodeId ? { executionNodeId: record.nodeId } : {}),
  };
  const memoryIds = stringArray(record.data.memoryIds, 64, MAX_ID_CHARS);
  const reasonCodes = stringArray(record.data.reasonCodes, 32, MAX_CODE_CHARS);
  const statusCode = stringValue(record.data.statusCode, MAX_CODE_CHARS);
  const durationMs = numberValue(record.data.durationMs);
  if (memoryIds) activity.memoryIds = memoryIds;
  if (relation) activity.relation = relation;
  if (decision && DECISIONS.has(decision)) activity.decisionType = decision;
  if (reasonCodes) activity.reasonCodes = reasonCodes;
  if (statusCode) activity.statusCode = statusCode;
  if (durationMs !== undefined) activity.durationMs = durationMs;
  return activity;
}

function parseNonNegativeInteger(value: string | null | undefined, fallback: number, code: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function resolveScope(dependencies: MemoryObservatoryHttpDependencies): MemoryScope {
  const principalId = dependencies.memory.config.principalId?.trim();
  if (!principalId) throw Object.assign(new Error('Stable memory principal is unavailable'), { code: 'OBSERVATORY_PRINCIPAL_UNAVAILABLE' });
  let projectId: string;
  try {
    projectId = dependencies.workspace.resolveProjectRoot();
  } catch {
    throw Object.assign(new Error('A unique server-owned workspace scope is unavailable'), { code: 'OBSERVATORY_SCOPE_UNAVAILABLE' });
  }
  return { principalId, projectId };
}

function activityReplayLimit(url: URL, config: MemoryObservatoryConfig): number {
  const requested = parseNonNegativeInteger(url.searchParams.get('limit'), config.recentActivityLimit, 'OBSERVATORY_ACTIVITY_LIMIT_INVALID');
  if (requested < 1 || requested > config.recentActivityLimit) throw new Error('OBSERVATORY_ACTIVITY_LIMIT_INVALID');
  return requested;
}

function writeSse(response: ServerResponse, event: string, data: unknown, id?: number): void {
  if (response.destroyed || response.writableEnded) return;
  if (id !== undefined) response.write(`id: ${id}\n`);
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function stableAuditReplay(
  auditJournal: AuditJournal,
  afterSequence: number,
  limit: number,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = auditJournal.status();
    if (before.sequence === 0) {
      return { ok: true as const, records: [], earliestSequence: 1, latestSequence: 0 };
    }
    try {
      return await replayAuditRecords(auditJournal.auditRoot, { afterSequence, limit });
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      const after = auditJournal.status();
      const movedDuringReplay = after.sequence !== before.sequence || after.queueDepth > 0;
      if (!code.includes('AUDIT_HEAD_MISMATCH') || !movedDuringReplay || attempt === 2) throw error;
      await auditJournal.drain();
    }
  }
  throw new Error('AUDIT_REPLAY_STABILITY_EXHAUSTED');
}

async function streamActivity(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: MemoryObservatoryHttpDependencies,
  url: URL,
): Promise<void> {
  let afterSequence: number;
  try {
    const header = Array.isArray(request.headers['last-event-id'])
      ? request.headers['last-event-id'][0]
      : request.headers['last-event-id'];
    afterSequence = parseNonNegativeInteger(header ?? url.searchParams.get('after'), 0, 'OBSERVATORY_ACTIVITY_SEQUENCE_INVALID');
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : 'OBSERVATORY_ACTIVITY_SEQUENCE_INVALID' });
    return;
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  response.flushHeaders?.();

  let closed = false;
  let replayReady = false;
  let lastDelivered = afterSequence;
  const queued: AuditJournalRecord[] = [];
  const subscription = dependencies.auditJournal.subscribe((record) => {
    if (closed || record.sequence <= lastDelivered) return;
    if (!replayReady) {
      queued.push(record);
      return;
    }
    const activity = safeActivity(record);
    if (!activity) return;
    lastDelivered = record.sequence;
    writeSse(response, 'activity', activity, record.sequence);
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;
    subscription.close();
  };
  request.once('aborted', cleanup);
  response.once('close', cleanup);

  try {
    const replay = await stableAuditReplay(dependencies.auditJournal, afterSequence, 2_000);
    if (!replay.ok) {
      writeSse(response, 'stream.gap', {
        code: replay.code,
        earliestSequence: replay.earliestSequence,
        latestSequence: replay.latestSequence,
        requiresSnapshotResync: true,
      });
      cleanup();
      response.end();
      return;
    }
    for (const record of replay.records) {
      if (record.sequence <= lastDelivered) continue;
      const activity = safeActivity(record);
      if (!activity) continue;
      lastDelivered = record.sequence;
      writeSse(response, 'activity', activity, record.sequence);
    }
    replayReady = true;
    queued.sort((left, right) => left.sequence - right.sequence);
    for (const record of queued) {
      if (record.sequence <= lastDelivered) continue;
      const activity = safeActivity(record);
      if (!activity) continue;
      lastDelivered = record.sequence;
      writeSse(response, 'activity', activity, record.sequence);
    }
    queued.length = 0;

    await new Promise<void>((resolve) => {
      if (closed) return resolve();
      const finish = () => resolve();
      request.once('aborted', finish);
      response.once('close', finish);
    });
  } catch {
    cleanup();
    if (!response.writableEnded) response.end();
  }
}

export function createMemoryObservatoryHttpHandler(dependencies: MemoryObservatoryHttpDependencies) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (!dependencies.config.enabled) {
      sendJson(response, 404, { error: 'observatory_unavailable' });
      return;
    }
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'observatory_read_only' });
      return;
    }

    const url = new URL(request.url ?? BASE, 'http://127.0.0.1');
    const route = url.pathname;
    if (route === `${BASE}/health`) {
      sendJson(response, 200, {
        status: 'ok',
        mode: dependencies.config.mode,
        auditSequence: dependencies.auditJournal.status().sequence,
      });
      return;
    }

    let scope: MemoryScope;
    try {
      scope = resolveScope(dependencies);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
      sendJson(response, 503, { error: code === 'OBSERVATORY_PRINCIPAL_UNAVAILABLE' ? 'observatory_principal_unavailable' : 'observatory_scope_unavailable' });
      return;
    }

    if (route === `${BASE}/snapshot`) {
      const snapshot = await dependencies.memory.observatorySnapshot({
        scope,
        maxNodes: dependencies.config.maxNodes,
        maxEdges: dependencies.config.maxEdges,
      });
      sendJson(response, 200, { ...snapshot, auditSequence: dependencies.auditJournal.status().sequence });
      return;
    }

    if (route.startsWith(`${BASE}/node/`)) {
      let memoryId: string;
      try { memoryId = decodeURIComponent(route.slice(`${BASE}/node/`.length)); }
      catch { return sendJson(response, 400, { error: 'observatory_memory_id_invalid' }); }
      if (!memoryId || memoryId.length > MAX_ID_CHARS || memoryId.includes('/')) {
        sendJson(response, 400, { error: 'observatory_memory_id_invalid' });
        return;
      }
      const detail = await dependencies.memory.observatoryNode(scope, memoryId);
      if (!detail) {
        sendJson(response, 404, { error: 'memory_not_found' });
        return;
      }
      sendJson(response, 200, detail);
      return;
    }

    if (route === `${BASE}/activity`) {
      try {
        const afterSequence = parseNonNegativeInteger(url.searchParams.get('after'), 0, 'OBSERVATORY_ACTIVITY_SEQUENCE_INVALID');
        const limit = activityReplayLimit(url, dependencies.config);
        const replay = await stableAuditReplay(dependencies.auditJournal, afterSequence, limit);
        if (!replay.ok) {
          sendJson(response, 409, {
            error: replay.code,
            earliestSequence: replay.earliestSequence,
            latestSequence: replay.latestSequence,
            requiresSnapshotResync: true,
          });
          return;
        }
        sendJson(response, 200, {
          records: replay.records.map(safeActivity).filter((item): item is SafeActivity => item !== null),
          earliestSequence: replay.earliestSequence,
          latestSequence: replay.latestSequence,
        });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : 'OBSERVATORY_ACTIVITY_REQUEST_INVALID' });
      }
      return;
    }

    if (route === `${BASE}/stream`) {
      await streamActivity(request, response, dependencies, url);
      return;
    }

    sendJson(response, 404, { error: 'observatory_not_found' });
  };
}
