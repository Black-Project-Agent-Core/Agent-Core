import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import type { FileKeyStore } from '../auth/key-store.js';
import type { VerifiedKey } from '../auth/key-types.js';
import type { AuditLogger } from '../logging/audit-log.js';
import type { OAuthService } from '../oauth/service.js';
import { authenticateRequest } from './auth.js';
import { HttpSecurityPolicy } from './security-policy.js';
import { createRequestCorrelation, formatTraceparent, runWithCorrelation } from '../observability/correlation.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import type { TelemetryService } from '../observability/telemetry.js';

export type MemoryContextLeaseHttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export type McpHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  key: VerifiedKey,
) => Promise<void>;

export interface HttpHandlerOptions {
  keyStore: FileKeyStore;
  auditLogger: AuditLogger;
  mcpHandler: McpHttpHandler;
  oauthService?: OAuthService;
  security?: HttpSecurityPolicy;
  healthProvider?: () => Promise<Record<string, unknown>>;
  healthMetricsProvider?: () => Promise<Record<string, unknown>>;
  metrics?: RuntimeMetricRegistry;
  telemetry?: TelemetryService;
  memoryContextLeaseHandler?: MemoryContextLeaseHttpHandler;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

const DEFAULT_HTTP_SECURITY = new HttpSecurityPolicy({
  publicBaseUrl: null,
  trustProxy: false,
  allowedOrigins: [],
});

const OBSERVABLE_ROUTES = new Set([
  '/health', '/health/metrics', '/mcp', '/internal/memory-context-lease',
  '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server',
  '/oauth/register', '/oauth/authorize', '/oauth/token',
]);

function telemetryRoute(route: string): string {
  return OBSERVABLE_ROUTES.has(route) ? route : '/other';
}

export function createHttpHandler(options: HttpHandlerOptions): RequestListener {
  return (request, response) => {
    const correlation = createRequestCorrelation(request.headers as Record<string, unknown>);
    response.setHeader('x-agent-core-request-id', correlation.requestId);
    response.setHeader('traceparent', formatTraceparent(correlation));
    runWithCorrelation(correlation, () => {
      void handleRequest(request, response, options, correlation.requestId);
    });
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HttpHandlerOptions,
  requestId: string,
): Promise<void> {
  const startedAt = Date.now();
  const route = new URL(request.url ?? '/', 'http://localhost').pathname;
  const security = options.security ?? DEFAULT_HTTP_SECURITY;
  let key: VerifiedKey | null = null;

  try {
    if (request.method === 'GET' && route === '/health/metrics') {
      if (!security.isLoopbackRequest(request)) {
        sendJson(response, 403, { error: 'metrics_local_only' });
        return;
      }
      const metrics = options.healthMetricsProvider ? await options.healthMetricsProvider() : { overallHealth: 'degraded' };
      sendJson(response, 200, metrics);
      return;
    }

    if (request.method === 'GET' && route === '/health') {
      const diagnostics = options.healthProvider ? await options.healthProvider() : {};
      sendJson(response, 200, { status: 'ok', service: 'agent-core', ...diagnostics });
      return;
    }

    if (route === '/internal/memory-context-lease') {
      if (!security.isLoopbackRequest(request)) {
        sendJson(response, 403, { error: 'memory_context_lease_local_only' });
        return;
      }
      if (!options.memoryContextLeaseHandler) {
        sendJson(response, 404, { error: 'memory_context_lease_unavailable' });
        return;
      }
      await options.memoryContextLeaseHandler(request, response);
      return;
    }

    if (options.oauthService && await options.oauthService.handle(request, response)) {
      return;
    }

    if (route === '/mcp') {
      const origin = security.validateMcpOrigin(request);
      if (!origin.ok) {
        sendJson(response, 403, { error: 'forbidden_origin' });
        return;
      }
      key = await authenticateRequest(request, options.keyStore, options.oauthService);
      if (!key) {
        options.metrics?.increment('auth.failures.count');
        const headers: Record<string, string> = {};
        if (options.oauthService) {
          headers['www-authenticate'] = options.oauthService.challenge(request);
        }
        sendJson(response, 401, { error: 'unauthorized' }, headers);
        return;
      }
      await options.mcpHandler(request, response, key);
      return;
    }

    sendJson(response, 404, { error: 'not_found' });
  } catch {
    if (!response.headersSent) sendJson(response, 500, { error: 'internal_error' });
    else if (!response.writableEnded) response.end();
  } finally {
    const durationMs = Math.max(0, Date.now() - startedAt);
    options.metrics?.increment('http.requests.count');
    options.metrics?.observe('http.request.duration_ms', durationMs);
    if (response.statusCode >= 400) options.metrics?.increment('http.failures.count');
    options.telemetry?.recordHttpSpan(startedAt, Date.now(), {
      'http.request.method': request.method ?? 'UNKNOWN',
      'http.route': telemetryRoute(route),
      'http.response.status_code': response.statusCode,
      'agent_core.status': response.statusCode >= 400 ? 'error' : 'ok',
    });
    try {
      void options.auditLogger.log({
        timestamp: new Date().toISOString(),
        requestId,
        method: request.method ?? 'UNKNOWN',
        route,
        status: response.statusCode,
        durationMs,
        keyId: key?.id ?? null,
        keyName: key?.name ?? null,
      });
    } catch {
      // Audit failures must not leak credentials or crash an already handled request.
    }
  }
}
