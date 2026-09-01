import { useMemo } from 'react';
import type {
  ObservatoryActivity,
  ObservatoryNodeDetail,
  ObservatorySnapshot,
  ObservatoryTimelineEntry,
} from '../app/types';

export interface TimelineViewProps {
  snapshot: ObservatorySnapshot | null;
  detail?: ObservatoryNodeDetail | null;
  records?: ObservatoryActivity[];
}

const HISTORY_ACTIVITY = new Set([
  'memory.node_created',
  'memory.revision_created',
  'memory.edge_created',
  'memory.edge_retracted',
  'memory.write_decision',
  'memory.conflict_opened',
  'memory.conflict_resolved',
]);

function fallbackEntries(detail: ObservatoryNodeDetail | null | undefined, records: ObservatoryActivity[]): ObservatoryTimelineEntry[] {
  const revisions: ObservatoryTimelineEntry[] = (detail?.revisions ?? []).map((revision) => ({
    timelineId: `detail-revision:${revision.revisionId}`,
    timestamp: revision.validFrom,
    kind: 'revision',
    memoryIds: detail ? [detail.memoryId] : [],
    label: `Revision ${revision.revisionNo}`,
    revisionNo: revision.revisionNo,
    valuePreview: revision.valuePreview,
  }));
  const activities: ObservatoryTimelineEntry[] = records
    .filter((record) => HISTORY_ACTIVITY.has(record.event))
    .map((record) => ({
      timelineId: `activity:${record.sequence}`,
      timestamp: Date.parse(record.timestamp),
      kind: record.event === 'memory.write_decision' ? 'write_decision' : 'edge_event',
      memoryIds: record.memoryIds ?? [],
      label: record.event,
      ...(record.relation ? { relation: record.relation } : {}),
      ...(record.decisionType ? { decisionType: record.decisionType } : {}),
      ...(record.reasonCodes ? { reasonCodes: record.reasonCodes } : {}),
      ...(record.contextId ? { contextId: record.contextId } : {}),
      ...(record.continuityTaskId ? { continuityTaskId: record.continuityTaskId } : {}),
      ...(record.routeContextId ? { routeContextId: record.routeContextId } : {}),
    }));
  return [...revisions, ...activities];
}

function entryTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return 'unknown time';
  const millis = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(timestamp);
}

export function TimelineView({ snapshot, detail, records = [] }: TimelineViewProps) {
  const entries = useMemo(() => {
    const authoritative = snapshot?.timeline ?? [];
    const source = authoritative.length ? authoritative : fallbackEntries(detail, records);
    return [...source].sort((left, right) => left.timestamp - right.timestamp || left.timelineId.localeCompare(right.timelineId));
  }, [snapshot, detail, records]);

  return (
    <section className="lens-view" aria-label="Timeline view">
      <div className="lens-heading"><strong>Timeline</strong><span>{entries.length} authoritative events</span></div>
      <div className="timeline-list">
        {entries.length ? entries.map((entry) => (
          <article className="timeline-entry" key={entry.timelineId} data-testid="timeline-entry" data-timeline-id={entry.timelineId}>
            <time>{entryTime(entry.timestamp)}</time>
            <div className="timeline-entry__body">
              <strong>{entry.revisionNo !== undefined ? `Revision ${entry.revisionNo}` : entry.label}</strong>
              {entry.valuePreview ? <p>{entry.valuePreview}</p> : null}
              <div className="timeline-entry__meta">
                <span>{entry.kind}</span>
                {entry.relation ? <span>{entry.relation}</span> : null}
                {entry.eventType ? <span>{entry.eventType}</span> : null}
                {entry.decisionType && entry.decisionType !== entry.label ? <span>{entry.decisionType}</span> : null}
                {entry.reasonCodes?.map((value) => <span key={`reason:${value}`}>{value}</span>)}
                {entry.evidenceRefs?.map((value) => <span key={`evidence:${value}`}>{value}</span>)}
                {entry.contextId ? <span>{entry.contextId}</span> : null}
                {entry.continuityTaskId ? <span>{entry.continuityTaskId}</span> : null}
              </div>
            </div>
          </article>
        )) : <div className="lens-empty">No retained timeline entries for this projection.</div>}
      </div>
    </section>
  );
}
