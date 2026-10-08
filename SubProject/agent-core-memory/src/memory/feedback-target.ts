// Subject-freshness adaptation of MetaClaw e727cf8684; no trainer or generation counter.
import { createHash } from 'node:crypto';
import type { MemoryRecord } from './types.js';

export function assertMemoryFeedbackDigest(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error('MEMORY_FEEDBACK_DIGEST_INVALID');
  }
}

/** Exact ID/body identity only: not metadata revision, authenticity or approval. */
export function memoryFeedbackContentDigest(record: Pick<MemoryRecord, 'id' | 'content'>): string {
  if (!record || typeof record.id !== 'string' || typeof record.content !== 'string') {
    throw new Error('MEMORY_FEEDBACK_SUBJECT_INVALID');
  }
  return 'sha256:' + createHash('sha256').update(
    JSON.stringify(['agent-core-memory-feedback-content/v1', record.id, record.content]), 'utf8',
  ).digest('hex');
}
