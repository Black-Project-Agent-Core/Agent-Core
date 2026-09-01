import type { ObservatoryNodeDetail } from '../app/types';

export interface NodeInspectorProps {
  detail: ObservatoryNodeDetail | null;
  loading?: boolean;
}

export function NodeInspector({ detail, loading = false }: NodeInspectorProps) {
  if (loading) return <aside className="node-inspector" aria-label="Node inspector">Loading node details…</aside>;
  if (!detail) return <aside className="node-inspector" aria-label="Node inspector">Select a memory node to inspect provenance and revisions.</aside>;
  const evidenceIds = [...new Set(detail.edges.map((edge) => edge.evidenceEventId).filter((value): value is string => Boolean(value)))];
  return (
    <aside className="node-inspector" aria-label="Node inspector">
      <div className="inspector-heading"><strong>{detail.title}</strong><span>Revision {detail.revisionNo}</span></div>
      <div className="inspector-grid">
        <div><span className="inspector-label">State</span><strong>{detail.state.toUpperCase()}</strong></div>
        <div><span className="inspector-label">Kind</span><strong>{detail.kind.toUpperCase()}</strong></div>
        <div><span className="inspector-label">Root reason</span><span>{detail.rootReason ?? '—'}</span></div>
        <div><span className="inspector-label">Branch parent</span><span>{detail.branchParentMemoryId ?? '—'}</span></div>
        <div><span className="inspector-label">Created from decision</span><span>{detail.createdFromDecisionId ?? '—'}</span></div>
        <div><span className="inspector-label">Relations</span><span>{detail.edges.length ? detail.edges.map((edge) => edge.relation).join(' · ') : '—'}</span></div>
        <div><span className="inspector-label">Evidence</span><span>{evidenceIds.length ? evidenceIds.join(' · ') : '—'}</span></div>
        <div><span className="inspector-label">Revisions retained</span><span>{detail.revisions.length}</span></div>
      </div>
    </aside>
  );
}
