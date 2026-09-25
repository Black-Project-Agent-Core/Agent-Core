export const MEMORY_SCHEMA_VERSION = 1 as const;

export type MemoryLinkType =
  | 'related'
  | 'supports'
  | 'supersedes'
  | 'contradicts'
  | 'derived-from';

export type EvolutionKind =
  | 'metadata_enriched'
  | 'link_added'
  | 'link_strengthened'
  | 'link_removed'
  | 'context_changed'
  | 'tags_changed'
  | 'content_updated'
  | 'superseded'
  | 'retrieved'
  | 'created'
  | 'updated';

export interface MemoryLink {
  targetId: string;
  type: MemoryLinkType;
  strength: number;
  createdAt: string;
  reason?: string;
}

export interface EvolutionEvent {
  kind: EvolutionKind;
  timestamp: string;
  source: 'user' | 'controller' | 'deterministic' | 'intelligence' | 'system';
  changedFields?: string[];
  details?: Record<string, unknown>;
}

export interface MemoryProvenance {
  workspace?: string;
  repo?: string;
  files: string[];
  gitCommit?: string;
  gitRef?: string;
}

export interface MemoryRecord {
  version: typeof MEMORY_SCHEMA_VERSION;
  id: string;
  title?: string;
  content: string;
  keywords: string[];
  context: string;
  tags: string[];
  category: string;
  links: MemoryLink[];  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  retrievalCount: number;
  evolutionHistory: EvolutionEvent[];
  pinned: boolean;
  source?: { type: string; ref?: string };
  provenance?: MemoryProvenance;
}

export interface MemoryIssue {
  path: string;
  message: string;
  severity: 'degraded' | 'error';
}

export type MemoryHealthStatus = 'available' | 'degraded' | 'error' | 'not-used';

export interface MemoryHealth {
  status: MemoryHealthStatus;
  mode: 'file-native';
  canonicalStore: 'available' | 'degraded' | 'error';
  noteCount: number;
  issueCount: number;
  index: 'available' | 'degraded' | 'not-configured';
  embedding: 'available' | 'degraded' | 'not-configured';
  intelligence: 'available' | 'degraded' | 'not-configured';
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
}
