import type { AgentChatEvent, AgentChatStepMeta, AgentChatTurn } from './host';
import { ACTIVITY_STATES, type ActivityStateId } from './activityStates';

/**
 * Derives the single Unified Status Indicator v3 state for one Native chat turn.
 *
 * One card footprint: the caller replaces the card contents, it never stacks a row
 * per event. Event identity (turnId + sequence) is the host's responsibility; here a
 * turn status plus its most recent event are mapped to the 32 canonical states from
 * agent-status-v3-state-map.json.
 */

const MAX_DESCRIPTION = 220;

export type ActivityPhaseInput = {
  turnStatus: AgentChatTurn['status'];
  errorCode?: string;
  event?: AgentChatEvent;
  steps: AgentChatStepMeta[];
};

export type ActivityPhase = {
  state: ActivityStateId;
  title: string;
  description: string;
  stepCount: number;
};

// argsSummary looks like path="a.ts", so an extension ends at a quote, whitespace, comma or the end.
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp)(?=["'\s,)]|$)/i;
const CODE_EXTENSION = /\.(ts|tsx|js|jsx|cs|py|json|css|html)(?=["'\s,)]|$)/i;
const TEST_COMMAND = /vitest|jest|pytest|\btest\b|tsc\b/i;

const READING_TOOLS = new Set([
  'read_file',
  'read_multiple_files',
  'list_directory',
  'get_file_info',
  'start_search',
  'get_more_search_results',
  'list_searches',
  'stop_search',
]);

const MEMORY_READ_TOOLS = new Set([
  'memory_search',
  'memory_list',
  'memory_page',
  'memory_read',
  'memory_retrieval_diagnostics',
  'memory_v2_read',
]);

const MEMORY_WRITE_TOOLS = new Set([
  'memory_remember',
  'memory_update',
  'memory_batch',
  'memory_v2_write',
  'learning',
  'controller_learning',
]);

const PROCESS_TOOLS = new Set([
  'start_process',
  'interact_with_process',
  'read_process_output',
  'list_processes',
  'kill_process',
  'force_terminate',
]);

function latestNote(steps: AgentChatStepMeta[]): AgentChatStepMeta | undefined {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.kind === 'note' && step.resultSummary) return step;
  }
  return undefined;
}

export function describeToolState(toolName: string, argsSummary?: string): ActivityStateId {
  if (READING_TOOLS.has(toolName)) {
    if (toolName === 'read_file' && argsSummary && IMAGE_EXTENSION.test(argsSummary)) return 'viewing_image';
    return 'reading';
  }
  if (toolName === 'image_inspect') return 'analyzing_image';
  if (toolName === 'skills') return 'using_skill';
  if (toolName === 'web_search') return 'web_search';
  if (toolName === 'web_open' || toolName === 'browser_control') return 'browsing';
  if (MEMORY_READ_TOOLS.has(toolName)) return 'memory_search';
  if (MEMORY_WRITE_TOOLS.has(toolName)) return 'memory_write';
  if (PROCESS_TOOLS.has(toolName)) {
    if (argsSummary && TEST_COMMAND.test(argsSummary)) return 'testing';
    return 'command';
  }
  if (toolName === 'write_file') {
    if (argsSummary && CODE_EXTENSION.test(argsSummary)) return 'coding';
    return 'creating';
  }
  if (toolName === 'edit_block' || toolName === 'code_refactor') return 'editing';
  if (toolName === 'create_directory' || toolName === 'move_file') return 'creating';
  if (toolName === 'write_pdf') return 'exporting';
  if (toolName === 'file_checkpoint') return 'saving';
  if (toolName === 'reconstruction_harness') return 'verifying';
  if (toolName.startsWith('code_') || toolName === 'artifact_inspect') return 'data_analysis';
  return 'using_tool';
}

function describeToolEvent(event: AgentChatEvent): { state: ActivityStateId; description?: string } {
  const toolState = describeToolState(event.toolName ?? '', event.argsSummary);
  if (event.success === false) {
    return {
      state: 'debugging',
      description: describeToolFailure(event, toolState),
    };
  }
  return {
    state: toolState,
    description: event.argsSummary ? clamp(event.argsSummary) : undefined,
  };
}

function toolResultSummary(event: AgentChatEvent): string {
  return (event.resultSummary ?? '').trim();
}

function describeToolFailure(event: AgentChatEvent, toolState: ActivityStateId): string {
  const name = event.toolName || toolState;
  const summary = toolResultSummary(event);
  return summary ? `${name} failed: ${summary}` : `${name} failed`;
}

function clamp(value: string): string {
  return value.length > MAX_DESCRIPTION ? value.slice(0, MAX_DESCRIPTION - 1) + '…' : value;
}

function fromEvent(event: AgentChatEvent): { state: ActivityStateId; title?: string; description?: string } {
  switch (event.type) {
    case 'turn.accepted':
      return { state: 'thinking' };
    case 'memory.recall.started':
      return { state: 'memory_search' };
    case 'memory.recall.completed':
      return { state: 'thinking' };
    case 'agent.planning':
    case 'agent.budget':
      return { state: 'planning' };
    case 'assistant.progress':
      return { state: 'thinking', description: event.text };
    case 'tool.started':
      return describeToolEvent(event);
    case 'tool.completed': {
      const outcome = describeToolEvent(event);
      if (event.success !== false) {
        const name = event.toolName || outcome.state;
        const summary = toolResultSummary(event);
        return {
          state: 'thinking',
          description: summary ? `${name} finished: ${summary}` : `${name} finished`,
        };
      }
      return outcome;
    }
    case 'verification.started':
      return { state: 'verifying' };
    case 'verification.completed':
      return { state: 'thinking' };
    case 'learning.finalization.started':
      return { state: 'memory_write', title: 'Updating memory…' };
    case 'learning.finalization.completed':
      return { state: 'thinking' };
    case 'provider.route.changed':
    case 'provider.route.decision':
      return { state: 'retrying' };
    case 'provider.waiting':
      return { state: 'waiting' };
    case 'assistant.final':
      return { state: 'complete' };
    case 'turn.failed':
      return { state: 'error' };
    case 'turn.cancelled':
      return { state: 'error', title: 'Task stopped' };
    case 'turn.paused':
      return { state: 'waiting' };
    default:
      return { state: 'thinking' };
  }
}

/**
 * Terminal and paused turns are settled: the last event is not consulted because the
 * turn status is the authoritative outcome. Running turns derive their state from the
 * most recent event so the card reflects the live foreground operation.
 */
export function deriveActivity(input: ActivityPhaseInput): ActivityPhase {
  const { turnStatus, errorCode, event, steps } = input;
  const meta = ACTIVITY_STATES;
  const stepCount = steps.filter(step => step.kind !== 'note').length;

  if (turnStatus === 'finalized') {
    return phase('complete', meta.complete.title, meta.complete.desc, stepCount);
  }

  if (turnStatus === 'failed') {
    const failed = meta.error;
    return phase('error', failed.title, errorCode ?? failed.desc, stepCount);
  }

  if (turnStatus === 'stopped') {
    return phase('error', 'Task stopped', meta.error.desc, stepCount);
  }

  if (turnStatus === 'interrupted') {
    return phase('error', 'Interrupted; no safe checkpoint', meta.error.desc, stepCount);
  }

  if (turnStatus === 'resumable') {
    if (errorCode === 'AGENT_RUNTIME_CONTINUATION_PROVIDER_WAIT') {
      return phase('waiting', 'Waiting for an eligible provider',
        'It resumes by itself when a provider is eligible and the attempt budget permits. Stop recovery ends it.', stepCount);
    }
    // The code names why recovery is uncertain, so it stays visible beside the generic instruction.
    const detail = errorCode && errorCode !== 'AGENT_CHAT_TURN_RESUMABLE' ? ' (' + errorCode + ')' : '';
    return phase('waiting', 'Paused — Continue required', 'Choose Continue to resume, or Stop recovery to end it.' + detail, stepCount);
  }

  const derived = event ? fromEvent(event) : { state: 'thinking' as ActivityStateId };
  const state = meta[derived.state] ?? meta.using_tool;
  let title = derived.title ?? state.title;
  let description = derived.description ?? state.desc;

  // Narrative fallback: an explicit narration row is more useful than the generic copy.
  if (derived.state === 'thinking' && description === state.desc) {
    const note = latestNote(steps);
    if (note?.resultSummary) description = note.resultSummary;
  }

  return phase(state.id, title, description, stepCount);

  function phase(stateId: ActivityStateId, phaseTitle: string, phaseDescription: string, count: number): ActivityPhase {
    return {
      state: stateId,
      title: phaseTitle.length > 85 ? phaseTitle.slice(0, 84) + '…' : phaseTitle,
      description: clamp(phaseDescription),
      stepCount: count,
    };
  }
}
