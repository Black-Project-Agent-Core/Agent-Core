import { randomUUID } from 'node:crypto';
import {
  isTerminalContinuityTaskStatus,
  normalizeContinuityCapture,
  normalizeContinuityCheckpointInput,
  type ContinuityCapture,
  type ContinuityCheckpointInput,
} from '../continuity/types.js';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { MemoryHardLifecycleError, memoryObjectiveHash, type MemoryContextLifecycleRecord } from './hard-lifecycle.js';
import type { MemoryService } from './service.js';
import type {
  MemoryRememberMoreReason,
  MemoryScope,
  MemorySearchResult,
} from './types.js';

const DEFAULT_CONTEXT_TTL_MS = 15 * 60_000;
const MAX_CONTEXT_TTL_MS = 60 * 60_000;

function bridgeSafeProjection<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => bridgeSafeProjection(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'principalId' || key === 'principal_id') continue;
    output[key] = bridgeSafeProjection(item);
  }
  return output as T;
}

export class CodespaceSharedMemoryError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'CodespaceSharedMemoryError';
  }
}

export interface CodespaceOpenMemoryContextInput {
  workspaceRoot: string;
  task: string;
  context?: string;
  continuity?: ContinuityCapture;
  ttlMs?: number;
}

export interface CodespaceMemoryCheckpointInput extends Omit<ContinuityCheckpointInput, 'routeContextId'> {
  workspaceRoot: string;
  routeContextId: string;
  memoryContextId: string;
  continuityTaskId: string;
  continuityTurnId: string;
}

export interface CodespaceMemorySearchInput {
  workspaceRoot: string;
  query: string;
  includeHistory?: boolean;
  limit?: number;
  characterBudget?: number;
}

export interface CodespaceMemoryRememberMoreInput {
  workspaceRoot: string;
  contextId: string;
  seedMemoryIds: string[];
  reason: MemoryRememberMoreReason;
  maxHops?: number;
  maxItems?: number;
  characterBudget?: number;
}

function lifecyclePublicState(
  memory: MemoryService,
  lifecycle: MemoryContextLifecycleRecord | null,
  remoteDurability?: { required: boolean; state: string; generationId?: string; logicalStateHash?: string },
) {
  if (!lifecycle) {
    return {
      mode: memory.config.hardLifecycleMode,
      postflightState: null,
      durabilityState: 'UNAVAILABLE',
    };
  }
  if (remoteDurability?.required && remoteDurability.state === 'REMOTE_SYNCED') {
    return {
      mode: memory.config.hardLifecycleMode,
      postflightState: lifecycle.postflightState,
      durabilityState: 'DURABLY_CLOSED',
      ...(remoteDurability.generationId ? { generationId: remoteDurability.generationId } : {}),
      ...(remoteDurability.logicalStateHash ? { logicalStateHash: remoteDurability.logicalStateHash } : {}),
    };
  }
  return {
    mode: memory.config.hardLifecycleMode,
    postflightState: lifecycle.postflightState,
    durabilityState: remoteDurability?.required === false ? 'NOT_REQUIRED' : 'LOCAL_ONLY',
  };
}

function boundedTtl(value: number | undefined): number {
  if (value === undefined) return DEFAULT_CONTEXT_TTL_MS;
  if (!Number.isSafeInteger(value) || value < 60_000 || value > MAX_CONTEXT_TTL_MS) {
    throw new CodespaceSharedMemoryError(
      'CODESPACE_SHARED_MEMORY_TTL_INVALID',
      `ttlMs must be an integer between 60000 and ${MAX_CONTEXT_TTL_MS}`,
    );
  }
  return value;
}

export class CodespaceSharedMemoryService {
  constructor(readonly memory: MemoryService, readonly workspace: WorkspacePolicy) {}

