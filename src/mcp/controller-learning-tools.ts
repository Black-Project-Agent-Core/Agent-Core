import { McpServer } from '@modelcontextprotocol/server';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import * as schemas from './controller-learning-schemas.js';
import { appendSkillReminderCapsule } from './external-controller-tool-support.js';

function text(value: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  } as any;
}

export function registerControllerLearningTools(
  server: McpServer,
  service: ExternalControllerLearningService,
  sessionId: string,
): void {
  server.registerTool('controller_learning', {
    title: 'External Controller Learning',
    description: 'Inspect and update the cumulative-learning substrate for the connected external controller. Use context for difficult or continuity-sensitive work, episode start to rotate a new independent logical task episode when the transport session is reused, episode for bounded task evidence, artifact_receipt only when knowledge use is known, procedure for verified reusable workflows, and evaluate for cross-session evidence. This tool never invokes a model/provider and never grants execution authority.',
    inputSchema: schemas.controllerLearning,
    annotations: {
      title: 'External Controller Learning',
      readOnlyHint: false,
      destructiveHint: false,
    },
  }, async (args: any) => {
    const started = Date.now();
    const input = schemas.controllerLearning.parse(args ?? {});
    try {
      let result: unknown;
      if (input.action === 'status') {
        result = await service.status();
      } else if (input.action === 'context') {
        result = await service.context(sessionId, {
          ...(input.workspace ? { workspace: input.workspace } : {}),
          ...(input.query ? { query: input.query } : {}),
          ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        });
      } else if (input.action === 'episode') {
        const operation = input.episodeOperation ?? 'status';
        if (operation === 'recover') {
          if (!input.recoverySource) throw new Error('recoverySource required');
          result = await service.recoverHistory(input.recoverySource, input.applyRecovery === true);
        } else if (operation === 'start') {
          result = await service.startEpisode(sessionId, {
            ...(input.taskKey ? { taskKey: input.taskKey } : {}),
            ...(input.workspace ? { workspace: input.workspace } : {}),
            ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          });
        } else if (operation === 'label') {
          result = await service.labelEpisode(sessionId, {
            ...(input.workspace ? { workspace: input.workspace } : {}),
            ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          });
        } else if (operation === 'verify') {
          result = await service.verifyEpisode(sessionId, {
            outcome: input.episodeOutcome!,
            verificationRef: input.verificationRef!,
            evidenceRefs: input.evidenceRefs ?? [],
            ...(input.summary ? { summary: input.summary } : {}),
            ...(input.workspace ? { workspace: input.workspace } : {}),
            ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          });
        } else {
          result = {
            current: await service.getEpisode(sessionId),
            recent: await service.recentEpisodes({
              ...(input.workspace ? { workspace: input.workspace } : {}),
              ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
              ...(input.limit ? { limit: input.limit } : {}),
            }),
          };
        }
      } else if (input.action === 'artifact_receipt') {
        result = await service.artifactReceipt(sessionId, {
          taskId: input.taskId, actionRefs: input.actionRefs,
          kind: input.artifactKind!,
          artifactId: input.artifactId!,
          applicability: input.applicability!,
          result: input.result!,
          reasonCode: input.reasonCode!,
          ...(input.summary ? { summary: input.summary } : {}),
          evidenceRefs: input.evidenceRefs ?? [],
          ...(input.verificationRef ? { verificationRef: input.verificationRef } : {}),
          ...(input.retrievalAttemptId ? { retrievalAttemptId: input.retrievalAttemptId } : {}),
          ...(input.memoryId ? { memoryId: input.memoryId } : {}),
          ...(input.contentDigest ? { contentDigest: input.contentDigest } : {}),
          ...(input.workspace ? { workspace: input.workspace } : {}),
        });
      } else if (input.action === 'procedure') {
        result = await service.procedure(sessionId, {
          operation: input.procedureOperation ?? 'list',
          ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.steps ? { steps: input.steps } : {}),
          ...(input.allowedTools ? { allowedTools: input.allowedTools } : {}),
          ...(input.reuseCondition ? { reuseCondition: input.reuseCondition } : {}),
          evidenceRefs: input.evidenceRefs ?? [],
          ...(input.verificationRef ? { verificationRef: input.verificationRef } : {}),
          ...(input.result === 'success' || input.result === 'failure' ? { result: input.result } : {}),
          ...(input.workspace ? { workspace: input.workspace } : {}),
        });
      } else {
        result = await service.evaluate({
          cohortId: input.cohortId, baselineEpisodeIds: input.baselineEpisodeIds, candidateEpisodeIds: input.candidateEpisodeIds,
          ...(input.workspace ? { workspace: input.workspace } : {}),
          ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        });
      }
      activityTracker.record(
        'LEARNING',
        'success',
        'controller_learning completed',
        'controller-learning-tool',
        {
          action: input.action,
          externalSessionId: sessionId,
          durationMs: Date.now() - started,
        },
      );
      return appendSkillReminderCapsule(text(result), service, sessionId, input.workspace);
    } catch (error) {
      activityTracker.captureFailure(
        'LEARNING',
        error,
        'controller-learning-tool-failure',
        {
          action: input.action,
          externalSessionId: sessionId,
          durationMs: Date.now() - started,
        },
      );
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: 'Error: ' + message }],
        isError: true,
      } as any;
    }
  });
}
