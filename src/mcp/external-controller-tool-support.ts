import type { McpServer } from '@modelcontextprotocol/server';
import type { ExternalControllerLearningService, ExternalInvocationContext, ExternalAttributionStatus } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { beginToolInvocationEvidence, createToolInvocationIdentity, currentToolInvocationRequest,
  currentToolInvocationEvidence, currentExternalInvocationContext, withToolInvocationRequest,
  type ToolInvocationEvidence } from '../tracker/tool-invocation.js';
import { appendAutoCheckpointReceipt, attachAutoCheckpointError,
  type AutoCheckpointReceipt, type MutationExecutionContext } from '../rdc/mutation-coordinator.js';

type ToolResult = { content: Array<any>; isError?: boolean; [key: string]: unknown };
export interface ExternalControllerToolCall {
  readonly invocation: ToolInvocationEvidence;
  readonly invocationContext?: ExternalInvocationContext;
}
export function beginExternalControllerToolCall(tool: string): ExternalControllerToolCall {
  return Object.freeze({ invocation: beginToolInvocationEvidence(activityTracker, tool),
    invocationContext: currentExternalInvocationContext() });
}

/** Install inside existing grant/admission, outside all observational family wrappers. */
export function installInvocationContext(server: McpServer, host: {
  external?: ExternalControllerLearningService; sessionId?: string; ownerId?: string;
  nativeTaskId?: string; checkpointGranted: boolean;
}): void {
  const target = server as any, original = target.registerTool.bind(server);
  const authority = Object.freeze({ ...host });
  target.registerTool = (name: string, config: any, callback: any) => original(name, config, async (args: any, ctx: any) => {
    const identity = createToolInvocationIdentity();
    const invocationContext = !authority.nativeTaskId && authority.external && authority.sessionId && args?.origin !== 'ui'
      ? await authority.external.captureToolInvocationContext({ invocationId: identity.id, processSessionId: identity.processSessionId,
          sessionId: authority.sessionId, ownerId: authority.ownerId }).catch(() => undefined) : undefined;
    const requested = args?.autoCheckpoint === true && ['write_file','edit_block','move_file','code_refactor'].includes(name);
    let receipt: AutoCheckpointReceipt | undefined = requested ? Object.freeze({ status: 'not-captured', reason: 'no-change' }) : undefined;
    const mutationContext: MutationExecutionContext = Object.freeze({ invocationId: identity.id,
      ...(authority.nativeTaskId || invocationContext?.taskId ? { taskId: authority.nativeTaskId ?? invocationContext?.taskId } : {}),
      invocationContext, checkpointGranted: authority.checkpointGranted,
      signal: ctx?.mcpReq?.signal,
      reportAutoCheckpoint: (value: AutoCheckpointReceipt) => { receipt = Object.freeze({ ...value }); },
    });
    const request = Object.freeze({ tool: name, identity, invocationContext, mutationContext, checkpointReceipt: () => receipt });
    return withToolInvocationRequest(request, async () => {
      try {
        const result = await callback(args, ctx);
        return requested ? appendAutoCheckpointReceipt(result, receipt ?? { status: 'not-captured', reason: 'no-change' }) : result;
      } catch (error) {
        if (requested) {
          receipt ??= { status: 'not-captured', reason: 'capture-failed' };
          attachAutoCheckpointError(error, receipt);
        }
        const invocation = currentToolInvocationEvidence();
        if (invocation) {
          let attributionStatus: ExternalAttributionStatus = 'unbound';
          if (authority.external && authority.sessionId) {
            attributionStatus = await authority.external.recordToolOutcome({ sessionId: authority.sessionId, tool: name,
              argumentKeys: Object.keys(args ?? {}), outcome: 'exception', readOnly: config?.annotations?.readOnlyHint === true,
              invocationId: invocation.id, invocationContext }).catch(() => 'late-unavailable' as const);
          }
          invocation.fail(error, { attributionStatus });
        }
        throw error;
      }
    });
  });
}

function appendCapsule(result: ToolResult, capsule: string): ToolResult {
  if (!capsule) return result;
  return { ...result, content: [...(Array.isArray(result.content) ? result.content : []), { type: 'text', text: capsule.slice(0,5_000) }] };
}
const reminderExposures = new WeakMap<object, Set<string>>();
export async function appendSkillReminderCapsule(result: ToolResult, service?: ExternalControllerLearningService,
  sessionId?: string, workspace?: string, context?: ExternalInvocationContext): Promise<ToolResult> {
  if (!service || !sessionId || !context || context.sessionId !== sessionId || !service.skillProposalNotices) return result;
  try {
    if (!await service.invocationDisclosureCurrent(context)) return result;
    const notices = await service.skillProposalNotices(sessionId, workspace, context);
    const seen = reminderExposures.get(service) ?? new Set<string>();
    const fresh = notices.filter(notice => !seen.has(context.taskId + ':' + notice.proposalId + ':' + notice.revisionDigest));
    const header = 'SKILL PROPOSAL REMINDER — Include this proposal in the user-facing response in this session. Tool exposure is not delivery. Do not claim activation.\n';
    let capsule = header;
    const added: string[] = [];
    for (const notice of fresh) {
      const text = (capsule === header ? '' : '\n\n') + notice.text;
      if (capsule.length + text.length > 5_000) continue;
      capsule += text;
      added.push(context.taskId + ':' + notice.proposalId + ':' + notice.revisionDigest);
    }
    if (capsule === header || !await service.invocationDisclosureCurrent(context)) return result;
    for (const key of added) seen.add(key);
    while (seen.size > 4_096) seen.delete(seen.values().next().value!);
    reminderExposures.set(service, seen);
    return appendCapsule(result, capsule);
  } catch { return result; }
}

export async function externalControllerToolResult(input: {
  service?: ExternalControllerLearningService; sessionId?: string; call?: ExternalControllerToolCall;
  tool: string; args: unknown; result: ToolResult; readOnly: boolean; workspace?: string; repeated?: boolean;
}): Promise<any> {
  const { service, sessionId, call } = input;
  const context = call?.invocationContext;
  let result = input.result;
  let attributionStatus: ExternalAttributionStatus = 'unbound';
  if (service && sessionId) {
    // Persist the primary outcome before optional recall/notices spend the shared observer budget.
    try {
      attributionStatus = await service.recordToolOutcome({ sessionId, tool: input.tool,
        argumentKeys: input.args && typeof input.args === 'object' ? Object.keys(input.args as Record<string,unknown>) : [],
        outcome: result.isError ? 'handled-failure' : 'success', readOnly: input.readOnly,
        invocationId: call?.invocation.id, invocationContext: context });
    } catch { attributionStatus = context?.binding === 'bound' ? 'late-unavailable' : 'unbound'; }
    if (result.isError) {
      try {
        const prior = await service.failureContext({ sessionId, tool: input.tool, args: input.args, failure: input.result,
          invocationContext: context, repeated: input.repeated === true });
        if (prior.capsule && await service.invocationDisclosureCurrent(context)) {
          result = appendCapsule(result, prior.capsule);
          if (prior.deliveredMemories.length) await service.recordMemoryRecall(sessionId,
            context?.workspace, prior.deliveredMemories, context);
        }
      } catch {}
    }
  }
  call?.invocation.finish(result.isError ? 'handled-failure' : 'success', { attributionStatus });
  return appendSkillReminderCapsule(result, service, sessionId, input.workspace, context);
}
