import React, { useEffect, useState } from 'react';
import { stepKey } from './host';
import type { AgentChatActivity, AgentChatStepMeta, StepDetailState } from './host';
import { AgentStepRow, formatStepDuration } from './AgentSteps';

export { formatStepDuration };

/** Ticks once per second; mounted only while the turn is running, so it never runs in the background. */
export function ElapsedSeconds({ since }: { since: string }) {
  const start = Date.parse(since);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!Number.isFinite(start)) return null;
  return <span className="chat-elapsed" aria-label="Elapsed time">{Math.max(0, Math.floor((now - start) / 1000))} s</span>;
}

const FILE_CHANGING_TOOLS = new Set(['write_file', 'edit_block', 'move_file', 'create_directory', 'code_refactor']);

/** Collapsible, bounded list of recent tool steps. File changes are reviewed in the existing task changes panel. */
export function ActivityList({ items, steps: stored = [], stepDetails, onStepDetail, currentTurnId }: {
  items: AgentChatActivity[]; steps?: AgentChatStepMeta[]; stepDetails?: Record<string, StepDetailState>;
  onStepDetail?: (turnId: string, seq: number) => void; currentTurnId?: string;
}) {
  // Persisted steps win for a turn that has them; live tool events stay for a turn without (narration always stays).
  const currentStored = currentTurnId !== undefined && stored.some(step => step.turnId === currentTurnId);
  const live = items.filter(item => item.kind !== 'budget' && (!currentStored || item.kind === 'note'));
  const steps = stored.length + live.filter(item => !item.kind).length;
  return <details className="chat-activity">
    <summary>Activity · {steps} {steps === 1 ? 'step' : 'steps'}</summary>
    <ul>{stored.map(step => <AgentStepRow key={stepKey(step.turnId, step.seq)} step={step}
      detail={stepDetails?.[stepKey(step.turnId, step.seq)]} onOpen={onStepDetail}/>)}
    {live.map(item => item.kind === 'note'
      ? <li key={item.id} className="chat-activity-note"><p>{item.text}</p></li>
      : <li key={item.id} className={'chat-activity-' + item.status}>
      <b>{item.toolName}</b>
      <span>{item.status}{item.durationMs !== undefined && ' · ' + formatStepDuration(item.durationMs)}</span>
      {item.iteration !== undefined && <small>step {item.iteration}{item.maxIterations ? '/' + item.maxIterations : ''}</small>}
      {item.argsSummary && <code>{item.argsSummary}</code>}
      {item.resultSummary && <em className="chat-activity-result">{item.resultSummary}</em>}
      {FILE_CHANGING_TOOLS.has(item.toolName) && <small>Review the actual changes with the task changes action on the result.</small>}
    </li>)}</ul>
  </details>;
}
