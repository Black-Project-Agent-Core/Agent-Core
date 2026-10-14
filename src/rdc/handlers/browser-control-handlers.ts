import { browserControlService } from '../browser-control/service.js';
import type { ServerResult } from '../types.js';

export async function handleBrowserControl(args: any): Promise<ServerResult> {
  try {
    let result: Record<string, unknown>;
    switch (args.action) {
      case 'open':
        result = await browserControlService.open(args.url, args.headless ?? true, {interactionCapabilities:args.interactionCapabilities,transport:args.transport});
        break;
      case 'observe':
        result = await browserControlService.observe(args.sessionId, {canvas:args.canvas});
        break;
      case 'act':
        result = await browserControlService.act(
          args.sessionId,
          args.observationId,
          args.actionId,
          args.text,
        );
        break;
      case 'close':
        result = await browserControlService.close(args.sessionId);
        break;
      case 'status':
        result = browserControlService.status();
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
