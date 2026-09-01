import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutMemoryGraph } from '../app/graph-layout';
import type { ObservatoryEdge, ObservatorySnapshot } from '../app/types';
import { MemoryNodeCard } from './MemoryNodeCard';

export interface MemoryGraphProps {
  snapshot: ObservatorySnapshot | null;
  selectedMemoryId: string | null;
  onSelectMemory(memoryId: string): void;
  highlightedMemoryIds?: string[];
  highlightKind?: 'recalled' | 'expanded';
  convergenceLatencyMs?: number | null;
  convergenceSamples?: number;
}

const ASSOCIATIVE = new Set([
  'same_anchor', 'same_artifact', 'same_route_or_task', 'same_task_family',
  'cooccurs_in_event', 'token_overlap', 'temporal_neighbor',
]);

function isSemanticEdge(edge: ObservatoryEdge): boolean {
  return !ASSOCIATIVE.has(edge.relation);
}

export function MemoryGraph({
  snapshot, selectedMemoryId, onSelectMemory, highlightedMemoryIds = [], highlightKind,
  convergenceLatencyMs = null, convergenceSamples = 0,
}: MemoryGraphProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [state, setState] = useState('all');
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);

  const model = useMemo(() => {
    const allNodes = snapshot?.nodes ?? [];
    const highlighted = new Set(highlightedMemoryIds);
    const allEdges = snapshot?.edges ?? [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visibleNodes = allNodes.filter((node) => {
      if (kind !== 'all' && node.kind !== kind) return false;
      if (state !== 'all' && node.state !== state) return false;
      if (normalizedQuery && !`${node.title}\n${node.canonicalKey}`.toLocaleLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
    const visibleIds = new Set(visibleNodes.map((node) => node.memoryId));
    const visibleEdges = allEdges.filter((edge) => visibleIds.has(edge.fromMemoryId) && visibleIds.has(edge.toMemoryId));
    const layout = new Map(layoutMemoryGraph(visibleNodes, visibleEdges).map((entry) => [entry.memoryId, entry]));
    const nodes: Node[] = visibleNodes.map((node) => {
      const position = layout.get(node.memoryId) ?? { x: 0, y: 0 };
      const hasSemanticEdge = allEdges.some((edge) => isSemanticEdge(edge) && (edge.fromMemoryId === node.memoryId || edge.toMemoryId === node.memoryId));
      const orphanWarning = !node.rootReason && !hasSemanticEdge;
      return {
        id: node.memoryId,
        position: { x: position.x, y: position.y },
        data: { label: <MemoryNodeCard node={node} orphanWarning={orphanWarning} selected={selectedMemoryId === node.memoryId} activityHighlight={highlighted.has(node.memoryId) ? highlightKind : undefined} /> },
        selected: selectedMemoryId === node.memoryId,
        draggable: false,
        connectable: false,
      };
    });
    const edges: Edge[] = visibleEdges.map((edge) => ({
      id: edge.edgeId,
      source: edge.fromMemoryId,
      target: edge.toMemoryId,
      label: edge.relation,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: false,
      selectable: false,
      className: highlighted.has(edge.fromMemoryId) && highlighted.has(edge.toMemoryId) ? `memory-edge--activity-${highlightKind ?? 'recalled'}` : undefined,
    }));
    return { nodes, edges, visibleNodes };
  }, [snapshot, query, kind, state, selectedMemoryId, highlightedMemoryIds, highlightKind]);

  const kinds = useMemo(() => [...new Set((snapshot?.nodes ?? []).map((node) => node.kind))].sort(), [snapshot]);
  const states = useMemo(() => [...new Set((snapshot?.nodes ?? []).map((node) => node.state))].sort(), [snapshot]);
  const current = useMemo(() => [...(snapshot?.nodes ?? [])].sort((a, b) => b.updatedAt - a.updatedAt || a.memoryId.localeCompare(b.memoryId))[0], [snapshot]);

  const zoomCurrent = () => {
    if (!current || !flow) return;
    const entry = layoutMemoryGraph(model.visibleNodes, snapshot?.edges ?? []).find((item) => item.memoryId === current.memoryId);
    if (!entry) return;
    onSelectMemory(current.memoryId);
    void flow.setCenter(entry.x + 120, entry.y + 64, { zoom: 1.15, duration: 250 });
  };

  return (
    <section className="graph-panel" aria-label="Memory graph">
      <div className="panel-heading graph-heading">
        <div><strong>Memory Graph</strong><span>{snapshot ? `${snapshot.nodes.length} nodes · ${snapshot.edges.length} edges` : 'loading snapshot'}</span></div>
        <div className="graph-actions">
          {convergenceSamples > 0 ? (
            <span
              className="graph-convergence"
              data-testid="graph-convergence-latency"
              data-latency-ms={convergenceLatencyMs === null ? '' : convergenceLatencyMs.toFixed(3)}
              data-samples={convergenceSamples}
            >
              converge {convergenceLatencyMs === null ? '—' : `${convergenceLatencyMs.toFixed(1)} ms`}
            </span>
          ) : null}
          <button type="button" onClick={zoomCurrent} disabled={!current}>Current</button>
          <button type="button" onClick={() => void flow?.fitView({ padding: 0.15, duration: 200 })} disabled={!model.nodes.length}>Fit</button>
        </div>
      </div>
      <div className="graph-filters" aria-label="Memory graph filters">
        <input aria-label="Search memories" maxLength={180} placeholder="Search title or key" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Filter memory kind" value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All kinds</option>{kinds.map((value) => <option value={value} key={value}>{value}</option>)}</select>
        <select aria-label="Filter memory state" value={state} onChange={(event) => setState(event.target.value)}><option value="all">All states</option>{states.map((value) => <option value={value} key={value}>{value}</option>)}</select>
      </div>
      <div className="graph-relations-accessible" aria-label="Visible memory relations">
        {model.edges.map((edge) => <span key={edge.id}>{String(edge.label)}</span>)}
      </div>
      <div className="graph-canvas" data-testid="graph-canvas">
        <ReactFlow
          nodes={model.nodes}
          edges={model.edges}
          onInit={setFlow}
          onNodeClick={(_event, node) => onSelectMemory(node.id)}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
        {!snapshot ? <div className="graph-empty">Loading authoritative memory snapshot…</div> : null}
        {snapshot && model.nodes.length === 0 ? <div className="graph-empty">No memories match the current filters.</div> : null}
      </div>
    </section>
  );
}