  private scope(workspaceRoot: string): MemoryScope {
    const principalId = this.memory.config.principalId?.trim();
    if (!principalId) {
      throw new CodespaceSharedMemoryError(
        'CODESPACE_SHARED_MEMORY_PRINCIPAL_REQUIRED',
        'Shared Codespace memory requires a stable logical memory principal.',
      );
    }
    const projectId = this.workspace.resolveProjectRoot({ explicitRoot: workspaceRoot });
    return { principalId, projectId };
  }

  async status(workspaceRoot: string) {
    const scope = this.scope(workspaceRoot);
    const memory = await this.memory.status(scope);
    let continuitySnapshot = null;
    if (memory.healthy) {
      continuitySnapshot = await this.memory.getContinuitySnapshot(scope).catch(() => null);
    }
    const remoteState = this.memory.config.remote.enabled
      ? await this.memory.getRemoteState(scope).catch(() => null)
      : null;
    return {
      enabled: memory.enabled,
      healthy: memory.healthy,
      schemaVersion: memory.schemaVersion,
      integrity: memory.integrity,
      counts: memory.counts,
      lifecycleMode: this.memory.config.hardLifecycleMode,
      remoteEnabled: this.memory.config.remote.enabled,
      remoteDurabilityState: remoteState?.durabilityState ?? (this.memory.config.remote.enabled ? 'UNAVAILABLE' : 'NOT_REQUIRED'),
      continuitySnapshot: bridgeSafeProjection(continuitySnapshot),
    };
  }

  async openContext(input: CodespaceOpenMemoryContextInput) {
    const scope = this.scope(input.workspaceRoot);
    const task = input.task.normalize('NFKC').trim();
    const context = input.context?.normalize('NFKC').trim() || undefined;
    if (!task || task.length > 20_000) {
      throw new CodespaceSharedMemoryError('CODESPACE_SHARED_MEMORY_TASK_INVALID', 'task must contain 1-20000 characters.');
    }
    if (context && context.length > 20_000) {
      throw new CodespaceSharedMemoryError('CODESPACE_SHARED_MEMORY_CONTEXT_INVALID', 'context must not exceed 20000 characters.');
    }
    const ttlMs = boundedTtl(input.ttlMs);
    const expiresAt = Date.now() + ttlMs;
    const routeContextId = randomUUID();
    const capture = normalizeContinuityCapture({ objective: task, ...(input.continuity ?? {}) });

    const priorPending = await this.memory.findLifecycleReconciliationRequired({
      scope,
      objectiveHash: memoryObjectiveHash(task, context),
      ...(capture.resumeTaskId ? { continuityTaskId: capture.resumeTaskId } : {}),
    });
    let advisoryCode: 'MEMORY_POSTFLIGHT_REQUIRED' | undefined;
    if (priorPending.length > 0) {
      if (this.memory.config.hardLifecycleMode === 'enforce') {
        throw new MemoryHardLifecycleError(
          'MEMORY_POSTFLIGHT_REQUIRED',
          'Previous meaningful Codespace work for this objective/task requires postflight reconciliation.',
          { pendingCount: priorPending.length },
        );
      }
      if (this.memory.config.hardLifecycleMode === 'advisory') advisoryCode = 'MEMORY_POSTFLIGHT_REQUIRED';
    }

    const preflight = await this.memory.preflight({
      scope,
      routeContextId,
      task,
      context,
      routeMetadata: { workspaceRoots: this.workspace.roots, source: 'codespace-shared-memory' },
      expiresAt,
    });
    const continuity = await this.memory.beginContinuityTurn(
      scope,
      routeContextId,
      task,
      context,
      capture,
      expiresAt,
    );
    let lifecycle = await this.memory.bindLifecycleTask(scope, preflight.contextId, continuity.taskId);
    let memoryContextLease: string | null = null;
    let memoryContextLeaseExpiresAt: string | null = null;
    if (this.memory.config.hardLifecycleMode !== 'disabled') {
      const issued = await this.memory.issueContextLease({
        scope,
        contextId: preflight.contextId,
        routeContextId,
      });
      memoryContextLease = issued.token;
      memoryContextLeaseExpiresAt = new Date(issued.expiresAt).toISOString();
      lifecycle = await this.memory.getLifecycleContext(scope, preflight.contextId) ?? lifecycle;
    }
    const continuitySnapshot = await this.memory.getContinuitySnapshot(scope);
    return {
      routeContextId,
      memoryContextId: preflight.contextId,
      continuityTaskId: continuity.taskId,
      continuityTurnId: continuity.turnId,
      memoryContextLease,
      memoryContextLeaseExpiresAt,
      expiresAt: new Date(expiresAt).toISOString(),
      memorySummary: preflight.recalled,
      blockingGuardrails: preflight.blockingGuardrails,
      openConflicts: preflight.openConflicts,
      priorFailures: preflight.priorFailures,
      relatedDecisions: preflight.relatedDecisions,
      memorySnapshotHash: preflight.snapshotHash,
      continuitySnapshot: bridgeSafeProjection(continuitySnapshot),
      continuitySnapshotHash: continuitySnapshot.snapshotHash,
      memoryLifecycle: {
        mode: this.memory.config.hardLifecycleMode,
        postflightState: lifecycle.postflightState,
        priorPending: priorPending.length > 0,
        priorPendingCount: priorPending.length,
        ...(advisoryCode ? { advisoryCode } : {}),
      },
    };
  }

