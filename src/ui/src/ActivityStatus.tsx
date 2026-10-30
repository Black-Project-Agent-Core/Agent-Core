import React, { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { AgentChatEvent, AgentChatStepMeta, AgentChatTurn } from './host';
import { ACTIVITY_STATES } from './activityStates';
import { ICON_SVG, SIGNAL_HTML } from './activityGraphics';
import { deriveActivity, describeToolState } from './activityPhase';
import { STEP_GLYPH, formatStepDuration } from './AgentSteps';
import './activity-status.css';

const MAX_EVENTS = 9;

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
};

const wallTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/** Seconds counter that ticks only while the turn runs; a settled turn keeps its final duration. */
function useDuration(running: boolean, startedAtMs: number | undefined, completedAtMs: number | undefined): string {
  const mountedAt = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const start = startedAtMs && startedAtMs > 0 ? startedAtMs : mountedAt.current;
  return clock((completedAtMs ?? (running ? now : Math.max(now, start))) - start);
}

/**
 * One fixed-size card per turn (Unified Status Indicator v3): the card replaces its own contents as the turn moves
 * between activities instead of stacking a row per event. The chevron opens the latest events; `children` (the full
 * step list with Input/Output) stays reachable under "All steps".
 */
export function ActivityStatus({ turnStatus, errorCode, event, steps, startedAtMs, completedAtMs, compact = false, children }: {
  turnStatus: AgentChatTurn['status'];
  errorCode?: string;
  event?: AgentChatEvent;
  steps: AgentChatStepMeta[];
  startedAtMs?: number;
  completedAtMs?: number;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const activity = deriveActivity({ turnStatus, errorCode, event, steps });
  const state = ACTIVITY_STATES[activity.state];
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const duration = useDuration(turnStatus === 'running', startedAtMs, completedAtMs);
  const recent = steps.filter(step => step.kind !== 'note').slice(-MAX_EVENTS).reverse();
  const close = () => { setOpen(false); toggle.current?.focus(); };
  return <div className={'activity-status' + (compact ? ' activity-status--compact' : '')}
    onKeyDown={keyEvent => { if (keyEvent.key === 'Escape' && open) { keyEvent.stopPropagation(); close(); } }}>
    <div className="status-holder">
      <div className="status-shell" data-state={state.id} role="group" aria-label={state.title + ' status'}
        style={{ '--accent': state.color, '--accent2': state.color2, '--rgba': state.rgb } as CSSProperties}>
        <div className="status-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_SVG[state.icon] }}/>
        <div className="status-content" role="status" aria-live="polite" aria-atomic="true">
          <div className="status-title">{activity.title}</div>
          <p className="status-desc">{activity.description}</p>
        </div>
        <div className="status-right">
          {compact && <span className="activity-status__duration">{duration} · {activity.stepCount} steps</span>}
          <div className="signal" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SIGNAL_HTML[state.signal] }}/>
          <div className="status-divider"/>
          <button ref={toggle} type="button" className="expand-button" aria-label="Show recent activity" aria-expanded={open}
            aria-controls={panelId} onClick={() => setOpen(value => !value)}>
            <svg viewBox="0 0 24 24"><path d="m5 9 7 7 7-7"/></svg>
          </button>
        </div>
      </div>
      <div className="status-details" id={panelId} hidden={!open}>
        <div className="details-header"><span>Recent activity</span><span className="details-duration">{duration}</span></div>
        <ol className="details-log">
          {recent.map(step => <li key={step.turnId + ':' + step.seq}>
            <span>
              {step.startedAtMs > 0 && <time>{wallTime(step.startedAtMs)}</time>}
              <span className="event-state">{ACTIVITY_STATES[describeToolState(step.toolName, step.argsSummary)].title.replace(/…$/, '')}</span>
            </span>
            <span className="event-summary">
              {step.toolName}{step.argsSummary ? ' · ' + step.argsSummary : ''}
              {' '}<span aria-label={STEP_GLYPH[step.status].label}>{STEP_GLYPH[step.status].glyph}{step.durationMs !== undefined && ' ' + formatStepDuration(step.durationMs)}</span>
            </span>
          </li>)}
          {recent.length === 0 && <li><span className="event-summary">No tool activity yet.</span></li>}
        </ol>
        {children && <details className="details-all"><summary>All steps</summary>{children}</details>}
      </div>
    </div>
  </div>;
}
