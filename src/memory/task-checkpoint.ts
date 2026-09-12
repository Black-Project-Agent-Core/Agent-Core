import { ContinuityPromoter, type ContinuityPromotionResult } from '../continuity/promoter.js';
import { isTerminalContinuityTaskStatus, normalizeContinuityCheckpointInput, type ContinuityCheckpointInput } from '../continuity/types.js';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { MemoryHardLifecycleError, type MemoryContextLifecycleRecord } from './hard-lifecycle.js';
import type { MemoryService } from './service.js';
import type { MemoryScope } from './types.js';
import type { ContinuityCheckpointClosure } from './file-native/backend.js';
import { canonicalFileNativeProjectId } from './file-native/paths.js';

const checkpointQueues = new Map<string, Promise<unknown>>();

export class TaskCheckpointError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'TaskCheckpointError';
  }
}

export interface TaskCheckpointInput extends ContinuityCheckpointInput {
  workspaceRoot: string;
  memoryContextId: string;
  continuityTaskId: string;
  continuityTurnId: string;
  memoryDecision?: ContinuityCheckpointClosure['memoryDecision'];
}
export interface TaskCheckpointHooks {
  acquireCheckpoint?: (scope: MemoryScope, input: TaskCheckpointInput) => Promise<(() => Promise<void>) | undefined>;
  beforeCheckpoint?: (scope: MemoryScope, input: TaskCheckpointInput) => Promise<void>;
  beforeDurability?: (scope: MemoryScope, input: TaskCheckpointInput, checkpointId: string) => Promise<void>;
}

function publicCheckpointProjection<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => publicCheckpointProjection(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'principalId' || key === 'principal_id') continue;
    output[key] = publicCheckpointProjection(item);
  }
  return output as T;
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

export class TaskCheckpointService {
  constructor(readonly memory: MemoryService, readonly workspace: WorkspacePolicy, private readonly hooks: TaskCheckpointHooks = {}) {}

  /** Trusted adapters supply their authenticated principal; workspace and persisted ownership are still verified. */
  async checkpointForScope(scope: MemoryScope, input: TaskCheckpointInput) {
    const projectRoot = this.workspace.resolveProjectRoot({ explicitRoot: input.workspaceRoot });
    if (!scope.principalId?.trim() || canonicalFileNativeProjectId(this.memory.config.fileNative, scope.projectId)
      !== canonicalFileNativeProjectId(this.memory.config.fileNative, projectRoot)) {
      throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT', 'Checkpoint scope must match an allowed project root.');
    }
    const key = JSON.stringify([this.memory.config.fileNative.vaultRoot, scope, input.memoryContextId]);
    const prior = checkpointQueues.get(key) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(() => this.checkpointOnce(input, scope));
    checkpointQueues.set(key, next);
    try { return await next; }
    finally { if (checkpointQueues.get(key) === next) checkpointQueues.delete(key); }
  }

