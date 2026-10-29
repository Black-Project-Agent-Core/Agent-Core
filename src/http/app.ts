import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type { FileKeyStore } from '../auth/key-store.js';
import type { VerifiedKey } from '../auth/key-types.js';
import type { OAuthService } from '../oauth/service.js';
import { authenticateRequest } from './auth.js';
import { HttpSecurityPolicy } from './security-policy.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import type { AgentChatService } from '../agent-chat-service.js';
import { handleProposalDocuments } from './proposals.js';
import type { ProposalDocumentReader } from '../learning/proposal-documents.js';
import { nativeMemoryEvaluationSchema } from '../agent-memory-evaluation.js';
import { defaultTaskChangesReader, handleTaskChanges, type TaskChangesReader } from './task-changes.js';

export type McpHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  key: VerifiedKey,
) => Promise<void>;

export interface HttpHandlerOptions {
  keyStore: FileKeyStore;
  mcpHandler: McpHttpHandler;
  oauthService?: OAuthService;
  security?: HttpSecurityPolicy;
  healthProvider?: () => Promise<Record<string, unknown>>;
  agentUiToken?: string | null;
  agentRun?: (input: { prompt: string; workspace?: string }) => Promise<unknown>;
  agentChat?: AgentChatService;
  workflows?: () => import('../workflows/service.js').WorkflowSnapshot;
  proposals?: ProposalDocumentReader;
  /** Read-only actual-changes reader; defaults to the checkpoint service plus Git. */
  taskChanges?: TaskChangesReader;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage, maxBytes = 256 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('request_body_too_large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function authorizeAgentUi(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpHandlerOptions,
  security: HttpSecurityPolicy,
): boolean {
  if (!security.isLoopbackRequest(request)) {
    sendJson(response, 403, { error: 'loopback_required' });
    return false;
  }
  if (!options.agentUiToken) {
    sendJson(response, 503, { error: 'agent_runtime_unavailable' });
    return false;
  }
  const supplied = firstHeader(request.headers['x-agent-core-ui-token']);
  if (!supplied || !constantTimeEqual(supplied, options.agentUiToken)) {
    sendJson(response, 401, { error: 'unauthorized' });
    return false;
  }
  return true;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const payload = JSON.parse(await readBody(request));
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

const DEFAULT_SECURITY = new HttpSecurityPolicy({
  publicBaseUrl: null,
  protectedResourceUrl: null,
  trustProxy: false,
  allowedOrigins: [],
});

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpHandlerOptions,
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  const route = requestUrl.pathname;
  const security = options.security ?? DEFAULT_SECURITY;

  if (request.method === 'GET' && route === '/health') {
    const diagnostics = options.healthProvider ? await options.healthProvider() : {};
    sendJson(response, 200, { status: 'ok', service: 'agent-core-rdc-bridge', ...diagnostics });
    return;
  }

  if (route === '/agent/workflows') {
    if (!authorizeAgentUi(request, response, options, security)) return;
    if (request.method !== 'GET') { sendJson(response, 405, {error:'method_not_allowed'}, {allow:'GET'}); return; }
    if (!options.workflows) { sendJson(response, 503, {error:'workflows_unavailable'}); return; }
    sendJson(response, 200, options.workflows(), {'cache-control':'no-store'});
    return;
  }

  if (route === '/agent/proposals' || route === '/agent/proposals/read') {
    if (!authorizeAgentUi(request, response, options, security)) return;
    await handleProposalDocuments(request, response, options.proposals, requestUrl);
    return;
  }

  if (route === '/agent/task-changes') {
    if (!authorizeAgentUi(request, response, options, security)) return;
    await handleTaskChanges(request, response, options.taskChanges ?? defaultTaskChangesReader, requestUrl);
    return;
  }

  if (route === '/agent/chat/conversations' || route.startsWith('/agent/chat/')) {
    if (!authorizeAgentUi(request, response, options, security)) return;
    const chat = options.agentChat;
    if (!chat) {
      sendJson(response, 503, { error: 'agent_chat_unavailable' });
      return;
    }

    if (route === '/agent/chat/conversations') {
      if (request.method === 'GET') {
        const includeArchived = requestUrl.searchParams.get('archived') === '1';
        sendJson(response, 200, {
          conversations: chat.listConversations(includeArchived),
        });
        return;
      }
      if (request.method === 'POST') {
        let body: Record<string, unknown>;
        try { body = await readJsonBody(request); }
        catch { sendJson(response, 400, { error: 'invalid_json' }); return; }
        const workspace = typeof body.workspace === 'string' ? body.workspace.trim() : '';
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (workspace.length > 200 || title.length > 160) {
          sendJson(response, 400, { error: 'invalid_agent_chat_request' });
          return;
        }
        const created = await chat.createConversation({
          ...(workspace ? { workspace } : {}),
          ...(title ? { title } : {}),
        });
        sendJson(response, 201, created);
        return;
      }
      sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET, POST' });
      return;
    }

    if (route === '/agent/chat/providers') {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      await chat.refreshProviderCapabilities();
      const selection = chat.getLastSelection();
      sendJson(response, 200, { providers: chat.listProviders(), ...(selection ? { selection } : {}) });
      return;
    }

    if (route === '/agent/chat/selection') {
      if (request.method !== 'PUT') {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'PUT' });
        return;
      }
      if (firstHeader(request.headers['x-agent-core-chat-origin']) === 'external-controller') {
        sendJson(response, 403, { error: 'agent_chat_selection_owner_only' });
        return;
      }
      let body: Record<string, unknown>;
      try { body = await readJsonBody(request); }
      catch { sendJson(response, 400, { error: 'invalid_json' }); return; }
      try {
        sendJson(response, 200, { selection: chat.recordOwnerSelection(body) });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : 'agent_chat_selection_invalid' });
      }
      return;
    }

    const stepMatch = route.match(/^\/agent\/chat\/steps\/([^/]+)\/(\d+)$/);
    if (stepMatch) {
      if (request.method !== 'GET') {
        sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      if (firstHeader(request.headers['x-agent-core-chat-origin']) === 'external-controller') {
        sendJson(response, 403, { error: 'agent_chat_steps_owner_only' });
        return;
      }
      const seq = Number(stepMatch[2]);
      const step = Number.isSafeInteger(seq) ? chat.readStepDetail(decodeURIComponent(stepMatch[1]!), seq) : null;
      if (!step) {
        sendJson(response, 404, { error: 'agent_chat_step_not_found' });
        return;
      }
      sendJson(response, 200, step);
      return;
    }

    const detailMatch = route.match(/^\/agent\/chat\/conversations\/([^/]+)$/);
    if (detailMatch && request.method === 'GET') {
      const detail = await chat.readConversation(decodeURIComponent(detailMatch[1]!));
      if (!detail) {
        sendJson(response, 404, { error: 'agent_chat_conversation_not_found' });
        return;
      }
      sendJson(response, 200, detail);
      return;
    }

    const turnMatch = route.match(/^\/agent\/chat\/conversations\/([^/]+)\/turns$/);
    if (turnMatch && request.method === 'POST') {
      const originHeader = firstHeader(request.headers['x-agent-core-chat-origin']);
      if (originHeader && originHeader !== 'external-controller') {
        sendJson(response, 400, { error: 'invalid_agent_chat_origin' }); return;
      }
      let body: Record<string, unknown>;
      try { body = await readJsonBody(request); }
      catch { sendJson(response, 400, { error: 'invalid_json' }); return; }
      const conversationId = decodeURIComponent(turnMatch[1]!);
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const clientRequestId = typeof body.clientRequestId === 'string'
        ? body.clientRequestId.trim() : '';
      if (!prompt || prompt.length > 200_000
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(clientRequestId)) {
        sendJson(response, 400, { error: 'invalid_agent_chat_turn' });
        return;
      }
      // A route id chosen in the UI; "auto" or absent keeps automatic rotation.
      const providerId = body.providerId === undefined || body.providerId === null ? ''
        : typeof body.providerId === 'string' ? body.providerId.trim() : null;
      if (providerId === null || (providerId && providerId !== 'auto' && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(providerId))) {
        sendJson(response, 400, { error: 'invalid_agent_chat_provider' });
        return;
      }
      const model = body.model;
      if (body.goalMode !== undefined && typeof body.goalMode !== 'boolean') {
        sendJson(response, 400, { error: 'invalid_agent_chat_goal_mode' });
        return;
      }
      if (model !== undefined) {
        try { chat.validateProviderModel(model, providerId || undefined); }
        catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_agent_chat_model' }); return; }
      }
      const reasoningEffort = body.reasoningEffort;
      if (reasoningEffort !== undefined) {
        try { chat.validateReasoningEffort(reasoningEffort, providerId || undefined, model as string | undefined); }
        catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_agent_chat_reasoning' }); return; }
      }
      const evaluation = body.evaluation === undefined ? undefined : nativeMemoryEvaluationSchema.safeParse(body.evaluation);
      if (evaluation && !evaluation.success) {
        sendJson(response, 400, { error: 'invalid_agent_memory_evaluation' });
        return;
      }
      response.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
      });
      const writeLine = (value: unknown) => {
        if (!response.writableEnded) response.write(JSON.stringify(value) + '\n');
      };
      try {
        const result = await chat.runTurn({
          conversationId,
          clientRequestId,
          prompt,
          ...(originHeader === 'external-controller' ? { messageOrigin: 'external-controller' as const } : {}),
          ...(body.goalMode === true ? { goalMode: true } : {}),
          ...(providerId && providerId !== 'auto' ? { providerRoute: providerId } : {}),
          ...(model !== undefined ? { providerModel: model as string } : {}),
          ...(reasoningEffort ? { reasoningEffort: reasoningEffort as import('../agent-provider-state.js').AgentReasoningEffort } : {}),
          ...(evaluation?.success ? { evaluation: evaluation.data } : {}),
          eventSink: async event => { writeLine({ type: 'event', event }); },
        });
        writeLine({ type: 'result', result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeLine({
          type: 'error',
          error: message.startsWith('AGENT_')
            ? message.slice(0, 300)
            : 'agent_chat_turn_failed',
        });
      } finally {
        if (!response.writableEnded) response.end();
      }
      return;
    }

    const resumeMatch = route.match(/^\/agent\/chat\/turns\/([^/]+)\/resume$/);
    if (resumeMatch && request.method === 'POST') {
      const turnId = decodeURIComponent(resumeMatch[1]!);
      response.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
      });
      const writeLine = (value: unknown) => {
        if (!response.writableEnded) response.write(JSON.stringify(value) + '\n');
      };
      try {
        const result = await chat.resumeTurn({
          turnId,
          eventSink: async event => { writeLine({ type: 'event', event }); },
        });
        writeLine({ type: 'result', result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeLine({
          type: 'error',
          error: message.startsWith('AGENT_')
            ? message.slice(0, 300)
            : 'agent_chat_resume_failed',
        });
      } finally {
        if (!response.writableEnded) response.end();
      }
      return;
    }

    const pauseMatch = route.match(/^\/agent\/chat\/turns\/([^/]+)\/pause$/);
    if (pauseMatch && request.method === 'POST') {
      const paused = chat.pauseTurn(decodeURIComponent(pauseMatch[1]!));
      sendJson(response, paused ? 200 : 404, { paused });
      return;
    }

    const stopMatch = route.match(/^\/agent\/chat\/turns\/([^/]+)\/cancel$/);
    if (stopMatch && request.method === 'POST') {
      const stopped = chat.stopTurn(decodeURIComponent(stopMatch[1]!));
      sendJson(response, stopped ? 200 : 404, { stopped });
      return;
    }

    const archiveMatch = route.match(/^\/agent\/chat\/conversations\/([^/]+)\/archive$/);
    if (archiveMatch && request.method === 'POST') {
      try {
        await chat.archiveConversation(decodeURIComponent(archiveMatch[1]!));
        sendJson(response, 200, { archived: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(response, message === 'AGENT_CHAT_CONVERSATION_BUSY' ? 409 : 404, {
          error: message.slice(0, 200),
        });
      }
      return;
    }

    sendJson(response, 404, { error: 'not_found' });
    return;
  }

  if (route === '/agent/run') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' }, { allow: 'POST' });
      return;
    }
    if (!security.isLoopbackRequest(request)) {
      sendJson(response, 403, { error: 'loopback_required' });
      return;
    }
    if (!options.agentRun || !options.agentUiToken) {
      sendJson(response, 503, { error: 'agent_runtime_unavailable' });
      return;
    }
    const supplied = firstHeader(request.headers['x-agent-core-ui-token']);
    if (!supplied || !constantTimeEqual(supplied, options.agentUiToken)) {
      sendJson(response, 401, { error: 'unauthorized' });
      return;
    }
    let payload: unknown;
    try { payload = JSON.parse(await readBody(request)); }
    catch { sendJson(response, 400, { error: 'invalid_json' }); return; }
    const body = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown> : {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const workspace = typeof body.workspace === 'string' ? body.workspace.trim() : '';
    if (!prompt || prompt.length > 200_000 || workspace.length > 200) {
      sendJson(response, 400, { error: 'invalid_agent_request' });
      return;
    }
    try {
      const result = await options.agentRun({ prompt, ...(workspace ? { workspace } : {}) });
      sendJson(response, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('AGENT_RUNTIME_')) sendJson(response, 503, { error: message.slice(0, 300) });
      else throw error;
    }
    return;
  }

  if (options.oauthService && await options.oauthService.handle(request, response)) return;

  if (route !== '/mcp') {
    sendJson(response, 404, { error: 'not_found' });
    return;
  }

  const origin = security.validateMcpOrigin(request);
  if (!origin.ok) {
    sendJson(response, 403, { error: 'forbidden_origin' });
    return;
  }
  const key = await authenticateRequest(request, options.keyStore, options.oauthService);
  if (!key) {
    const headers: Record<string, string> = {};
    if (options.oauthService) headers['www-authenticate'] = options.oauthService.challenge(request);
    sendJson(response, 401, { error: 'unauthorized' }, headers);
    return;
  }

  await options.mcpHandler(request, response, key);
}

