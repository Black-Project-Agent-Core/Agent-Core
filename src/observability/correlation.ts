import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes, randomUUID } from 'node:crypto';

export interface CorrelationContext {
  requestId: string;
  traceId: string;
  spanId: string;
  traceFlags: string;
  parentSpanId?: string;
  routeContextId?: string;
  toolName?: string;
  runId?: string;
  nodeId?: string;
  attemptId?: string;
}

export type CorrelationPatch = Partial<Pick<
  CorrelationContext,
  'routeContextId' | 'toolName' | 'runId' | 'nodeId' | 'attemptId'
>>;

const storage = new AsyncLocalStorage<Readonly<CorrelationContext>>();
const TRACEPARENT_V00 = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ZERO_TRACE = '0'.repeat(32);
const ZERO_SPAN = '0'.repeat(16);

function randomHex(bytes: number): string {
  while (true) {
    const value = randomBytes(bytes).toString('hex');
    if (!/^0+$/.test(value)) return value;
  }
}

function headerValue(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const direct = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
  if (typeof direct === 'string') return direct.trim();
  if (Array.isArray(direct) && direct.length === 1 && typeof direct[0] === 'string') return direct[0].trim();
  return undefined;
}

function parseTraceparent(value: string | undefined): { traceId: string; parentSpanId: string; traceFlags: string } | null {
  if (!value || value.includes(',')) return null;
  const match = TRACEPARENT_V00.exec(value.toLowerCase());
  if (!match) return null;
  const traceId = match[1]!;
  const parentSpanId = match[2]!;
  const traceFlags = match[3]!;
  if (traceId === ZERO_TRACE || parentSpanId === ZERO_SPAN) return null;
  return { traceId, parentSpanId, traceFlags };
}

function freeze(context: CorrelationContext): Readonly<CorrelationContext> {
  return Object.freeze({ ...context });
}

export function createRequestCorrelation(headers: Record<string, unknown> = {}): CorrelationContext {
  const inbound = parseTraceparent(headerValue(headers, 'traceparent'));
  return {
    requestId: randomUUID(),
    traceId: inbound?.traceId ?? randomHex(16),
    spanId: randomHex(8),
    traceFlags: inbound?.traceFlags ?? '00',
    ...(inbound ? { parentSpanId: inbound.parentSpanId } : {}),
  };
}

export function formatTraceparent(context: Pick<CorrelationContext, 'traceId' | 'spanId' | 'traceFlags'>): string {
  return `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
}

export function runWithCorrelation<T>(context: CorrelationContext, operation: () => T): T {
  return storage.run(freeze(context), operation);
}

export function currentCorrelation(): CorrelationContext | null {
  const current = storage.getStore();
  return current ? { ...current } : null;
}

export function withCorrelation<T>(patch: CorrelationPatch, operation: () => T): T {
  const current = storage.getStore();
  if (!current) return operation();
  return storage.run(freeze({ ...current, ...patch }), operation);
}

export function correlationFields(context: CorrelationContext | null = currentCorrelation()): Record<string, string> {
  if (!context) return {};
  return {
    requestId: context.requestId,
    trace_id: context.traceId,
    span_id: context.spanId,
    trace_flags: context.traceFlags,
    ...(context.routeContextId ? { routeContextId: context.routeContextId } : {}),
    ...(context.toolName ? { toolName: context.toolName } : {}),
    ...(context.runId ? { runId: context.runId } : {}),
    ...(context.nodeId ? { nodeId: context.nodeId } : {}),
    ...(context.attemptId ? { attemptId: context.attemptId } : {}),
  };
}
