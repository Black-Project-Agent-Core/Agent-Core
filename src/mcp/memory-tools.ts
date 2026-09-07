import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import { MEMORY_ANCHOR_TYPES } from '../memory/anchors.js';
import {
  MEMORY_ENFORCEMENTS,
  MEMORY_KINDS,
  MEMORY_RELATIONS,
  MEMORY_REMEMBER_MORE_DEFAULTS,
  MEMORY_REMEMBER_MORE_LIMITS,
  MEMORY_REMEMBER_MORE_REASONS,
  type MemoryCommitRequest,
  type MemoryScope,
} from '../memory/types.js';
import type { RuntimeServices } from '../runtime/services.js';
import { resolvedMemoryProjectScope } from './project-scope.js';

export const MEMORY_TOOL_NAMES = [
  'memory_status',
  'memory_search',
  'memory_get',
  'memory_commit',
  'memory_revise',
  'memory_forget',
  'memory_explain',
  'memory_export',
  'memory_remember_more',
] as const;

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: { ...(code ? { code } : {}), message } }, null, 2) }],
    isError: true as const,
  };
}

async function guarded<T>(operation: () => Promise<T>) {
  try {
    return textResult(await operation());
  } catch (error) {
    return errorResult(error);
  }
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
const forgetAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const memoryKind = z.enum(MEMORY_KINDS);
const memoryEnforcement = z.enum(MEMORY_ENFORCEMENTS);
const memoryRelation = z.enum(MEMORY_RELATIONS);
const memoryAnchorType = z.enum(MEMORY_ANCHOR_TYPES);
const memoryRememberMoreReason = z.enum(MEMORY_REMEMBER_MORE_REASONS);
const jsonValue = z.union([
  z.string().max(50_000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()).max(1000),
  z.record(z.string(), z.unknown()),
]);
const optionalScope = {
  routeContextId: z.string().uuid().optional(),
  threadId: z.string().min(1).max(1000).optional(),
  resourceId: z.string().min(1).max(1000).optional(),
};

function scope(
  runtime: RuntimeServices,
  key: VerifiedKey,
  value: { routeContextId?: string; threadId?: string; resourceId?: string },
): MemoryScope {
  const project = resolvedMemoryProjectScope(runtime, key, value.routeContextId);
  return {
    ...project,
    ...(value.threadId ? { threadId: value.threadId } : {}),
    ...(value.resourceId ? { resourceId: value.resourceId } : {}),
  };
}

export function registerMemoryTools(server: McpServer, runtime: RuntimeServices, key: VerifiedKey): void {
  server.registerTool('memory_status', {
    title: 'Memory Status',
    description: 'Report deterministic memory DB/schema health and principal/project-scoped counts.',
    inputSchema: { routeContextId: z.string().uuid().optional() },
    annotations: readOnlyAnnotations,
  }, async ({ routeContextId }) => guarded(() => runtime.memory.status(scope(runtime, key, { routeContextId }))));

  server.registerTool('memory_search', {
    title: 'Memory Search',
    description: 'Deterministically recall principal/project-scoped memory with bounded filters and scoring explanation.',
    inputSchema: {
      query: z.string().min(1).max(20_000),
      includeHistory: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(24),
      characterBudget: z.number().int().min(1).max(50_000).optional(),
      ...optionalScope,
    },
    annotations: readOnlyAnnotations,
  }, async ({ query, includeHistory, limit, characterBudget, routeContextId, threadId, resourceId }) => guarded(() => runtime.memory.search({
    scope: scope(runtime, key, { routeContextId, threadId, resourceId }),
    query,
    includeHistory,
    limit,
    characterBudget,
  })));

  server.registerTool('memory_remember_more', {
    title: 'Memory Remember More',
    description: 'Expand bounded historical context only from memories already recalled into the authenticated memory context.',
    inputSchema: {
      contextId: z.string().uuid(),
      seedMemoryIds: z.array(z.string().uuid()).min(1).max(MEMORY_REMEMBER_MORE_LIMITS.seedMemoryIds),
      reason: memoryRememberMoreReason,
      maxHops: z.number().int().min(1).max(MEMORY_REMEMBER_MORE_LIMITS.maxHops).default(MEMORY_REMEMBER_MORE_DEFAULTS.maxHops),
      maxItems: z.number().int().min(1).max(MEMORY_REMEMBER_MORE_LIMITS.maxItems).default(MEMORY_REMEMBER_MORE_DEFAULTS.maxItems),
      characterBudget: z.number().int().min(1).max(MEMORY_REMEMBER_MORE_LIMITS.characterBudget).default(MEMORY_REMEMBER_MORE_DEFAULTS.characterBudget),
      ...optionalScope,
    },
    annotations: readOnlyAnnotations,
  }, async ({ contextId, seedMemoryIds, reason, maxHops, maxItems, characterBudget, routeContextId, threadId, resourceId }) => guarded(() => runtime.memory.rememberMore({
    scope: scope(runtime, key, { routeContextId, threadId, resourceId }),
    contextId,
    seedMemoryIds,
    reason,
    maxHops,
    maxItems,
    characterBudget,
  })));

  server.registerTool('memory_get', {
    title: 'Memory Get',
    description: 'Return one memory with its revision chain and safe source-event provenance.',
    inputSchema: {
      memoryId: z.string().uuid(),
      ...optionalScope,
    },
    annotations: readOnlyAnnotations,
  }, async ({ memoryId, routeContextId, threadId, resourceId }) => guarded(async () => {
    const result = await runtime.memory.getWithProvenance(scope(runtime, key, { routeContextId, threadId, resourceId }), memoryId);
    if (!result) throw new Error('MEMORY_NOT_FOUND');
    return result;
  }));

  server.registerTool('memory_commit', {
    title: 'Memory Commit',
    description: 'Commit one explicit structured semantic memory using the authenticated principal and current project scope.',
    inputSchema: {
      canonicalKey: z.string().min(1).max(1000),
      kind: memoryKind,
      value: jsonValue,
      importance: z.number().min(0).max(1).optional(),
      pinned: z.boolean().optional(),
      enforcement: memoryEnforcement.optional(),
      sourceType: z.string().min(1).max(500).optional(),
      sourceRef: z.string().min(1).max(2000).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      explicitAnchors: z.array(z.object({
        type: memoryAnchorType,
        value: z.string().min(1).max(5_000),
      })).max(128).optional(),
      explicitRelations: z.array(z.object({
        targetMemoryId: z.string().uuid(),
        relation: memoryRelation,
        weight: z.number().min(0).max(1).optional(),
      })).max(100).optional(),
      ...optionalScope,
    },
    annotations: writeAnnotations,
  }, async ({ canonicalKey, kind, value, importance, pinned, enforcement, sourceType, sourceRef, metadata, explicitAnchors, explicitRelations, routeContextId, threadId, resourceId }) => guarded(() => runtime.memory.commit({
    scope: scope(runtime, key, { routeContextId, threadId, resourceId }),
    canonicalKey,
    kind,
    value: value as MemoryCommitRequest['value'],
    importance,
    pinned,
    enforcement,
    sourceType: sourceType ?? 'primary_ai',
    sourceRef,
    metadata,
    explicitAnchors,
    explicitRelations,
  })));

  server.registerTool('memory_revise', {
    title: 'Memory Revise',
    description: 'Create an explicit new revision of an existing mutable canonical memory owned by the authenticated principal.',
    inputSchema: {
      memoryId: z.string().uuid(),
      value: jsonValue,
      sourceType: z.string().min(1).max(500).optional(),
      sourceRef: z.string().min(1).max(2000).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      ...optionalScope,
    },
    annotations: writeAnnotations,
  }, async ({ memoryId, value, sourceType, sourceRef, metadata, routeContextId, threadId, resourceId }) => guarded(() => runtime.memory.revise({
    scope: scope(runtime, key, { routeContextId, threadId, resourceId }),
    memoryId,
    value: value as MemoryCommitRequest['value'],
    sourceType: sourceType ?? 'primary_ai',
    sourceRef,
    metadata,
  })));

  server.registerTool('memory_forget', {
    title: 'Memory Forget',
    description: 'Soft-forget one owned memory by tombstoning it from active recall. This tool never physically purges evidence.',
    inputSchema: {
      memoryId: z.string().uuid(),
      reason: z.string().min(1).max(5000),
      ...optionalScope,
    },
    annotations: forgetAnnotations,
  }, async ({ memoryId, reason, routeContextId, threadId, resourceId }) => guarded(async () => {
    const memoryScope = scope(runtime, key, { routeContextId, threadId, resourceId });
    await runtime.memory.forget(memoryScope, memoryId, reason);
    const memory = await runtime.memory.getMemory(memoryScope, memoryId);
    if (!memory) throw new Error('MEMORY_NOT_FOUND');
    return { memoryId, state: memory.state, physicalDeletion: false };
  }));

  server.registerTool('memory_explain', {
    title: 'Memory Explain',
    description: 'Explain one memory with revisions, anchors, graph edges, provenance, and optional query-score evidence.',
    inputSchema: {
      memoryId: z.string().uuid(),
      query: z.string().min(1).max(20_000).optional(),
      ...optionalScope,
    },
    annotations: readOnlyAnnotations,
  }, async ({ memoryId, query, routeContextId, threadId, resourceId }) => guarded(async () => {
    const result = await runtime.memory.explain(scope(runtime, key, { routeContextId, threadId, resourceId }), memoryId, query);
    if (!result) throw new Error('MEMORY_NOT_FOUND');
    return result;
  }));

  server.registerTool('memory_export', {
    title: 'Memory Export',
    description: 'Export a bounded principal/project-scoped deterministic JSON view for backup/debugging. Raw secret-bearing event text is never exported.',
    inputSchema: {
      limit: z.number().int().min(1).max(1000).default(100),
      ...optionalScope,
    },
    annotations: readOnlyAnnotations,
  }, async ({ limit, routeContextId, threadId, resourceId }) => guarded(() => runtime.memory.export(
    scope(runtime, key, { routeContextId, threadId, resourceId }),
    limit,
  )));
}
