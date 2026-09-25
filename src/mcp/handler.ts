import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
  type McpHandlerRequestOptions,
  type McpServerFactory,
} from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { McpProtocolMode } from '../config.js';
import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import type { LearningService } from '../learning/service.js';
import type { HermesPartnerService } from '../partner/service.js';
import type { SemanticIdeService } from '../semantic-ide/service.js';
import type { MemoryService } from '../memory/service.js';
import type { McpHttpHandler } from '../http/app.js';
import type { PhoneController } from '../phone/controller.js';
import { FailureLoopAdvisor } from './failure-loop-advisor.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { createAgentCoreMcpServer } from './server.js';

export interface BridgeMcpHttpOptions {
  protocolMode?: McpProtocolMode;
  memoryService?: MemoryService;
  learningService?: LearningService;
  hermesPartner?: HermesPartnerService;
  semanticIde?: SemanticIdeService;
  phoneController?: PhoneController;
  codeIntelligence?: CodeIntelligenceService;
}

function sendProtocolError(
  response: Parameters<McpHttpHandler>[1],
  status: number,
  message: string,
): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}
export function bindAbortClose(
  signal: AbortSignal | null | undefined,
  close: () => void,
): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    close();
    return () => {};
  }
  const onAbort = () => close();
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function legacyJsonFallback(factory: McpServerFactory) {
  return async (request: Request, options?: McpHandlerRequestOptions): Promise<Response> => {
    if (request.method.toUpperCase() !== 'POST') {
      return Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }, { status: 405 });
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
    const close = async () => {
      if (closed) return;
      closed = true;
      await transport.close().catch(() => undefined);
      await product.close().catch(() => undefined);
    };
    let detachAbort = () => {};
    try {
      await product.connect(transport);
      detachAbort = bindAbortClose(request.signal, () => void close());
      return await transport.handleRequest(request, options);
    } finally {
      detachAbort();
      await close();
    }
  };
}
function protocolHandler(factory: McpServerFactory, protocolMode: McpProtocolMode) {
  const legacy = legacyJsonFallback(factory);
  const modern = createMcpHandler(factory, { legacy: 'reject', responseMode: 'auto' });
  return {
    fetch: async (request: Request, options?: McpHandlerRequestOptions): Promise<Response> => {
      const legacyRequest = await isLegacyRequest(request, options?.parsedBody);
      if (legacyRequest) return legacy(request, options);
      if (protocolMode === 'legacy') {
        return Response.json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Modern MCP protocol is disabled.' },
          id: null,
        }, { status: 400 });
      }
      return modern.fetch(request, options);
    },
    close: () => modern.close(),
  };
}

export function createMcpHttpHandler(options: BridgeMcpHttpOptions = {}): McpHttpHandler {
  const protocolMode = options.protocolMode ?? 'dual';
  const failureLoopAdvisor = new FailureLoopAdvisor();
  return async (request, response, key) => {
    if (request.method !== 'POST') return sendProtocolError(response, 405, 'Method not allowed.');
    const factory: McpServerFactory = () => createAgentCoreMcpServer(key, {
      memoryService: options.memoryService,
      learningService: options.learningService,
      hermesPartner: options.hermesPartner,
      semanticIde: options.semanticIde,
      phoneController: options.phoneController,
      codeIntelligence: options.codeIntelligence,
      failureLoopAdvisor,
    });
    const webHandler = protocolHandler(factory, protocolMode);
    try {
      await toNodeHandler(webHandler)(request, response);
    } catch (error) {
      activityTracker.captureFailure('MCP', error, 'transport-failure', { method: request.method ?? '', protocolMode });
      if (!response.headersSent) sendProtocolError(response, 500, 'Internal MCP server error.');
      else if (!response.writableEnded) response.end();
    } finally {
      await webHandler.close().catch(() => undefined);
    }
  };
}
