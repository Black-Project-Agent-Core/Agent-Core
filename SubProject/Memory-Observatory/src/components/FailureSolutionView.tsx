import { useMemo } from 'react';
import type { ObservatoryEdge, ObservatoryNode, ObservatorySnapshot } from '../app/types';

export interface FailureSolutionViewProps {
  snapshot: Pick<ObservatorySnapshot, 'nodes' | 'edges'> | null;
}

const CAUSAL_PRIORITY = ['failed_because', 'caused_by', 'resolved_by', 'validated_by'] as const;

interface ChainStep {
  node: ObservatoryNode;
  outgoingRelation?: string;
}

function stableNodes(nodes: ObservatoryNode[]): ObservatoryNode[] {
  return [...nodes].sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0) || left.memoryId.localeCompare(right.memoryId));
}

function chooseEdge(nodeId: string, edges: ObservatoryEdge[], visited: Set<string>): ObservatoryEdge | undefined {
  for (const relation of CAUSAL_PRIORITY) {
    const candidates = edges
      .filter((edge) => edge.fromMemoryId === nodeId && edge.relation === relation && !visited.has(edge.toMemoryId))
      .sort((left, right) => left.toMemoryId.localeCompare(right.toMemoryId));
    if (candidates[0]) return candidates[0];
  }
  return undefined;
}

export function FailureSolutionView({ snapshot }: FailureSolutionViewProps) {
  const chains = useMemo(() => {
    const nodes = snapshot?.nodes ?? [];
    const edges = snapshot?.edges ?? [];
    const byId = new Map(nodes.map((node) => [node.memoryId, node]));
    return stableNodes(nodes.filter((node) => node.kind === 'failure')).map((failure) => {
      const visited = new Set<string>();
      const steps: ChainStep[] = [];
      let current: ObservatoryNode | undefined = failure;
      while (current && !visited.has(current.memoryId) && steps.length < 12) {
        visited.add(current.memoryId);
        const edge = chooseEdge(current.memoryId, edges, visited);
        steps.push({ node: current, ...(edge ? { outgoingRelation: edge.relation } : {}) });
        current = edge ? byId.get(edge.toMemoryId) : undefined;
      }
      return steps;
    }).filter((chain) => chain.length > 0);
  }, [snapshot]);

  return (
    <section className="lens-view" aria-label="Failure solution view">
      <div className="lens-heading"><strong>Failure / Solution</strong><span>{chains.length} causal chains</span></div>
      <div className="causal-chains" aria-label="Failure solution chains">
        {chains.map((chain, chainIndex) => (
          <div className="causal-chain" key={`${chain[0]!.node.memoryId}:${chainIndex}`}>
            {chain.map((step, index) => (
              <div className="causal-step-wrap" key={step.node.memoryId}>
                <article className="causal-step" data-testid="causal-step">
                  <span>{step.node.kind.toUpperCase()}</span>
                  <strong>{step.node.title}</strong>
                  <p>{step.node.valuePreview}</p>
                </article>
                {step.outgoingRelation ? <div className="causal-relation">{step.outgoingRelation}</div> : null}
              </div>
            ))}
          </div>
        ))}
        {!chains.length ? <div className="lens-empty">No authoritative failure chain is present in this snapshot.</div> : null}
      </div>
    </section>
  );
}
