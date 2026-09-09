import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
  type McpHandlerRequestOptions,
  type McpServerFactory,
} from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { McpProtocolMode } from '../config.js';
import type { McpHttpHandler } from '../http/app.js';
import type { RuntimeServices } from '../runtime/services.js';
import { createAgentCoreMcpServer } from './server.js';

export interface AgentCoreMcpHttpOptions {
  protocolMode?: McpProtocolMode;
}

function sendProtocolError(response: Parameters<McpHttpHandler>[1], status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  }));
}

/**
 * Preserve Agent Core's certified v1 legacy behavior while using the official
 * v2 transport. The upstream v2 stateless fallback intentionally prefers SSE;
 * Agent Core historically opted into buffered JSON responses. The only policy
 * difference here is enableJsonResponse=true; factory/transport lifecycle and
 * request handling remain SDK-owned.
 */
function legacyJsonStatelessFallback(factory: McpServerFactory) {
  return async (request: Request, options?: McpHandlerRequestOptions): Promise<Response> => {
    if (request.method.toUpperCase() !== 'POST') {
      return Response.json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      }, { status: 405 });
    }

    const product = await factory({
      era: 'legacy',
      ...(options?.authInfo !== undefined && { authInfo: options.authInfo }),
      requestInfo: request,
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    let closed = false;
    const teardown = async () => {
      if (closed) return;
      closed = true;
      await transport.close().catch(() => undefined);
      await product.close().catch(() => undefined);
    };

    try {
      await product.connect(transport);
      request.signal?.addEventListener('abort', () => void teardown(), { once: true });
      return await transport.handleRequest(request, {
        ...(options?.authInfo !== undefined && { authInfo: options.authInfo }),
        ...(options?.parsedBody !== undefined && { parsedBody: options.parsedBody }),
      });
    } finally {
      await teardown();
    }
  };
}

function protocolHandler(factory: McpServerFactory, protocolMode: McpProtocolMode) {
  const legacy = legacyJsonStatelessFallback(factory);
  const modern = createMcpHandler(factory, { legacy: 'reject', responseMode: 'auto' });

  return {
    fetch: async (request: Request, options?: McpHandlerRequestOptions): Promise<Response> => {
      const legacyRequest = await isLegacyRequest(request, options?.parsedBody);
      if (legacyRequest) return legacy(request, options);
      if (protocolMode === 'legacy') {
        return Response.json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Modern MCP protocol is disabled while Agent Core is in legacy-only rollback mode.',
          },
          id: null,
        }, { status: 400 });
      }
      return modern.fetch(request, options);
    },
    close: () => modern.close(),
  };
}

export function createMcpHttpHandler(
  runtime: RuntimeServices,
  options: AgentCoreMcpHttpOptions = {},
): McpHttpHandler {
  const protocolMode = options.protocolMode ?? 'dual';

  return async (request, response, key) => {
    if (request.method !== 'POST') {
      sendProtocolError(response, 405, 'Method not allowed.');
      return;
    }

    const factory: McpServerFactory = () => createAgentCoreMcpServer(key, runtime);
    const webHandler = protocolHandler(factory, protocolMode);
    const nodeHandler = toNodeHandler(webHandler);

    try {
      await nodeHandler(request, response);
    } catch {
      if (!response.headersSent) sendProtocolError(response, 500, 'Internal MCP server error.');
      else if (!response.writableEnded) response.end();
    } finally {
      await webHandler.close().catch(() => undefined);
    }
  };
}
