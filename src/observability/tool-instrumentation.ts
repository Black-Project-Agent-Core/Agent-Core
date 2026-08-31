import type { McpServer } from '@modelcontextprotocol/server';
import type { RuntimeServices } from '../runtime/services.js';
import { withCorrelation } from './correlation.js';

function routeContextIdFromArgs(args: unknown[]): string | undefined {
  const first = args[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return undefined;
  const value = (first as Record<string, unknown>).routeContextId;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function resultIsError(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && (value as { isError?: unknown }).isError === true);
}

export function instrumentToolRegistrations(server: McpServer, runtime: RuntimeServices): void {
  const original = server.registerTool.bind(server) as (...args: any[]) => any;
  (server as any).registerTool = ((name: string, config: unknown, handler: (...args: any[]) => unknown) => {
    return original(name, config, async (...args: any[]) => {
      const routeContextId = routeContextIdFromArgs(args);
      const startedAt = performance.now();
      const startedAtMs = Date.now();
      runtime.metrics.increment('tool.calls.count');
      return withCorrelation({ toolName: name, ...(routeContextId ? { routeContextId } : {}) }, async () => {
        try {
          const result = await handler(...args);
          const failed = resultIsError(result);
          const durationMs = Math.max(0, performance.now() - startedAt);
          runtime.metrics.observe('tool.duration_ms', durationMs);
          if (failed) runtime.metrics.increment('tool.failures.count');
          runtime.audit.logRuntime('tool', failed ? 'tool.failed' : 'tool.completed', {
            toolName: name,
            status: failed ? 'error' : 'ok',
            durationMs,
          });
          runtime.telemetry.recordToolSpan(name, startedAtMs, Date.now(), {
            'mcp.tool.name': name,
            'agent_core.status': failed ? 'error' : 'ok',
          });
          return result;
        } catch (error) {
          const durationMs = Math.max(0, performance.now() - startedAt);
          runtime.metrics.observe('tool.duration_ms', durationMs);
          runtime.metrics.increment('tool.failures.count');
          runtime.audit.logRuntime('tool', 'tool.failed', {
            toolName: name,
            status: 'error',
            durationMs,
            errorCode: error instanceof Error ? error.name : 'ERROR',
          });
          runtime.telemetry.recordToolSpan(name, startedAtMs, Date.now(), {
            'mcp.tool.name': name,
            'agent_core.status': 'error',
            'error.type': error instanceof Error ? error.name : 'ERROR',
          });
          throw error;
        }
      });
    });
  }) as typeof server.registerTool;
}
