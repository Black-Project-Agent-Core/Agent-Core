import type { IncomingMessage, ServerResponse } from 'node:http';
import * as z from 'zod/v4';
import { CodespaceSharedMemoryError, CodespaceSharedMemoryService } from '../memory/codespace-shared-memory.js';
import { MemoryHardLifecycleError } from '../memory/hard-lifecycle.js';
import {
  MEMORY_REMEMBER_MORE_DEFAULTS,
  MEMORY_REMEMBER_MORE_LIMITS,
  MEMORY_REMEMBER_MORE_REASONS,
} from '../memory/types.js';
import type { RuntimeServices } from '../runtime/services.js';
import { WorkspaceProjectError } from '../runtime/workspace.js';

const MAX_BODY_BYTES = 256 * 1024;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error('CODESPACE_SHARED_MEMORY_BODY_TOO_LARGE');
    chunks.push(buffer);
  }
  if (total === 0) throw new Error('CODESPACE_SHARED_MEMORY_BODY_REQUIRED');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new Error('CODESPACE_SHARED_MEMORY_JSON_INVALID');
  }
}

const workspaceRoot = z.string().min(1).max(4096);
const memoryId = z.string().uuid();
const contextId = z.string().uuid();
const routeContextId = z.string().uuid();
const continuityTaskId = z.string().uuid();
const continuityTurnId = z.string().uuid();
const evidenceType = z.enum(['tool', 'file', 'test', 'log', 'hash', 'health']);
const checkpointStatus = z.enum(['running', 'blocked', 'deferred', 'completed', 'failed', 'cancelled', 'interrupted']);

const continuityCapture = z.object({
  objective: z.string().max(20_000).optional(),
  acceptanceCriteria: z.array(z.string().max(20_000)).max(50).optional(),
  constraints: z.array(z.string().max(20_000)).max(50).optional(),
  parentTaskId: z.string().max(5_000).optional(),
  resumeTaskId: z.string().max(5_000).optional(),
}).strict();

const statusSchema = z.object({ action: z.literal('status'), workspaceRoot }).strict();
const openContextSchema = z.object({
  action: z.literal('open_context'),
  workspaceRoot,
  task: z.string().min(1).max(20_000),
  context: z.string().max(20_000).optional(),
  continuity: continuityCapture.optional(),
  ttlMs: z.number().int().min(60_000).max(60 * 60_000).optional(),
}).strict();
const searchSchema = z.object({
  action: z.literal('search'),
  workspaceRoot,
  query: z.string().min(1).max(20_000),
  includeHistory: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  characterBudget: z.number().int().min(1).max(50_000).optional(),
}).strict();
const getSchema = z.object({ action: z.literal('get'), workspaceRoot, memoryId }).strict();
const explainSchema = z.object({
  action: z.literal('explain'), workspaceRoot, memoryId, query: z.string().min(1).max(20_000).optional(),
}).strict();
const rememberMoreSchema = z.object({
  action: z.literal('remember_more'),
  workspaceRoot,
  contextId,
  seedMemoryIds: z.array(memoryId).min(1).max(MEMORY_REMEMBER_MORE_LIMITS.seedMemoryIds),
  reason: z.enum(MEMORY_REMEMBER_MORE_REASONS),
  maxHops: z.number().int().min(1).max(MEMORY_REMEMBER_MORE_LIMITS.maxHops).optional(),
  maxItems: z.number().int().min(1).max(MEMORY_REMEMBER_MORE_LIMITS.maxItems).optional(),
  characterBudget: z.number().int().min(1).max(MEMORY_REMEMBER_MORE_LIMITS.characterBudget).optional(),
}).strict();
const checkpointSchema = z.object({
  action: z.literal('checkpoint'),
  workspaceRoot,
  routeContextId,
  memoryContextId: contextId,
  continuityTaskId,
  continuityTurnId,
  status: checkpointStatus,
  summary: z.string().min(1).max(20_000),
  evidence: z.array(z.object({
    type: evidenceType,
    ref: z.string().min(1).max(5_000),
    result: z.string().max(20_000).optional(),
  }).strict()).max(100).optional(),
  decisions: z.array(z.object({
    key: z.string().min(1).max(5_000),
    value: z.string().min(1).max(20_000),
    reason: z.string().min(1).max(20_000),
  }).strict()).max(100).optional(),
  artifacts: z.array(z.object({
    path: z.string().min(1).max(5_000),
    role: z.string().min(1).max(5_000),
    hash: z.string().max(5_000).optional(),
  }).strict()).max(100).optional(),
  outcomes: z.array(z.object({
    key: z.string().min(1).max(5_000),
    value: z.string().min(1).max(20_000),
    evidenceRefs: z.array(z.string().min(1).max(5_000)).min(1).max(100),
  }).strict()).max(100).optional(),
  constraints: z.array(z.object({
    key: z.string().min(1).max(5_000),
    value: z.string().min(1).max(20_000),
    reason: z.string().min(1).max(20_000),
    enforcement: z.enum(['soft', 'hard']),
  }).strict()).max(100).optional(),
  blockers: z.array(z.object({
    code: z.string().min(1).max(5_000),
    detail: z.string().min(1).max(20_000),
  }).strict()).max(100).optional(),
  deferred: z.array(z.object({
    title: z.string().min(1).max(5_000),
    reason: z.string().min(1).max(20_000),
  }).strict()).max(100).optional(),
  nextCandidates: z.array(z.object({
    title: z.string().min(1).max(5_000),
    rationale: z.string().min(1).max(20_000),
    dependsOnTaskIds: z.array(z.string().min(1).max(5_000)).max(128).optional(),
    priority: z.number().finite().optional(),
  }).strict()).max(5).optional(),
  projectTerminal: z.boolean().optional(),
}).strict();

