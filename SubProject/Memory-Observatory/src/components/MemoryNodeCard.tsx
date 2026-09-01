import type { ObservatoryNode } from '../app/types';

export interface MemoryNodeCardProps {
  node: ObservatoryNode;
  orphanWarning?: boolean;
  selected?: boolean;
  activityHighlight?: 'recalled' | 'expanded';
}

export function MemoryNodeCard({ node, orphanWarning = false, selected = false, activityHighlight }: MemoryNodeCardProps) {
  const activityClass = activityHighlight ? ` memory-node-card--activity-${activityHighlight}` : '';
  return (
    <article className={`memory-node-card${selected ? ' memory-node-card--selected' : ''}${orphanWarning ? ' memory-node-card--warning' : ''}${activityClass}`}>
      <div className="memory-node-card__badges">
        <span>{node.kind.toUpperCase()}</span>
        <span>{node.state.toUpperCase()}</span>
        {node.rootReason ? <span className="badge badge--root">ROOT</span> : null}
        {node.branchParentMemoryId ? <span className="badge">BRANCH</span> : null}
        {node.pinned ? <span className="badge">PINNED</span> : null}
      </div>
      <strong className="memory-node-card__title">{node.title}</strong>
      <p>{node.valuePreview}</p>
      <div className="memory-node-card__footer"><span>r{node.revisionNo}</span><span>{node.canonicalKey}</span></div>
      {orphanWarning ? <div className="memory-node-card__warning">UNLINKED NON-ROOT</div> : null}
    </article>
  );
}
