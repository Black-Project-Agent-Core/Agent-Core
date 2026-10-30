import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { installCredentialToolGrant, credentialAllowsTool } from '../auth/tool-grant.js';
import { installCapabilityObservation } from './capability-observation.js';
import { CAPABILITY_USE_CONTRACT } from '../capability-awareness.js';
import { AGENT_CORE_VERSION } from '../version.js';
import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import type { LearningService } from '../learning/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import type { SemanticIdeService } from '../semantic-ide/service.js';
import type { MemoryService } from '../memory/service.js';
import type { MemoryService as ExperienceMemoryService } from '../memory/facade.js';
import { registerMemoryExperienceTools } from '../memory/mcp/experience-tools.js';
import { memoryCredentialOwner, ownerScopedLearningSession, createMemoryScopeResolver, createExternalMemoryRecallAdmission } from '../memory/mcp/scope.js';
import type { SkillService } from '../skills/service.js';
import type { WebResearchService } from '../web-research/service.js';
import { registerWebResearchTools } from './web-research-tools.js';
import type { McpMutationSafety } from './mutation-safety.js';
import { installMcpMutationSafety } from './mutation-safety.js';
import * as handlers from '../rdc/handlers/index.js';
import { getConfig, setConfigValue } from '../rdc/tools/config.js';
import { getUsageStats } from '../rdc/tools/usage.js';
import { giveFeedbackToDesktopCommander } from '../rdc/tools/feedback.js';
import { getPrompts } from '../rdc/tools/prompts.js';
import { createImageInspector, imageInspectSchema } from '../rdc/tools/image-inspect.js';
import { toolHistory } from '../rdc/utils/toolHistory.js';
import { usageTracker } from '../rdc/utils/usageTracker.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { beginToolInvocationEvidence, currentExternalInvocationContext, currentToolInvocationRequest, takeBrowserObservationUse } from '../tracker/tool-invocation.js';
import { loadAgentProtocol } from './agent-protocol.js';
import { InProcessToolHost } from './in-process-tool-host.js';
import { ControllerContractGate, CONTRACT_INSTRUCTIONS, installControllerContract, type ControllerContractBinding } from './controller-contract.js';
import { registerRestartTool } from './restart-tool.js';
import { registerExternalReconstructionHarnessTool } from './external-reconstruction-harness-tools.js';
import { annotateFailureLoopException, appendFailureLoopAdvisory, type FailureLoopAdvisory, type FailureLoopAdvisor } from './failure-loop-advisor.js';
import { registerCodeIntelligenceTools } from './code-intelligence-tools.js';
import { registerLearningTools } from './learning-tools.js';
import { registerControllerLearningTools } from './controller-learning-tools.js';
import { registerMemoryTools } from '../memory/mcp/tools.js';
import { registerSemanticIdeTools } from './semantic-ide-tools.js';
import { registerSkillsTools } from './skills-tools.js';
import { registerPhoneTools } from './phone-tools.js';
import { registerNativeChatBridgeTool } from './native-chat-bridge-tools.js';
import { PHONE_SKILL_INSTRUCTIONS } from './phone-protocol.js';
import type { PhoneController } from '../phone/controller.js';
import * as schemas from './rdc-schemas.js';
import { RDC_TOOL_METADATA, EXTERNAL_BROWSER_DESCRIPTION } from './rdc-tool-metadata.js';
import { installInvocationContext } from './external-controller-tool-support.js';
import type { ArtifactAuthorization } from '../auth/artifact-authorization.js';
import { registerArtifactInspectTool } from './artifact-inspect-tools.js';
import { registerReconstructionHarnessTool } from './reconstruction-harness-tools.js';
import type { MutationExecutionContext } from '../rdc/mutation-coordinator.js';
import type { ExternalAttributionStatus } from '../learning/external-controller.js';
import { applyResultBudget } from './result-budget.js';
import type { NativeSkillSettings } from '../native-skill-settings.js';
import {
  decideToolEvidenceCapture,
  type EvidenceCaptureDecision,
} from '../security/evidence-capture-policy.js';

export const SERVER_NAME = 'agent-core';
export const SERVER_VERSION = AGENT_CORE_VERSION;

