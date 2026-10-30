import { randomUUID, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ExternalInvocationContext } from '../learning/external-controller.js';
import type { AutoCheckpointReceipt, MutationExecutionContext } from '../rdc/mutation-coordinator.js';
import type { TrackerEvent } from './activity-tracker.js';
import type { FailureLoopAdvisor } from '../mcp/failure-loop-advisor.js';
import { validBrowserUse, type BrowserObservationUse } from '../rdc/browser-control/procedure-context.js';

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
// Hash only our random process nonce, never an authentication/session token.
const PROCESS_INSTANCE_DIGEST = 'sha256:' + createHash('sha256').update(TOOL_INVOCATION_PROCESS_SESSION_ID).digest('hex');
/**
 * Who a Native call is for. Only the host that owns the call fills it, per call; it is never read from request
 * metadata or arguments, so a shared tool registry cannot be pointed at another task by what the model sends.
 */
export interface ToolCaller {
  readonly taskId: string;
  readonly workspace?: string;
  readonly sessionId: string;
  /** The credential id the mutation journal files the call under. */
  readonly principalId: string;
  readonly allowedTools: ReadonlySet<string>;
  readonly failureLoopAdvisor?: FailureLoopAdvisor;
  readonly imageInspector?: (args: unknown) => Promise<{ content: Array<Record<string, unknown>> }>;
}
export interface ToolInvocationRequest {
  readonly tool: string;
  readonly identity: Readonly<{ id: string; processSessionId: string }>;
  readonly invocationContext?: ExternalInvocationContext;
  readonly mutationContext: MutationExecutionContext;
  readonly checkpointReceipt: () => AutoCheckpointReceipt | undefined;
  readonly caller?: ToolCaller;
}
const invocationRequests = new AsyncLocalStorage<ToolInvocationRequest>();
const requestEvidence = new WeakMap<ToolInvocationRequest, ToolInvocationEvidence>();
const browserUseByRequest = new WeakMap<ToolInvocationRequest, BrowserObservationUse>();
/** Internal browser owner only: the terminal wrapper remains the only persistence writer. */
export function stageBrowserObservationUse(value: BrowserObservationUse): void {
  const request = invocationRequests.getStore();
  if (!request || request.tool !== 'browser_control' || request.invocationContext?.binding !== 'bound'
    || request.mutationContext.signal?.aborted || !validBrowserUse(value)) return;
  browserUseByRequest.set(request, value);
}
/** One terminal read, never reusable across requests or after late/cancelled settlement. */
export function takeBrowserObservationUse(): BrowserObservationUse | undefined {
  const request = invocationRequests.getStore();
  if (!request) return undefined;
  const value = browserUseByRequest.get(request);
  browserUseByRequest.delete(request);
  return value && !request.mutationContext.signal?.aborted ? value : undefined;
}
export function createToolInvocationIdentity() {
  return Object.freeze({ id: randomUUID().replaceAll('-', ''), processSessionId: TOOL_INVOCATION_PROCESS_SESSION_ID });
}
export function currentToolInvocationRequest(): ToolInvocationRequest | undefined { return invocationRequests.getStore(); }
export function currentExternalInvocationContext(): ExternalInvocationContext | undefined { return invocationRequests.getStore()?.invocationContext; }
/** The host-supplied caller of the running Native tool call, if any. */
export function currentToolCaller(): ToolCaller | undefined { return invocationRequests.getStore()?.caller; }
export function withToolInvocationRequest<T>(request: ToolInvocationRequest, action: () => Promise<T>): Promise<T> {
  return invocationRequests.run(request, action);
}
export function currentToolInvocationEvidence(): ToolInvocationEvidence | undefined {
  const request = invocationRequests.getStore();
  return request && requestEvidence.get(request);
}
export function beginToolInvocationEvidence(
  tracker: InvocationTracker,
  tool: string,
  properties: Record<string, unknown> = {},
): ToolInvocationEvidence {
  const request = invocationRequests.getStore();
  if (request?.tool === tool && requestEvidence.has(request)) return requestEvidence.get(request)!;
  const identity = request?.tool === tool ? request.identity : createToolInvocationIdentity();
  const id = identity.id;
  const original = request?.tool === tool ? request.invocationContext : undefined;
  const fixedProperties = Object.freeze({ ...properties });
  const started = process.hrtime.bigint();
  let terminal = false;
  const base = () => ({
    ...fixedProperties,
    tool, invocationId: id, processSessionId: identity.processSessionId, processInstanceDigest: PROCESS_INSTANCE_DIGEST, invocationSource: 'mcp-wrapper',
    binding: original?.binding ?? 'unbound',
    ...(!original?.taskId && request?.mutationContext.taskId ? { taskId: request.mutationContext.taskId } : {}),
    ...(original?.taskId ? { taskId: original.taskId, ownerId: original.ownerId,
      workspaceIdentityKey: original.workspaceIdentityKey, workspace: original.workspace } : {}),
    ...(original ? { capturedAt: original.capturedAt, unboundReason: original.unboundReason } : {}),
    ...(request?.checkpointReceipt() ? { autoCheckpoint: request.checkpointReceipt() } : {}),
  });
  try { tracker.record('MCP', 'info', `${tool} started`, 'tool-invocation-start', base()); } catch {}

  const duration = () => Number(process.hrtime.bigint() - started) / 1_000_000;
  const evidence: ToolInvocationEvidence = {
    id,
    processSessionId: identity.processSessionId,
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
      const family = error instanceof Error ? error.message.match(/^[A-Z][A-Z0-9_-]{2,80}(?=[:\s]|$)/)?.[0] : undefined;
      try { tracker.captureFailure('MCP', new Error(family ?? 'TOOL_OPERATION_EXCEPTION'), 'tool-exception', merged); } catch {}
      return true;
    },
  };
  if (request?.tool === tool) requestEvidence.set(request, evidence);
  return evidence;
}

function invocationIdentity(event: TrackerEvent): {
  invocationId?: string;
  processSessionId?: string;
  processInstanceDigest?: string;
  tool?: string;
} {
  const invocationId = typeof event.context?.invocationId === 'string'
    ? event.context.invocationId
    : undefined;
  const processSessionId = typeof event.context?.processSessionId === 'string'
    ? event.context.processSessionId
    : undefined;
  const processInstanceDigest = typeof event.context?.processInstanceDigest === 'string'
    && /^sha256:[a-f0-9]{64}$/.test(event.context.processInstanceDigest) ? event.context.processInstanceDigest : undefined;
  const tool = typeof event.context?.tool === 'string' ? event.context.tool : undefined;
  return { invocationId, processSessionId, processInstanceDigest, tool };
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
    if (identity.processInstanceDigest === PROCESS_INSTANCE_DIGEST || identity.processSessionId === TOOL_INVOCATION_PROCESS_SESSION_ID) continue;
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
          reconcilerProcessInstanceDigest: PROCESS_INSTANCE_DIGEST,
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
