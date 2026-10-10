import { createHash } from 'node:crypto';
import type { ControllerScope } from '../../SubProject/agent-core-memory/dist/index.js';
export interface MemoryTaskSelector { taskId: string }
export type MemoryScopeResolver = (selector?: MemoryTaskSelector) => Promise<ControllerScope>;
/** A Learning namespace is owner-scoped transport continuity, never task identity. */
export function ownerScopedLearningSession(ownerId: string, transportSessionId: string): string {
  if (!ownerId?.trim() || ownerId !== ownerId.trim() || !transportSessionId?.trim()) throw new Error('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
  return 'ext-owner-' + createHash('sha256').update(JSON.stringify([ownerId, transportSessionId]), 'utf8').digest('hex').slice(0, 48);
}
/** The value comes only from the authenticated host principal, never a request header/body. */
export function memoryCredentialOwner(principal: unknown): string | undefined {
  if (!principal || typeof principal !== 'object') return undefined;
  const id = (principal as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && id === id.trim()
    && !/[\x00-\x1f\x7f]/.test(id) ? id : undefined;
}
