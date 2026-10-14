import { McpServer } from '@modelcontextprotocol/server';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { currentExternalInvocationContext } from '../tracker/tool-invocation.js';
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
  host?: { ownerId: string; workspaceIdentity: (workspace: string) => { name: string; key: string } },
): void {
  server.registerTool('controller_learning', {
    title: 'External Controller Learning',
    description: 'Controller episodes, evidence context and reuse receipts; Memory CRUD and learning(checkpoint/review) are separate tools. Start/resume with episodeOperation=start, stable taskKey and registered workspace; use the returned taskId. context without retrievalPlan keeps v1. Opt-in retrievalPlan needs that active taskId, matching query/rootQuery and 2–4 unique q1–q4 questions; limit 1–8 per recall. v2 reports bounded serial Memory recall, exact revisions, gaps and omissions; existing embeddings may receive each query. Timeout stops waiting, not in-flight I/O. Skill discovery stays lexical unless explicit hybrid plus consent to send query/positive descriptors to configured Cloudflare Workers AI. artifact_receipt needs actual use; memoryFeedback needs independently verified use. procedure/evaluate manage recorded workflows/outcomes, not permission. Missing new fields: refresh the client after resident update; do not replace task identity or grants.',
    inputSchema: schemas.controllerLearning,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  }, async (args: any, ctx) => {
    const invocationContext = currentExternalInvocationContext();
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
          ...(input.retrievalPlan ? { retrievalPlan: input.retrievalPlan, taskId: input.taskId } : {}),
          ...(input.skillSearchMode ? { skillSearchMode: input.skillSearchMode } : {}),
          ...(ctx?.mcpReq?.signal ? { signal: ctx.mcpReq.signal } : {}),
          ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        }, host?.ownerId, invocationContext);
      } else if (input.action === 'episode') {
        const operation = input.episodeOperation ?? 'status';
        if (operation === 'recover') {
          if (!input.recoverySource) throw new Error('recoverySource required');
          result = await service.recoverHistory(input.recoverySource, input.applyRecovery === true);
        } else if (operation === 'start') {
          let binding: { ownerId: string; workspaceIdentityKey: string } | undefined;
          let workspace = input.workspace;
          if (host) {
            try {
              if (!host.ownerId || !input.taskKey?.trim() || !workspace?.trim()) throw new Error('missing task binding');
              const identity = host.workspaceIdentity(workspace);
              workspace = identity.name; binding = { ownerId: host.ownerId, workspaceIdentityKey: identity.key };
            } catch { throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE'); }
          }
          result = await service.startEpisode(sessionId, {
            ...(input.taskKey ? { taskKey: input.taskKey } : {}),
            ...(workspace ? { workspace } : {}),
            ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          }, binding);
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
          ...(input.memoryFeedback ? { memoryFeedback: input.memoryFeedback } : {}),
          ...(input.workspace ? { workspace: input.workspace } : {}),
        }, invocationContext);
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
      return appendSkillReminderCapsule(text(result), service, sessionId, input.workspace, invocationContext);
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
