import { McpServer } from '@modelcontextprotocol/server';
import type { HermesPartnerService } from '../partner/service.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { appendFailureLoopAdvisory, type FailureLoopAdvisor } from './failure-loop-advisor.js';
import * as schemas from './partner-schemas.js';

function text(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] as any };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true } as any;
}

export function registerPartnerTools(
  server: McpServer,
  partner: HermesPartnerService,
  advisor?: FailureLoopAdvisor,
): void {
  server.registerTool('partner', {
    title: 'Hermes A2A Partner',
    description: 'Controller-led A2A collaboration with Hermes. Agent Core/controller remains lead and final authority. Required flow for execution is align -> optional bounded discussion -> approve_alignment -> delegate. Hermes is a subordinate partner/advisor; its outputs are self-reports until independently verified by the lead.',
    inputSchema: schemas.partner.shape,
    annotations: {
      title: 'Hermes A2A Partner',
      readOnlyHint: false,
      destructiveHint: true,
    },
  }, async (args: any) => {
    const input = schemas.partner.parse(args);
    try {
      let result: unknown;
      switch (input.action) {
        case 'status':
          result = await partner.status(input.collaborationId, input.runId);
          break;
        case 'align':
          if (!input.task || !input.leadWorkstream || !input.partnerWorkstream || !input.expectedDeliverable) {
            throw new Error('task, leadWorkstream, partnerWorkstream, and expectedDeliverable are required for action=align');
          }
          result = await partner.align({
            ...(input.collaborationId ? { collaborationId: input.collaborationId } : {}),
            task: input.task,
            ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
            leadWorkstream: input.leadWorkstream,
            partnerWorkstream: input.partnerWorkstream,
            ...(input.constraints ? { constraints: input.constraints } : {}),
            ...(input.allowedPaths ? { allowedPaths: input.allowedPaths } : {}),
            expectedDeliverable: input.expectedDeliverable,
            ...(input.wait !== undefined ? { wait: input.wait } : {}),
            ...(input.waitTimeoutMs ? { waitTimeoutMs: input.waitTimeoutMs } : {}),
          });
          break;
        case 'discuss':
          if (!input.collaborationId || !input.message) {
            throw new Error('collaborationId and message are required for action=discuss');
          }
          result = await partner.discuss(input.collaborationId, input.message, input.wait === true, input.waitTimeoutMs);
          break;
        case 'approve_alignment':
          if (!input.collaborationId) throw new Error('collaborationId is required for action=approve_alignment');
          result = partner.approveAlignment(input.collaborationId, input.note);
          break;
        case 'delegate':
          if (!input.collaborationId) throw new Error('collaborationId is required for action=delegate');
          result = await partner.delegate(
            input.collaborationId,
            input.extraInstruction,
            input.wait === true,
            input.waitTimeoutMs,
          );
          break;
        case 'collect':
          if (!input.collaborationId) throw new Error('collaborationId is required for action=collect');
          result = await partner.collect(
            input.collaborationId,
            input.runId,
            input.wait !== false,
            input.waitTimeoutMs,
          );
          break;
        case 'steer':
          if (!input.collaborationId || !input.message) {
            throw new Error('collaborationId and message are required for action=steer');
          }
          result = await partner.steer(input.collaborationId, input.runId, input.message);
          break;
        case 'approve':
          if (!input.collaborationId || !input.requestId || !input.choice) {
            throw new Error('collaborationId, requestId, and choice are required for action=approve');
          }
          result = await partner.approveRun(
            input.collaborationId,
            input.runId,
            input.requestId,
            input.choice,
          );
          break;
        case 'stop':
          if (!input.collaborationId) throw new Error('collaborationId is required for action=stop');
          result = await partner.stop(input.collaborationId, input.runId);
          break;
        case 'close':
          if (!input.collaborationId) throw new Error('collaborationId is required for action=close');
          result = partner.closeCollaboration(input.collaborationId);
          break;
      }

      advisor?.observeSuccess('partner', args);
      activityTracker.record('PARTNER', 'success', `partner ${input.action} completed`, 'partner-tool-call', {
        action: input.action,
        collaborationId: input.collaborationId ?? '',
      });
      return text(result);
    } catch (error) {
      const result = failure(error);
      const advisory = advisor?.observeFailure('partner', args, result);
      if (advisory) return appendFailureLoopAdvisory(result, advisory);
      activityTracker.record('PARTNER', 'info', 'partner operation failed', 'handled-partner-failure', {
        action: input.action,
        collaborationId: input.collaborationId ?? '',
        error: error instanceof Error ? error.message : String(error),
      });
      return result;
    }
  });
}
