import { browserControlService } from '../browser-control/service.js';
import type { ServerResult } from '../types.js';
import type { MutationExecutionContext } from '../mutation-coordinator.js';

export async function handleBrowserControl(args: any, context?: MutationExecutionContext, external = false): Promise<ServerResult> {
  try {
    if (!external && (args.transport === 'open-browser-use' || browserControlService.isOpenBrowserUseSession(args.sessionId)
      || args.mode !== undefined || String(args.action).startsWith('conversation_')))
      throw new Error('BROWSER_CONTROL_ACTION_UNSUPPORTED');
    let result: Record<string, unknown>;
    switch (args.action) {
      case 'open':
        result = await browserControlService.open(args.url, args.headless ?? true, {interactionCapabilities:args.interactionCapabilities,transport:args.transport,...(external ? {mode:args.mode} : {})});
        break;
      case 'observe':
        result = await browserControlService.observe(args.sessionId, {canvas:args.canvas,host:context?.invocationContext});
        break;
      case 'act':
        result = await browserControlService.act(
          args.sessionId,
          args.observationId,
          args.actionId,
          args.text,
          context?.invocationContext,
          context?.signal,
        );
        break;
      case 'conversation_read':
        result = await browserControlService.conversation(args.sessionId, args.action, { sinceRevision: args.sinceRevision,
          ...(args.read!==undefined?{read:args.read}:{}) });
        break;
      case 'conversation_draft':
        result = await browserControlService.conversation(args.sessionId, args.action, { url: args.url, revision: args.revision, text: args.text });
        break;
      case 'conversation_status':
        result = await browserControlService.conversation(args.sessionId, args.action);
        break;
      case 'close':
        result = await browserControlService.close(args.sessionId);
        break;
      case 'status':
        result = browserControlService.status(external);
        break;
      default:
        throw new Error('BROWSER_CONTROL_ACTION_UNSUPPORTED');
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: 'Error: ' + (error instanceof Error ? error.message : String(error)),
      }],
      isError: true,
    };
  }
}
