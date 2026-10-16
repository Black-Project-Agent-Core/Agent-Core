import { McpServer } from '@modelcontextprotocol/server';
import type { LearningService } from '../learning/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { currentExternalInvocationContext } from '../tracker/tool-invocation.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { appendFailureLoopAdvisory, type FailureLoopAdvisor } from './failure-loop-advisor.js';
import * as schemas from './learning-schemas.js';
import { appendSkillReminderCapsule } from './external-controller-tool-support.js';
import type { MemoryScopeResolver } from '../memory/mcp/scope.js';

function text(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] as any };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  activityTracker.record('LEARNING', 'info', 'learning tool operation failed', 'handled-learning-failure', { message });
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true } as any;
}

export function registerLearningTools(
  server: McpServer,
  learning: LearningService,
  advisor?: FailureLoopAdvisor,
  externalController?: ExternalControllerLearningService,
  externalSessionId?: string,
  resolveTaskScope?: MemoryScopeResolver,
  evidenceReadAllowed = false,
): void {
  server.registerTool('learning', {
    title: 'Agent Core Learning',
    description: 'Shared Learning owner. After meaningful work checkpoint with evidence/workspace; review when due using checkpointKeys/taskId and disposition for empty candidates. Memory writes do not finalize Learning. decision declares immutable forecasts, assesses observation/goal evidence, or inspects context/salience/calibration. Salience stoppingContext assesses optional verification stopping; required checks and unresolved risk remain visible. External decisions require host-bound taskId; native uses current task. File evidence obeys read grants. Tool success is not goal success. Review/receipts/curation/journey preserve evidence; no execution grant or automatic policy activation.',
    inputSchema: schemas.learning.shape,
    annotations: { title: 'Agent Core Learning', readOnlyHint: false, destructiveHint: false },
  }, async (args: any) => {
    const invocationContext = currentExternalInvocationContext();
    const input = schemas.learning.parse(args);
    try {
      let result: unknown;

      if (input.action === 'status') {
        result = await learning.status();
      } else if (input.action === 'decision') {
        if (!resolveTaskScope) throw new Error('LEARNING_DECISION_SCOPE_REQUIRED');
        const scope = await resolveTaskScope(input.taskId ? { taskId: input.taskId } : undefined);
        if (input.workspace && input.workspace !== scope.workspaceKey) throw new Error('LEARNING_DECISION_WORKSPACE_MISMATCH');
        result = await learning.decisionReview({ taskId: scope.taskId, workspace: scope.workspaceKey }, input.decision!, { readFiles: evidenceReadAllowed });
      } else if (input.action === 'checkpoint') {
        if (!input.idempotencyKey) throw new Error('idempotencyKey is required for action=checkpoint');
        result = await learning.checkpoint({
          idempotencyKey: input.idempotencyKey,
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.meaningful !== undefined ? { meaningful: input.meaningful } : {}),
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.evidenceRefs ? { evidenceRefs: input.evidenceRefs } : {}),
          ...(input.workspace ? { workspace: input.workspace } : {}),
        });
        if (externalController && externalSessionId) {
          await externalController.recordLearningCheckpoint(externalSessionId, input.workspace, input.idempotencyKey, input.taskId ?? invocationContext?.taskId).catch(() => undefined);
        }
      } else if (input.action === 'review') {
        result = await learning.review(input.candidates ?? [], input.explicit === true, {
          checkpointKeys: input.checkpointKeys, taskId: input.taskId, disposition: input.disposition,
          ...(input.workspace ? { workspace: input.workspace } : {}),
        });
        if (externalController && externalSessionId) {
          const summary = (result as { summary?: { status?: string } })?.summary?.status ?? 'completed';
          await externalController.recordLearningReview(externalSessionId, summary, (result as any).checkpointDecisions).catch(() => undefined);
        }
      } else if (input.action === 'receipt') {
        result = await learning.receipt({
          taskId: input.taskId, actionRefs: input.actionRefs,
          useId: input.useId!,
          retrievalAttemptId: input.retrievalAttemptId!,
          memoryId: input.memoryId!,
          contentDigest: input.contentDigest!,
          ...(input.workspace ? { workspace: input.workspace } : {}),
          applicability: input.applicability!,
          result: input.result!,
          reasonCode: input.reasonCode!,
          evidenceRefs: input.evidenceRefs ?? [],
          ...(input.verificationRef ? { verificationRef: input.verificationRef } : {}),
          ...(input.summary ? { summary: input.summary } : {}),
        });
      } else if (input.action === 'curate') {
        result = await learning.curate(input.workspace);
      } else {
        result = await learning.journey(input.workspace);
      }
      advisor?.observeSuccess('learning', args);
      return appendSkillReminderCapsule(text(result), externalController, externalSessionId, input.workspace, invocationContext);
    } catch (error) {
      const result = failure(error);
      const advisory = advisor?.observeFailure('learning', args, result);
      if (advisory) {
        activityTracker.record(
          'REFLEXION',
          advisory.strength === 'no-progress' ? 'warn' : 'info',
          advisory.message,
          'failure-loop-advisory',
          { tool: 'learning', repeatCount: advisory.repeatCount, failureFamily: advisory.failureFamily },
        );
        return appendFailureLoopAdvisory(result, advisory);
      }
      return result;
    }
  });
}
