import type { AgentMemoryUse } from './agent-memory-use.js';
import type { AgentProviderRoutingEvent } from './agent-provider.js';

export type AgentTurnEventType =
  | 'turn.accepted'
  | 'memory.recall.started'
  | 'memory.recall.completed'
  | 'agent.planning'
  | 'tool.started'
  | 'tool.completed'
  | 'assistant.progress'
  | 'agent.budget'
  | 'context.usage'
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
  /** context.usage only: size of the full prompt of the LAST provider call (not cumulative), and the known window if any. */
  contextTokens?: number;
  contextWindow?: number;
  /** tool.completed only: wall-clock duration of the tool call. */
  durationMs?: number;
  /** tool.started / tool.completed: one-line argument summary (<= 80 chars, secret-keyed values masked). */
  argsSummary?: string;
  /** tool.completed only: one-line outcome (<= 80 chars, counts/exit code/error excerpt, never file content or secrets). */
  resultSummary?: string;
  /** assistant.progress only: the assistant's short narration for this iteration (<= 280 chars). */
  text?: string;
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

const SECRET_ASSIGNMENT = /\b([\w-]*(?:key|token|secret|password|authorization|cookie)[\w-]*)\s*[:=]\s*(?:Bearer\s+)?\S+/gi;

/** Masks secret-keyed assignments and well-known token shapes in free text bound for the transcript. */
function maskSecretLikeText(text: string): string {
  return text
    .replace(SECRET_ASSIGNMENT, '$1=***')
    .replace(/\bBearer\s+[\w.~+/=-]{6,}/gi, 'Bearer ***')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, '***');
}

function boundedLine(text: string, maxLength: number): string {
  const line = maskSecretLikeText(text).replace(/\s+/g, ' ').trim();
  return line.length > maxLength ? line.slice(0, maxLength - 1) + '…' : line;
}

const PROCESS_TOOLS = new Set(['start_process', 'interact_with_process', 'read_process_output', 'force_terminate']);

function plural(count: number, one: string, many: string): string {
  return count + ' ' + (count === 1 ? one : many);
}

/**
 * One-line (<= 80 chars) outcome of a tool call for the transcript, derived from the result shape only.
 * It reports counts, exit codes and error excerpts; file content is never copied and secret-like values are masked.
 */
export function summarizeToolResult(
  toolName: string,
  result: { isError?: boolean; text?: string } | undefined,
  args?: unknown,
): string {
  const text = typeof result?.text === 'string' ? result.text : '';
  if (result?.isError) return boundedLine('error: ' + boundedLine(text, 60), 80);
  let summary: string | undefined;
  if (toolName === 'start_search' || toolName === 'get_more_search_results') {
    const hits = [...text.matchAll(/^\s*📄\s+(.+?):\d+\b/gm)];
    const declared = /\((\d+) match(?:es)?\)/.exec(text);
    const matches = declared ? Number(declared[1]) : hits.length;
    if (matches > 0 && hits.length > 0) {
      summary = plural(matches, 'match', 'matches') + ' in ' + plural(new Set(hits.map(hit => hit[1])).size, 'file', 'files');
    } else if (hits.length === 0 && /Total results/i.test(text)) {
      summary = plural(Number(/Total results(?: found)?:\s*(\d+)/i.exec(text)?.[1] ?? 0), 'result', 'results');
    }
  } else if (toolName === 'read_file') {
    const read = /\[Reading (\d+) lines?/.exec(text);
    if (read) summary = 'read ' + plural(Number(read[1]), 'line', 'lines');
  } else if (toolName === 'list_directory') {
    const entries = text.split('\n').filter(line => /^\[[A-Z_]+\]\s/.test(line)).length;
    if (entries > 0) summary = plural(entries, 'entry', 'entries');
  } else if (PROCESS_TOOLS.has(toolName)) {
    const exit = /\bexit(?:ed)?(?: with)?(?: code)?[:= ]+(-?\d+)/i.exec(text);
    if (exit) summary = 'exit ' + exit[1];
  } else if (toolName === 'write_file' || toolName === 'edit_block') {
    const record = args && typeof args === 'object' ? args as Record<string, unknown> : {};
    const target = [record.path, record.file_path].find((value): value is string => typeof value === 'string' && value.length > 0);
    summary = 'edited ' + (target ?? 'file');
  }
  return boundedLine(summary ?? 'ok · ' + plural(text.length, 'char', 'chars'), 80);
}

/** Assistant narration for the transcript: one masked line, at most 280 characters; empty when there is nothing to say. */
export function summarizeAssistantProgress(text: string | null | undefined): string {
  return typeof text === 'string' ? boundedLine(text, 280) : '';
}

/** Iteration at which the one-time "approaching the step limit" warning fires: ceil(75%) of the limit. */
export function iterationBudgetThreshold(maxIterations: number): number {
  return Math.ceil(0.75 * maxIterations);
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
