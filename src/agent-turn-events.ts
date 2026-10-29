import type { AgentMemoryUse } from './agent-memory-use.js';
import type { AgentProviderRoutingEvent } from './agent-provider.js';

export type AgentTurnEventType =
  | 'turn.accepted'
  | 'memory.recall.started'
  | 'memory.recall.completed'
  | 'agent.planning'
  | 'tool.started'
  | 'tool.completed'
  | 'verification.started'
  | 'verification.completed'
  | 'learning.finalization.started'
  | 'learning.finalization.completed'
  | 'provider.route.changed'
  | 'provider.route.decision'
  | 'provider.waiting'
  | 'assistant.final'
  | 'turn.failed'
  | 'turn.paused'
  | 'turn.cancelled';

/**
 * Secret-free routing evidence for one provider/key decision. totalAttempts spans every
 * attempt window of the turn; the pool's own attempt/attemptLimit describe the window.
 */
export type AgentTurnRoutingEvidence = AgentProviderRoutingEvent & {
  taskId: string;
  totalAttempts: number;
  maxTotalAttempts: number;
};

export interface AgentTurnEvent {
  type: AgentTurnEventType;
  at: string;
  toolName?: string;
  success?: boolean;
  /** tool.started / tool.completed: 1-based loop iteration and its configured limit. */
  iteration?: number;
  maxIterations?: number;
  /** tool.completed only: wall-clock duration of the tool call. */
  durationMs?: number;
  /** tool.started / tool.completed: one-line argument summary (<= 80 chars, secret-keyed values masked). */
  argsSummary?: string;
  itemCount?: number;
  providerId?: string;
  model?: string;
  response?: string;
  memoryUse?: AgentMemoryUse[];
  modelIdentity?: import('./agent-memory-evaluation.js').NativeMemoryResultMetadata['modelIdentity'];
  code?: string;
  retryAtMs?: number | null;
  routing?: AgentTurnRoutingEvidence;
  /** `turn.cancelled` only: processes this task started that the ledger still records as running. Reported, never stopped. */
  ownedProcesses?: Array<{ pid: number; status: 'running' | 'cancelling' }>;
}
const SENSITIVE_ARG_KEY = /key|token|secret|password|authorization|cookie/i;

function stringifyArg(value: unknown): string {
  try {
    return JSON.stringify(value, (key, inner) => (key && SENSITIVE_ARG_KEY.test(key) ? '***' : inner)) ?? String(value);
  } catch {
    return '[unserializable]';
  }
}

/** One-line, bounded tool-argument summary for the transcript; values under secret-like keys are masked. */
export function summarizeToolArgs(args: unknown, maxLength = 80): string {
  if (args === undefined || args === null) return '';
  const text = (typeof args === 'object' && !Array.isArray(args)
    ? Object.entries(args as Record<string, unknown>)
      .map(([key, value]) => key + '=' + (SENSITIVE_ARG_KEY.test(key) ? '***' : stringifyArg(value)))
      .join(' ')
    : stringifyArg(args)).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

export type AgentTurnEventSink = (event: AgentTurnEvent) => void | Promise<void>;

export async function emitAgentTurnEvent(
  sink: AgentTurnEventSink | undefined,
  event: Omit<AgentTurnEvent, 'at'>,
): Promise<void> {
  if (!sink) return;
  try {
    await sink({ ...event, at: new Date().toISOString() });
  } catch {
    // Presentation/observability must never become execution authority.
  }
}
