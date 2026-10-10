import type { McpServer } from '@modelcontextprotocol/server';
import type { WebResearchService } from '../web-research/service.js';
import * as schemas from './web-research-schemas.js';

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message.slice(0, 2_000) }],
  };
}

export function registerWebResearchTools(server: McpServer, service: WebResearchService): void {
  server.registerTool('web_search', {
    inputSchema: schemas.webSearch.shape,
  }, async (args: unknown) => {
    try {
      const input = schemas.webSearch.parse(args);
      return textResult(await service.search(input));
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool('web_open', {
    inputSchema: schemas.webOpen.shape,
  }, async (args: unknown) => {
    try {
      const input = schemas.webOpen.parse(args);
      return textResult(await service.open(input));
    } catch (error) {
      return errorResult(error);
    }
  });
}
