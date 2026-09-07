import type { SubAgentCoreWorker, WorkerEnvelope, WorkerMemoryHandoff, WorkerToolRequest } from './types.js';

const MAX_ITEMS = 24;
const MAX_TEXT = 12_000;

function boundedString(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value !== 'string') throw new Error(`WORKER_ENVELOPE_INVALID:${field}`);
  const text = value.trim();
  if (text.length > max) throw new Error(`WORKER_ENVELOPE_INVALID:${field}_TOO_LARGE`);
  return text;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error(`WORKER_ENVELOPE_INVALID:${field}`);
  return value.map((item, index) => boundedString(item, `${field}[${index}]`, 4_000));
}

function toolRequests(value: unknown): WorkerToolRequest[] {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new Error('WORKER_ENVELOPE_INVALID:toolRequests');
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`WORKER_ENVELOPE_INVALID:toolRequests[${index}]`);
    }
    const record = item as Record<string, unknown>;
    const args = record.args;
    if (args !== undefined && (!args || typeof args !== 'object' || Array.isArray(args))) {
      throw new Error(`WORKER_ENVELOPE_INVALID:toolRequests[${index}].args`);
    }
    return {
      tool: boundedString(record.tool, `toolRequests[${index}].tool`, 200),
      reason: boundedString(record.reason, `toolRequests[${index}].reason`, 2_000),
      ...(args ? { args: args as Record<string, unknown> } : {}),
    };
  });
}

function memoryHandoff(value: unknown): WorkerMemoryHandoff {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('WORKER_ENVELOPE_INVALID:memoryHandoff');
  }
  const record = value as Record<string, unknown>;
  return {
    facts: stringArray(record.facts, 'memoryHandoff.facts'),
    decisions: stringArray(record.decisions, 'memoryHandoff.decisions'),
    failures: stringArray(record.failures, 'memoryHandoff.failures'),
    nextStep: boundedString(record.nextStep ?? '', 'memoryHandoff.nextStep', 4_000),
  };
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseWorkerEnvelope(text: string): WorkerEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    throw new Error('WORKER_ENVELOPE_INVALID:JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('WORKER_ENVELOPE_INVALID:ROOT');
  }
  const record = parsed as Record<string, unknown>;
  return {
    summary: boundedString(record.summary, 'summary', 8_000),
    findings: stringArray(record.findings, 'findings'),
    proposedActions: stringArray(record.proposedActions, 'proposedActions'),
    toolRequests: toolRequests(record.toolRequests),
    memoryHandoff: memoryHandoff(record.memoryHandoff),
  };
}

export function buildWorkerSystemPrompt(
  worker: SubAgentCoreWorker,
  input: { leaderName: string; sharedMemoryContext: readonly string[] },
): string {
  const memory = input.sharedMemoryContext.length
    ? input.sharedMemoryContext.map((line, index) => `${index + 1}. ${line}`).join('\n')
    : '(No relevant durable memory was recalled for this task.)';
  return [
    `You are ${worker.name}, the SubAgentCore ${worker.role}.`,
    `${input.leaderName} is the sole leader and orchestration authority. You are a worker, never a leader.`,
    `Goal: ${worker.goal}`,
    `Boundary: ${worker.taskBoundary}`,
    `Allowed tools you may REQUEST from the leader: ${worker.allowedTools.join(', ')}.`,
    'Do not execute, invent, or claim use of tools outside that allowlist. Tool requests are proposals; the leader decides whether to execute them.',
    'You MUST reason from the shared Agent Core memory below before proposing work. It is the common team memory used by every SubAgentCore worker.',
    '--- shared Agent Core memory ---',
    memory,
    '--- end shared memory ---',
    'Follow the leader task exactly. Learn the leader work pattern from shared memory and repeated leader decisions; adapt your execution to that pattern instead of asking the leader to adapt to yours.',
    'Never redefine the leader workflow, team authority, acceptance criteria, or coding discipline. Your output is advisory evidence for JOE; the leader works in parallel on coding and learning and may override your proposal. Prefer existing internal capabilities before new code. Distinguish evidence from inference.',
    'Return ONLY one JSON object with this exact top-level shape:',
    '{"summary":"...","findings":["..."],"proposedActions":["..."],"toolRequests":[{"tool":"...","reason":"...","args":{}}],"memoryHandoff":{"facts":["..."],"decisions":["..."],"failures":["..."],"nextStep":"..."}}',
    'memoryHandoff must contain only durable, task-relevant information suitable for the shared Agent Core memory. Never include API keys, bearer tokens, passwords, cookies, or opaque cloud IDs.',
  ].join('\n');
}

export function buildWorkerTaskPrompt(task: string, context?: string): string {
  return [`TASK:\n${task.trim()}`, context?.trim() ? `CONTEXT:\n${context.trim()}` : ''].filter(Boolean).join('\n\n');
}
