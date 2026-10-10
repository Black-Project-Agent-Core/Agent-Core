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
  | 'assistant.final'
  | 'turn.failed'
  | 'turn.cancelled';

export interface AgentTurnEvent {
  type: AgentTurnEventType;
  at: string;
  toolName?: string;
  success?: boolean;
  itemCount?: number;
  providerId?: string;
  model?: string;
  response?: string;
  code?: string;
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