export function createHttpHandler(options: HttpHandlerOptions): RequestListener {
  return (request, response) => {
    const started = Date.now();
    const route = new URL(request.url ?? '/', 'http://localhost').pathname;
    response.once('finish', () => {
      if (route === '/health' || response.statusCode < 400) return;
      if (route === '/favicon.ico' && response.statusCode === 404) return;

      if (response.statusCode >= 500) {
        activityTracker.record(
          'HTTP',
          'error',
          `${request.method ?? 'UNKNOWN'} ${route} returned ${response.statusCode}`,
          'server-response-error',
          { statusCode: response.statusCode, method: request.method ?? '', route, durationMs: Date.now() - started },
        );
        return;
      }

      const module = response.statusCode === 401 || response.statusCode === 403 ? 'AUTH' : 'REQUEST';
      activityTracker.record(
        module,
        'info',
        `${request.method ?? 'UNKNOWN'} ${route} returned ${response.statusCode}`,
        'client-response',
        { statusCode: response.statusCode, method: request.method ?? '', route, durationMs: Date.now() - started },
      );
    });
    void handleRequest(request, response, options).catch((error) => {
      activityTracker.captureFailure('HTTP', error, 'http-request-failure', { method: request.method ?? '', route: new URL(request.url ?? '/', 'http://localhost').pathname });
      if (!response.headersSent) sendJson(response, 500, { error: 'internal_error' });
      else if (!response.writableEnded) response.end();
    });
  };
}