  private async checkpointOnce(input: TaskCheckpointInput, scope: MemoryScope) {
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

    // Closure authenticates persisted identity; expiration or an outage must not
    // authorize new work, but must still permit finishing already completed work.
    let lifecycle = await this.memory.getLifecycleContext(scope, input.memoryContextId);
    if (!lifecycle || lifecycle.routeContextId !== input.routeContextId) {
      throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT', 'Checkpoint must match its original persisted route and scope.');
    }
    if (lifecycle.continuityTaskId !== input.continuityTaskId) {
      throw new TaskCheckpointError('TASK_CHECKPOINT_TASK_MISMATCH', 'Checkpoint task does not match its persisted lifecycle.');
    }
    const release = await this.hooks.acquireCheckpoint?.(scope, input);
    try {
    await this.hooks.beforeCheckpoint?.(scope, input);
    const knowledgeFields = (['decisions', 'artifacts', 'outcomes', 'constraints'] as const)
      .filter((field) => (normalized[field]?.length ?? 0) > 0);
    const hasKnowledge = knowledgeFields.length > 0 || normalized.status === 'failed';
    const memoryDecision = input.memoryDecision ? {
      reasonCode: input.memoryDecision.reasonCode,
      explanation: input.memoryDecision.explanation.normalize('NFKC').trim(),
    } : undefined;
    if (!hasKnowledge && !memoryDecision) {
      throw new TaskCheckpointError('TASK_MEMORY_DECISION_REQUIRED',
        'No durable knowledge or memoryDecision was received. Provide durable decisions, artifacts, outcomes, constraints, or memoryDecision.reasonCode and memoryDecision.explanation.');
    }
    if (memoryDecision) {
      if (hasKnowledge) {
        const conflictingFields = [...knowledgeFields, ...(normalized.status === 'failed' ? ['status=failed'] : [])];
        throw new TaskCheckpointError('TASK_MEMORY_DECISION_REQUIRED',
          `memoryDecision cannot accompany durable knowledge from ${conflictingFields.join(', ')}. Submit either durable knowledge or an explicit no-memory decision.`);
      }
      if (!['TRANSIENT_OPERATION', 'INSUFFICIENT_EVIDENCE', 'NO_FUTURE_RELEVANCE'].includes(memoryDecision.reasonCode)) {
        throw new TaskCheckpointError('TASK_MEMORY_DECISION_REQUIRED',
          'memoryDecision.reasonCode must be TRANSIENT_OPERATION, INSUFFICIENT_EVIDENCE, or NO_FUTURE_RELEVANCE.');
      }
      if (!memoryDecision.explanation) {
        throw new TaskCheckpointError('TASK_MEMORY_DECISION_REQUIRED',
          'memoryDecision.explanation must not be blank after Unicode normalization and trimming.');
      }
      if (memoryDecision.explanation.length > 2_000) {
        throw new TaskCheckpointError('TASK_MEMORY_DECISION_REQUIRED',
          'memoryDecision.explanation must not exceed 2000 characters after Unicode normalization and trimming.');
      }
    }

    const checkpoint = await this.memory.checkpointContinuity(
      scope,
      input.continuityTaskId,
      input.continuityTurnId,
      normalized,
      { contextId: input.memoryContextId, ...(memoryDecision ? { memoryDecision } : {}) },
    );
    let promoted: ContinuityPromotionResult;
    if (hasKnowledge) {
      promoted = await new ContinuityPromoter({
        applyPostflight: (request) => this.memory.applyPostflight({ ...request, contextId: input.memoryContextId }),
      }).promote(scope, input.continuityTaskId, checkpoint.checkpointId, normalized);
    } else {
      const applied = await this.memory.applyPostflight({
        scope, routeContextId: input.routeContextId, contextId: input.memoryContextId,
        continuityTaskId: input.continuityTaskId, reasonCodes: [memoryDecision!.reasonCode],
        evidenceRefs: [checkpoint.checkpointId],
      });
      promoted = { decisions: 0, artifacts: 0, outcomes: 0, constraints: 0, failures: 0,
        memoryIds: [], writeDecisionIds: [applied.decisionRecord.id], noDurableMemoryDecisions: 1 };
    }

    let turnState: 'open' | 'closed' | 'interrupted' = 'open';
    if (isTerminalContinuityTaskStatus(normalized.status)) {
      await this.memory.closeContinuityTurn(scope, input.continuityTurnId, 'closed');
      turnState = 'closed';
    } else if (normalized.status === 'interrupted') {
      await this.memory.closeContinuityTurn(scope, input.continuityTurnId, 'interrupted');
      turnState = 'interrupted';
    }

    await this.hooks.beforeDurability?.(scope, input, checkpoint.checkpointId);
    const closed = await this.memory.closeLifecycleDurably({
      scope, contextId: input.memoryContextId, routeContextId: input.routeContextId,
      reason: isTerminalContinuityTaskStatus(normalized.status) ? 'continuity_terminal' : 'continuity_checkpoint',
    });
    lifecycle = closed.lifecycle;
    const remoteDurability = closed.remoteDurability;
    const continuitySnapshot = await this.memory.getContinuitySnapshot(scope);
    return publicCheckpointProjection({
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
      writeDecisionIds: promoted.writeDecisionIds,
      noDurableMemoryDecisions: promoted.noDurableMemoryDecisions,
      continuitySnapshot,
      continuitySnapshotHash: continuitySnapshot.snapshotHash,
      remoteDurability,
      memoryLifecycle: lifecyclePublicState(this.memory, lifecycle, remoteDurability),
    });
    } finally { await release?.(); }
  }
}
