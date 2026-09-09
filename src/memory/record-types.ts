import { createHash } from 'node:crypto';
import { normalizeMemoryText } from './normalizer.js';
import { redactMemoryText } from './redaction.js';
import type {
  MemoryCommitRequest,
  MemoryEnforcement,
  MemoryKind,
  MemoryScope,
  MemoryState,
} from './types.js';

/** Canonical memory record shapes and value normalization, independent of any storage engine. */

export interface RecordMemoryEventRequest {
  scope: MemoryScope;
  eventType: string;
  sourceType: string;
  sourceRef?: string;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredMemoryRecord {
  memoryId: string;
  revisionId: string;
  revisionNo: number;
  principalId: string;
  projectId?: string;
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
}

export interface StoredMemoryRevision {
  revisionId: string;
  memoryId: string;
  revisionNo: number;
  valueText: string;
  valueJson?: string;
  valueHash: string;
  sourceEventId?: string;
  validFrom: number;
  validTo?: number;
  supersedesRevisionId?: string;
  createdAt: number;
}

export function sanitizeStructured(value: unknown, keyName = ''): unknown {
  if (/^(?:AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)$/i.test(keyName)) return '[REDACTED:SECRET]';
  const secretKey = /^(?:authorization|api[_-]?key|client[_-]?secret|access[_-]?key|password|passwd|pwd|token|refresh[_-]?token|access[_-]?token)$/i;
  if (secretKey.test(keyName)) return '[REDACTED:SECRET]';
  if (typeof value === 'string') return redactMemoryText(value).text;
  if (Array.isArray(value)) return value.map((item) => sanitizeStructured(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sanitizeStructured(item, key)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

export function normalizeMemoryValue(value: MemoryCommitRequest['value']): { valueText: string; valueJson?: string; valueHash: string } {
  const sanitized = sanitizeStructured(value);
  let valueText: string;
  let valueJson: string | undefined;

  if (typeof sanitized === 'string') {
    valueText = normalizeMemoryText(sanitized).canonical;
  } else {
    valueJson = stableJson(sanitized);
    valueText = normalizeMemoryText(valueJson).canonical;
  }

  return {
    valueText,
    valueJson,
    valueHash: createHash('sha256').update(valueText, 'utf8').digest('hex'),
  };
}

export interface MemoryBackupRecord {
  backupPath: string;
  createdAt: number;
  reason: string;
}
