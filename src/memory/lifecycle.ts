/** Memory lifecycle record shapes shared by the file-native backend and its callers. */

export interface MemoryConflictRecord {
  conflictId: string;
  leftMemoryId: string;
  rightMemoryId: string;
  conflictType: string;
  status: 'open' | 'resolved';
  evidence: Record<string, unknown>;
  createdAt: number;
  resolvedAt?: number;
}

export interface MemoryCompactionResult {
  archivedMemoryIds: string[];
  cleanedEdges: number;
  integrity: string;
}
