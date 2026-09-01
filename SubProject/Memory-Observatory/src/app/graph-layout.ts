import type { ObservatoryEdge, ObservatoryNode } from './types';

export interface GraphLayoutEntry {
  memoryId: string;
  lane: number;
  x: number;
  y: number;
}

const EVOLUTION = new Set(['continues', 'supersedes', 'branch_of', 'derived_from', 'learned_from']);
const FAILURE_CAUSAL = new Set(['failed_because', 'caused_by']);
const VALIDATION = new Set(['validated_by']);

function touchesRelation(nodeId: string, edges: ObservatoryEdge[], relations: Set<string>): boolean {
  return edges.some((edge) => relations.has(edge.relation) && (edge.fromMemoryId === nodeId || edge.toMemoryId === nodeId));
}

function laneFor(node: ObservatoryNode, edges: ObservatoryEdge[]): number {
  if (node.rootReason || node.branchParentMemoryId || touchesRelation(node.memoryId, edges, EVOLUTION)) return 0;
  if (node.kind === 'failure' || touchesRelation(node.memoryId, edges, FAILURE_CAUSAL)) return 1;
  if (node.kind === 'decision' || node.kind === 'procedure' || node.kind === 'guardrail') return 2;
  if (node.kind === 'artifact' || (VALIDATION.size > 0 && edges.some((edge) => VALIDATION.has(edge.relation) && edge.toMemoryId === node.memoryId))) return 3;
  return 4;
}

export function layoutMemoryGraph(nodes: ObservatoryNode[], edges: ObservatoryEdge[]): GraphLayoutEntry[] {
  const ordered = [...nodes]
    .map((node) => ({ node, lane: laneFor(node, edges) }))
    .sort((left, right) => left.lane - right.lane
      || left.node.createdAt - right.node.createdAt
      || left.node.memoryId.localeCompare(right.node.memoryId));
  const laneCounts = new Map<number, number>();
  return ordered.map(({ node, lane }) => {
    const index = laneCounts.get(lane) ?? 0;
    laneCounts.set(lane, index + 1);
    return { memoryId: node.memoryId, lane, x: 56 + lane * 304, y: 72 + index * 174 };
  });
}

export function deterministicScaffoldPosition(index: number) {
  return { x: 72 + (index % 3) * 280, y: 72 + Math.floor(index / 3) * 180 };
}
