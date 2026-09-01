import { useMemo } from 'react';
import type { ObservatorySnapshot } from '../app/types';

export interface ConflictViewProps {
  snapshot: Pick<ObservatorySnapshot, 'nodes' | 'conflicts'> | null;
}

function evidenceValues(value: unknown, prefix = ''): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [prefix ? `${prefix}=${String(value)}` : String(value)];
  }
  if (Array.isArray(value)) return value.flatMap((item) => evidenceValues(item, prefix));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, item]) => evidenceValues(item, prefix ? `${prefix}.${key}` : key));
  }
  return [];
}

export function ConflictView({ snapshot }: ConflictViewProps) {
  const nodes = useMemo(() => new Map((snapshot?.nodes ?? []).map((node) => [node.memoryId, node])), [snapshot]);
  const conflicts = useMemo(() => [...(snapshot?.conflicts ?? [])].sort((left, right) => {
    const openOrder = Number(left.status !== 'open') - Number(right.status !== 'open');
    return openOrder || left.createdAt - right.createdAt || left.conflictId.localeCompare(right.conflictId);
  }), [snapshot]);

  return (
    <section className="lens-view" aria-label="Conflict view">
      <div className="lens-heading"><strong>Conflict</strong><span>{conflicts.length} retained records</span></div>
      <div className="conflict-list">
        {conflicts.map((conflict) => {
          const left = nodes.get(conflict.leftMemoryId)?.title ?? conflict.leftMemoryId;
          const right = nodes.get(conflict.rightMemoryId)?.title ?? conflict.rightMemoryId;
          const evidence = evidenceValues(conflict.evidence);
          return (
            <article className="conflict-card" key={conflict.conflictId} data-testid={`conflict-${conflict.conflictId}`}>
              <div className="conflict-card__heading"><strong>{conflict.conflictType}</strong><b>{conflict.status.toUpperCase()}</b></div>
              <div className="conflict-pair"><span>{left}</span><i>CONTRADICTS</i><span>{right}</span></div>
              <div className="conflict-evidence">{evidence.map((item, index) => <span key={`${index}:${item}`}>{item}</span>)}</div>
              <div className="conflict-time"><span>created {conflict.createdAt}</span>{conflict.resolvedAt !== undefined ? <span>resolved {conflict.resolvedAt}</span> : null}</div>
            </article>
          );
        })}
        {!conflicts.length ? <div className="lens-empty">No conflict records are visible in this projection.</div> : null}
      </div>
    </section>
  );
}
