import { useMemo } from 'react';
import type { ObservatoryActivity, ObservatorySnapshot } from '../app/types';

export interface RecallViewProps {
  snapshot: Pick<ObservatorySnapshot, 'nodes'> | null;
  records: ObservatoryActivity[];
}

type RecallStatus = 'RECALLED CURRENT' | 'EXPANDED' | 'PRIOR FAILURE' | 'NOT LOADED';

function contextIdentity(record: ObservatoryActivity): string | undefined {
  return record.contextId ?? record.routeContextId;
}

export function RecallView({ snapshot, records }: RecallViewProps) {
  const model = useMemo(() => {
    const recallEvents = records.filter((record) =>
      (record.event === 'memory.recalled' || record.event === 'memory.remember_more_expanded') && contextIdentity(record));
    const latest = [...recallEvents].sort((left, right) => right.sequence - left.sequence)[0];
    const identity = latest ? contextIdentity(latest) : undefined;
    const current = identity ? recallEvents.filter((record) => contextIdentity(record) === identity) : [];
    const recalled = new Set(current.filter((record) => record.event === 'memory.recalled').flatMap((record) => record.memoryIds ?? []));
    const expanded = new Set(current.filter((record) => record.event === 'memory.remember_more_expanded').flatMap((record) => record.memoryIds ?? []));
    return { identity, recalled, expanded };
  }, [records]);

  const statusFor = (memoryId: string, kind: string): RecallStatus => {
    if (kind === 'failure' && (model.recalled.has(memoryId) || model.expanded.has(memoryId))) return 'PRIOR FAILURE';
    if (model.expanded.has(memoryId)) return 'EXPANDED';
    if (model.recalled.has(memoryId)) return 'RECALLED CURRENT';
    return 'NOT LOADED';
  };

  const nodes = snapshot?.nodes ?? [];
  return (
    <section className="lens-view" aria-label="Recall view">
      <div className="lens-heading"><strong>Recall</strong><span>{model.identity ?? 'no active recall context'}</span></div>
      <div className="recall-list">
        {nodes.map((node) => {
          const status = statusFor(node.memoryId, node.kind);
          return (
            <article className={`recall-row recall-row--${status.toLowerCase().replaceAll(' ', '-')}`} key={node.memoryId} data-recall-row data-memory-status={status}>
              <strong>{node.title}</strong>
              <span>{node.kind}</span>
              <b>{status}</b>
            </article>
          );
        })}
        {!nodes.length ? <div className="lens-empty">No memory nodes are available in the current snapshot.</div> : null}
      </div>
    </section>
  );
}
