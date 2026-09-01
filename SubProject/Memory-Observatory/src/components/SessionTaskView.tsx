import { useMemo } from 'react';
import type { ObservatoryActivity } from '../app/types';

export interface SessionTaskViewProps {
  records: ObservatoryActivity[];
}

function groupIdentity(record: ObservatoryActivity): string | undefined {
  return record.continuityTaskId ?? record.contextId ?? record.routeContextId ?? record.requestId;
}

function safeTestId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 180);
}

export function SessionTaskView({ records }: SessionTaskViewProps) {
  const groups = useMemo(() => {
    const map = new Map<string, ObservatoryActivity[]>();
    for (const record of [...records].sort((left, right) => left.sequence - right.sequence)) {
      const identity = groupIdentity(record);
      if (!identity) continue;
      map.set(identity, [...(map.get(identity) ?? []), record]);
    }
    return [...map.entries()].sort(([, left], [, right]) => (left[0]?.sequence ?? 0) - (right[0]?.sequence ?? 0));
  }, [records]);

  return (
    <section className="lens-view" aria-label="Session task view">
      <div className="lens-heading"><strong>Session / Task</strong><span>{groups.length} correlation groups</span></div>
      <div className="session-groups">
        {groups.map(([identity, items]) => {
          const contexts = [...new Set(items.map((item) => item.contextId).filter((value): value is string => Boolean(value)))];
          const safe = safeTestId(identity);
          return (
            <article className="session-group" key={identity} data-testid={`session-group-${safe}`}>
              <div className="session-group__content" data-testid={`session-${safe}`}>
                <div className="session-group__heading"><strong>{identity}</strong><span>{items.length} events</span></div>
                {contexts.length ? <div className="session-contexts">{contexts.map((context) => <span key={context}>{context}</span>)}</div> : null}
                <div className="session-events">
                  {items.map((item) => <div key={item.sequence}><b>#{item.sequence}</b><span>{item.event}</span></div>)}
                </div>
              </div>
            </article>
          );
        })}
        {!groups.length ? <div className="lens-empty">No correlated session/task identity is present in retained activity.</div> : null}
      </div>
    </section>
  );
}
