import type { VaultSegment } from './types.js';

function error(code: string): never { throw new Error(code); }

export function validateContinuation(left: VaultSegment, right: VaultSegment): { valid: true } {
  if (left.contextFamily !== right.contextFamily) error('MEMORY_CONTINUATION_FAMILY_MISMATCH');
  if (left.topicKey !== right.topicKey) error('MEMORY_CONTINUATION_TOPIC_MISMATCH');
  if (right.segmentNo !== left.segmentNo + 1) error('MEMORY_CONTINUATION_ORDER_INVALID');
  if (left.nextFile !== right.relativePath || right.previousFile !== left.relativePath) {
    error('MEMORY_CONTINUATION_BIDIRECTIONAL_REQUIRED');
  }
  return { valid: true };
}
