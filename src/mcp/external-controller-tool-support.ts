import type { McpServer } from '@modelcontextprotocol/server';
import type { ExternalControllerLearningService, ExternalInvocationContext, ExternalAttributionStatus } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { beginToolInvocationEvidence, createToolInvocationIdentity, currentToolInvocationRequest,
  currentToolInvocationEvidence, currentExternalInvocationContext, withToolInvocationRequest,
  type ToolInvocationEvidence } from '../tracker/tool-invocation.js';
import { appendAutoCheckpointReceipt, attachAutoCheckpointError,
  type AutoCheckpointReceipt, type MutationExecutionContext } from '../rdc/mutation-coordinator.js';
import { recordExternalToolDetail } from '../tracker/tool-detail.js';
import { decideToolEvidenceCapture } from '../security/evidence-capture-policy.js';
import { redactSensitiveString } from '../security/redaction.js';
import { learning as learningInput } from './learning-schemas.js';
import { controllerLearning as controllerInput } from './controller-learning-schemas.js';
import {parseExternalImprovement} from '../learning/external-improvements.js';
import {normalizeExternalProcedure} from '../learning/external-procedure.js';

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
    const scopedLearning = name === 'learning' && ['checkpoint', 'review', 'receipt'].includes(args?.action);
    const scopedController = name === 'controller_learning' && (args?.action === 'improvement' || args?.action === 'procedure' && args?.payload !== undefined);
    const requiredSkillDelivery = name === 'skills' && ['list','inspect','search','read'].includes(args?.action);
    const parsed = scopedLearning ? learningInput.safeParse(args) : undefined;
    const controllerParsed = scopedController ? controllerInput.safeParse(args) : undefined;
    let resumeController=false;
    if(controllerParsed?.success)try{
      if(controllerParsed.data.action==='improvement')parseExternalImprovement(controllerParsed.data.payload);
      else normalizeExternalProcedure(controllerParsed.data.payload);
      resumeController=true;
    }catch{/* Invalid contracts cannot reconnect the Learning task head. */}
    const resumeTask = parsed?.success && (parsed.data.action === 'checkpoint' ? Boolean(parsed.data.idempotencyKey?.trim())
      : parsed.data.action === 'review' ? Boolean(parsed.data.checkpointKeys?.every(key => key.trim()) && (parsed.data.candidates?.length || parsed.data.disposition)) : true);
    const invocationContext = !authority.nativeTaskId && authority.external && authority.sessionId && args?.origin !== 'ui'
      ? await authority.external.captureToolInvocationContext({ invocationId: identity.id, processSessionId: identity.processSessionId,
          sessionId: authority.sessionId, ownerId: authority.ownerId,
          ...(scopedLearning || scopedController || requiredSkillDelivery
            ? { taskScope: { taskId: resumeTask || resumeController ? args.taskId : undefined, workspace: args.workspace, signal: ctx?.mcpReq?.signal } } : {}),
        }).catch(() => undefined) : undefined;
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
      // External calls only: never capture Native Agent payloads or UI-origin operations.
      const capture = !authority.nativeTaskId && args?.origin !== 'ui';
      const targets = [args?.path, args?.file_path, args?.source, args?.destination,
        ...(Array.isArray(args?.paths) ? args.paths : [])].filter((value): value is string => typeof value === 'string');
      const privateContent = ['controller_contract', 'image_inspect', 'artifact_inspect', 'get_recent_tool_calls'].includes(name)
        || name === 'browser_control'
        || targets.some(value => /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|secrets?|credentials?|\.ssh|\.aws|id_rsa|id_ed25519)(?:[\\/]|$)/i.test(value));
      const disposition = !capture || privateContent ? 'omit' : decideToolEvidenceCapture(name, args).disposition;
      const target = args?.file_path ?? args?.path ?? args?.destination ?? args?.pid ?? '';
      const safeTarget = disposition !== 'full' ? '[OMITTED by evidence policy]'
        : name === 'start_process' ? 'command submitted (see sanitized Request)'
        : redactSensitiveString(String(target)).slice(0, 120);
      const detailInvocation = capture ? beginToolInvocationEvidence(activityTracker, name, {
        readOnlyHint: config?.annotations?.readOnlyHint === true,
        durableInvocationId: ctx?.mcpReq?._meta?.['io.agentcore/invocation-id'],
        targetSummary: safeTarget,
      }) : undefined;
      if (detailInvocation) recordExternalToolDetail({tool:name, invocationId:identity.id,
        phase:'request', value:args, disposition});
      try {
        const result = await callback(args, ctx);
        const delivered = requested ? appendAutoCheckpointReceipt(result, receipt ?? { status: 'not-captured', reason: 'no-change' }) : result;
        if (detailInvocation) {
          recordExternalToolDetail({tool:name, invocationId:identity.id,
            phase:'response', value:delivered, disposition});
          detailInvocation.finish((delivered as ToolResult)?.isError ? 'handled-failure' : 'success');
        }
        return delivered;
      } catch (error) {
        if (detailInvocation) recordExternalToolDetail({tool:name, invocationId:identity.id,
          phase:'response', value:{isError:true, content:[{type:'text', text:error instanceof Error ? error.message : 'Tool exception'}]}, disposition});
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
    const skillText = input.tool === 'skills' && !result.isError
      && ['list','inspect','search','read'].includes(String((input.args as any)?.action))
      ? result.content.find(part => part?.type === 'text')?.text : undefined;
    // Skill delivery and its primary event share one awaited task-state commit.
    try {
      attributionStatus = await service.recordToolOutcome({ sessionId, tool: input.tool,
        argumentKeys: input.args && typeof input.args === 'object' ? Object.keys(input.args as Record<string,unknown>) : [],
        outcome: result.isError ? 'handled-failure' : 'success', readOnly: input.readOnly,
        invocationId: call?.invocation.id, invocationContext: context,
        ...(typeof skillText === 'string' ? { skillDelivery: { request: input.args, text: skillText,
          signal: currentToolInvocationRequest()?.mutationContext.signal } } : {}),
      });
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
