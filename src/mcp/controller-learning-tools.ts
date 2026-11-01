import { McpServer } from '@modelcontextprotocol/server';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { currentExternalInvocationContext, currentToolInvocationRequest } from '../tracker/tool-invocation.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import * as schemas from './controller-learning-schemas.js';
import { jsonTextResult as text } from './text-result.js';
import { appendSkillReminderCapsule } from './external-controller-tool-support.js';
import { browserControlService } from '../rdc/browser-control/service.js';
import type { BrowserShapeSelection } from '../rdc/browser-control/procedure-context.js';

export function registerControllerLearningTools(
  server: McpServer,
  service: ExternalControllerLearningService,
  sessionId: string,
  host?: { ownerId: string; workspaceIdentity: (workspace: string) => { name: string; key: string };
    browserAllowed: boolean },
): void {
  server.registerTool('controller_learning', {
    title: 'External Controller Learning',
    description: 'Host-bound episodes, context and receipts. Start with stable taskKey, registered workspace and description(goal) to link resumable Memory; use returned taskId. Memory checkpoints are separate from Learning finalization. episode/verify needs exact taskId. Planned context: matching query/rootQuery, active taskId, 2–4 q1–q4 questions, limit 1–8. Embeds may receive queries; deadline stops local waiting only. Skill hybrid requires consent. Artifact receipts require actual use. status exposes structured payload guides for improvement, procedure and evaluate; none grants permissions. browserObservation selects a grant-gated advisory snapshot for context/procedure inspect. Refresh after schema updates.',
    inputSchema: schemas.controllerLearning,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  }, async (args: any, ctx) => {
    const invocationContext = currentExternalInvocationContext();
    const started = Date.now();
    const input = schemas.controllerLearning.parse(args ?? {});
    const selectBrowser = input.browserObservation ? ():BrowserShapeSelection => {
      if (!host?.browserAllowed || invocationContext?.binding !== 'bound'
        || invocationContext.ownerId !== host.ownerId)
        return {status:'unknown',reason:'browser-grant-or-host-binding-unavailable'};
      return browserControlService.selectProcedureObservation(input.browserObservation!,invocationContext);
    } : undefined;
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
          ...(selectBrowser ? {browserSelection:selectBrowser} : {}),
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
            const unavailable = (reason: string): never => {
              throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE: ' + reason
                + '. Start controller_learning action=episode episodeOperation=start with a stable taskKey and registered workspace. Host owner must be available; do not substitute an unrelated workspace.');
            };
            if (!host.ownerId) unavailable('owner-unavailable');
            if (!input.taskKey?.trim()) unavailable('task-key-required');
            if (!workspace?.trim()) unavailable('workspace-required');
            try {
              const identity = host.workspaceIdentity(workspace!);
              workspace = identity.name; binding = { ownerId: host.ownerId, workspaceIdentityKey: identity.key };
            } catch { unavailable('workspace-unregistered-or-unavailable'); }
          }
          result = await service.startEpisode(sessionId, {
            ...(input.taskKey ? { taskKey: input.taskKey } : {}),
            ...(workspace ? { workspace } : {}),
            ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
            ...(input.description ? {description:input.description}:{}),
          }, binding);
        } else if (operation === 'label') {
          result = await service.labelEpisode(sessionId, {
            ...(input.workspace ? { workspace: input.workspace } : {}),
            ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          });
        } else if (operation === 'verify') {
          result = await service.verifyEpisode(sessionId, {
            taskId: input.taskId!,
            outcome: input.episodeOutcome!,
            verificationRef: input.verificationRef!,
            evidenceRefs: input.evidenceRefs ?? [],
            ...(input.summary ? { summary: input.summary } : {}),
            ...(input.workspace ? { workspace: input.workspace } : {}),
            ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          }, invocationContext);
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
      } else if (input.action === 'improvement') {
        if (invocationContext?.binding !== 'bound' || input.taskId !== invocationContext.taskId
          || currentToolInvocationRequest()?.identity.id !== invocationContext.invocationId)
          throw new Error('IMPROVEMENT_SCOPE_UNAVAILABLE');
        result = await service.improvement(sessionId, input.payload, invocationContext, ctx?.mcpReq?.signal);
      } else if (input.action === 'procedure') {
        result = await service.procedure(sessionId, {
          operation: input.procedureOperation ?? 'list',
          ...(input.payload ? {payload:input.payload,taskId:input.taskId,signal:ctx?.mcpReq?.signal} : {}),
          ...(selectBrowser ? {browserSelection:selectBrowser} : {}),
          ...(invocationContext?.binding === 'bound' ? {invocationContext} : {}),
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
          ...(input.payload ? {payload:input.payload} : {}),
          ...(input.workspace ? { workspace: input.workspace } : {}),
          ...(input.taskFamily ? { taskFamily: input.taskFamily } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        });
      }
      if (input.action === 'episode' && input.episodeOperation === 'start'
        && result && typeof result === 'object' && 'memoryBinding' in result
        && 'id' in result && typeof result.id === 'string') {
        const next = { advisory: true, status: 'active',
          taskId: result.id, nextTool: 'controller_learning',
          nextAction: 'context-if-needed',
          instruction: 'Use this host-returned taskId as memory_v2 scope.taskId; recall is optional and not proof of use.' };
        if (Buffer.byteLength(JSON.stringify({ ...result, workflowNext: next }), 'utf8') <= 64 * 1024)
          result = { ...result, workflowNext: next };
      }
      if ((input.action === 'status' || input.action === 'context'
        || input.action === 'episode' && ['status', 'verify'].includes(input.episodeOperation ?? 'status'))
        && result && typeof result === 'object' && !Array.isArray(result)) {
        const next = await service.workflowNext(sessionId, invocationContext);
        // A bounded advisory never displaces a selected Memory disclosure.
        if (Buffer.byteLength(JSON.stringify({ ...result, workflowNext: next }), 'utf8') <= 64 * 1024)
          result = { ...result, workflowNext: next };
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