function validationError(response: ServerResponse): void {
  sendJson(response, 400, { error: 'CODESPACE_SHARED_MEMORY_REQUEST_INVALID' });
}

function serviceError(response: ServerResponse, error: unknown): void {
  if (error instanceof WorkspaceProjectError) {
    sendJson(response, 403, { error: 'CODESPACE_SHARED_MEMORY_WORKSPACE_REJECTED' });
    return;
  }
  if (error instanceof MemoryHardLifecycleError) {
    sendJson(response, 428, { error: error.code });
    return;
  }
  if (error instanceof CodespaceSharedMemoryError) {
    if (error.code === 'CODESPACE_SHARED_MEMORY_PRINCIPAL_REQUIRED') {
      sendJson(response, 503, { error: error.code });
      return;
    }
    if (error.code === 'MEMORY_NOT_FOUND') {
      sendJson(response, 404, { error: error.code });
      return;
    }
    sendJson(response, 400, { error: error.code });
    return;
  }
  sendJson(response, 503, { error: 'CODESPACE_SHARED_MEMORY_UNAVAILABLE' });
}

export function createCodespaceSharedMemoryHttpHandler(runtime: RuntimeServices) {
  const shared = new CodespaceSharedMemoryService(runtime.memory, runtime.workspace);
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }

    let raw: unknown;
    try {
      raw = await readJson(request);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'CODESPACE_SHARED_MEMORY_REQUEST_INVALID';
      sendJson(response, code === 'CODESPACE_SHARED_MEMORY_BODY_TOO_LARGE' ? 413 : 400, { error: code });
      return;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      validationError(response);
      return;
    }
    const action = (raw as Record<string, unknown>).action;
    if (typeof action !== 'string' || !['status', 'open_context', 'search', 'get', 'explain', 'remember_more', 'checkpoint'].includes(action)) {
      sendJson(response, 400, { error: 'CODESPACE_SHARED_MEMORY_ACTION_INVALID' });
      return;
    }

    try {
      let result: unknown;
      switch (action) {
        case 'status': {
          const input = statusSchema.safeParse(raw);
          if (!input.success) return validationError(response);
          result = await shared.status(input.data.workspaceRoot);
          break;
        }
        case 'open_context': {
          const input = openContextSchema.safeParse(raw);
          if (!input.success) return validationError(response);
          result = await shared.openContext(input.data);
          break;
        }
        case 'search': {
          const input = searchSchema.safeParse(raw);
          if (!input.success) return validationError(response);
          result = await shared.search(input.data);
          break;
        }
        case 'get': {
          const input = getSchema.safeParse(raw);
          if (!input.success) return validationError(response);
          result = await shared.get(input.data.workspaceRoot, input.data.memoryId);
          break;
        }
        case 'explain': {
          const input = explainSchema.safeParse(raw);
          if (!input.success) return validationError(response);
          result = await shared.explain(input.data.workspaceRoot, input.data.memoryId, input.data.query);
          break;
        }
        case 'remember_more': {
          const input = rememberMoreSchema.safeParse(raw);
          if (!input.success) return validationError(response);
          result = await shared.rememberMore({
            ...input.data,
            maxHops: input.data.maxHops ?? MEMORY_REMEMBER_MORE_DEFAULTS.maxHops,
            maxItems: input.data.maxItems ?? MEMORY_REMEMBER_MORE_DEFAULTS.maxItems,
            characterBudget: input.data.characterBudget ?? MEMORY_REMEMBER_MORE_DEFAULTS.characterBudget,
          });
          break;
        }
        case 'checkpoint': {
          const input = checkpointSchema.safeParse(raw);
          if (!input.success) return validationError(response);
          result = await shared.checkpoint(input.data);
          break;
        }
      }
      sendJson(response, 200, { ok: true, result });
    } catch (error) {
      serviceError(response, error);
    }
  };
}
