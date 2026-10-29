import React from 'react';
import { stepKey } from './host';
import type { AgentChatActivity, AgentChatStepMeta, StepDetailState } from './host';
import { AgentStepRow, STEP_GLYPH, formatStepDuration } from './AgentSteps';

export type StepCategory = 'read' | 'search' | 'run' | 'edit' | 'memory' | 'web' | 'other';

const CATEGORY_ORDER: StepCategory[] = ['read', 'search', 'run', 'edit', 'memory', 'web', 'other'];
const CATEGORY_BY_TOOL: Record<string, StepCategory> = {
  read_file: 'read', read_multiple_files: 'read', list_directory: 'read', get_file_info: 'read',
  start_search: 'search', get_more_search_results: 'search', list_searches: 'search', stop_search: 'search',
  start_process: 'run', interact_with_process: 'run', read_process_output: 'run', list_processes: 'run', kill_process: 'run', force_terminate: 'run',
  write_file: 'edit', edit_block: 'edit', move_file: 'edit', create_directory: 'edit', code_refactor: 'edit', write_pdf: 'edit',
  learning: 'memory', controller_learning: 'memory', skills: 'memory',
  web_search: 'web', web_open: 'web', browser_control: 'web',
};
const CATEGORY_PHRASE: Record<StepCategory, string> = {
  read: 'pembacaan', search: 'pencarian', run: 'perintah', edit: 'perubahan', memory: 'akses memori', web: 'akses web', other: 'langkah lain',
};

export function stepCategory(toolName: string): StepCategory {
  const exact = CATEGORY_BY_TOOL[toolName];
  if (exact) return exact;
  if (toolName.startsWith('memory_')) return 'memory';
  if (toolName.startsWith('code_')) return 'search';
  return 'other';
}

const isNote = (step: AgentChatStepMeta) => step.kind === 'note';

/** "4 pembacaan, 2 perintah": tool steps per category in a fixed order; notes and empty categories are skipped. */
export function summarizeSteps(steps: AgentChatStepMeta[]): string {
  const counts = new Map<StepCategory, number>();
  for (const step of steps) {
    if (isNote(step)) continue;
    const category = stepCategory(step.toolName);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return CATEGORY_ORDER.filter(category => counts.has(category))
    .map(category => `${counts.get(category)} ${CATEGORY_PHRASE[category]}`).join(', ');
}

export type TimelineItem =
  | { type: 'note'; key: string; text: string }
  | { type: 'group'; key: string; steps: AgentChatStepMeta[] };

/** Steps sorted by seq; consecutive tool steps form one group, a narration row breaks the group. Blank notes are dropped. */
export function buildTimeline(steps: AgentChatStepMeta[]): TimelineItem[] {
  const sorted = [...steps].sort((a, b) => a.seq - b.seq);
  const items: TimelineItem[] = [];
  let group: AgentChatStepMeta[] | undefined;
  for (const step of sorted) {
    if (isNote(step)) {
      group = undefined;
      const text = step.resultSummary ?? '';
      if (text.trim()) items.push({ type: 'note', key: `n:${step.turnId}:${step.seq}`, text });
      continue;
    }
    if (!group) {
      group = [];
      items.push({ type: 'group', key: `g:${step.turnId}:${step.seq}`, steps: group });
    }
    group.push(step);
  }
  return items;
}

const LIVE_STATUS: Record<AgentChatActivity['status'], AgentChatStepMeta['status']> = { running: 'running', done: 'ok', failed: 'error' };

/** Live activity rows of a running turn as ordered steps (seq = position); the budget warning is not a step. */
export function activityToSteps(turnId: string, items: AgentChatActivity[]): AgentChatStepMeta[] {
  const steps: AgentChatStepMeta[] = [];
  for (const item of items) {
    if (item.kind === 'budget') continue;
    const seq = steps.length + 1;
    if (item.kind === 'note') {
      steps.push({ turnId, seq, kind: 'note', toolName: '', status: 'ok', resultSummary: item.text ?? '', startedAtMs: 0 });
      continue;
    }
    steps.push({ turnId, seq, toolName: item.toolName, status: LIVE_STATUS[item.status], iteration: item.iteration,
      durationMs: item.durationMs, argsSummary: item.argsSummary, resultSummary: item.resultSummary, startedAtMs: 0 });
  }
  return steps;
}

function totalDuration(steps: AgentChatStepMeta[]): number | undefined {
  let total = 0;
  for (const step of steps) {
    if (step.durationMs === undefined) return undefined;
    total += step.durationMs;
  }
  return total;
}

function StepList({ steps, stepDetails, onStepDetail, readOnly }: {
  steps: AgentChatStepMeta[]; stepDetails?: Record<string, StepDetailState>; onStepDetail?: (turnId: string, seq: number) => void; readOnly?: boolean;
}) {
  return <ul className="chat-step-list">{steps.map(step => <AgentStepRow key={stepKey(step.turnId, step.seq)} step={step}
    detail={stepDetails?.[stepKey(step.turnId, step.seq)]} onOpen={onStepDetail} readOnly={readOnly}/>)}</ul>;
}

/** Narration interleaved with tool steps: a lone step stays a row, runs of steps collapse into a summarised group. */
export function TurnTimeline({ steps, stepDetails, onStepDetail, readOnly }: {
  steps: AgentChatStepMeta[]; stepDetails?: Record<string, StepDetailState>; onStepDetail?: (turnId: string, seq: number) => void; readOnly?: boolean;
}) {
  if (steps.length === 0) return null;
  const items = buildTimeline(steps);
  return <div className="chat-timeline">{items.map(item => {
    if (item.type === 'note') return <p key={item.key} className="chat-narration">{item.text}</p>;
    const list = <StepList steps={item.steps} stepDetails={stepDetails} onStepDetail={onStepDetail} readOnly={readOnly}/>;
    if (item.steps.length === 1) return <React.Fragment key={item.key}>{list}</React.Fragment>;
    const total = totalDuration(item.steps);
    const running = item.steps.some(step => step.status === 'running');
    return <details key={item.key} className="chat-step-group" open={running}>
      <summary>{summarizeSteps(item.steps)} · {item.steps.length} langkah{total !== undefined ? ' · ' + formatStepDuration(total) : ''}</summary>
      {list}
    </details>;
  })}</div>;
}

const MAX_CARDS = 6;

/** Compact "EXECUTED INVOCATIONS" card: the first six tool steps of a turn with status, duration and result summary. */
export function InvocationCards({ steps }: { steps: AgentChatStepMeta[] }) {
  const tools = steps.filter(step => !isNote(step));
  if (tools.length === 0) return null;
  const n = tools.length;
  return <section className="chat-invocations" aria-label="Executed invocations">
    <h5>EXECUTED INVOCATIONS ({n})</h5>
    <ul>{tools.slice(0, MAX_CARDS).map(step => <li key={stepKey(step.turnId, step.seq)}>
      <b>{step.toolName}</b>
      <span>{STEP_GLYPH[step.status].glyph + (step.durationMs !== undefined ? ' ' + formatStepDuration(step.durationMs) : '')}</span>
      {step.resultSummary && <code>{step.resultSummary}</code>}
    </li>)}
    {n > MAX_CARDS && <li className="chat-invocations-more">+{n - MAX_CARDS} lainnya</li>}</ul>
  </section>;
}
