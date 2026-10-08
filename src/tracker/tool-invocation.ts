import { randomUUID } from 'node:crypto';
import type { TrackerEvent } from './activity-tracker.js';

export type ToolInvocationOutcome = 'success' | 'handled-failure';

export interface InvocationTracker {
  record(
    module: string,
    level: 'info' | 'success' | 'warn' | 'error' | 'sys',
    message: string,
    kind?: string,
    context?: Record<string, unknown>,
  ): unknown;
  captureFailure(
    module: string,
    error: unknown,
    kind?: string,
    context?: Record<string, unknown>,
  ): unknown;
}

export interface InvocationReconciliationTracker extends InvocationTracker {
  readToolInvocationEvents(options?: { maxEvents?: number; maxAgeMs?: number }): TrackerEvent[];
}

export interface ToolInvocationEvidence {
  readonly id: string;
  readonly processSessionId: string;
  finish(outcome: ToolInvocationOutcome, context?: Record<string, unknown>): boolean;
  fail(error: unknown, context?: Record<string, unknown>): boolean;
}

export const TOOL_INVOCATION_PROCESS_SESSION_ID = randomUUID().replaceAll('-', '');
export function beginToolInvocationEvidence(
  tracker: InvocationTracker,
  tool: string,
  properties: Record<string, unknown> = {},
): ToolInvocationEvidence {
  const id = randomUUID().replaceAll('-', '');
  const started = process.hrtime.bigint();
  let terminal = false;
  const base = () => ({
    tool,
    invocationId: id,
    processSessionId: TOOL_INVOCATION_PROCESS_SESSION_ID,
    invocationSource: 'mcp-wrapper',
    ...properties,
  });
  try { tracker.record('MCP', 'info', `${tool} started`, 'tool-invocation-start', base()); } catch {}

  const duration = () => Number(process.hrtime.bigint() - started) / 1_000_000;
  return {
    id,
    processSessionId: TOOL_INVOCATION_PROCESS_SESSION_ID,
    finish(outcome, context = {}) {
      if (terminal) return false;
      terminal = true;
      const merged = { ...context, ...base(), outcome, durationMs: duration() };
      try {
        tracker.record(
          outcome === 'handled-failure' ? 'OPERATION' : 'MCP',
          outcome === 'handled-failure' ? 'info' : 'success',
          outcome === 'handled-failure' ? `${tool} operation failed` : `${tool} completed`,
          outcome === 'handled-failure' ? 'handled-tool-failure' : 'tool-call',
          merged,
        );
      } catch {}
      return true;
    },
    fail(error, context = {}) {
      if (terminal) return false;
      terminal = true;
      const merged = { ...context, ...base(), outcome: 'exception', durationMs: duration() };
      try { tracker.captureFailure('MCP', error, 'tool-exception', merged); } catch {}
      return true;
    },
  };
}

function invocationIdentity(event: TrackerEvent): {
  invocationId?: string;
  processSessionId?: string;
  tool?: string;
} {
  const invocationId = typeof event.context?.invocationId === 'string'
    ? event.context.invocationId
    : undefined;
  const processSessionId = typeof event.context?.processSessionId === 'string'
    ? event.context.processSessionId
    : undefined;
  const tool = typeof event.context?.tool === 'string' ? event.context.tool : undefined;
  return { invocationId, processSessionId, tool };
}

export function reconcileInterruptedToolInvocations(
  tracker: InvocationReconciliationTracker,
): { scanned: number; orphanStarts: number; reconciled: number } {
  const events = tracker.readToolInvocationEvents({ maxEvents: 5_000, maxAgeMs: 7 * 24 * 60 * 60 * 1000 });
  const terminals = new Set<string>();
  const starts = new Map<string, TrackerEvent>();

  for (const event of events) {
    const { invocationId } = invocationIdentity(event);
    if (!invocationId) continue;
    if (event.kind === 'tool-invocation-start') starts.set(invocationId, event);
    else terminals.add(invocationId);
  }
  let orphanStarts = 0;
  let reconciled = 0;
  for (const [invocationId, start] of starts) {
    const identity = invocationIdentity(start);
    if (identity.processSessionId === TOOL_INVOCATION_PROCESS_SESSION_ID) continue;
    if (terminals.has(invocationId)) continue;
    orphanStarts += 1;
    try {
      tracker.record(
        'MCP',
        'warn',
        `${identity.tool ?? 'tool'} invocation interrupted before terminal evidence was recorded`,
        'tool-invocation-interrupted',
        {
          ...(start.context ?? {}),
          invocationId,
          processSessionId: identity.processSessionId ?? 'unknown',
          reconcilerProcessSessionId: TOOL_INVOCATION_PROCESS_SESSION_ID,
          outcome: 'outcome-unknown',
          retryDirective: 'never-blind-retry',
          recoveredFromEventId: start.id,
        },
      );
      reconciled += 1;
    } catch {
      // Reconciliation is fail-soft; an unavailable tracker must not block startup.
    }
  }
  return { scanned: events.length, orphanStarts, reconciled };
}