export interface AgentCoreMcpRuntime {
  imageInspector?: ReturnType<typeof createImageInspector>;
  memoryService?: MemoryService;
  memoryExperience?: ExperienceMemoryService;
  phoneController?: PhoneController;
  codeIntelligence?: CodeIntelligenceService;
  learningService?: LearningService;
  externalControllerLearning?: ExternalControllerLearningService;
  controllerSessionId?: string;
  nativeTaskId?: string;
  nativeWorkspace?: string;
  /** A plain in-process registry to register the tools into instead of building an MCP server (Native turns). */
  toolTarget?: unknown;
  controllerContract?: ControllerContractBinding;
  controllerBootstrap?: string;
  semanticIde?: SemanticIdeService;
  skillsService?: SkillService;
  /** Skills the owner switched off for Native; read only on the Native instance (nativeTaskId set). */
  nativeSkillSettings?: NativeSkillSettings;
  webResearch?: WebResearchService;
  failureLoopAdvisor?: FailureLoopAdvisor;
  mutationSafety?: McpMutationSafety;
  artifactAuthorization?: ArtifactAuthorization;
  proposalDecisionAuthorizer?: (principalId: string, workspace: string) => Promise<boolean>;
}

type ToolResult = { content: Array<Record<string, unknown>>; isError?: boolean; [key: string]: unknown };
type Handler = (args: any, context?: MutationExecutionContext) => Promise<ToolResult>;

const advisorByServer = new WeakMap<McpServer, FailureLoopAdvisor>();
const externalLearningByServer = new WeakMap<McpServer, ExternalControllerLearningService>();
const externalSessionByServer = new WeakMap<McpServer, string>();

function recordFailureLoopAdvisory(toolName: string, advisory: FailureLoopAdvisory): void {
  activityTracker.record(
    'REFLEXION',
    advisory.strength === 'no-progress' ? 'warn' : 'info',
    advisory.message,
    'failure-loop-advisory',
    {
      tool: toolName,
      repeatCount: advisory.repeatCount,
      scope: advisory.scope,
      failureFamily: advisory.failureFamily,
    },
  );
}

function appendExternalLearningCapsule(result: ToolResult, capsule: string | undefined): ToolResult {
  if (!capsule?.trim()) return result;
  return {
    ...result,
    content: [
      ...(Array.isArray(result.content) ? result.content : []),
      { type: 'text', text: capsule.slice(0, 5_000) },
    ],
  };
}

function annotateExternalLearningException(error: unknown, capsule: string | undefined): unknown {
  if (!capsule?.trim() || !(error instanceof Error)) return error;
  const suffix = capsule.slice(0, 4_000);
  if (!error.message.includes(suffix)) error.message = error.message + '\n' + suffix;
  return error;
}

