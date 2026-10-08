import type { RecordExperience } from './experience-types.js';

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
  validFrom?: string;
  validTo?: string;
  referenceTime?: string;
  evidenceRefs?: string[];
}

export interface EvolutionEvent {
  kind: EvolutionKind;
  timestamp: string;
  source: 'user' | 'controller' | 'deterministic' | 'intelligence' | 'system';
  changedFields?: string[];
  details?: Record<string, unknown>;
}

export interface MemoryRepositoryIdentity {
  kind: 'git' | 'directory';
  repositoryId: string;
  worktreeId: string;
  checkpoint?: {
    head?: string;
    ref?: string;
    statusDigest?: string;
    statusEntryCount?: number;
    renamedCount?: number;
    untrackedCount?: number;
    renamedPathDigest?: string;
    untrackedPathDigest?: string;
  };
}

export type MemorySourceFileSnapshot =
  | { path: string; status: 'captured'; digest: string; bytes: number }
  | { path: string; status: 'unavailable'; reason: 'excluded-path' | 'evidence-policy' | 'unreadable-or-unsupported' | 'read-budget' };

export interface MemorySourceSnapshot {
  version: 1;
  observedAt: string;
  files: MemorySourceFileSnapshot[];
}

export interface MemoryProvenance {
  workspace?: string;
  repo?: string;
  files: string[];
  gitCommit?: string;
  gitRef?: string;
  importKey?: string;
  identity?: MemoryRepositoryIdentity;
  /** Optional byte evidence for explicitly selected local text sources; not semantic proof. */
  sourceSnapshot?: MemorySourceSnapshot;
}

export interface MemoryRecordV1 {
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
  expiresAt?: string;
  lastAccessedAt: string | null;
  retrievalCount: number;
  evolutionHistory: EvolutionEvent[];
  pinned: boolean;
  source?: { type: string; ref?: string };
  provenance?: MemoryProvenance;
}

export type MemoryRecordV2 = Omit<MemoryRecordV1, 'version'> & { version: 2; experience: RecordExperience };
export type MemoryRecord = MemoryRecordV1 | MemoryRecordV2;

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
  canonicalComplete: boolean;
  noteCount: number;
  issueCount: number;
  index: 'available' | 'degraded' | 'not-configured';
  embedding: 'available' | 'degraded' | 'not-configured';
  intelligence: 'available' | 'degraded' | 'not-configured';
  embeddingProvider?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
}