  async search(input: CodespaceMemorySearchInput): Promise<MemorySearchResult> {
    return bridgeSafeProjection(await this.memory.search({
      scope: this.scope(input.workspaceRoot),
      query: input.query,
      includeHistory: input.includeHistory,
      limit: input.limit,
      characterBudget: input.characterBudget,
    }));
  }

  async get(workspaceRoot: string, memoryId: string) {
    const result = await this.memory.getWithProvenance(this.scope(workspaceRoot), memoryId);
    if (!result) throw new CodespaceSharedMemoryError('MEMORY_NOT_FOUND', 'Memory was not found in the shared project scope.');
    return bridgeSafeProjection(result);
  }

  async explain(workspaceRoot: string, memoryId: string, query?: string) {
    const result = await this.memory.explain(this.scope(workspaceRoot), memoryId, query);
    if (!result) throw new CodespaceSharedMemoryError('MEMORY_NOT_FOUND', 'Memory was not found in the shared project scope.');
    return bridgeSafeProjection(result);
  }

  async rememberMore(input: CodespaceMemoryRememberMoreInput) {
    return bridgeSafeProjection(await this.memory.rememberMore({
      scope: this.scope(input.workspaceRoot),
      contextId: input.contextId,
      seedMemoryIds: input.seedMemoryIds,
      reason: input.reason,
      maxHops: input.maxHops,
      maxItems: input.maxItems,
      characterBudget: input.characterBudget,
    }));
  }

