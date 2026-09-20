import { invoke } from '@tauri-apps/api/core';
export type ActivityRecord = { sequence: number; timestamp?: string; category?: string; event: string; requestId?: string; trace_id?: string; routeContextId?: string; data: Record<string, unknown> };
export type CaptureState = { enabled?: boolean; revision?: string; updatedAt?: string; pid?: number; instanceId?: string; error?: string; controlError?: string; captureErrors?: number; activeCalls?: number; audit?: { pendingQueue?: number; dropped?: number; writeErrors?: number } };
export type LocalLogSummary = { source: string; relativePath: string; available: boolean; error?: string; bytes?: number; modifiedAtMs?: number; errorCount?: number; boundedTail?: boolean; observations?: Array<{ severity: string; codes?: string[]; summary?: string; textOmitted?: boolean }> };
export type CrashSummary = { event?: string; timestamp?: string; pid?: number; instanceId?: string; error?: { code?: string; name?: string } };
export type ActivityBatch = { records: ActivityRecord[]; lastSequence: number; reset: boolean; skipped: number; malformed: number; pendingBytes: boolean; desired: CaptureState; applied: CaptureState; localLogs?: LocalLogSummary[]; crash?: CrashSummary | null; scope: string };
export async function readActivity(afterSequence: number): Promise<ActivityBatch> {
  const result = await invoke<ActivityBatch>('agent_core_activity_read', { afterSequence });
  if (!result || !Array.isArray(result.records) || !Number.isSafeInteger(result.lastSequence)) throw new Error('ACTIVITY_RESPONSE_INVALID: native monitor needs the matching application build');
  return result;
}
export const setActivityEnabled = (enabled: boolean) => invoke<CaptureState>('agent_core_activity_set', { enabled });
export const exportActivity = () => invoke<string>('agent_core_activity_export');
export const openActivityLnav = () => invoke<void>('agent_core_activity_open_lnav');
export function captureLabel(desired: CaptureState, applied: CaptureState, now = Date.now()): string {
  if (!applied.updatedAt || now - Date.parse(applied.updatedAt) > 5000 || !Number.isFinite(Date.parse(applied.updatedAt))) return 'Runtime capture unconfirmed';
  if (applied.controlError) return applied.controlError;
  if ((desired.revision ?? '') !== (applied.revision ?? '') || desired.enabled !== applied.enabled) return 'Applying capture setting...';
  // These counters accumulate for the runtime's lifetime, including status-file
  // failures. They do not establish current service health or missing records.
  const state = applied.enabled ? 'on' : 'off';
  if ((applied.audit?.dropped ?? 0) > 0 || (applied.audit?.writeErrors ?? 0) > 0) return `Capture ${state} - audit issues recorded`;
  if ((applied.captureErrors ?? 0) > 0) return `Capture ${state} - capture errors recorded`;
  return applied.enabled ? 'Capture active' : 'Capture off - baseline audit continues';
}
export function mergeActivity(previous: ActivityRecord[], batch: ActivityBatch): ActivityRecord[] {
  const rows = new Map((batch.reset ? [] : previous).map(r => [r.sequence, r]));
  for (const row of batch.records) rows.set(row.sequence, row);
  return [...rows.values()].sort((a, b) => a.sequence - b.sequence).slice(-4000);
}
export function isActivityError(row: ActivityRecord): boolean {
  return /fail|error|fatal|reject|anomaly/i.test(row.event) || row.data.severity === 'error' || row.data.outcome === 'error' || row.data.status === 'error' || Number(row.data.httpStatus ?? row.data.status) >= 400;
}
