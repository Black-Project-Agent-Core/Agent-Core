import React, { useEffect, useState } from 'react';
import type { AgentChatActivity } from './host';

/** 1,2 s style for >= 1 s (comma decimal, as in the product copy); whole ms below that. */
export function formatStepDuration(ms: number): string {
  return ms < 1000 ? Math.max(0, Math.round(ms)) + ' ms' : (ms / 1000).toFixed(1).replace('.', ',') + ' s';
}

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
export function ActivityList({ items }: { items: AgentChatActivity[] }) {
  return <details className="chat-activity">
    <summary>Activity · {items.length} {items.length === 1 ? 'step' : 'steps'}</summary>
    <ul>{items.map(item => <li key={item.id} className={'chat-activity-' + item.status}>
      <b>{item.toolName}</b>
      <span>{item.status}{item.durationMs !== undefined && ' · ' + formatStepDuration(item.durationMs)}</span>
      {item.iteration !== undefined && <small>step {item.iteration}{item.maxIterations ? '/' + item.maxIterations : ''}</small>}
      {item.argsSummary && <code>{item.argsSummary}</code>}
      {FILE_CHANGING_TOOLS.has(item.toolName) && <small>Review the actual changes with the task changes action on the result.</small>}
    </li>)}</ul>
  </details>;
}
