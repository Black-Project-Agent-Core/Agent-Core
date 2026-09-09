import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import { attachExecutionContinuity } from '../continuity/snapshot.js';
import {
  isTerminalContinuityTaskStatus,
  normalizeContinuityCheckpointInput,
  type ContinuityCheckpointInput,
} from '../continuity/types.js';
import { MemoryHardLifecycleError } from '../memory/hard-lifecycle.js';
import { canonicalFileNativeProjectId } from '../memory/file-native/paths.js';
import { AgentCoreRouteError } from '../runtime/route-context-store.js';
import type { RuntimeServices } from '../runtime/services.js';
import { persistentPrincipalId, resolvedMemoryProjectScope } from './project-scope.js';

export const CONTINUITY_TOOL_NAMES = [
  'task_checkpoint',
  'continuity_status',
  'continuity_get_task',
  'continuity_frontier',
] as const;

class ContinuityToolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ContinuityToolError';
  }
}

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
const checkpointAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const checkpointStatus = z.enum(['running', 'blocked', 'deferred', 'completed', 'failed', 'cancelled', 'interrupted']);
const evidenceType = z.enum(['tool', 'file', 'test', 'log', 'hash', 'health']);

function scope(runtime: RuntimeServices, key: VerifiedKey, routeContextId?: string) {
  return resolvedMemoryProjectScope(runtime, key, routeContextId);
}

async function requireExecutionCompletionEvidence(
  runtime: RuntimeServices,
  currentScope: ReturnType<typeof scope>,
  continuityTaskId: string,
  input: ContinuityCheckpointInput,
): Promise<void> {
  if (input.status !== 'completed' || !runtime.execution.config.enabled) return;
  await runtime.execution.open();
  const linkedRuns = await runtime.execution.runsForContinuityTask(currentScope, continuityTaskId);
  const executionRefs = (input.evidence ?? [])
    .filter((item) => item.type === 'tool' && item.ref.startsWith('execution:'))
    .map((item) => item.ref.slice('execution:'.length).trim());

  if (linkedRuns.length === 0) {
    if (executionRefs.length > 0) {
      throw new ContinuityToolError(
        'CONTINUITY_EXECUTION_EVIDENCE_INVALID',
        'Execution evidence reference is not linked to the current continuity task',
      );
    }
    return;
  }

  if (linkedRuns.some((run) => run.state === 'planned' || run.state === 'running')) {
    throw new ContinuityToolError(
      'CONTINUITY_EXECUTION_ACTIVE',
      'Execution-backed task cannot be completed while a linked execution run is still active',
    );
  }
  if (executionRefs.length === 0) {
    throw new ContinuityToolError(
      'CONTINUITY_EXECUTION_EVIDENCE_REQUIRED',
      'Execution-backed completion requires an explicit tool evidence reference: execution:<runId>',
    );
  }

  const byRunId = new Map(linkedRuns.map((run) => [run.runId, run]));
  for (const runId of new Set(executionRefs)) {
    const run = byRunId.get(runId);
    if (!run || run.state !== 'completed' || run.evidence.verification !== 'verified') {
      throw new ContinuityToolError(
        'CONTINUITY_EXECUTION_EVIDENCE_INVALID',
        `Execution evidence is not a completed verified run linked to this continuity task: ${runId}`,
      );
    }
  }
}

function requireContinuityRoute(runtime: RuntimeServices, key: VerifiedKey, routeContextId: string) {
  const route = runtime.routes.get(routeContextId);
  if (!route) {
    throw new AgentCoreRouteError('ROUTE_NOT_FOUND', 'Route context was not found or has expired');
  }
  if (route.principalId !== key.id) {
    throw new AgentCoreRouteError('ROUTE_PRINCIPAL_MISMATCH', 'Route context belongs to another authenticated principal');
  }
  if (!route.continuityTaskId || !route.continuityTurnId) {
    throw new ContinuityToolError('CONTINUITY_ROUTE_UNBOUND', 'Route does not have a persisted continuity task/turn');
  }
  return route;
}

async function resolveCheckpoint(runtime: RuntimeServices, key: VerifiedKey, routeContextId: string) {
  try {
    const route = requireContinuityRoute(runtime, key, routeContextId);
    const currentScope = scope(runtime, key, routeContextId);
    const contextId = route.memorySnapshot?.memoryContextId;
    if (!contextId) throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Checkpoint requires its persisted memory context.');
    return { currentScope, workspaceRoot: currentScope.projectId, contextId,
      taskId: route.continuityTaskId!, turnId: route.continuityTurnId! };
  } catch (error) {
    if (!(error instanceof AgentCoreRouteError) || !['ROUTE_NOT_FOUND', 'ROUTE_EXPIRED'].includes(error.code)) throw error;
    const principalId = persistentPrincipalId(runtime, key);
    const lifecycle = await runtime.memory.findLifecycleByRoute({ principalId, routeContextId, projectIds: runtime.workspace.roots, authorityPrincipalId: key.id });
    if (!lifecycle?.continuityTaskId) throw error;
    const workspaceRoot = runtime.workspace.roots.find(root =>
      canonicalFileNativeProjectId(runtime.memory.config.fileNative, root) === lifecycle.projectId);
    if (!workspaceRoot) throw error;
    const currentScope = { principalId, projectId: workspaceRoot };
    const turn = await runtime.memory.findContinuityTurnForRoute({ scope: currentScope, routeContextId, taskId: lifecycle.continuityTaskId });
    if (!turn) throw error;
    // Recover closure identity only; no live route or execution authority is recreated.
    return { currentScope, workspaceRoot, contextId: lifecycle.contextId, taskId: lifecycle.continuityTaskId, turnId: turn.turnId };
  }
}

