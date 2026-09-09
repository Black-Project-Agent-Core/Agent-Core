import { createHash } from 'node:crypto';

export const MEMORY_POSTFLIGHT_STATES = ['OPEN', 'POSTFLIGHT_PENDING', 'CLOSED'] as const;
export type MemoryPostflightState = (typeof MEMORY_POSTFLIGHT_STATES)[number];

export interface MemoryContextLifecycleRecord {
  contextId: string;
  principalId: string;
  authorityPrincipalId?: string;
  projectId: string;
  routeContextId: string;
  continuityTaskId?: string;
  objectiveHash: string;
  postflightState: MemoryPostflightState;
  meaningfulWorkCount: number;
  firstMeaningfulAt?: number;
  lastMeaningfulAt?: number;
  lastToolName?: string;
  lastReasonCode?: string;
  postflightAppliedAt?: number;
  closedAt?: number;
  localDurableGeneration?: string;
  localDurableHash?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export class MemoryHardLifecycleError extends Error {
  constructor(
    readonly code: 'MEMORY_PREFLIGHT_REQUIRED' | 'MEMORY_POSTFLIGHT_REQUIRED' | 'MEMORY_LIFECYCLE_CONFLICT',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MemoryHardLifecycleError';
  }
}

function normalizedObjectiveText(task: string, context?: string): string {
  return [task, context]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' '))
    .join('\n');
}

export function memoryObjectiveHash(task: string, context?: string): string {
  const normalized = normalizedObjectiveText(task, context);
  if (!normalized) throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Memory preflight objective is required');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
