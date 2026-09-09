import { createHash, randomUUID } from 'node:crypto';
import type { MemoryPreflightRequest, MemoryPreflightResult } from './types.js';

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

/** Deterministic empty preflight envelope for a runtime where memory is switched off. */
export function createDisabledPreflightResult(request: MemoryPreflightRequest): MemoryPreflightResult {
  const queryText = [request.task.trim(), request.context?.trim()]
    .filter((value): value is string => Boolean(value))
    .join('\n');
  return {
    contextId: randomUUID(),
    queryText,
    snapshotHash: createHash('sha256').update(stableJson({ queryText, recalled: [] }), 'utf8').digest('hex'),
    recalled: [],
    canonicalSubjectMemory: [],
    blocking: { blocked: false, guardrailMemoryIds: [], reasons: [] },
    blockingGuardrails: [],
    openConflicts: [],
    priorFailures: [],
    relatedDecisions: [],
    expiresAt: request.expiresAt,
  };
}
