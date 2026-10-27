import { browserControlService } from '../browser-control/service.js';
import type { ServerResult } from '../types.js';
import type { MutationExecutionContext } from '../mutation-coordinator.js';

export async function handleBrowserControl(args: any, context?: MutationExecutionContext, external = false, owner?: string): Promise<ServerResult> {
  try {
    if (!external && String(args.action).startsWith('conversation_'))
      throw new Error('BROWSER_CONTROL_ACTION_UNSUPPORTED');
    if (args.action !== 'open' && args.action !== 'status') browserControlService.assertOwner(args.sessionId, owner);
    let result: Record<string, unknown>;
    switch (args.action) {
      case 'open':
        result = await browserControlService.open(args.url, args.headless ?? true, {interactionCapabilities:args.interactionCapabilities,transport:args.transport,owner});
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
        result = await browserControlService.conversation(args.sessionId, { read: args.read });
        break;
      case 'close':
        result = await browserControlService.close(args.sessionId);
        break;
      case 'status':
        result = browserControlService.status(owner);
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
