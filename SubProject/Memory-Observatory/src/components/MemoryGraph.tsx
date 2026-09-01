import { Background, Controls, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export function MemoryGraph() {
  return (
    <section className="graph-panel" aria-label="Memory graph">
      <div className="panel-heading"><strong>Memory Graph</strong><span>authoritative DMF view</span></div>
      <div className="graph-canvas" data-testid="graph-canvas">
        <ReactFlow nodes={[]} edges={[]} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </section>
  );
}