const tool = (server: McpServer, name: keyof typeof RDC_TOOL_METADATA, _title: string, schema: any, handler: Handler, _readOnly = false, description?: string) => {
  const metadata = RDC_TOOL_METADATA[name];
  const { title: annotationTitle, ...behaviorHints } = metadata.annotations;
  server.registerTool(name, {
    title: metadata.title,
    // Remove transport-only whitespace; preserve instruction text and nested list offsets.
    description: (description ?? metadata.description).replace(/^[ \t]{24}/gm, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
    inputSchema: schema,
    annotations: annotationTitle === metadata.title ? behaviorHints : metadata.annotations,
  }, async (args: any, ctx: any) => {
    const started = Date.now();
    const input = args ?? {};
    const trackCall = input.origin !== 'ui';
    const advisor = trackCall ? advisorByServer.get(server) : undefined;
    const externalLearning = trackCall ? externalLearningByServer.get(server) : undefined;
    const externalSessionId = trackCall ? externalSessionByServer.get(server) : undefined;
    const workspace = typeof input.workspace === 'string' ? input.workspace.trim().slice(0, 120) : undefined;
    const invocation = trackCall ? beginToolInvocationEvidence(activityTracker, name, {
      durableInvocationId: ctx?.mcpReq?._meta?.['io.agentcore/invocation-id'],
      readOnlyHint: metadata.annotations.readOnlyHint === true,
      destructiveHint: 'destructiveHint' in metadata.annotations && metadata.annotations.destructiveHint === true,
      idempotentHint: 'idempotentHint' in metadata.annotations && metadata.annotations.idempotentHint === true,
    }) : undefined;
    const invocationContext = currentExternalInvocationContext();
    const privateBrowserCall = name === 'browser_control' && (String(input.action).startsWith('conversation_')
      || (input.action === 'open' && input.mode === 'conversation'));
    const captureDecision: EvidenceCaptureDecision | undefined = trackCall
      ? privateBrowserCall ? { disposition: 'metadata-only', policyState: 'inactive', pathCount: 0, ruleCount: 0, markerCount: 0,
          reason: 'conversation-content-transport-only' } : decideToolEvidenceCapture(name, input)
      : undefined;
    const metadataOnly = name === 'image_inspect' || privateBrowserCall;
    const observationArgs = metadataOnly ? { argumentKeys: Object.keys(input) } : input;
    const imageFailure = new Error('Image inspection failed; detail omitted by metadata-only policy');
    const privateFailure = privateBrowserCall ? new Error('Conversation control failed; detail omitted by metadata-only policy') : imageFailure;
    const captureContext = captureDecision && (captureDecision.policyState !== 'inactive' || captureDecision.disposition !== 'full')
      ? {
          evidenceCapture: captureDecision.disposition,
          evidencePolicyState: captureDecision.policyState,
          evidencePathCount: captureDecision.pathCount,
        }
      : {};
    try {
      const result = await handler(input, currentToolInvocationRequest()?.mutationContext);
      const durationMs = Date.now() - started;
      let finalResult = await applyResultBudget(name, result, privateBrowserCall
        ? { budgetChars: 1024 * 1024, persist: false } : undefined);
      let attributionStatus: ExternalAttributionStatus = 'unbound';
      if (externalLearning && externalSessionId) {
        attributionStatus = await externalLearning.recordToolOutcome({ sessionId: externalSessionId, tool: name,
          argumentKeys: Object.keys(input), outcome: finalResult.isError ? 'handled-failure' : 'success',
          readOnly: metadata.annotations.readOnlyHint === true, invocationId: invocation?.id, invocationContext,
        }).catch(() => 'late-unavailable' as const);
      }
      let advisory: FailureLoopAdvisory | undefined;
      if (advisor) {
        if (result.isError) {
          advisory = advisor.observeFailure(name, observationArgs, metadataOnly ? privateFailure : result);
          if (advisory) {
            finalResult = appendFailureLoopAdvisory(finalResult, advisory) as ToolResult;
            recordFailureLoopAdvisory(name, advisory);
          }
        } else {
          advisor.observeSuccess(name, observationArgs);
        }
      }
      if (result.isError && externalLearning && externalSessionId) {
        try {
          const prior = await externalLearning.failureContext({
            sessionId: externalSessionId,
            tool: name,
            args: observationArgs,
            failure: metadataOnly ? privateFailure : result,
            ...(workspace ? { workspace } : {}),
            repeated: Boolean(advisory), invocationContext,
          });
          if (prior.capsule && await externalLearning.invocationDisclosureCurrent(invocationContext)) {
            finalResult = appendExternalLearningCapsule(finalResult, prior.capsule);
            if (prior.deliveredMemories.length) await externalLearning.recordMemoryRecall(externalSessionId,
              invocationContext?.workspace, prior.deliveredMemories, invocationContext);
          }
        } catch (error) {
          activityTracker.captureFailure('LEARNING', error, 'external-failure-context-failure', { tool: name });
        }
      }
      if (trackCall) {
        try {
          if (name !== 'get_recent_tool_calls') {
            toolHistory.addCall(name, input, finalResult as any, durationMs, captureDecision);
          }
        } catch (error) {
          activityTracker.captureFailure('HISTORY', error, 'tool-history-write-failure', { tool: name });
        }
        try {
          if (finalResult.isError) await usageTracker.trackFailure(name); else await usageTracker.trackSuccess(name);
        } catch (error) {
          activityTracker.captureFailure('USAGE', error, 'tool-usage-write-failure', { tool: name });
        }
        const browserUse = name === 'browser_control' ? takeBrowserObservationUse() : undefined;
        const browserUseAdmitted = Boolean(browserUse && input.action === 'act'
          && !finalResult.isError && attributionStatus === 'attributed'
          && !currentToolInvocationRequest()?.mutationContext.signal?.aborted
          && externalLearning && await externalLearning.invocationDisclosureCurrent(invocationContext));
        invocation?.finish(finalResult.isError ? 'handled-failure' : 'success', { attributionStatus,
          argumentKeys: Object.keys(input),
          ...captureContext,
          ...(browserUseAdmitted ? { browserObservationUse: browserUse } : {}),
          // Invocation settlement is metadata-only; the existing response/history owners retain their own policy.
        });
      }
      return finalResult as any;
    } catch (error) {
      let finalError = error;
      let attributionStatus: ExternalAttributionStatus = 'unbound';
      if (externalLearning && externalSessionId) {
        attributionStatus = await externalLearning.recordToolOutcome({ sessionId: externalSessionId, tool: name,
          argumentKeys: Object.keys(input), outcome: 'exception', readOnly: metadata.annotations.readOnlyHint === true,
          invocationId: invocation?.id, invocationContext,
        }).catch(() => 'late-unavailable' as const);
      }
      let advisory: FailureLoopAdvisory | undefined;
      if (advisor) {
        advisory = advisor.observeFailure(name, observationArgs, metadataOnly ? privateFailure : error);
        if (advisory) {
          recordFailureLoopAdvisory(name, advisory);
          finalError = annotateFailureLoopException(error, advisory);
        }
      }
      if (externalLearning && externalSessionId) {
        try {
          const prior = await externalLearning.failureContext({
            sessionId: externalSessionId,
            tool: name,
            args: observationArgs,
            failure: metadataOnly ? privateFailure : error,
            ...(workspace ? { workspace } : {}),
            repeated: Boolean(advisory), invocationContext,
          });
          if (prior.capsule && finalError instanceof Error && await externalLearning.invocationDisclosureCurrent(invocationContext)) {
            finalError = annotateExternalLearningException(finalError, prior.capsule);
            if (prior.deliveredMemories.length) await externalLearning.recordMemoryRecall(externalSessionId,
              invocationContext?.workspace, prior.deliveredMemories, invocationContext);
          }
        } catch (learningError) {
          activityTracker.captureFailure('LEARNING', learningError, 'external-failure-context-failure', { tool: name });
        }
      }
      const failureContext = { argumentKeys: Object.keys(input), ...captureContext };
      const persistedError = captureDecision?.disposition === 'metadata-only' || captureDecision?.disposition === 'omit'
        ? new Error('Tool invocation failed; detail omitted by workspace evidence policy')
        : finalError;
      if (invocation) invocation.fail(persistedError, { ...failureContext, attributionStatus });
      else activityTracker.captureFailure('MCP', persistedError, 'tool-exception', {
        tool: name,
        durationMs: Date.now() - started,
        ...failureContext,
      });
      throw finalError;
    }
  });
};

export function createAgentCoreMcpServer(key?: unknown, runtime: AgentCoreMcpRuntime = {}): McpServer {
  const memoryOwner = memoryCredentialOwner(key);
  const browserCaller = JSON.stringify(runtime.nativeTaskId
    ? ['native', runtime.nativeTaskId, runtime.nativeWorkspace]
    : ['external', memoryOwner ?? randomUUID(), runtime.controllerSessionId ?? randomUUID()]);
  // Every observer and Learning tool uses the same owner-scoped namespace.
  // Keep the transport helper unchanged: only explicit episodes identify tasks.
  if (runtime.memoryExperience && !runtime.nativeTaskId && runtime.controllerSessionId && memoryOwner) {
    runtime = { ...runtime, controllerSessionId: ownerScopedLearningSession(memoryOwner, runtime.controllerSessionId) };
  }
  const workspaceRegistry = runtime.memoryExperience ?? runtime.memoryService;
  // A registry target is not a protocol endpoint: it has no instructions to send, so the contract is not read for it.
  const baseInstructions = runtime.toolTarget ? '' : loadAgentProtocol();
  const contextualInstructions = runtime.controllerBootstrap?.trim()
    ? `${baseInstructions}\n\n${runtime.controllerBootstrap.trim()}`
    : baseInstructions;
  const instructions = runtime.phoneController?.enabled
    ? `${contextualInstructions}\n\n${PHONE_SKILL_INSTRUCTIONS}`
    : contextualInstructions;
  // Only registerTool is used on the target, and the wrappers below hang on that one method, so a registry works unchanged.
  const server = (runtime.toolTarget ?? new McpServer(
    { name: SERVER_NAME, title: 'Agent Core', version: SERVER_VERSION },
    { instructions: instructions + '\n\n' + CAPABILITY_USE_CONTRACT + (runtime.nativeTaskId ? '' : '\n\n' + CONTRACT_INSTRUCTIONS) },
  )) as McpServer;
  if (!runtime.nativeTaskId && !runtime.toolTarget) installControllerContract(server, runtime.controllerContract ?? {
    gate: new ControllerContractGate(), binding: 'in-memory-server',
  });
  // The outer transport boundary also counts capability notices appended by
  // registration wrappers after the ordinary history/evidence result budget.
  const registerTool = server.registerTool.bind(server);
  (server as any).registerTool = (name: string, config: any, callback: any) => registerTool(name, config,
    (name === 'image_inspect' || name === 'artifact_inspect')
      ? async (args: any, ctx: any) => applyResultBudget(name, await callback(args, ctx)) as any
      : callback);
  installCredentialToolGrant(server, key);
  if (runtime.failureLoopAdvisor) advisorByServer.set(server, runtime.failureLoopAdvisor);
  if (runtime.externalControllerLearning && runtime.controllerSessionId) {
    externalLearningByServer.set(server, runtime.externalControllerLearning);
    externalSessionByServer.set(server, runtime.controllerSessionId);
  }
  if (runtime.mutationSafety) {
    const callerId = typeof key === 'object' && key !== null && typeof (key as { id?: unknown }).id === 'string'
      ? (key as { id: string }).id
      : 'unknown-caller';
    installMcpMutationSafety(server, runtime.mutationSafety, callerId);
  }
  installInvocationContext(server, { external: runtime.externalControllerLearning, sessionId: runtime.controllerSessionId,
    ownerId: memoryOwner, nativeTaskId: runtime.nativeTaskId, checkpointGranted: credentialAllowsTool(key, 'file_checkpoint') });
  if (!runtime.nativeTaskId) installCapabilityObservation(server, key, runtime.externalControllerLearning, runtime.controllerSessionId);
  tool(server, 'get_config', 'Get Configuration', schemas.getConfig, async () => getConfig() as any, true);
  tool(server, 'set_config_value', 'Set Configuration Value', schemas.setConfigValue, setConfigValue as any);
  tool(server, 'read_file', 'Read File or URL', schemas.readFile, handlers.handleReadFile as any, true);
  tool(server, 'image_inspect', 'Inspect Local Image', imageInspectSchema,
    runtime.imageInspector ?? createImageInspector(), true);
  tool(server, 'read_multiple_files', 'Read Multiple Files', schemas.readMultipleFiles, handlers.handleReadMultipleFiles as any, true);
  tool(server, 'write_file', 'Write File', schemas.writeFile, handlers.handleWriteFile as any);
  tool(server, 'write_pdf', 'Write/Modify PDF', schemas.writePdf, handlers.handleWritePdf as any);
  tool(server, 'create_directory', 'Create Directory', schemas.createDirectory, handlers.handleCreateDirectory as any);
  tool(server, 'list_directory', 'List Directory Contents', schemas.listDirectory, handlers.handleListDirectory as any, true);
  tool(server, 'move_file', 'Move/Rename File', schemas.moveFile, handlers.handleMoveFile as any);
  tool(server, 'file_checkpoint', 'File Checkpoint', schemas.fileCheckpoint, handlers.handleFileCheckpoint as any);
  tool(server, 'browser_control', 'Browser Control',
    runtime.nativeTaskId ? schemas.browserControl : schemas.externalBrowserControl,
    async (args, context) => handlers.handleBrowserControl(args, context, !runtime.nativeTaskId,
      JSON.stringify([browserCaller, context?.taskId, context?.invocationContext?.workspaceIdentityKey,
        context?.invocationContext?.processSessionId])) as any,
    false, runtime.nativeTaskId ? undefined : EXTERNAL_BROWSER_DESCRIPTION);

  tool(server, 'start_search', 'Start Search', schemas.startSearch, handlers.handleStartSearch as any, true);
  tool(server, 'get_more_search_results', 'Get Search Results', schemas.getMoreSearchResults, handlers.handleGetMoreSearchResults as any, true);
  tool(server, 'stop_search', 'Stop Search', schemas.stopSearch, handlers.handleStopSearch as any);
  tool(server, 'list_searches', 'List Active Searches', schemas.listSearches, async () => handlers.handleListSearches() as any, true);
  tool(server, 'get_file_info', 'Get File Information', schemas.getFileInfo, handlers.handleGetFileInfo as any, true);
  tool(server, 'edit_block', 'Edit Block', schemas.editBlock, handlers.handleEditBlock as any);
  tool(server, 'start_process', 'Start Terminal Process', schemas.startProcess, handlers.handleStartProcess as any);
  tool(server, 'read_process_output', 'Read Process Output', schemas.readProcessOutput, handlers.handleReadProcessOutput as any, true);
  tool(server, 'interact_with_process', 'Interact With Process', schemas.interactWithProcess, handlers.handleInteractWithProcess as any);
  tool(server, 'force_terminate', 'Force Terminate Session', schemas.forceTerminate, handlers.handleForceTerminate as any);
  tool(server, 'list_sessions', 'List Sessions', schemas.listSessions, async () => handlers.handleListSessions() as any, true);
  tool(server, 'list_processes', 'List Processes', schemas.listProcesses, async () => handlers.handleListProcesses() as any, true);
  tool(server, 'kill_process', 'Kill Process', schemas.killProcess, handlers.handleKillProcess as any);

  tool(server, 'get_usage_stats', 'Get Usage Statistics', schemas.getUsageStats, async () => getUsageStats() as any, true);
  tool(server, 'get_recent_tool_calls', 'Get Recent Tool Calls', schemas.getRecentToolCalls, handlers.handleGetRecentToolCalls as any, true);
  tool(server, 'give_feedback_to_desktop_commander', 'Give Feedback', schemas.giveFeedback, giveFeedbackToDesktopCommander as any);
  tool(server, 'get_prompts', 'Get Prompt', schemas.getPrompts, getPrompts as any, true);

  if (runtime.externalControllerLearning && runtime.controllerSessionId) {
    const browserAllowedForController = credentialAllowsTool(key,'browser_control');
    registerControllerLearningTools(server, runtime.externalControllerLearning, runtime.controllerSessionId,
      runtime.memoryExperience && !runtime.nativeTaskId ? {
        browserAllowed: browserAllowedForController,
        ownerId: memoryOwner ?? '', workspaceIdentity: workspace => {
          if (!workspaceRegistry) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
          return workspaceRegistry.registeredWorkspaceIdentity(workspace);
        },
      } : undefined);
  }
  const resolveMemoryScope = createMemoryScopeResolver({ nativeTaskId:runtime.nativeTaskId, nativeWorkspace:runtime.nativeWorkspace, controllerSessionId:runtime.controllerSessionId, memoryOwner, workspaceRegistry, externalControllerLearning:runtime.externalControllerLearning });
  if (runtime.memoryService) registerMemoryTools(
    server,
    runtime.memoryService,
    runtime.failureLoopAdvisor,
    runtime.externalControllerLearning,
    runtime.controllerSessionId,
    runtime.nativeTaskId,
    runtime.memoryExperience ? resolveMemoryScope : undefined,
  );
  if (runtime.memoryExperience) registerMemoryExperienceTools(server, runtime.memoryExperience, resolveMemoryScope,
    !runtime.nativeTaskId && runtime.externalControllerLearning && runtime.controllerSessionId
      ? async hits => {
        const context=currentExternalInvocationContext();
        if (context?.binding !== 'bound') return;
        await runtime.externalControllerLearning!.recordV2MemoryRecall(runtime.controllerSessionId!, hits, context);
      } : undefined,
    !runtime.nativeTaskId && runtime.externalControllerLearning && runtime.controllerSessionId
      ? createExternalMemoryRecallAdmission(runtime.externalControllerLearning, runtime.controllerSessionId)
      : undefined,
    !runtime.nativeTaskId && runtime.externalControllerLearning && runtime.controllerSessionId
      ? createExternalMemoryRecallAdmission(runtime.externalControllerLearning, runtime.controllerSessionId,'memory_v2_write')
      : undefined);
  if (runtime.learningService) registerLearningTools(
    server,
    runtime.learningService,
    runtime.failureLoopAdvisor,
    runtime.externalControllerLearning,
    runtime.controllerSessionId,
    resolveMemoryScope,
    credentialAllowsTool(key, 'read_file'),
    Boolean(runtime.externalControllerLearning && runtime.controllerSessionId && !runtime.nativeTaskId),
  );
  if (runtime.semanticIde) registerSemanticIdeTools(
    server,
    runtime.semanticIde,
    runtime.externalControllerLearning,
    runtime.controllerSessionId,
  );
  if (runtime.skillsService) registerSkillsTools(
    server,
    runtime.skillsService,
    runtime.externalControllerLearning,
    runtime.controllerSessionId,
    runtime.learningService,
    runtime.nativeTaskId,
    runtime.nativeWorkspace,
    !runtime.nativeTaskId && memoryOwner && runtime.proposalDecisionAuthorizer
      ? { principalId: memoryOwner, authorize: workspace => runtime.proposalDecisionAuthorizer!(memoryOwner, workspace) } : undefined,
    runtime.nativeSkillSettings,
  );
  if (runtime.phoneController) registerPhoneTools(
    server,
    runtime.phoneController,
    runtime.externalControllerLearning,
    runtime.controllerSessionId,
  );
  if (runtime.codeIntelligence) registerCodeIntelligenceTools(
    server,
    runtime.codeIntelligence,
    runtime.semanticIde,
    runtime.externalControllerLearning,
    runtime.controllerSessionId,
  );
  if (runtime.artifactAuthorization) {
    if (runtime.nativeTaskId && runtime.nativeWorkspace) {
      registerArtifactInspectTool(server, runtime.artifactAuthorization, undefined,
        { ownerId: memoryOwner ?? '', taskId: runtime.nativeTaskId, workspace: runtime.nativeWorkspace });
    } else if (!runtime.nativeTaskId) {
      registerArtifactInspectTool(server, runtime.artifactAuthorization,
        context => runtime.externalControllerLearning?.invocationTaskCurrent(context) ?? Promise.resolve(false));
    }
  }
  if (!runtime.nativeTaskId) registerRestartTool(server);
  registerNativeChatBridgeTool(server, runtime.nativeTaskId);
  if (!runtime.nativeTaskId) registerExternalReconstructionHarnessTool(server, {
    principal: key, ownerId: memoryOwner, sessionId: runtime.controllerSessionId,
    externalLearning: runtime.externalControllerLearning,
  });
  // Deliberately native-only while the installed external MCP schema is near its byte limit.
  if (runtime.nativeTaskId && runtime.nativeWorkspace) registerReconstructionHarnessTool(server,
    { taskId: runtime.nativeTaskId, workspace: runtime.nativeWorkspace });
  if (runtime.webResearch) registerWebResearchTools(server, runtime.webResearch, {
    externalLearning: runtime.externalControllerLearning,
    controllerSessionId: runtime.controllerSessionId,
  });
  return server;
}

/** The same tools, registered into a plain in-process registry: no MCP server, client or transport is built. */
export function createAgentCoreToolHost(key?: unknown, runtime: AgentCoreMcpRuntime = {}): InProcessToolHost {
  const host = new InProcessToolHost();
  createAgentCoreMcpServer(key, { ...runtime, toolTarget: host });
  return host;
}
