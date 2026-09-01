import { useMemo, useState } from 'react';
import type { ObservatoryActivity } from '../app/types';
import { ActivityFilters, DEFAULT_ACTIVITY_CATEGORIES, type ActivityCategory } from './ActivityFilters';

export interface ActivityTrackerProps {
  records: ObservatoryActivity[];
  gap: boolean;
}

function timestampLabel(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) return timestamp;
  return parsed.toISOString().slice(11, 23);
}

function correlationLabel(record: ObservatoryActivity): string | undefined {
  return record.requestId ?? record.routeContextId ?? record.runId ?? record.traceId;
}

function ActivityRow({ record }: { record: ObservatoryActivity }) {
  const correlation = correlationLabel(record);
  return (
    <article className={`activity-row activity-row--${record.state ?? 'event'}`} data-sequence={record.sequence}>
      <div className="activity-row__headline">
        <time dateTime={record.timestamp}>{timestampLabel(record.timestamp)}</time>
        <strong>{record.event}</strong>
        <span className="activity-row__category">{record.category.toUpperCase()}</span>
        {record.state ? <span className="activity-row__state">{record.state.toUpperCase()}</span> : null}
      </div>
      <div className="activity-row__details">
        {record.memoryIds?.length ? <span><b>memory</b> {record.memoryIds.join(' · ')}</span> : null}
        {record.relation ? <span><b>relation</b> {record.relation}</span> : null}
        {record.decisionType ? <span><b>decision</b> {record.decisionType}</span> : null}
        {record.reasonCodes?.length ? <span><b>reason</b> {record.reasonCodes.join(' · ')}</span> : null}
        {record.statusCode ? <span><b>status</b> {record.statusCode}</span> : null}
        {record.durationMs !== undefined ? <span><b>duration</b> {record.durationMs} ms</span> : null}
        {correlation ? <span><b>correlation</b> {correlation}</span> : null}
      </div>
    </article>
  );
}

export function ActivityTracker({ records, gap }: ActivityTrackerProps) {
  const [categories, setCategories] = useState<Set<ActivityCategory>>(() => new Set(DEFAULT_ACTIVITY_CATEGORIES));
  const [state, setState] = useState('all');

  const visible = useMemo(() => records
    .filter((record) => categories.has(record.category))
    .filter((record) => state === 'all' || record.state === state)
    .sort((left, right) => right.sequence - left.sequence), [records, categories, state]);

  const toggleCategory = (category: ActivityCategory) => {
    setCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <aside className="activity-panel" aria-label="Live activity">
      <div className="panel-heading">
        <div><strong>Live Activity</strong><span>{records.length ? `seq ${records.at(-1)?.sequence ?? 0}` : 'ordered audit stream'}</span></div>
      </div>
      <ActivityFilters categories={categories} state={state} onToggleCategory={toggleCategory} onStateChange={setState} />
      {gap ? <div className="activity-gap" role="status">HISTORY GAP — GRAPH RESYNCED</div> : null}
      <div className="activity-list" aria-label="Activity records">
        {visible.length ? visible.map((record) => <ActivityRow key={record.sequence} record={record} />) : <div className="activity-empty">Waiting for persisted activity…</div>}
      </div>
    </aside>
  );
}
