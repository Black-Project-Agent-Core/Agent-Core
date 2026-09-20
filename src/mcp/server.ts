import { McpServer } from '@modelcontextprotocol/server';
import { AGENT_CORE_VERSION } from '../version.js';
import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import type { LearningService } from '../learning/service.js';
import type { HermesPartnerService } from '../partner/service.js';
import type { SemanticIdeService } from '../semantic-ide/service.js';
import type { MemoryService } from '../memory/service.js';
import * as handlers from '../rdc/handlers/index.js';
import { getConfig, setConfigValue } from '../rdc/tools/config.js';
import { getUsageStats } from '../rdc/tools/usage.js';
import { giveFeedbackToDesktopCommander } from '../rdc/tools/feedback.js';
import { getPrompts } from '../rdc/tools/prompts.js';
import { toolHistory } from '../rdc/utils/toolHistory.js';
import { usageTracker } from '../rdc/utils/usageTracker.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { loadAgentProtocol } from './agent-protocol.js';
import { annotateFailureLoopException, appendFailureLoopAdvisory, type FailureLoopAdvisory, type FailureLoopAdvisor } from './failure-loop-advisor.js';
import { registerCodeIntelligenceTools } from './code-intelligence-tools.js';
import { registerLearningTools } from './learning-tools.js';
import { registerMemoryTools } from './memory-tools.js';
import { registerPartnerTools } from './partner-tools.js';
import { registerSemanticIdeTools } from './semantic-ide-tools.js';
import { registerPhoneTools } from './phone-tools.js';
import { PHONE_SKILL_INSTRUCTIONS } from './phone-protocol.js';
import type { PhoneController } from '../phone/controller.js';
import * as schemas from './rdc-schemas.js';
import { RDC_TOOL_METADATA } from './rdc-tool-metadata.js';

export const SERVER_NAME = 'agent-core';
export const SERVER_VERSION = AGENT_CORE_VERSION;

export interface AgentCoreMcpRuntime {
  memoryService?: MemoryService;
  phoneController?: PhoneController;
  codeIntelligence?: CodeIntelligenceService;
  learningService?: LearningService;
  hermesPartner?: HermesPartnerService;
  semanticIde?: SemanticIdeService;
  failureLoopAdvisor?: FailureLoopAdvisor;
}

type ToolResult = { content: Array<Record<string, unknown>>; isError?: boolean; [key: string]: unknown };
type Handler = (args: any) => Promise<ToolResult>;

const advisorByServer = new WeakMap<McpServer, FailureLoopAdvisor>();

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

const tool = (server: McpServer, name: keyof typeof RDC_TOOL_METADATA, _title: string, schema: any, handler: Handler, _readOnly = false) => {
  const metadata = RDC_TOOL_METADATA[name];
  server.registerTool(name, {
    title: metadata.title,
    description: metadata.description,
    inputSchema: schema,
    annotations: metadata.annotations,
  }, async (args: any) => {
    const started = Date.now();
    const input = args ?? {};
    const trackCall = input.origin !== 'ui';
    const advisor = trackCall ? advisorByServer.get(server) : undefined;
    try {
      const result = await handler(input);
      const durationMs = Date.now() - started;
      let finalResult = result;
      if (advisor) {
        if (result.isError) {
          const advisory = advisor.observeFailure(name, input, result);
          if (advisory) {
            finalResult = appendFailureLoopAdvisory(result, advisory) as ToolResult;
            recordFailureLoopAdvisory(name, advisory);
          }
        } else {
          advisor.observeSuccess(name, input);
        }
      }
      if (trackCall) {
        try {
          if (name !== 'get_recent_tool_calls') toolHistory.addCall(name, input, finalResult as any, durationMs);
        } catch (error) {
          activityTracker.captureFailure('HISTORY', error, 'tool-history-write-failure', { tool: name });
        }
        try {
          if (finalResult.isError) await usageTracker.trackFailure(name); else await usageTracker.trackSuccess(name);
        } catch (error) {
          activityTracker.captureFailure('USAGE', error, 'tool-usage-write-failure', { tool: name });
        }
        activityTracker.record(
          finalResult.isError ? 'OPERATION' : 'MCP',
          finalResult.isError ? 'info' : 'success',
          finalResult.isError ? `${name} operation failed` : `${name} completed`,
          finalResult.isError ? 'handled-tool-failure' : 'tool-call',
          {
            tool: name,
            durationMs,
            argumentKeys: Object.keys(input),
            ...(finalResult.isError ? { result: JSON.stringify(finalResult.content) } : {}),
          },
        );
      }
      return finalResult as any;
    } catch (error) {
      let finalError = error;
      if (advisor) {
        const advisory = advisor.observeFailure(name, input, error);
        if (advisory) {
          recordFailureLoopAdvisory(name, advisory);
          finalError = annotateFailureLoopException(error, advisory);
        }
      }
      activityTracker.captureFailure('MCP', finalError, 'tool-exception', {
        tool: name,
        durationMs: Date.now() - started,
        argumentKeys: Object.keys(input),
      });
      throw finalError;
    }
  });
};

export function createAgentCoreMcpServer(_key?: unknown, runtime: AgentCoreMcpRuntime = {}): McpServer {
  const baseInstructions = loadAgentProtocol();
  const instructions = runtime.phoneController?.enabled
    ? `${baseInstructions}\n\n${PHONE_SKILL_INSTRUCTIONS}`
    : baseInstructions;
  const server = new McpServer(
    { name: SERVER_NAME, title: 'Agent Core', version: SERVER_VERSION },
    { instructions },
  );
  if (runtime.failureLoopAdvisor) advisorByServer.set(server, runtime.failureLoopAdvisor);
  tool(server, 'get_config', 'Get Configuration', schemas.getConfig, async () => getConfig() as any, true);
  tool(server, 'set_config_value', 'Set Configuration Value', schemas.setConfigValue, setConfigValue as any);
  tool(server, 'read_file', 'Read File or URL', schemas.readFile, handlers.handleReadFile as any, true);
  tool(server, 'read_multiple_files', 'Read Multiple Files', schemas.readMultipleFiles, handlers.handleReadMultipleFiles as any, true);
  tool(server, 'write_file', 'Write File', schemas.writeFile, handlers.handleWriteFile as any);
  tool(server, 'write_pdf', 'Write/Modify PDF', schemas.writePdf, handlers.handleWritePdf as any);
  tool(server, 'create_directory', 'Create Directory', schemas.createDirectory, handlers.handleCreateDirectory as any);
  tool(server, 'list_directory', 'List Directory Contents', schemas.listDirectory, handlers.handleListDirectory as any, true);
  tool(server, 'move_file', 'Move/Rename File', schemas.moveFile, handlers.handleMoveFile as any);

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

  if (runtime.memoryService) registerMemoryTools(server, runtime.memoryService, runtime.failureLoopAdvisor);
  if (runtime.learningService) registerLearningTools(server, runtime.learningService, runtime.failureLoopAdvisor);
  if (runtime.hermesPartner) registerPartnerTools(server, runtime.hermesPartner, runtime.failureLoopAdvisor);
  if (runtime.semanticIde) registerSemanticIdeTools(server, runtime.semanticIde);
  if (runtime.phoneController) registerPhoneTools(server, runtime.phoneController);
  if (runtime.codeIntelligence) registerCodeIntelligenceTools(server, runtime.codeIntelligence);
  return server;
}
