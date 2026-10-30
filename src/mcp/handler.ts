import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
  type McpHandlerRequestOptions,
  type McpServerFactory,
} from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createHash } from 'node:crypto';
import type { McpProtocolMode } from '../config.js';
import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import type { LearningService } from '../learning/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import type { SemanticIdeService } from '../semantic-ide/service.js';
import type { MemoryService } from '../memory/service.js';
import type { MemoryService as ExperienceMemoryService } from '../memory/facade.js';
import type { SkillService } from '../skills/service.js';
import type { WebResearchService } from '../web-research/service.js';
import type { McpMutationSafety } from './mutation-safety.js';
import type { McpHttpHandler } from '../http/app.js';
import type { PhoneController } from '../phone/controller.js';
import { FailureLoopAdvisor } from './failure-loop-advisor.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { createAgentCoreMcpServer, type AgentCoreMcpRuntime } from './server.js';
import { ControllerContractGate } from './controller-contract.js';
import { memoryCredentialOwner, ownerScopedLearningSession } from '../memory/mcp/scope.js';
import { createImageInspector, createImageInspectorScopes } from '../rdc/tools/image-inspect.js';
import type { ArtifactAuthorization } from '../auth/artifact-authorization.js';

export interface BridgeMcpHttpOptions {
  protocolMode?: McpProtocolMode;
  memoryService?: MemoryService;
  memoryExperience?: ExperienceMemoryService;
  learningService?: LearningService;
  externalControllerLearning?: ExternalControllerLearningService;
  semanticIde?: SemanticIdeService;
  skillsService?: SkillService;
  phoneController?: PhoneController;
  codeIntelligence?: CodeIntelligenceService;
  webResearch?: WebResearchService;
  mutationSafety?: McpMutationSafety;
  artifactAuthorization?: ArtifactAuthorization;
  proposalDecisionAuthorizer?: AgentCoreMcpRuntime['proposalDecisionAuthorizer'];
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

function externalControllerSessionId(
  request: Parameters<McpHttpHandler>[0],
  key: unknown,
): string {
  const rawHeader = request.headers['mcp-session-id'] ?? request.headers['x-agent-core-session-id'];
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const keyId = typeof key === 'object' && key !== null && typeof (key as { id?: unknown }).id === 'string'
    ? (key as { id: string }).id
    : 'anonymous';
  const hourlyBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const basis = header?.trim() ? 'mcp:' + header.trim() : 'legacy:' + keyId + ':' + hourlyBucket;
  return 'ext-' + createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, 32);
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
    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      if (closePromise) return closePromise;
      // Reserve the completion before any close side effect can reenter.
      let complete!: () => void;
      closePromise = new Promise<void>(resolve => { complete = () => resolve(); });
      // Eager initiation: an already-aborted request starts teardown in this stack.
      void (async () => {
        try {
          try { await transport.close(); } catch { /* Existing fail-soft close. */ }
          try { await product.close(); } catch { /* Attempt product close independently. */ }
        } finally {
          complete();
        }
      })();
      return closePromise;
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
  const contractGate = new ControllerContractGate();
  // Inspectors retain at most 64 metadata views each, never source/output buffers.
  const imageInspectorScope = createImageInspectorScopes();
  const imageInspectorFor = (request: Parameters<McpHttpHandler>[0], key: Parameters<McpHttpHandler>[2]) => {
    // app.ts authenticates every request. Never share an anonymous fallback.
    if (typeof key?.id !== 'string' || !key.id.trim()) return createImageInspector();
    const rawHeader = request.headers['mcp-session-id'] ?? request.headers['x-agent-core-session-id'];
    const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    // Headerless legacy clients sharing one credential also share one view namespace.
    // Keep this fallback stable across the learning session's hourly bucket boundary.
    return imageInspectorScope(createHash('sha256').update(JSON.stringify([key.id, header?.trim() || null])).digest('hex'));
  };
  return async (request, response, key) => {
    if (request.method !== 'POST') return sendProtocolError(response, 405, 'Method not allowed.');
    const controllerSessionId = externalControllerSessionId(request, key);
    // Headerless clients must carry their own receipt; never unlock by credential/hour.
    const contractBinding = JSON.stringify([key.id, request.headers['mcp-session-id'] ?? request.headers['x-agent-core-session-id'] ?? null]);
    const imageInspector = imageInspectorFor(request, key);
    const owner = memoryCredentialOwner(key);
    const learningSessionId = options.memoryExperience && owner ? ownerScopedLearningSession(owner, controllerSessionId) : controllerSessionId;
    const bootstrap = options.externalControllerLearning && (!options.memoryExperience || owner)
      ? () => options.externalControllerLearning!.bootstrapInstructions(learningSessionId)
      : undefined;
    const factory: McpServerFactory = () => createAgentCoreMcpServer(key, {
      memoryService: options.memoryService,
      memoryExperience: options.memoryExperience,
      learningService: options.learningService,
      externalControllerLearning: options.externalControllerLearning,
      controllerSessionId,
      controllerContract: { gate: contractGate, binding: contractBinding, bootstrap },
      imageInspector,
      semanticIde: options.semanticIde,
      skillsService: options.skillsService,
      phoneController: options.phoneController,
      codeIntelligence: options.codeIntelligence,
      webResearch: options.webResearch,
      failureLoopAdvisor,
      mutationSafety: options.mutationSafety,
      artifactAuthorization: options.artifactAuthorization,
      proposalDecisionAuthorizer: options.proposalDecisionAuthorizer,
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
