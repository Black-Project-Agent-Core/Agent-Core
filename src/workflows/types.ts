export interface WorkflowNode {
  id: string;
  label: string;
  kind: 'system' | 'memory';
  paths: string[];
}

export interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
  kind: 'imports';
  evidence: Array<{ path: string; line: number }>;
}

export interface WorkflowGraph {
  schemaVersion: 1;
  fingerprint: string;
  files: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  /** Unresolved/nonliteral imports, external dependencies, and unsupported source files. */
  unknowns: number;
  limitations: string[];
}
