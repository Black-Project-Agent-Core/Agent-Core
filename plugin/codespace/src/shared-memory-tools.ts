import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import type { CodespaceSharedMemoryClient } from './shared-memory.js';

export const CODESPACE_SHARED_MEMORY_TOOL_NAMES = [
  'memory_status',
  'memory_open_context',
  'memory_search',
  'memory_get',
  'memory_explain',
  'memory_remember_more',
  'memory_checkpoint',
] as const;

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const record = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : {};
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      error: {
        code: typeof record.code === 'string' ? record.code : 'SHARED_MEMORY_ERROR',
        message: typeof record.message === 'string' ? record.message : 'Codespace shared-memory request failed.',
      },
    }, null, 2) }],
    isError: true as const,
  };
}

async function guarded(operation: () => Promise<unknown>) {
  try { return textResult(await operation()); }
  catch (error) { return errorResult(error); }
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const contextAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
const checkpointAnnotations = contextAnnotations;

const continuityCaptureSchema = z.object({
  objective: z.string().max(20_000).optional(),
  acceptanceCriteria: z.array(z.string().max(20_000)).max(50).optional(),
  constraints: z.array(z.string().max(20_000)).max(50).optional(),
  parentTaskId: z.string().max(5_000).optional(),
  resumeTaskId: z.string().max(5_000).optional(),
}).strict();
const rememberReason = z.enum([
  'causal_history',
  'revision_history',
  'failure_history',
  'branch_history',
  'conflict_history',
  'user_requested',
]);
const checkpointStatus = z.enum(['running', 'blocked', 'deferred', 'completed', 'failed', 'cancelled', 'interrupted']);
const evidenceType = z.enum(['tool', 'file', 'test', 'log', 'hash', 'health']);

export function registerCodespaceSharedMemoryTools(
  server: McpServer,
  client: CodespaceSharedMemoryClient,
  workspaceRoot: string,
): void {
  server.registerTool('memory_status', {
    title: 'Shared Memory Status',
    description: 'Inspect the shared Agent Core memory/continuity health for this exact Codespace workspace.',
    annotations: readOnlyAnnotations,
  }, async () => guarded(() => client.status(workspaceRoot)));

  server.registerTool('memory_open_context', {
    title: 'Open Shared Memory Context',
    description: 'Open an Agent Core memory/continuity context for this Codespace task, recall relevant memory, and return the opaque memoryContextLease required by meaningful workspace mutations.',
    inputSchema: {
      task: z.string().min(1).max(20_000),
      context: z.string().max(20_000).optional(),
      continuity: continuityCaptureSchema.optional(),
      ttlMs: z.number().int().min(60_000).max(60 * 60_000).optional(),
    },
    annotations: contextAnnotations,
  }, async ({ task, context, continuity, ttlMs }) => guarded(() => client.openContext(workspaceRoot, {
    task,
    ...(context !== undefined ? { context } : {}),
    ...(continuity !== undefined ? { continuity } : {}),
    ...(ttlMs !== undefined ? { ttlMs } : {}),
  })));

  server.registerTool('memory_search', {
    title: 'Search Shared Memory',
    description: 'Search the same bounded Agent Core memory scope used by direct Agent Core sessions for this workspace.',
    inputSchema: {
      query: z.string().min(1).max(20_000),
      includeHistory: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(24),
      characterBudget: z.number().int().min(1).max(50_000).optional(),
    },
    annotations: readOnlyAnnotations,
  }, async ({ query, includeHistory, limit, characterBudget }) => guarded(() => client.search(workspaceRoot, {
    query,
    includeHistory,
    limit,
    ...(characterBudget !== undefined ? { characterBudget } : {}),
  })));

  server.registerTool('memory_get', {
    title: 'Get Shared Memory',
    description: 'Get one shared Agent Core memory with safe provenance and revision history.',
    inputSchema: { memoryId: z.string().uuid() },
    annotations: readOnlyAnnotations,
  }, async ({ memoryId }) => guarded(() => client.get(workspaceRoot, memoryId)));

  server.registerTool('memory_explain', {
    title: 'Explain Shared Memory',
    description: 'Explain one shared Agent Core memory with graph/revision/provenance evidence and optional query scoring.',
    inputSchema: {
      memoryId: z.string().uuid(),
      query: z.string().min(1).max(20_000).optional(),
    },
    annotations: readOnlyAnnotations,
  }, async ({ memoryId, query }) => guarded(() => client.explain(workspaceRoot, memoryId, query)));

  server.registerTool('memory_remember_more', {
    title: 'Remember More Shared History',
    description: 'Expand bounded causal/revision/failure/branch/conflict history only from memories already recalled into the active Agent Core memory context.',
    inputSchema: {
      contextId: z.string().uuid(),
      seedMemoryIds: z.array(z.string().uuid()).min(1).max(16),
      reason: rememberReason,
      maxHops: z.number().int().min(1).max(4).default(2),
      maxItems: z.number().int().min(1).max(16).default(4),
      characterBudget: z.number().int().min(1).max(20_000).default(6000),
    },
    annotations: readOnlyAnnotations,
  }, async ({ contextId, seedMemoryIds, reason, maxHops, maxItems, characterBudget }) => guarded(() => client.rememberMore(workspaceRoot, {
    contextId, seedMemoryIds, reason, maxHops, maxItems, characterBudget,
  })));

  server.registerTool('memory_checkpoint', {
    title: 'Checkpoint Shared Memory',
    description: 'Persist factual task evidence through Agent Core continuity/cognition, close the memory lifecycle when appropriate, and cross the configured remote durability boundary.',
    inputSchema: {
      routeContextId: z.string().uuid(),
      memoryContextId: z.string().uuid(),
      continuityTaskId: z.string().uuid(),
      continuityTurnId: z.string().uuid(),
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
    },
    annotations: checkpointAnnotations,
  }, async (input) => guarded(() => client.checkpoint(workspaceRoot, input)));
}