export function registerContinuityTools(server: McpServer, runtime: RuntimeServices, key: VerifiedKey): void {
  server.registerTool('task_checkpoint', {
    title: 'Task Checkpoint',
    description: 'Persist an idempotent continuity checkpoint and its memory decision, then synchronize and close. Supply durable knowledge or an explicit memoryDecision for analysis without new knowledge. Retry the identical request with the original routeContextId after failure, expiry, or restart.',
    inputSchema: {
      routeContextId: z.string().uuid(),
      status: checkpointStatus,
      summary: z.string().min(1).max(20_000),
      evidence: z.array(z.object({
        type: evidenceType,
        ref: z.string().min(1).max(5_000),
        result: z.string().max(20_000).optional(),
      })).max(100).optional(),
      decisions: z.array(z.object({
        key: z.string().min(1).max(5_000),
        value: z.string().min(1).max(20_000),
        reason: z.string().min(1).max(20_000),
      })).max(100).optional(),
      artifacts: z.array(z.object({
        path: z.string().min(1).max(5_000),
        role: z.string().min(1).max(5_000),
        hash: z.string().max(5_000).optional(),
      })).max(100).optional(),
      outcomes: z.array(z.object({
        key: z.string().min(1).max(5_000),
        value: z.string().min(1).max(20_000),
        evidenceRefs: z.array(z.string().min(1).max(5_000)).min(1).max(100),
      })).max(100).optional(),
      constraints: z.array(z.object({
        key: z.string().min(1).max(5_000),
        value: z.string().min(1).max(20_000),
        reason: z.string().min(1).max(20_000),
        enforcement: z.enum(['soft', 'hard']),
      })).max(100).optional(),
      blockers: z.array(z.object({
        code: z.string().min(1).max(5_000),
        detail: z.string().min(1).max(20_000),
      })).max(100).optional(),
      deferred: z.array(z.object({
        title: z.string().min(1).max(5_000),
        reason: z.string().min(1).max(20_000),
      })).max(100).optional(),
      nextCandidates: z.array(z.object({
        title: z.string().min(1).max(5_000),
        rationale: z.string().min(1).max(20_000),
        dependsOnTaskIds: z.array(z.string().min(1).max(5_000)).max(128).optional(),
        priority: z.number().finite().optional(),
      })).max(5).optional(),
      projectTerminal: z.boolean().optional(),
      memoryDecision: z.object({
        reasonCode: z.enum(['TRANSIENT_OPERATION', 'INSUFFICIENT_EVIDENCE', 'NO_FUTURE_RELEVANCE']),
        explanation: z.string().min(1).max(2_000),
      }).optional(),
    },
    annotations: checkpointAnnotations,
  }, async ({ routeContextId, memoryDecision, ...fields }) => guarded(async () => {
    const resolved = await resolveCheckpoint(runtime, key, routeContextId);
    const input = normalizeContinuityCheckpointInput({ ...fields, routeContextId } as ContinuityCheckpointInput);
    // Execution ownership is the authenticated key; durable memory may use a separate logical principal.
    await requireExecutionCompletionEvidence(runtime, { principalId: key.id, projectId: resolved.workspaceRoot }, resolved.taskId, input);
    const result = await runtime.checkpoints.checkpointForScope(
      resolved.currentScope,
      { ...input, workspaceRoot: resolved.workspaceRoot, memoryContextId: resolved.contextId,
        continuityTaskId: resolved.taskId, continuityTurnId: resolved.turnId, memoryDecision },
    );
    return { ...result, frontier: result.continuitySnapshot.frontier };
  }));

  server.registerTool('continuity_status', {
    title: 'Continuity Status',
    description: 'Return current principal/project continuity health and bounded deterministic snapshot.',
    inputSchema: { routeContextId: z.string().uuid().optional() },
    annotations: readOnlyAnnotations,
  }, async ({ routeContextId }) => guarded(async () => {
    const currentScope = scope(runtime, key, routeContextId);
    const memory = await runtime.memory.status(currentScope);
    if (!memory.enabled) return { enabled: false, healthy: false, memory, snapshot: null };
    let snapshot = await runtime.memory.getContinuitySnapshot(currentScope);
    if (runtime.execution.config.enabled) {
      try {
        await runtime.execution.open();
        snapshot = attachExecutionContinuity(snapshot, await runtime.execution.continuitySummary(currentScope));
      } catch {
        // Continuity memory remains independently available when execution is degraded.
      }
    }
    return { enabled: true, healthy: memory.healthy, memory, snapshot };
  }));

  server.registerTool('continuity_get_task', {
    title: 'Continuity Get Task',
    description: 'Return one continuity task owned by the authenticated principal in the current project.',
    inputSchema: { taskId: z.string().uuid(), routeContextId: z.string().uuid().optional() },
    annotations: readOnlyAnnotations,
  }, async ({ taskId, routeContextId }) => guarded(async () => {
    const task = await runtime.memory.getContinuityTask(scope(runtime, key, routeContextId), taskId);
    if (!task) throw new ContinuityToolError('CONTINUITY_TASK_NOT_FOUND', 'Continuity task was not found in authenticated scope');
    return task;
  }));

  server.registerTool('continuity_frontier', {
    title: 'Continuity Frontier',
    description: 'Return the bounded deterministic next-work frontier for the authenticated principal and current project.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).default(5),
      routeContextId: z.string().uuid().optional(),
    },
    annotations: readOnlyAnnotations,
  }, async ({ limit, routeContextId }) => guarded(() => runtime.memory.listContinuityFrontier(
    scope(runtime, key, routeContextId), limit,
  )));
}
