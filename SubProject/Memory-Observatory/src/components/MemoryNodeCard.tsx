import type { ObservatoryNode } from '../app/types';

export function MemoryNodeCard({ node }: { node: ObservatoryNode }) {
  return <article className="memory-node-card"><strong>{node.title}</strong><span>r{node.revisionNo}</span></article>;
}