  async checkpoint(input: CodespaceMemoryCheckpointInput) {
    const scope = this.scope(input.workspaceRoot);
    const normalized = normalizeContinuityCheckpointInput({
      routeContextId: input.routeContextId,
      status: input.status,
      summary: input.summary,
      evidence: input.evidence,
      decisions: input.decisions,
      artifacts: input.artifacts,
      outcomes: input.outcomes,
      constraints: input.constraints,
      blockers: input.blockers,
      deferred: input.deferred,
      nextCandidates: input.nextCandidates,
      projectTerminal: input.projectTerminal,
    });

    let lifecycle = await this.memory.validateLifecycleContext({
      scope,
      contextId: input.memoryContextId,
      routeContextId: input.routeContextId,
    }).catch(async (error) => {
      const existing = await this.memory.getLifecycleContext(scope, input.memoryContextId);
      if (existing?.postflightState === 'CLOSED' && this.memory.config.remote.enabled
        && !existing.localDurableGeneration && !existing.localDurableHash) return existing;
      throw error;
    });
    if (lifecycle.continuityTaskId !== input.continuityTaskId) {
      throw new CodespaceSharedMemoryError(
        'CODESPACE_SHARED_MEMORY_TASK_MISMATCH',
        'Checkpoint continuity task does not match the persisted memory lifecycle.',
      );
    }

    if (lifecycle.postflightState === 'CLOSED') {
      const existingTask = await this.memory.getContinuityTask(scope, input.continuityTaskId);
      if (!existingTask?.lastCheckpointId || existingTask.status !== normalized.status) {
        throw new MemoryHardLifecycleError(
          'MEMORY_POSTFLIGHT_REQUIRED',
          'Pending shared-memory durability does not match the authoritative prior checkpoint state.',
        );
      }
      const remoteDurability = await this.memory.syncDurableBoundary(
        scope,
        isTerminalContinuityTaskStatus(existingTask.status) ? 'continuity_terminal' : 'continuity_checkpoint',
      );
      if (remoteDurability.required) {
        lifecycle = await this.memory.markLifecycleDurableClosure({
          scope,
          contextId: input.memoryContextId,
          generationId: remoteDurability.generationId,
          logicalStateHash: remoteDurability.logicalStateHash,
        });
      }
      const continuitySnapshot = await this.memory.getContinuitySnapshot(scope);
      return bridgeSafeProjection({
        reconciled: true,
        checkpointId: existingTask.lastCheckpointId,
        taskStatus: existingTask.status,
        turnState: isTerminalContinuityTaskStatus(existingTask.status) ? 'closed' : 'open',
        promoted: { decisions: 0, artifacts: 0, outcomes: 0, constraints: 0, failures: 0 },
        promotedMemoryIds: [],
        continuitySnapshot,
        continuitySnapshotHash: continuitySnapshot.snapshotHash,
        remoteDurability,
        memoryLifecycle: lifecyclePublicState(this.memory, lifecycle, remoteDurability),
      });
    }

    const checkpoint = await this.memory.checkpointContinuity(
      scope,
      input.continuityTaskId,
      input.continuityTurnId,
      normalized,
    );
    const promoted = await this.memory.promoteContinuityCheckpoint(
      scope,
      input.continuityTaskId,
      checkpoint.checkpointId,
      normalized,
    );

    let turnState: 'open' | 'closed' | 'interrupted' = 'open';
    if (isTerminalContinuityTaskStatus(normalized.status)) {
      await this.memory.closeContinuityTurn(scope, input.continuityTurnId, 'closed');
      turnState = 'closed';
    } else if (normalized.status === 'interrupted') {
      await this.memory.closeContinuityTurn(scope, input.continuityTurnId, 'interrupted');
      turnState = 'interrupted';
    }

    if (this.memory.config.hardLifecycleMode !== 'disabled') {
      lifecycle = await this.memory.prepareLifecycleClosure({
        scope,
        contextId: input.memoryContextId,
        routeContextId: input.routeContextId,
      });
    }
    const remoteDurability = await this.memory.syncDurableBoundary(
      scope,
      isTerminalContinuityTaskStatus(normalized.status) ? 'continuity_terminal' : 'continuity_checkpoint',
    );
    if (remoteDurability.required && this.memory.config.hardLifecycleMode !== 'disabled') {
      lifecycle = await this.memory.markLifecycleDurableClosure({
        scope,
        contextId: input.memoryContextId,
        generationId: remoteDurability.generationId,
        logicalStateHash: remoteDurability.logicalStateHash,
      });
    }
    const continuitySnapshot = await this.memory.getContinuitySnapshot(scope);
    return bridgeSafeProjection({
      ...checkpoint,
      turnState,
      promoted: {
        decisions: promoted.decisions,
        artifacts: promoted.artifacts,
        outcomes: promoted.outcomes,
        constraints: promoted.constraints,
        failures: promoted.failures,
      },
      promotedMemoryIds: promoted.memoryIds,
      continuitySnapshot,
      continuitySnapshotHash: continuitySnapshot.snapshotHash,
      remoteDurability,
      memoryLifecycle: lifecyclePublicState(this.memory, lifecycle, remoteDurability),
    });
  }
}
