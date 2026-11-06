export type Tone = 'healthy' | 'degraded' | 'warning' | 'error' | 'offline' | 'unknown';

export type SystemId =
  | 'core'
  | 'memory'
  | 'code'
  | 'semantic'
  | 'execution'
  | 'learning'
  | 'skills'
  | 'external-learning'
  | 'web-research'
  | 'mutation-safety'
  | 'credential-vault'
  | 'partner'
  | 'phone'
  | 'game'
  | 'tunnel'
  | 'integrations'
  | 'auth';

export interface SystemView {
  id: SystemId;
  name: string;
  description: string;
  tone: Tone;
  label: string;
  meta: Array<[string, string]>;
  issue?: string;
  category: string;
}

export function normalizeTone(status?: string, issueCount = 0): Tone {
  const value = String(status ?? '').toLowerCase();
  if (value === 'available' || value === 'healthy' || value === 'online' || value === 'on' || value === 'ok' || value === 'current' || value === 'running') return issueCount > 0 ? 'degraded' : 'healthy';
  if (value === 'degraded') return 'degraded';
  if (value === 'warning' || value === 'warn') return 'warning';
  if (value === 'error' || value === 'failed' || value === 'unavailable') return 'error';
  if (value === 'offline' || value === 'off' || value === 'not-used' || value === 'not-configured') return 'offline';
  return issueCount > 0 ? 'degraded' : 'unknown';
}

export function labelForTone(tone: Tone): string {
  if (tone === 'healthy') return 'Healthy';
  if (tone === 'degraded') return 'Degraded';
  if (tone === 'warning') return 'Warning';
  if (tone === 'error') return 'Error';
  if (tone === 'offline') return 'Offline';
  return 'Unknown';
}

export function formatDuration(totalSeconds?: number): string {
  if (!Number.isFinite(totalSeconds) || Number(totalSeconds) < 0) return '-';
  const seconds = Math.floor(Number(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatBytes(bytes?: number): string {
  if (!Number.isFinite(bytes) || Number(bytes) < 0) return '-';
  const value = Number(bytes);
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}
