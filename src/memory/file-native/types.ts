import type { MemoryEnforcement, MemoryKind, MemoryRelation, MemoryState } from '../types.js';

export type MemoryContextFamily =
  | 'project' | 'brainstorming' | 'coding' | 'decision' | 'failure'
  | 'procedure' | 'task' | 'artifact' | 'guardrail' | 'relationship' | 'general';

export interface VaultRelation {
  targetMemoryId: string;
  targetFile?: string;
  relation: MemoryRelation;
  weight: number;
  evidenceEventId?: string;
  evidenceRefs?: string[];
}

export interface VaultMemoryEntry {
  memoryId: string;
  revisionId: string;
  revisionNo: number;
  canonicalKey: string;
  kind: MemoryKind;
  state: MemoryState;
  importance: number;
  pinned: boolean;
  enforcement: MemoryEnforcement;
  valueText: string;
  valueJson?: string;
  valueHash: string;
  sourceEventId?: string;
  createdAt: number;
  updatedAt: number;
  title?: string;
  anchors?: Array<{ type: string; value: string }>;
  relations: VaultRelation[];
}

export interface VaultSegment {
  schemaVersion: 1;
  fileId: string;
  relativePath: string;
  contextFamily: MemoryContextFamily;
  principalId: string;
  projectId: string;
  topicKey: string;
  segmentNo: number;
  previousFile?: string;
  nextFile?: string;
  createdAt: string;
  updatedAt: string;
  entries: VaultMemoryEntry[];
}
