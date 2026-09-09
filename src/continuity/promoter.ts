import { createHash } from 'node:crypto';
import type {
  MemoryPostflightApplyResult,
  MemoryPostflightCandidate,
  MemoryPostflightRequest,
  MemoryScope,
  MemoryWriteReasonCode,
} from '../memory/types.js';
import type { ContinuityCheckpointInput } from './types.js';

export interface ContinuityMemoryWriter {
  applyPostflight(request: MemoryPostflightRequest): Promise<MemoryPostflightApplyResult>;
}

export interface ContinuityPromotionResult {
  decisions: number;
  artifacts: number;
  outcomes: number;
  constraints: number;
  failures: number;
  memoryIds: string[];
  writeDecisionIds: string[];
  noDurableMemoryDecisions: number;
}

export interface ExecutionProcessCheckpointInput {
  runId: string;
  eventSequence: number;
  state: string;
  startedAt?: number;
  finishedAt?: number;
  evidence: Array<{
    nodeId: string;
    state: string;
    attemptCount: number;
  }>;
}

function digest(value: string): string {
  return createHash('sha256').update(value.normalize('NFKC').trim(), 'utf8').digest('hex').slice(0, 24);
}

function sourceMetadata(taskId: string, checkpointId: string, routeContextId: string) {
  return { taskId, checkpointId, routeContextId, source: 'continuity_checkpoint' };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

function evidenceRefs(checkpointId: string, input: ContinuityCheckpointInput, extra: string[] = []): string[] {
  return unique([
    checkpointId,
    ...(input.evidence ?? []).map((item) => item.ref),
    ...extra,
  ]);
}

function boundedRootReason(kind: string, identity: string, taskId: string, checkpointId: string): string {
  return `Verified continuity ${kind} "${identity}" first materialized for task ${taskId} from checkpoint ${checkpointId}.`
    .slice(0, 2_000);
}

export class ContinuityPromoter {
  constructor(private readonly writer: ContinuityMemoryWriter) {}

  async promote(
    scope: MemoryScope,
    taskId: string,
    checkpointId: string,
    input: ContinuityCheckpointInput,
  ): Promise<ContinuityPromotionResult> {
    const result: ContinuityPromotionResult = {
      decisions: 0,
      artifacts: 0,
      outcomes: 0,
      constraints: 0,
      failures: 0,
      memoryIds: [],
      writeDecisionIds: [],
      noDurableMemoryDecisions: 0,
    };

    for (const decision of input.decisions ?? []) {
      const applied = await this.applyCandidate({
        scope,
        taskId,
        checkpointId,
        input,
        candidate: {
          canonicalKey: `continuity.decision.${taskId}.${digest(decision.key)}`,
          kind: 'decision',
          value: {
            taskId,
            checkpointId,
            key: decision.key,
            value: decision.value,
            reason: decision.reason,
          },
          importance: 0.85,
          sourceType: 'continuity_checkpoint',
          sourceRef: checkpointId,
          metadata: sourceMetadata(taskId, checkpointId, input.routeContextId),
        },
        reasonCodes: ['FRESH_DURABLE_CONTEXT', 'CURRENT_STATE_CHANGED'],
        rootReason: boundedRootReason('decision', decision.key, taskId, checkpointId),
        extraEvidenceRefs: [decision.key],
      });
      result.decisions += 1;
      this.capture(result, applied);
    }

    for (const artifact of input.artifacts ?? []) {
      const applied = await this.applyCandidate({
        scope,
        taskId,
        checkpointId,
        input,
        candidate: {
          canonicalKey: `continuity.artifact.${taskId}.${digest(artifact.path)}`,
          kind: 'artifact',
          value: {
            taskId,
            checkpointId,
            path: artifact.path,
            role: artifact.role,
            ...(artifact.hash ? { hash: artifact.hash } : {}),
          },
          importance: 0.8,
          sourceType: 'continuity_checkpoint',
          sourceRef: checkpointId,
          metadata: sourceMetadata(taskId, checkpointId, input.routeContextId),
        },
        reasonCodes: ['FRESH_DURABLE_CONTEXT', 'ARTIFACT_VERIFIED'],
        rootReason: boundedRootReason('artifact', artifact.path, taskId, checkpointId),
        extraEvidenceRefs: [artifact.hash ?? artifact.path],
      });
      result.artifacts += 1;
      this.capture(result, applied);
    }

    for (const outcome of input.outcomes ?? []) {
      const applied = await this.applyCandidate({
        scope,
        taskId,
        checkpointId,
        input,
        candidate: {
          canonicalKey: `continuity.outcome.${taskId}.${digest(outcome.key)}`,
          kind: 'project_state',
          value: {
            taskId,
            checkpointId,
            key: outcome.key,
            value: outcome.value,
            evidenceRefs: outcome.evidenceRefs,
            verified: true,
          },
          importance: 0.82,
          sourceType: 'continuity_checkpoint',
          sourceRef: checkpointId,
          metadata: sourceMetadata(taskId, checkpointId, input.routeContextId),
        },
        reasonCodes: ['FRESH_DURABLE_CONTEXT', 'CURRENT_STATE_CHANGED'],
        rootReason: boundedRootReason('outcome', outcome.key, taskId, checkpointId),
        extraEvidenceRefs: outcome.evidenceRefs,
      });
      result.outcomes += 1;
      this.capture(result, applied);
    }

    for (const constraint of input.constraints ?? []) {
      const applied = await this.applyCandidate({
        scope,
        taskId,
        checkpointId,
        input,
        candidate: {
          canonicalKey: `continuity.constraint.${taskId}.${digest(constraint.key)}`,
          kind: 'guardrail',
          value: {
            taskId,
            checkpointId,
            key: constraint.key,
            value: constraint.value,
            reason: constraint.reason,
          },
          importance: constraint.enforcement === 'hard' ? 1 : 0.88,
          enforcement: constraint.enforcement,
          sourceType: 'continuity_checkpoint',
          sourceRef: checkpointId,
          metadata: sourceMetadata(taskId, checkpointId, input.routeContextId),
        },
        reasonCodes: ['FRESH_DURABLE_CONTEXT', 'GUARDRAIL_CREATED'],
        rootReason: boundedRootReason('guardrail', constraint.key, taskId, checkpointId),
        extraEvidenceRefs: [constraint.key],
      });
      result.constraints += 1;
      this.capture(result, applied);
    }

    if (input.status === 'failed') {
      const applied = await this.applyCandidate({
        scope,
        taskId,
        checkpointId,
        input,
        candidate: {
          canonicalKey: `continuity.failure.${taskId}`,
          kind: 'failure',
          value: {
            taskId,
            checkpointId,
            summary: input.summary,
            blockers: input.blockers ?? [],
            evidence: (input.evidence ?? []).map((item) => ({
              type: item.type,
              ref: item.ref,
              ...(item.result ? { result: item.result } : {}),
            })),
          },
          importance: 0.9,
          sourceType: 'continuity_checkpoint',
          sourceRef: checkpointId,
          metadata: sourceMetadata(taskId, checkpointId, input.routeContextId),
        },
        reasonCodes: ['FRESH_DURABLE_CONTEXT', 'FAILURE_OBSERVED'],
        rootReason: boundedRootReason('failure', taskId, taskId, checkpointId),
      });
      result.failures = 1;
      this.capture(result, applied);
    }

    if (
      result.decisions === 0
      && result.artifacts === 0
      && result.outcomes === 0
      && result.constraints === 0
      && result.failures === 0
    ) {
      const applied = await this.writer.applyPostflight({
        scope,
        routeContextId: input.routeContextId,
        continuityTaskId: taskId,
        reasonCodes: ['NO_FUTURE_RELEVANCE'],
        evidenceRefs: [checkpointId],
      });
      this.capture(result, applied);
    }

    return result;
  }

  async promoteExecutionProcessCheckpoint(
    scope: MemoryScope,
    taskId: string,
    input: ExecutionProcessCheckpointInput,
  ): Promise<MemoryPostflightApplyResult> {
    const checkpointId = `execution:${input.runId}:${input.eventSequence}`;
    return this.writer.applyPostflight({
      scope,
      routeContextId: input.runId,
      continuityTaskId: taskId,
      candidate: {
        canonicalKey: `continuity.process_checkpoint.${taskId}.${input.runId}.${input.eventSequence}`,
        kind: 'artifact',
        value: {
          taskId,
          runId: input.runId,
          eventSequence: input.eventSequence,
          state: input.state,
          checkpointType: 'execution_process',
          summary: 'execution process checkpoint',
          taskCompleted: false,
          ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
          ...(input.finishedAt === undefined ? {} : { finishedAt: input.finishedAt }),
          evidence: input.evidence,
        },
        importance: 0.82,
        sourceType: 'execution_process_checkpoint',
        sourceRef: input.runId,
        metadata: {
          taskId,
          runId: input.runId,
          eventSequence: input.eventSequence,
          taskCompleted: false,
        },
      },
      reasonCodes: ['FRESH_DURABLE_CONTEXT', 'ARTIFACT_VERIFIED'],
      evidenceRefs: [checkpointId],
      rootReason: boundedRootReason('execution process checkpoint', checkpointId, taskId, checkpointId),
    });
  }

  private async applyCandidate(input: {
    scope: MemoryScope;
    taskId: string;
    checkpointId: string;
    input: ContinuityCheckpointInput;
    candidate: MemoryPostflightCandidate;
    reasonCodes: MemoryWriteReasonCode[];
    rootReason: string;
    extraEvidenceRefs?: string[];
  }): Promise<MemoryPostflightApplyResult> {
    return this.writer.applyPostflight({
      scope: input.scope,
      routeContextId: input.input.routeContextId,
      continuityTaskId: input.taskId,
      candidate: input.candidate,
      reasonCodes: input.reasonCodes,
      evidenceRefs: evidenceRefs(input.checkpointId, input.input, input.extraEvidenceRefs),
      rootReason: input.rootReason,
    });
  }

  private capture(result: ContinuityPromotionResult, applied: MemoryPostflightApplyResult): void {
    result.writeDecisionIds.push(applied.decisionRecord.id);
    if (applied.decision === 'NO_DURABLE_MEMORY') result.noDurableMemoryDecisions += 1;
    if (applied.memoryId && !result.memoryIds.includes(applied.memoryId)) result.memoryIds.push(applied.memoryId);
  }
}
