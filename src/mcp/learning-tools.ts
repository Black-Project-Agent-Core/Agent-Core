import { McpServer } from '@modelcontextprotocol/server';
import type { LearningService } from '../learning/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { currentExternalInvocationContext, currentToolInvocationRequest } from '../tracker/tool-invocation.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { appendFailureLoopAdvisory, type FailureLoopAdvisor } from './failure-loop-advisor.js';
import * as schemas from './learning-schemas.js';
import { appendSkillReminderCapsule } from './external-controller-tool-support.js';
import type { MemoryScopeResolver } from '../memory/mcp/scope.js';
import { PENDING_REVIEW_STALE_MS, isStalePendingReview } from '../learning/triggers.js';
import { procedureScaffold } from '../learning/procedure-scaffold.js';

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
  externalCaller = false,
): void {
  server.registerTool('learning', {
    title: 'Agent Core Learning',
    description: 'Shared Learning owner. Checkpoint meaningful work with evidence/workspace; review with checkpointKeys/taskId, or a disposition when no candidates; backlog is the compact status. Memory writes do not finalize Learning. decision declares immutable forecasts, assesses observation/goal evidence, or inspects context/salience/calibration; stoppingContext covers optional verification stopping, and required checks and unresolved risk stay visible. External decisions need a host-bound taskId; native uses current task. Tool success is not goal success. Review, receipts, curation and journey grant no execution or policy activation.',
    inputSchema: schemas.learning.shape,
    annotations: { title: 'Agent Core Learning', readOnlyHint: false, destructiveHint: false },
  }, async (args: any, ctx) => {
    const invocationContext = currentExternalInvocationContext();
    const input = schemas.learning.parse(args);
    try {
      // Caller classification is host-owned; an unbound external invocation must
      // not slip into a native or taskless Learning write.
      const boundExternalTask = async () => {
        if (!externalCaller) return null;
        const unavailable = (reason: string): never => {
          throw new Error('LEARNING_EXTERNAL_SCOPE_UNAVAILABLE: ' + reason
            + '. Start/resume controller_learning action=episode episodeOperation=start with the same taskKey and registered workspace; use its returned taskId. Do not replay an uncertain write before checking status.');
        };
        if (!externalController || !externalSessionId || !resolveTaskScope) return unavailable('host-scope-unavailable');
        if (invocationContext?.binding !== 'bound') return unavailable(invocationContext?.unboundReason ?? 'invocation-unavailable');
        if (invocationContext.sessionId !== externalSessionId
          || currentToolInvocationRequest()?.identity.id !== invocationContext.invocationId
          || currentToolInvocationRequest()?.identity.processSessionId !== invocationContext.processSessionId
          || currentToolInvocationRequest()?.mutationContext.signal?.aborted
          || ctx?.mcpReq?.signal?.aborted
          || !await externalController.invocationTaskCurrent(invocationContext))
          return unavailable('task-changed-closed-or-cancelled');
        const externalTaskId = invocationContext.taskId;
        if (!externalTaskId) return unavailable('task-id-unavailable');
        const scope = await resolveTaskScope({ taskId: externalTaskId });
        if (scope.controllerId !== 'agent-core-external' || scope.taskId !== externalTaskId
          || scope.workspaceKey !== invocationContext.workspace
          || (input.taskId && input.taskId !== scope.taskId)
          || (input.workspace && input.workspace !== scope.workspaceKey))
          throw new Error('LEARNING_EXTERNAL_SCOPE_MISMATCH');
        if (!await externalController.invocationTaskCurrent(invocationContext)
          || currentToolInvocationRequest()?.mutationContext.signal?.aborted
          || ctx?.mcpReq?.signal?.aborted) return unavailable('task-changed-closed-or-cancelled');
        return scope;
      };
      let result: unknown;

      if (input.action === 'status') {
        result = await learning.status();
      } else if (input.action === 'backlog') {
        // The small answer to "what is waiting and what was decided lately"; `status` stays the full state.
        result = await learning.status({ view: 'compact' });
      } else if (input.action === 'decision') {
        if (!resolveTaskScope) throw new Error('LEARNING_DECISION_SCOPE_REQUIRED');
        const scope = await resolveTaskScope(input.taskId ? { taskId: input.taskId } : undefined);
        if (input.workspace && input.workspace !== scope.workspaceKey) throw new Error('LEARNING_DECISION_WORKSPACE_MISMATCH');
        result = await learning.decisionReview({ taskId: scope.taskId, workspace: scope.workspaceKey }, input.decision!, { readFiles: evidenceReadAllowed });
      } else if (input.action === 'checkpoint') {
        if (!input.idempotencyKey) throw new Error('idempotencyKey is required for action=checkpoint');
        const bound = await boundExternalTask();
        const taskId = bound?.taskId ?? input.taskId;
        const workspace = bound?.workspaceKey ?? input.workspace;
        result = await learning.checkpoint({
          idempotencyKey: input.idempotencyKey,
          ...(taskId ? { taskId } : {}),
          ...(input.meaningful !== undefined ? { meaningful: input.meaningful } : {}),
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.evidenceRefs ? { evidenceRefs: input.evidenceRefs } : {}),
          ...(input.summary ? { summary: input.summary } : {}),
          ...(workspace ? { workspace } : {}),
        });
        if (externalCaller && input.reason === 'verified-recovery' && (result as { advanced?: boolean }).advanced) {
          result = { ...(result as object), procedureScaffold: procedureScaffold(taskId) };
        }
        if (externalCaller && externalController && externalSessionId) {
          if (!(result as { advanced?:boolean; pendingReview?:unknown }).advanced
            && !(result as { pendingReview?:unknown }).pendingReview) {
            result = { ...(result as object), externalEpisodeLinkage: 'not-required' };
          } else try {
            const linked = await externalController.recordLearningCheckpoint(externalSessionId, workspace, input.idempotencyKey, taskId);
            result = { ...(result as object), externalEpisodeLinkage: linked ? 'recorded' : 'unavailable' };
          } catch {
            // Learning checkpoint remains durable; do not claim the mirror exists.
            result = { ...(result as object), externalEpisodeLinkage: 'unavailable' };
          }
        }
      } else if (input.action === 'review') {
        const bound = await boundExternalTask();
        let completedReplay: Record<string, { complete: boolean; status: string; taskId?: string; workspace?: string }> | undefined;
        let orphanNote: string | undefined;
        // The one sanctioned way to close checkpoints this session's task does not own: every key must be
        // pending, older than the stale threshold, and belong either to no task or to an external episode
        // that is closed or untouched for as long. A task id that is not an external episode (a Native
        // runtime task, or a pruned episode) is never assumed abandoned. A written reason is required.
        const abandonedCheckpointNote = async (keys: string[]): Promise<string> => {
          const pending = await learning.pendingReviewsFor(keys);
          const now = Date.now();
          const verdicts = pending.length === keys.length
            ? await Promise.all(pending.map(async (item) => {
              if (!isStalePendingReview(item, now)) return false;
              if (!item.taskId) return true;
              const activity = await externalController!.episodeActivity(item.taskId);
              return activity.exists && (activity.closed || now - activity.updatedAtMs > PENDING_REVIEW_STALE_MS);
            }))
            : [false];
          if (!verdicts.every(Boolean)) throw new Error('LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND: another task owns it. From here only a pending checkpoint older than 7 days whose task is closed or untouched as long can be closed, with a disposition and a written reason in summary.');
          const note = input.summary?.trim() ?? '';
          if (note.length < 20) throw new Error('LEARNING_ORPHAN_RESOLUTION_NOTE_REQUIRED');
          return note;
        };
        if (externalCaller) {
          if (!input.checkpointKeys?.length) throw new Error('LEARNING_EXTERNAL_CHECKPOINT_KEYS_REQUIRED');
          const current = await externalController!.getEpisode(externalSessionId!);
          if (!current || current.id !== bound?.taskId
            || currentToolInvocationRequest()?.mutationContext.signal?.aborted
            || ctx?.mcpReq?.signal?.aborted
            || !await externalController!.invocationTaskCurrent(invocationContext))
            throw new Error('LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND');
          const keys = input.checkpointKeys;
          const active = new Set(current.checkpointKeys ?? []);
          const missing = keys.filter(key => !active.has(key));
          if (missing.length) {
            // Only an exact already-closed, disposition-only replay is read-only.
            // Never reopen a foreign, unresolved or partly missing checkpoint.
            if (missing.length !== keys.length || input.candidates?.length || !input.disposition)
              throw new Error('LEARNING_EXTERNAL_CHECKPOINT_NOT_BOUND');
            const snapshot = await learning.status() as { state?: { reviewDecisions?: Record<string, {
              complete: boolean; status: string; taskId?: string; workspace?: string;
            }> } };
            const decisions = snapshot.state?.reviewDecisions ?? {};
            if (keys.every(key => decisions[key]?.complete === true
              && decisions[key]?.taskId === bound?.taskId
              && decisions[key]?.workspace === bound.workspaceKey
              && decisions[key]?.status === input.disposition)) {
              completedReplay = Object.fromEntries(keys.map(key => [key, decisions[key]!]));
            } else {
              orphanNote = await abandonedCheckpointNote(keys);
            }
          }
        }
        if (completedReplay) {
          result = { duplicate: true, checkpointDecisions: completedReplay, externalEpisodeLinkage: 'not-required',
            note: 'Previously completed keyed review; no new Learning or episode write.' };
        } else {
          result = await learning.review(input.candidates ?? [], input.explicit === true, {
            checkpointKeys: input.checkpointKeys, taskId: bound?.taskId ?? input.taskId,
            disposition: input.disposition,
            ...((bound?.workspaceKey ?? input.workspace) ? { workspace: bound?.workspaceKey ?? input.workspace } : {}),
            ...(orphanNote ? { orphanResolution: { note: orphanNote } } : {}),
          });
          if (externalCaller && externalController && externalSessionId) {
            const summary = (result as { summary?: { status?: string } })?.summary?.status ?? 'completed';
            // Publication needs the still-admitted task; the episode mirror below
            // may close it. Canonical review is already durable, so publication
            // failure is a separate partial result, never a reason to replay it.
            try{
              await boundExternalTask();
              result={...(result as object),proposalDocuments:await learning.publishExternalTaskSkillProposals({workspace:bound!.workspaceKey,taskId:bound!.taskId}),proposalReviewGuide:learning.hasSkillProposals()?learning.proposalReviewGuide():undefined};
            }catch{
              result={...(result as object),proposalDocuments:{status:'unavailable',reason:'EXTERNAL_PROPOSAL_PUBLICATION_UNAVAILABLE'}};
            }
            try {
              if (orphanNote) {
                const released = await externalController.releaseClosedCheckpoints((result as any).checkpointDecisions);
                result = { ...(result as object), externalEpisodeLinkage: 'not-required', orphanCheckpointsReleased: released };
              } else {
                const linked = await externalController.recordLearningReview(externalSessionId, summary,
                  (result as any).checkpointDecisions, bound?.taskId);
                result = { ...(result as object), externalEpisodeLinkage: linked ? 'recorded' : 'unavailable' };
              }
            } catch {
              result = { ...(result as object), externalEpisodeLinkage: 'unavailable' };
            }
          }
        }
      } else if (input.action === 'receipt') {
        const bound = await boundExternalTask();
        result = await learning.receipt({
          taskId: bound?.taskId ?? input.taskId, actionRefs: input.actionRefs,
          useId: input.useId!,
          retrievalAttemptId: input.retrievalAttemptId!,
          memoryId: input.memoryId!,
          contentDigest: input.contentDigest!,
          ...((bound?.workspaceKey ?? input.workspace) ? { workspace: bound?.workspaceKey ?? input.workspace } : {}),
          applicability: input.applicability!,
          result: input.result!,
          reasonCode: input.reasonCode!,
          evidenceRefs: input.evidenceRefs ?? [],
          ...(input.verificationRef ? { verificationRef: input.verificationRef } : {}),
          ...(input.summary ? { summary: input.summary } : {}),
        });
      } else if (input.action === 'curate') {
        result = externalCaller&&externalController?await externalController.curate(input.workspace):await learning.curate(input.workspace);
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
