import { browserControlService } from '../browser-control/service.js';
import type { ServerResult, ServerResponseContent } from '../types.js';

export async function handleBrowserControl(args: any): Promise<ServerResult> {
  try {
    let result: Record<string, unknown>;
    switch (args.action) {
      case 'open':
        result = await browserControlService.open(args.url, args.headless ?? true, {interactionCapabilities:args.interactionCapabilities,transport:args.transport});
        break;
      case 'observe':
        result = await browserControlService.observe(args.sessionId, {canvas:args.canvas,screenshot:args.screenshot});
        break;
      case 'act':
        result = await browserControlService.act(
          args.sessionId,
          args.observationId,
          args.actionId,
          args.text,
          { pointer: args.pointer },
        );
        break;
      case 'pause':
        result = await browserControlService.pause(args.sessionId);
        break;
      case 'resume':
        result = await browserControlService.resume(args.sessionId);
        break;
      case 'close':
        result = await browserControlService.close(args.sessionId);
        break;
      case 'status':
        result = {
          ...browserControlService.status(),
          controllerImageInput: { transport: 'mcp-image-content', supported: 'client-dependent' },
        };
        break;
      default:
        throw new Error('BROWSER_CONTROL_ACTION_UNSUPPORTED');
    }
    if (result.image !== undefined) {
      const { image, ...metadata } = result;
      if (!image || typeof image !== 'object'
        || (image as ServerResponseContent).type !== 'image'
        || typeof (image as ServerResponseContent).data !== 'string'
        || (image as ServerResponseContent).mimeType !== 'image/jpeg') {
        throw new Error('BROWSER_CONTROL_SCREENSHOT_RESULT_INVALID');
      }
      // Pixels live in one typed MCP block. Do not duplicate them into JSON,
      // structuredContent, or any persisted artifact. Metadata appears once too.
      return { content: [
        { type: 'text', text: JSON.stringify(metadata) },
        { type: 'image', data: (image as ServerResponseContent).data, mimeType: 'image/jpeg' },
      ] };
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
