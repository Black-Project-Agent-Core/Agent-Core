import type { MemoryRecord } from './types.js';

export function normalizeMemoryExpiresAt(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || !String(value).trim()) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('MEMORY_EXPIRES_AT_INVALID');
  return new Date(parsed).toISOString();
}

export function isMemoryExpired(record: Pick<MemoryRecord, 'expiresAt'>, at = Date.now()): boolean {
  if (!record.expiresAt) return false;
  const parsed = Date.parse(record.expiresAt);
  return Number.isFinite(parsed) && parsed <= at;
}
