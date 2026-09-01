import { ActivityFilters } from './ActivityFilters';

export function ActivityTracker() {
  return (
    <aside className="activity-panel" aria-label="Live activity">
      <div className="panel-heading"><strong>Live Activity</strong><span>ordered audit stream</span></div>
      <ActivityFilters />
      <div className="activity-empty">Waiting for persisted activity…</div>
    </aside>
  );
}
