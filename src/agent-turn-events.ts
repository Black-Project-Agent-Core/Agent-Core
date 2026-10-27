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
